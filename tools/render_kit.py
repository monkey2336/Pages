"""Render models from a CC0 glTF asset pack through the game's isometric camera.

The village scenery was procedural cones and spheres standing in for trees.
The KayKit nature packs are real modelled trees, rocks and bushes, CC0, and
this turns them into sprites the game can place -- same camera, same lighting,
same anchor convention as everything render_sprites.py makes, so they drop into
the board next to the buildings without looking imported.

Imported materials are kept as they are. The packs are painted on a texture
atlas, and rebuilding that as procedural nodes would throw away the thing worth
having; the lighting rig is ours, so they still sit in the same light as the
buildings.

    blender-python tools/render_kit.py -- --pack forest --list
    blender-python tools/render_kit.py -- --pack forest
"""

import argparse
import json
import math
import os
import sys

import bpy
from mathutils import Vector

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import render_sprites as R           # noqa: E402
import outline as OUT                # noqa: E402
from PIL import Image                # noqa: E402

ROOT = R.ROOT
OUT_DIR = R.OUT_DIR
SOURCE = os.path.join(ROOT, 'assets', 'source')

# Which models from each pack become which sprite, and how many tiles across
# the model should be drawn. The village asks for scenery by name, so the
# existing names are kept and the new variants extend them rather than
# replacing the list wholesale.
FOREST = os.path.join('kaykit_forest', 'gltf')

# Picked by rendering all 105 models small and looking at them, not by name.
# The pack does not simply beat what is already here: our procedural conifers
# read better than theirs, so those stay and these are added alongside for
# variety. The rocks and grass tufts are the other way round -- the boulders
# are a straight upgrade on a white box, and there was no ground detail at all
# before.
SCENERY = [
    # sprite name       source model                tiles across
    ('sc_ktree1',       'Tree_1_B_Color1',          1.9),   # round broadleaf
    ('sc_ktree2',       'Tree_2_D_Color1',          1.9),   # clustered canopy
    ('sc_ktree3',       'Tree_3_A_Color1',          2.1),   # wide flat crown
    ('sc_ktree4',       'Tree_4_A_Color1',          2.0),   # conifer
    ('sc_ktree5',       'Tree_4_C_Color1',          1.9),   # young conifer
    ('sc_kdead1',       'Tree_Bare_1_B_Color1',     1.8),
    ('sc_kdead2',       'Tree_Bare_2_A_Color1',     1.8),

    ('sc_krock1',       'Rock_3_B_Color1',          1.0),
    ('sc_krock2',       'Rock_3_G_Color1',          1.1),
    ('sc_krock3',       'Rock_3_L_Color1',          1.2),
    ('sc_krock4',       'Rock_3_N_Color1',          0.9),
    ('sc_koutcrop',     'Rock_1_L_Color1',          1.5),

    ('sc_kbush1',       'Bush_1_F_Color1',          1.0),
    ('sc_kbush2',       'Bush_1_G_Color1',          1.1),
    ('sc_kbush3',       'Bush_4_E_Color1',          1.0),
    ('sc_kbush4',       'Bush_4_F_Color1',          1.1),

    ('sc_kgrass1',      'Grass_1_C_Color1',         0.8),
    ('sc_kgrass2',      'Grass_2_C_Color1',         0.8),
    ('sc_kgrass3',      'Grass_2_D_Color1',         0.8),
]

PACKS = {
    'forest': {'dir': FOREST, 'items': SCENERY},
}


def clear_imported():
    for o in list(bpy.context.scene.objects):
        bpy.data.objects.remove(o, do_unlink=True)


def import_model(path):
    """Bring in one model and drop it on the origin, feet on the ground.

    Pack models are authored around their own origin, which is not always the
    base of the trunk. Everything else in the game anchors on world origin at
    ground level, so the import is recentred to match."""
    bpy.ops.import_scene.gltf(filepath=path)
    bpy.context.view_layer.update()
    meshes = [o for o in bpy.context.scene.objects if o.type == 'MESH']
    if not meshes:
        return []
    lo = Vector((1e9, 1e9, 1e9))
    hi = Vector((-1e9, -1e9, -1e9))
    for o in meshes:
        for corner in o.bound_box:
            w = o.matrix_world @ Vector(corner)
            lo = Vector((min(lo.x, w.x), min(lo.y, w.y), min(lo.z, w.z)))
            hi = Vector((max(hi.x, w.x), max(hi.y, w.y), max(hi.z, w.z)))
    shift = Vector((-(lo.x + hi.x) / 2, -(lo.y + hi.y) / 2, -lo.z))
    for o in meshes:
        if o.parent is None:
            o.location = o.location + shift
    bpy.context.view_layer.update()
    return meshes


def soften_materials():
    """Take the shine off. The packs ship a single flat atlas and default
    glTF roughness, which under our three-light rig reads as wet plastic."""
    for mat in bpy.data.materials:
        if not mat.use_nodes:
            continue
        for node in mat.node_tree.nodes:
            if node.type != 'BSDF_PRINCIPLED':
                continue
            node.inputs['Roughness'].default_value = 0.82
            if 'Specular IOR Level' in node.inputs:
                node.inputs['Specular IOR Level'].default_value = 0.22
            if 'Metallic' in node.inputs:
                node.inputs['Metallic'].default_value = 0.0


def render_one(name, path, footprint, samples, outline_width, max_px):
    clear_imported()
    R.reset_scene()
    clear_imported()
    if not import_model(path):
        print('  %s: nothing imported from %s' % (name, os.path.basename(path)))
        return None
    soften_materials()

    sc = bpy.context.scene
    ortho, aim_z = R.fit_to_footprint(footprint)
    px = max(64, min(max_px, int(round(R.PX_PER_UNIT * ortho))))
    ss = int(os.environ.get('SPRITE_SUPERSAMPLE', '2'))
    sc.render.resolution_x = sc.render.resolution_y = px * ss
    sc.cycles.samples = samples
    sc.cycles.use_denoising = True
    cam = R.add_camera(ortho, aim_z)
    R.add_lights(max(1.0, footprint * 0.6))
    ax, ay = R.project_origin(sc, cam, px)

    out = os.path.join(OUT_DIR, name + '.png')
    sc.render.filepath = out
    bpy.ops.render.render(write_still=True)

    # A keyline that reads on a two-tile tree swamps a tuft of grass, so it is
    # scaled to the sprite rather than fixed.
    width = outline_width if footprint >= 1.5 else max(1, outline_width - 1)
    im = OUT.outline_one(out, width * ss, 0.85) if outline_width \
        else Image.open(out).convert('RGBA')
    im.resize((px, px), Image.LANCZOS).save(out)

    R.MANIFEST[name] = {'file': 'assets/sprites/%s.png' % name, 'w': px, 'h': px,
                        'anchorX': ax, 'anchorY': ay, 'footprint': footprint,
                        'drawnShadow': True, 'outlined': True}
    print('  %s <- %s  (%dpx)' % (name, os.path.basename(path), px))
    return name


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--pack', default='forest', choices=sorted(PACKS))
    ap.add_argument('--list', action='store_true', help='list models in the pack and stop')
    ap.add_argument('--only', default='', help='only these sprite names')
    ap.add_argument('--samples', type=int, default=28)
    ap.add_argument('--max-px', type=int, default=320)
    ap.add_argument('--outline', type=int, default=2)
    ap.add_argument('--skip-existing', action='store_true')
    args = ap.parse_args(sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else sys.argv[1:])

    pack = PACKS[args.pack]
    src = os.path.join(SOURCE, pack['dir'])
    if args.list:
        for f in sorted(os.listdir(src)):
            if f.endswith('.gltf'):
                print(f[:-5])
        return

    os.makedirs(OUT_DIR, exist_ok=True)
    manifest_path = os.path.join(OUT_DIR, 'sprites.json')
    if os.path.exists(manifest_path):
        R.MANIFEST.update(json.load(open(manifest_path)))

    only = set(k.strip() for k in args.only.split(',') if k.strip())
    done = 0
    for name, model, footprint in pack['items']:
        if only and name not in only:
            continue
        if args.skip_existing and name in R.MANIFEST and R.MANIFEST[name].get('outlined'):
            continue
        path = os.path.join(src, model + '.gltf')
        if not os.path.exists(path):
            print('  %s: missing %s' % (name, model))
            continue
        if render_one(name, path, footprint, args.samples, args.outline, args.max_px):
            done += 1
            R.save_manifest(manifest_path)

    R.write_manifest_js(R.MANIFEST)
    print('rendered %d sprites from the %s pack' % (done, args.pack))


if __name__ == '__main__':
    main()
