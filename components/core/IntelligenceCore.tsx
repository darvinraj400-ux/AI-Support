'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import * as THREE from 'three';
import { Canvas, useThree } from '@react-three/fiber';
import { PerformanceMonitor, useDetectGPU } from '@react-three/drei';
import { CoreCenter } from './CoreCenter';
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
      <ambientLight intensity={0.25} />
      <CoreCenter {...shared} />
      <NeuralGeometry {...shared} />
      <OrbitalRings {...shared} />
      <ParticleField {...shared} />
    </ResponsiveScale>
  );
}

// Keeps the composition balanced: smaller on narrow viewports so the Core
// never covers hero copy. 1440px → ~0.62, 375px → 0.5 floor.
function ResponsiveScale({ children }: { children: React.ReactNode }) {
  const size = useThree((s) => s.size);
  const scale = Math.min(0.75, Math.max(0.5, size.width / 2300));
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
  };
  useEffect(writeTelemetry, [tier, degraded]);

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
        }
      }}
    >
      <PerformanceMonitor onDecline={() => setDegraded(true)} flipflops={2} />
      <IntelligenceCore tier={tier} degraded={degraded} />
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

/** 0 → 1 → 0 envelope over a thinking cycle (seconds since think start). */
export function thinkBump(t: number): number {
  return smoothstep(0, 1.2, t) * (1 - smoothstep(3.4, 4.0, t));
}
