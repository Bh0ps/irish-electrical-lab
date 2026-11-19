"""Render the six cut cable samples used by the material picker.

Run with Blender 4.5 in background mode. The bench and the picker share the
cross-sections in lab/lib/cable-profiles.json. Dimensions are in millimetres.
"""
import json
import math
from pathlib import Path

import bpy
from mathutils import Matrix, Vector

ROOT = Path(__file__).resolve().parents[2]
PROFILES = json.loads((ROOT / "lab/lib/cable-profiles.json").read_text())
OUT = ROOT / "lab/public/cable-samples"
OUT.mkdir(parents=True, exist_ok=True)
COLOURS = {
    "brown": (0.18, 0.063, 0.025), "blue": (0.02, 0.16, 0.42),
    "green-yellow": (0.025, 0.22, 0.07), "stripe": (0.9, 0.67, 0.02),
    "red": (0.56, 0.025, 0.018), "black": (0.016, 0.019, 0.022),
    "white": (0.79, 0.79, 0.74), "yellow": (0.85, 0.53, 0.018),
    "copper": (0.68, 0.29, 0.13), "grey": (0.31, 0.34, 0.34),
}
TAU = math.tau


def material(name):
    mat = bpy.data.materials.get(name)
    if mat:
        return mat
    mat = bpy.data.materials.new(name)
    mat.use_nodes = True
    shader = mat.node_tree.nodes.get("Principled BSDF")
    shader.inputs["Base Color"].default_value = (*COLOURS[name], 1)
    shader.inputs["Roughness"].default_value = 0.28 if name == "copper" else 0.42
    shader.inputs["Metallic"].default_value = 0.82 if name == "copper" else 0
    return mat


def circle(r, sides=32):
    return [(r * math.cos(TAU * i/sides), r * math.sin(TAU * i/sides)) for i in range(sides)]


def sweep(name, centres, profile, colour):
    vertices = [(x, y + u, z + v) for x, y, z in centres for u, v in profile]
    n = len(profile)
    faces = []
    for ring in range(len(centres)-1):
        for j in range(n):
            a, b = ring*n+j, ring*n+(j+1)%n
            faces.append((a, b, b+n, a+n))
    faces += [tuple(reversed(range(n))), tuple(range(len(vertices)-n, len(vertices)))]
    mesh = bpy.data.meshes.new(name)
    mesh.from_pydata(vertices, [], faces)
    obj = bpy.data.objects.new(name, mesh)
    bpy.context.collection.objects.link(obj)
    mesh.materials.append(material(colour))
    if colour == "green-yellow":
        mesh.materials.append(material("stripe"))
    for i,p in enumerate(mesh.polygons[:-2]):
        p.use_smooth = True
        if colour == "green-yellow" and (i - n//3) % n < n//2:
            p.material_index = 1
    return obj


def lights():
    for pos, power, size in [((10,-16,23),7100,18),((-12,10,16),5400,14),((14,14,3),3600,12)]:
        lamp=bpy.data.lights.new("Softbox","AREA")
        lamp.energy, lamp.shape, lamp.size = power, "DISK", size
        obj=bpy.data.objects.new("Softbox",lamp)
        bpy.context.collection.objects.link(obj)
        obj.location=pos
        obj.rotation_euler=(-Vector(pos)).to_track_quat("-Z","Y").to_euler()


def render(kind, data):
    bpy.ops.wm.read_factory_settings(use_empty=True)
    scene=bpy.context.scene
    scene.render.engine="CYCLES"
    scene.cycles.samples=16
    scene.cycles.use_denoising=True
    scene.world=bpy.data.worlds.new("Studio")
    scene.world.use_nodes=True
    scene.world.node_tree.nodes["Background"].inputs[0].default_value=(.65,.69,.72,1)
    scene.world.node_tree.nodes["Background"].inputs[1].default_value=.34
    scene.render.film_transparent=True
    scene.render.resolution_x,scene.render.resolution_y,scene.render.resolution_percentage=420,210,100
    scene.render.image_settings.file_format="WEBP"
    scene.render.image_settings.color_mode="RGBA"
    scene.render.image_settings.quality=93
    scene.render.use_stamp=False
    scale=min(6/data["width"], 1.0)
    form=data["form"]
    radius=data["coreDiameter"]*scale/2
    copper=data["copperDiameter"]*scale/2
    if form in ("flat","round"):
        h=data["height"]*scale/2
        straight=3-h
        # A flat cable has two parallel faces joined by round shoulders.
        section=[(y + (straight if i < 9 or i >= 27 else -straight),z) for i,(y,z) in enumerate(circle(h,36))]
        sweep("Outer sheath", [(-10,0,0),(-1.2,0,0)], section, "grey" if form=="flat" else "white")
    for i,(colour,(cy,cz)) in enumerate(data["centres"].items()):
        y,z=cy*scale,cz*scale
        left=-1.4 if form in ("flat","round") else -10
        end=5 + (i%2)*.8
        def centre(x):
            if form=="twisted" and x < 0:
                theta=x*.20
                return y*math.cos(theta)-z*math.sin(theta), z*math.cos(theta)+y*math.sin(theta)
            t=max(0,min(1,(x+1)/(end+1)))
            ease=t*t*(3-2*t)
            return y*(1+ease*.82), z*(1+ease*.55)
        centres=[]
        for j in range(37):
            x=left+(end-left)*j/36
            centres.append((x,*centre(x)))
        sweep(colour+" insulation",centres,circle(radius),colour)
        y,z=centre(end)
        strands=[(0,0)]
        strand_radius=copper
        if data["stranded"]:
            # A visible close-up of fine strands, without assigning a maker-specific count.
            strand_radius=copper/5
            for ring,count in [(1,6),(2,12)]:
                strands += [(ring*2*strand_radius*math.cos(TAU*j/count),ring*2*strand_radius*math.sin(TAU*j/count)) for j in range(count)]
        for j,(dy,dz) in enumerate(strands):
            length=2.4 + (0.12*math.sin(j*3) if data["stranded"] else 0)
            sweep("Bare copper",[(end,y+dy,z+dz),(end+length,y+dy,z+dz)],circle(strand_radius,12),"copper")
    lights()
    camera=bpy.data.cameras.new("Camera")
    obj=bpy.data.objects.new("Camera",camera)
    bpy.context.collection.objects.link(obj)
    target=Vector((-.65,0,0))
    facing=Vector((.49,-.56,.71)).normalized()
    right=Vector((1,0,0))
    right=(right-facing*right.dot(facing)).normalized()
    up=facing.cross(right).normalized()
    obj.location=target+facing*35
    obj.rotation_euler=Matrix((right,up,facing)).transposed().to_euler()
    camera.type="ORTHO"
    camera.ortho_scale=20.2
    scene.camera=obj
    scene.render.filepath=str(OUT/(kind+".webp"))
    bpy.ops.render.render(write_still=True)


for name,profile in PROFILES.items():
    render(name,profile)
