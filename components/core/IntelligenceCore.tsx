'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import * as THREE from 'three';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { Canvas, useThree } from '@react-three/fiber';
import { PerformanceMonitor, useDetectGPU } from '@react-three/drei';
import { CoreCenter } from './CoreCenter';
import { CorePostProcessing } from './CorePostProcessing';
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
    <ResponsiveScale>
      <EnvironmentSetup />
      <ambientLight intensity={0.25} />
      <CoreCenter {...shared} />
      <NeuralGeometry {...shared} />
      <OrbitalRings {...shared} />
      <ParticleField {...shared} />
    </ResponsiveScale>
  );
}

// One-time image-based lighting: RoomEnvironment -> PMREM. Intensity is
// deliberately low (0.15) so this only gives the graphite rings and the neural
// edges physical presence; it must NOT light the scene or wash out the dark
// obsidian premise. scene.environment is reflection-only here — the Layer A
// background color stays untouched.
//
// Strict-mode double-mount is safe: cleanup disposes both the target and the
// generator, so no PMREM leaks across the mount/unmount/mount cycle.
function EnvironmentSetup() {
  const gl = useThree((s) => s.gl);
  const scene = useThree((s) => s.scene);

  useEffect(() => {
    const pmrem = new THREE.PMREMGenerator(gl);
    const target = pmrem.fromScene(new RoomEnvironment(), 0.04);
    scene.environment = target.texture;
    scene.environmentIntensity = 0.15;
    return () => {
      scene.environment = null;
      target.dispose();
      pmrem.dispose();
    };
  }, [gl, scene]);

  return null;
}

// Keeps the composition balanced: the ring system (outer radius ~1.70u,
// diameter ~3.40u) is the part that actually reads as "the Core" — the outer
// particle shell is sparse and faint, so scaling off it would undersize the
// thing we are trying to dominate the hero. Against the camera's 4.31u of
// visible height at z=0, these constants put the rings at ~42% / ~50% / ~64%
// of the hero box on mobile / tablet / desktop.
function ResponsiveScale({ children }: { children: React.ReactNode }) {
  const size = useThree((s) => s.size);
  const scale = size.width < 768 ? 0.52 : size.width < 1024 ? 0.63 : 0.82;
  return <group scale={scale}>{children}</group>;
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

// Default export: the dynamic() boundary in CoreCanvas loads this module,
// so three/fiber/drei never enter the page bundle. Fixed camera, capped DPR,
// demand-paused rendering, adaptive tiers.
export default function IntelligenceCoreScene({ paused }: { paused: boolean }) {
  const [isMobile, setIsMobile] = useState(false);
  const [degraded, setDegraded] = useState(false);
  // Sticky one-way bloom kill-switch. Never re-enabled: bloom off -> fps
  // recovers -> a re-enable would oscillate straight back into the slow path.
  const [bloomOn, setBloomOn] = useState(true);
  const glRef = useRef<THREE.WebGLRenderer | null>(null);

  // detect-gpu degrades gracefully (tier 0) when WebGL is unavailable.
  const gpuTier = useDetectGPU()?.tier;

  // Read-only telemetry for verification (tier/count/degraded on the
  // canvas element). Never read in the render path.
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [gpuTier, isMobile]
  );

  // Read-only telemetry for verification (tier/count/degraded on the
  // canvas element). Written in onCreated (gl guaranteed) and re-applied
  // whenever tier/degraded change. Never read in the render path.
  const writeTelemetry = () => {
    const el = glRef.current?.domElement;
    if (!el || tier === null) return;
    el.dataset.coreTier = tier;
    el.dataset.coreParticles = String(particleCountFor(tier, degraded));
    el.dataset.coreDegraded = String(degraded);
    // Report what is actually mounted, not the raw `bloomOn` flag — the
    // composer is additionally gated off at the low tier.
    el.dataset.coreBloom = String(bloomOn && tier !== 'low');
  };
  useEffect(writeTelemetry, [tier, degraded, bloomOn]);

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
        if (tier !== null) {
          el.dataset.coreTier = tier;
          el.dataset.coreParticles = String(particleCountFor(tier, degraded));
          el.dataset.coreDegraded = String(degraded);
          el.dataset.coreBloom = String(bloomOn && tier !== 'low');
        }
      }}
    >
      <PerformanceMonitor onDecline={() => setDegraded(true)} flipflops={2} />
      {/* Bloom's own guard: sustained sub-50fps unmounts the composer and
          leaves the rest of the scene running. Default drei bounds are
          [40,60], so the threshold has to be set explicitly. */}
      <PerformanceMonitor
        bounds={() => [50, 60]}
        onDecline={() => setBloomOn(false)}
      />
      <IntelligenceCore tier={tier} degraded={degraded} />
      {/* Bloom is armed only above the low tier. resolveTier forces every
          mobile device to 'low', and drei's PerformanceMonitor needs ~2.5s of
          sustained sub-50fps before it reacts — so arming the composer
          unconditionally made the weakest GPUs pay the heaviest cost during
          exactly the hero-load window the tier system exists to protect, then
          take a permanent downgrade. Same gate the connection bands use. */}
      <CorePostProcessing enabled={bloomOn && tier !== 'low'} />
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
