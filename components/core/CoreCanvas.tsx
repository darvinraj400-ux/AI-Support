'use client';

import dynamic from 'next/dynamic';
import { Suspense, useEffect, useRef, useState } from 'react';
import { useReducedMotion } from 'framer-motion';
import { CoreTrigger } from './CoreTrigger';
import { StaticCoreFallback } from './StaticCoreFallback';

// The ONLY three.js touchpoint in the page bundle: everything behind this
// boundary (three, fiber, drei) loads lazily, client-side only.
const LazyCoreScene = dynamic(() => import('./IntelligenceCore'), {
  ssr: false,
  loading: () => <StaticCoreFallback className="absolute inset-0" />,
});

// Explicit WebGL probe (client-only): a null context means the live scene
// can never mount, so skip loading three.js entirely and render the static
// snapshot. Separate from the tier-null path inside the lazy chunk, which
// stays as the second line of defense.
function webglAvailable(): boolean {
  try {
    const testCanvas = document.createElement('canvas');
    const gl =
      testCanvas.getContext('webgl2') || testCanvas.getContext('webgl');
    if (!gl) throw new Error('No WebGL');
    return true;
  } catch {
    return false;
  }
}

export function CoreCanvas() {
  const reduceMotion = useReducedMotion();
  const wrapRef = useRef<HTMLDivElement>(null);
  const [running, setRunning] = useState(true);
  // 0..1 hero-exit progress, mutated (not state) and read inside useFrame for
  // the camera dolly and fog scrub. The scroll fade writes el.style.opacity
  // directly from the same rAF callback — both together mean a scroll frame
  // triggers zero React renders (setRunning only commits on threshold flips).
  const scrollRef = useRef(0);
  // Window blur is a third pause source alongside tab-hidden and offscreen.
  // Deliberately NOT seeded from document.hasFocus() at mount: a visible
  // window that happens to be unfocused would boot a blank hero, and the
  // steady-state blur/focus listeners below already cover every real
  // transition after mount.
  const blurredRef = useRef(false);
  // Mounted gate: SSR and first client render output the identical neutral
  // placeholder, so reduced-motion users never hit a hydration mismatch
  // (server cannot know their media preference).
  const [mounted, setMounted] = useState(false);
  // Sticky swap on context loss: no auto-restoration (avoids a broken state).
  const [ctxLost, setCtxLost] = useState(false);
  const [hasWebgl, setHasWebgl] = useState(true);
  useEffect(() => {
    setMounted(true);
    setHasWebgl(webglAvailable());
  }, []);

  // Scroll fade: 1.0 → 0.2 over the first 200px past the hero top, then
  // pause rendering when sufficiently off-screen. Tab-hidden and window-blur
  // pause too (Section 6a). DOM stays mounted throughout — the scene is never
  // recreated. The fade also drives the static fallback (same wrapper), but
  // is skipped under prefers-reduced-motion.
  useEffect(() => {
    let raf = 0;
    const update = () => {
      const el = wrapRef.current;
      if (!el) return;
      const past = Math.max(0, -el.getBoundingClientRect().top);
      const progress = Math.min(1, past / 200);
      scrollRef.current = progress;
      const reduce = window.matchMedia(
        '(prefers-reduced-motion: reduce)'
      ).matches;
      el.style.opacity = reduce ? '1' : String(1 - 0.8 * progress);
      const hidden = document.visibilityState === 'hidden';
      setRunning(!hidden && !blurredRef.current && past < 600);
    };
    const onScroll = () => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(update);
    };
    const onVis = () => update();
    const onBlur = () => {
      blurredRef.current = true;
      update();
    };
    const onFocus = () => {
      blurredRef.current = false;
      update();
    };
    update();
    window.addEventListener('scroll', onScroll, { passive: true });
    document.addEventListener('visibilitychange', onVis);
    window.addEventListener('blur', onBlur);
    window.addEventListener('focus', onFocus);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener('scroll', onScroll);
      document.removeEventListener('visibilitychange', onVis);
      window.removeEventListener('blur', onBlur);
      window.removeEventListener('focus', onFocus);
    };
  }, []);

  // Static snapshot for every non-WebGL path: reduced motion (no WebGL at
  // all), explicit WebGL-unavailable probe, or a lost context mid-session.
  // Pre-mount placeholder keeps SSR and hydration output identical.
  const showFallback = reduceMotion || ctxLost || !hasWebgl;
  const content = !mounted ? (
    <div className="absolute inset-0" />
  ) : showFallback ? (
    <StaticCoreFallback className="absolute inset-0" />
  ) : (
    <Suspense fallback={<StaticCoreFallback className="absolute inset-0" />}>
      <LazyCoreScene
        paused={!running}
        scrollRef={scrollRef}
        onContextLost={() => setCtxLost(true)}
      />
    </Suspense>
  );

  return (
    <div ref={wrapRef} className="absolute inset-0">
      {/* Eager, three.js-free: auto-fires a think 3.5s after first load and
          buffers any think dispatched before the lazy scene mounts. Mounted
          OUTSIDE the Suspense boundary on purpose — inside, React would not
          commit it until the R3F chunk resolved, and the buffer could never
          arm in time to catch an early CTA click. */}
      <CoreTrigger />
      {content}
    </div>
  );
}
