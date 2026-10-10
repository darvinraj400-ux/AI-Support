'use client';

import { Component, Suspense, useEffect, useMemo, useRef, useState } from 'react';
import * as THREE from 'three';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { Environment, PerformanceMonitor, useDetectGPU } from '@react-three/drei';
import { CoreCenter } from './CoreCenter';
import { StaticCoreFallback } from './StaticCoreFallback';
import { CorePostProcessing } from './CorePostProcessing';
import { GlassShell } from './GlassShell';
import { NeuralGeometry } from './NeuralGeometry';
import { OrbitalRings } from './OrbitalRings';
import { ParticleField, particleCountFor } from './ParticleField';
import { consumePendingThink, type ThinkSource } from './CoreTrigger';

export type CoreState = 'idle' | 'thinking';
export type CoreTier = 'ultra' | 'high' | 'medium' | 'low';
/** Drop order: index 0 is the highest quality. Runtime tier drops walk this. */
const TIER_ORDER: readonly CoreTier[] = ['ultra', 'high', 'medium', 'low'];
type DeviceClass = 'phone' | 'tablet' | 'desktop';

export type CorePalette = {
  idle: THREE.Color;
  active: THREE.Color;
  response: THREE.Color;
  /** Error emit: dimmer, red-tinted signal (chat failure path). */
  error: THREE.Color;
};

export type SharedProps = {
  /** Mutable machine state — read in useFrame, never triggers renders. */
  stateRef: React.MutableRefObject<CoreState>;
  /** performance.now() ms of the current thinking start (-Infinity idle).
   *  Written ONCE per cycle and never moved — a jumping think start would
   *  snap every thinkBump consumer in one frame (M1). */
  thinkStartRef: React.MutableRefObject<number>;
  /** performance.now() ms of the emit beat (-Infinity until the beat fires:
   *  pre-scheduled at think+EMIT_PEAK_MS for preview; set to `now` at
   *  resolve / the 8s watchdog for chat). Drives the signal ring, ring
   *  glint, Core flash, and both color ramps. */
  emitStartRef: React.MutableRefObject<number>;
  /** True once a resolve carrying error:true tinted this cycle red. */
  errorRef: React.MutableRefObject<boolean>;
  /** True after 45s with no user interaction — the "gone quiet" state. */
  quietRef: React.MutableRefObject<boolean>;
  colors: CorePalette;
  tier: CoreTier;
  /** True after sustained <45fps. Rebuilds the field smaller, kills lines. */
  degraded: boolean;
  /** True on >=1024px viewports: unlocks the medium-tier particle boost. */
  isDesktop: boolean;
};

function readToken(name: string, fallback: string): string {
  try {
    const v = getComputedStyle(document.documentElement)
      .getPropertyValue(name)
      .trim();
    return v || fallback;
  } catch {
    return fallback;
  }
}

/** Envelope length. Preview cycles end here; every cycle's finish is
 *  never earlier than thinkStart + THINK_MS so thinkBump always reaches 0
 *  before the state flips — no snap at idle. */
const THINK_MS = 4000;
/** Flash peak of a scheduled (preview) emit, ms after think start. The
 *  signal ring opens +200ms later — window [0.2, 1.1] on the emit clock,
 *  identical to the old ts [1.7, 2.6]. */
const EMIT_PEAK_MS = 1500;
/** Chat only: no resolve by now → force a cyan emit, then settle. */
const WATCHDOG_MS = 8000;
/** Once the emit has fired, the cycle lives at least this long so the ring
 *  (emitTs 0.2–1.1) and cyan ramp (1.7–2.1) play out in full. */
const EMIT_SETTLE_MS = 2200;

export function IntelligenceCore({
  tier,
  degraded,
  scrollRef,
  isDesktop,
}: {
  tier: CoreTier;
  degraded: boolean;
  /** 0..1 hero-exit progress, mutated by CoreCanvas's scroll handler. */
  scrollRef: React.MutableRefObject<number>;
  isDesktop: boolean;
}) {
  const stateRef = useRef<CoreState>('idle');
  const thinkStartRef = useRef<number>(-Infinity);
  const emitStartRef = useRef<number>(-Infinity);
  const errorRef = useRef(false);
  const quietRef = useRef(false);
  const tiltRef = useTiltParallax();

  // Read Layer A tokens once on mount; cache for the scene lifetime.
  const colors = useMemo<CorePalette>(
    () => ({
      idle: new THREE.Color(readToken('--accent-idle', '#8b5cf6')),
      active: new THREE.Color(readToken('--accent-active', '#3b82f6')),
      response: new THREE.Color(readToken('--accent-response', '#22d3ee')),
      // The Core's own failure token (globals.css --accent-error),
      // matched to the chat UI's destructive red.
      error: new THREE.Color(readToken('--accent-error', '#ef4444')),
    }),
    []
  );

  // Think / resolve event API (Section 2). Both handlers live in one effect
  // so they share a single timer: a resolve fires the emit beat (chat /
  // failure) and re-arms the settle — the think timeline itself never jumps.
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | undefined;
    let replay: ReturnType<typeof setTimeout> | undefined;

    // Source of the live cycle, read by resolve to decide WHEN (not
    // whether) the emit fires. Effect-closure state, not SharedProps:
    // no visual component branches on it — timing is fully encoded in
    // emitStartRef.
    let thinkSource: ThinkSource = 'preview';

    const finish = () => {
      stateRef.current = 'idle';
      thinkStartRef.current = -Infinity;
      emitStartRef.current = -Infinity;
      errorRef.current = false;
    };

    // Single timer for the whole cycle (function declaration: it and
    // onTimer mutually recurse). Never earlier than thinkStart+THINK_MS
    // (bump envelope must be 0 at the flip) and, once the emit has
    // fired, never earlier than emitStart+EMIT_SETTLE_MS (beat must play
    // out). With no emit scheduled (chat awaiting resolve) it arms the
    // 8s watchdog instead.
    function scheduleFinish() {
      const now = performance.now();
      const at =
        emitStartRef.current === -Infinity
          ? thinkStartRef.current + WATCHDOG_MS
          : Math.max(
              thinkStartRef.current + THINK_MS,
              emitStartRef.current + EMIT_SETTLE_MS
            );
      if (timer) clearTimeout(timer);
      timer = setTimeout(onTimer, Math.max(0, at - now));
    }

    function onTimer() {
      if (stateRef.current !== 'thinking') return;
      if (emitStartRef.current === -Infinity) {
        // 8s watchdog: chat never resolved (hung request). Force a cyan
        // emit — the cycle must settle instead of hanging — then re-arm
        // for the settle window.
        emitStartRef.current = performance.now();
        scheduleFinish();
        return;
      }
      finish();
    }

    const startThink = (source: ThinkSource) => {
      const now = performance.now();
      stateRef.current = 'thinking';
      thinkStartRef.current = now;
      thinkSource = source;
      // Preview pre-schedules its emit on the think timeline (timer-driven,
      // Section 4). Chat leaves it pending — the answer fires the beat.
      emitStartRef.current =
        source === 'preview' ? now + EMIT_PEAK_MS : -Infinity;
      // A previous cycle's error must never tint this one.
      errorRef.current = false;
      scheduleFinish();
    };

    const handleThink = (event: Event) => {
      // Consumed even when ignored, so a think that lands mid-cycle cannot
      // leave a stale pending flag behind for a later remount to replay.
      consumePendingThink();
      // Ignore while already thinking — a second think 100ms later must not
      // restart the cycle (Section 7).
      if (stateRef.current !== 'idle') return;
      // Missing detail.source (any external dispatcher) counts as a
      // preview: the safe timer-driven cycle.
      const source = (event as CustomEvent<{ source?: string } | undefined>)
        .detail?.source;
      startThink(source === 'chat' ? 'chat' : 'preview');
    };

    const handleResolve = (event: Event) => {
      // Resolve with no think active is a no-op (Section 2).
      if (stateRef.current !== 'thinking') return;
      const detail = (event as CustomEvent<{ error?: boolean }>).detail;
      const isError = detail?.error === true;
      const now = performance.now();

      // M2: EVERY failure tints the Core red for the remainder of the
      // cycle — no early-return once the beat has gone by. The signal
      // ring eases cyan→red in place if it is still expanding
      // (OrbitalRings), so a late retint never snaps.
      errorRef.current = isError;

      // Emit rules — thinkStartRef is NEVER moved (M1):
      //   chat     → the answer fires the beat (a no-op if the watchdog
      //              already fired it). emitStart = now, so the flash
      //              gaussian peaks exactly at resolve and the ring opens
      //              200ms later (emitTs 0.2) — synced to the answer.
      //   preview  → keeps its scheduled think+1.5s beat on success, but
      //              a failure beats the schedule so the red ring lands
      //              with the error (the M2 "fire red immediately" rule,
      //              expressed as an emit-clock move instead of a
      //              thinkStartRef jump).
      const emitPending = emitStartRef.current === -Infinity;
      const emitScheduledAhead = emitStartRef.current > now;
      if (
        (isError || thinkSource === 'chat') &&
        (emitPending || emitScheduledAhead)
      ) {
        emitStartRef.current = now;
      }
      // Re-arm the single timer: ≥ THINK_MS from the think start (bump
      // envelope) and ≥ EMIT_SETTLE_MS from the beat (ring + ramps).
      scheduleFinish();
    };

    window.addEventListener('supportai:core:think', handleThink);
    window.addEventListener('supportai:core:resolve', handleResolve);

    // Replay a think dispatched while this lazy chunk was still parsing
    // (Section 13). Consumption happens INSIDE the deferred callback, not at
    // effect setup: under Strict Mode the setup→cleanup→setup cycle is
    // synchronous, so the first setup's timer can never fire before its
    // cleanup clears it — consuming at setup would burn the flag and let
    // cleanup swallow the replay, dropping the very event the buffer exists
    // to catch. The cleanup's finish() guarantees a remount always starts
    // from a clean idle state.
    if (stateRef.current === 'idle') {
      replay = setTimeout(() => {
        if (stateRef.current !== 'idle') return;
        const source = consumePendingThink();
        if (source) startThink(source);
      }, 0);
    }

    return () => {
      window.removeEventListener('supportai:core:think', handleThink);
      window.removeEventListener('supportai:core:resolve', handleResolve);
      if (timer) clearTimeout(timer);
      if (replay) clearTimeout(replay);
      finish();
    };
  }, []);

  // Idle reduction (Section 6c): after 45s with no pointer/scroll/key
  // interaction the field goes quiet — drift 40% slower, trails off. The
  // listeners flip the flag back instantly on any input; a 1s interval is
  // the slow path into quiet (checking every frame would be wasted work).
  useEffect(() => {
    let last = performance.now();
    const markActive = () => {
      last = performance.now();
      quietRef.current = false;
    };
    const events = ['pointermove', 'pointerdown', 'scroll', 'keydown'] as const;
    events.forEach((type) =>
      window.addEventListener(type, markActive, { passive: true })
    );
    const iv = setInterval(() => {
      quietRef.current = performance.now() - last > 45_000;
    }, 1000);
    return () => {
      events.forEach((type) => window.removeEventListener(type, markActive));
      clearInterval(iv);
    };
  }, []);

  const shared: SharedProps = {
    stateRef,
    thinkStartRef,
    emitStartRef,
    errorRef,
    quietRef,
    colors,
    tier,
    degraded,
    isDesktop,
  };

  return (
    <>
      <CameraRig scrollRef={scrollRef} tiltRef={tiltRef} />
      <ResponsiveScale>
        <EnvironmentSetup />
        <FogSetup scrollRef={scrollRef} />
        <ambientLight intensity={0.25} />
        <CoreCenter {...shared} />
        <GlassShell {...shared} />
        <NeuralGeometry {...shared} />
        <OrbitalRings {...shared} />
        <ParticleField {...shared} />
      </ResponsiveScale>
    </>
  );
}

// Catches a failed drei <Environment preset> load (a third-party CDN fetch)
// before it can escape the Canvas and replace the whole marketing page with
// app/(marketing)/error.tsx. On failure the local RoomEnvironment fallback is
// rendered instead, so the hero degrades to "flatter reflections" rather than
// "landing page down".
class EnvErrorBoundary extends Component<
  { fallback: React.ReactNode; children: React.ReactNode },
  { failed: boolean }
> {
  constructor(props: { fallback: React.ReactNode; children: React.ReactNode }) {
    super(props);
    this.state = { failed: false };
  }
  static getDerivedStateFromError() {
    return { failed: true };
  }
  render() {
    return this.state.failed ? this.props.fallback : this.props.children;
  }
}

// Image-based lighting. Primary path is drei's night preset: a real night-sky
// HDRI so the physical-metal rings have something worth reflecting (chrome
// reflections are criterion 1). background={false} keeps the Layer A CSS
// background — this is reflection-only IBL, never a skybox.
//
// The preset is a client-side fetch of a commit-pinned asset. drei documents
// presets as not production-safe and this app sets no CSP, so a fetch failure
// would otherwise be fatal to the page; EnvErrorBoundary + RoomEnvironment keep
// it non-fatal. Self-hosting the HDR in /public is the recommended follow-up
// (out of this change's allowed-file scope).
function EnvironmentSetup() {
  return (
    <EnvErrorBoundary fallback={<RoomEnvironmentFallback />}>
      {/* Scoped Suspense so only the HDR load suspends — the rest of the Core
          renders immediately instead of waiting ~1.7MB of HDRI. */}
      <Suspense fallback={null}>
        <Environment
          preset="night"
          background={false}
          environmentIntensity={0.35}
        />
      </Suspense>
    </EnvErrorBoundary>
  );
}

// Fully-local PMREM fallback (zero network). Intensity matches the preset path
// so the material contract in OrbitalRings/NeuralGeometry is unchanged whether
// or not the CDN is reachable. Strict-mode double-mount is safe: cleanup
// disposes both the target and the generator.
function RoomEnvironmentFallback() {
  const gl = useThree((s) => s.gl);
  const scene = useThree((s) => s.scene);

  useEffect(() => {
    const pmrem = new THREE.PMREMGenerator(gl);
    const target = pmrem.fromScene(new RoomEnvironment(), 0.04);
    scene.environment = target.texture;
    scene.environmentIntensity = 0.35;
    return () => {
      scene.environment = null;
      target.dispose();
      pmrem.dispose();
    };
  }, [gl, scene]);

  return null;
}

// Exponential-squared fog tuned to the scene's real depth range (~3.3–7.1 world
// units at the desktop scale). fogColor matches the Layer A background exactly
// (#0a0a0f), so faded geometry blends into the page instead of toward an opaque
// rectangle — the alpha canvas stays transparent. This is what makes the far
// ring read dimmer than the near ring (criterion 4).
//
// Density is scrubbed from scroll (Section 5): 0.06 → 0.11 over the hero's
// 200px exit, so the Core recedes into depth as it fades rather than only
// losing opacity. Reverses with the same per-frame write — no snap.
function FogSetup({ scrollRef }: { scrollRef: React.MutableRefObject<number> }) {
  const scene = useThree((s) => s.scene);
  const fog = useMemo(() => new THREE.FogExp2(0x0a0a0f, 0.06), []);
  useEffect(() => {
    scene.fog = fog;
    return () => {
      scene.fog = null;
    };
  }, [scene, fog]);
  useFrame(() => {
    fog.density = 0.06 + 0.05 * scrollRef.current;
  });
  return null;
}

// Pointer parallax combined with a slow idle drift, damped toward the target so
// the motion is never snappy. Deliberately NOT OrbitControls: the hero must
// never trap the scroll or invite free-orbit inspection.
//
// Scroll also dollies the camera back (5.2 → 6.5) on the same 0..1 progress as
// the opacity fade, so the artifact physically recedes as the hero exits
// (Section 5). Delta is clamped: after a paused frameloop (offscreen or a
// hidden tab) the first resumed delta is wall-clock since the last frame —
// potentially seconds — and an unclamped damping factor (>1) would fling the
// camera past its target for a frame.
//
// Device tilt (useTiltParallax) rides the same axes as the pointer, clamped to
// ±15° → ±0.3 world units, so a phone held at an angle leans the Core without
// needing a touch drag.
function CameraRig({
  scrollRef,
  tiltRef,
}: {
  scrollRef: React.MutableRefObject<number>;
  tiltRef: React.MutableRefObject<{ x: number; y: number }>;
}) {
  const camera = useThree((s) => s.camera);
  useFrame((state, delta) => {
    const dt = Math.min(delta, 0.05);
    const t = state.clock.elapsedTime;
    const baseX = Math.sin(t * 0.15) * 0.08;
    const baseY = Math.cos(t * 0.12) * 0.05;
    const targetX = baseX + state.pointer.x * 0.6 + tiltRef.current.x;
    const targetY = baseY + state.pointer.y * 0.4 + tiltRef.current.y;
    const targetZ = 5.2 + 1.3 * scrollRef.current;
    camera.position.x += (targetX - camera.position.x) * dt * 2;
    camera.position.y += (targetY - camera.position.y) * dt * 2;
    camera.position.z += (targetZ - camera.position.z) * dt * 2;
    camera.lookAt(0, 0, 0);
  });
  return null;
}

/** Device-orientation parallax. Gamma/beta deltas from the first-event
 *  baseline are clamped ±15° and mapped to ±0.3 world units — the same
 *  damping path as the pointer, so tilt and drag compose cleanly.
 *
 *  iOS 13+ gates DeviceOrientationEvent behind requestPermission(); that
 *  call must originate from a user gesture. We register a one-shot listener
 *  for the first pointerdown/touchend/keydown/scroll, request there, and
 *  enable only on 'granted'. Denial is silent — no UI, no re-request.
 *  Everywhere else (Android, desktop, iOS <13) the listener attaches
 *  immediately. No-ops entirely if DeviceOrientationEvent is absent. */
function useTiltParallax() {
  const offset = useRef({ x: 0, y: 0 });
  const baseline = useRef<{ gamma: number; beta: number } | null>(null);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    if (!('DeviceOrientationEvent' in window)) return;

    const DOE = window.DeviceOrientationEvent as unknown as {
      requestPermission?: () => Promise<string>;
    };
    const needsPermission = typeof DOE.requestPermission === 'function';

    const handler = (e: DeviceOrientationEvent) => {
      if (e.gamma === null || e.beta === null) return;
      if (!baseline.current) {
        baseline.current = { gamma: e.gamma, beta: e.beta };
      }
      const dg = e.gamma - baseline.current.gamma;
      const db = e.beta - baseline.current.beta;
      // Clamp ±15° → ±0.3 (15° maps to the full offset span).
      const cx = (Math.max(-15, Math.min(15, dg)) / 15) * 0.3;
      const cy = (Math.max(-15, Math.min(15, db)) / 15) * 0.3;
      offset.current.x = cx;
      offset.current.y = cy;
    };

    const enable = () => {
      window.addEventListener('deviceorientation', handler, true);
    };

    if (!needsPermission) {
      enable();
      return () => window.removeEventListener('deviceorientation', handler, true);
    }

    // iOS 13+: defer requestPermission to the first user gesture.
    const gestureEvents = [
      'pointerdown',
      'touchend',
      'keydown',
      'scroll',
    ] as const;
    const requestOnce = () => {
      gestureEvents.forEach((ev) =>
        window.removeEventListener(ev, requestOnce)
      );
      DOE.requestPermission!()
        .then((result) => {
          if (result === 'granted') enable();
        })
        .catch(() => {
          /* silent deny */
        });
    };
    gestureEvents.forEach((ev) =>
      window.addEventListener(ev, requestOnce, { passive: true })
    );
    return () => {
      gestureEvents.forEach((ev) =>
        window.removeEventListener(ev, requestOnce)
      );
      window.removeEventListener('deviceorientation', handler, true);
    };
  }, []);

  return offset;
}

/** Runtime tier drop: FPS < 25 sustained 2+ seconds steps the quality tier
 *  down one rung (ultra→high→medium→low). Sticky — a recovered FPS never
 *  climbs back, because re-enabling effects oscillates straight into the
 *  slow path again. Samples a ~1s fps window; requires two consecutive
 *  sub-25s windows (2s) before firing, then a 3s cooldown so a single
 *  spike cannot burn every rung at once. */
function TierDropMonitor({ onDrop }: { onDrop: () => void }) {
  const frames = useRef(0);
  const lastSample = useRef(-Infinity);
  const belowAccum = useRef(0);
  const lastDrop = useRef(-Infinity);

  useFrame((state) => {
    const now = state.clock.elapsedTime;
    if (lastSample.current < 0) {
      lastSample.current = now;
      frames.current = 0;
      return;
    }
    frames.current++;
    const dt = now - lastSample.current;
    if (dt < 1) return;
    const fps = frames.current / dt;
    frames.current = 0;
    lastSample.current = now;
    if (fps < 25) {
      belowAccum.current += dt;
    } else {
      belowAccum.current = 0;
    }
    if (belowAccum.current >= 2 && now - lastDrop.current >= 3) {
      lastDrop.current = now;
      belowAccum.current = 0;
      onDrop();
    }
  });
  return null;
}

// Keeps the composition balanced: the ring system (outer radius ~1.70u,
// diameter ~3.40u) is the part that actually reads as "the Core" — the outer
// particle shell is sparse and faint, so scaling off it would undersize the
// thing we are trying to dominate the hero. Against the camera's 4.31u of
// visible height at z=0, these constants put the rings at ~42% / ~50% / ~64%
// of the hero box on mobile / tablet / desktop (~77% at the desktop reference
// once the hero padding is taken into account).
//
// A 4s breathing pulse rides on top (1.00 -> 1.02) so the whole artifact feels
// alive at rest without any component scaling itself independently.
//
// The breakpoint base is debounced 150ms (Section 6b): during a drag-resize
// the width changes on every event, and recomputing the group scale each time
// makes the artifact pump. Applied only after the size has been stable for
// 150ms. Seeded from the mount size so the first frame is never 0/NaN — the
// debounce delay would otherwise show a collapsed Core for its first 150ms.
function ResponsiveScale({ children }: { children: React.ReactNode }) {
  const size = useThree((s) => s.size);
  const [base, setBase] = useState(
    () => (size.width < 768 ? 0.52 : size.width < 1024 ? 0.63 : 0.82)
  );
  useEffect(() => {
    const id = setTimeout(() => {
      setBase(size.width < 768 ? 0.52 : size.width < 1024 ? 0.63 : 0.82);
    }, 150);
    return () => clearTimeout(id);
  }, [size.width]);

  const groupRef = useRef<THREE.Group>(null);

  useFrame((state) => {
    const t = state.clock.elapsedTime;
    const pulse = 1.01 + 0.01 * Math.sin((2 * Math.PI * t) / 4);
    groupRef.current?.scale.setScalar(base * pulse);
  });

  return (
    <group ref={groupRef} scale={base}>
      {children}
    </group>
  );
}

function resolveTier(
  gpuTier: number | undefined,
  device: DeviceClass
): CoreTier | null {
  // null = very-low-tier device: static fallback instead of WebGL.
  if (gpuTier !== undefined && gpuTier <= 0) return null;

  if (device === 'desktop') {
    if (gpuTier === undefined) return 'medium';
    if (gpuTier >= 3) return 'ultra';
    return 'medium'; // gpu 1–2: medium with the desktop particle boost
  }
  if (device === 'tablet') {
    if (gpuTier === undefined) return 'medium';
    if (gpuTier >= 2) return 'high';
    return 'medium'; // gpu 1
  }
  // phone
  if (gpuTier === undefined) return 'low';
  if (gpuTier >= 3) return 'high';
  if (gpuTier >= 2) return 'medium';
  return 'low'; // gpu 1
}

/** Post-processing stage ceiling for a tier (Section 8). */
function maxStageFor(tier: CoreTier): 0 | 1 | 2 {
  if (tier === 'ultra' || tier === 'high') return 0; // full stack
  if (tier === 'medium') return 1; // no chromatic aberration
  return 2; // bloom only
}

// Default export: the dynamic() boundary in CoreCanvas loads this module,
// so three/fiber/drei never enter the page bundle. Fixed camera, capped DPR,
// demand-paused rendering, adaptive 4-tier ladder, staged post-processing,
// runtime tier drop, device-tilt parallax.
export default function IntelligenceCoreScene({
  paused,
  scrollRef,
  onContextLost,
}: {
  paused: boolean;
  scrollRef: React.MutableRefObject<number>;
  /** Sticky swap to the static snapshot on webglcontextlost. */
  onContextLost?: () => void;
}) {
  const [deviceClass, setDeviceClass] = useState<DeviceClass>('desktop');
  const [degraded, setDegraded] = useState(false);
  // Sticky one-way post degradation. Never re-enabled: dropping an effect ->
  // fps recovers -> a re-enable would oscillate straight back into the slow
  // path. Each decline advances one stage (drop CA, then all but Bloom).
  const [drops, setDrops] = useState(0);
  // Sticky one-way tier drop (TierDropMonitor). Never re-enabled.
  const [tierDrops, setTierDrops] = useState(0);
  const glRef = useRef<THREE.WebGLRenderer | null>(null);

  // detect-gpu degrades gracefully (tier 0) when WebGL is unavailable.
  const gpuTier = useDetectGPU()?.tier;

  useEffect(() => {
    const compute = () => {
      const w = window.innerWidth;
      setDeviceClass(w < 768 ? 'phone' : w < 1024 ? 'tablet' : 'desktop');
    };
    compute();
    window.addEventListener('resize', compute);
    return () => window.removeEventListener('resize', compute);
  }, []);

  const detectedTier = useMemo(
    () => resolveTier(gpuTier, deviceClass),
    // gpuTier is a primitive snapshot; recompute only when it changes.
    [gpuTier, deviceClass]
  );

  const tier: CoreTier | null =
    detectedTier === null
      ? null
      : TIER_ORDER[
          Math.min(
            TIER_ORDER.length - 1,
            TIER_ORDER.indexOf(detectedTier) + tierDrops
          )
        ];

  const isDesktop = deviceClass === 'desktop';

  // Actual stage in use: starts at the tier ceiling, walks down on decline.
  const stage: 0 | 1 | 2 =
    tier === null ? 2 : (Math.min(2, maxStageFor(tier) + drops) as 0 | 1 | 2);

  // Per-tier DPR cap (spec): ultra/high 1.75, medium 1.5, low 1.25.
  const dprMax =
    tier === 'ultra' || tier === 'high' ? 1.75 : tier === 'medium' ? 1.5 : 1.25;
  // Vignette darkness (spec): 0.65 on ultra/high, 0.55 on medium. Low never
  // reaches the vignette (stage 2 = bloom only), so the value is moot there.
  const vignetteDarkness = tier === 'medium' ? 0.55 : 0.65;

  // Read-only telemetry for verification. Written in onCreated (gl guaranteed)
  // and re-applied whenever tier/device/degraded/stage change. Never read in
  // render.
  const writeTelemetry = () => {
    const el = glRef.current?.domElement;
    if (!el || tier === null) return;
    el.dataset.coreTier = tier;
    el.dataset.coreDevice = deviceClass;
    el.dataset.coreParticles = String(
      particleCountFor(tier, degraded, isDesktop)
    );
    el.dataset.coreDegraded = String(degraded);
    el.dataset.corePostStage = String(stage);
    el.dataset.coreTierDrops = String(tierDrops);
  };
  useEffect(writeTelemetry, [tier, deviceClass, degraded, stage, tierDrops, isDesktop]);

  // Very-low-tier GPU: static snapshot of the live Core, zero runtime 3D.
  if (tier === null) {
    return <StaticCoreFallback className="absolute inset-0" />;
  }

  return (
    <Canvas
      dpr={[1, dprMax]}
      camera={{ position: [0, 0, 5.2], fov: 45 }}
      gl={{ antialias: true, alpha: true }}
      frameloop={paused ? 'never' : 'always'}
      onCreated={({ gl }) => {
        glRef.current = gl;
        writeTelemetry();
        // Context loss mid-session: prevent default (no auto-restore) and
        // tell CoreCanvas to swap to the static snapshot. Sticky — the live
        // scene never attempts to come back.
        gl.domElement.addEventListener('webglcontextlost', (e) => {
          e.preventDefault();
          onContextLost?.();
        });
      }}
    >
      {/* Particle-shedding guard: sustained sub-40fps rebuilds a smaller field
          and kills the connection bands. Default drei bounds are [40,60]. */}
      <PerformanceMonitor
        bounds={() => [40, 60]}
        onDecline={() => setDegraded(true)}
        flipflops={2}
      />
      {/* Post ladder: sustained sub-48fps advances one stage. */}
      <PerformanceMonitor
        bounds={() => [48, 60]}
        onDecline={() => setDrops((d) => Math.min(2, d + 1))}
      />
      {/* Tier ladder: FPS < 25 sustained 2+ sec drops one quality tier. */}
      <TierDropMonitor
        onDrop={() => setTierDrops((d) => Math.min(3, d + 1))}
      />
      <IntelligenceCore
        tier={tier}
        degraded={degraded}
        scrollRef={scrollRef}
        isDesktop={isDesktop}
      />
      <CorePostProcessing stage={stage} darkness={vignetteDarkness} />
    </Canvas>
  );
}

// ---- shared math (no allocation; pure functions) ----

export function clamp01(x: number): number {
  return x < 0 ? 0 : x > 1 ? 1 : x;
}

export function smoothstep(edge0: number, edge1: number, x: number): number {
  const t = clamp01((x - edge0) / (edge1 - edge0));
  return t * t * (3 - 2 * t);
}

/** 0 → 1 → 0 envelope over a thinking cycle (seconds since think start).
 *  Balanced as a calm 1.2s head, a dramatic 1.8s middle, and a calm 1.0s tail
 *  — the fade-out starts at 3.0s so the whole envelope is gone by the 4.0s
 *  state flip and nothing snaps. */
export function thinkBump(t: number): number {
  return smoothstep(0, 1.2, t) * (1 - smoothstep(3.0, 4.0, t));
}
