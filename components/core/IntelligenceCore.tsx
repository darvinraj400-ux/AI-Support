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

export type CoreState = 'idle' | 'thinking';
export type CoreTier = 'high' | 'medium' | 'low';

export type CorePalette = {
  idle: THREE.Color;
  active: THREE.Color;
  response: THREE.Color;
};

export type SharedProps = {
  /** Mutable machine state — read in useFrame, never triggers renders. */
  stateRef: React.MutableRefObject<CoreState>;
  /** performance.now() ms of the current thinking start (-Infinity idle). */
  thinkStartRef: React.MutableRefObject<number>;
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

export function IntelligenceCore({
  tier,
  degraded,
}: {
  tier: CoreTier;
  degraded: boolean;
}) {
  const stateRef = useRef<CoreState>('idle');
  const thinkStartRef = useRef<number>(-Infinity);

  // Read Layer A tokens once on mount; cache for the scene lifetime.
  const colors = useMemo<CorePalette>(
    () => ({
      idle: new THREE.Color(readToken('--accent-idle', '#8b5cf6')),
      active: new THREE.Color(readToken('--accent-active', '#3b82f6')),
      response: new THREE.Color(readToken('--accent-response', '#22d3ee')),
    }),
    []
  );

  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | undefined;
    const handleThink = () => {
      if (stateRef.current !== 'idle') return;
      stateRef.current = 'thinking';
      thinkStartRef.current = performance.now();
      timer = setTimeout(() => {
        stateRef.current = 'idle';
        thinkStartRef.current = -Infinity;
      }, THINK_MS);
    };
    window.addEventListener('supportai:core:think', handleThink);
    return () => {
      window.removeEventListener('supportai:core:think', handleThink);
      if (timer) clearTimeout(timer);
    };
  }, []);

  const shared: SharedProps = { stateRef, thinkStartRef, colors, tier, degraded };

  return (
    <>
      <CameraRig />
      <ResponsiveScale>
        <EnvironmentSetup />
        <FogSetup />
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
function FogSetup() {
  const scene = useThree((s) => s.scene);
  useEffect(() => {
    scene.fog = new THREE.FogExp2(0x0a0a0f, 0.06);
    return () => {
      scene.fog = null;
    };
  }, [scene]);
  return null;
}

// Pointer parallax combined with a slow idle drift, damped toward the target so
// the motion is never snappy. Deliberately NOT OrbitControls: the hero must
// never trap the scroll or invite free-orbit inspection.
function CameraRig() {
  const camera = useThree((s) => s.camera);
  useFrame((state, delta) => {
    const t = state.clock.elapsedTime;
    const baseX = Math.sin(t * 0.15) * 0.08;
    const baseY = Math.cos(t * 0.12) * 0.05;
    const targetX = baseX + state.pointer.x * 0.6;
    const targetY = baseY + state.pointer.y * 0.4;
    camera.position.x += (targetX - camera.position.x) * delta * 2;
    camera.position.y += (targetY - camera.position.y) * delta * 2;
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
function ResponsiveScale({ children }: { children: React.ReactNode }) {
  const size = useThree((s) => s.size);
  const base = size.width < 768 ? 0.52 : size.width < 1024 ? 0.63 : 0.82;
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
export default function IntelligenceCoreScene({ paused }: { paused: boolean }) {
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
      <IntelligenceCore tier={tier} degraded={degraded} />
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
