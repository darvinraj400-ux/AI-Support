'use client';

import { useEffect, useState } from 'react';

// Universal fallback for every non-WebGL path: WebGL unsupported,
// prefers-reduced-motion, context lost, and the lazy-load placeholder.
// Tier-agnostic — every device sees a recognizable Core.
//
// Layers: an 8s idle loop of the live Core (ultra tier) plays above the
// static PNG. The PNG is the poster while the video loads, the error
// fallback if the video fails, and the entire fallback under
// prefers-reduced-motion (the <video> is not rendered at all there —
// motion, even video motion, is what those users asked to avoid).
//
// The video replaces the old PNG brightness pulse. Scroll fade is inherited
// from the CoreCanvas wrapper (same slot as the live canvas), so no
// per-element opacity is applied here — applying it twice would double-fade.
export function StaticCoreFallback({ className }: { className?: string }) {
  // Mounted gate: server and first client render output PNG-only, so there
  // is never a hydration mismatch; the video element is added after mount
  // (this component only renders post-mount today, but the gate keeps that
  // invariant explicit). Motion preference is read client-side for the same
  // reason — the server cannot know it.
  const [mounted, setMounted] = useState(false);
  const [reduceMotion, setReduceMotion] = useState(false);
  // Video readiness: PNG underneath until canplay, then a 200ms crossfade.
  const [ready, setReady] = useState(false);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    setMounted(true);
    setReduceMotion(
      window.matchMedia('(prefers-reduced-motion: reduce)').matches
    );
  }, []);

  const showVideo = mounted && !reduceMotion && !failed;

  return (
    <div aria-hidden className={className} style={{ overflow: 'hidden' }}>
      <picture style={{ display: 'block', width: '100%', height: '100%' }}>
        <source
          media="(max-width: 767px)"
          srcSet="/core-fallback-portrait.png"
        />
        <img
          src="/core-fallback-landscape.png"
          alt=""
          draggable={false}
          style={{
            width: '100%',
            height: '100%',
            objectFit: 'cover',
            objectPosition: 'center',
          }}
        />
      </picture>
      {showVideo && (
        <video
          autoPlay
          muted
          loop
          playsInline
          preload="metadata"
          poster="/core-fallback-landscape.png"
          onCanPlay={() => setReady(true)}
          onError={() => setFailed(true)}
          style={{
            position: 'absolute',
            inset: 0,
            width: '100%',
            height: '100%',
            objectFit: 'contain',
            opacity: ready ? 1 : 0,
            transition: 'opacity 200ms ease-out',
          }}
        >
          <source src="/core-fallback-loop.webm" type="video/webm" />
          <source src="/core-fallback-loop.mp4" type="video/mp4" />
        </video>
      )}
    </div>
  );
}
