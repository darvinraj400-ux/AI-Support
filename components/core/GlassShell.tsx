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
// an FBO every frame and does a multi-tap fragment loop over the surface. That
// is only affordable on the high tier, so medium/low fall back to the cheap
// physical-material fake the spec authorises (transmission 0, semi-transparent).
// The bounding props (resolution/samples/backside) keep the high-tier path from
// allocating a full-resolution half-float buffer and from doing a second
// backside pass.
export function GlassShell({ tier, degraded }: SharedProps) {
  const meshRef = useRef<THREE.Mesh>(null);
  // Transmission re-renders the whole scene every frame; once we are degraded
  // (sustained sub-40fps) even a high-tier device falls back to the cheap
  // physical-material fake along with the shed particles.
  const high = tier === 'high' && !degraded;

  useFrame((_state, delta) => {
    if (meshRef.current) meshRef.current.rotation.y += delta * 0.03;
  });

  return (
    <mesh ref={meshRef} frustumCulled={false}>
      <icosahedronGeometry args={[0.6, 1]} />
      {high ? (
        <MeshTransmissionMaterial
          thickness={1.5}
          roughness={0.05}
          transmission={1.0}
          ior={1.5}
          chromaticAberration={0.04}
          distortion={0.2}
          distortionScale={0.4}
          temporalDistortion={0.1}
          color="#1a1a2e"
          resolution={512}
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
