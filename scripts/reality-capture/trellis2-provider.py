"""TRELLIS.2 adapter for the existing capture worker, not a web/GPU service.

Run inside the configured TRELLIS.2 CUDA environment. Dependencies and model
licenses remain the operator's responsibility; this adapter imposes no license lock.
Upstream API references are recorded in REALITY_CAPTURE_AR_INTEGRATION_PLAN.md.
"""
import argparse
import os


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--mode", choices=("image", "texture"), required=True)
    parser.add_argument("--image", required=True)
    parser.add_argument("--mesh")
    parser.add_argument("--output", required=True)
    args = parser.parse_args()
    if args.mode == "texture" and not args.mesh:
        parser.error("texture mode requires --mesh")

    os.environ.setdefault("PYTORCH_CUDA_ALLOC_CONF", "expandable_segments:True")
    from PIL import Image
    import torch
    if not torch.cuda.is_available():
        raise RuntimeError("TRELLIS.2 requires the configured remote CUDA worker, not the game device")
    model = os.environ.get("WE3D_TRELLIS_MODEL", "microsoft/TRELLIS.2-4B")
    with Image.open(args.image) as source:
        source.load()
        image = source.copy()
    with torch.inference_mode():
        if args.mode == "texture":
            import trimesh
            from trellis2.pipelines import Trellis2TexturingPipeline
            pipeline = Trellis2TexturingPipeline.from_pretrained(model, config_file="texturing_pipeline.json")
            pipeline.cuda()
            mesh = trimesh.load(args.mesh, force="mesh")
            result = pipeline.run(mesh, image)
        else:
            import o_voxel
            from trellis2.pipelines import Trellis2ImageTo3DPipeline
            pipeline = Trellis2ImageTo3DPipeline.from_pretrained(model)
            pipeline.cuda()
            mesh = pipeline.run(image)[0]
            mesh.simplify(16777216)
            result = o_voxel.postprocess.to_glb(
                vertices=mesh.vertices, faces=mesh.faces, attr_volume=mesh.attrs,
                coords=mesh.coords, attr_layout=mesh.layout, voxel_size=mesh.voxel_size,
                aabb=[[-0.5, -0.5, -0.5], [0.5, 0.5, 0.5]],
                decimation_target=450000, texture_size=2048, remesh=True,
                remesh_band=1, remesh_project=0, verbose=True,
            )
        result.export(args.output, extension_webp=True)


if __name__ == "__main__":
    main()
