"""Build-time textured export fixture, never a reconstruction acceptance asset."""
import bpy
import sys
from pathlib import Path

folder = Path(sys.argv[sys.argv.index('--') + 1])
image = bpy.data.images.new('export-test', width=4096, height=4096, float_buffer=True)
image.generated_color = (0.25, 0.5, 0.75, 1.0)
image.filepath_raw = str(folder / 'source.exr')
image.file_format = 'OPEN_EXR'
image.save()
(folder / 'triangle.mtl').write_text('newmtl sample\nKd 1 1 1\nmap_Kd source.exr\n')
(folder / 'triangle.obj').write_text('mtllib triangle.mtl\nv 0 0 0\nv 1 0 0\nv 0 1 0\nvt 0 0\nvt 1 0\nvt 0 1\nusemtl sample\nf 1/1 2/2 3/3\n')
