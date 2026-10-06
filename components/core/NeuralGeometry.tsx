'use client';

import { useEffect, useMemo, useRef } from 'react';
import * as THREE from 'three';
import { useFrame } from '@react-three/fiber';
import { thinkBump, type SharedProps } from './IntelligenceCore';

// Faint icosahedral computational structure. Mostly invisible in idle,
// briefly more present during thinking. Rotates slowly, independent of
// the orbital system.
const COUNT = 42; // icosahedron detail 1 vertices

export function NeuralGeometry({ stateRef, thinkStartRef }: SharedProps) {
  const groupRef = useRef<THREE.Group>(null);
  const edgeRef = useRef<THREE.MeshBasicMaterial>(null);
  const nodeRef = useRef<THREE.InstancedMesh>(null);
  const nodeMatRef = useRef<THREE.MeshBasicMaterial>(null);

  // Unique vertex positions, computed once.
  const verts = useMemo(() => {
    const geo = new THREE.IcosahedronGeometry(0.6, 1);
    const pos = geo.getAttribute('position') as THREE.BufferAttribute;
    const seen = new Set<string>();
    const out: number[][] = [];
    for (let i = 0; i < pos.count && out.length < COUNT; i++) {
      const key = `${pos.getX(i).toFixed(3)},${pos.getY(i).toFixed(3)},${pos.getZ(i).toFixed(3)}`;
      if (seen.has(key)) continue;
      seen.add(key);
      out.push([pos.getX(i), pos.getY(i), pos.getZ(i)]);
    }
    geo.dispose();
    return out;
  }, []);

  useEffect(() => {
    const mesh = nodeRef.current;
    if (!mesh) return;
    const m = new THREE.Matrix4();
    verts.forEach(([x, y, z], i) => {
      m.makeTranslation(x, y, z);
      mesh.setMatrixAt(i, m);
    });
    mesh.instanceMatrix.needsUpdate = true;
  }, [verts]);

  useFrame((state, delta) => {
    const thinking = stateRef.current === 'thinking';
    const ts = (performance.now() - thinkStartRef.current) / 1000;
    const bump = thinking ? thinkBump(ts) : 0;

    if (groupRef.current) {
      groupRef.current.rotation.y += delta * 0.05;
      groupRef.current.rotation.x += delta * 0.013;
    }
    if (edgeRef.current) {
      edgeRef.current.opacity = 0.05 + 0.12 * bump;
    }
    if (nodeMatRef.current) {
      nodeMatRef.current.opacity = 0.1 + 0.22 * bump;
    }
  });

  return (
    <group ref={groupRef}>
      <mesh>
        <icosahedronGeometry args={[0.6, 1]} />
        <meshBasicMaterial
          ref={edgeRef}
          color="#8b5cf6"
          wireframe
          transparent
          opacity={0.05}
        />
      </mesh>
      <instancedMesh ref={nodeRef} args={[undefined, undefined, COUNT]} frustumCulled={false}>
        <sphereGeometry args={[0.014, 8, 8]} />
        <meshBasicMaterial ref={nodeMatRef} color="#a78bfa" transparent opacity={0.1} />
      </instancedMesh>
    </group>
  );
}
