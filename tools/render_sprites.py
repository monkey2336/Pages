"""Renders every sprite in the game from procedural Blender geometry.

Everything here is modelled from primitives in code -- no downloaded models --
so the whole asset set is original and safe to ship.

    pip install bpy==5.0.1
    python tools/render_sprites.py [--only townhall] [--samples 48]

Output: assets/sprites/*.png plus assets/sprites/sprites.json, which records
where world origin lands in each image so the game can anchor a sprite to its
tile precisely.
"""

import json
import math
import os
import sys
import argparse

import bpy
from mathutils import Vector

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT_DIR = os.path.join(ROOT, 'assets', 'sprites')
DATA = json.load(open(os.path.join(ROOT, 'tools', 'gamedata.json')))

# A world unit is one village tile. The camera is a true 2:1 isometric so the
# rendered footprint lines up with the CSS diamond grid exactly.
PX_PER_UNIT = 64.0 / math.sqrt(2.0)
CAM_ELEV = math.radians(60.0)   # 30 degrees above the horizon
CAM_SPIN = math.radians(45.0)


# --------------------------------------------------------------- utilities
def srgb_to_linear(c):
    c = c / 255.0
    return c / 12.92 if c <= 0.04045 else ((c + 0.055) / 1.055) ** 2.4


def hex_rgba(h, alpha=1.0):
    h = (h or '#888888').lstrip('#')
    if len(h) == 3:
        h = ''.join(ch * 2 for ch in h)
    try:
        r, g, b = (int(h[i:i + 2], 16) for i in (0, 2, 4))
    except ValueError:
        r = g = b = 136
    return (srgb_to_linear(r), srgb_to_linear(g), srgb_to_linear(b), alpha)


def shade(h, factor):
    """Lighten (factor>1) or darken (factor<1) a hex colour."""
    h = (h or '#888888').lstrip('#')
    if len(h) == 3:
        h = ''.join(ch * 2 for ch in h)
    try:
        r, g, b = (int(h[i:i + 2], 16) for i in (0, 2, 4))
    except ValueError:
        r = g = b = 136
    f = lambda v: max(0, min(255, int(v * factor)))
    return '#%02x%02x%02x' % (f(r), f(g), f(b))


_materials = {}


def material(color, rough=0.6, metallic=0.0, emission=0.0):
    key = (color, round(rough, 2), round(metallic, 2), round(emission, 2))
    if key in _materials:
        return _materials[key]
    mat = bpy.data.materials.new('m_%d' % len(_materials))
    mat.use_nodes = True
    bsdf = mat.node_tree.nodes['Principled BSDF']
    bsdf.inputs['Base Color'].default_value = hex_rgba(color)
    bsdf.inputs['Roughness'].default_value = rough
    bsdf.inputs['Metallic'].default_value = metallic
    if emission > 0:
        bsdf.inputs['Emission Color'].default_value = hex_rgba(color)
        # Clamped: under a Standard view transform anything much above this
        # clips to white and the glow loses its colour.
        bsdf.inputs['Emission Strength'].default_value = min(emission, 1.9)
    _materials[key] = mat
    return mat


def _finish(obj, color, bevel=0.03, rough=0.6, metallic=0.0, emission=0.0, smooth=False):
    obj.data.materials.append(material(color, rough, metallic, emission))
    if bevel > 0:
        m = obj.modifiers.new('bev', 'BEVEL')
        m.width = bevel
        m.segments = 2
        m.limit_method = 'ANGLE'
        m.angle_limit = math.radians(50)
    if smooth:
        for p in obj.data.polygons:
            p.use_smooth = True
    return obj


def box(sx, sy, sz, loc, color, rot=(0, 0, 0), **kw):
    bpy.ops.mesh.primitive_cube_add(size=1, location=loc, rotation=rot)
    o = bpy.context.object
    o.scale = (sx, sy, sz)
    return _finish(o, color, **kw)


def cyl(r, h, loc, color, verts=28, rot=(0, 0, 0), **kw):
    bpy.ops.mesh.primitive_cylinder_add(radius=r, depth=h, location=loc,
                                        rotation=rot, vertices=verts)
    return _finish(bpy.context.object, color, **kw)


def cone(r1, r2, h, loc, color, verts=28, rot=(0, 0, 0), **kw):
    bpy.ops.mesh.primitive_cone_add(radius1=r1, radius2=r2, depth=h,
                                    location=loc, rotation=rot, vertices=verts)
    return _finish(bpy.context.object, color, **kw)


def sphere(r, loc, color, **kw):
    bpy.ops.mesh.primitive_uv_sphere_add(radius=r, location=loc, segments=24, ring_count=12)
    kw.setdefault('smooth', True)
    kw.setdefault('bevel', 0)
    return _finish(bpy.context.object, color, **kw)


def torus(major, minor, loc, color, rot=(0, 0, 0), **kw):
    bpy.ops.mesh.primitive_torus_add(major_radius=major, minor_radius=minor,
                                     location=loc, rotation=rot,
                                     major_segments=36, minor_segments=10)
    kw.setdefault('smooth', True)
    kw.setdefault('bevel', 0)
    return _finish(bpy.context.object, color, **kw)


def pyramid(r, h, loc, color, **kw):
    """Four-sided roof."""
    return cone(r, 0, h, loc, color, verts=4, rot=(0, 0, math.radians(45)), **kw)


def banner(loc, pole_h, color, pole_color='#4a3a26'):
    cyl(0.035, pole_h, (loc[0], loc[1], pole_h / 2), pole_color, verts=8, bevel=0)
    box(0.02, 0.26, 0.2, (loc[0], loc[1] + 0.14, pole_h - 0.18), color, bevel=0.01)


def ring(z, radius, color, minor=0.035, emission=1.5):
    torus(radius, minor, (0, 0, z), color, emission=emission, rough=0.35)


# --------------------------------------------------------------- scene setup
def reset_scene():
    bpy.ops.wm.read_factory_settings(use_empty=True)
    _materials.clear()
    sc = bpy.context.scene
    sc.render.engine = 'CYCLES'
    sc.cycles.device = 'CPU'
    sc.render.film_transparent = True
    sc.render.image_settings.file_format = 'PNG'
    sc.render.image_settings.color_mode = 'RGBA'
    # Standard keeps the flat, saturated, toy-like colour a stylised base
    # builder wants; Filmic washes it out.
    sc.view_settings.view_transform = 'Standard'

    world = bpy.data.worlds.new('w')
    sc.world = world
    world.use_nodes = True
    bg = world.node_tree.nodes['Background']
    bg.inputs[0].default_value = (0.46, 0.52, 0.62, 1.0)
    bg.inputs[1].default_value = 0.75
    return sc


def add_lights(scale):
    # Warm key from the upper left, matching the light direction the sprites
    # are composited under in game.
    bpy.ops.object.light_add(type='SUN', location=(-4, -6, 8))
    key = bpy.context.object
    key.data.energy = 4.2
    key.data.angle = math.radians(9)
    key.data.color = (1.0, 0.94, 0.82)
    key.rotation_euler = (math.radians(48), 0, math.radians(-38))

    # Cool fill from the right keeps shadow sides readable.
    bpy.ops.object.light_add(type='AREA', location=(5 * scale, -2 * scale, 3 * scale))
    fill = bpy.context.object
    fill.data.energy = 260 * scale * scale
    fill.data.size = 6 * scale
    fill.data.color = (0.72, 0.82, 1.0)
    fill.rotation_euler = (math.radians(70), 0, math.radians(115))

    # Rim from behind separates the model from the ground.
    bpy.ops.object.light_add(type='AREA', location=(-2 * scale, 5 * scale, 3 * scale))
    rim = bpy.context.object
    rim.data.energy = 180 * scale * scale
    rim.data.size = 5 * scale
    rim.data.color = (1.0, 0.9, 0.75)
    rim.rotation_euler = (math.radians(75), 0, math.radians(-160))


def add_camera(ortho_scale, aim_z):
    bpy.ops.object.camera_add(location=(0, 0, 0))
    cam = bpy.context.object
    cam.data.type = 'ORTHO'
    cam.data.ortho_scale = ortho_scale
    cam.rotation_euler = (CAM_ELEV, 0, CAM_SPIN)
    d = 30.0
    direction = Vector((0, 0, -1))
    direction.rotate(cam.rotation_euler)
    cam.location = Vector((0, 0, aim_z)) - direction * d
    bpy.context.scene.camera = cam
    return cam


def add_shadow_catcher(size):
    bpy.ops.mesh.primitive_plane_add(size=size * 4, location=(0, 0, 0))
    plane = bpy.context.object
    plane.is_shadow_catcher = True
    plane.visible_diffuse = False
    plane.visible_glossy = False
    return plane


def project_origin(scene, cam, px):
    """Pixel coordinates of world origin, so the game can anchor the sprite."""
    from bpy_extras.object_utils import world_to_camera_view
    co = world_to_camera_view(scene, cam, Vector((0.0, 0.0, 0.0)))
    return round(co.x * px, 1), round((1.0 - co.y) * px, 1)


MANIFEST = {}


def mesh_objects():
    return [o for o in bpy.context.scene.objects if o.type == 'MESH' and not o.is_shadow_catcher]


def fit_to_footprint(footprint):
    """Scale whatever was just built so it occupies its tile footprint, then
    work out the framing from the real bounding box. Every asset is authored
    at whatever size is convenient and ends up correctly sized on the grid."""
    objs = mesh_objects()
    if not objs:
        return 4.0, 1.0
    xs, ys, zs = [], [], []
    for o in objs:
        for corner in o.bound_box:
            w = o.matrix_world @ Vector(corner)
            xs.append(w.x); ys.append(w.y); zs.append(w.z)
    extent = max(max(xs) - min(xs), max(ys) - min(ys)) or 1.0
    factor = (footprint * 0.94) / extent
    for o in objs:
        o.scale = tuple(s * factor for s in o.scale)
        o.location = tuple(c * factor for c in o.location)
    height = (max(zs) - min(0.0, min(zs))) * factor
    diag = footprint * 0.94 * math.sqrt(2.0)
    # Vertical screen extent of an isometric view: the footprint diamond plus
    # the model's height foreshortened by the camera elevation.
    vertical = diag * 0.5 + height * math.cos(math.radians(30))
    ortho = max(diag, vertical) * 1.14
    aim_z = height * 0.46
    return ortho, aim_z


def render(name, footprint, samples=48):
    """Render the current scene to assets/sprites/<name>.png."""
    sc = bpy.context.scene
    ortho, aim_z = fit_to_footprint(footprint)
    px = int(round(PX_PER_UNIT * ortho))
    px = max(96, min(768, px))
    sc.render.resolution_x = px
    sc.render.resolution_y = px
    sc.cycles.samples = samples
    sc.cycles.use_denoising = True
    cam = add_camera(ortho, aim_z)
    add_lights(max(1.0, footprint * 0.6))
    add_shadow_catcher(footprint)
    ax, ay = project_origin(sc, cam, px)
    path = os.path.join(OUT_DIR, name + '.png')
    sc.render.filepath = path
    bpy.ops.render.render(write_still=True)
    MANIFEST[name] = {'file': 'assets/sprites/%s.png' % name, 'w': px, 'h': px,
                      'anchorX': ax, 'anchorY': ay, 'footprint': footprint}
    print('  rendered %s (%dpx)' % (name, px))


# ------------------------------------------------------------- town halls
# Every family below branches on `variant` so that two halls sharing a family
# still differ in structure, not just in colour.

def glow_orb(r, loc, p, strength=1.6):
    """Emissive core with a saturated accent shell so it never clips to white."""
    sphere(r, loc, shade(p['accent'], 0.9), emission=strength, rough=0.2)


def th_cottage(p, d, variant):
    """Levels 1-3: thatch hut, timber lodge, stone house."""
    h = 0.85 + variant * 0.14
    box(1.5, 1.5, h, (0, 0, h / 2), p['stone'])
    if variant == 0:
        cone(1.25, 0.1, 0.8, (0, 0, h + 0.4), p['roof'], verts=10)
    elif variant == 1:
        # Gable roof: two slabs leaning against a ridge beam.
        for sx in (-1, 1):
            box(1.0, 1.75, 0.14, (sx * 0.42, 0, h + 0.34), p['roof'],
                rot=(0, math.radians(sx * 36), 0))
        box(0.12, 1.8, 0.12, (0, 0, h + 0.68), shade(p['roof'], 0.7))
    else:
        pyramid(1.32, 0.72, (0, 0, h + 0.34), p['roof'])
        cyl(0.17, 0.7, (0.5, 0.42, h + 0.5), shade(p['stone'], 0.8), verts=10)
    box(0.34, 0.06, 0.52, (0, -0.76, 0.26), shade(p['roof'], 0.65))
    for sx in (-0.44, 0.44):
        box(0.22, 0.06, 0.22, (sx, -0.76, h * 0.7), p['accent'], emission=1.1, bevel=0.01)
    if variant >= 1:
        for sx in (-0.78, 0.78):
            box(0.08, 1.5, h * 0.85, (sx, 0, h * 0.45), shade(p['stone'], 0.82))


def th_castle(p, d, variant):
    """Keeps, bastions, citadels, quiver bastions and crowns."""
    h = 1.0 + min(variant, 2) * 0.08
    box(1.7, 1.7, h, (0, 0, h / 2), p['stone'])
    # battlement style differs per variant
    n = 5
    for i in range(n):
        t = -0.72 + i * (1.44 / (n - 1))
        for sy in (-0.86, 0.86):
            box(0.2, 0.16, 0.22, (t, sy, h + 0.11), shade(p['stone'], 1.12), bevel=0.02)
        for sx in (-0.86, 0.86):
            box(0.16, 0.2, 0.22, (sx, t, h + 0.11), shade(p['stone'], 1.12), bevel=0.02)

    if variant == 4:
        # Crown: a ring of spikes instead of an inner keep.
        for i in range(7):
            a = math.radians(i * (360 / 7))
            cone(0.17, 0, 0.75, (math.cos(a) * 0.55, math.sin(a) * 0.55, h + 0.5),
                 p['accent'], verts=6, emission=0.7)
        cyl(0.62, 0.3, (0, 0, h + 0.15), shade(p['stone'], 1.05), verts=20)
        glow_orb(0.2, (0, 0, h + 0.95), p, 1.8)
    elif variant == 3:
        # Quiver bastion: a low keep bristling with archer slits.
        keep_h = h + 0.35
        box(1.05, 1.05, keep_h, (0, 0, keep_h / 2), shade(p['stone'], 1.06))
        box(1.15, 1.15, 0.12, (0, 0, keep_h + 0.06), shade(p['stone'], 0.9))
        for i in range(4):
            a = math.radians(45 + i * 90)
            for j in range(3):
                box(0.1, 0.05, 0.26,
                    (math.cos(a) * 0.56, math.sin(a) * 0.56, 0.5 + j * 0.3),
                    p['accent'], emission=1.2, bevel=0.01)
    else:
        keep_h = h + 0.5 + variant * 0.12
        box(0.95, 0.95, keep_h, (0, 0, keep_h / 2), shade(p['stone'], 1.08))
        if variant == 1:
            box(1.1, 1.1, 0.14, (0, 0, keep_h + 0.07), shade(p['stone'], 0.92))
            cyl(0.05, 0.75, (0, 0, keep_h + 0.45), shade(p['roof'], 0.7), verts=6)
            box(0.03, 0.34, 0.24, (0, 0.18, keep_h + 0.68), p['accent'])
        else:
            pyramid(0.88, 0.62, (0, 0, keep_h + 0.3), p['roof'])

    towers = max(2, min(4, d['towers']))
    if variant == 3:
        towers = 4
    for i in range(towers):
        a = math.radians(45 + i * (360 / towers))
        x, y = math.cos(a) * 0.92, math.sin(a) * 0.92
        th_ = h + 0.28 + (i % 2) * 0.16
        cyl(0.26, th_, (x, y, th_ / 2), shade(p['stone'], 0.95), verts=12)
        if variant in (0, 2):
            cone(0.34, 0, 0.46, (x, y, th_ + 0.22), p['roof'], verts=12)
        else:
            cyl(0.32, 0.12, (x, y, th_ + 0.06), shade(p['stone'], 1.1), verts=12)
            for j in range(4):
                b = math.radians(45 + j * 90)
                box(0.12, 0.12, 0.16, (x + math.cos(b) * 0.2, y + math.sin(b) * 0.2, th_ + 0.18),
                    shade(p['stone'], 1.15), bevel=0.02)
    box(0.32, 0.08, 0.5, (0, -0.87, 0.25), shade(p['roof'], 0.65))


def th_colonnade(p, d, variant):
    """Courts, sanctums and conclaves: columns, domes and obelisks."""
    box(1.85, 1.85, 0.22, (0, 0, 0.11), shade(p['stone'], 0.88))
    box(1.55, 1.55, 0.16, (0, 0, 0.3), p['stone'])
    ring_r = 0.62
    cols = 8 if variant == 2 else 6
    for i in range(cols):
        a = math.radians(i * (360 / cols) + 22)
        cyl(0.1, 0.9, (math.cos(a) * ring_r * 1.15, math.sin(a) * ring_r * 1.15, 0.83),
            shade(p['stone'], 1.14), verts=10)
    if variant == 0:
        box(1.6, 1.6, 0.16, (0, 0, 1.32), p['roof'])
        cone(0.8, 0.2, 0.5, (0, 0, 1.62), p['roof'], verts=18)
        glow_orb(0.16, (0, 0, 1.98), p, 1.7)
    elif variant == 1:
        box(1.5, 1.5, 0.14, (0, 0, 1.32), p['roof'])
        sphere(0.66, (0, 0, 1.48), p['roof'], rough=0.4)
        t = torus(0.8, 0.035, (0, 0, 1.55), p['accent2'], emission=1.6, rough=0.3)
        t.rotation_euler = (math.radians(78), 0, 0)
        glow_orb(0.2, (0, 0, 2.2), p, 1.8)
    else:
        box(1.7, 1.7, 0.2, (0, 0, 1.36), p['roof'])
        box(1.4, 1.4, 0.12, (0, 0, 1.52), shade(p['roof'], 1.1))
        box(0.42, 0.42, 1.1, (0, 0, 2.1), shade(p['stone'], 1.16))
        cone(0.3, 0, 0.42, (0, 0, 2.85), p['accent'], verts=4,
             rot=(0, 0, math.radians(45)), emission=0.9)
    box(1.05, 1.05, 0.85, (0, 0, 0.82), shade(p['stone'], 1.04))


def th_monolith(p, d, variant):
    """Obsidian seat, monolith vault, null cathedral and voidhold."""
    box(1.9, 1.9, 0.26, (0, 0, 0.13), shade(p['stone'], 0.82))
    tiers = max(2, min(4, d['steps'] // 2))
    for i in range(tiers):
        s = 1.62 - i * 0.16
        box(s, s, 0.16, (0, 0, 0.32 + i * 0.16), shade(p['stone'], 0.94 + i * 0.05))
    base_z = 0.32 + tiers * 0.16

    if variant == 0:
        # Obsidian seat: a canted shard over the throne platform.
        shard = box(0.8, 0.5, 1.5, (0, 0, base_z + 0.75), p['roof'], rough=0.28)
        shard.rotation_euler = (math.radians(-9), 0, math.radians(18))
        box(0.24, 0.06, 0.9, (0, -0.28, base_z + 0.72), p['accent'], emission=1.5, bevel=0.01)
    elif variant == 1:
        # Monolith vault: the tall slab with a floating capstone.
        box(0.66, 0.4, 2.0, (0, 0, base_z + 1.0), p['roof'], rough=0.3)
        box(0.2, 0.05, 1.4, (0, -0.23, base_z + 0.95), p['accent'], emission=1.6, bevel=0.01)
        glow_orb(0.22, (0, 0, base_z + 2.35), p, 1.8)
    elif variant == 2:
        # Null cathedral: an open frame around nothing at all.
        for sx in (-0.55, 0.55):
            box(0.22, 0.34, 1.9, (sx, 0, base_z + 0.95), p['roof'], rough=0.3)
        box(1.35, 0.34, 0.24, (0, 0, base_z + 2.0), shade(p['roof'], 1.15))
        t = torus(0.46, 0.05, (0, 0, base_z + 1.0), p['accent'], emission=1.5, rough=0.3)
        t.rotation_euler = (math.radians(90), 0, 0)
    else:
        # Voidhold: a dark sphere clutched by four arms.
        sphere(0.5, (0, 0, base_z + 0.95), '#0b0714', rough=0.15)
        sphere(0.3, (0, 0, base_z + 0.95), shade(p['accent'], 0.85), emission=1.9, rough=0.1)
        for i in range(4):
            a = math.radians(45 + i * 90)
            arm = box(0.18, 0.18, 1.5, (math.cos(a) * 0.58, math.sin(a) * 0.58, base_z + 0.7),
                      p['roof'], rough=0.35)
            arm.rotation_euler = (math.radians(math.sin(a) * 16), math.radians(-math.cos(a) * 16), 0)

    for i in range(min(4, d['towers'])):
        a = math.radians(45 + i * 90)
        hgt = 0.85 + (i % 2) * 0.22
        box(0.2, 0.2, hgt, (math.cos(a) * 0.8, math.sin(a) * 0.8, hgt / 2 + 0.2),
            shade(p['stone'], 1.06))


def th_forge(p, d, variant):
    """Emberforge, ricochet foundry and titanforge."""
    w = 1.7 + variant * 0.06
    box(w, 1.5, 1.0, (0, 0, 0.5), p['stone'])
    box(w + 0.06, 1.56, 0.14, (0, 0, 1.05), shade(p['roof'], 0.9))
    if variant == 2:
        # Titanforge: a flat roof with an anvil block on top.
        box(1.1, 1.1, 0.5, (0, 0, 1.35), shade(p['stone'], 1.1))
        box(0.85, 0.5, 0.28, (0, 0, 1.72), '#4a4a52', rough=0.4, metallic=0.4)
        cyl(0.1, 0.4, (0, -0.34, 1.95), shade(p['roof'], 0.7), verts=8)
    elif variant == 1:
        # Ricochet foundry: a test cannon mounted over a shallow roof.
        box(1.5, 1.3, 0.3, (0, 0, 1.27), p['roof'])
        cyl(0.42, 0.28, (0, 0.1, 1.55), shade(p['stone'], 1.12), verts=18)
        cyl(0.19, 1.1, (0.05, -0.34, 1.85), '#4a5058', verts=16,
            rot=(math.radians(74), 0, math.radians(14)), metallic=0.7, rough=0.35)
        cyl(0.24, 0.12, (0.14, -0.78, 1.98), p['accent'], verts=16,
            rot=(math.radians(74), 0, math.radians(14)), emission=1.5)
    else:
        pyramid(1.28, 0.55, (0, 0, 1.36), p['roof'])
    chimneys = 2 + variant
    for i in range(chimneys):
        sx = -0.6 + i * (1.2 / max(1, chimneys - 1))
        ch = 0.85 + (i % 2) * 0.35
        cyl(0.19, ch, (sx, 0.48, 1.1 + ch / 2), shade(p['stone'], 0.78), verts=12)
        cyl(0.23, 0.1, (sx, 0.48, 1.1 + ch), p['accent'], verts=12, emission=1.6)
    box(0.5, 0.08, 0.55, (0, -0.78, 0.3), p['accent'], emission=1.7, bevel=0.02)
    for sx in (-0.62, 0.62):
        box(0.22, 0.06, 0.22, (sx, -0.78, 0.74), p['accent2'], emission=1.3, bevel=0.01)


def th_spire(p, d, variant):
    """Inferno spire, prism cathedral and aurora spire."""
    box(1.6, 1.6, 0.7, (0, 0, 0.35), p['stone'])
    if variant == 1:
        # Cathedral: twin front spires flanking a tall nave.
        box(1.0, 1.3, 1.5, (0, 0.1, 1.4), shade(p['stone'], 1.06))
        cone(0.62, 0.1, 1.3, (0, 0.1, 2.75), p['roof'], verts=10)
        for sx in (-0.6, 0.6):
            box(0.42, 0.42, 1.5, (sx, -0.42, 1.4), shade(p['stone'], 1.0))
            cone(0.32, 0, 0.8, (sx, -0.42, 2.5), p['roof'], verts=8)
            glow_orb(0.1, (sx, -0.42, 2.98), p, 1.7)
        box(0.34, 0.06, 0.85, (0, -0.66, 1.1), p['accent'], emission=1.5, bevel=0.02)
    elif variant == 2:
        # Aurora spire: a thin needle wrapped in rings.
        cyl(0.55, 1.0, (0, 0, 1.2), shade(p['stone'], 1.06), verts=20)
        cone(0.44, 0.08, 1.7, (0, 0, 2.55), p['roof'], verts=18)
        for i in range(3):
            t = torus(0.62 + i * 0.14, 0.03, (0, 0, 1.9 + i * 0.5),
                      p['accent'] if i % 2 == 0 else p['accent2'], emission=1.7, rough=0.3)
            t.rotation_euler = (math.radians(8 * i), 0, 0)
        glow_orb(0.15, (0, 0, 3.5), p, 1.9)
    else:
        # Inferno spire: a fat cone with a burning crown.
        cyl(0.72, 1.1, (0, 0, 1.25), shade(p['stone'], 1.04), verts=18)
        cone(0.78, 0.28, 1.2, (0, 0, 2.4), p['roof'], verts=18)
        cone(0.26, 0, 0.6, (0, 0, 3.2), p['accent'], verts=12, emission=1.8)
        for i in range(4):
            a = math.radians(45 + i * 90)
            box(0.14, 0.06, 0.5, (math.cos(a) * 0.6, math.sin(a) * 0.6, 1.4),
                p['accent'], emission=1.4, bevel=0.01)
    for i in range(min(4, max(2, d['towers']))):
        a = math.radians(45 + i * 90)
        x, y = math.cos(a) * 0.84, math.sin(a) * 0.84
        cyl(0.18, 1.2, (x, y, 0.6), shade(p['stone'], 0.94), verts=12)
        cone(0.25, 0, 0.42, (x, y, 1.4), p['roof'], verts=12)


def th_ziggurat(p, d, variant):
    """Golden ziggurat and the apex hall."""
    steps = max(4, min(7, d['steps']))
    for i in range(steps):
        s = 1.95 - i * (1.3 / steps)
        box(s, s, 0.26, (0, 0, i * 0.26 + 0.13), shade(p['stone'], 0.9 + i * 0.035))
    top = steps * 0.26
    if variant == 0:
        cyl(0.55, 0.4, (0, 0, top + 0.2), p['roof'], verts=18)
        glow_orb(0.28, (0, 0, top + 0.66), p, 1.8)
        for i in range(4):
            a = math.radians(45 + i * 90)
            cyl(0.06, 0.5, (math.cos(a) * 0.42, math.sin(a) * 0.42, top + 0.45),
                shade(p['roof'], 1.2), verts=6)
    else:
        box(0.78, 0.78, 0.34, (0, 0, top + 0.17), p['roof'])
        cone(0.46, 0, 1.0, (0, 0, top + 0.85), p['accent'], verts=4,
             rot=(0, 0, math.radians(45)), emission=0.8)
        glow_orb(0.18, (0, 0, top + 1.5), p, 1.9)
        t = torus(0.7, 0.035, (0, 0, top + 0.9), p['accent2'], emission=1.7, rough=0.3)
        t.rotation_euler = (math.radians(74), 0, 0)


def th_menagerie(p, d, variant):
    """Verdant menagerie: a living roof over a wide hall."""
    box(1.75, 1.6, 0.95, (0, 0, 0.48), p['stone'])
    box(1.9, 1.75, 0.16, (0, 0, 1.02), shade(p['roof'], 0.85))
    for (x, y, r) in ((-0.45, 0.1, 0.44), (0.42, -0.16, 0.52), (0.06, 0.42, 0.36)):
        sphere(r, (x, y, 1.1 + r * 0.5), p['accent2'], rough=0.8)
    glow_orb(0.16, (0, 0, 1.95), p, 1.6)
    for sx in (-0.62, 0, 0.62):
        box(0.22, 0.06, 0.24, (sx, -0.84, 0.66), p['accent'], emission=1.3, bevel=0.01)
    for sx in (-0.8, 0.8):
        cyl(0.14, 1.0, (sx, -0.5, 0.5), shade(p['stone'], 0.9), verts=10)


def th_nexus(p, d, variant):
    """Nexus reach: radiating arms around a floating core."""
    box(1.5, 1.5, 0.8, (0, 0, 0.4), p['stone'])
    cyl(0.64, 0.35, (0, 0, 0.95), shade(p['stone'], 1.12), verts=24)
    glow_orb(0.34, (0, 0, 1.85), p, 1.9)
    arms = max(4, min(6, d['towers']))
    for i in range(arms):
        a = math.radians(i * (360 / arms))
        x, y = math.cos(a), math.sin(a)
        b = box(0.95, 0.08, 0.08, (x * 0.62, y * 0.62, 1.5), p['accent'], emission=1.5, bevel=0.01)
        b.rotation_euler = (0, 0, a)
        cyl(0.14, 0.8, (x * 1.02, y * 1.02, 0.4), shade(p['stone'], 0.95), verts=10)
        sphere(0.12, (x * 1.02, y * 1.02, 1.5), p['accent2'], emission=1.7)
    t = torus(0.78, 0.035, (0, 0, 1.85), p['accent2'], emission=1.6, rough=0.3)
    t.rotation_euler = (math.radians(74), 0, 0)


def th_orbital(p, d, variant):
    """Gravity sanctum, orbital throne and the singularity ark."""
    box(1.75, 1.75, 0.5, (0, 0, 0.25), shade(p['stone'], 0.88))
    if variant == 0:
        # Gravity sanctum: a dish that drags the sky down.
        cyl(0.8, 0.5, (0, 0, 0.75), p['stone'], verts=26)
        dish = cone(1.0, 0.35, 0.55, (0, 0, 1.25), shade(p['stone'], 1.1), verts=26)
        glow_orb(0.3, (0, 0, 1.85), p, 1.9)
        for i in range(3):
            t = torus(0.72 + i * 0.2, 0.035, (0, 0, 1.85), p['accent'] if i % 2 else p['accent2'],
                      emission=1.6, rough=0.3)
            t.rotation_euler = (math.radians(76), 0, math.radians(i * 40))
    elif variant == 1:
        # Orbital throne: a beacon on a mast.
        cyl(0.7, 0.6, (0, 0, 0.8), p['stone'], verts=24)
        cyl(0.28, 1.3, (0, 0, 1.75), shade(p['stone'], 1.12), verts=16)
        sphere(0.4, (0, 0, 2.6), p['roof'], rough=0.35)
        glow_orb(0.22, (0, 0, 2.6), p, 1.9)
        t = torus(0.85, 0.04, (0, 0, 2.6), p['accent'], emission=1.7, rough=0.3)
        t.rotation_euler = (math.radians(68), 0, 0)
    else:
        # Singularity ark: a hull cradling the core.
        hull = cyl(0.95, 1.3, (0, 0, 1.15), p['stone'], verts=8, rot=(0, 0, math.radians(22)))
        cyl(0.7, 0.3, (0, 0, 1.95), shade(p['stone'], 1.14), verts=8, rot=(0, 0, math.radians(22)))
        sphere(0.46, (0, 0, 2.3), '#06121c', rough=0.2)
        glow_orb(0.28, (0, 0, 2.3), p, 1.9)
        for i in range(3):
            t = torus(0.9 + i * 0.18, 0.04, (0, 0, 2.3),
                      p['accent'] if i % 2 == 0 else p['accent2'], emission=1.7, rough=0.25)
            t.rotation_euler = (math.radians(64 + i * 18), 0, math.radians(i * 60))
    for i in range(4):
        a = math.radians(45 + i * 90)
        cyl(0.16, 1.0, (math.cos(a) * 0.88, math.sin(a) * 0.88, 0.5), shade(p['stone'], 0.94), verts=10)
        sphere(0.1, (math.cos(a) * 0.88, math.sin(a) * 0.88, 1.1), p['accent'], emission=1.6)


def th_fracture(p, d, variant):
    """Fracture keep: canted, cracked, lit from within."""
    box(1.65, 1.65, 0.55, (0, 0, 0.28), shade(p['stone'], 0.86))
    box(1.15, 1.15, 1.0, (0, 0, 1.05), p['stone'])
    upper = box(0.9, 0.9, 0.95, (0.12, -0.05, 1.98), shade(p['stone'], 1.1))
    upper.rotation_euler = (0, math.radians(8), math.radians(11))
    cone(0.62, 0, 0.8, (0.14, -0.06, 2.8), p['roof'], verts=4, rot=(0, 0, math.radians(45)))
    for (x, y, z, h) in ((-0.32, -0.52, 1.4, 1.8), (0.44, -0.46, 1.1, 1.2)):
        box(0.07, 0.07, h, (x, y, z), p['accent'], emission=1.8, bevel=0)
    for i in range(min(4, d['towers'])):
        a = math.radians(45 + i * 90)
        hgt = 0.9 + (i % 2) * 0.22
        cyl(0.17, hgt, (math.cos(a) * 0.8, math.sin(a) * 0.8, hgt / 2 + 0.2),
            shade(p['stone'], 0.95), verts=10)
        cone(0.23, 0, 0.34, (math.cos(a) * 0.8, math.sin(a) * 0.8, hgt + 0.35), p['roof'], verts=8)


def th_aegis(p, d, variant):
    """Aegis crown: a hexagonal shield hall."""
    box(1.85, 1.85, 0.4, (0, 0, 0.2), shade(p['stone'], 0.88))
    cyl(1.0, 0.9, (0, 0, 0.85), p['stone'], verts=6, rot=(0, 0, math.radians(30)))
    cyl(0.74, 0.55, (0, 0, 1.55), shade(p['stone'], 1.12), verts=6, rot=(0, 0, math.radians(30)))
    for i in range(6):
        a = math.radians(i * 60)
        cone(0.17, 0, 0.6, (math.cos(a) * 0.74, math.sin(a) * 0.74, 2.1), p['accent'],
             verts=4, rot=(0, 0, math.radians(45)), emission=1.2)
    glow_orb(0.3, (0, 0, 1.95), p, 1.9)
    t = torus(1.06, 0.045, (0, 0, 1.35), p['accent2'], emission=1.6, rough=0.3)
    t.rotation_euler = (math.radians(84), 0, 0)
TH_BUILDERS = {
    'hut': (th_cottage, 0), 'lodge': (th_cottage, 1), 'stonehouse': (th_cottage, 2),
    'keep': (th_castle, 0), 'bastion': (th_castle, 1), 'citadel': (th_castle, 2),
    'quiver': (th_castle, 3), 'crown': (th_castle, 4),
    'court': (th_colonnade, 0), 'sanctum': (th_colonnade, 1), 'conclave': (th_colonnade, 2),
    'obsidian': (th_monolith, 0), 'monolith': (th_monolith, 1),
    'null': (th_monolith, 2), 'voidhold': (th_monolith, 3),
    'forge': (th_forge, 0), 'foundry': (th_forge, 1), 'titanforge': (th_forge, 2),
    'spire': (th_spire, 0), 'cathedral': (th_spire, 1), 'aurora': (th_spire, 2),
    'ziggurat': (th_ziggurat, 0), 'apex': (th_ziggurat, 1),
    'menagerie': (th_menagerie, 0),
    'nexus': (th_nexus, 0),
    'gravity': (th_orbital, 0), 'orbital': (th_orbital, 1), 'ark': (th_orbital, 2),
    'fracture': (th_fracture, 0),
    'aegis': (th_aegis, 0),
}


def build_town_hall(th):
    p, d = th['palette'], th['design']
    fn, variant = TH_BUILDERS.get(d['body'], (th_castle, 0))
    fn(p, d, variant)
    # Shared ornament layer: banners and floating orbs, counts vary per level.
    for i in range(min(4, d['banners'])):
        a = math.radians(35 + i * (360 / max(1, min(4, d['banners']))))
        banner((math.cos(a) * 1.15, math.sin(a) * 1.15), 0.95 + (i % 2) * 0.12,
               p['accent'] if i % 2 == 0 else p['accent2'])
    for i in range(min(5, d['orbs'])):
        a = math.radians(i * (360 / max(1, min(5, d['orbs']))) + 20)
        sphere(0.075, (math.cos(a) * 1.0, math.sin(a) * 1.0, 2.15 + (i % 3) * 0.16),
               p['glow'], emission=6.0)


# --------------------------------------------------------------- buildings
# Buildings keep their own thematic colours so they read the same in every
# village; the Town Hall carries the level's identity.
STONE = '#9aa3ad'
STONE_D = '#6f7883'
WOOD = '#8b5e34'
WOOD_D = '#5f3f22'
ROOF_RED = '#b4442f'
GOLD = '#f0b429'
ELIXIR = '#c05cf0'
DARK = '#7a4dd6'
STEEL = '#c3ccd6'


def plinth(size, color='#6b573c', h=0.18):
    box(size, size, h, (0, 0, h / 2), color)


def b_mine(p):
    plinth(1.6, '#6b5a3f')
    box(1.3, 1.3, 0.4, (0, 0, 0.38), '#7a6647')
    for i in range(3):
        box(1.15 - i * 0.28, 1.15 - i * 0.28, 0.2, (0, 0, 0.62 + i * 0.2), shade(GOLD, 0.9 + i * 0.05))
    sphere(0.2, (0, 0, 1.32), GOLD, emission=1.2, rough=0.35, metallic=0.6)
    box(0.12, 0.7, 0.12, (0.55, 0, 0.75), WOOD_D)


def b_collector(p):
    plinth(1.6, '#4a3f5c')
    cyl(0.6, 0.9, (0, 0, 0.62), '#5f4f7a', verts=20)
    cyl(0.64, 0.1, (0, 0, 1.12), '#7a68a0', verts=20)
    sphere(0.46, (0, 0, 1.3), ELIXIR, emission=1.6, rough=0.25)
    for i in range(3):
        a = math.radians(i * 120)
        cyl(0.07, 0.7, (math.cos(a) * 0.68, math.sin(a) * 0.68, 0.45), STONE_D, verts=8)


def b_drill(p):
    plinth(1.6, '#3a2f4a')
    box(1.1, 1.1, 0.5, (0, 0, 0.42), '#463a5c')
    cyl(0.34, 1.0, (0, 0, 1.05), '#5a4a75', verts=16)
    cone(0.34, 0.06, 0.6, (0, 0, 1.85), DARK, verts=16, emission=1.4)
    for sx in (-0.5, 0.5):
        cyl(0.1, 0.8, (sx, 0.35, 0.75), STONE_D, verts=8)


def b_vault(p, color=GOLD, accent='#8a6a1f'):
    plinth(1.6, '#6b573c')
    box(1.35, 1.15, 0.85, (0, 0, 0.6), accent)
    box(1.42, 1.2, 0.14, (0, 0, 1.08), shade(accent, 1.2))
    for i in range(3):
        sphere(0.22, (-0.35 + i * 0.35, 0, 1.24), color, emission=1.1, rough=0.3, metallic=0.5)
    box(0.36, 0.06, 0.42, (0, -0.6, 0.38), shade(accent, 0.7))


def b_tank(p):
    plinth(1.6, '#6b573c')
    cyl(0.6, 1.1, (0, 0, 0.72), '#4f4468', verts=22)
    cyl(0.64, 0.12, (0, 0, 1.3), '#6f5f92', verts=22)
    sphere(0.5, (0, 0, 1.02), ELIXIR, emission=1.4, rough=0.2)
    for sz in (0.45, 0.95):
        torus(0.62, 0.05, (0, 0, sz), STEEL, rough=0.35, metallic=0.7)


def b_darkvault(p):
    plinth(1.6, '#2e2440')
    cyl(0.5, 0.4, (0, 0, 0.36), '#3f3356', verts=20)
    sphere(0.58, (0, 0, 1.05), '#241c33', rough=0.3)
    sphere(0.46, (0, 0, 1.05), DARK, emission=2.2, rough=0.15)
    for i in range(4):
        a = math.radians(45 + i * 90)
        cyl(0.08, 1.0, (math.cos(a) * 0.62, math.sin(a) * 0.62, 0.5), '#4a3f66', verts=8)


def b_treasury(p):
    plinth(1.6, '#6b573c')
    box(1.3, 1.1, 0.75, (0, 0, 0.55), '#7a6647')
    pyramid(1.05, 0.5, (0, 0, 1.15), ROOF_RED)
    box(0.4, 0.08, 0.45, (0, -0.58, 0.4), GOLD, emission=0.8, metallic=0.7, rough=0.3)


def b_clock(p):
    plinth(1.5, '#6b573c')
    box(0.8, 0.8, 1.5, (0, 0, 0.95), STONE)
    box(0.95, 0.95, 0.14, (0, 0, 1.76), shade(STONE, 0.8))
    pyramid(0.7, 0.55, (0, 0, 2.08), ROOF_RED)
    for sy in (-0.42, 0.42):
        cyl(0.26, 0.06, (0, sy, 1.45), '#f4efdf', rot=(math.radians(90), 0, 0), verts=20)
    sphere(0.12, (0, 0, 2.42), GOLD, emission=1.5)


def b_barracks(p, dark=False):
    plinth(1.7, '#6b573c')
    box(1.45, 1.15, 0.75, (0, 0, 0.55), WOOD if not dark else '#3f3356')
    box(1.55, 1.25, 0.12, (0, 0, 0.99), WOOD_D if not dark else '#2b2340')
    pyramid(1.15, 0.55, (0, 0, 1.32), ROOF_RED if not dark else DARK)
    box(0.4, 0.08, 0.5, (0, -0.62, 0.3), WOOD_D)
    for sx in (-0.62, 0.62):
        banner((sx, -0.62), 0.9, GOLD if not dark else DARK)


def b_camp(p):
    plinth(1.9, '#5c6b45')
    for (x, y, r) in ((-0.4, -0.3, 0.45), (0.42, -0.25, 0.4), (0, 0.45, 0.5)):
        cone(r, 0.06, 0.7, (x, y, 0.42), '#c9b48a', verts=12)
        cyl(0.03, 0.25, (x, y, 0.85), WOOD_D, verts=6)
    box(0.5, 0.5, 0.1, (0, 0, 0.22), '#6b4a2a')
    sphere(0.14, (0, 0, 0.34), '#ff8a3c', emission=3.0)


def b_lab(p):
    plinth(1.6, '#6b573c')
    box(1.25, 1.25, 0.8, (0, 0, 0.58), '#4f5a6b')
    cyl(0.55, 0.35, (0, 0, 1.15), '#63708a', verts=20)
    sphere(0.4, (0, 0, 1.5), '#5de0c0', emission=2.2, rough=0.2)
    for i in range(3):
        a = math.radians(i * 120)
        cyl(0.09, 0.55, (math.cos(a) * 0.45, math.sin(a) * 0.45, 1.3), STEEL, verts=8, metallic=0.6)


def b_spellfac(p, dark=False):
    tint = ELIXIR if not dark else DARK
    plinth(1.6, '#6b573c')
    box(1.2, 1.2, 0.6, (0, 0, 0.48), '#4a4258')
    cyl(0.52, 0.6, (0, 0, 1.05), '#5f5674', verts=20)
    sphere(0.44, (0, 0, 1.5), tint, emission=2.4, rough=0.2)
    cyl(0.1, 0.5, (0, 0, 1.9), STEEL, verts=8, metallic=0.6)
    for i in range(4):
        a = math.radians(45 + i * 90)
        sphere(0.09, (math.cos(a) * 0.6, math.sin(a) * 0.6, 1.55), tint, emission=3.0)


def b_siege(p):
    plinth(1.7, '#6b573c')
    box(1.4, 1.0, 0.55, (0, 0, 0.45), WOOD)
    box(1.5, 1.1, 0.1, (0, 0, 0.78), WOOD_D)
    for sx in (-0.5, 0.5):
        cyl(0.28, 0.12, (sx, -0.55, 0.28), '#4a3a26', rot=(math.radians(90), 0, 0), verts=14)
    box(0.3, 0.3, 0.8, (0.15, 0.3, 1.0), STEEL, metallic=0.6, rough=0.4)
    cyl(0.08, 0.9, (-0.3, 0.2, 1.1), WOOD_D, verts=8, rot=(0, math.radians(25), 0))


def b_pethouse(p):
    plinth(1.6, '#4a6b3f')
    box(1.25, 1.15, 0.65, (0, 0, 0.5), '#6b8a4f')
    sphere(0.72, (0, 0, 0.95), '#7ce05a', rough=0.75)
    cyl(0.28, 0.06, (0, -0.62, 0.5), '#2f4a24', rot=(math.radians(90), 0, 0), verts=18)
    for sx in (-0.3, 0.3):
        sphere(0.09, (sx, -0.5, 1.15), '#ffe9a8', emission=2.5)


def b_herohall(p):
    plinth(2.0, '#6b573c')
    box(1.6, 1.5, 0.9, (0, 0, 0.63), STONE)
    box(1.75, 1.6, 0.14, (0, 0, 1.14), shade(STONE, 0.82))
    pyramid(1.3, 0.7, (0, 0, 1.55), '#3f5470')
    for sx in (-0.62, 0.62):
        cyl(0.2, 1.15, (sx, -0.5, 0.72), shade(STONE, 1.1), verts=12)
        cone(0.27, 0, 0.4, (sx, -0.5, 1.48), '#3f5470', verts=12)
    box(0.42, 0.08, 0.55, (0, -0.78, 0.4), GOLD, emission=0.6, metallic=0.7, rough=0.3)
    sphere(0.16, (0, 0, 2.05), GOLD, emission=2.5)


def b_smith(p):
    plinth(1.6, '#6b573c')
    box(1.3, 1.1, 0.7, (0, 0, 0.52), '#5c4a3a')
    box(1.4, 1.2, 0.12, (0, 0, 0.93), '#3f3128')
    cyl(0.22, 0.7, (0.45, 0.35, 1.25), '#4a3a2e', verts=12)
    cyl(0.24, 0.08, (0.45, 0.35, 1.62), '#ff8a3c', verts=12, emission=2.6)
    box(0.5, 0.3, 0.16, (-0.25, -0.2, 1.0), STEEL, metallic=0.8, rough=0.3)
    box(0.14, 0.14, 0.34, (-0.25, -0.2, 1.24), WOOD_D)


def b_cannon(p):
    plinth(1.5, '#6b573c')
    cyl(0.55, 0.35, (0, 0, 0.35), STONE, verts=18)
    box(0.5, 0.5, 0.25, (0, 0, 0.62), shade(STONE, 0.85))
    barrel = cyl(0.2, 1.0, (0.1, -0.28, 0.85), '#4a5058', verts=16,
                 rot=(math.radians(76), 0, math.radians(20)), metallic=0.7, rough=0.35)
    cyl(0.24, 0.12, (0.22, -0.62, 0.98), '#2f343a', verts=16,
        rot=(math.radians(76), 0, math.radians(20)), metallic=0.7)
    for sx in (-0.42, 0.42):
        cyl(0.1, 0.16, (sx, 0.2, 0.62), '#3f454d', verts=10, metallic=0.6)


def b_archer(p):
    plinth(1.5, '#6b573c')
    cyl(0.42, 1.15, (0, 0, 0.72), STONE, verts=16)
    cyl(0.55, 0.14, (0, 0, 1.36), shade(STONE, 1.1), verts=16)
    for i in range(6):
        a = math.radians(i * 60)
        box(0.14, 0.14, 0.2, (math.cos(a) * 0.44, math.sin(a) * 0.44, 1.52), shade(STONE, 1.15), bevel=0.02)
    cone(0.5, 0, 0.5, (0, 0, 1.85), ROOF_RED, verts=12)
    box(0.18, 0.18, 0.4, (0, -0.2, 1.55), WOOD_D)


def b_mortar(p):
    plinth(1.5, '#6b573c')
    cyl(0.6, 0.3, (0, 0, 0.32), STONE, verts=18)
    cyl(0.45, 0.7, (0, 0, 0.8), shade(STONE, 0.9), verts=18,
        rot=(math.radians(12), 0, 0))
    cyl(0.38, 0.1, (0, -0.1, 1.16), '#3f454d', verts=18, metallic=0.6)
    sphere(0.24, (0, -0.06, 1.2), '#2f343a', rough=0.4)
    for sx in (-0.5, 0.5):
        box(0.14, 0.14, 0.45, (sx, 0.42, 0.42), WOOD_D)


def b_airdef(p):
    plinth(1.5, '#6b573c')
    cyl(0.5, 0.4, (0, 0, 0.38), '#4f5a6b', verts=18)
    box(0.55, 0.55, 0.3, (0, 0, 0.72), '#63708a')
    for sx in (-0.16, 0.16):
        cyl(0.13, 1.0, (sx, -0.1, 1.25), STEEL, verts=12,
            rot=(math.radians(20), 0, 0), metallic=0.6, rough=0.35)
        cone(0.13, 0, 0.25, (sx, -0.28, 1.8), ROOF_RED, verts=12)
    cyl(0.1, 0.3, (0, 0.3, 0.95), '#3f454d', verts=8)


def b_wizard(p):
    plinth(1.5, '#6b573c')
    cyl(0.44, 1.0, (0, 0, 0.65), '#5f5674', verts=16)
    cyl(0.56, 0.12, (0, 0, 1.22), '#7a6f96', verts=16)
    cone(0.56, 0, 0.8, (0, 0, 1.68), '#4a3f7a', verts=16)
    sphere(0.16, (0, 0, 2.14), '#c9b8ff', emission=4.0)
    for i in range(3):
        a = math.radians(i * 120)
        sphere(0.08, (math.cos(a) * 0.4, math.sin(a) * 0.4, 1.35), '#a48fd8', emission=3.0)


def b_sweeper(p):
    plinth(1.5, '#6b573c')
    cyl(0.45, 0.55, (0, 0, 0.46), STONE, verts=16)
    box(0.5, 0.5, 0.3, (0, 0, 0.88), shade(STONE, 0.9))
    fan = cone(0.5, 0.16, 0.7, (0, -0.3, 1.15), '#63708a', verts=18,
               rot=(math.radians(70), 0, 0))
    cyl(0.12, 0.5, (0, 0.25, 1.1), '#3f454d', verts=10, metallic=0.6)
    for i in range(4):
        a = math.radians(45 + i * 90)
        box(0.1, 0.1, 0.5, (math.cos(a) * 0.36, math.sin(a) * 0.36, 0.6), WOOD_D)


def b_tesla(p):
    plinth(1.1, STONE_D)
    cyl(0.34, 0.7, (0, 0, 0.5), '#3f454d', verts=14, metallic=0.5)
    cyl(0.14, 0.6, (0, 0, 1.1), STEEL, verts=10, metallic=0.8, rough=0.25)
    sphere(0.22, (0, 0, 1.5), '#7fd0e8', emission=6.0)
    for i in range(3):
        a = math.radians(i * 120)
        cyl(0.05, 0.4, (math.cos(a) * 0.24, math.sin(a) * 0.24, 1.28), STEEL, verts=6, metallic=0.8)


def b_bombtower(p):
    plinth(1.5, '#6b573c')
    cyl(0.46, 0.85, (0, 0, 0.6), '#4a4a52', verts=16)
    cyl(0.54, 0.12, (0, 0, 1.08), '#5f5f6a', verts=16)
    sphere(0.42, (0, 0, 1.45), '#2f2f36', rough=0.4)
    cyl(0.07, 0.3, (0, 0, 1.9), '#8a7f6a', verts=6)
    sphere(0.1, (0, 0, 2.08), '#ff8a3c', emission=5.0)


def b_xbow(p):
    plinth(1.6, '#6b573c')
    cyl(0.55, 0.35, (0, 0, 0.35), '#4f5a6b', verts=20)
    box(0.6, 0.6, 0.3, (0, 0, 0.66), '#63708a')
    for sy in (-0.34, 0.34):
        b = torus(0.42, 0.06, (0, sy, 1.05), STEEL, rot=(math.radians(90), 0, 0),
                  metallic=0.7, rough=0.3)
    cyl(0.08, 1.1, (0, -0.1, 1.05), '#3f454d', verts=10,
        rot=(math.radians(90), 0, 0), metallic=0.6)
    sphere(0.12, (0, -0.62, 1.05), '#9fd8ff', emission=3.5)


def b_inferno(p):
    plinth(1.6, '#6b573c')
    cyl(0.5, 0.5, (0, 0, 0.42), '#3f3038', verts=18)
    cyl(0.34, 1.1, (0, 0, 1.2), '#5c3a3a', verts=16)
    cyl(0.42, 0.14, (0, 0, 1.8), '#7a4a42', verts=16)
    cone(0.3, 0.08, 0.5, (0, 0, 2.1), '#ff5a2b', verts=16, emission=4.0)
    for i in range(3):
        a = math.radians(i * 120)
        cyl(0.07, 0.9, (math.cos(a) * 0.4, math.sin(a) * 0.4, 0.95), '#4a3a3a', verts=8)


def b_eagle(p):
    plinth(2.2, '#6b573c')
    cyl(0.85, 0.4, (0, 0, 0.4), STONE, verts=24)
    cyl(0.6, 0.35, (0, 0, 0.78), shade(STONE, 1.08), verts=24)
    barrel = cyl(0.42, 1.5, (0, -0.2, 1.5), '#5f6b7a', verts=20,
                 rot=(math.radians(28), 0, 0), metallic=0.5, rough=0.4)
    cyl(0.5, 0.15, (0, -0.55, 2.15), GOLD, verts=20, rot=(math.radians(28), 0, 0),
        metallic=0.8, rough=0.3, emission=0.5)
    for i in range(4):
        a = math.radians(45 + i * 90)
        box(0.18, 0.18, 0.55, (math.cos(a) * 0.78, math.sin(a) * 0.78, 0.5), shade(STONE, 0.9))


def b_scatter(p):
    plinth(2.2, '#6b573c')
    cyl(0.8, 0.45, (0, 0, 0.42), STONE, verts=22)
    box(0.9, 0.9, 0.4, (0, 0, 0.85), shade(STONE, 1.05))
    for sx in (-0.34, 0.34):
        cyl(0.3, 0.8, (sx, -0.1, 1.4), '#5f6b7a', verts=16,
            rot=(math.radians(24), 0, math.radians(10 if sx > 0 else -10)), metallic=0.4)
    for i in range(5):
        sphere(0.12, (-0.4 + i * 0.2, 0.45, 1.15), '#8a9099', rough=0.6)


def b_monolithdef(p):
    plinth(2.0, '#2f2b3a')
    for i in range(3):
        s = 1.5 - i * 0.24
        box(s, s, 0.2, (0, 0, 0.28 + i * 0.2), shade('#4a4458', 0.9 + i * 0.06))
    slab = box(0.6, 0.36, 2.0, (0, 0, 1.85), '#332e42', rough=0.35)
    box(0.16, 0.05, 1.5, (0, -0.2, 1.85), '#a05cff', emission=4.5, bevel=0.01)
    sphere(0.16, (0, 0, 2.95), '#c9b8ff', emission=6.0)


def b_multiarcher(p):
    plinth(1.6, '#6b573c')
    cyl(0.46, 1.2, (0, 0, 0.75), STONE, verts=18)
    cyl(0.62, 0.14, (0, 0, 1.42), shade(STONE, 1.1), verts=18)
    for i in range(3):
        a = math.radians(i * 120)
        cyl(0.16, 0.5, (math.cos(a) * 0.34, math.sin(a) * 0.34, 1.72), shade(STONE, 1.16), verts=10)
        cone(0.2, 0, 0.3, (math.cos(a) * 0.34, math.sin(a) * 0.34, 2.1), '#35d6c0', verts=10, emission=1.2)


def b_ricochet(p):
    plinth(2.1, '#6b573c')
    cyl(0.75, 0.4, (0, 0, 0.4), '#5c4a3a', verts=22)
    box(0.8, 0.8, 0.35, (0, 0, 0.78), '#6b5744')
    cyl(0.26, 1.3, (0.1, -0.35, 1.25), '#4a5058', verts=16,
        rot=(math.radians(80), 0, math.radians(16)), metallic=0.7, rough=0.35)
    cyl(0.32, 0.14, (0.25, -0.85, 1.4), '#ff9a4d', verts=16,
        rot=(math.radians(80), 0, math.radians(16)), emission=2.0)
    for sx in (-0.5, 0.5):
        cyl(0.14, 0.2, (sx, 0.35, 0.62), '#3f454d', verts=12, metallic=0.6)


def b_prism(p):
    plinth(1.6, '#6b573c')
    cyl(0.5, 0.4, (0, 0, 0.38), '#3f4770', verts=20)
    cyl(0.34, 1.0, (0, 0, 1.05), '#4f5a92', verts=6)
    cone(0.42, 0.1, 0.75, (0, 0, 1.95), '#6fa8ff', verts=6, emission=2.0, rough=0.2)
    sphere(0.14, (0, 0, 2.4), '#ff9ae0', emission=6.0)
    for i in range(3):
        a = math.radians(i * 120 + 30)
        sphere(0.08, (math.cos(a) * 0.5, math.sin(a) * 0.5, 1.7), '#6fa8ff', emission=4.0)


def b_gravity(p):
    plinth(2.1, '#26314a')
    cyl(0.8, 0.45, (0, 0, 0.42), '#33405c', verts=24)
    cyl(0.4, 0.7, (0, 0, 1.0), '#455470', verts=20)
    sphere(0.44, (0, 0, 1.7), '#0d1426', rough=0.25)
    sphere(0.26, (0, 0, 1.7), '#5f8cff', emission=5.0)
    for i in range(3):
        t = torus(0.75 + i * 0.16, 0.035, (0, 0, 1.7), '#00e5c0' if i % 2 else '#5f8cff',
                  emission=2.6, rough=0.3)
        t.rotation_euler = (math.radians(74 + i * 12), 0, math.radians(i * 45))


def b_nullfield(p):
    plinth(1.6, '#2b2e36')
    cyl(0.55, 0.5, (0, 0, 0.44), '#3b3f49', verts=22)
    for i in range(4):
        a = math.radians(45 + i * 90)
        cyl(0.08, 1.4, (math.cos(a) * 0.42, math.sin(a) * 0.42, 1.1), STEEL, verts=8, metallic=0.7)
    torus(0.5, 0.06, (0, 0, 1.85), '#c8ccd8', emission=2.0, rough=0.3)
    sphere(0.2, (0, 0, 1.85), '#5fd0ff', emission=5.0)


def b_orbitalbeacon(p):
    plinth(2.2, '#26314a')
    cyl(0.85, 0.4, (0, 0, 0.4), '#34405f', verts=24)
    cyl(0.45, 1.3, (0, 0, 1.25), '#45557f', verts=18)
    sphere(0.4, (0, 0, 2.1), '#111a3a', rough=0.3)
    sphere(0.22, (0, 0, 2.1), '#ffd24d', emission=7.0)
    t = torus(0.85, 0.04, (0, 0, 2.1), '#4d7fff', emission=3.0, rough=0.3)
    t.rotation_euler = (math.radians(70), 0, 0)
    for i in range(4):
        a = math.radians(45 + i * 90)
        box(0.16, 0.16, 0.5, (math.cos(a) * 0.75, math.sin(a) * 0.75, 0.5), '#2f3a55')


def b_fracturecannon(p):
    plinth(2.1, '#3a2430')
    cyl(0.75, 0.42, (0, 0, 0.42), '#4f2f3d', verts=22)
    box(0.85, 0.85, 0.35, (0, 0, 0.8), '#5f3a48')
    cyl(0.24, 1.5, (0, -0.4, 1.35), '#7a4a58', verts=16,
        rot=(math.radians(78), 0, 0), metallic=0.4)
    cyl(0.3, 0.14, (0, -0.95, 1.5), '#ff4d6d', verts=16,
        rot=(math.radians(78), 0, 0), emission=4.0)
    for sx in (-0.5, 0.5):
        box(0.14, 0.14, 0.45, (sx, 0.4, 0.62), '#4a2b36')


def b_aegisgrid(p):
    plinth(2.2, '#1c423c')
    cyl(0.9, 0.35, (0, 0, 0.38), '#25574f', verts=6, rot=(0, 0, math.radians(30)))
    cyl(0.6, 0.6, (0, 0, 0.85), '#2f6b60', verts=6, rot=(0, 0, math.radians(30)))
    sphere(0.42, (0, 0, 1.55), '#00ffc2', emission=4.5, rough=0.2)
    for i in range(6):
        a = math.radians(i * 60)
        cone(0.13, 0, 0.45, (math.cos(a) * 0.62, math.sin(a) * 0.62, 1.4), '#00ffc2',
             verts=4, rot=(0, 0, math.radians(45)), emission=2.0)
    torus(0.95, 0.05, (0, 0, 1.2), '#ffe066', emission=2.4, rough=0.3)


def b_singularity(p):
    plinth(2.6, '#0d2233')
    cyl(1.1, 0.45, (0, 0, 0.42), '#123447', verts=28)
    for i in range(3):
        cyl(0.18, 1.4, (math.cos(math.radians(i * 120)) * 0.62,
                        math.sin(math.radians(i * 120)) * 0.62, 1.1), '#1c4d63', verts=10)
    sphere(0.55, (0, 0, 2.05), '#04070c', rough=0.15)
    sphere(0.3, (0, 0, 2.05), '#22e0ff', emission=9.0)
    for i in range(3):
        t = torus(0.95 + i * 0.2, 0.04, (0, 0, 2.05),
                  '#22e0ff' if i % 2 == 0 else '#c2ff4d', emission=3.2, rough=0.25)
        t.rotation_euler = (math.radians(68 + i * 16), 0, math.radians(i * 60))


def trap_generic(p, color, spikes=False, dome=True):
    plinth(0.9, '#5f6b45', h=0.1)
    if dome:
        cyl(0.32, 0.16, (0, 0, 0.18), '#4a4a52', verts=16)
        sphere(0.26, (0, 0, 0.3), color, rough=0.4, emission=0.6)
    if spikes:
        for i in range(4):
            a = math.radians(45 + i * 90)
            cone(0.07, 0, 0.3, (math.cos(a) * 0.2, math.sin(a) * 0.2, 0.4), STEEL,
                 verts=8, metallic=0.7)


BUILDING_BUILDERS = {
    'mine': b_mine, 'collector': b_collector, 'drill': b_drill,
    'vault': lambda p: b_vault(p, GOLD, '#8a6a1f'),
    'tank': b_tank, 'darkvault': b_darkvault, 'treasury': b_treasury, 'clock': b_clock,
    'barracks': lambda p: b_barracks(p, False), 'darkbarracks': lambda p: b_barracks(p, True),
    'camp': b_camp, 'lab': b_lab,
    'spell': lambda p: b_spellfac(p, False), 'darkspell': lambda p: b_spellfac(p, True),
    'siege': b_siege, 'pethouse': b_pethouse, 'herohall': b_herohall, 'smith': b_smith,
    'cannon': b_cannon, 'archer': b_archer, 'mortar': b_mortar, 'airdef': b_airdef,
    'wizard': b_wizard, 'sweeper': b_sweeper, 'tesla': b_tesla, 'bombtower': b_bombtower,
    'xbow': b_xbow, 'inferno': b_inferno, 'eagle': b_eagle, 'scatter': b_scatter,
    'monolithdef': b_monolithdef, 'multiarcher': b_multiarcher, 'ricochet': b_ricochet,
    'prism': b_prism, 'gravity': b_gravity, 'nullfield': b_nullfield,
    'orbital': b_orbitalbeacon, 'fracturecannon': b_fracturecannon,
    'aegis': b_aegisgrid, 'singularity': b_singularity,
    'trapbomb': lambda p: trap_generic(p, '#2f2f36', spikes=False),
    'trapspring': lambda p: trap_generic(p, '#8a7f3a', spikes=True),
    'trapair': lambda p: trap_generic(p, '#7fd0e8'),
    'trapgiant': lambda p: trap_generic(p, '#3a2f2f', spikes=True),
    'trapseek': lambda p: trap_generic(p, '#ff8a3c'),
    'trapskull': lambda p: trap_generic(p, '#e8e2d2'),
    'traptornado': lambda p: trap_generic(p, '#9fd8ff'),
    'trapmirror': lambda p: trap_generic(p, '#c8ccd8'),
    'trapemp': lambda p: trap_generic(p, '#a05cff'),
    'trapsand': lambda p: trap_generic(p, '#c9b48a', dome=True),
}


# ------------------------------------------------------------------ walls
def build_wall(skin):
    box(0.94, 0.94, 0.62, (0, 0, 0.31), skin['fill'])
    box(0.98, 0.98, 0.12, (0, 0, 0.66), shade(skin['fill'], 1.15))
    for sx in (-0.3, 0.3):
        for sy in (-0.3, 0.3):
            box(0.24, 0.24, 0.16, (sx, sy, 0.78), shade(skin['fill'], 1.22), bevel=0.02)
    box(0.86, 0.06, 0.4, (0, -0.46, 0.3), skin['edge'], bevel=0.01)
    if skin.get('glow'):
        box(0.5, 0.06, 0.08, (0, -0.48, 0.42), skin['glow'], emission=3.0, bevel=0)


# ------------------------------------------------------------------ units
def unit_body(tint, kind):
    """A chunky stylised figure; the silhouette changes with the role."""
    skin = '#e8c9a0'
    if kind == 'air':
        sphere(0.34, (0, 0, 0.75), tint, rough=0.5)
        for sx in (-1, 1):
            w = box(0.5, 0.1, 0.28, (sx * 0.42, 0.05, 0.92), shade(tint, 1.2), bevel=0.02)
            w.rotation_euler = (0, math.radians(sx * 22), 0)
        sphere(0.12, (0, -0.28, 0.8), '#1a1a20', bevel=0)
        cyl(0.16, 0.14, (0, 0, 0.38), shade(tint, 0.7), verts=14)
        return
    if kind == 'giant':
        cyl(0.34, 0.62, (0, 0, 0.31), shade(tint, 0.85), verts=16)
        box(0.66, 0.44, 0.62, (0, 0, 0.92), tint)
        sphere(0.26, (0, 0, 1.42), skin)
        for sx in (-1, 1):
            cyl(0.13, 0.6, (sx * 0.42, 0, 0.95), shade(tint, 0.9), verts=12)
        return
    if kind == 'caster':
        cone(0.34, 0.12, 0.78, (0, 0, 0.39), tint, verts=16)
        sphere(0.2, (0, 0, 0.88), skin)
        cone(0.24, 0, 0.42, (0, 0, 1.15), shade(tint, 0.75), verts=16)
        sphere(0.1, (0.26, -0.16, 0.85), shade(tint, 1.4), emission=4.0)
        return
    # default ground trooper
    cyl(0.22, 0.44, (0, 0, 0.22), shade(tint, 0.8), verts=14)
    box(0.42, 0.3, 0.42, (0, 0, 0.62), tint)
    sphere(0.19, (0, 0, 0.98), skin)
    cone(0.22, 0.06, 0.18, (0, 0, 1.14), shade(tint, 1.2), verts=14)
    for sx in (-1, 1):
        cyl(0.08, 0.38, (sx * 0.28, 0, 0.66), shade(tint, 0.9), verts=10)


def unit_kind(art, air, housing):
    if air:
        return 'air'
    if housing and housing >= 18:
        return 'giant'
    if art in ('mage', 'warlock', 'hexweaver', 'witchling', 'frost', 'voltaic', 'oracle', 'seer', 'warden'):
        return 'caster'
    return 'ground'


def build_unit(tint, kind, hero=False):
    unit_body(tint, kind)
    if hero:
        torus(0.3, 0.03, (0, 0, 1.3), '#ffd24d', emission=3.0, rough=0.3)
        for i in range(5):
            a = math.radians(i * 72)
            sphere(0.05, (math.cos(a) * 0.3, math.sin(a) * 0.3, 1.3), '#ffd24d', emission=4.0)


# ------------------------------------------------------------------ ground
def build_ground_tile():
    box(1.0, 1.0, 0.16, (0, 0, 0.08), '#6f9a4e')
    for (x, y, r) in ((-0.22, 0.18, 0.07), (0.24, -0.12, 0.05), (0.08, 0.3, 0.04)):
        sphere(r, (x, y, 0.17), '#5c8a42', bevel=0)


# -------------------------------------------------------------------- main
def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--only', default='', help='render only this group: townhall,building,wall,unit,ground')
    ap.add_argument('--samples', type=int, default=48)
    args = ap.parse_args(sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else sys.argv[1:])
    groups = set(g.strip() for g in args.only.split(',') if g.strip()) or \
        {'townhall', 'building', 'wall', 'unit', 'ground'}

    os.makedirs(OUT_DIR, exist_ok=True)
    manifest_path = os.path.join(OUT_DIR, 'sprites.json')
    if os.path.exists(manifest_path):
        MANIFEST.update(json.load(open(manifest_path)))

    if 'townhall' in groups:
        print('Town Halls...')
        for th in DATA['townHalls']:
            reset_scene()
            build_town_hall(th)
            render('th%02d' % th['level'], 4, samples=args.samples)

    if 'building' in groups:
        print('Buildings...')
        for b in DATA['buildings']:
            fn = BUILDING_BUILDERS.get(b['art'])
            if not fn:
                print('  (no model for %s, skipping)' % b['art'])
                continue
            reset_scene()
            fn(None)
            render('b_' + b['key'], max(2, b['size']), samples=args.samples)

    if 'wall' in groups:
        print('Walls...')
        for skin in DATA['wallSkins']:
            reset_scene()
            build_wall(skin)
            render('wall%02d' % skin['level'], 1, samples=max(24, args.samples // 2))

    if 'unit' in groups:
        print('Units...')
        for t in DATA['troops']:
            reset_scene()
            build_unit(t['tint'], unit_kind(t['art'], t['air'], t['housing']))
            render('u_' + t['key'], 1.4, samples=args.samples)
        for h in DATA['heroes']:
            reset_scene()
            build_unit(h['tint'], unit_kind(h['art'], False, 0), hero=True)
            render('u_' + h['key'], 1.4, samples=args.samples)
        for m in DATA['siege']:
            reset_scene()
            b_siege(None)
            render('u_' + m['key'], 2, samples=args.samples)

    if 'ground' in groups:
        print('Ground...')
        reset_scene()
        build_ground_tile()
        render('ground', 1, samples=32)

    json.dump(MANIFEST, open(manifest_path, 'w'), indent=1, sort_keys=True)
    write_manifest_js(MANIFEST)
    print('wrote %s (%d sprites)' % (manifest_path, len(MANIFEST)))


def write_manifest_js(manifest):
    """The game runs straight off the filesystem, where fetch() of a local JSON
    file is blocked, so the manifest also ships as a plain script."""
    path = os.path.join(ROOT, 'js', 'sprites-manifest.js')
    body = json.dumps(manifest, indent=1, sort_keys=True)
    with open(path, 'w') as fh:
        fh.write('/* Generated by tools/render_sprites.py -- do not edit by hand. */\n')
        fh.write('(function (G) {\n  G.SPRITES = ')
        fh.write(body.replace('\n', '\n  '))
        fh.write(';\n})(window.G = window.G || {});\n')


if __name__ == '__main__':
    main()
