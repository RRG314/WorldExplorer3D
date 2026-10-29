"""Add an original interpreted Carrera driving cabin to the pinned exterior.

Blender 4.5: --background --factory-startup --disable-autoexec --python SCRIPT
-- EXTERIOR_DIRECTORY EMPTY_OUTPUT_DIRECTORY. The complete model derivative
retains CC-BY-SA-4.0. This is not a factory-interior or GT3 identity claim.
"""
import hashlib
import json
import math
from pathlib import Path
import sys
import bpy
from mathutils import Vector
from mathutils.bvhtree import BVHTree

source, out = [Path(p) for p in sys.argv[sys.argv.index('--')+1:]]
original = source/'scene.glb'
if hashlib.sha256(original.read_bytes()).hexdigest() != '857b5ba83886b82f93681d98f982344106f359467899b33dd76ac85e899343eb':
    raise RuntimeError('Unreviewed Porsche exterior')
licence = (source/'license.txt').read_bytes()
if hashlib.sha256(licence).hexdigest() != '807197ef352fd72292e5a0f30b7edadc93d5c916a747f902ec87795ae8201d1a':
    raise RuntimeError('Unreviewed Porsche licence')
intake = json.loads((source/'intake.json').read_text())
if intake['archiveSha256'] != '57731111fbb0d6958df64454e9ba51939fefd39ab48e55f423a0bb2d76918454':
    raise RuntimeError('Unreviewed source archive')
out.mkdir(parents=True, exist_ok=True)
if list(out.iterdir()):
    raise RuntimeError('Output must be empty; preserve source and prior derivatives')
bpy.ops.object.select_all(action='SELECT')
bpy.ops.object.delete(use_global=False)
bpy.ops.import_scene.gltf(filepath=str(original))
prepared = list(bpy.context.scene.objects)
for obj in prepared:
    for key in list(obj.keys()):
        if key not in ['transportPart','front','radiusMeters','sourcePart']:
            del obj[key]

def xyz(p):
    return (p[0], -p[2], p[1])

def material(name, rgb, rough=.65, metal=0):
    result = bpy.data.materials.new('Carrera_' + name)
    result.use_nodes = True
    shader = result.node_tree.nodes.get('Principled BSDF')
    shader.inputs['Base Color'].default_value = (*rgb, 1)
    shader.inputs['Roughness'].default_value = rough
    shader.inputs['Metallic'].default_value = metal
    result.diffuse_color = (*rgb, 1)
    return result

leather = material('Black_Leather', (.023,.027,.031), .86)
upholstery = material('Seat_Leather', (.12,.135,.145), .8)
liner = material('Headliner', (.035,.037,.04), .98)
liner.use_backface_culling = True
metal = material('Satin_Aluminium', (.34,.37,.40), .32, .78)
dark = material('Dark_Trim', (.012,.016,.02), .5, .12)
red = material('Red_Controls', (.42,.01,.012), .6)

def register(obj, mat):
    prepared.append(obj)
    obj.data.materials.clear()
    obj.data.materials.append(mat)
    return obj

def box(name, at, size, mat, bevel=.015):
    bpy.ops.mesh.primitive_cube_add(size=1, location=xyz(at))
    obj = bpy.context.object
    obj.name = name
    obj.dimensions = (size[0], size[2], size[1])
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    if bevel:
        modifier = obj.modifiers.new('Prepared edge radius', 'BEVEL')
        modifier.width, modifier.segments = bevel, 4
        bpy.ops.object.modifier_apply(modifier=modifier.name)
    return register(obj, mat)

def tube(name, a, b, radius, mat, vertices=16):
    start, end = Vector(xyz(a)), Vector(xyz(b))
    bpy.ops.mesh.primitive_cylinder_add(vertices=vertices, radius=radius,
        depth=(end-start).length, location=(start+end)/2)
    obj = bpy.context.object
    obj.name = name
    obj.rotation_euler = (end-start).to_track_quat('Z','Y').to_euler()
    for polygon in obj.data.polygons:
        polygon.use_smooth = True
    return register(obj, mat)

def surface(name, points, faces, mat):
    mesh = bpy.data.meshes.new(name)
    mesh.from_pydata([xyz(p) for p in points], [], faces)
    obj = bpy.data.objects.new(name, mesh)
    bpy.context.scene.collection.objects.link(obj)
    return register(obj, mat)

box('Carpeted cabin floor', (0,.25,-.07), (1.36,.025,1.95), liner, .006)
box('Center tunnel', (0,.37,.04), (.23,.23,1.43), leather, .045)
box('Dashboard padded upper', (0,.77,.66), (1.40,.18,.37), leather, .055)
box('Dashboard lower', (0,.62,.71), (1.36,.21,.20), leather, .045)
box('Center console fascia', (-.025,.63,.415), (.24,.27,.055), dark, .02)
for y in [.53,.61,.69]:
    tube('Console rotary control',(-.09,y,.38),(-.09,y,.365),.017,metal)
    tube('Console rotary control',(.04,y,.38),(.04,y,.365),.017,metal)
for i in range(5):
    box('Console switch',(-.103+i*.038,.745,.38),(.025,.015,.012),red if i==2 else metal,.004)
tube('Gear selector stalk',(-.02,.47,.02),(-.02,.57,.02),.018,metal)
box('Leather gear selector',(-.02,.58,.02),(.065,.065,.10),leather,.025)
for side in [-1,1]:
    x = side*.34
    box('Sport seat cushion',(x,.40,-.40),(.43,.12,.49),upholstery,.048)
    back = box('Sport seat back',(x,.70,-.64),(.45,.59,.12),upholstery,.05)
    back.rotation_euler.x = -.13
    box('Seat head restraint',(x,1.015,-.69),(.245,.18,.13),upholstery,.048)
    for bolster in [-1,1]:
        box('Seat base bolster',(x+bolster*.205,.48,-.40),(.07,.17,.48),leather,.026)
        box('Seat back bolster',(x+bolster*.205,.73,-.59),(.07,.48,.15),leather,.024)
    box('Seat belt buckle',(x-side*.21,.47,-.40),(.035,.06,.04),red,.007)
    box('Small rear seat cushion',(x,.43,-1.03),(.37,.10,.27),upholstery,.035)
    box('Small rear seat back',(x,.68,-1.17),(.37,.40,.08),upholstery,.035)
    box('Padded inner door panel',(side*.735,.57,-.20),(.055,.45,1.20),leather,.025)
    box('Door armrest',(side*.685,.63,-.16),(.11,.07,.45),upholstery,.025)
    tube('Door handle',(side*.68,.74,.08),(side*.68,.74,.21),.012,metal)
    box('Sun visor',(side*.33,1.19,.19),(.29,.018,.12),liner,.008)

# Fit the inner lining below the actual retained roof, including its curved
# sides and windshield boundary. A guessed wide horizontal sheet protruded
# through the exterior; neither camera hiding nor double-sided paint fixes it.
bpy.context.view_layer.update()
roof_vertices=[]
roof_faces=[]
for obj in prepared:
    if obj.type!='MESH':
        continue
    paint_slots={i for i,m in enumerate(obj.data.materials) if m and m.name=='paint'}
    if not paint_slots:
        continue
    for polygon in obj.data.polygons:
        if polygon.material_index not in paint_slots:
            continue
        start=len(roof_vertices)
        roof_vertices.extend(obj.matrix_world @ obj.data.vertices[i].co for i in polygon.vertices)
        roof_faces.append(tuple(range(start,start+len(polygon.vertices))))
roof=BVHTree.FromPolygons(roof_vertices,roof_faces)
def roof_height(x,z):
    hit,normal,index,distance=roof.ray_cast(Vector((x,-z,2)),Vector((0,0,-1)),2)
    return hit.z if hit is not None and hit.z>1.1 else None
points=[]
for z in [-.78,-.60,-.40,-.20,0,.10]:
    widths=[]
    for side in [-1,1]:
        width=0
        for i in range(1,61):
            if roof_height(side*i*.01,z) is None:
                break
            width=i*.01
        widths.append(width)
    half_width=min(widths)-.015
    if half_width<.35:
        raise RuntimeError('Prepared lining has no continuous source roof')
    for step in [-1,-2/3,-1/3,0,1/3,2/3,1]:
        x=step*half_width
        height=roof_height(x,z)
        if height is None:
            raise RuntimeError('Prepared lining crossed a source roof opening')
        points.append((x,height-.018,z))
faces=[]
for row in range(5):
    for col in range(6):
        a=row*7+col
        faces.append((a,a+1,a+8,a+7))
surface('Prepared cloth headliner',points,faces,liner)

# Five circular faces occupy a single live atlas, with the center tachometer
# larger than its neighbours. Auxiliary temperature/fuel readings are explicitly
# unavailable, rather than invented engine or fuel telemetry.
seat_x=.33
scale=.54/512
dials=[(42,142,36),(130,136,50),(256,118,68),(382,136,50),(470,142,36)]
display = material('Five_Dial_Display',(1,1,1),.8)
shader=display.node_tree.nodes.get('Principled BSDF')
shader.inputs['Emission Color'].default_value=(1,1,1,1)
shader.inputs['Emission Strength'].default_value=.4
# Retain glTF UVs by exporting a nonuniform authored placeholder texture. A
# texture-free material lets exporters remove TEXCOORD_0 before runtime binding.
image=bpy.data.images.new('Original dial atlas placeholder',width=8,height=8)
pixels=[]
for y in range(8):
    for x in range(8):
        value=.025 if (x+y)%2 else .045
        pixels.extend((value,value+.01,value+.02,1))
image.pixels=pixels
texture=display.node_tree.nodes.new('ShaderNodeTexImage')
texture.image=image
display.node_tree.links.new(texture.outputs['Color'],shader.inputs['Base Color'])
display.node_tree.links.new(texture.outputs['Color'],shader.inputs['Emission Color'])
vertices=[]
triangles=[]
uvs=[]
for cx,cy,r in dials:
    wx,wy=seat_x+(256-cx)*scale,.94+(118-cy)*scale
    bpy.ops.mesh.primitive_torus_add(major_segments=48,minor_segments=6,
        major_radius=(r+2)*scale,minor_radius=.0025,
        location=xyz((wx,wy,.401)),rotation=(math.pi/2,0,0))
    bezel=register(bpy.context.object,metal)
    bezel.name='Instrument satin bezel'
    for polygon in bezel.data.polygons:
        polygon.use_smooth=True
    box('Instrument back shell',(wx,wy,.445),(r*2*scale,r*2*scale,.07),dark,.02)
    start=len(vertices)
    vertices.append((wx,wy,.398));uvs.append((cx/512,1-cy/256))
    for i in range(64):
        angle=i*math.tau/64
        px,py=cx+math.cos(angle)*r,cy+math.sin(angle)*r
        vertices.append((seat_x+(256-px)*scale,.94+(118-py)*scale,.398))
        uvs.append((px/512,1-py/256))
    for i in range(64):
        triangles.append((start,start+1+i,start+1+(i+1)%64))
screen=surface('Prepared five dial instrument faces',vertices,triangles,display)
uv=screen.data.uv_layers.new()
for loop in screen.data.loops:
    uv.data[loop.index].uv=uvs[loop.vertex_index]
screen['vehicleInstrumentDisplay']=True
screen['vehicleInstrumentStyle']='five-dial'

steering=(seat_x,.765,.18)
bpy.ops.mesh.primitive_torus_add(major_segments=64,minor_segments=10,
    major_radius=.159,minor_radius=.017,location=xyz(steering),rotation=(math.pi/2+.16,0,0))
rim=register(bpy.context.object,leather)
rim.name='Leather steering rim'
for polygon in rim.data.polygons:
    polygon.use_smooth=True
box('Steering center pad',steering,(.115,.095,.055),leather,.025)
for side in [-1,1]:
    box('Steering spoke',(seat_x+side*.102,.757,.18),(.09,.033,.022),metal,.009)
    box('Steering button',(seat_x+side*.097,.763,.159),(.025,.015,.012),dark,.003)
box('Steering lower spoke',(seat_x,.668,.18),(.035,.10,.025),metal,.009)
tube('Steering column',(seat_x,.765,.21),(seat_x,.65,.57),.024,dark)
for x in [.23,.35,.47]:
    box('Pedal pad',(x,.32,.65),(.075,.12,.025),metal,.009)

bpy.ops.object.select_all(action='DESELECT')
for obj in prepared:
    obj.select_set(True)
    obj.hide_render=False
    obj.hide_set(False)
bpy.context.view_layer.objects.active=prepared[0]
bpy.ops.export_scene.gltf(filepath=str(out/'scene.glb'),export_format='GLB',
    use_selection=True,export_apply=True,export_extras=True,export_yup=True,
    export_animations=False,export_cameras=False,export_lights=False)
(out/'license.txt').write_bytes(licence)
intake['driverEyeGroundMeters']=[.33,1.055,-.08]
intake['paintMaterialNames']=['paint']
intake['modifications']+=' Original interpreted four-seat Carrera cabin with leather surfaces, a five-dial instrument cluster, steering/selector/console controls and headliner. Speed, RPM and gear use shared accepted telemetry; auxiliary readings remain unavailable. Not an exact factory cockpit.'
(out/'intake.json').write_text(json.dumps(intake,indent=2)+'\n')
print('PREPARED_CARRERA_CABIN',json.dumps({'objects':len(prepared),'wheelAssemblies':len(intake['wheelLayout'])}))
