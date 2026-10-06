'use client';

import { useMemo, useRef } from 'react';
import * as THREE from 'three';
import { useFrame } from '@react-three/fiber';
import { thinkBump, type SharedProps } from './IntelligenceCore';

// Irregular orbital system: deliberately NOT concentric. Distinct tilts,
// elliptical squash, radii, and periods; one ring off-center. Plus exactly
// ONE expanding signal ring for the emit beat (kept invisible otherwise).
type RingDef = {
  radius: number;
  tube: number;
  tiltX: number;
  tiltZ: number;
  squashY: number;
  period: number;
  offset: [number, number, number];
};

const RINGS: RingDef[] = [
  { radius: 1.05, tube: 0.006, tiltX: 0.26, tiltZ: 0.1, squashY: 0.92, period: 12, offset: [0, 0, 0] },
  { radius: 1.35, tube: 0.005, tiltX: 0.61, tiltZ: -0.22, squashY: 0.84, period: 20, offset: [0.25, 0.1, 0] },
  { radius: 1.62, tube: 0.004, tiltX: 1.05, tiltZ: 0.35, squashY: 0.9, period: 28, offset: [0, 0, 0] },
  { radius: 1.9, tube: 0.0035, tiltX: 0.45, tiltZ: 0.8, squashY: 0.78, period: 40, offset: [-0.12, 0.06, 0] },
];

function alignBeat(ts: number): number {
  // Brief intentional plane alignment around the pulse moment (~1.5s).
  const d = (ts - 1.5) / 0.25;
  return Math.exp(-d * d);
}

export function OrbitalRings({ stateRef, thinkStartRef }: SharedProps) {
  const groupRefs = useRef<(THREE.Group | null)[]>([]);
  const signalRef = useRef<THREE.Mesh>(null);
  const signalMatRef = useRef<THREE.MeshBasicMaterial>(null);

  const edgeMats = useRef<(THREE.MeshBasicMaterial | null)[]>([]);

  const baseColors = useMemo(
    () => ({
      graphite: new THREE.Color('#23232e'),
      edge: new THREE.Color('#8b5cf6'),
      signal: new THREE.Color('#22d3ee'),
    }),
    []
  );

  useFrame((state, delta) => {
    const thinking = stateRef.current === 'thinking';
    const ts = (performance.now() - thinkStartRef.current) / 1000;
    const bump = thinking ? thinkBump(ts) : 0;
    const align = thinking ? alignBeat(ts) : 0;

    RINGS.forEach((r, i) => {
      const g = groupRefs.current[i];
      if (!g) return;
      g.rotation.z += delta * ((2 * Math.PI) / r.period);
      // Tighten ~6% during contraction, relax after.
      const s = 1 - 0.06 * bump;
      g.scale.set(s, s * r.squashY, s);
      // Brief unnatural plane alignment at the pulse beat.
      g.rotation.x = r.tiltX * (1 - 0.35 * align);
      g.rotation.y = r.tiltZ * (1 - 0.35 * align);
      const em = edgeMats.current[i];
      if (em) em.opacity = 0.18 + 0.25 * bump;
    });

    // THE single expanding signal ring (emit ~1.8s). Invisible otherwise.
    const mesh = signalRef.current;
    const mat = signalMatRef.current;
    if (mesh && mat) {
      if (thinking && ts > 1.7 && ts < 2.6) {
        const k = (ts - 1.7) / 0.9;
        mesh.visible = true;
        mesh.scale.setScalar(0.4 + 2.4 * k);
        mat.opacity = 0.85 * (1 - k);
      } else if (mesh.visible) {
        mesh.visible = false;
      }
    }
  });

  return (
    <group>
      {RINGS.map((r, i) => (
        <group
          key={i}
          ref={(g) => {
            groupRefs.current[i] = g;
          }}
          position={r.offset}
          rotation={[r.tiltX, r.tiltZ, 0]}
        >
          <mesh>
            <torusGeometry args={[r.radius, r.tube, 8, 160]} />
            <meshBasicMaterial color={baseColors.graphite} transparent opacity={0.85} />
          </mesh>
          <mesh>
            <torusGeometry args={[r.radius, r.tube * 0.45, 8, 160]} />
            <meshBasicMaterial
              ref={(m) => {
                edgeMats.current[i] = m;
              }}
              color={baseColors.edge}
              transparent
              opacity={0.18}
              blending={THREE.AdditiveBlending}
              depthWrite={false}
            />
          </mesh>
        </group>
      ))}
      <mesh ref={signalRef} visible={false} rotation={[Math.PI / 2.4, 0, 0.3]}>
        <torusGeometry args={[1, 0.012, 8, 128]} />
        <meshBasicMaterial
          ref={signalMatRef}
          color={baseColors.signal}
          transparent
          opacity={0}
          blending={THREE.AdditiveBlending}
          depthWrite={false}
        />
      </mesh>
    </group>
  );
}
