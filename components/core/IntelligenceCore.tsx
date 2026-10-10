'use client';

import { Component, Suspense, useEffect, useMemo, useRef, useState } from 'react';
import * as THREE from 'three';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { Environment, PerformanceMonitor, useDetectGPU } from '@react-three/drei';
import { CoreCenter } from './CoreCenter';
import { CorePostProcessing } from './CorePostProcessing';
import { GlassShell } from './GlassShell';
import { NeuralGeometry } from './NeuralGeometry';
import { OrbitalRings } from './OrbitalRings';
import { ParticleField, particleCountFor } from './ParticleField';
import { consumePendingThink } from './CoreTrigger';

export type CoreState = 'idle' | 'thinking';
export type CoreTier = 'high' | 'medium' | 'low';

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
  /** performance.now() ms of the current thinking start (-Infinity idle). */
  thinkStartRef: React.MutableRefObject<number>;
  /** True for a thinking cycle triggered by a chat error (red emit). */
  errorRef: React.MutableRefObject<boolean>;
  /** True after 45s with no user interaction — the "gone quiet" state. */
  quietRef: React.MutableRefObject<boolean>;
  colors: CorePalette;
  tier: CoreTier;
  /** True after sustained <45fps. Rebuilds the field smaller, kills lines. */
  degraded: boolean;
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

const THINK_MS = 4000;
/** Timeline point a `resolve` jumps to — the emit beat, where the signal
 *  ring and env flash fire so the Core's "answer" lands with the first token. */
const EMIT_TS = 1.8;

export function IntelligenceCore({
  tier,
  degraded,
  scrollRef,
}: {
  tier: CoreTier;
  degraded: boolean;
  /** 0..1 hero-exit progress, mutated by CoreCanvas's scroll handler. */
  scrollRef: React.MutableRefObject<number>;
}) {
  const stateRef = useRef<CoreState>('idle');
  const thinkStartRef = useRef<number>(-Infinity);
  const errorRef = useRef(false);
  const quietRef = useRef(false);

  // Read Layer A tokens once on mount; cache for the scene lifetime.
  const colors = useMemo<CorePalette>(
    () => ({
      idle: new THREE.Color(readToken('--accent-idle', '#8b5cf6')),
      active: new THREE.Color(readToken('--accent-active', '#3b82f6')),
      response: new THREE.Color(readToken('--accent-response', '#22d3ee')),
      // Same Layer A token the chat UI paints failures with.
      error: new THREE.Color(readToken('--destructive', '#ef4444')),
    }),
    []
  );

  // Think / resolve event API (Section 2). Both handlers live in one effect
  // so they share a single timer: a resolve cancels the full 4s cycle and
  // re-schedules the settle on the (possibly jumped) timeline.
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | undefined;
    let replay: ReturnType<typeof setTimeout> | undefined;

    const finish = () => {
      stateRef.current = 'idle';
      thinkStartRef.current = -Infinity;
      errorRef.current = false;
    };
    const startThink = () => {
      stateRef.current = 'thinking';
      thinkStartRef.current = performance.now();
      // A previous cycle's error must never tint this one.
      errorRef.current = false;
      if (timer) clearTimeout(timer);
      timer = setTimeout(finish, THINK_MS);
    };

    const handleThink = () => {
      // Consumed even when ignored, so a think that lands mid-cycle cannot
      // leave a stale pending flag behind for a later remount to replay.
      consumePendingThink();
      // Ignore while already thinking — a second think 100ms later must not
      // restart the cycle (Section 7).
      if (stateRef.current !== 'idle') return;
      startThink();
    };

    const handleResolve = (event: Event) => {
      // Resolve with no think active is a no-op (Section 2).
      if (stateRef.current !== 'thinking') return;
      const detail = (event as CustomEvent<{ error?: boolean }>).detail;
      const isError = detail?.error === true;

      const now = performance.now();
      const curTs = (now - thinkStartRef.current) / 1000;
      // A mid-stream failure landing after the emit beat must not retint an
      // already-fired signal ring (mat.color is a hard per-frame copy — the
      // ring would snap cyan→red in one frame). The chat panel's error UI is
      // the report; the Core finishes this cycle as a normal response.
      if (isError && curTs >= EMIT_TS) return;
      errorRef.current = isError;

      // Jump to the emit beat so the signal ring fires with the answer
      // appearing — but only before the ~1.5s pulse. Landing across a
      // gaussian peak would snap emissive intensity and ring tilt in a
      // single frame; past the pulse the emit has already gone by.
      if (curTs < 1.2) {
        thinkStartRef.current = now - EMIT_TS * 1000;
      }
      // Settle at ts≈4.0 on the live timeline so the response color and
      // thinkBump fades play out naturally. Derived from the current start
      // (not a fixed 2200ms), so a late resolve that skipped the jump
      // shortens correctly instead of overrunning the envelope.
      const remaining = Math.max(
        0,
        THINK_MS - (performance.now() - thinkStartRef.current)
      );
      if (timer) clearTimeout(timer);
      timer = setTimeout(finish, remaining);
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
        if (stateRef.current === 'idle' && consumePendingThink()) startThink();
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
    errorRef,
    quietRef,
    colors,
    tier,
    degraded,
  };

  return (
    <>
      <CameraRig scrollRef={scrollRef} />
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
function CameraRig({ scrollRef }: { scrollRef: React.MutableRefObject<number> }) {
  const camera = useThree((s) => s.camera);
  useFrame((state, delta) => {
    const dt = Math.min(delta, 0.05);
    const t = state.clock.elapsedTime;
    const baseX = Math.sin(t * 0.15) * 0.08;
    const baseY = Math.cos(t * 0.12) * 0.05;
    const targetX = baseX + state.pointer.x * 0.6;
    const targetY = baseY + state.pointer.y * 0.4;
    const targetZ = 5.2 + 1.3 * scrollRef.current;
    camera.position.x += (targetX - camera.position.x) * dt * 2;
    camera.position.y += (targetY - camera.position.y) * dt * 2;
    camera.position.z += (targetZ - camera.position.z) * dt * 2;
    camera.lookAt(0, 0, 0);
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
  isMobile: boolean
): CoreTier | null {
  // null = very-low-tier device: static fallback instead of WebGL.
  if (isMobile) return 'low';
  if (gpuTier === undefined) return 'medium';
  if (gpuTier <= 0) return null;
  if (gpuTier >= 3) return 'high';
  if (gpuTier === 2) return 'medium';
  return 'low';
}

/** Post-processing stage ceiling for a tier (Section 8). */
function maxStageFor(tier: CoreTier): 0 | 1 | 2 {
  if (tier === 'high') return 0; // full stack
  if (tier === 'medium') return 1; // no chromatic aberration
  return 2; // bloom only
}

// Default export: the dynamic() boundary in CoreCanvas loads this module,
// so three/fiber/drei never enter the page bundle. Fixed camera, capped DPR,
// demand-paused rendering, adaptive tiers, staged post-processing.
export default function IntelligenceCoreScene({
  paused,
  scrollRef,
}: {
  paused: boolean;
  scrollRef: React.MutableRefObject<number>;
}) {
  const [isMobile, setIsMobile] = useState(false);
  const [degraded, setDegraded] = useState(false);
  // Sticky one-way post degradation. Never re-enabled: dropping an effect ->
  // fps recovers -> a re-enable would oscillate straight back into the slow
  // path. Each decline advances one stage (drop CA, then all but Bloom).
  const [drops, setDrops] = useState(0);
  const glRef = useRef<THREE.WebGLRenderer | null>(null);

  // detect-gpu degrades gracefully (tier 0) when WebGL is unavailable.
  const gpuTier = useDetectGPU()?.tier;

  useEffect(() => {
    const mq = window.matchMedia('(max-width: 767px)');
    const apply = () => setIsMobile(mq.matches);
    apply();
    mq.addEventListener('change', apply);
    return () => mq.removeEventListener('change', apply);
  }, []);

  const tier = useMemo(
    () => resolveTier(gpuTier, isMobile),
    // gpuTier is a primitive snapshot; recompute only when it changes.
    [gpuTier, isMobile]
  );

  // Actual stage in use: starts at the tier ceiling, walks down on decline.
  const stage: 0 | 1 | 2 =
    tier === null ? 2 : (Math.min(2, maxStageFor(tier) + drops) as 0 | 1 | 2);

  // Read-only telemetry for verification. Written in onCreated (gl guaranteed)
  // and re-applied whenever tier/degraded/stage change. Never read in render.
  const writeTelemetry = () => {
    const el = glRef.current?.domElement;
    if (!el || tier === null) return;
    el.dataset.coreTier = tier;
    el.dataset.coreParticles = String(particleCountFor(tier, degraded));
    el.dataset.coreDegraded = String(degraded);
    el.dataset.corePostStage = String(stage);
  };
  useEffect(writeTelemetry, [tier, degraded, stage]);

  // Very-low-tier GPU: same inline gradient language as StaticCore,
  // zero runtime 3D work.
  if (tier === null) {
    return (
      <div
        aria-hidden
        className="absolute inset-0"
        style={{
          background:
            'radial-gradient(circle at 50% 50%, rgba(139,92,246,0.16), rgba(59,130,246,0.05) 42%, transparent 66%)',
        }}
      />
    );
  }

  return (
    <Canvas
      dpr={[1, 1.75]}
      camera={{ position: [0, 0, 5.2], fov: 45 }}
      gl={{ antialias: true, alpha: true }}
      frameloop={paused ? 'never' : 'always'}
      onCreated={({ gl }) => {
        glRef.current = gl;
        const el = gl.domElement;
        el.dataset.coreTier = tier;
        el.dataset.coreParticles = String(particleCountFor(tier, degraded));
        el.dataset.coreDegraded = String(degraded);
        el.dataset.corePostStage = String(stage);
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
      <IntelligenceCore tier={tier} degraded={degraded} scrollRef={scrollRef} />
      <CorePostProcessing stage={stage} />
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
