'use client';

import dynamic from 'next/dynamic';
import { Suspense, useEffect, useRef, useState } from 'react';
import { useReducedMotion } from 'framer-motion';

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
  const [opacity, setOpacity] = useState(1);
  const [running, setRunning] = useState(true);
  // Mounted gate: SSR and first client render output the identical neutral
  // placeholder, so reduced-motion users never hit a hydration mismatch
  // (server cannot know their media preference).
  const [mounted, setMounted] = useState(false);
  useEffect(() => {
    setMounted(true);
  }, []);

  // Scroll fade: 1.0 → 0.2 over the first 200px past the hero top, then
  // pause rendering when sufficiently off-screen. Tab-hidden pauses too.
  // DOM stays mounted throughout — the scene is never recreated.
  useEffect(() => {
    let raf = 0;
    const update = () => {
      const el = wrapRef.current;
      if (!el) return;
      const past = Math.max(0, -el.getBoundingClientRect().top);
      setOpacity(1 - 0.8 * Math.min(1, past / 200));
      const hidden = document.visibilityState === 'hidden';
      setRunning(!hidden && past < 600);
    };
    const onScroll = () => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(update);
    };
    const onVis = () => update();
    update();
    window.addEventListener('scroll', onScroll, { passive: true });
    document.addEventListener('visibilitychange', onVis);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener('scroll', onScroll);
      document.removeEventListener('visibilitychange', onVis);
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
      <LazyCoreScene paused={!running} />
    </Suspense>
  );

  return (
    <div ref={wrapRef} className="absolute inset-0" style={{ opacity }}>
      {content}
    </div>
  );
}
