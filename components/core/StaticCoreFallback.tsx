'use client';

// Universal static fallback: a snapshot of the LIVE Core captured at ultra
// tier, idle (portrait + landscape PNGs in /public). Tier-agnostic — every
// non-WebGL path renders a recognizable Core instead of the old violet glow:
//   - WebGL unsupported (explicit probe in CoreCanvas)
//   - prefers-reduced-motion (no WebGL at all)
//   - webglcontextlost at runtime (sticky swap, no auto-restoration)
//   - lazy-load placeholder while the three.js chunk parses
//
// The PNG itself never moves: a 6s brightness/scale breath on the <img> is
// the only "still alive" cue, and it is fully disabled under
// prefers-reduced-motion via the media query below.
export function StaticCoreFallback({ className }: { className?: string }) {
  return (
    <div aria-hidden className={className} style={{ overflow: 'hidden' }}>
      <style>{`
        @keyframes core-fallback-breathe {
          0%, 100% { filter: brightness(0.95); transform: scale(1); }
          50% { filter: brightness(1.05); transform: scale(1.01); }
        }
        @media (prefers-reduced-motion: reduce) {
          .core-fallback-img { animation: none !important; }
        }
      `}</style>
      <picture style={{ display: 'block', width: '100%', height: '100%' }}>
        <source
          media="(max-width: 767px)"
          srcSet="/core-fallback-portrait.png"
        />
        <img
          src="/core-fallback-landscape.png"
          alt=""
          draggable={false}
          className="core-fallback-img"
          style={{
            width: '100%',
            height: '100%',
            objectFit: 'cover',
            objectPosition: 'center',
            animation: 'core-fallback-breathe 6s ease-in-out infinite',
          }}
        />
      </picture>
    </div>
  );
}
