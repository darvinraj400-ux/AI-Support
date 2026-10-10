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
// Thinking: contracts (dips to 0.75x), flashes to a 3.5 peak on the emit
// beat (preview: think+1.5s exactly as before; chat: when the answer
// lands), then eases back — no snaps anywhere. The flash is sized so the
// peak lands on 3.5: 1.2 (level) * 0.75 (contraction) * 3.9 (flash) = 3.5.
//
// Error variant (Section 2): a resolve carrying `error` tints the core red
// for the remainder of the cycle instead of resolving to cyan, with a
// dimmer flash (~2.2 peak) — the "intelligence hit a problem" beat. The
// 0.08/frame emissive ease keeps both the ramp into red and the return to
// idle violet smooth.
export function CoreCenter({
  stateRef,
  thinkStartRef,
  emitStartRef,
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
    // Emit clock: -Infinity until the beat fires so every ramp below is 0
    // while chat waits for its answer (a raw (now - -Infinity) would be
    // +Infinity and saturate the success ramp to full cyan pre-emit).
    // When the beat fires, emitStart = now, so emitTs starts at 0 — the
    // flash gaussian peaks exactly at resolve for chat and at think+1.5s
    // for a preview's scheduled emit.
    const emitTs =
      emitStartRef.current === -Infinity
        ? -Infinity
        : (performance.now() - emitStartRef.current) / 1000;

    // Breath in [0.8, 1.3] (Section 10), centred at 1.05 so it never
    // approaches blackout the way a literal `0.8 + 0.5*sin` would.
    const breath = 1.05 + 0.25 * Math.sin((2 * Math.PI * t) / 4);
    const breathNorm = breath / 1.05;

      if (!thinking) {
        target.copy(colors.idle);
      } else if (errorRef.current) {
        // Violet -> blue on the think clock; red on the EMIT clock
        // (0.1–0.7s after the beat). A failure at any ts therefore tints
        // the Core red for the remainder of the cycle; the 0.08/frame
        // emissive ease smooths it in (M2, no snap).
        target.copy(colors.idle).lerp(colors.active, smoothstep(1.0, 2.2, ts));
        target.lerp(colors.error, smoothstep(0.1, 0.7, emitTs));
      } else {
        // Violet -> blue on the think clock; cyan 1.7–2.1s after the emit
        // (the same offset from the beat the old ts 3.2–3.6 had from think
        // start: preview timing unchanged, chat synced to the answer).
        target.copy(colors.idle).lerp(colors.active, smoothstep(1.0, 2.2, ts));
        target.lerp(colors.response, smoothstep(1.7, 2.1, emitTs));
      }

    // Exponential ease toward the target: continuous across state flips.
    const mat = matRef.current;
    if (mat) {
      mat.emissive.copy(tmp.copy(mat.emissive).lerp(target, 0.08));

      const idleLevel = 1.2;
      const contraction = 1 - 0.25 * smoothstep(0, 1.2, ts);
      // Error flashes dimmer (peak ≈ 2.2 vs 3.5): 1.2 * 0.75 * 2.44.
      const flashPeak = errorRef.current ? 1.44 : 2.9;
      // Flash on the EMIT clock (peak at emitTs=0): preview peaks at
      // think+1.5s exactly as before; chat peaks when the answer lands
      // (emitStart = now at resolve). Pre-emit, emitTs=-Infinity → exp→0
      // → no flash while waiting.
      const flash = thinking
        ? 1 + flashPeak * Math.exp(-Math.pow(emitTs / 0.18, 2))
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
