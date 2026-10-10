'use client';

import dynamic from 'next/dynamic';
import { Suspense, useEffect, useRef, useState } from 'react';
import { useReducedMotion } from 'framer-motion';
import { CoreTrigger } from './CoreTrigger';

// Static fallback: same silhouette and language, zero WebGL. Used for
// reduced motion and as the lazy-load placeholder.
export function StaticCore({ className }: { className?: string }) {
  return (
    <div
      aria-hidden
      className={className}
      style={{
        background:
          'radial-gradient(circle at 50% 50%, rgba(139,92,246,0.16), rgba(59,130,246,0.05) 42%, transparent 66%)',
      }}
    />
  );
}

// The ONLY three.js touchpoint in the page bundle: everything behind this
// boundary (three, fiber, drei) loads lazily, client-side only.
const LazyCoreScene = dynamic(() => import('./IntelligenceCore'), {
  ssr: false,
  loading: () => <StaticCore className="absolute inset-0" />,
});

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
  useEffect(() => {
    setMounted(true);
  }, []);

  // Scroll fade: 1.0 → 0.2 over the first 200px past the hero top, then
  // pause rendering when sufficiently off-screen. Tab-hidden and window-blur
  // pause too (Section 6a). DOM stays mounted throughout — the scene is never
  // recreated.
  useEffect(() => {
    let raf = 0;
    const update = () => {
      const el = wrapRef.current;
      if (!el) return;
      const past = Math.max(0, -el.getBoundingClientRect().top);
      const progress = Math.min(1, past / 200);
      scrollRef.current = progress;
      el.style.opacity = String(1 - 0.8 * progress);
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

  // Reduced motion: static fallback, no WebGL at all.
  // Pre-mount placeholder keeps SSR and hydration output identical.
  const content = !mounted ? (
    <div className="absolute inset-0" />
  ) : reduceMotion ? (
    <StaticCore className="absolute inset-0" />
  ) : (
    <Suspense fallback={<StaticCore className="absolute inset-0" />}>
      <LazyCoreScene paused={!running} scrollRef={scrollRef} />
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
