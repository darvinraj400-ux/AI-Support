'use client';

import { useMemo, useRef } from 'react';
import * as THREE from 'three';
import { useFrame } from '@react-three/fiber';
import { smoothstep, type SharedProps } from './IntelligenceCore';

// Diffuse luminous center: the primary (and only strong) light source.
// Idle: violet breathing 0.6 → 0.9 over ~6s. Thinking: damps toward blue,
// brief cyan resolution beat, then eases back — no snaps anywhere.
export function CoreCenter({ stateRef, thinkStartRef, colors }: SharedProps) {
  const matRef = useRef<THREE.MeshStandardMaterial>(null);
  const haloRef = useRef<THREE.MeshBasicMaterial>(null);
  const lightRef = useRef<THREE.PointLight>(null);
  const groupRef = useRef<THREE.Group>(null);

  const tmp = useMemo(() => new THREE.Color(), []);
  const target = useMemo(() => new THREE.Color(), []);

  useFrame((state) => {
    const t = state.clock.elapsedTime;
    const thinking = stateRef.current === 'thinking';
    const ts = (performance.now() - thinkStartRef.current) / 1000;

    // Idle breathing.
    const breath = 0.75 + 0.15 * Math.sin((2 * Math.PI * t) / 6);

    if (!thinking) {
      target.copy(colors.idle);
    } else {
      // Violet → blue through the active window, cyan at resolution.
      target.copy(colors.idle).lerp(colors.active, smoothstep(1.0, 2.2, ts));
      target.lerp(colors.response, smoothstep(3.2, 3.6, ts));
    }

    // Exponential ease toward the target: continuous across state flips.
    // (Fixed per-frame factor; frame-rate independent enough at 30-120fps
    // for a 0.6s time constant.)
    const mat = matRef.current;
    if (mat) {
      mat.emissive.copy(tmp.copy(mat.emissive).lerp(target, 0.08));
      const dim = thinking ? 1 - 0.25 * smoothstep(0, 1.2, ts) : 1;
      const beat = thinking
        ? 1 + 0.6 * Math.exp(-Math.pow((ts - 1.5) / 0.18, 2))
        : 1;
      mat.emissiveIntensity = breath * dim * beat;
    }
    if (haloRef.current) {
      haloRef.current.opacity = (thinking ? 0.17 : 0.1) * breath;
      haloRef.current.color.copy(mat?.emissive ?? target);
    }
    if (lightRef.current) {
      lightRef.current.color.copy(mat?.emissive ?? target);
      lightRef.current.intensity = 2.2 * breath;
    }
    if (groupRef.current) {
      const s = 1 + 0.035 * Math.sin((2 * Math.PI * t) / 6);
      groupRef.current.scale.setScalar(s);
    }
  });

  return (
    <group ref={groupRef}>
      {/* soft diffuse halo, not a surface */}
      <mesh>
        <sphereGeometry args={[0.3, 32, 32]} />
        <meshBasicMaterial
          ref={haloRef}
          color={colors.idle}
          transparent
          opacity={0.1}
          blending={THREE.AdditiveBlending}
          depthWrite={false}
        />
      </mesh>
      {/* small concentrated source */}
      <mesh>
        <sphereGeometry args={[0.13, 24, 24]} />
        <meshStandardMaterial
          ref={matRef}
          color="#0a0a0f"
          emissive={colors.idle}
          emissiveIntensity={0.75}
          roughness={0.9}
          metalness={0}
          transparent
          opacity={0.85}
        />
      </mesh>
      <pointLight ref={lightRef} color={colors.idle} intensity={2.2} distance={9} decay={2} />
    </group>
  );
}
