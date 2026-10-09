'use client';

import { useEffect, useMemo, useRef } from 'react';
import * as THREE from 'three';
import { useFrame } from '@react-three/fiber';
import { Trail } from '@react-three/drei';
import { smoothstep, thinkBump, type SharedProps } from './IntelligenceCore';

const TIER_COUNT: Record<string, number> = { high: 400, medium: 250, low: 120 };

export function particleCountFor(
  tier: string,
  degraded: boolean
): number {
  const base = TIER_COUNT[tier] ?? 250;
  return degraded ? Math.floor(base * 0.6) : base;
}
const BAND_WINDOW = 0.3;
const BAND_START = 2.2;

function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

type FieldData = {
  count: number;
  base: Float32Array;
  phase: Float32Array;
  /** Per-particle drift speed multiplier, in [0.6, 1.4]. */
  speed: Float32Array;
  clusterW: Float32Array;
  clusterPos: Float32Array;
  /** Indices of the TRAIL_N fastest particles, for the motion trails. */
  trailIdx: number[];
  bands: { pairs: Uint32Array; positions: Float32Array; count: number }[];
  maxSegs: number;
};

/** How many particles carry a drei Trail (high tier only). */
const TRAIL_N = 20;

function buildField(count: number, maxSegs: number): FieldData {
  const rand = mulberry32(1337);
  const base = new Float32Array(count * 3);
  const phase = new Float32Array(count);
  const speed = new Float32Array(count);
  const clusterW = new Float32Array(count);
  const clusterPos = new Float32Array(count * 3);

  for (let i = 0; i < count; i++) {
    // Shell 1.1–2.3 with subtle +x density bias.
    const r = 1.1 + rand() * 1.2;
    const theta = rand() * Math.PI * 2;
    const y = (rand() * 2 - 1) * 0.85;
    const rxz = Math.sqrt(Math.max(0, 1 - y * y));
    base[i * 3] = Math.cos(theta) * rxz * r + 0.22;
    base[i * 3 + 1] = y * r;
    base[i * 3 + 2] = Math.sin(theta) * rxz * r;
    phase[i] = i * 2.39996;
    // Spread drift speeds so the field reads as a current, not a uniform
    // cloud: some particles visibly outrun their neighbours.
    speed[i] = 0.6 + rand() * 0.8;

    // ~18% belong to an off-axis cluster that forms and dissolves.
    if (rand() < 0.18) {
      clusterW[i] = 1;
      const g = () => (rand() + rand() + rand() - 1.5) * 0.35;
      clusterPos[i * 3] = 0.95 + g();
      clusterPos[i * 3 + 1] = 0.45 + g();
      clusterPos[i * 3 + 2] = 0.15 + g();
    }
  }

  // Greedy nearest-neighbor segments, capped. Band by angular third so
  // activation sweeps around the system instead of flashing at once.
  const pairs: number[][] = [[], [], []];
  let total = 0;
  outer: for (let i = 0; i < count; i++) {
    let best = -1;
    let bestD = 0.55 * 0.55;
    for (let j = i + 1; j < count; j++) {
      const dx = base[i * 3] - base[j * 3];
      const dy = base[i * 3 + 1] - base[j * 3 + 1];
      const dz = base[i * 3 + 2] - base[j * 3 + 2];
      const d = dx * dx + dy * dy + dz * dz;
      if (d < bestD) {
        bestD = d;
        best = j;
      }
    }
    if (best >= 0) {
      const ang =
        (Math.atan2(base[i * 3 + 2], base[i * 3]) + Math.PI) / (Math.PI * 2);
      const band = Math.min(2, Math.floor(ang * 3));
      pairs[band].push(i, best);
      if (++total >= maxSegs) break outer;
    }
  }

  const bands = pairs.map((p) => ({
    pairs: new Uint32Array(p),
    positions: new Float32Array(p.length * 3),
    count: p.length / 2,
  }));

  // The TRAIL_N fastest particles by drift speed carry motion trails during
  // the thinking cycle. Sorted once at build time; positions are resolved live
  // from the shared buffer so trails track the exact particle they belong to.
  const trailIdx = Array.from({ length: Math.min(TRAIL_N, count) }, (_, k) => k)
    .sort((a, b) => speed[b] - speed[a]);

  return { count, base, phase, speed, clusterW, clusterPos, trailIdx, bands, maxSegs };
}

export function ParticleField({
  stateRef,
  thinkStartRef,
  colors,
  tier,
  degraded,
}: SharedProps) {
  // Degraded mode sheds ~40% of particles (one rebuild, then steady).
  const effCount = particleCountFor(tier, degraded);
  const data = useMemo(
    () => buildField(effCount, tier === 'high' && !degraded ? 260 : 140),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [effCount]
  );

  // Soft circular sprite: a 32x32 radial gradient (opaque white centre,
  // transparent edge) so points read as glowing motes instead of hard squares.
  // Built in useMemo rather than at module scope — module scope would run
  // during SSR (`document is not defined`) the moment anything server-side
  // imports this file, and useMemo lets us dispose the GL texture on unmount.
  const sprite = useMemo(() => {
    const c = document.createElement('canvas');
    c.width = 32;
    c.height = 32;
    const ctx = c.getContext('2d');
    if (ctx) {
      const g = ctx.createRadialGradient(16, 16, 0, 16, 16, 16);
      g.addColorStop(0, 'rgba(255,255,255,1)');
      g.addColorStop(0.4, 'rgba(255,255,255,0.55)');
      g.addColorStop(1, 'rgba(255,255,255,0)');
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, 32, 32);
    }
    const tex = new THREE.CanvasTexture(c);
    tex.colorSpace = THREE.SRGBColorSpace;
    return tex;
  }, []);
  useEffect(() => () => sprite.dispose(), [sprite]);

  const geoRef = useRef<THREE.BufferGeometry>(null);
  const lineRefs = useRef<(THREE.LineSegments | null)[]>([]);
  const lineMatRefs = useRef<(THREE.LineBasicMaterial | null)[]>([]);
  const spinRef = useRef<THREE.Group>(null);
  const driftTime = useRef(0);

  // Motion-trail anchors (high tier only). Each is a tiny mesh repositioned
  // every frame to sit on its particle; drei's Trail records the movement.
  const trailsRef = useRef<THREE.Group>(null);
  const anchorRefs = useRef<(THREE.Mesh | null)[]>([]);

  // Live positions buffer, written every frame from base data.
  const positions = useMemo(() => new Float32Array(data.count * 3), [data]);

  useFrame((_state, delta) => {
    const dt = Math.min(delta, 0.05);
    const thinking = stateRef.current === 'thinking';
    const ts = (performance.now() - thinkStartRef.current) / 1000;
    const bump = thinking ? thinkBump(ts) : 0;

    // Anticipation beat: motion briefly eases near peak compression.
    const dip = thinking ? Math.exp(-Math.pow((ts - 1.3) / 0.12, 2)) : 0;
    driftTime.current += dt * (1 - 0.45 * dip);
    const dtm = driftTime.current;

    const radiusF = 1 - 0.32 * bump;
    const { base, phase, speed, clusterW, clusterPos, count } = data;

    // The whole outer shell turns as one slow system, so the field reads as
    // orbiting matter rather than a static cloud of jiggling dots.
    if (spinRef.current) spinRef.current.rotation.y += dt * 0.04;

    for (let i = 0; i < count; i++) {
      const p = phase[i];
      const spd = speed[i];
      // Primary drift: frequencies ×1.6 from the original 0.25/0.19/0.22.
      // Amplitudes are unchanged on purpose — raising them would enlarge each
      // particle's excursion and destroy the clustering that depends on
      // particles staying near their base positions.
      const ax = 0.06 * Math.sin(dtm * 0.4 * spd + p);
      const ay = 0.05 * Math.sin(dtm * 0.304 * spd + p * 1.3);
      const az = 0.06 * Math.cos(dtm * 0.352 * spd + p);
      // Secondary cross-axis drift, in quadrature with the primary. This is
      // the "current": each particle traces a shallow helix instead of
      // oscillating back and forth along a single line.
      const bx = 0.03 * Math.cos(dtm * 0.304 * spd + p * 1.3);
      const by = 0.03 * Math.cos(dtm * 0.352 * spd + p);
      const bz = 0.03 * Math.sin(dtm * 0.4 * spd + p);
      const sx = base[i * 3] * radiusF + ax + bx;
      const sy = base[i * 3 + 1] * radiusF + ay + by;
      const sz = base[i * 3 + 2] * radiusF + az + bz;
      if (clusterW[i] > 0) {
        // Cluster cycle ~18s (was ~90s at 0.07). Drives from raw dtm, so the
        // ×1.6 drift speed-up does not also accelerate cluster formation.
        const w = clusterW[i] * (0.5 + 0.5 * Math.sin(dtm * 0.35 + p * 2.1));
        positions[i * 3] = sx + (clusterPos[i * 3] - sx) * w;
        positions[i * 3 + 1] = sy + (clusterPos[i * 3 + 1] - sy) * w;
        positions[i * 3 + 2] = sz + (clusterPos[i * 3 + 2] - sz) * w;
      } else {
        positions[i * 3] = sx;
        positions[i * 3 + 1] = sy;
        positions[i * 3 + 2] = sz;
      }
    }
    const attr = geoRef.current?.getAttribute('position') as
      | THREE.BufferAttribute
      | undefined;
    if (attr) attr.needsUpdate = true;

    // Connection bands: thinking-only, sequential, then dissolve.
    // Reuse the same buffers every frame — no allocation here.
    const allowConn = tier !== 'low' && !degraded;
    data.bands.forEach((band, b) => {
      const line = lineRefs.current[b];
      const mat = lineMatRefs.current[b];
      if (!line || !mat) return;
      const start = BAND_START + b * BAND_WINDOW;
      const op = thinking
        ? smoothstep(start, start + 0.2, ts) *
          (1 - smoothstep(3.5, 3.9, ts)) *
          0.55
        : 0;
      if (!allowConn || op <= 0.01) {
        if (line.visible) line.visible = false;
        return;
      }
      line.visible = true;
      mat.opacity = op;
      const arr = band.positions;
      const prs = band.pairs;
      for (let s = 0; s < band.count; s++) {
        const a = prs[s * 2] * 3;
        const c = prs[s * 2 + 1] * 3;
        arr[s * 6] = positions[a];
        arr[s * 6 + 1] = positions[a + 1];
        arr[s * 6 + 2] = positions[a + 2];
        arr[s * 6 + 3] = positions[c];
        arr[s * 6 + 4] = positions[c + 1];
        arr[s * 6 + 5] = positions[c + 2];
      }
      const la = line.geometry.getAttribute('position') as
        | THREE.BufferAttribute
        | undefined;
      if (la) la.needsUpdate = true;
    });

    // Motion trails: thinking-only. Visible through the contraction and active
    // window (trails grow in as the anchors start moving), hidden from the
    // resolution beat onward so they collapse instead of lingering past the
    // 4.0s state flip. Hidden entirely when idle.
    //
    // drei's Trail records the anchor's world position every frame regardless
    // of visibility (its stride guard never skips at the default 0), so simply
    // freezing the anchors would still leave a permanent orbiting arc in the
    // buffer as spinRef rotates. Parking each anchor at the group's pivot
    // (local origin) means it does not move under the group's rotation, so the
    // Trail records a single static point — no stale arc when it re-shows.
    if (trailsRef.current) {
      const active = thinking && ts < 3.0;
      trailsRef.current.visible = active;
      const idx = data.trailIdx;
      for (let k = 0; k < idx.length; k++) {
        const a = anchorRefs.current[k];
        if (!a) continue;
        if (active) {
          const p = idx[k] * 3;
          a.position.set(positions[p], positions[p + 1], positions[p + 2]);
        } else {
          a.position.set(0, 0, 0);
        }
      }
    }
  });

  return (
    <group ref={spinRef}>
      <points frustumCulled={false}>
        <bufferGeometry ref={geoRef}>
          <bufferAttribute attach="attributes-position" args={[positions, 3]} />
        </bufferGeometry>
        <pointsMaterial
          color="#8a8a95"
          size={0.02}
          sizeAttenuation
          map={sprite}
          transparent
          opacity={0.7}
          depthWrite={false}
        />
      </points>
      {data.bands.map((band, b) => (
        <lineSegments
          key={b}
          ref={(l) => {
            lineRefs.current[b] = l;
          }}
          visible={false}
          frustumCulled={false}
        >
          <bufferGeometry>
            <bufferAttribute attach="attributes-position" args={[band.positions, 3]} />
          </bufferGeometry>
          <lineBasicMaterial
            ref={(m) => {
              lineMatRefs.current[b] = m;
            }}
            color="#3b82f6"
            transparent
            opacity={0}
            blending={THREE.AdditiveBlending}
            depthWrite={false}
            fog={false}
          />
        </lineSegments>
      ))}
      {/* Motion trails on the 20 fastest particles (high tier only). Each
          anchor is repositioned in useFrame to sit exactly on its particle;
          drei's Trail turns that movement into a tapered streak. Gated off
          the low/medium tiers and when degraded: Trail costs ~20 extra
          meshline updates plus draw calls per frame. */}
      {tier === 'high' && !degraded && (
        <group ref={trailsRef} visible={false}>
          {data.trailIdx.map((_, k) => (
            <Trail
              key={k}
              width={0.4}
              length={4}
              color={colors.active}
              attenuation={(t) => t * t}
            >
              <mesh
                ref={(m) => {
                  anchorRefs.current[k] = m;
                }}
              >
                <sphereGeometry args={[0.015, 8, 8]} />
                <meshBasicMaterial color={colors.active} fog={false} />
              </mesh>
            </Trail>
          ))}
        </group>
      )}
    </group>
  );
}
