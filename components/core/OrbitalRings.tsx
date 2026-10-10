'use client';

import { useEffect, useMemo, useRef } from 'react';
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

export function OrbitalRings({
  stateRef,
  thinkStartRef,
  emitStartRef,
  errorRef,
  colors,
}: SharedProps) {
  const scene = useThree((s) => s.scene);
  const gl = useThree((s) => s.gl);
  const groupRefs = useRef<(THREE.Group | null)[]>([]);
  const signalRef = useRef<THREE.Mesh>(null);
  const signalMatRef = useRef<THREE.MeshBasicMaterial>(null);

  const ringMatRefs = useRef<(THREE.MeshPhysicalMaterial | null)[]>([]);
  const edgeMats = useRef<(THREE.MeshBasicMaterial | null)[]>([]);

  // Pointer-near boost (Section 6d): eased 0..1, ~300ms time constant. The
  // exp form is unconditionally stable for any delta (factor stays in [0,1]),
  // so a large resume delta after a pause cannot overshoot.
  const nearAmt = useRef(0);
  // Canvas-relative pointer position in CSS px from the canvas centre, from
  // a window-level listener: the hero's content layer (z-10) sits above the
  // canvas and swallows events over the Core region itself, so a canvas-
  // element listener would miss exactly the near-centre moves this boost
  // exists for — and R3F's state.pointer freezes while the cursor is over
  // the text. null until the first real move (R3F's (0,0)=centre default
  // would otherwise read as "near" before the mouse has ever moved).
  const pointerPx = useRef<{ x: number; y: number } | null>(null);
  const finePointer = useMemo(
    () =>
      typeof window !== 'undefined' &&
      window.matchMedia('(pointer: fine)').matches,
    []
  );
  useEffect(() => {
    if (!finePointer) return;
    const onMove = (e: PointerEvent) => {
      const rect = gl.domElement.getBoundingClientRect();
      pointerPx.current = {
        x: e.clientX - (rect.left + rect.width / 2),
        y: e.clientY - (rect.top + rect.height / 2),
      };
    };
    window.addEventListener('pointermove', onMove, { passive: true });
    return () => window.removeEventListener('pointermove', onMove);
  }, [gl, finePointer]);

  const baseColors = useMemo(
    () => ({
      edge: new THREE.Color('#8b5cf6'),
      signal: new THREE.Color('#22d3ee'),
    }),
    []
  );

  useFrame((_state, delta) => {
    const thinking = stateRef.current === 'thinking';
    const ts = (performance.now() - thinkStartRef.current) / 1000;
    const bump = thinking ? thinkBump(ts) : 0;
    const align = thinking ? alignBeat(ts) : 0;
    // Emit clock: -Infinity until the beat fires (chat waits for its
    // answer), so glint and ring stay dormant while thinking.
    const emitTs =
      emitStartRef.current === -Infinity
        ? -Infinity
        : (performance.now() - emitStartRef.current) / 1000;
    // Emit reflection flash, ~400ms wide, peaked with the Core flash on
    // the emit clock (preview: think+1.5s; chat: the answer) so the rings
    // catch the environment exactly as the center lights up. (Re-centered
    // from ts 1.9: this is the only glint formulation that starts from
    // baseline for a deferred emit — a 0.4-offset gaussian would read 96%
    // at resolve and pop.)
    const flash = thinking ? Math.exp(-Math.pow(emitTs / 0.2, 2)) : 0;

    // Pointer-near-Core (Section 6d): on/off at ~400px from the canvas
    // centre (the Core sits at the centre of the hero-sized canvas), not
    // scaled with distance — a flat "the Core notices the cursor" beat.
    let nearTarget = 0;
    if (finePointer && pointerPx.current) {
      if (
        Math.hypot(pointerPx.current.x, pointerPx.current.y) < 400
      ) {
        nearTarget = 1;
      }
    }
    nearAmt.current +=
      (nearTarget - nearAmt.current) * (1 - Math.exp(-delta / 0.3));

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
        // +20% while the pointer is near (eased above) — on top of the emit
        // flash, never instead of it.
        rm.envMapIntensity =
          (ENV_BASE + (ENV_FLASH - ENV_BASE) * flash) *
          (1 + 0.2 * nearAmt.current);
      }
    });

    // THE single expanding signal ring, on the EMIT clock — window
    // (0.2, 1.1) after the beat, identical to the old ts (1.7, 2.6) for a
    // preview's think+1.5s schedule. A deferred emit (chat resolve or
    // 8s watchdog) sets emitStart = now, so the ring opens 200ms after the
    // beat — an appearance from nothing, not a mid-expansion snap. Error
    // cycles emit a dimmer, red-tinted ring (Section 2); an error landing
    // MID-expansion EASES the color (0.12/frame, matching CoreCenter's
    // emissive ease) instead of hard-copying, so cyan→red never pops (M2's
    // "no second emit, just retint").
    const mesh = signalRef.current;
    const mat = signalMatRef.current;
    if (mesh && mat) {
      if (thinking && emitTs > 0.2 && emitTs < 1.1) {
        const k = (emitTs - 0.2) / 0.9;
        const fresh = !mesh.visible;
        mesh.visible = true;
        mesh.scale.setScalar(0.4 + 1.8 * k);
        const targetColor = errorRef.current ? colors.error : baseColors.signal;
        const targetOpacity = (errorRef.current ? 0.45 : 0.85) * (1 - k);
        if (fresh) {
          // First frame of this expansion: land on the right color so a
          // fast failure's ring is red from its very first visible frame.
          mat.color.copy(targetColor);
          mat.opacity = targetOpacity;
        } else {
          // Mid-expansion retint (M2): ease, never copy.
          mat.color.lerp(targetColor, 0.12);
          mat.opacity += (targetOpacity - mat.opacity) * 0.12;
        }
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
