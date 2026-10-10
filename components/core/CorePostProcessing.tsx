'use client';

import { Bloom, ChromaticAberration, EffectComposer, Noise, Vignette } from '@react-three/postprocessing';
import { BlendFunction } from 'postprocessing';

// Post stack driven by a degradation stage (Section 8):
//   stage 0 = full     : Bloom -> ChromaticAberration -> Vignette -> Noise
//   stage 1 = lighter  : Bloom -> Vignette -> Noise   (chromatic aberration dropped)
//   stage 2 = cheapest : Bloom only
//
// Vignette darkness is tier-driven (spec): 0.65 on ultra/high, 0.55 on
// medium. Low never reaches the vignette (stage 2 = bloom only), so the
// value passed for low is unused.
//
// DepthOfField is deliberately absent. Two verified reasons:
//   1. Its mask shader writes alpha from the circle-of-confusion, so fully
//      transparent background pixels become opaque. On an alpha canvas that
//      paints an opaque black rectangle behind the hero and kills the CSS
//      radial glow Section 9 explicitly requires.
//   2. In postprocessing 6.39.5 `focalLength` is deprecated and silently maps
//      to a world-space `focusRange`, so the documented values would blur the
//      entire scene instead of isolating a focal plane.
//
// multisampling={0} is as specified: with four effects in the chain the MSAA
// resolve is the single most expensive line in the budget. The trade is
// slightly harder geometry edges, accepted deliberately.
//
// Returns null (rather than <EffectComposer enabled={false}>) because mounting
// the composer forces gl.toneMapping = NoToneMapping and allocates the render
// targets; both are only released on a real unmount. With a stage ladder the
// composer stays mounted for the scene lifetime and we vary its children.
export function CorePostProcessing({
  stage,
  darkness,
}: {
  stage: 0 | 1 | 2;
  darkness: number;
}) {
  return (
    <EffectComposer multisampling={0}>
      <Bloom
        intensity={0.8}
        luminanceThreshold={0.3}
        luminanceSmoothing={0.5}
        mipmapBlur
        radius={0.6}
      />
      {stage < 1 && (
        <ChromaticAberration
          offset={[0.0008, 0.0008]}
          radialModulation={false}
          modulationOffset={0.3}
        />
      )}
      {stage < 2 && (
        <>
          <Vignette eskil={false} offset={0.25} darkness={darkness} />
          <Noise opacity={0.025} blendFunction={BlendFunction.OVERLAY} />
        </>
      )}
    </EffectComposer>
  );
}
