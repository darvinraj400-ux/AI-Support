'use client';

import { useMemo, useRef } from 'react';
import * as THREE from 'three';
import { useFrame } from '@react-three/fiber';
import { thinkBump, type SharedProps } from './IntelligenceCore';

// Irregular orbital system: deliberately NOT concentric. Three distinct
// planes, a different in-plane stretch per ring, and small center offsets so
// no ring passes through the core's center. Plus exactly ONE expanding signal
// ring for the emit beat (kept invisible otherwise).
type RingDef = {
  radius: number;
  tube: number;
  tiltX: number;
  tiltZ: number;
  /** In-plane X stretch. 1.0 = circular. */
  stretchX: number;
  /** In-plane Y squash. 1.0 = circular. */
  squashY: number;
  period: number;
  offset: [number, number, number];
};

// Tilts 18° / 42° / 68° (0.314 / 0.733 / 1.187 rad) — spaced far enough apart
// to read as three separate planes. Periods are the original 12/20/28s ÷ 1.4.
// tube 0.0035u ≈ 0.8 CSS px at the 1440 reference scale.
const RINGS: RingDef[] = [
  { radius: 1.05, tube: 0.0035, tiltX: 0.314, tiltZ: 0.1, stretchX: 1.0, squashY: 1.0, period: 8.57, offset: [0.08, -0.06, 0] },
  { radius: 1.35, tube: 0.0035, tiltX: 0.733, tiltZ: -0.22, stretchX: 1.15, squashY: 1.0, period: 14.29, offset: [-0.05, 0.08, 0.04] },
  { radius: 1.62, tube: 0.0035, tiltX: 1.187, tiltZ: 0.35, stretchX: 1.0, squashY: 0.92, period: 20, offset: [0.07, 0.05, -0.06] },
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
      // Tighten ~10% during contraction, relax after.
      const s = 1 - 0.1 * bump;
      g.scale.set(s * r.stretchX, s * r.squashY, s);
      // Brief unnatural plane alignment at the pulse beat.
      g.rotation.x = r.tiltX * (1 - 0.35 * align);
      g.rotation.y = r.tiltZ * (1 - 0.35 * align);
      const em = edgeMats.current[i];
      if (em) em.opacity = 0.26 + 0.25 * bump;
    });

    // THE single expanding signal ring (emit ~1.8s). Invisible otherwise.
    const mesh = signalRef.current;
    const mat = signalMatRef.current;
    if (mesh && mat) {
      if (thinking && ts > 1.7 && ts < 2.6) {
        const k = (ts - 1.7) / 0.9;
        mesh.visible = true;
        mesh.scale.setScalar(0.4 + 1.8 * k);
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
            {/* Polished graphite. metalness is 0.7 rather than the specified
                0.85: at 0.85 the rings are almost purely specular, and with
                only the CoreCenter pointLight plus a 0.15-intensity room env
                there is nothing to reflect — they rendered effectively black
                and the Core lost its outer structure entirely. 0.7 leaves a
                diffuse term so the pointLight actually shapes the rings, which
                is the point of section 5.5 ("give the rings physical
                presence").
                envMapIntensity is set to 1.0 as specified, but note three
                r186 overrides it at draw time: when scene.environment is set
                and material.envMap is null, the scene-level
                environmentIntensity (0.15) is what actually reaches the
                shader. The real reflection knob lives in IntelligenceCore's
                EnvironmentSetup. */}
            <meshStandardMaterial
              color="#1a1a24"
              metalness={0.7}
              roughness={0.35}
              envMapIntensity={1.0}
              transparent
              opacity={0.85}
            />
          </mesh>
          <mesh>
            <torusGeometry args={[r.radius, r.tube * 0.45, 8, 160]} />
            <meshBasicMaterial
              ref={(m) => {
                edgeMats.current[i] = m;
              }}
              color={baseColors.edge}
              transparent
              opacity={0.26}
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
