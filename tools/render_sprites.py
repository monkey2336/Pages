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
    """A Principled surface with the roughness and colour broken up by noise.

    Flat colour on a bevelled box reads as plastic no matter how good the
    lighting is; a little variation across a surface is most of what separates
    "3D shape" from "material". Emissive surfaces skip it -- they are lights,
    not stone."""
    key = (color, round(rough, 2), round(metallic, 2), round(emission, 2))
    if key in _materials:
        return _materials[key]
    mat = bpy.data.materials.new('m_%d' % len(_materials))
    mat.use_nodes = True
    nt = mat.node_tree
    bsdf = nt.nodes['Principled BSDF']
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

    tex = nt.nodes.new('ShaderNodeTexNoise')
    tex.inputs['Scale'].default_value = 34.0
    tex.inputs['Detail'].default_value = 6.0
    tex.inputs['Roughness'].default_value = 0.62

    # Roughness variation: the difference between a wall and a plastic slab.
    rmap = nt.nodes.new('ShaderNodeMapRange')
    rmap.inputs['To Min'].default_value = max(0.05, rough - 0.16)
    rmap.inputs['To Max'].default_value = min(1.0, rough + 0.16)
    nt.links.new(tex.outputs['Fac'], rmap.inputs['Value'])
    nt.links.new(rmap.outputs['Result'], bsdf.inputs['Roughness'])

    # Colour variation, kept subtle -- enough to catch the light, not enough
    # to muddy a palette the whole game is keyed to.
    hsv = nt.nodes.new('ShaderNodeHueSaturation')
    hsv.inputs['Color'].default_value = hex_rgba(color)
    val = nt.nodes.new('ShaderNodeMapRange')
    val.inputs['To Min'].default_value = 0.9
    val.inputs['To Max'].default_value = 1.1
    nt.links.new(tex.outputs['Fac'], val.inputs['Value'])
    nt.links.new(val.outputs['Result'], hsv.inputs['Value'])
    nt.links.new(hsv.outputs['Color'], bsdf.inputs['Base Color'])

    # Fine surface relief. Small scale, small strength: grain, not lumps.
    fine = nt.nodes.new('ShaderNodeTexNoise')
    fine.inputs['Scale'].default_value = 180.0
    fine.inputs['Detail'].default_value = 4.0
    bump = nt.nodes.new('ShaderNodeBump')
    bump.inputs['Strength'].default_value = 0.14 if metallic < 0.5 else 0.07
    bump.inputs['Distance'].default_value = 0.006
    nt.links.new(fine.outputs['Fac'], bump.inputs['Height'])
    nt.links.new(bump.outputs['Normal'], bsdf.inputs['Normal'])

    _materials[key] = mat
    return mat


def _finish(obj, color, bevel=0.03, rough=0.6, metallic=0.0, emission=0.0, smooth=False):
    obj.data.materials.append(material(color, rough, metallic, emission))
    if bevel > 0:
        m = obj.modifiers.new('bev', 'BEVEL')
        m.width = bevel
        m.segments = 3
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
    """Three lights and a sky. The key is deliberately soft-edged -- hard sun
    shadows on a 3-metre model read as a toy under a desk lamp."""
    # Warm key from the upper left, matching the light direction the sprites
    # are composited under in game.
    bpy.ops.object.light_add(type='SUN', location=(-4, -6, 8))
    key = bpy.context.object
    key.data.energy = 3.6
    key.data.angle = math.radians(22)     # wide disc = soft shadow edges
    key.data.color = (1.0, 0.95, 0.86)
    key.rotation_euler = (math.radians(48), 0, math.radians(-38))

    # Cool fill from the right keeps shadow sides readable.
    bpy.ops.object.light_add(type='AREA', location=(5 * scale, -2 * scale, 3 * scale))
    fill = bpy.context.object
    fill.data.energy = 300 * scale * scale
    fill.data.size = 9 * scale
    fill.data.color = (0.74, 0.83, 1.0)
    fill.rotation_euler = (math.radians(70), 0, math.radians(115))

    # Bounce from below-front, standing in for light coming back off the
    # ground. Without it the undersides go dead black.
    bpy.ops.object.light_add(type='AREA', location=(0, -3.5 * scale, 0.4 * scale))
    bounce = bpy.context.object
    bounce.data.energy = 90 * scale * scale
    bounce.data.size = 10 * scale
    bounce.data.color = (1.0, 0.96, 0.86)
    bounce.rotation_euler = (math.radians(96), 0, 0)

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
    """Deliberately does nothing.

    Shadows used to be baked into each PNG by a catcher plane four tiles wide.
    They were then clipped by the sprite frame, leaving a hard straight edge
    across the grass, and a sprite's shadow could only ever fall on its own
    transparent pixels -- never across the building next to it. The game draws
    a ground shadow under each sprite instead, which clips to nothing and
    layers correctly."""
    return None


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
    px = max(96, min(int(os.environ.get('SPRITE_MAX_PX', '768')), px))
    # Render at twice the published size. The board zooms to 5x now, and a
    # sprite drawn at its natural pixel size goes soft the moment you zoom in.
    ss = int(os.environ.get('SPRITE_SUPERSAMPLE', '2'))
    sc.render.resolution_x = px * ss
    sc.render.resolution_y = px * ss
    sc.cycles.samples = samples
    sc.cycles.use_denoising = True
    cam = add_camera(ortho, aim_z)
    add_lights(max(1.0, footprint * 0.6))
    add_shadow_catcher(footprint)
    ax, ay = project_origin(sc, cam, px)   # in published (1x) pixels
    path = os.path.join(OUT_DIR, name + '.png')
    sc.render.filepath = path
    bpy.ops.render.render(write_still=True)
    # drawnShadow marks a sprite rendered without a baked shadow, so the game
    # knows to draw one. Sprites from the old set keep theirs until they are
    # re-rendered, which lets the two sets coexist mid-rebuild.
    MANIFEST[name] = {'file': 'assets/sprites/%s.png' % name, 'w': px, 'h': px,
                      'anchorX': ax, 'anchorY': ay, 'footprint': footprint,
                      'drawnShadow': True}
    print('  rendered %s (%dpx published, %dpx rendered)' % (name, px, px * ss))


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


def grow(before, factor, lift):
    """Scale everything built since `before` about the origin and lift it.
    The hall families were written around a 1.7-unit keep; the Town Hall owns
    a 4x4 plot, so the body is grown to actually fill the ground it sits on."""
    for o in bpy.data.objects:
        if o in before or o.type != 'MESH':
            continue
        o.scale = tuple(s * factor for s in o.scale)
        o.location = (o.location[0] * factor, o.location[1] * factor,
                      o.location[2] * factor + lift)


def hall_steps(T, side=-1):
    """A flight of steps up the front of the plinth, so the hall is something
    you approach rather than a block dropped on a slab."""
    for i in range(4):
        w = 1.15 - i * 0.06
        box(w, 0.22, 0.12, (0, side * (1.5 + i * 0.2), 0.5 - i * 0.12),
            shade(T['stone'], 1.0 + i * 0.03), bevel=0.02)
    for sx in (-1, 1):
        box(0.16, 0.9, 0.34, (sx * 0.72, side * 1.75, 0.42), T['stoneDark'], bevel=0.03)
        if L() >= 10:
            sphere(0.1, (sx * 0.72, side * 1.75, 0.64), T['accent'], emission=1.6)


def build_town_hall(th):
    """The centrepiece gets the same footprint treatment as every other
    building -- dirt pad, dressed rim, corner blocks, yard clutter -- in the
    materials of its own era, so the hall matches the walls and the rest of
    the base, and only then puts its own architecture on top."""
    lvl = th['level']
    CUR_LEVEL[0] = lvl
    b_levels = DATA['buildingLevels']
    entry = b_levels[max(0, min(len(b_levels) - 1, lvl - 1))]
    T = entry['mat']
    ornate = 1.0 + entry.get('detail', 0.0) * 3.0
    p, d = th['palette'], th['design']

    pad(3.6, T, ornate)
    # Plinth: coursed stone in era materials, banded and stepped.
    courses(2.7, 2.7, 0.2, 0.34, 3, T)
    trim_band(2.7, 2.7, 0.56, T, ornate)
    box(2.5, 2.5, 0.06, (0, 0, 0.6), shade(T['stone'], 1.06), bevel=0.02)
    hall_steps(T)
    rivets(1.38, 0.58, T, n=10, size=0.05)

    before = set(bpy.data.objects)
    fn, variant = TH_BUILDERS.get(d['body'], (th_castle, 0))
    fn(p, d, variant)
    grow(before, 1.16, 0.62)

    # Braziers at the plinth corners: light that reads at village zoom.
    for i in range(4):
        a = math.radians(45 + i * 90)
        cx, cy = math.cos(a) * 1.62, math.sin(a) * 1.62
        cyl(0.11, 0.44, (cx, cy, 0.82), T['stoneDark'], verts=10)
        cyl(0.16, 0.1, (cx, cy, 1.06), T['trim'], verts=10, metallic=0.7, rough=0.3)
        sphere(0.12, (cx, cy, 1.16), p['glow'], emission=3.2)

    # Shared ornament layer: banners and floating orbs, counts vary per level.
    for i in range(min(4, d['banners'])):
        a = math.radians(35 + i * (360 / max(1, min(4, d['banners']))))
        banner((math.cos(a) * 1.5, math.sin(a) * 1.5), 1.45 + (i % 2) * 0.17,
               p['accent'] if i % 2 == 0 else p['accent2'])
    for i in range(min(5, d['orbs'])):
        a = math.radians(i * (360 / max(1, min(5, d['orbs']))) + 20)
        sphere(0.1, (math.cos(a) * 1.45, math.sin(a) * 1.45, 3.2 + (i % 3) * 0.22),
               p['glow'], emission=6.0)


# --------------------------------------------------------------- buildings
# Every building is built from the materials of the era its level belongs to,
# and gains ornament as its art tier rises: a tier 1 Cannon is lashed timber on
# a dirt pad, a tier 4 Cannon is alloy with gold ribs and a lit core. The
# shared detail toolkit below is what gives all of them their density.

# Resource colours stay constant across eras: gold is gold at every Town Hall.
GOLD = '#f0b429'
ELIXIR = '#c05cf0'
DARK = '#7a4dd6'


# The level currently being rendered. The shared detail helpers below read it,
# which is how every building gains structure level by level rather than only
# changing colour.
CUR_LEVEL = [1]


def L():
    return CUR_LEVEL[0]


def level_look(table, level):
    """Materials + ornament density for one level. There are no shared tiers:
    every level in the table has its own blended palette."""
    entry = table[max(0, min(len(table) - 1, level - 1))]
    detail = entry.get('detail', 0.0)
    # Builders were written against a 1..4 ornateness scale; detail drives it
    # continuously so ornament grows level by level rather than in jumps.
    return entry['mat'], 1.0 + detail * 3.0


# ------------------------------------------------------------ detail kit
# ------------------------------------------------------- high-detail kit
# The modelling language, chosen from the style demos: carved and ornate for
# most of the game, turning engineered and machined as the Town Hall climbs.
# `machined(level)` is the blend between the two, so the change happens across
# the run rather than at a cutover, and every builder gets it for free.

SIDES = 64          # segments on anything round: no countable facets
COURSE = 0.042      # thickness of one stacked course


def machined(level=None):
    """0 = carved stone, 1 = engineered plate. Crosses over in the twenties."""
    lv = L() if level is None else level
    return max(0.0, min(1.0, (lv - 17) / 11.0))


def lathe(profile, z0, T, color=None, rough=0.6, metallic=0.0, seg=COURSE):
    """Build a curved surface by stacking thin discs along a radius profile.
    `profile` is a list of radii from bottom to top. This is what separates a
    turned column from a cone with twelve sides."""
    col = color or T['stone']
    for i, r in enumerate(profile):
        cyl(r, seg * 1.06, (0, 0, z0 + i * seg),
            shade(col, 1.0 + (i % 2) * 0.045), verts=SIDES,
            rough=rough, metallic=metallic, bevel=0.005)
    return z0 + len(profile) * seg


def drum(r_bottom, r_top, height, z0, T, color=None, metallic=0.0):
    """A tapered round tower body, coursed like real masonry."""
    n = max(4, int(height / COURSE))
    prof = [r_bottom + (r_top - r_bottom) * (i / max(1, n - 1.0)) for i in range(n)]
    return lathe(prof, z0, T, color, metallic=metallic)


def string_course(r, z, T, gilded=True):
    """A projecting band around a tower -- the single cheapest way to make a
    cylinder read as architecture rather than a pipe."""
    m = machined()
    col = T['trim'] if gilded else T['stoneDark']
    cyl(r + 0.03, 0.026, (0, 0, z), col, verts=SIDES,
        metallic=0.3 + m * 0.5, rough=0.34 - m * 0.1, bevel=0.006)
    cyl(r + 0.045, 0.014, (0, 0, z + 0.02), shade(col, 1.12), verts=SIDES,
        metallic=0.4 + m * 0.45, rough=0.3, bevel=0.004)
    if gilded and m < 0.6:
        studs = 20
        for i in range(studs):
            a = math.radians(i * (360.0 / studs))
            sphere(0.019, (math.cos(a) * (r + 0.04), math.sin(a) * (r + 0.04), z),
                   col, metallic=0.85, rough=0.2)


def merlons(r, z, T, count=14):
    """Crenellation with real gaps and capstones."""
    m = machined()
    for i in range(count):
        a = math.radians(i * (360.0 / count))
        x, y = math.cos(a) * r, math.sin(a) * r
        box(0.115, 0.085, 0.16 + m * 0.03, (x, y, z + 0.08), T['stone'],
            rot=(0, 0, a), bevel=0.013)
        box(0.125, 0.095, 0.028, (x, y, z + 0.17), shade(T['stone'], 1.14),
            rot=(0, 0, a), bevel=0.007)
        if m > 0.45:                       # plate caps take over from stone
            box(0.1, 0.07, 0.02, (x, y, z + 0.2), T['metalDark'],
                rot=(0, 0, a), metallic=0.8, rough=0.28, bevel=0.004)


def buttresses(r, z0, height, T, count=4, offset=45):
    """Stepped supports climbing the wall. Carved when early, plated later."""
    m = machined()
    steps = max(4, int(height / 0.12))
    for i in range(count):
        a = math.radians(i * (360.0 / count) + offset)
        cx, cy = math.cos(a), math.sin(a)
        for j in range(steps):
            t = j / float(steps)
            box(0.17 - t * 0.06, 0.13, 0.11,
                (cx * (r * (1 + t * 0.06)), cy * (r * (1 + t * 0.06)), z0 + j * (height / steps)),
                shade(T['stone'] if m < 0.5 else T['metal'], 0.92 + t * 0.08),
                rot=(0, 0, a), metallic=m * 0.6, rough=0.5 - m * 0.2, bevel=0.012)


def balcony(r, z, T, rails=24):
    """A gallery ring with a rail: reads instantly as somewhere people stand."""
    m = machined()
    cyl(r + 0.1, 0.03, (0, 0, z), T['trim'] if m < 0.5 else T['metalDark'],
        verts=SIDES, metallic=0.5 + m * 0.35, rough=0.3, bevel=0.006)
    for i in range(rails):
        a = math.radians(i * (360.0 / rails))
        cyl(0.015, 0.13, (math.cos(a) * (r + 0.07), math.sin(a) * (r + 0.07), z + 0.07),
            T['trim'], verts=10, metallic=0.75, rough=0.26)
    cyl(r + 0.09, 0.022, (0, 0, z + 0.14), T['trim'], verts=SIDES,
        metallic=0.75, rough=0.26, bevel=0.005)


def lanterns(r, z, T, count=8):
    for i in range(count):
        a = math.radians(i * (360.0 / count) + 22)
        x, y = math.cos(a) * r, math.sin(a) * r
        cyl(0.028, 0.09, (x, y, z - 0.06), T['metalDark'], verts=10,
            metallic=0.7, rough=0.35)
        sphere(0.047, (x, y, z), T['glow'], emission=1.8)


def spire(r, height, z0, T, verts=SIDES):
    """A lathed conical roof with a lip and a finial, not a twelve-sided cone."""
    m = machined()
    n = max(6, int(height / 0.032))
    cyl(r + 0.06, 0.03, (0, 0, z0 - 0.01), shade(T['roofDark'], 1.05),
        verts=verts, bevel=0.008)
    for i in range(n):
        t = i / float(n - 1)
        cyl(r * (1 - t) + 0.028, 0.033, (0, 0, z0 + i * 0.032),
            shade(T['roof'], 1.0 - t * 0.2), verts=verts, bevel=0.004)
    top = z0 + n * 0.032
    if m > 0.5:
        cyl(0.075, 0.14, (0, 0, top + 0.06), T['accent'], verts=24, emission=1.5)
    else:
        sphere(0.05, (0, 0, top + 0.04), T['trim'], metallic=0.82, rough=0.2)
    return top


def arrow_slit(r, z, T, count=4, offset=45, h=0.26):
    for i in range(count):
        a = math.radians(i * (360.0 / count) + offset)
        box(0.055, 0.1, h, (math.cos(a) * r, math.sin(a) * r, z), '#191c20',
            rot=(0, 0, a), bevel=0.008)
        box(0.09, 0.05, h + 0.06, (math.cos(a) * (r + 0.01), math.sin(a) * (r + 0.01), z),
            shade(T['stoneDark'], 1.05), rot=(0, 0, a), bevel=0.008)


def plated_column(r, height, z0, T, segs=None):
    """The engineered counterpart to a coursed drum: plate segments with
    recessed seams and bolt rows."""
    segs = segs or max(4, int(height / 0.13))
    for i in range(segs):
        z = z0 + i * (height / segs)
        cyl(r, (height / segs) * 0.86, (0, 0, z), T['metal'], verts=SIDES,
            metallic=0.72, rough=0.33, bevel=0.012)
        cyl(r * 1.04, 0.016, (0, 0, z + (height / segs) * 0.5), T['metalDark'],
            verts=SIDES, metallic=0.8, rough=0.28)
        for j in range(10):
            a = math.radians(j * 36 + i * 11)
            sphere(0.017, (math.cos(a) * r * 1.01, math.sin(a) * r * 1.01, z),
                   T['metal'], metallic=0.9, rough=0.2)
    for i in range(4):
        a = math.radians(i * 90)
        box(0.028, 0.045, height * 0.92,
            (math.cos(a) * r * 1.01, math.sin(a) * r * 1.01, z0 + height / 2),
            T['metalDark'], rot=(0, 0, a), metallic=0.75, rough=0.3, bevel=0.005)
    return z0 + height


def tower_body(r0, r1, height, z0, T):
    """Whichever body the level calls for. Builders ask for a tower; the level
    decides whether it is masonry or plate."""
    if machined() > 0.55:
        return plated_column(r1, height, z0, T)
    return drum(r0, r1, height, z0, T)


def pad(size, T, tier):
    """Dirt pad, dressed stone rim, corner blocks and yard clutter. The rim
    gains steps, the corners gain caps and the yard gains props as the level
    rises, so two adjacent levels never have the same footprint detail."""
    lv = L()
    box(size, size, 0.12, (0, 0, 0.06), '#6b573c')
    box(size * 0.94, size * 0.94, 0.1, (0, 0, 0.15), T['stoneDark'])
    # extra rim steps every few levels
    for i in range(lv // 9):
        s2 = size * (0.99 - i * 0.03)
        box(s2, s2, 0.05, (0, 0, 0.2 + i * 0.05), shade(T['stoneDark'], 1.08 + i * 0.05))
    r = size * 0.44
    corners = 4 if lv < 6 else 8
    for i in range(corners):
        a = math.radians(45 + i * (360.0 / corners))
        box(0.19, 0.19, 0.13 + (lv % 5) * 0.012,
            (math.cos(a) * r, math.sin(a) * r, 0.19), T['stone'], bevel=0.02)
        if lv >= 12:
            box(0.11, 0.11, 0.05, (math.cos(a) * r, math.sin(a) * r, 0.27), T['trim'],
                metallic=0.6, rough=0.35, bevel=0.01)
    if lv >= 20:
        for i in range(4):
            a = math.radians(45 + i * 90)
            sphere(0.05, (math.cos(a) * r, math.sin(a) * r, 0.33), T['accent'], emission=1.4)
    yard_props(size, T)


def yard_props(size, T):
    """Crates, barrels and sandbags around the base. Which props appear is a
    function of the level, so the yard fills up as a building is upgraded."""
    lv = L()
    r = size * 0.4
    if lv >= 3:
        crate(-r, -r * 0.85, 0.2, T, 0.16 + (lv % 3) * 0.01)
    if lv >= 7:
        barrel(r * 0.95, -r * 0.8, 0.2, T, 0.1, 0.22)
    if lv >= 11:
        sandbags(-r * 0.2, -r * 1.02, 0.2, T, 2)
    if lv >= 16:
        crate(r * 0.9, r * 0.85, 0.2, T, 0.15)
        crate(r * 0.72, r * 0.86, 0.36, T, 0.11)
    if lv >= 22:
        pipes(-r * 1.0, r * 0.6, 0.2, T, 0.34, 2)
    if lv >= 26:
        for i in range(3):
            sphere(0.055, (-r + i * 0.13, r * 0.95, 0.26), T['accent'], emission=1.3)


def courses(w, d, z0, h, rows, T, inset=0.02):
    """Stacked masonry. Courses alternate in height and inset, every third one
    projects slightly, and the wall finishes on a chamfered capstone -- the
    difference between coursed stone and a pile of identical slabs."""
    rows = rows + L() // 6
    step = h / rows
    m = machined()
    box(w + 0.05, d + 0.05, step * 0.5, (0, 0, z0 + step * 0.25),
        shade(T['stoneDark'], 0.92), bevel=0.02)
    for i in range(rows):
        t = i / float(max(1, rows - 1))
        s2 = 1.0 - inset * t
        tall = step * (0.92 if i % 2 == 0 else 0.8)
        proud = 0.018 if i % 3 == 2 else 0.0
        box(w * s2 + proud, d * s2 + proud, tall, (0, 0, z0 + step * (i + 0.5)),
            shade(T['stone'] if m < 0.55 else T['metal'], 1.0 + (i % 2) * 0.06 - t * 0.05),
            metallic=m * 0.55, rough=0.62 - m * 0.25, bevel=0.014)
        if i % 3 == 2 and m < 0.6:            # visible joints on the proud course
            box(w * s2 + proud + 0.006, d * s2 + proud + 0.006, 0.012,
                (0, 0, z0 + step * (i + 1.0)), shade(T['stoneDark'], 0.9), bevel=0.004)
    cap = w * (1.0 - inset) + 0.05
    box(cap, d * (1.0 - inset) + 0.05, step * 0.34, (0, 0, z0 + h + step * 0.1),
        shade(T['stone'], 1.14), bevel=0.02)
    return z0 + h + step * 0.3


def trim_band(w, d, z, T, tier, thick=0.07):
    lv = L()
    col = T['trim'] if lv >= 13 else T['metalDark']
    box(w + 0.04, d + 0.04, thick + (lv % 4) * 0.006, (0, 0, z), col,
        metallic=0.55, rough=0.35, bevel=0.02)
    # a second, thinner band once the building is well up its curve
    if lv >= 17:
        box(w + 0.08, d + 0.08, 0.035, (0, 0, z - 0.11), shade(col, 0.85),
            metallic=0.6, rough=0.3, bevel=0.01)


def ring_band(r, z, T, tier, minor=0.035):
    col = T['trim'] if tier >= 3 else T['metal']
    torus(r, minor, (0, 0, z), col, metallic=0.6, rough=0.3)


def window(x, y, z, T, w=0.16, h=0.22, lit=True):
    lv = L()
    box(w + 0.06, 0.05, h + 0.06, (x, y, z), T['stoneDark'], bevel=0.01)
    box(w, 0.04, h, (x, y - 0.02, z), T['glow'] if lit else T['metalDark'],
        emission=1.3 if lit else 0, bevel=0.01)
    if lv >= 9:   # mullion
        box(0.02, 0.05, h, (x, y - 0.03, z), T['stoneDark'], bevel=0)
    if lv >= 21:  # lintel
        box(w + 0.12, 0.05, 0.04, (x, y - 0.01, z + h / 2 + 0.05), T['trim'],
            metallic=0.6, rough=0.3, bevel=0.01)


def window_row(count, y, z, T, spread=0.9):
    count = count + L() // 11
    for i in range(count):
        x = -spread / 2 + (spread * i / max(1, count - 1)) if count > 1 else 0
        window(x, y, z, T)


def rivets(r, z, T, n=8, size=0.045):
    n = n + L() // 2
    for i in range(n):
        a = math.radians(i * (360.0 / n))
        sphere(size, (math.cos(a) * r, math.sin(a) * r, z), T['metalDark'],
               metallic=0.7, rough=0.35)


def roof_cone(r, h, z, T, tier, verts=16):
    """Kept for the builders that ask for a cone by name -- now a turned
    surface with a lip and a finial, like everything else."""
    return spire(r, h, z, T)


def roof_pyramid(r, h, z, T, tier):
    lv = L()
    pyramid(r, h, (0, 0, z + h / 2), T['roof'])
    box(r * 1.5, r * 1.5, 0.07, (0, 0, z + 0.02), T['roofDark'])
    for i in range(lv // 10):   # stepped eaves
        box(r * (1.3 - i * 0.2), r * (1.3 - i * 0.2), 0.05,
            (0, 0, z + 0.1 + i * 0.09), shade(T['roofDark'], 1.12))
    if lv >= 6:
        box(0.06, r * 1.5, 0.05, (0, 0, z + h * 0.5), shade(T['roof'], 0.8))
    if lv >= 13:
        for i in range(4):
            a = math.radians(45 + i * 90)
            box(0.07, 0.07, 0.2, (math.cos(a) * r * 0.62, math.sin(a) * r * 0.62, z + 0.16),
                T['trim'], metallic=0.6, rough=0.35, bevel=0.01)
    if lv >= 24:
        sphere(0.075, (0, 0, z + h + 0.06), T['accent'], emission=1.5)


def flag(x, y, z, T, h=0.55):
    cyl(0.028, h, (x, y, z + h / 2), T['wood'], verts=8, bevel=0)
    box(0.02, 0.24, 0.17, (x, y + 0.13, z + h - 0.12), T['cloth'], bevel=0.01)


def crate(x, y, z, T, s=0.2):
    box(s, s, s, (x, y, z + s / 2), T['wood'])
    box(s * 1.04, 0.03, 0.03, (x, y, z + s * 0.75), T['metalDark'], metallic=0.6)


def barrel(x, y, z, T, r=0.12, h=0.28):
    cyl(r, h, (x, y, z + h / 2), T['wood'], verts=12)
    for zz in (0.3, 0.7):
        torus(r * 1.02, 0.02, (x, y, z + h * zz), T['metalDark'], metallic=0.7, rough=0.35)


def sandbags(x, y, z, T, n=3):
    for i in range(n):
        sphere(0.11, (x + i * 0.12 - 0.12, y, z + 0.07), '#9a8a68', rough=0.85)
        sphere(0.1, (x + i * 0.12 - 0.06, y, z + 0.2), '#8d7d5c', rough=0.85)


def pipes(x, y, z, T, h=0.5, n=2):
    for i in range(n):
        cyl(0.055, h, (x + i * 0.13, y, z + h / 2), T['metal'], verts=10,
            metallic=0.6, rough=0.35)
    box(0.13 * n + 0.06, 0.09, 0.06, (x + (n - 1) * 0.065, y, z + h), T['metalDark'],
        metallic=0.6)


def cog(x, y, z, T, r=0.16, teeth=8):
    cyl(r, 0.06, (x, y, z), T['metalDark'], verts=16, rot=(math.radians(90), 0, 0),
        metallic=0.7, rough=0.35)
    for i in range(teeth):
        a = math.radians(i * (360.0 / teeth))
        box(0.055, 0.05, 0.055, (x + math.cos(a) * r, y, z + math.sin(a) * r),
            T['metal'], metallic=0.7, rough=0.35, bevel=0.01)


def core(r, loc, T, strength=1.6):
    sphere(r * 1.35, loc, '#0b1016', rough=0.2)
    sphere(r, loc, T['accent'], emission=strength, rough=0.15)


def orbit(r, z, T, count=2):
    for i in range(count):
        t = torus(r + i * 0.16, 0.03, (0, 0, z), T['accent'] if i % 2 == 0 else T['glow'],
                  emission=1.5, rough=0.25)
        t.rotation_euler = (math.radians(68 + i * 20), 0, math.radians(i * 50))


def tier_topper(z, T, tier, r=0.5):
    """The thing that tells you at a glance this building has been upgraded.
    Deliberately small: a halo, not a second building."""
    tier = 1 + L() / 10.0
    if tier >= 4:
        for i in range(2):
            t = torus(r * 0.6 + i * 0.11, 0.026,
                      (0, 0, z), T['accent'] if i % 2 == 0 else T['glow'],
                      emission=1.5, rough=0.25)
            t.rotation_euler = (math.radians(72), 0, math.radians(i * 45))
        sphere(0.08, (0, 0, z), T['accent'], emission=1.8)
    elif tier == 3:
        ring_band(r * 0.72, z, T, tier)
        sphere(0.075, (0, 0, z + 0.05), T['accent'], emission=1.5)


# ---------------------------------------------------------- resource
def b_mine(T, tier):
    """A shaft head: coursed collar, a winding frame with a pulley over it, and
    the ore coming up in a cart."""
    lv = L()
    m = machined()
    pad(1.75, T, tier)
    courses(1.2, 1.2, 0.2, 0.4, 2, T)
    # the shaft mouth, ringed in dressed stone
    cyl(0.46, 0.1, (0, 0, 0.68), T['stoneDark'], verts=SIDES, bevel=0.01)
    cyl(0.38, 0.06, (0, 0, 0.72), '#15171a', verts=SIDES)
    string_course(0.48, 0.66, T)
    # winding frame: four legs meeting a headgear beam with a pulley
    for sx in (-1, 1):
        for sy in (-1, 1):
            cyl(0.04, 0.86, (sx * 0.34, sy * 0.3, 1.1), T['wood'] if m < 0.5 else T['metal'],
                verts=12, rot=(math.radians(sy * 7), math.radians(-sx * 7), 0),
                metallic=m * 0.7, rough=0.45)
    box(0.72, 0.12, 0.08, (0, 0, 1.55), T['wood'] if m < 0.5 else T['metalDark'],
        metallic=m * 0.6, rough=0.45, bevel=0.014)
    cyl(0.17, 0.06, (0, 0, 1.62), T['metal'], verts=32, rot=(0, math.radians(90), 0),
        metallic=0.8, rough=0.28)
    cyl(0.05, 0.08, (0, 0, 1.62), T['metalDark'], verts=16, rot=(0, math.radians(90), 0),
        metallic=0.85, rough=0.24)
    cyl(0.012, 0.72, (0, 0.02, 1.26), '#3a3f45', verts=8)     # hoist rope
    # ore heap, growing with the level
    nug = 4 + min(8, lv // 3)
    for i in range(nug):
        a = math.radians(i * (360.0 / nug))
        rr = 0.22 + (i % 3) * 0.05
        sphere(0.1 - (i % 3) * 0.012, (math.cos(a) * rr, math.sin(a) * rr + 0.02, 0.78),
               GOLD, metallic=0.72, rough=0.28, emission=0.3)
    sphere(0.17, (0, 0.02, 0.85), GOLD, metallic=0.75, rough=0.24, emission=0.45)
    # cart on a short rail
    box(0.3, 0.22, 0.16, (0.56, 0.4, 0.5), T['metalDark'], metallic=0.6, rough=0.4, bevel=0.02)
    for sx in (-1, 1):
        cyl(0.06, 0.03, (0.56 + sx * 0.13, 0.4, 0.42), T['metal'], verts=16,
            rot=(0, math.radians(90), 0), metallic=0.8, rough=0.3)
    for sy in (-1, 1):
        box(0.5, 0.03, 0.02, (0.56, 0.4 + sy * 0.09, 0.4), T['metalDark'],
            metallic=0.7, rough=0.35)
    if lv >= 8:
        crate(-0.62, -0.5, 0.2, T)
    yard_props(1.75, T)
    tier_topper(1.9, T, tier, 0.44)
def b_collector(T, tier):
    """A pressure vessel on a coursed plinth: turned tank, welded bands, a
    domed cap with a sight glass, and pipework running off the pad."""
    lv = L()
    m = machined()
    pad(1.75, T, tier)
    drum(0.6, 0.55, 0.86, 0.24, T)
    for zz in (0.4, 0.68, 0.96):
        string_course(0.57, zz, T, gilded=(m < 0.5))
    rivets(0.58, 0.55, T, 16, size=0.028)
    # domed cap, lathed
    for i in range(10):
        t = i / 9.0
        cyl(0.58 * math.cos(t * 1.35), 0.035, (0, 0, 1.12 + i * 0.034),
            shade(T['stoneDark'], 1.0 + t * 0.1), verts=SIDES, bevel=0.006)
    sphere(0.4, (0, 0, 1.24), ELIXIR, emission=1.5, rough=0.16)
    # sight glass down the side
    box(0.07, 0.05, 0.44, (0, -0.56, 0.62), ELIXIR, emission=1.1, bevel=0.01)
    box(0.11, 0.05, 0.5, (0, -0.575, 0.62), T['metalDark'], metallic=0.7, rough=0.3, bevel=0.01)
    for i in range(3):
        a = math.radians(i * 120 + 30)
        pipes(math.cos(a) * 0.66, math.sin(a) * 0.66, 0.2, T, 0.5, 1)
    if lv >= 10:
        balcony(0.58, 1.02, T, 22)
    yard_props(1.75, T)
    tier_topper(1.8, T, tier, 0.44)
def b_drill(T, tier):
    pad(1.7, T, tier)
    courses(1.05, 1.05, 0.2, 0.4, 2, T)
    cyl(0.36, 0.9, (0, 0, 1.05), T['metalDark'], verts=16, metallic=0.5, rough=0.4)
    for zz in (0.75, 1.05, 1.35):
        torus(0.38, 0.03, (0, 0, zz), T['metal'], metallic=0.7, rough=0.3)
    cone(0.34, 0.05, 0.55, (0, 0, 1.78), DARK, verts=16, emission=1.2)
    for sx in (-0.55, 0.55):
        pipes(sx, 0.34, 0.2, T, 0.62, 2)
    barrel(-0.6, -0.48, 0.2, T)
    if tier >= 3:
        trim_band(1.1, 1.1, 0.62, T, tier)
    tier_topper(2.15, T, tier, 0.4)


def b_vault(T, tier, color=GOLD, accent='#8a6a1f'):
    pad(1.7, T, tier)
    courses(1.3, 1.1, 0.2, 0.55, 3, T)
    box(1.42, 1.22, 0.12, (0, 0, 0.81), accent, metallic=0.5, rough=0.4)
    for i in range(3):
        sphere(0.2, (-0.34 + i * 0.34, 0, 0.98), color, metallic=0.6, rough=0.28, emission=0.45)
    box(0.4, 0.06, 0.42, (0, -0.58, 0.42), T['metalDark'], metallic=0.6)
    rivets(0.0, 0.0, T, 0)
    for sx in (-0.5, 0.5):
        box(0.1, 0.1, 0.6, (sx, -0.56, 0.5), T['stoneDark'])
    if tier >= 2:
        for sx in (-0.62, 0.62):
            crate(sx, 0.5, 0.2, T, 0.18)
    if tier >= 3:
        trim_band(1.34, 1.14, 0.78, T, tier)
        flag(0.66, -0.5, 0.2, T)
    tier_topper(1.34, T, tier, 0.44)


def b_tank(T, tier):
    """The bigger sibling of the collector: a tall turned tank, banded, with a
    gantry ring near the top and a lit fill level."""
    lv = L()
    m = machined()
    pad(1.75, T, tier)
    drum(0.62, 0.56, 1.02, 0.24, T)
    for zz in (0.42, 0.78, 1.14):
        string_course(0.59, zz, T, gilded=(m < 0.5))
    rivets(0.6, 0.6, T, 18, size=0.028)
    for i in range(10):
        t = i / 9.0
        cyl(0.6 * math.cos(t * 1.3), 0.035, (0, 0, 1.28 + i * 0.034),
            shade(T['stoneDark'], 1.0 + t * 0.1), verts=SIDES, bevel=0.006)
    sphere(0.44, (0, 0, 1.06), ELIXIR, emission=1.4, rough=0.16)
    box(0.08, 0.05, 0.6, (0, -0.58, 0.72), ELIXIR, emission=1.1, bevel=0.01)
    box(0.12, 0.05, 0.66, (0, -0.595, 0.72), T['metalDark'], metallic=0.7, rough=0.3, bevel=0.01)
    balcony(0.6, 1.18, T, 24)
    pipes(0.62, -0.42, 0.2, T, 0.7, 2)
    if lv >= 12:
        buttresses(0.62, 0.26, 0.6, T, 4, 45)
    yard_props(1.75, T)
    tier_topper(2.0, T, tier, 0.46)
def b_darkvault(T, tier):
    pad(1.7, T, tier)
    cyl(0.52, 0.36, (0, 0, 0.36), T['stoneDark'], verts=20)
    sphere(0.56, (0, 0, 1.0), '#241c33', rough=0.28)
    sphere(0.44, (0, 0, 1.0), DARK, emission=1.7, rough=0.15)
    for i in range(4):
        a = math.radians(45 + i * 90)
        cyl(0.075, 1.05, (math.cos(a) * 0.6, math.sin(a) * 0.6, 0.52), T['metalDark'],
            verts=8, metallic=0.6, rough=0.35)
        sphere(0.07, (math.cos(a) * 0.6, math.sin(a) * 0.6, 1.08), T['accent'], emission=1.3)
    if tier >= 3:
        orbit(0.7, 1.0, T, 1)
    tier_topper(1.7, T, tier, 0.44)


def b_treasury(T, tier):
    pad(1.7, T, tier)
    courses(1.25, 1.1, 0.2, 0.5, 2, T)
    roof_pyramid(1.02, 0.5, 0.72, T, tier)
    window_row(2, -0.58, 0.5, T)
    box(0.34, 0.07, 0.4, (0, -0.6, 0.4), T['trim'], metallic=0.7, rough=0.3, emission=0.4)
    crate(0.62, 0.5, 0.2, T)
    crate(-0.6, 0.46, 0.2, T, 0.16)
    tier_topper(1.5, T, tier, 0.42)


def b_clock(T, tier):
    pad(1.5, T, tier)
    courses(0.8, 0.8, 0.2, 1.25, 5, T)
    box(0.98, 0.98, 0.12, (0, 0, 1.52), T['stoneDark'])
    roof_cone(0.66, 0.55, 1.58, T, tier, verts=8)
    for sy in (-0.42, 0.42):
        cyl(0.25, 0.05, (0, sy, 1.15), '#f4efdf', rot=(math.radians(90), 0, 0), verts=20)
        cyl(0.27, 0.03, (0, sy, 1.15), T['trim'], rot=(math.radians(90), 0, 0),
            verts=20, metallic=0.7, rough=0.3)
        box(0.03, 0.02, 0.16, (0, sy - 0.02, 1.21), '#2a2a2a')
        box(0.12, 0.02, 0.03, (0.05, sy - 0.02, 1.15), '#2a2a2a')
    window(0, -0.42, 0.62, T)
    tier_topper(2.35, T, tier, 0.4)


# -------------------------------------------------------------- army
def b_barracks(T, tier, dark=False):
    pad(1.85, T, tier)
    body = T['stone'] if not dark else '#3f3356'
    courses(1.45, 1.15, 0.2, 0.62, 3, T)
    box(1.55, 1.25, 0.1, (0, 0, 0.87), T['roofDark'] if not dark else '#2b2340')
    roof_pyramid(1.16, 0.5, 0.92, T, tier)
    box(0.4, 0.07, 0.5, (0, -0.6, 0.45), T['wood'])
    window_row(2, -0.6, 0.66, T)
    sandbags(-0.55, -0.7, 0.2, T)
    for sx in (-0.68, 0.68):
        flag(sx, -0.55, 0.2, T, 0.62)
    if tier >= 2:
        crate(0.66, 0.52, 0.2, T)
        box(0.3, 0.05, 0.05, (-0.5, -0.78, 0.5), T['metalDark'], metallic=0.6)
    if tier >= 3:
        trim_band(1.5, 1.2, 0.84, T, tier)
    tier_topper(1.72, T, tier, 0.46)


def b_camp(T, tier):
    pad(2.0, T, tier)
    for (x, y, r) in ((-0.42, -0.32, 0.46), (0.44, -0.26, 0.4), (0.02, 0.46, 0.5)):
        cone(r, 0.05, 0.72, (x, y, 0.56), '#c9b48a', verts=12)
        cone(r * 0.55, 0.04, 0.3, (x, y, 1.0), T['cloth'], verts=12)
        cyl(0.025, 0.22, (x, y, 1.12), T['wood'], verts=6)
        box(0.16, 0.03, 0.2, (x, y - r * 0.9, 0.42), '#2f2418')
    box(0.42, 0.42, 0.06, (0.05, -0.02, 0.23), '#5c4630')
    for i in range(4):
        a = math.radians(i * 90 + 20)
        cyl(0.03, 0.3, (0.05 + math.cos(a) * 0.12, -0.02 + math.sin(a) * 0.12, 0.32),
            T['wood'], verts=6, rot=(math.radians(20), 0, a))
    sphere(0.13, (0.05, -0.02, 0.34), '#ff8a3c', emission=1.8)
    for sx in (-0.8, 0.8):
        flag(sx, 0.6, 0.2, T, 0.6)
    crate(0.72, -0.6, 0.2, T, 0.18)
    tier_topper(1.5, T, tier, 0.5)


def b_lab(T, tier):
    """A research hall: coursed base, a domed observatory on top, condensers
    round the rim and a lit sphere under glass."""
    lv = L()
    pad(1.75, T, tier)
    courses(1.2, 1.2, 0.2, 0.56, 3, T)
    string_course(0.62, 0.8, T)
    # observatory drum
    top = drum(0.58, 0.54, 0.3, 0.84, T)
    balcony(0.56, top - 0.02, T, 22)
    # glass dome, lathed
    for i in range(12):
        t = i / 11.0
        cyl(0.52 * math.cos(t * 1.4), 0.034, (0, 0, top + 0.06 + i * 0.033),
            shade(T['metalDark'], 1.0 + t * 0.12), verts=SIDES, bevel=0.005)
    sphere(0.34, (0, 0, top + 0.24), '#5de0c0', emission=1.6, rough=0.16)
    # condenser rods round the rim
    rods = 3 + lv // 8
    for i in range(rods):
        a = math.radians(i * (360.0 / rods) + 30)
        x, y = math.cos(a) * 0.5, math.sin(a) * 0.5
        cyl(0.055, 0.5, (x, y, top - 0.1), T['metal'], verts=20, metallic=0.72, rough=0.3)
        cyl(0.08, 0.05, (x, y, top + 0.16), T['trim'], verts=20, metallic=0.8, rough=0.26)
        sphere(0.06, (x, y, top + 0.24), T['glow'], emission=1.6)
    window_row(2, -0.62, 0.55, T)
    barrel(0.64, -0.5, 0.2, T, 0.11, 0.24)
    if lv >= 12:
        buttresses(0.62, 0.24, 0.5, T, 4, 45)
    yard_props(1.75, T)
    tier_topper(top + 0.9, T, tier, 0.42)
def b_spellfac(T, tier, dark=False):
    """A still: coursed footing, a turned vessel, a condenser coil climbing it
    and the brew glowing through the glass."""
    lv = L()
    tint = ELIXIR if not dark else DARK
    pad(1.75, T, tier)
    courses(1.15, 1.15, 0.2, 0.44, 2, T)
    top = drum(0.54, 0.48, 0.56, 0.66, T)
    string_course(0.52, 0.76, T)
    string_course(0.5, 1.02, T)
    # cauldron mouth and the brew
    cyl(0.56, 0.06, (0, 0, top), T['metalDark'], verts=SIDES, metallic=0.75, rough=0.3)
    sphere(0.4, (0, 0, top + 0.16), tint, emission=1.7, rough=0.16)
    # condenser coil: a helix of short segments up the side
    turns = 3 + lv // 10
    for i in range(turns * 10):
        a = math.radians(i * 36)
        z = 0.72 + i * (0.5 / (turns * 10))
        sphere(0.035, (math.cos(a) * 0.56, math.sin(a) * 0.56, z), T['metal'],
               metallic=0.8, rough=0.26)
    # chimney
    cyl(0.09, 0.5, (0, 0, top + 0.42), T['metal'], verts=24, metallic=0.7, rough=0.3)
    cyl(0.12, 0.05, (0, 0, top + 0.68), T['trim'], verts=24, metallic=0.78, rough=0.26)
    for i in range(4):
        a = math.radians(45 + i * 90)
        x, y = math.cos(a) * 0.62, math.sin(a) * 0.62
        cyl(0.05, 0.46, (x, y, 0.9), T['metalDark'], verts=16, metallic=0.7, rough=0.32)
        sphere(0.08, (x, y, top + 0.08), tint, emission=1.5)
    barrel(-0.62, -0.52, 0.2, T, 0.1, 0.22)
    yard_props(1.75, T)
    tier_topper(top + 1.0, T, tier, 0.42)
def b_siege(T, tier):
    pad(1.85, T, tier)
    box(1.4, 1.0, 0.5, (0, 0, 0.45), T['wood'])
    box(1.5, 1.1, 0.09, (0, 0, 0.74), T['stoneDark'])
    for sx in (-0.52, 0.52):
        cyl(0.28, 0.11, (sx, -0.52, 0.34), T['wood'], rot=(math.radians(90), 0, 0), verts=14)
        torus(0.28, 0.03, (sx, -0.52, 0.34), T['metalDark'], rot=(math.radians(90), 0, 0),
              metallic=0.7, rough=0.35)
    box(0.34, 0.34, 0.75, (0.18, 0.3, 1.15), T['metal'], metallic=0.6, rough=0.4)
    cyl(0.075, 0.9, (-0.3, 0.2, 1.1), T['wood'], verts=8, rot=(0, math.radians(25), 0))
    cog(-0.05, -0.56, 0.62, T, 0.15)
    crate(0.66, 0.52, 0.2, T, 0.18)
    if tier >= 3:
        trim_band(1.44, 1.04, 0.72, T, tier)
    tier_topper(1.8, T, tier, 0.46)


def b_pethouse(T, tier):
    pad(1.7, T, tier)
    courses(1.2, 1.1, 0.2, 0.45, 2, T)
    sphere(0.7, (0, 0, 0.9), '#7ce05a', rough=0.8)
    sphere(0.34, (-0.42, 0.3, 1.15), '#93e86f', rough=0.85)
    sphere(0.28, (0.44, 0.24, 1.1), '#6bd44c', rough=0.85)
    cyl(0.26, 0.06, (0, -0.6, 0.5), '#2f4a24', rot=(math.radians(90), 0, 0), verts=18)
    for sx in (-0.26, 0.26):
        sphere(0.07, (sx, -0.6, 0.86), T['glow'], emission=1.4)
    for sx in (-0.68, 0.68):
        cyl(0.07, 0.4, (sx, -0.42, 0.4), T['wood'], verts=8)
    tier_topper(1.68, T, tier, 0.46)


def b_herohall(T, tier):
    """The hall the heroes answer to: a coursed keep between two turned
    towers, a gilded doorway and banners on the parapet."""
    lv = L()
    m = machined()
    pad(2.2, T, tier)
    courses(1.5, 1.4, 0.2, 0.72, 3, T)
    string_course(0.95, 0.6, T)
    box(1.68, 1.56, 0.1, (0, 0, 1.0), T['stoneDark'], bevel=0.02)
    roof_pyramid(1.24, 0.66, 1.06, T, tier)
    # flanking towers, turned rather than faceted
    for sx in (-0.62, 0.62):
        n = 22
        for i in range(n):
            cyl(0.22 - (i / float(n)) * 0.02, COURSE * 1.06, (sx, -0.5, 0.24 + i * COURSE),
                shade(T['stone'] if m < 0.55 else T['metal'], 1.0 + (i % 2) * 0.05),
                verts=SIDES, metallic=m * 0.5, rough=0.55 - m * 0.2, bevel=0.005)
        ztop = 0.24 + n * COURSE
        cyl(0.26, 0.04, (sx, -0.5, ztop), T['trim'], verts=SIDES,
            metallic=0.8, rough=0.26, bevel=0.006)
        for j in range(9):                       # little merlons
            a = math.radians(j * 40)
            box(0.06, 0.05, 0.09, (sx + math.cos(a) * 0.22, -0.5 + math.sin(a) * 0.22, ztop + 0.06),
                T['stone'], rot=(0, 0, a), bevel=0.008)
        spire(0.24, 0.3, ztop + 0.12, T)
        flag(sx, -0.8, 0.2, T, 0.72)
    # doorway, arched with a gilded surround
    box(0.46, 0.1, 0.56, (0, -0.74, 0.46), T['trim'], metallic=0.7, rough=0.3,
        emission=0.35, bevel=0.02)
    box(0.34, 0.08, 0.46, (0, -0.77, 0.42), '#1a1c20', bevel=0.02)
    for i in range(7):                            # arch stones
        a = math.radians(180 + i * 30)
        box(0.1, 0.09, 0.09, (math.cos(a) * 0.26, -0.75, 0.7 + math.sin(a) * 0.26),
            shade(T['stone'], 1.1), rot=(0, math.radians(i * 30), 0), bevel=0.012)
    window_row(3, -0.74, 0.82, T)
    if lv >= 10:
        lanterns(0.86, 0.98, T, 6)
    yard_props(2.2, T)
    tier_topper(2.0, T, tier, 0.5)
def b_smith(T, tier):
    pad(1.7, T, tier)
    courses(1.3, 1.1, 0.2, 0.55, 2, T)
    box(1.4, 1.2, 0.1, (0, 0, 0.8), T['roofDark'])
    roof_pyramid(1.06, 0.42, 0.85, T, tier)
    cyl(0.2, 0.62, (0.46, 0.36, 1.1), T['stoneDark'], verts=12)
    cyl(0.22, 0.08, (0.46, 0.36, 1.44), '#ff8a3c', verts=12, emission=1.8)
    box(0.46, 0.28, 0.14, (-0.24, -0.2, 0.9), T['metal'], metallic=0.8, rough=0.3)
    box(0.13, 0.13, 0.3, (-0.24, -0.2, 1.11), T['wood'])
    cog(0.6, -0.5, 0.5, T, 0.17)
    for i in range(3):
        box(0.06, 0.06, 0.32, (-0.6 + i * 0.1, 0.5, 0.4), T['metal'], metallic=0.75, rough=0.3)
    tier_topper(1.68, T, tier, 0.44)


# ---------------------------------------------------------- defenses
def b_cannon(T, tier):
    """A gun on a carriage on a stone emplacement, built the way one would be:
    dressed platform, turntable ring, trunnion cheeks holding the barrel, a
    breech behind and a flared muzzle in front, with the crew's kit around it."""
    lv = L()
    pad(1.6, T, tier)

    # --- emplacement: a dressed drum with a chamfered cap and a kerb
    cyl(0.6, 0.22, (0, 0, 0.3), T['stoneDark'], verts=24)
    cyl(0.56, 0.14, (0, 0, 0.46), T['stone'], verts=24)
    cyl(0.58, 0.05, (0, 0, 0.41), shade(T['stone'], 1.12), verts=24)
    for i in range(12):                                   # kerb stones
        a = math.radians(i * 30 + 15)
        box(0.15, 0.1, 0.09, (math.cos(a) * 0.55, math.sin(a) * 0.55, 0.24),
            shade(T['stoneDark'], 1.1 if i % 2 else 0.92),
            rot=(0, 0, a), bevel=0.02)
    rivets(0.48, 0.53, T, 10, size=0.035)

    # --- turntable the carriage swivels on
    cyl(0.34, 0.07, (0, 0, 0.56), T['metalDark'], verts=20, metallic=0.7, rough=0.4)
    cyl(0.3, 0.04, (0, 0, 0.61), T['metal'], verts=20, metallic=0.75, rough=0.3)
    for i in range(8):                                    # ring bolts
        a = math.radians(i * 45)
        sphere(0.028, (math.cos(a) * 0.32, math.sin(a) * 0.32, 0.6),
               T['metal'], metallic=0.8, rough=0.25)

    # --- carriage: two cheeks with a cross member, angled up behind the gun
    for sx in (-1, 1):
        box(0.1, 0.62, 0.3, (sx * 0.23, 0.06, 0.76), T['wood'], bevel=0.03)
        box(0.11, 0.2, 0.1, (sx * 0.23, 0.3, 0.94), shade(T['wood'], 0.82), bevel=0.02)
        # iron strap over the cheek
        box(0.12, 0.07, 0.32, (sx * 0.23, -0.14, 0.76), T['metalDark'],
            metallic=0.65, rough=0.4, bevel=0.01)
    box(0.5, 0.12, 0.1, (0, 0.3, 0.68), shade(T['wood'], 0.78), bevel=0.02)

    # --- barrel: breech, chase, reinforcing bands, flared muzzle
    tilt = math.radians(74)
    yaw = math.radians(16)
    blen = 0.86 + min(0.34, lv * 0.014)
    axis = (tilt, 0, yaw)
    bx, by, bz = 0.08, -0.2, 0.9
    cyl(0.155, blen, (bx, by, bz), T['metalDark'], verts=24, rot=axis,
        metallic=0.72, rough=0.34)
    # breech block behind the trunnions
    cyl(0.19, 0.2, (bx - 0.07, by + 0.42, bz - 0.12), T['metal'], verts=20, rot=axis,
        metallic=0.7, rough=0.32)
    sphere(0.1, (bx - 0.1, by + 0.54, bz - 0.16), T['metalDark'], metallic=0.7, rough=0.35)
    # reinforcing bands, more of them as the gun gets heavier
    for i in range(2 + lv // 8):
        t = 0.1 + i * (0.62 / max(1, 1 + lv // 8))
        cyl(0.178, 0.05,
            (bx + math.sin(yaw) * 0.0, by + 0.34 - t * 0.9, bz + 0.04 + t * 0.16),
            T['metal'], verts=22, rot=axis, metallic=0.8, rough=0.28)
    # muzzle
    cyl(0.21, 0.11, (bx + 0.13, by - 0.52, bz + 0.16), T['metal'], verts=24, rot=axis,
        metallic=0.78, rough=0.28)
    cyl(0.15, 0.06, (bx + 0.14, by - 0.56, bz + 0.17), '#15181c', verts=20, rot=axis,
        rough=0.55)
    # trunnions: the pins the barrel actually pivots on
    for sx in (-1, 1):
        cyl(0.07, 0.14, (sx * 0.22, 0.02, 0.86), T['metal'], verts=14,
            rot=(0, math.radians(90), 0), metallic=0.8, rough=0.3)

    # --- elevation screw behind the breech
    cyl(0.035, 0.26, (bx - 0.09, by + 0.62, bz - 0.3), T['metal'], verts=10,
        metallic=0.8, rough=0.3)
    cyl(0.09, 0.04, (bx - 0.09, by + 0.62, bz - 0.17), T['trim'], verts=14,
        metallic=0.75, rough=0.3)

    # --- crew kit on the pad: shot, rammer, powder
    for i in range(3):
        sphere(0.075, (-0.46 + i * 0.115, 0.46, 0.6), '#2b3036', rough=0.42)
    sphere(0.075, (-0.4, 0.56, 0.6), '#2b3036', rough=0.42)
    cyl(0.022, 0.66, (0.5, 0.3, 0.66), T['wood'], verts=8, rot=(0, math.radians(72), 0))
    cyl(0.06, 0.1, (0.68, 0.3, 0.79), T['metalDark'], verts=12,
        rot=(0, math.radians(72), 0), metallic=0.6, rough=0.45)
    if lv >= 4:
        cyl(0.13, 0.19, (0.44, 0.5, 0.62), T['wood'], verts=14, bevel=0.02)
        cyl(0.135, 0.03, (0.44, 0.5, 0.72), T['metalDark'], verts=14, metallic=0.6)

    if tier >= 2:
        sandbags(0.5, 0.42, 0.2, T, 2)
    if tier >= 3:
        ring_band(0.5, 0.5, T, tier)
        box(0.26, 0.05, 0.05, (bx + 0.16, by - 0.56, bz + 0.24), T['accent'],
            emission=1.4, bevel=0.01)
    tier_topper(1.42, T, tier, 0.4)


def b_archer(T, tier):
    """A turned stone tower: coursed drum, string courses, recessed slits, a
    gallery with a rail, and a lathed spire. Turns to plate in the late game."""
    lv = L()
    m = machined()
    pad(1.7, T, tier)
    top = tower_body(0.5, 0.44, 0.95, 0.26, T)
    string_course(0.47, 0.55, T)
    string_course(0.45, 0.9, T)
    arrow_slit(0.44, 0.75, T, 4, 45, 0.28)
    if lv >= 5:
        buttresses(0.5, 0.28, 0.72, T, 4, 0)
    balcony(0.46, top - 0.02, T)
    merlons(0.5, top + 0.1, T, 14)
    if lv >= 9:
        lanterns(0.54, top + 0.2, T, 6 if m < 0.5 else 8)
    spire(0.44, 0.5 + lv * 0.006, top + 0.28, T)
    # the archer's post: a shuttered window facing the front
    window(0, -0.46, 0.62, T, 0.12, 0.3)
    if lv >= 14:
        for sx in (-1, 1):
            box(0.07, 0.2, 0.05, (sx * 0.5, -0.3, top + 0.06),
                T['wood'] if m < 0.5 else T['metalDark'],
                metallic=m * 0.7, rough=0.4, bevel=0.008)
    yard_props(1.7, T)
    tier_topper(top + 1.0, T, tier, 0.4)


def b_mortar(T, tier):
    """A short wide bore on a turned emplacement: heavy ring base, elevating
    yoke, a barrel with a real muzzle, and shells stacked ready."""
    lv = L()
    m = machined()
    pad(1.7, T, tier)
    drum(0.62, 0.58, 0.3, 0.22, T)
    string_course(0.6, 0.5, T)
    rivets(0.54, 0.53, T, 14, size=0.032)

    # elevating yoke the barrel swings in
    for sx in (-1, 1):
        box(0.11, 0.34, 0.46, (sx * 0.34, 0.04, 0.78),
            T['stone'] if m < 0.5 else T['metal'],
            metallic=m * 0.7, rough=0.5 - m * 0.2, bevel=0.02)
        cyl(0.06, 0.12, (sx * 0.34, -0.02, 0.94), T['metal'], verts=16,
            rot=(0, math.radians(90), 0), metallic=0.8, rough=0.28)

    # bore: stacked rings so the taper is turned, not faceted
    tilt = math.radians(14)
    for i in range(14):
        t = i / 13.0
        cyl(0.42 - t * 0.06, 0.05, (0, -0.02 - t * 0.06, 0.72 + i * 0.049),
            shade(T['stoneDark'] if m < 0.5 else T['metalDark'], 1.0 + (i % 2) * 0.05),
            verts=SIDES, rot=(tilt, 0, 0), metallic=0.35 + m * 0.4, rough=0.45)
    cyl(0.44, 0.07, (0, -0.12, 1.42), T['metal'], verts=SIDES, rot=(tilt, 0, 0),
        metallic=0.75, rough=0.3, bevel=0.01)
    cyl(0.34, 0.06, (0, -0.13, 1.45), '#14171b', verts=SIDES, rot=(tilt, 0, 0), rough=0.55)

    # elevation screw and crew kit
    cyl(0.04, 0.34, (0, 0.36, 0.82), T['metal'], verts=12, metallic=0.8, rough=0.3)
    cyl(0.1, 0.05, (0, 0.36, 1.0), T['trim'], verts=16, metallic=0.75, rough=0.28)
    for i in range(3):
        sphere(0.1, (-0.5 + i * 0.14, -0.52, 0.42), '#2f343a', rough=0.42)
    if lv >= 6:
        cyl(0.14, 0.22, (0.52, 0.44, 0.44), T['wood'], verts=16, bevel=0.02)
    if lv >= 12:
        buttresses(0.62, 0.24, 0.28, T, 4, 45)
    if tier >= 3:
        string_course(0.6, 0.3, T)
    yard_props(1.7, T)
    tier_topper(1.8, T, tier, 0.44)


def b_airdef(T, tier):
    """Twin launch tubes on a traversing mount, with the loader behind."""
    lv = L()
    m = machined()
    pad(1.7, T, tier)
    drum(0.56, 0.52, 0.34, 0.22, T)
    string_course(0.54, 0.5, T)
    # traverse ring
    cyl(0.44, 0.07, (0, 0, 0.6), T['metalDark'], verts=SIDES, metallic=0.75, rough=0.34)
    cyl(0.4, 0.04, (0, 0, 0.66), T['metal'], verts=SIDES, metallic=0.8, rough=0.28)
    for i in range(12):
        a = math.radians(i * 30)
        sphere(0.02, (math.cos(a) * 0.42, math.sin(a) * 0.42, 0.63), T['metal'],
               metallic=0.9, rough=0.2)
    box(0.52, 0.5, 0.24, (0, 0.02, 0.8), T['stone'] if m < 0.5 else T['metal'],
        metallic=m * 0.7, rough=0.5 - m * 0.2, bevel=0.03)

    for sx in (-0.18, 0.18):
        # tube, built as stacked rings so it reads as machined pipe
        for i in range(18):
            t = i / 17.0
            cyl(0.125, 0.055, (sx, -0.08 - t * 0.3, 0.98 + i * 0.052), 
                shade(T['metal'], 1.0 - (i % 3) * 0.05), verts=40,
                rot=(math.radians(20), 0, 0), metallic=0.72, rough=0.3)
        cone(0.13, 0.02, 0.24, (sx, -0.44, 1.94), T['roof'], verts=40)
        for zz in (1.1, 1.42, 1.72):                       # collars
            cyl(0.145, 0.035,
                (sx, -0.08 - (zz - 0.98) * 0.34, zz), T['metalDark'], verts=40,
                rot=(math.radians(20), 0, 0), metallic=0.8, rough=0.26)
    # loader drum behind
    cyl(0.16, 0.28, (0, 0.34, 0.98), T['metalDark'], verts=32, metallic=0.7, rough=0.34)
    for i in range(4):
        a = math.radians(i * 90 + 45)
        sphere(0.05, (math.cos(a) * 0.16, 0.34 + math.sin(a) * 0.05, 1.1),
               T['accent'], emission=1.2 if lv >= 8 else 0.0)
    if lv >= 14:
        buttresses(0.56, 0.24, 0.3, T, 4, 45)
    if tier >= 3:
        box(0.24, 0.06, 0.06, (0, -0.42, 0.92), T['accent'], emission=1.4, bevel=0.01)
    yard_props(1.7, T)
    tier_topper(2.2, T, tier, 0.4)


def b_wizard(T, tier):
    """A scholar's tower: turned drum, buttresses, a gallery of runes and a
    lathed spire with a focus stone burning at the top."""
    lv = L()
    m = machined()
    pad(1.7, T, tier)
    top = tower_body(0.5, 0.42, 0.88, 0.24, T)
    string_course(0.46, 0.52, T)
    buttresses(0.48, 0.26, 0.66, T, 4, 45)
    window(0, -0.44, 0.6, T, 0.13, 0.28)
    # rune gallery: floating stones that orbit the shaft
    ring = 4 + lv // 8
    for i in range(ring):
        a = math.radians(i * (360.0 / ring) + 20)
        box(0.09, 0.09, 0.14, (math.cos(a) * 0.5, math.sin(a) * 0.5, top - 0.06),
            T['glow'], rot=(0, 0, a), emission=1.5, bevel=0.02)
    balcony(0.44, top - 0.02, T, 20)
    z = spire(0.44, 0.6 + lv * 0.008, top + 0.16, T)
    sphere(0.15, (0, 0, z + 0.16), T['glow'], emission=1.9)
    if lv >= 10:
        torus(0.28, 0.022, (0, 0, z + 0.16), T['trim'], emission=1.2,
              rot=(math.radians(70), 0, 0), metallic=0.7, rough=0.3)
    if lv >= 18:
        torus(0.34, 0.02, (0, 0, z + 0.16), T['accent'], emission=1.3,
              rot=(math.radians(20), math.radians(40), 0))
    yard_props(1.7, T)
    tier_topper(z + 0.9, T, tier, 0.4)


def b_sweeper(T, tier):
    pad(1.6, T, tier)
    cyl(0.48, 0.5, (0, 0, 0.44), T['stone'], verts=16)
    rivets(0.44, 0.44, T, 10)
    box(0.5, 0.5, 0.28, (0, 0, 0.83), T['stoneDark'])
    cone(0.52, 0.16, 0.66, (0, -0.28, 1.1), T['metal'], verts=18,
         rot=(math.radians(70), 0, 0), metallic=0.6, rough=0.35)
    torus(0.5, 0.035, (0, -0.4, 1.16), T['metalDark'], rot=(math.radians(70), 0, 0),
          metallic=0.7)
    cyl(0.11, 0.45, (0, 0.26, 1.06), T['metalDark'], verts=10, metallic=0.6)
    for i in range(4):
        a = math.radians(45 + i * 90)
        box(0.09, 0.09, 0.45, (math.cos(a) * 0.36, math.sin(a) * 0.36, 0.55), T['wood'])
    tier_topper(1.66, T, tier, 0.42)


def b_tesla(T, tier):
    pad(1.15, T, tier)
    cyl(0.33, 0.55, (0, 0, 0.46), T['stoneDark'], verts=14)
    rivets(0.3, 0.46, T, 8, 0.035)
    cyl(0.13, 0.55, (0, 0, 0.98), T['metal'], verts=10, metallic=0.8, rough=0.25)
    for zz in (0.86, 1.12):
        torus(0.17, 0.025, (0, 0, zz), T['metalDark'], metallic=0.7)
    sphere(0.2, (0, 0, 1.36), '#7fd0e8', emission=1.9)
    for i in range(3):
        a = math.radians(i * 120)
        cyl(0.04, 0.34, (math.cos(a) * 0.2, math.sin(a) * 0.2, 1.18), T['metal'],
            verts=6, metallic=0.8)
    tier_topper(1.62, T, tier, 0.3)


def b_bombtower(T, tier):
    pad(1.6, T, tier)
    courses(0.86, 0.86, 0.2, 0.62, 3, T)
    cyl(0.52, 0.12, (0, 0, 0.88), T['stoneDark'], verts=16)
    sphere(0.42, (0, 0, 1.22), '#2f2f36', rough=0.4)
    torus(0.42, 0.035, (0, 0, 1.22), T['metalDark'], metallic=0.7, rough=0.3)
    cyl(0.06, 0.26, (0, 0, 1.68), '#8a7f6a', verts=6)
    sphere(0.09, (0, 0, 1.84), '#ff8a3c', emission=1.9)
    for i in range(2):
        sphere(0.13, (-0.45 + i * 0.9, -0.4, 0.3), '#2f2f36', rough=0.45)
    window(0, -0.44, 0.56, T, 0.1, 0.2)
    tier_topper(2.05, T, tier, 0.42)


def b_xbow(T, tier):
    pad(1.7, T, tier)
    cyl(0.56, 0.32, (0, 0, 0.34), T['stoneDark'], verts=20)
    rivets(0.5, 0.34, T, 12)
    box(0.58, 0.58, 0.28, (0, 0, 0.63), T['stone'])
    for sy in (-0.32, 0.32):
        torus(0.4, 0.055, (0, sy, 1.0), T['metal'], rot=(math.radians(90), 0, 0),
              metallic=0.75, rough=0.28)
    cyl(0.075, 1.05, (0, -0.08, 1.0), T['metalDark'], verts=10,
        rot=(math.radians(90), 0, 0), metallic=0.65)
    sphere(0.11, (0, -0.6, 1.0), '#9fd8ff', emission=1.7)
    box(0.3, 0.16, 0.1, (0, 0.42, 1.02), T['metalDark'], metallic=0.6)
    if tier >= 3:
        trim_band(0.66, 0.66, 0.78, T, tier)
    tier_topper(1.55, T, tier, 0.44)


def b_inferno(T, tier):
    pad(1.7, T, tier)
    cyl(0.52, 0.42, (0, 0, 0.4), '#3f3038', verts=18)
    cyl(0.34, 1.0, (0, 0, 1.1), T['stoneDark'], verts=16)
    for zz in (0.78, 1.1, 1.42):
        torus(0.37, 0.03, (0, 0, zz), T['metalDark'], metallic=0.7, rough=0.3)
    cyl(0.42, 0.12, (0, 0, 1.66), T['stone'], verts=16)
    cone(0.3, 0.07, 0.5, (0, 0, 1.96), '#ff5a2b', verts=16, emission=1.8)
    for i in range(3):
        a = math.radians(i * 120)
        cyl(0.06, 0.85, (math.cos(a) * 0.42, math.sin(a) * 0.42, 0.9), T['metal'],
            verts=8, metallic=0.6, rough=0.35)
    tier_topper(2.35, T, tier, 0.42)


def b_eagle(T, tier):
    pad(2.35, T, tier)
    cyl(0.88, 0.34, (0, 0, 0.37), T['stone'], verts=24)
    rivets(0.8, 0.37, T, 16)
    cyl(0.62, 0.32, (0, 0, 0.7), T['stoneDark'], verts=24)
    cyl(0.42, 1.35, (0, -0.18, 1.35), T['metal'], verts=20,
        rot=(math.radians(28), 0, 0), metallic=0.5, rough=0.4)
    cyl(0.5, 0.14, (0, -0.5, 1.95), T['trim'], verts=20, rot=(math.radians(28), 0, 0),
        metallic=0.8, rough=0.28, emission=0.4)
    for i in range(4):
        a = math.radians(45 + i * 90)
        box(0.17, 0.17, 0.5, (math.cos(a) * 0.76, math.sin(a) * 0.76, 0.5), T['stoneDark'])
        sphere(0.08, (math.cos(a) * 0.76, math.sin(a) * 0.76, 0.78), T['accent'], emission=1.3)
    tier_topper(2.3, T, tier, 0.6)


def b_scatter(T, tier):
    pad(2.35, T, tier)
    cyl(0.82, 0.4, (0, 0, 0.4), T['stone'], verts=22)
    box(0.92, 0.92, 0.34, (0, 0, 0.78), T['stoneDark'])
    for sx in (-0.32, 0.32):
        cyl(0.29, 0.75, (sx, -0.08, 1.3), T['metal'], verts=16,
            rot=(math.radians(24), 0, math.radians(10 if sx > 0 else -10)),
            metallic=0.55, rough=0.4)
        torus(0.3, 0.03, (sx, -0.2, 1.5), T['metalDark'],
              rot=(math.radians(24), 0, 0), metallic=0.7)
    for i in range(5):
        sphere(0.11, (-0.38 + i * 0.19, 0.5, 1.02), T['stone'], rough=0.6)
    tier_topper(1.95, T, tier, 0.56)


def b_monolithdef(T, tier):
    pad(2.15, T, tier)
    for i in range(3):
        s = 1.45 - i * 0.22
        box(s, s, 0.19, (0, 0, 0.26 + i * 0.19), T['stone'] if i % 2 else T['stoneDark'])
    box(0.58, 0.34, 1.9, (0, 0, 1.78), T['roof'], rough=0.35)
    box(0.16, 0.05, 1.45, (0, -0.19, 1.78), T['accent'], emission=1.8, bevel=0.01)
    for i in range(4):
        a = math.radians(45 + i * 90)
        box(0.12, 0.12, 0.55, (math.cos(a) * 0.62, math.sin(a) * 0.62, 0.6), T['stoneDark'])
    sphere(0.15, (0, 0, 2.82), T['glow'], emission=1.8)
    tier_topper(3.1, T, tier, 0.5)


def b_multiarcher(T, tier):
    pad(1.7, T, tier)
    courses(0.86, 0.86, 0.2, 1.05, 4, T)
    cyl(0.62, 0.13, (0, 0, 1.32), T['stoneDark'], verts=18)
    for i in range(3):
        a = math.radians(i * 120)
        cyl(0.16, 0.5, (math.cos(a) * 0.34, math.sin(a) * 0.34, 1.63), T['stone'], verts=10)
        cone(0.2, 0, 0.28, (math.cos(a) * 0.34, math.sin(a) * 0.34, 2.0), T['roof'], verts=10)
        window(math.cos(a) * 0.34, math.sin(a) * 0.34 - 0.16, 1.66, T, 0.08, 0.16)
    tier_topper(2.35, T, tier, 0.44)


def b_ricochet(T, tier):
    pad(2.25, T, tier)
    cyl(0.78, 0.38, (0, 0, 0.39), T['stone'], verts=22)
    rivets(0.7, 0.39, T, 14)
    box(0.84, 0.84, 0.32, (0, 0, 0.74), T['stoneDark'])
    cyl(0.25, 1.2, (0.08, -0.32, 1.2), T['metalDark'], verts=16,
        rot=(math.radians(80), 0, math.radians(16)), metallic=0.7, rough=0.35)
    cyl(0.31, 0.13, (0.22, -0.8, 1.34), T['accent'], verts=16,
        rot=(math.radians(80), 0, math.radians(16)), emission=1.5)
    for sx in (-0.48, 0.48):
        cog(sx, 0.42, 0.72, T, 0.15)
    tier_topper(1.85, T, tier, 0.55)


def b_prism(T, tier):
    pad(1.7, T, tier)
    cyl(0.52, 0.36, (0, 0, 0.38), T['stoneDark'], verts=20)
    cyl(0.34, 0.95, (0, 0, 1.03), T['stone'], verts=6)
    cone(0.42, 0.09, 0.7, (0, 0, 1.85), '#6fa8ff', verts=6, emission=1.6, rough=0.2)
    sphere(0.13, (0, 0, 2.28), '#ff9ae0', emission=1.9)
    for i in range(3):
        a = math.radians(i * 120 + 30)
        sphere(0.075, (math.cos(a) * 0.48, math.sin(a) * 0.48, 1.6), '#6fa8ff', emission=1.6)
    tier_topper(2.6, T, tier, 0.44)


def b_gravity(T, tier):
    pad(2.25, T, tier)
    cyl(0.82, 0.42, (0, 0, 0.41), T['stoneDark'], verts=24)
    cyl(0.42, 0.65, (0, 0, 0.95), T['stone'], verts=20)
    cone(0.95, 0.34, 0.5, (0, 0, 1.42), T['metal'], verts=26, metallic=0.5, rough=0.4)
    core(0.24, (0, 0, 1.85), T, 1.8)
    orbit(0.78, 1.85, T, 3)
    for i in range(4):
        a = math.radians(45 + i * 90)
        cyl(0.12, 0.8, (math.cos(a) * 0.78, math.sin(a) * 0.78, 0.6), T['stoneDark'], verts=10)


def b_nullfield(T, tier):
    pad(1.7, T, tier)
    cyl(0.56, 0.46, (0, 0, 0.42), T['stoneDark'], verts=22)
    for i in range(4):
        a = math.radians(45 + i * 90)
        cyl(0.075, 1.3, (math.cos(a) * 0.42, math.sin(a) * 0.42, 1.05), T['metal'],
            verts=8, metallic=0.7, rough=0.3)
    torus(0.5, 0.055, (0, 0, 1.75), T['metal'], metallic=0.75, rough=0.28)
    core(0.18, (0, 0, 1.75), T, 1.8)
    tier_topper(2.2, T, tier, 0.44)


def b_orbitalbeacon(T, tier):
    pad(2.35, T, tier)
    cyl(0.88, 0.38, (0, 0, 0.38), T['stoneDark'], verts=24)
    cyl(0.46, 1.2, (0, 0, 1.18), T['stone'], verts=18)
    for zz in (0.8, 1.2, 1.6):
        torus(0.49, 0.03, (0, 0, zz), T['trim'], metallic=0.7, rough=0.3)
    core(0.26, (0, 0, 2.1), T, 1.9)
    orbit(0.8, 2.1, T, 2)
    for i in range(4):
        a = math.radians(45 + i * 90)
        box(0.15, 0.15, 0.46, (math.cos(a) * 0.72, math.sin(a) * 0.72, 0.5), T['stone'])


def b_fracturecannon(T, tier):
    pad(2.25, T, tier)
    cyl(0.78, 0.4, (0, 0, 0.4), '#4f2f3d', verts=22)
    box(0.86, 0.86, 0.32, (0, 0, 0.76), T['stoneDark'])
    cyl(0.23, 1.35, (0, -0.36, 1.28), T['metalDark'], verts=16,
        rot=(math.radians(78), 0, 0), metallic=0.6, rough=0.38)
    cyl(0.3, 0.13, (0, -0.88, 1.42), '#ff4d6d', verts=16,
        rot=(math.radians(78), 0, 0), emission=1.8)
    for sx in (-0.46, 0.46):
        box(0.13, 0.13, 0.42, (sx, 0.4, 0.6), '#4a2b36')
        sphere(0.07, (sx, 0.4, 0.84), '#ff4d6d', emission=1.4)
    tier_topper(1.9, T, tier, 0.55)


def b_aegisgrid(T, tier):
    pad(2.35, T, tier)
    cyl(0.92, 0.34, (0, 0, 0.37), T['stoneDark'], verts=6, rot=(0, 0, math.radians(30)))
    cyl(0.62, 0.58, (0, 0, 0.83), T['stone'], verts=6, rot=(0, 0, math.radians(30)))
    core(0.34, (0, 0, 1.5), T, 1.9)
    for i in range(6):
        a = math.radians(i * 60)
        cone(0.13, 0, 0.44, (math.cos(a) * 0.66, math.sin(a) * 0.66, 1.35),
             T['accent'], verts=4, rot=(0, 0, math.radians(45)), emission=1.4)
    torus(0.98, 0.045, (0, 0, 1.18), T['trim'], emission=1.4, rough=0.3)


def b_singularity(T, tier):
    pad(2.7, T, tier)
    cyl(1.1, 0.42, (0, 0, 0.4), T['stoneDark'], verts=28)
    for i in range(3):
        a = math.radians(i * 120)
        cyl(0.17, 1.3, (math.cos(a) * 0.62, math.sin(a) * 0.62, 1.05), T['stone'], verts=10)
        sphere(0.09, (math.cos(a) * 0.62, math.sin(a) * 0.62, 1.72), T['accent'], emission=1.5)
    core(0.4, (0, 0, 2.0), T, 1.9)
    orbit(0.95, 2.0, T, 3)


def trap_generic(T, tier, color, spikes=False, dome=True):
    box(0.95, 0.95, 0.1, (0, 0, 0.05), '#6b573c')
    box(0.86, 0.86, 0.07, (0, 0, 0.13), T['stoneDark'])
    if dome:
        cyl(0.3, 0.14, (0, 0, 0.22), T['metalDark'], verts=16, metallic=0.6, rough=0.4)
        sphere(0.25, (0, 0, 0.33), color, rough=0.4, emission=0.5)
        torus(0.26, 0.02, (0, 0, 0.3), T['metal'], metallic=0.7, rough=0.3)
    if spikes:
        for i in range(4):
            a = math.radians(45 + i * 90)
            cone(0.06, 0, 0.28, (math.cos(a) * 0.2, math.sin(a) * 0.2, 0.42), T['metal'],
                 verts=8, metallic=0.75, rough=0.28)
    if tier >= 3:
        for i in range(4):
            a = math.radians(i * 90)
            sphere(0.035, (math.cos(a) * 0.34, math.sin(a) * 0.34, 0.2), T['accent'],
                   emission=1.4)


BUILDING_BUILDERS = {
    'mine': b_mine, 'collector': b_collector, 'drill': b_drill,
    'vault': lambda T, n: b_vault(T, n, GOLD, '#8a6a1f'),
    'tank': b_tank, 'darkvault': b_darkvault, 'treasury': b_treasury, 'clock': b_clock,
    'barracks': lambda T, n: b_barracks(T, n, False),
    'darkbarracks': lambda T, n: b_barracks(T, n, True),
    'camp': b_camp, 'lab': b_lab,
    'spell': lambda T, n: b_spellfac(T, n, False),
    'darkspell': lambda T, n: b_spellfac(T, n, True),
    'siege': b_siege, 'pethouse': b_pethouse, 'herohall': b_herohall, 'smith': b_smith,
    'cannon': b_cannon, 'archer': b_archer, 'mortar': b_mortar, 'airdef': b_airdef,
    'wizard': b_wizard, 'sweeper': b_sweeper, 'tesla': b_tesla, 'bombtower': b_bombtower,
    'xbow': b_xbow, 'inferno': b_inferno, 'eagle': b_eagle, 'scatter': b_scatter,
    'monolithdef': b_monolithdef, 'multiarcher': b_multiarcher, 'ricochet': b_ricochet,
    'prism': b_prism, 'gravity': b_gravity, 'nullfield': b_nullfield,
    'orbital': b_orbitalbeacon, 'fracturecannon': b_fracturecannon,
    'aegis': b_aegisgrid, 'singularity': b_singularity,
    'trapbomb': lambda T, n: trap_generic(T, n, '#2f2f36'),
    'trapspring': lambda T, n: trap_generic(T, n, '#8a7f3a', spikes=True),
    'trapair': lambda T, n: trap_generic(T, n, '#7fd0e8'),
    'trapgiant': lambda T, n: trap_generic(T, n, '#3a2f2f', spikes=True),
    'trapseek': lambda T, n: trap_generic(T, n, '#ff8a3c'),
    'trapskull': lambda T, n: trap_generic(T, n, '#e8e2d2'),
    'traptornado': lambda T, n: trap_generic(T, n, '#9fd8ff'),
    'trapmirror': lambda T, n: trap_generic(T, n, '#c8ccd8'),
    'trapemp': lambda T, n: trap_generic(T, n, '#a05cff'),
    'trapsand': lambda T, n: trap_generic(T, n, '#c9b48a'),
}


# ------------------------------------------------------------------ walls
def build_wall(skin, T, detail):
    """Wall segment in its era's materials; `step` shades within the era."""
    base = shade(skin['fill'], 0.94 + detail * 0.2)
    cap = shade(skin['fill'], 1.1 + detail * 0.16)
    box(0.94, 0.94, 0.52, (0, 0, 0.26), base)
    # coursed blocks make the wall read as masonry rather than a lump
    for i in range(2):
        box(0.9 - i * 0.03, 0.9 - i * 0.03, 0.2, (0, 0, 0.14 + i * 0.22),
            shade(base, 1.0 - i * 0.08))
    box(1.0, 1.0, 0.13, (0, 0, 0.6), cap)
    for sx in (-0.31, 0.31):
        for sy in (-0.31, 0.31):
            box(0.26, 0.26, 0.17, (sx, sy, 0.74), shade(cap, 1.06), bevel=0.02)
    box(0.86, 0.05, 0.34, (0, -0.46, 0.3), skin['edge'], bevel=0.01)
    if skin.get('glow'):
        box(0.46, 0.05, 0.07, (0, -0.48, 0.44), skin['glow'], emission=1.7, bevel=0)
        for sx in (-0.31, 0.31):
            sphere(0.045, (sx, -0.34, 0.84), skin['glow'], emission=1.6)
    else:
        for sx in (-0.2, 0.2):
            sphere(0.035, (sx, -0.46, 0.5), T['metalDark'], metallic=0.7, rough=0.35)


# ------------------------------------------------------------------ units
# Troops are built the same way buildings are: era materials for the kit, and
# ornament that grows with the level, so a level 1 Grunt is a lad in a leather
# jerkin and a level 25 Grunt is armoured, caped and lit. `art` decides the
# silhouette -- weapon, stance and head -- so the roster reads apart at icon
# size rather than being one figure in twenty-eight colours.

# Which weapon each troop art carries. Anything unlisted falls back to a sword.
WEAPONS = {
    'grunt': 'sword', 'marauder': 'axe', 'brute': 'club', 'ripper': 'axe',
    'slinger': 'bow', 'huntress': 'bow', 'nightstalker': 'dagger',
    'sapper': 'bomb', 'banner': 'standard', 'bannerman': 'standard',
    'hogback': 'spear', 'ravager': 'club', 'colossus': 'fist', 'golem': 'fist',
    'titanborn': 'hammer', 'abyssal': 'hammer', 'beetle': 'none',
    'prismknight': 'lance', 'vanguard': 'sword', 'champion': 'hammer',
    'ironclad': 'lance', 'kite': 'spear', 'duskwing': 'none',
}


def troop_base(T):
    """A small plinth. Troops are only ever seen in icon frames, and a base
    stops them floating in the middle of the card."""
    cyl(0.42, 0.05, (0, 0, 0.025), T['stoneDark'], verts=20, bevel=0.01)
    cyl(0.36, 0.03, (0, 0, 0.06), shade(T['stoneDark'], 1.14), verts=20, bevel=0.01)
    if L() >= 14:
        torus(0.39, 0.014, (0, 0, 0.07), T['trim'], metallic=0.7, rough=0.3)


def weapon(kind, T, tint, hand=(0.42, -0.14, 0.6)):
    """The hand-held silhouette, held out to the side of the body so it reads
    at icon size instead of merging with the head. Scale creeps up with the
    level, so a maxed troop is visibly better armed than a fresh one."""
    lv = L()
    g = 1.0 + lv * 0.012
    x, y, z = hand
    metal, trim, wood = T['metal'], T['trim'], T['wood']
    if kind == 'none':
        return
    if kind == 'bow':
        # A vertical arc in the plane facing the camera, with a drawn string.
        torus(0.3 * g, 0.026, (x, y, z + 0.24), wood,
              rot=(0, math.radians(90), 0))
        box(0.02, 0.02, 0.58 * g, (x - 0.02, y, z + 0.24), '#efe7d2', bevel=0)
        for sy in (-1, 1):
            cone(0.045, 0, 0.1, (x, y, z + 0.24 + sy * 0.3 * g), trim, verts=6,
                 metallic=0.7, rough=0.3)
        if lv >= 9:
            sphere(0.05, (x, y - 0.04, z + 0.24), T['accent'], emission=1.6)
        return
    if kind == 'standard':
        cyl(0.03, 1.25 * g, (x, y, z + 0.34), wood, verts=8)
        box(0.03, 0.32, 0.36 * g, (x, y + 0.18, z + 0.78), T['cloth'], bevel=0.01)
        cone(0.06, 0, 0.17, (x, y, z + 1.02 * g), trim, verts=8, metallic=0.7, rough=0.3)
        if lv >= 12:
            sphere(0.05, (x, y + 0.18, z + 0.92), T['accent'], emission=1.6)
        return
    if kind == 'bomb':
        sphere(0.17 * g, (x, y, z + 0.06), '#2a2a30', rough=0.55)
        cyl(0.02, 0.14, (x, y, z + 0.26), wood, verts=6)
        sphere(0.04, (x, y, z + 0.34), T['accent'], emission=2.4)
        return
    if kind == 'fist':
        sphere(0.2 * g, (x, y, z - 0.1), shade(tint, 0.86), rough=0.5)
        if lv >= 10:
            for i in range(3):
                cone(0.05, 0, 0.12, (x, y - 0.08 + i * 0.08, z + 0.06), metal,
                     verts=6, metallic=0.6, rough=0.35)
        return
    # Everything below is a shaft with a head on top. The shaft starts at the
    # fist and runs up, so the head clears the shoulder line.
    shaft = {'sword': 0.0, 'dagger': 0.0, 'axe': 0.62, 'club': 0.56,
             'hammer': 0.66, 'spear': 1.02, 'lance': 1.08}.get(kind, 0.5)
    if shaft > 0.2:
        cyl(0.028, shaft * g, (x, y, z + shaft * g / 2 - 0.08), wood, verts=6)
    top = z + shaft * g - 0.08
    if kind in ('sword', 'dagger'):
        blade = 0.56 * g if kind == 'sword' else 0.32 * g
        cyl(0.035, 0.18, (x, y, z), wood, verts=8)                      # grip
        sphere(0.045, (x, y, z - 0.1), trim, metallic=0.7, rough=0.3)   # pommel
        box(0.22, 0.06, 0.05, (x, y, z + 0.11), trim, metallic=0.7, rough=0.3, bevel=0.012)
        box(0.1, 0.03, blade, (x, y, z + 0.14 + blade / 2), metal,
            metallic=0.8, rough=0.22, bevel=0.012)
        if lv >= 18:
            box(0.03, 0.012, blade * 0.78, (x, y - 0.022, z + 0.16 + blade / 2),
                T['accent'], emission=1.8, bevel=0)
    elif kind == 'axe':
        box(0.05, 0.24, 0.32 * g, (x, y + 0.12, top), metal,
            metallic=0.75, rough=0.28, bevel=0.02)
        box(0.05, 0.11, 0.17, (x, y - 0.07, top), shade(metal, 0.8),
            metallic=0.7, rough=0.3, bevel=0.02)
    elif kind in ('club', 'hammer'):
        box(0.25 * g, 0.25 * g, 0.25 * g, (x, y, top + 0.1),
            metal if kind == 'hammer' else wood,
            metallic=0.6 if kind == 'hammer' else 0.0, rough=0.35, bevel=0.03)
        if lv >= 8:
            for sx in (-1, 1):
                cone(0.05, 0, 0.12, (x + sx * 0.14 * g, y, top + 0.1), trim, verts=6,
                     rot=(0, math.radians(sx * 90), 0), metallic=0.7, rough=0.3)
    elif kind in ('spear', 'lance'):
        cone(0.07, 0, 0.28 * g, (x, y, top + 0.12), metal, verts=8,
             metallic=0.8, rough=0.25)
        if kind == 'lance' and lv >= 6:
            cyl(0.11, 0.1, (x, y, top - 0.2), trim, verts=12, metallic=0.7, rough=0.3)
    if lv >= 22:
        sphere(0.05, (x, y, top + 0.3), T['accent'], emission=2.0)


def shield(T, lv):
    """Round shield on the off arm. Kept small and set back so it frames the
    figure instead of hiding it."""
    cyl(0.17, 0.05, (-0.36, -0.08, 0.68), T['metal'], verts=16,
        rot=(0, math.radians(90), 0), metallic=0.6, rough=0.38)
    cyl(0.12, 0.03, (-0.39, -0.08, 0.68), T['trim'], verts=16,
        rot=(0, math.radians(90), 0), metallic=0.7, rough=0.3)
    sphere(0.055, (-0.41, -0.08, 0.68), shade(T['metal'], 1.25), metallic=0.8, rough=0.2)
    if lv >= 20:
        sphere(0.035, (-0.42, -0.08, 0.79), T['accent'], emission=1.8)


def cape(T, tint):
    """Cloak hanging off the shoulders, behind the figure."""
    box(0.3, 0.05, 0.44, (0, 0.19, 0.62), T['cloth'], bevel=0.03)
    box(0.36, 0.05, 0.07, (0, 0.18, 0.86), shade(T['cloth'], 0.78), bevel=0.02)


def helmet(T, tint, crest_colour):
    """Head kit. The crest grows with the level -- the fastest way to read a
    troop's rank from a 46px icon."""
    lv = L()
    sphere(0.19, (0, 0, 1.03), T['metal'], metallic=0.55, rough=0.36)
    box(0.4, 0.09, 0.05, (0, -0.13, 1.02), T['metalDark'],
        metallic=0.6, rough=0.35, bevel=0.015)
    box(0.2, 0.06, 0.12, (0, -0.16, 0.95), '#20222a', bevel=0.02)   # visor slot
    if lv >= 4:
        for i in range(2 + lv // 8):
            box(0.05, 0.16, 0.05 + i * 0.03, (0, 0.02 + i * 0.05, 1.18 + i * 0.035),
                crest_colour, bevel=0.012)
    if lv >= 16:
        for sx in (-1, 1):
            cone(0.05, 0, 0.18, (sx * 0.17, 0, 1.14), T['trim'], verts=6,
                 rot=(0, math.radians(sx * 26), 0), metallic=0.7, rough=0.3)
    if lv >= 24:
        sphere(0.045, (0, -0.18, 1.1), T['accent'], emission=2.2)


def unit_body(tint, kind, T, tier, art=''):
    """A chunky stylised figure with era kit and a per-troop weapon."""
    lv = L()
    skin = '#e8c9a0'
    metal, trim = T['metal'], T['trim']
    troop_base(T)

    if kind == 'air':
        # Winged: a body slung between two wings, with a harness and a tail.
        sphere(0.32, (0, 0.04, 0.86), tint, rough=0.5)
        sphere(0.2, (0, -0.26, 0.94), shade(tint, 1.12), rough=0.5)
        sphere(0.08, (0.09, -0.4, 0.98), '#1a1a20', bevel=0)
        sphere(0.08, (-0.09, -0.4, 0.98), '#1a1a20', bevel=0)
        for sx in (-1, 1):
            w = box(0.62, 0.12, 0.3, (sx * 0.46, 0.1, 1.02), shade(tint, 1.2), bevel=0.03)
            w.rotation_euler = (0, math.radians(sx * 24), 0)
            for i in range(2 + lv // 9):     # wing ribs
                box(0.5, 0.03, 0.03, (sx * 0.46, 0.02 + i * 0.07, 1.02 + i * 0.04),
                    shade(tint, 0.8), bevel=0.01)
            if lv >= 10:
                cone(0.05, 0, 0.14, (sx * 0.74, 0.1, 1.16), trim, verts=6,
                     metallic=0.7, rough=0.3)
        for sx in (-1, 1):                    # legs tucked under
            cyl(0.06, 0.22, (sx * 0.14, 0.02, 0.62), shade(tint, 0.74), verts=8)
            sphere(0.07, (sx * 0.14, -0.04, 0.52), shade(tint, 0.7))
        cyl(0.07, 0.4, (0, 0.34, 0.78), shade(tint, 0.8), verts=10,
            rot=(math.radians(28), 0, 0))
        if lv >= 6:                           # harness
            box(0.5, 0.1, 0.07, (0, 0.04, 0.94), T['cloth'], bevel=0.02)
        if lv >= 12:
            torus(0.3, 0.025, (0, 0, 1.34), trim, emission=1.2, rough=0.3)
        if lv >= 20:
            sphere(0.06, (0, -0.42, 1.1), T['accent'], emission=2.2)
        return

    if kind == 'giant':
        # Heavy: no neck, huge shoulders, ground-shaking fists.
        for sx in (-1, 1):
            cyl(0.16, 0.36, (sx * 0.17, 0, 0.2), shade(tint, 0.74), verts=12)
            box(0.24, 0.3, 0.12, (sx * 0.17, -0.04, 0.06), T['metalDark'],
                metallic=0.5, rough=0.45, bevel=0.02)
        box(0.72, 0.46, 0.6, (0, 0, 0.7), tint, bevel=0.05)
        box(0.76, 0.5, 0.1, (0, 0, 0.62), T['cloth'], bevel=0.02)      # belt
        sphere(0.24, (0, -0.02, 1.12), skin)
        for sx in (-1, 1):
            cyl(0.15, 0.52, (sx * 0.46, 0, 0.78), shade(tint, 0.9), verts=12)
            sphere(0.18, (sx * 0.47, 0, 1.0), T['metalDark'], metallic=0.55, rough=0.4)
            if lv >= 10:
                for i in range(2):
                    cone(0.06, 0, 0.14, (sx * 0.46, -0.08 + i * 0.16, 1.16), trim,
                         verts=6, metallic=0.7, rough=0.3)
            sphere(0.17, (sx * 0.48, -0.06, 0.5), shade(tint, 0.82))   # fists
        if lv >= 5:
            box(0.5, 0.12, 0.18, (0, -0.26, 0.84), metal, metallic=0.5, rough=0.4, bevel=0.03)
        if lv >= 14:
            cyl(0.26, 0.09, (0, 0, 1.3), trim, verts=14, metallic=0.7, rough=0.3)
        if lv >= 20:
            sphere(0.07, (0, -0.22, 1.24), T['accent'], emission=2.0)
        weapon(WEAPONS.get(art, 'fist'), T, tint, hand=(0.56, -0.14, 0.62))
        return

    if kind == 'caster':
        # Robed: a cone body, a hood, and a staff that gets brighter with rank.
        cone(0.36, 0.14, 0.8, (0, 0, 0.44), tint, verts=18)
        for i in range(1 + lv // 7):                                   # robe hem bands
            cyl(0.34 - i * 0.03, 0.035, (0, 0, 0.14 + i * 0.1), shade(tint, 0.82), verts=18)
        box(0.16, 0.06, 0.5, (0, -0.24, 0.5), T['cloth'], bevel=0.02)  # stole
        sphere(0.19, (0, 0, 0.94), skin)
        cone(0.26, 0.02, 0.42, (0, 0.02, 1.16), shade(tint, 0.76), verts=16)
        if lv >= 8:
            for sx in (-1, 1):
                sphere(0.09, (sx * 0.28, -0.04, 0.86), shade(tint, 1.1))
        cyl(0.03, 1.1, (0.32, -0.08, 0.62), T['wood'], verts=8)
        sphere(0.1, (0.32, -0.08, 1.2), T['accent'], emission=2.2)
        if lv >= 12:
            torus(0.15, 0.018, (0.32, -0.08, 1.2), trim, emission=1.6, rough=0.3)
        if lv >= 18:
            for i in range(3):
                a = math.radians(i * 120 + 20)
                sphere(0.04, (math.cos(a) * 0.34, math.sin(a) * 0.34, 1.44),
                       T['glow'], emission=2.6)
        if lv >= 22:
            torus(0.22, 0.02, (0, 0, 1.5), trim, emission=1.4, rough=0.3)
        return

    # ---- default ground trooper: legs, torso, arms, head, weapon, shield
    for sx in (-1, 1):
        cyl(0.1, 0.34, (sx * 0.12, 0, 0.22), shade(tint, 0.72), verts=10)
        box(0.18, 0.24, 0.1, (sx * 0.12, -0.04, 0.08), T['metalDark'],
            metallic=0.45, rough=0.5, bevel=0.02)
    box(0.44, 0.3, 0.44, (0, 0, 0.63), tint, bevel=0.04)
    box(0.14, 0.32, 0.4, (0, -0.02, 0.63), T['cloth'], bevel=0.02)      # tabard
    box(0.47, 0.33, 0.08, (0, 0, 0.45), T['metalDark'], metallic=0.5, rough=0.4, bevel=0.02)
    if lv >= 6:                                                          # chest plate
        box(0.4, 0.1, 0.26, (0, -0.17, 0.72), metal, metallic=0.6, rough=0.34, bevel=0.03)
    for sx in (-1, 1):
        cyl(0.08, 0.4, (sx * 0.28, -0.02, 0.64), shade(tint, 0.9), verts=10)
        sphere(0.115, (sx * 0.3, 0, 0.84), T['metalDark'], metallic=0.55, rough=0.38)
        if lv >= 11:
            cone(0.06, 0, 0.13, (sx * 0.31, 0, 0.95), trim, verts=6,
                 rot=(0, math.radians(sx * 22), 0), metallic=0.7, rough=0.3)
    sphere(0.185, (0, 0, 0.98), skin)
    if lv <= 2:
        cone(0.22, 0.06, 0.16, (0, 0, 1.1), shade(tint, 1.2), verts=14)
    else:
        helmet(T, tint, shade(tint, 1.25))
    if lv >= 9:
        cape(T, tint)
    if lv >= 5:
        shield(T, lv)
    weapon(WEAPONS.get(art, 'sword'), T, tint)
    if lv >= 17:
        for sx in (-1, 1):
            sphere(0.035, (sx * 0.14, -0.19, 0.45), T['accent'], emission=1.9)


def unit_kind(art, air, housing):
    if air:
        return 'air'
    if housing and housing >= 18:
        return 'giant'
    if art in ('mage', 'warlock', 'hexweaver', 'witchling', 'frost', 'voltaic',
               'oracle', 'seer', 'warden'):
        return 'caster'
    return 'ground'


def build_unit(tint, kind, T, tier, hero=False, art=''):
    unit_body(tint, kind, T, tier, art)
    if hero:
        torus(0.3, 0.03, (0, 0, 1.34), T['trim'], emission=1.6, rough=0.3)
        for i in range(5):
            a = math.radians(i * 72)
            sphere(0.045, (math.cos(a) * 0.3, math.sin(a) * 0.3, 1.34), T['accent'],
                   emission=1.7)


def build_siege_unit(T, tier):
    b_siege(T, tier)


# ------------------------------------------------------------ style demos
# Four directions for the same building, so a choice can be made by looking
# rather than by describing. Same subject (an Archer Tower), same materials,
# same camera -- only the modelling language changes.

def demo_chunky(T):
    """A: stylised. Few, large forms; heavy bevels; readable at 40px."""
    pad(1.6, T, 3.0)
    courses(0.8, 0.8, 0.2, 0.9, 4, T)
    cyl(0.54, 0.12, (0, 0, 1.16), T['stoneDark'], verts=16)
    for i in range(6):
        a = math.radians(i * 60)
        box(0.15, 0.15, 0.2, (math.cos(a) * 0.44, math.sin(a) * 0.44, 1.32), T['stone'], bevel=0.03)
    cone(0.5, 0.06, 0.45, (0, 0, 1.62), T['roof'], verts=12)


def demo_smooth(T):
    """B: high-poly realistic. Dense curved surfaces, tapered masonry, real
    thickness everywhere, fine bevels. No facets you can count."""
    pad(1.7, T, 3.0)
    # tapered drum, built from many thin courses so the silhouette curves
    for i in range(26):
        t = i / 25.0
        r = 0.52 - t * 0.08
        cyl(r, 0.042, (0, 0, 0.26 + i * 0.04), shade(T['stone'], 1.0 + (i % 2) * 0.06),
            verts=64, bevel=0.006)
    cyl(0.575, 0.05, (0, 0, 1.3), T['stoneDark'], verts=64, bevel=0.01)
    cyl(0.6, 0.035, (0, 0, 1.35), shade(T['stone'], 1.1), verts=64, bevel=0.01)
    # merlons with real gaps and capstones
    for i in range(14):
        a = math.radians(i * (360 / 14))
        x, y = math.cos(a) * 0.53, math.sin(a) * 0.53
        box(0.12, 0.09, 0.17, (x, y, 1.45), T['stone'], rot=(0, 0, a), bevel=0.014)
        box(0.13, 0.1, 0.03, (x, y, 1.55), shade(T['stone'], 1.14), rot=(0, 0, a), bevel=0.008)
    # conical roof as a lathed surface, with a lip and a finial
    for i in range(18):
        t = i / 17.0
        cyl(0.5 * (1 - t) + 0.03, 0.035, (0, 0, 1.6 + i * 0.032),
            shade(T['roof'], 1.0 - t * 0.18), verts=64, bevel=0.004)
    cyl(0.56, 0.03, (0, 0, 1.59), shade(T['roofDark'], 1.05), verts=64, bevel=0.008)
    sphere(0.055, (0, 0, 2.2), T['trim'], metallic=0.8, rough=0.22)
    # arrow slits, recessed
    for i in range(4):
        a = math.radians(i * 90 + 45)
        box(0.06, 0.1, 0.28, (math.cos(a) * 0.48, math.sin(a) * 0.48, 0.85),
            '#1b1e22', rot=(0, 0, a), bevel=0.01)


def demo_ornate(T):
    """C: ornate. The smooth build plus carved trim, gold banding, buttresses
    and a balcony -- decoration as structure."""
    demo_smooth(T)
    for i in range(4):
        a = math.radians(i * 90 + 45)
        x, y = math.cos(a) * 0.5, math.sin(a) * 0.5
        for j in range(7):                              # stepped buttress
            box(0.17 - j * 0.012, 0.13, 0.1, (x * (1 + j * 0.03), y * (1 + j * 0.03), 0.3 + j * 0.12),
                shade(T['stone'], 0.92), rot=(0, 0, a), bevel=0.012)
    for z in (0.62, 0.98):                              # gold string courses
        cyl(0.545, 0.028, (0, 0, z), T['trim'], verts=64, metallic=0.85, rough=0.22, bevel=0.006)
        for i in range(20):
            a = math.radians(i * 18)
            sphere(0.022, (math.cos(a) * 0.55, math.sin(a) * 0.55, z), T['trim'],
                   metallic=0.85, rough=0.2)
    cyl(0.66, 0.03, (0, 0, 1.24), T['trim'], verts=64, metallic=0.8, rough=0.25, bevel=0.006)
    for i in range(24):                                 # balcony rail
        a = math.radians(i * 15)
        cyl(0.016, 0.13, (math.cos(a) * 0.63, math.sin(a) * 0.63, 1.3), T['trim'],
            verts=10, metallic=0.8, rough=0.25)
    for i in range(8):                                  # lanterns
        a = math.radians(i * 45 + 22)
        sphere(0.05, (math.cos(a) * 0.62, math.sin(a) * 0.62, 1.42), T['glow'], emission=1.8)


def demo_machined(T):
    """D: engineered. Panelled plate, recessed seams, bolt rows, a machined
    ring and a hard-edged canopy -- built, not carved."""
    pad(1.7, T, 3.0)
    cyl(0.6, 0.1, (0, 0, 0.25), T['metalDark'], verts=48, metallic=0.7, rough=0.4, bevel=0.02)
    for i in range(8):                                  # plated column segments
        z = 0.32 + i * 0.13
        cyl(0.46, 0.11, (0, 0, z), T['metal'], verts=48, metallic=0.72, rough=0.33, bevel=0.014)
        cyl(0.478, 0.018, (0, 0, z + 0.06), T['metalDark'], verts=48, metallic=0.8, rough=0.28)
        for j in range(10):                             # bolt row
            a = math.radians(j * 36 + i * 12)
            sphere(0.019, (math.cos(a) * 0.47, math.sin(a) * 0.47, z), T['metal'],
                   metallic=0.9, rough=0.2)
    for i in range(4):                                  # vertical seams
        a = math.radians(i * 90)
        box(0.03, 0.05, 1.06, (math.cos(a) * 0.47, math.sin(a) * 0.47, 0.85),
            T['metalDark'], rot=(0, 0, a), metallic=0.75, rough=0.3, bevel=0.006)
    cyl(0.58, 0.06, (0, 0, 1.42), T['metalDark'], verts=48, metallic=0.8, rough=0.28, bevel=0.012)
    cyl(0.5, 0.05, (0, 0, 1.48), T['metal'], verts=48, metallic=0.85, rough=0.22, bevel=0.01)
    for i in range(6):                                  # canopy ribs
        a = math.radians(i * 60)
        box(0.5, 0.05, 0.04, (0, 0, 1.72), T['metalDark'], rot=(0, math.radians(-20), a),
            metallic=0.75, rough=0.3, bevel=0.006)
    cone(0.42, 0.1, 0.3, (0, 0, 1.66), shade(T['metal'], 0.9), verts=48, metallic=0.7, rough=0.35)
    cyl(0.09, 0.16, (0, 0, 1.94), T['accent'], verts=24, emission=1.6)
    for i in range(4):
        a = math.radians(i * 90 + 45)
        box(0.07, 0.16, 0.06, (math.cos(a) * 0.42, math.sin(a) * 0.42, 1.5),
            T['accent'], rot=(0, 0, a), emission=1.3, bevel=0.008)


STYLE_DEMOS = {'a-stylised': demo_chunky, 'b-smooth': demo_smooth,
               'c-ornate': demo_ornate, 'd-machined': demo_machined}


# ---------------------------------------------------------------- scenery
# The woods around the base. Deliberately outside the era system: the village
# changes with every Town Hall, the forest it stands in does not. One fixed
# woodland palette, rendered once, used at every level.

FOREST = {
    'leaf': '#4e7a34', 'leafMid': '#3f6b2c', 'leafDark': '#2f5622',
    'bark': '#6b4a2c', 'barkPale': '#9c8462', 'soil': '#4a6b34',
    'stone': '#8b8778', 'stoneDark': '#5f5c50', 'bloom': '#e0b34d',
}


def _trunk(r, h, lean=0.0):
    F = FOREST
    cyl(r, h, (0, 0, h / 2), F['bark'], verts=8,
        rot=(math.radians(lean), 0, 0), bevel=0.01)
    for i in range(3):                                  # root flare
        a = math.radians(i * 120 + 30)
        box(r * 1.5, r * 1.5, 0.08, (math.cos(a) * r * 0.9, math.sin(a) * r * 0.9, 0.04),
            shade(F['bark'], 0.85), bevel=0.02)


def sc_pine():
    """Conifer: three stacked skirts, the classic isometric tree."""
    F = FOREST
    _trunk(0.09, 0.5)
    for i in range(3):
        r = 0.46 - i * 0.11
        z = 0.44 + i * 0.36
        cone(r, r * 0.16, 0.46, (0, 0, z + 0.23),
             F['leaf'] if i % 2 == 0 else F['leafMid'], verts=12)
    cone(0.14, 0, 0.2, (0, 0, 1.62), F['leafDark'], verts=10)


def sc_pine_tall():
    """A taller, narrower conifer, so a stand of pines is not a row of clones."""
    F = FOREST
    _trunk(0.08, 0.6)
    for i in range(4):
        r = 0.4 - i * 0.08
        z = 0.5 + i * 0.34
        cone(r, r * 0.14, 0.44, (0, 0, z + 0.22),
             F['leafMid'] if i % 2 == 0 else F['leafDark'], verts=12)
    cone(0.11, 0, 0.22, (0, 0, 1.86), F['leafDark'], verts=10)


def sc_oak():
    """Broadleaf: a fat trunk under a canopy of overlapping blobs."""
    F = FOREST
    _trunk(0.12, 0.62)
    for sx in (-1, 1):                                   # boughs
        cyl(0.05, 0.34, (sx * 0.12, 0, 0.72), shade(F['bark'], 1.05), verts=6,
            rot=(0, math.radians(sx * 34), 0))
    blobs = ((0, 0, 1.16, 0.42), (-0.3, 0.06, 1.0, 0.28), (0.3, -0.05, 1.02, 0.3),
             (0.05, 0.28, 1.06, 0.26), (0.02, -0.26, 1.08, 0.27))
    for i, (x, y, z, r) in enumerate(blobs):
        sphere(r, (x, y, z), F['leaf'] if i % 2 == 0 else F['leafMid'], rough=0.62)


def sc_oak_old():
    """A wider, older broadleaf with a leaning trunk."""
    F = FOREST
    _trunk(0.15, 0.5, lean=4)
    blobs = ((0, 0, 1.02, 0.46), (-0.36, 0.04, 0.9, 0.3), (0.34, -0.06, 0.94, 0.32),
             (0.04, 0.32, 0.96, 0.28), (-0.06, -0.3, 0.98, 0.29), (0, 0, 1.3, 0.3))
    for i, (x, y, z, r) in enumerate(blobs):
        sphere(r, (x, y, z), F['leafMid'] if i % 2 == 0 else F['leafDark'], rough=0.64)


def sc_birch():
    """A tall, thin pale tree to break up the greens."""
    F = FOREST
    cyl(0.07, 1.15, (0, 0, 0.58), F['barkPale'], verts=8)
    for i in range(4):                                   # bark bands
        box(0.16, 0.16, 0.035, (0, 0, 0.3 + i * 0.24), shade(F['bark'], 0.7), bevel=0.01)
    for i, (x, y, z, r) in enumerate(((0, 0, 1.38, 0.3), (-0.2, 0.05, 1.24, 0.2),
                                      (0.21, -0.04, 1.26, 0.21))):
        sphere(r, (x, y, z), F['leaf'] if i % 2 == 0 else F['leafMid'], rough=0.6)


def sc_bush():
    F = FOREST
    for i, (x, y, z, r) in enumerate(((0, 0, 0.22, 0.26), (-0.22, 0.04, 0.17, 0.19),
                                      (0.2, -0.06, 0.18, 0.2))):
        sphere(r, (x, y, z), F['leaf'] if i % 2 == 0 else F['leafMid'], rough=0.65)


def sc_flowers():
    F = FOREST
    for i, (x, y, r) in enumerate(((0, 0, 0.2), (-0.18, 0.1, 0.15), (0.17, -0.08, 0.16))):
        sphere(r, (x, y, 0.14), F['leafMid'], rough=0.68)
    for i in range(5):
        a = math.radians(i * 72 + 15)
        sphere(0.045, (math.cos(a) * 0.16, math.sin(a) * 0.16, 0.28), F['bloom'], rough=0.5)


def sc_rock():
    F = FOREST
    box(0.42, 0.36, 0.24, (0, 0, 0.12), F['stone'], bevel=0.05)
    box(0.24, 0.2, 0.18, (0.16, 0.1, 0.3), shade(F['stone'], 1.1), bevel=0.04)
    box(0.16, 0.14, 0.1, (-0.16, -0.08, 0.28), F['stoneDark'], bevel=0.03)
    sphere(0.1, (-0.2, 0.14, 0.14), F['leafDark'], rough=0.7)      # moss


def sc_stump():
    F = FOREST
    cyl(0.2, 0.26, (0, 0, 0.13), F['bark'], verts=12, bevel=0.02)
    cyl(0.17, 0.04, (0, 0, 0.27), shade(F['bark'], 1.35), verts=12)
    sphere(0.13, (0.24, 0.06, 0.1), F['leafDark'], rough=0.66)


def sc_log():
    F = FOREST
    cyl(0.13, 0.8, (0, 0, 0.13), F['bark'], verts=10, rot=(0, math.radians(90), 0))
    cyl(0.1, 0.04, (0.4, 0, 0.13), shade(F['bark'], 1.35), verts=10,
        rot=(0, math.radians(90), 0))
    sphere(0.11, (-0.22, 0.14, 0.1), F['leafMid'], rough=0.68)


SCENERY = {
    'pine': sc_pine, 'pinetall': sc_pine_tall, 'oak': sc_oak, 'oakold': sc_oak_old,
    'birch': sc_birch, 'bush': sc_bush, 'flowers': sc_flowers, 'rock': sc_rock,
    'stump': sc_stump, 'log': sc_log,
}

# Footprint each prop is framed at, so a tree towers over a bush.
SCENERY_SIZE = {'pine': 1.8, 'pinetall': 2.0, 'oak': 1.8, 'oakold': 1.8,
                'birch': 1.9, 'bush': 1.0, 'flowers': 0.9, 'rock': 1.1,
                'stump': 0.9, 'log': 1.0}


def build_scenery(kind):
    """One prop standing on its own patch of forest floor."""
    cyl(0.44, 0.06, (0, 0, 0.03), FOREST['soil'], verts=18, bevel=0.01)
    SCENERY[kind]()


# ------------------------------------------------------------------ ground
def build_ground_tile():
    box(1.0, 1.0, 0.16, (0, 0, 0.08), '#6f9a4e')
    for (x, y, r) in ((-0.22, 0.18, 0.07), (0.24, -0.12, 0.05), (0.08, 0.3, 0.04)):
        sphere(r, (x, y, 0.17), '#5c8a42', bevel=0)


# -------------------------------------------------------------------- main
def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--only', default='',
                    help='groups: townhall,building,wall,unit,scenery,ground')
    ap.add_argument('--samples', type=int, default=24)
    ap.add_argument('--keys', default='', help='only these building/unit keys')
    ap.add_argument('--levels', default='', help='only these levels, e.g. 1,15,30')
    ap.add_argument('--skip-existing', action='store_true',
                    help='leave sprites already on disk alone, for resuming a run')
    args = ap.parse_args(sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else sys.argv[1:])
    groups = set(g.strip() for g in args.only.split(',') if g.strip()) or \
        {'townhall', 'building', 'wall', 'unit', 'scenery', 'ground'}
    only_keys = set(k.strip() for k in args.keys.split(',') if k.strip())
    only_levels = set(int(x) for x in args.levels.split(',') if x.strip())

    os.makedirs(OUT_DIR, exist_ok=True)
    manifest_path = os.path.join(OUT_DIR, 'sprites.json')
    if os.path.exists(manifest_path):
        MANIFEST.update(json.load(open(manifest_path)))

    b_levels = DATA['buildingLevels']
    t_levels = DATA['troopLevels']

    def wanted(level):
        return not only_levels or level in only_levels

    def done(name):
        return args.skip_existing and name in MANIFEST and \
            os.path.exists(os.path.join(ROOT, MANIFEST[name]['file']))

    if 'townhall' in groups:
        print('Town Halls...')
        for th in DATA['townHalls']:
            if not wanted(th['level']):
                continue
            reset_scene()
            build_town_hall(th)
            render('th%02d' % th['level'], 4, samples=args.samples)

    if 'building' in groups:
        print('Buildings: %d levels each...' % len(b_levels))
        for b in DATA['buildings']:
            fn = BUILDING_BUILDERS.get(b['art'])
            if not fn or (only_keys and b['key'] not in only_keys):
                continue
            for entry in b_levels:
                lvl = entry['level']
                if not wanted(lvl):
                    continue
                name = 'b_%s_L%02d' % (b['key'], lvl)
                if done(name):
                    continue
                T, ornate = level_look(b_levels, lvl)
                CUR_LEVEL[0] = lvl
                reset_scene()
                fn(T, ornate)
                render(name, max(2, b['size']), samples=args.samples)

    if 'wall' in groups:
        print('Walls...')
        for skin in DATA['wallSkins']:
            if not wanted(skin['level']):
                continue
            CUR_LEVEL[0] = skin['level']
            reset_scene()
            build_wall(skin, skin['mat'], skin['detail'])
            render('wall%02d' % skin['level'], 1, samples=max(18, args.samples // 2))

    if 'unit' in groups:
        print('Units: %d levels each...' % len(t_levels))
        for t in DATA['troops']:
            if only_keys and t['key'] not in only_keys:
                continue
            for entry in t_levels:
                lvl = entry['level']
                if not wanted(lvl):
                    continue
                name = 'u_%s_L%02d' % (t['key'], lvl)
                if done(name):
                    continue
                T, ornate = level_look(t_levels, lvl)
                CUR_LEVEL[0] = int(round(lvl * 30.0 / len(t_levels)))
                reset_scene()
                build_unit(t['tint'], unit_kind(t['art'], t['air'], t['housing']), T, ornate,
                           art=t['art'])
                render(name, 1.4, samples=args.samples)
        for h in DATA['heroes']:
            if only_keys and h['key'] not in only_keys:
                continue
            for entry in t_levels:
                lvl = entry['level']
                if not wanted(lvl):
                    continue
                name = 'u_%s_L%02d' % (h['key'], lvl)
                if done(name):
                    continue
                T, ornate = level_look(t_levels, lvl)
                CUR_LEVEL[0] = int(round(lvl * 30.0 / len(t_levels)))
                reset_scene()
                build_unit(h['tint'], unit_kind(h['art'], False, 0), T, ornate, hero=True,
                           art=h['art'])
                render(name, 1.4, samples=args.samples)
        for m in DATA['siege']:
            if only_keys and m['key'] not in only_keys:
                continue
            for lvl in range(1, len(t_levels) + 1, 4):
                if not wanted(lvl):
                    continue
                T, ornate = level_look(t_levels, lvl)
                reset_scene()
                build_siege_unit(T, ornate)
                render('u_%s_L%02d' % (m['key'], lvl), 2, samples=args.samples)

    if 'styles' in groups:
        print('Style demos...')
        T = b_levels[17]['mat']          # a mid-game palette, level 18
        for name, fn in sorted(STYLE_DEMOS.items()):
            reset_scene()
            CUR_LEVEL[0] = 18
            fn(T)
            render('style_' + name, 3, samples=args.samples)

    if 'scenery' in groups:
        print('Scenery...')
        for kind in sorted(SCENERY):
            name = 'sc_' + kind
            if done(name):
                continue
            reset_scene()
            build_scenery(kind)
            render(name, SCENERY_SIZE[kind], samples=args.samples)

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
