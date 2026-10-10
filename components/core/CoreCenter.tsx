'use client';

import { useMemo, useRef } from 'react';
import * as THREE from 'three';
import { useFrame } from '@react-three/fiber';
import { smoothstep, type SharedProps } from './IntelligenceCore';

// Diffuse luminous center: the primary (and only strong) light source.
//
// Idle: violet, nominal emissive 1.2, breathing on a 4s cycle. Section 10 asks
// for a 0.8 -> 1.3 breath, so `breath` is that range and the nominal 1.2 from
// Section 5 is applied as a level on top (breath is normalised by its 1.05
// centre, giving an idle band of ~0.91 – 1.49 around the 1.2 target).
//
// Thinking: contracts (dips to 0.75x), flashes to a 3.5 peak at the ~1.5s
// pulse beat, then eases back — no snaps anywhere. The flash is sized so the
// peak lands on 3.5: 1.2 (level) * 0.75 (contraction) * 3.9 (flash) = 3.5.
//
// Error variant (Section 2): a resolve carrying `error` tints the core red at
// the emit beat instead of resolving to cyan, with a dimmer flash (~2.2 peak)
// — the "intelligence hit a problem" beat. The 0.08/frame emissive ease keeps
// both the jump into red and the return to idle violet smooth.
export function CoreCenter({
  stateRef,
  thinkStartRef,
  errorRef,
  colors,
}: SharedProps) {
  const matRef = useRef<THREE.MeshStandardMaterial>(null);
  const haloRef = useRef<THREE.MeshBasicMaterial>(null);
  const lightRef = useRef<THREE.PointLight>(null);
  const whiteRef = useRef<THREE.Mesh>(null);

  const tmp = useMemo(() => new THREE.Color(), []);
  const target = useMemo(() => new THREE.Color(), []);

  useFrame((state) => {
    const t = state.clock.elapsedTime;
    const thinking = stateRef.current === 'thinking';
    const ts = (performance.now() - thinkStartRef.current) / 1000;

    // Breath in [0.8, 1.3] (Section 10), centred at 1.05 so it never
    // approaches blackout the way a literal `0.8 + 0.5*sin` would.
    const breath = 1.05 + 0.25 * Math.sin((2 * Math.PI * t) / 4);
    const breathNorm = breath / 1.05;

    if (!thinking) {
      target.copy(colors.idle);
    } else if (errorRef.current) {
      // Violet -> blue through the active window, red at the emit beat
      // (earlier than the cyan resolution, so the failure reads as the emit).
      target.copy(colors.idle).lerp(colors.active, smoothstep(1.0, 2.2, ts));
      target.lerp(colors.error, smoothstep(1.6, 2.2, ts));
    } else {
      // Violet -> blue through the active window, cyan at resolution.
      target.copy(colors.idle).lerp(colors.active, smoothstep(1.0, 2.2, ts));
      target.lerp(colors.response, smoothstep(3.2, 3.6, ts));
    }

    // Exponential ease toward the target: continuous across state flips.
    const mat = matRef.current;
    if (mat) {
      mat.emissive.copy(tmp.copy(mat.emissive).lerp(target, 0.08));

      const idleLevel = 1.2;
      const contraction = 1 - 0.25 * smoothstep(0, 1.2, ts);
      // Error flashes dimmer (peak ≈ 2.2 vs 3.5): 1.2 * 0.75 * 2.44.
      const flashPeak = errorRef.current ? 1.44 : 2.9;
      const flash = thinking
        ? 1 + flashPeak * Math.exp(-Math.pow((ts - 1.5) / 0.18, 2))
        : 1;
      mat.emissiveIntensity = thinking
        ? idleLevel * breathNorm * contraction * flash
        : idleLevel * breathNorm;
    }
    if (haloRef.current) {
      haloRef.current.opacity = (thinking ? 0.17 : 0.1) * breathNorm;
      haloRef.current.color.copy(mat?.emissive ?? target);
    }
    if (lightRef.current) {
      lightRef.current.color.copy(mat?.emissive ?? target);
      lightRef.current.intensity = 2.2 * breathNorm;
    }
    // Second inner sphere: a hard white point at the very center, breathing
    // 0.6 -> 1.2 on the same 4s cycle. Gives the glass shell something with
    // real contrast to refract.
    if (whiteRef.current) {
      const s = 0.9 + 0.3 * Math.sin((2 * Math.PI * t) / 4);
      whiteRef.current.scale.setScalar(s);
    }
  });

  return (
    <group>
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
          fog={false}
        />
      </mesh>
      {/* small concentrated source */}
      <mesh>
        <sphereGeometry args={[0.13, 24, 24]} />
        <meshStandardMaterial
          ref={matRef}
          color="#0a0a0f"
          emissive={colors.idle}
          emissiveIntensity={1.2}
          roughness={0.9}
          metalness={0}
          transparent
          opacity={0.85}
        />
      </mesh>
      {/* hard white point, pure emissive */}
      <mesh ref={whiteRef}>
        <sphereGeometry args={[0.08, 16, 16]} />
        <meshBasicMaterial color="#ffffff" fog={false} />
      </mesh>
      <pointLight ref={lightRef} color={colors.idle} intensity={2.2} distance={9} decay={2} />
    </group>
  );
}
