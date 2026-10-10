'use client';

import { useEffect, useState } from 'react';

// Universal fallback for every non-WebGL path: WebGL unsupported,
// prefers-reduced-motion, context lost, and the lazy-load placeholder.
// Tier-agnostic — every device sees a recognizable Core.
//
// Motion path: an 8s animated WebP of the live Core (ultra tier, idle)
// served through <img>. iOS Safari blocks <video> autoplay; WebP is
// treated as an image and animates unconditionally since iOS 14.
// Still path: the static PNG, reserved for prefers-reduced-motion only
// (motion is what those users asked to avoid).
//
// The mp4/webm loop files stay in public/ for one more commit (revert
// option until real-iOS confirmation), but nothing references them.
//
// Scroll fade is inherited from the CoreCanvas wrapper (same slot as the
// live canvas), so no per-element opacity is applied here.
export function StaticCoreFallback({ className }: { className?: string }) {
  // Mounted gate: server and first client render output the same branch
  // shape, so there is never a hydration mismatch; motion preference is
  // read client-side because the server cannot know it.
  const [mounted, setMounted] = useState(false);
  const [reduceMotion, setReduceMotion] = useState(false);

  useEffect(() => {
    setMounted(true);
    setReduceMotion(
      window.matchMedia('(prefers-reduced-motion: reduce)').matches
    );
  }, []);

  // Pre-mount: render the still PNG (identical on server and client).
  // Post-mount with reduced motion: PNG. Otherwise: animated WebP.
  const reducedMotion = !mounted || reduceMotion;

  return (
    <div aria-hidden className={className} style={{ overflow: 'hidden' }}>
      {reducedMotion ? (
        <picture style={{ display: 'block', width: '100%', height: '100%' }}>
          <source
            media="(max-width: 767px)"
            srcSet="/core-fallback-portrait.png"
          />
          <img
            src="/core-fallback-landscape.png"
            alt=""
            draggable={false}
            className="absolute inset-0 h-full w-full object-contain"
          />
        </picture>
      ) : (
        <img
          src="/core-fallback-loop.webp"
          alt=""
          draggable={false}
          className="absolute inset-0 h-full w-full object-contain"
          style={{ objectFit: 'contain' }}
        />
      )}
    </div>
  );
}
