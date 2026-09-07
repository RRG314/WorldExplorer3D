import bpy
import bmesh
import sys


def argument_value(flag):
    args = sys.argv[sys.argv.index("--") + 1:]
    if flag not in args:
        raise RuntimeError(f"Missing {flag}")
    return args[args.index(flag) + 1]


source = argument_value("--input")
target = argument_value("--output")

bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.wm.obj_import(filepath=source)

mesh_objects = [obj for obj in bpy.context.scene.objects if obj.type == "MESH"]
for obj in mesh_objects:
    bpy.context.view_layer.objects.active = obj
    obj.select_set(True)
    bpy.ops.object.mode_set(mode="EDIT")
    bpy.ops.mesh.select_all(action="SELECT")
    bpy.ops.mesh.remove_doubles(threshold=0.0005)
    mesh = bmesh.from_edit_mesh(obj.data)
    unseen = set(mesh.faces)
    components = []
    while unseen:
        seed = unseen.pop()
        component = {seed}
        stack = [seed]
        while stack:
            face = stack.pop()
            for edge in face.edges:
                for linked in edge.link_faces:
                    if linked in unseen:
                        unseen.remove(linked)
                        component.add(linked)
                        stack.append(linked)
        components.append(component)
    minimum_faces = max(40, int(sum(len(component) for component in components) * 0.001))
    largest_component = max(components, key=len, default=set())
    small_faces = [face for component in components if component is not largest_component and len(component) < minimum_faces for face in component]
    if small_faces:
        bmesh.ops.delete(mesh, geom=small_faces, context="FACES")
        bmesh.update_edit_mesh(obj.data)
    bpy.ops.mesh.delete_loose(use_verts=True, use_edges=True, use_faces=False)
    try:
        bpy.ops.mesh.normals_make_consistent(inside=False)
    except Exception:
        pass
    bpy.ops.object.mode_set(mode="OBJECT")
    obj.select_set(False)

triangle_count = sum(len(obj.data.loop_triangles) or len(obj.data.polygons) * 2 for obj in mesh_objects)
target_triangles = 450000
if triangle_count > target_triangles:
    ratio = max(0.02, target_triangles / triangle_count)
    for obj in mesh_objects:
        bpy.context.view_layer.objects.active = obj
        obj.select_set(True)
        modifier = obj.modifiers.new(name="WorldExplorerRuntimeDecimate", type="DECIMATE")
        modifier.ratio = ratio
        modifier.use_collapse_triangulate = True
        bpy.ops.object.modifier_apply(modifier=modifier.name)
        obj.select_set(False)

for image in bpy.data.images:
    if image.size[0] > 2048 or image.size[1] > 2048:
        scale = min(2048 / image.size[0], 2048 / image.size[1])
        image.scale(max(1, int(image.size[0] * scale)), max(1, int(image.size[1] * scale)))

bpy.ops.object.select_all(action="SELECT")
if hasattr(bpy.ops.object, "shade_smooth_by_angle"):
    bpy.ops.object.shade_smooth_by_angle()
else:
    bpy.ops.object.shade_smooth()
bpy.ops.export_scene.gltf(
    filepath=target,
    export_format="GLB",
    export_apply=True,
    export_materials="EXPORT",
    export_images="AUTO",
    export_cameras=False,
    export_lights=False,
    export_animations=False,
)
