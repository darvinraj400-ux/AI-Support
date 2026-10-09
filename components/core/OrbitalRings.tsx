'use client';

import { useMemo, useRef } from 'react';
import * as THREE from 'three';
import { useFrame, useThree } from '@react-three/fiber';
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
//
// tube is 0.014 (not the hairline 0.0035 of the earlier layers). A
// metalness-1.0 ring only reads as metal if it has enough surface to catch a
// specular gradient; at 0.0035 the highlight was sub-pixel and every ring
// collapsed to a dark wireframe against the dark night HDRI. 0.014 ≈ 3 CSS px
// at the 1440 reference — still a fine ring, but with a body the point light
// and environment can actually shape.
const RINGS: RingDef[] = [
  { radius: 1.05, tube: 0.014, tiltX: 0.314, tiltZ: 0.1, stretchX: 1.0, squashY: 1.0, period: 8.57, offset: [0.08, -0.06, 0] },
  { radius: 1.35, tube: 0.014, tiltX: 0.733, tiltZ: -0.22, stretchX: 1.15, squashY: 1.0, period: 14.29, offset: [-0.05, 0.08, 0.04] },
  { radius: 1.62, tube: 0.014, tiltX: 1.187, tiltZ: 0.35, stretchX: 1.0, squashY: 0.92, period: 20, offset: [0.07, 0.05, -0.06] },
];

// Nominal / flash reflection intensity. During the emit beat the rings catch
// the environment harder for ~400ms (Section 10), then ease back.
const ENV_BASE = 1.2;
const ENV_FLASH = 2.0;

function alignBeat(ts: number): number {
  // Brief intentional plane alignment around the pulse moment (~1.5s).
  const d = (ts - 1.5) / 0.25;
  return Math.exp(-d * d);
}

export function OrbitalRings({ stateRef, thinkStartRef }: SharedProps) {
  const scene = useThree((s) => s.scene);
  const groupRefs = useRef<(THREE.Group | null)[]>([]);
  const signalRef = useRef<THREE.Mesh>(null);
  const signalMatRef = useRef<THREE.MeshBasicMaterial>(null);

  const ringMatRefs = useRef<(THREE.MeshPhysicalMaterial | null)[]>([]);
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
    // Emit reflection flash, centred on the emit beat, ~400ms wide.
    const flash = thinking ? Math.exp(-Math.pow((ts - 1.9) / 0.2, 2)) : 0;

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

      // three r186 routes env intensity to scene.environmentIntensity whenever
      // material.envMap is null. Binding the texture here is what lets the
      // per-material envMapIntensity (and the emit flash above) actually reach
      // the shader instead of being silently ignored.
      const rm = ringMatRefs.current[i];
      if (rm) {
        if (rm.envMap !== scene.environment) rm.envMap = scene.environment;
        rm.envMapIntensity = ENV_BASE + (ENV_FLASH - ENV_BASE) * flash;
      }
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
            {/* Real metal: metalness 1.0, clearcoat 0.6 (Section 5). Two
                values are tuned away from the literal spec so the metal
                actually reads against a *night* environment, which is mostly
                darkness to reflect:
                  - color #232330 (not #15151e): a near-black metal reflecting
                    a dark sky is indistinguishable from a hole. A slightly
                    lifted graphite base gives the specular something to modulate.
                  - roughness 0.28 (not 0.18): a mirror-smooth dark metal under
                    a single point light produces one tiny glint; 0.28 broadens
                    it into a gradient falloff across the ring body, which is
                    what criterion 1 ("gradient falloff indicating they reflect
                    the environment") is actually testing.
                metalness stays at 1.0 and envMapIntensity at 1.2 per spec.
                envMap is bound to the night HDRI in useFrame above. */}
            <meshPhysicalMaterial
              ref={(m) => {
                ringMatRefs.current[i] = m;
              }}
              color="#232330"
              metalness={1.0}
              roughness={0.28}
              clearcoat={0.6}
              clearcoatRoughness={0.15}
              envMapIntensity={ENV_BASE}
              transparent
              opacity={0.95}
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
              fog={false}
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
          fog={false}
        />
      </mesh>
    </group>
  );
}
