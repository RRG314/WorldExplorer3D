"""Offline Blender 4.5 derivative of Neubi's pinned CC0 M3 racing exterior.

Run Blender with --background --factory-startup --disable-autoexec, the original
bmw_m3_gt3_cycles.blend, then --python this script -- EMPTY_OUTPUT_DIRECTORY.
The supplied Game.py, lighting scene and reference/logo images are never run or
exported. The prepared interior is an original racing-cabin interpretation,
not a claim to reproduce a particular factory cockpit or homologation.
"""
import hashlib
import json
import math
from pathlib import Path
import sys

import bpy
from mathutils import Matrix, Vector

SOURCE_HASH = 'd13417a226c00ddfd1b14711431f66cbe98d588412e1c74ca77d91f6f829a143'
LICENSE_HASH = 'cbe923e24e81ab0e0b782f185e910bd4f027ebb9ab3272a9ca02c92e32e328ea'
ARCHIVE_HASH = 'e2193befa1da6a7394b3eadee3704727290a1c2520108fe909827c6052e0417f'
source = Path(bpy.data.filepath)
license_bytes = source.with_name('BLENDSWAP_LICENSE.txt').read_bytes()
if hashlib.sha256(source.read_bytes()).hexdigest() != SOURCE_HASH:
    raise RuntimeError('Unreviewed source blend')
if hashlib.sha256(license_bytes).hexdigest() != LICENSE_HASH:
    raise RuntimeError('Unreviewed source licence')
out = Path(sys.argv[sys.argv.index('--') + 1])
out.mkdir(parents=True, exist_ok=True)
if list(out.iterdir()):
    raise RuntimeError('Output must be empty; preserve original and failed derivatives')

names = {'Car_Body', 'Car_glass', 'chrome_teile', 'Felge_FR', 'Felge_FR.001',
         'Felge_FR.002', 'Felge_FR.003', 'Lampenfassung', 'Lampenfassung_sicht',
         'plastik_teile', 'rueckleuchten', 'Spiegel'}
original = [bpy.data.objects[n] for n in sorted(names)]
deps = bpy.context.evaluated_depsgraph_get()
evaluated = [(o, o.evaluated_get(deps)) for o in original]
corners = [e.matrix_world @ v.co for _, e in evaluated for v in e.data.vertices]
lo = Vector([min(v[i] for v in corners) for i in range(3)])
hi = Vector([max(v[i] for v in corners) for i in range(3)])
# A uniform 4.634 m exterior retains the artist's proportions, including its
# aerodynamic surfaces. This is a normalized presentation envelope.
scale = 4.634 / (hi.y - lo.y)
center = Vector(((lo.x + hi.x) / 2, (lo.y + hi.y) / 2, lo.z))
normalize = Matrix.Scale(scale, 4) @ Matrix.Translation(-center)
prepared = []

def clear_extras(data):
    for key in list(data.keys()):
        del data[key]

def material(name, color, rough=.5, metal=0, alpha=1):
    m = bpy.data.materials.new('Race_' + name)
    m.use_nodes = True
    bsdf = m.node_tree.nodes.get('Principled BSDF')
    bsdf.inputs['Base Color'].default_value = (*color, 1)
    bsdf.inputs['Roughness'].default_value = rough
    bsdf.inputs['Metallic'].default_value = metal
    bsdf.inputs['Alpha'].default_value = alpha
    m.diffuse_color = (*color, alpha)
    if alpha < 1:
        m.surface_render_method = 'DITHERED'
    return m

paint = material('Paint', (.73, .77, .81), .29, .42)
rubber = material('Tyre', (.018, .02, .023), .94)
metal = material('Machined_Aluminium', (.36, .40, .44), .3, .85)
dark_metal = material('Dark_Metal', (.13, .15, .17), .46, .65)
carbon = material('Cabin_Carbon', (.018, .022, .028), .65, .12)
cloth = material('Seat_Fabric', (.035, .039, .045), .98)
red = material('Harness_Red', (.45, .012, .008), .85)
glass = material('Windows', (.17, .23, .27), .12, .03, .15)
tail = material('TailLights', (.43, .004, .008), .3, .15)
lamp = material('Headlights', (.77, .85, .89), .2, .3)
yellow = material('Switch_Yellow', (.8, .53, .015), .6)
blue = material('Switch_Blue', (.02, .15, .55), .6)
old_materials = {'Material': paint, 'plastic': carbon, 'Reifen': rubber,
                 'chrome': metal, 'chrome_matt': dark_metal,
                 'Chrome_red': red, 'Bremsscheibe': dark_metal,
                 'Blinker': tail, 'LIght': lamp, 'glass': glass}

def register(obj, mat=None):
    clear_extras(obj)
    if obj.data:
        clear_extras(obj.data)
    if mat:
        obj.data.materials.clear()
        obj.data.materials.append(mat)
    prepared.append(obj)
    return obj

def empty(name, at=(0, 0, 0)):
    obj = bpy.data.objects.new(name, None)
    bpy.context.scene.collection.objects.link(obj)
    obj.location = at
    return register(obj)

wheel_layout = []
wheel_steering = []
for original_obj, evaluated_obj in evaluated:
    mesh = bpy.data.meshes.new_from_object(evaluated_obj, depsgraph=deps)
    mesh.transform(normalize @ evaluated_obj.matrix_world)
    clear_extras(mesh)
    obj = bpy.data.objects.new('Source_' + original_obj.name, mesh)
    bpy.context.scene.collection.objects.link(obj)
    material_names = [m.name if m else '' for m in mesh.materials]
    mesh.materials.clear()
    for name in material_names:
        mesh.materials.append(old_materials[name])
    register(obj)
    obj['sourcePart'] = original_obj.name
    if not original_obj.name.startswith('Felge_FR'):
        continue
    points = [v.co for v in mesh.vertices]
    minimum = Vector([min(v[i] for v in points) for i in range(3)])
    maximum = Vector([max(v[i] for v in points) for i in range(3)])
    pivot = (minimum + maximum) / 2
    radius = (maximum.z - minimum.z) / 2
    key = ('front' if pivot.y < 0 else 'rear') + ('-right' if pivot.x > 0 else '-left')
    steer = empty(key + '-steer', pivot)
    steer['transportPart'] = 'wheel-steering'
    steer['front'] = pivot.y < 0
    wheel_steering.append(steer)
    spin = empty(key + '-spin')
    spin.parent = steer
    spin['transportPart'] = 'wheel-spin'
    spin['radiusMeters'] = radius
    # Fixed calipers must not spin with the rim and brake disc.
    fixed = [p for p in mesh.polygons if material_names[p.material_index] == 'Chrome_red']
    if fixed:
        fixed_ids = {p.index for p in fixed}
        def subset(polygons, name):
            used = sorted({i for p in polygons for i in p.vertices})
            index = {old: new for new, old in enumerate(used)}
            result = bpy.data.meshes.new(name)
            result.from_pydata([mesh.vertices[i].co - pivot for i in used], [],
                              [[index[i] for i in p.vertices] for p in polygons])
            result.materials.extend(mesh.materials)
            for a, b in zip(result.polygons, polygons):
                a.material_index, a.use_smooth = b.material_index, b.use_smooth
            return result
        fixed_obj = bpy.data.objects.new(key + '-caliper', subset(fixed, key + '-caliper'))
        bpy.context.scene.collection.objects.link(fixed_obj)
        register(fixed_obj)
        fixed_obj.parent = steer
        fixed_obj['transportPart'] = 'wheel-caliper'
        obj.data = subset([p for p in mesh.polygons if p.index not in fixed_ids], key + '-wheel')
    else:
        mesh.transform(Matrix.Translation(-pivot))
    obj.parent = spin
    wheel_layout.append({'id': key, 'position': [pivot.x, pivot.z, -pivot.y], 'radius': radius})

# Author original cabin geometry in the game's X/right, Y/up, Z/forward frame.
def xyz(p):
    return (p[0], -p[2], p[1])

def box(name, at, size, mat, bevel=.01):
    bpy.ops.mesh.primitive_cube_add(size=1, location=xyz(at))
    obj = bpy.context.object
    obj.name = name
    obj.dimensions = (size[0], size[2], size[1])
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    if bevel:
        b = obj.modifiers.new('Prepared edge radii', 'BEVEL')
        b.width, b.segments = bevel, 2
        bpy.ops.object.modifier_apply(modifier=b.name)
    return register(obj, mat)

def tube(name, a, b, radius, mat, vertices=12):
    start, end = Vector(xyz(a)), Vector(xyz(b))
    bpy.ops.mesh.primitive_cylinder_add(vertices=vertices, radius=radius, depth=(end-start).length,
                                       location=(start+end)/2)
    obj = bpy.context.object
    obj.name = name
    obj.rotation_euler = (end-start).to_track_quat('Z', 'Y').to_euler()
    for p in obj.data.polygons:
        p.use_smooth = True
    return register(obj, mat)

def surface(name, points, faces, mat):
    mesh = bpy.data.meshes.new(name)
    mesh.from_pydata([xyz(p) for p in points], [], faces)
    obj = bpy.data.objects.new(name, mesh)
    bpy.context.scene.collection.objects.link(obj)
    return register(obj, mat)

for steer, wheel in zip(wheel_steering, wheel_layout):
    if any(child.get('transportPart') == 'wheel-caliper' for child in steer.children):
        continue
    # The original source's caliper material slots are unused. Add a fixed
    # original caliper behind each authored rotating rim/disc assembly.
    caliper = box(wheel['id']+'-caliper',
                  (-.09 if wheel['position'][0] > 0 else .09, .07, .15),
                  (.055, .14, .12), red, .012)
    caliper.parent = steer
    caliper['transportPart'] = 'wheel-caliper'

box('Cabin floor', (0, .25, -.03), (1.42, .035, 1.78), dark_metal)
for i in range(12):
    box('Pressed floor rib', (-.62+i*.112, .273, -.12), (.017, .012, 1.28), metal, .004)
box('Transmission tunnel', (0, .39, -.03), (.22, .24, 1.48), carbon, .04)
box('Rear cabin bulkhead', (0, .66, -.79), (1.38, .73, .045), carbon)
for side in [-1, 1]:
    box('Inner door panel', (side*.735, .61, -.06), (.035, .47, 1.22), carbon)
    tube('Door pull', (side*.70, .73, -.03), (side*.70, .73, .15), .014, metal)
    for a, b in [((side*.65, .31, -.66),(side*.65, 1.10, -.66)),
                 ((side*.65, 1.10, -.66),(side*.61, 1.12, .17)),
                 ((side*.61, 1.12, .17),(side*.68, .42, .69)),
                 ((side*.68, .42, .69),(side*.65, .32, -.66))]:
        tube('Safety cage side', a, b, .022, metal)
    tube('Door cage diagonal', (side*.65, .33, -.65), (side*.68, .70, .52), .02, metal)
for z, y in [(-.66, 1.10), (.17, 1.12)]:
    tube('Safety cage crossmember', (-.65, y, z), (.65, y, z), .022, metal)
tube('Rear diagonal brace', (-.65, .32, -.66), (.65, 1.10, -.66), .022, metal)

# Sculpted bucket sections retain a visible seat shell and raised bolsters.
seat_x = .34
box('Seat cushion', (seat_x, .40, -.29), (.39, .11, .46), cloth, .045)
back = box('Seat back shell', (seat_x, .71, -.56), (.42, .66, .075), carbon, .025)
back.rotation_euler.x = -.15
pad = box('Seat back padding', (seat_x, .71, -.50), (.29, .55, .07), cloth, .025)
pad.rotation_euler.x = -.15
box('Seat head restraint', (seat_x, 1.02, -.59), (.28, .17, .12), cloth, .035)
for side in [-1, 1]:
    box('Seat thigh bolster', (seat_x+side*.205, .47, -.29), (.075, .16, .48), carbon, .025)
    box('Seat shoulder bolster', (seat_x+side*.205, .88, -.54), (.10, .23, .21), carbon, .028)
    box('Harness shoulder webbing', (seat_x+side*.085, .75, -.447), (.047, .48, .012), red, .005)
    box('Harness lap webbing', (seat_x+side*.105, .465, -.24), (.18, .015, .047), red, .005)
box('Harness buckle', (seat_x, .48, -.20), (.058, .027, .065), metal, .009)

box('Dashboard upper padded rail', (0, .80, .77), (1.39, .14, .32), carbon, .035)
box('Driver binnacle', (seat_x, .96, .63), (.34, .16, .10), dark_metal, .022)
display = material('Driver_Display', (1, 1, 1), .75)
image = bpy.data.images.new('Original racing display base', width=8, height=8)
image.pixels = [.008, .014, .018, 1] * 64
tex = display.node_tree.nodes.new('ShaderNodeTexImage')
tex.image = image
shader = display.node_tree.nodes.get('Principled BSDF')
display.node_tree.links.new(tex.outputs['Color'], shader.inputs['Base Color'])
display.node_tree.links.new(tex.outputs['Color'], shader.inputs['Emission Color'])
shader.inputs['Emission Strength'].default_value = .45
panel = surface('Driver telemetry display',
                [(seat_x-.142,.903,.573),(seat_x-.142,1.017,.573),
                 (seat_x+.142,1.017,.573),(seat_x+.142,.903,.573)], [(0,1,2,3)], display)
uv = panel.data.uv_layers.new()
# Viewed forward from the seat, positive vehicle X appears on screen left.
for loop, value in zip(panel.data.loops, [(1,0),(1,1),(0,1),(0,0)]):
    uv.data[loop.index].uv = value
panel['vehicleInstrumentDisplay'] = True

steering_at = (.34, .76, .40)
bpy.ops.mesh.primitive_torus_add(major_segments=48, minor_segments=8, major_radius=.155,
                                minor_radius=.017, location=xyz(steering_at),
                                rotation=(math.pi/2+.16,0,0))
rim = register(bpy.context.object, rubber)
rim.name = 'Race steering wheel rim'
for polygon in rim.data.polygons:
    polygon.use_smooth = True
box('Steering wheel boss', steering_at, (.082,.082,.04), carbon, .013)
for angle in [0, 2.1, 4.2]:
    tube('Steering wheel spoke', steering_at,
         (.34+math.sin(angle)*.142,.76+math.cos(angle)*.142,.40), .013, dark_metal)
for side in [-1, 1]:
    box('Shift paddle', (.34+side*.105,.77,.435), (.035,.11,.012), metal, .008)
    for j, mat in enumerate([red,yellow,blue]):
        tube('Steering wheel control', (.34+side*.075,.79-j*.025,.375),
             (.34+side*.075,.79-j*.025,.36), .008, mat)
tube('Steering column', (.34,.76,.42), (.34,.63,.74), .025, dark_metal)
box('Switch console', (-.16,.58,.43), (.27,.24,.07), carbon, .018)
for i in range(6):
    x, y = -.23+(i%3)*.07, .52+(i//3)*.095
    tube('Console switch bezel',(x,y,.386),(x,y,.375),.016,metal)
    tube('Console switch',(x,y,.373),(x,y,.357),.009,[red,yellow,blue][i%3])
tube('Fire extinguisher', (-.43,.34,-.20), (-.43,.34,.17), .065, red, 24)
for z in [-.13,.10]:
    box('Extinguisher strap', (-.43,.34,z), (.145,.13,.017), metal, .008)
tube('Fire bottle valve',(-.43,.34,.18),(-.43,.34,.24),.022,metal)
for x in [.23,.36,.49]:
    box('Pedal pad',(x,.33,.70),(.075,.12,.025),metal,.008)

# Export only the reviewed derivative selection. Source scene scripts, cameras,
# reference maps, logos and unreviewed extras remain outside the runtime GLB.
bpy.ops.object.select_all(action='DESELECT')
for obj in prepared:
    obj.select_set(True)
    obj.hide_render = False
    obj.hide_set(False)
bpy.context.view_layer.objects.active = prepared[0]
bpy.ops.export_scene.gltf(filepath=str(out/'scene.glb'), export_format='GLB',
    use_selection=True, export_apply=True, export_extras=True, export_yup=True,
    export_animations=False, export_cameras=False, export_lights=False)
(out/'license.txt').write_bytes(license_bytes)
(out/'intake.json').write_text(json.dumps({
    'archiveSha256': ARCHIVE_HASH, 'blendSha256': SOURCE_HASH,
    'licenseSha256': LICENSE_HASH, 'license': 'CC0-1.0',
    'sourceUrl': 'https://blendswap.com/blend/3697', 'author': 'Neubi',
    'label': 'BMW M3 E92 race car', 'lengthMeters': 4.634,
    'wheelLayout': wheel_layout, 'driverEyeGroundMeters': [.34,1.025,.02],
    'modifications': 'Original racing exterior; uniform metric normalization; '
        'prepared PBR materials without source reference/logo maps; four rigid '
        'wheel assemblies and fixed calipers; original racing-cabin interpretation '
        'with seat, harness, safety cage, dashboard, controls and telemetry screen. '
        'No source gameplay code or factory-cockpit/homologation claim.'
}, indent=2)+'\n')
print('PREPARED_RACING_EXTERIOR', json.dumps({'objects':len(prepared),'wheels':len(wheel_layout)}))
