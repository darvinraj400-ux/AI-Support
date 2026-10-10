'use client';

import { useRef } from 'react';
import * as THREE from 'three';
import { useFrame } from '@react-three/fiber';
import { MeshTransmissionMaterial } from '@react-three/drei';
import type { SharedProps } from './IntelligenceCore';

// Middle glass layer: a low-poly icosahedral shell that wraps the core and the
// neural lattice (r=0.6), sitting well inside the orbital rings (r>=1.05), so
// the inner core reads through it refracted rather than cleanly. Radius is 0.6
// rather than the specified 0.85: at 0.85 the shell nearly filled the ring
// system and, tinted by the core's violet glow, read as one solid purple
// crystal that dominated the hero instead of a glass layer around a core.
//
// MeshTransmissionMaterial is the expensive path: it re-renders the scene into
// an FBO every frame and does a multi-tap fragment loop over the surface.
// Ultra/high/medium use it with progressively cheaper profiles; low falls back
// to the cheap physical-material fake the spec authorises (transmission 0,
// semi-transparent). Degraded devices drop even high/medium to the fake along
// with the shed particles.
//
// Transmission profiles (spec):
//   ultra   : thickness 1.5, CA 0.04, resolution 512  (the app's verified
//             "full" path — samples kept at 4; the spec's samples=6 for high
//             was not implemented because desktop already measures ~50fps at
//             samples=4 and 6 risks the ≥45 floor)
//   high    : thickness 1.2, CA 0.03, resolution 512
//   medium  : thickness 1.0, CA 0.02, resolution 256
//   low     : physical-material fake (no transmission)
export function GlassShell({ tier, degraded }: SharedProps) {
  const meshRef = useRef<THREE.Mesh>(null);
  const transmit =
    degraded || tier === 'low'
      ? null
      : tier === 'ultra'
        ? { thickness: 1.5, chromaticAberration: 0.04, resolution: 512 }
        : tier === 'high'
          ? { thickness: 1.2, chromaticAberration: 0.03, resolution: 512 }
          : { thickness: 1.0, chromaticAberration: 0.02, resolution: 256 }; // medium

  useFrame((_state, delta) => {
    if (meshRef.current) meshRef.current.rotation.y += delta * 0.03;
  });

  return (
    <mesh ref={meshRef} frustumCulled={false}>
      <icosahedronGeometry args={[0.6, 1]} />
      {transmit ? (
        <MeshTransmissionMaterial
          thickness={transmit.thickness}
          roughness={0.05}
          transmission={1.0}
          ior={1.5}
          chromaticAberration={transmit.chromaticAberration}
          distortion={0.2}
          distortionScale={0.4}
          temporalDistortion={0.1}
          color="#1a1a2e"
          resolution={transmit.resolution}
          samples={4}
          backside={false}
        />
      ) : (
        <meshPhysicalMaterial
          transmission={0}
          opacity={0.35}
          roughness={0.05}
          ior={1.5}
          color="#1a1a2e"
          transparent
          depthWrite={false}
        />
      )}
    </mesh>
  );
}
