# Three.js r128 planar water

Source: https://github.com/mrdoob/three.js/tree/r128/examples/js/objects
MIT license retained alongside these files. Source and adapted hashes are recorded.

Adaptations: explicit constructor factories instead of global THREE mutation;
reflection/refraction cameras inherit the venue camera layers; explicit release
of both render targets and auxiliary materials; water flow takes simulation time
from the existing game update instead of creating a wall clock; offscreen passes
render in linear color with no repeated tone mapping; exception-safe restoration
of renderer target, encoding, tone mapping, XR and shadow state. Upstream planar clipping and flow blending remain; the projection and two-sided
optics adaptations are described below.

The app supplies its own periodic ripple normals; no upstream example textures
or remote runtime requests are used. This is a local aquarium optical effect,
not a replacement for outdoor water, weather, swimming or vessel physics.

The contained-tank adapter also supports viewing the surface from below: both
clip planes face the viewing side, the shader normal faces the eye, and the
water-to-air path uses total internal reflection for IOR 1.333. Offscreen targets
use RGBA for portable framebuffer readback and automated image validation.

The two-sided surface now uses exact dielectric Fresnel (derived IOR from F0), rather than Schlick followed by a discontinuous critical-angle cutoff. Aquarium-specific polygon attenuation and the reflected surface-to-window water leg are applied by the owning aquarium-water module.

October 12 underside repair: reflection and refraction each use their actual
virtual-camera projection. Ripple normals transform from the water mesh basis.
Optional depth textures reconstruct the distance to visible scene geometry,
which drives reflected/refracted ray reprojection instead of a fixed world-X/Z
screen offset. A narrow five-tap reflection filter reduces sharp surface shimmer.
The two original color passes/targets remain; depth textures replace their depth
renderbuffers. Unsupported depth-texture devices use camera-projected normal
distortion. This is bounded planar optics, not multi-bounce path tracing; warped
rays that leave the captured view fade to the unperturbed sample.

Enclosed venues may exclude the scene background from the two optical passes.
Their transparent clear color preserves a coverage mask at clipped tank edges;
the surface unpremultiplies filtered samples and retains coverage. Background
and renderer clear color/alpha restore even when an auxiliary render throws.
This prevents the outdoor clear color leaking as a bright underwater seam.
