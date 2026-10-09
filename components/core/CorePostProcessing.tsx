'use client';

import { Bloom, EffectComposer } from '@react-three/postprocessing';

// Bloom only. Wrapped so the whole pass can be removed with one line.
//
// Returns null (rather than rendering <EffectComposer enabled={false}>) because
// EffectComposer takes over tone mapping while mounted: it forces
// gl.toneMapping = NoToneMapping on mount and restores the previous value only
// on unmount. `enabled=false` keeps that override and keeps the render targets
// allocated, so both the ACES look and the GPU memory come back only when we
// actually unmount — which is exactly what we want on the low-FPS path.
export function CorePostProcessing({ enabled }: { enabled: boolean }) {
  if (!enabled) return null;
  return (
    <EffectComposer>
      <Bloom
        intensity={0.6}
        luminanceThreshold={0.35}
        luminanceSmoothing={0.4}
        mipmapBlur
      />
    </EffectComposer>
  );
}
