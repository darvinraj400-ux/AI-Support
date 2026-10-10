'use client';

import { useEffect } from 'react';

// How long after first load the Core auto-wakes (Section 4). First-time
// visitors see the artifact spring to life a moment after landing.
const AUTOFIRE_MS = 3500;
const STORAGE_KEY = 'supportai_core_autofired';

// Pending-think buffer (Section 13). The Core is a lazily-loaded R3F chunk
// (ssr:false via CoreCanvas), so a `think` dispatched before that chunk
// finishes parsing — an early hero-CTA click, or the autofire itself on a
// slow connection — would otherwise be dropped with no listener to catch it.
// This module is bundled eagerly (it is mounted in CoreCanvas, outside the
// dynamic import), so its listener is always armed first. It records the
// dispatch; IntelligenceCore consumes the flag on mount and replays the think.
//
// A boolean flag, not a timestamp window: a slow connection can take longer
// than any fixed window to parse the chunk. Staleness is bounded two ways:
// the unmount cleanup below clears the flag (no consumer will ever exist for
// an instance that went away, Strict Mode's simulated unmount included), and
// the resolve listener drops a think whose answer already rendered.
let pendingThink = false;

/** Consume a buffered think. Returns true if one was pending. */
export function consumePendingThink(): boolean {
  const had = pendingThink;
  pendingThink = false;
  return had;
}

// Renders nothing. Mount it ONCE, eagerly, as a direct child of CoreCanvas's
// wrapper div — NOT inside the Suspense boundary around the lazy scene, or it
// would only mount after the chunk resolves and the buffer could never arm in
// time. Client-only: window/sessionStorage are touched inside effects only,
// so SSR never sees them.
export function CoreTrigger() {
  useEffect(() => {
    // Buffer every think dispatch so a not-yet-mounted Core can replay it.
    const noteThink = () => {
      pendingThink = true;
    };
    // A resolve arriving while the flag is still set means no Core consumed
    // the matching think (the live listener always consumes on dispatch):
    // the answer is already on screen, so drop the think instead of letting
    // a future mount replay a full cycle after the fact.
    const noteResolve = () => {
      pendingThink = false;
    };
    window.addEventListener('supportai:core:think', noteThink);
    window.addEventListener('supportai:core:resolve', noteResolve);

    // Auto-fire once per browser session. The storage flag is written inside
    // the timer callback (at dispatch time), not at effect setup: under React
    // strict mode the effect runs twice with its cleanup in between, and a
    // setup-time write would make the second run see the flag and skip —
    // the Core would never auto-wake in development.
    let fired = false;
    try {
      fired = sessionStorage.getItem(STORAGE_KEY) === '1';
    } catch {
      fired = false;
    }
    let timer: ReturnType<typeof setTimeout> | undefined;
    if (!fired) {
      timer = setTimeout(() => {
        try {
          sessionStorage.setItem(STORAGE_KEY, '1');
        } catch {
          // Storage unavailable (private mode / sandboxed iframe): the
          // autofire still runs this visit, just not gated next time.
        }
        window.dispatchEvent(new CustomEvent('supportai:core:think'));
      }, AUTOFIRE_MS);
    }

    return () => {
      window.removeEventListener('supportai:core:think', noteThink);
      window.removeEventListener('supportai:core:resolve', noteResolve);
      // Under Strict Mode the same fiber remounts after this cleanup; a flag
      // buffered by the first instance must not leak into the second. A real
      // unmount has no future consumer either — clearing is always correct.
      pendingThink = false;
      if (timer) clearTimeout(timer);
    };
  }, []);

  return null;
}
