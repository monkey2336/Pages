"""Render animated troop sprite sheets by posing our own geometry on the KayKit rig.

The troops were static images that slid across the battlefield. This builds the
same troops in the skeleton's rest pose, binds every part to a bone, plays a
real walk, attack or death clip through them, and packs the frames into one
sheet per troop.

Nothing from the asset pack is visible in the output. The mannequin meshes are
thrown away on import; only the skeleton and the motion are used, and every
surface is still the procedural geometry from render_sprites.py. The pack is
CC0 (see assets/source/kaykit/LICENSE.txt), so this is clean either way, but it
also means the troops keep their per-level materials and kit.

Binding is rigid, one bone per part, which is what our chunky primitives want
and is how the pack's own mannequin is put together. For each frame the part is
moved by its bone's delta from rest:

    world = facing @ pose_bone.matrix @ rest_bone.matrix_local.inverted() @ rest

Framing is computed once, over every frame of every clip and both facings, so
the camera never moves and the troop never changes size mid-animation. The
frames are then cropped to a common box and packed into a grid, which turns
forty-odd files per troop into one and keeps the whole animated set to a few
megabytes.

    blender-python tools/render_troops_anim.py -- --keys grunt --levels 13
"""

import argparse
import json
import math
import os
import sys

import bpy
from mathutils import Matrix, Vector
from PIL import Image

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import render_sprites as R           # noqa: E402
import outline as OUT                # noqa: E402

ROOT = R.ROOT
OUT_DIR = R.OUT_DIR
KAYKIT = os.path.join(ROOT, 'assets', 'source', 'kaykit')
TMP = os.path.join(ROOT, 'assets', 'sprites', '_animtmp')

# Two facings, each mirrored at draw time, which covers the four diagonals an
# isometric board actually moves along. 0 degrees puts the troop in a
# three-quarter view coming towards the camera.
FACINGS = [('', 0.0), ('Back', 180.0)]

CLIP_FILES = {
    'anim_movement.glb': ['Walking_B', 'Running_A'],
    'anim_melee.glb': ['Melee_1H_Attack_Chop', 'Melee_2H_Attack_Chop',
                       'Melee_Unarmed_Attack_Punch_A'],
    'anim_ranged.glb': ['Ranged_Bow_Release', 'Ranged_Magic_Shoot'],
    'anim_general.glb': ['Idle_A', 'Death_A'],
}

# Our name for the strip, how many frames we sample, and whether it loops.
# A loop drops the last frame as a duplicate of the first; a one-shot keeps
# both ends so it lands on its final pose.
STRIPS = [
    ('walk', 8, True),
    ('attack', 8, False),
    ('death', 6, False),
]

# Only the walk cycle decides how big the troop is drawn. An attack swings a
# weapon well outside the body, and sizing off that would shrink the troop to
# fit a sword arc that is on screen for three frames -- see framing().
SIZED_BY = {'walk'}


def action_for(strip, weapon_kind, kind):
    """The clip a troop swings, chosen by what it is holding."""
    if strip == 'walk':
        return 'Walking_B'
    if strip == 'death':
        return 'Death_A'
    if kind == 'caster':
        return 'Ranged_Magic_Shoot'
    if weapon_kind == 'bow':
        return 'Ranged_Bow_Release'
    if weapon_kind in ('none', 'fist'):
        return 'Melee_Unarmed_Attack_Punch_A'
    if weapon_kind in ('hammer', 'club', 'axe', 'lance', 'spear'):
        return 'Melee_2H_Attack_Chop'
    return 'Melee_1H_Attack_Chop'


def load_rig():
    """Import the skeleton and every clip, keeping only the armature.

    Deletion is scoped to what each import brought in rather than to anything
    that looks like a mannequin, so a mis-tagged troop part can never be swept
    up with them."""
    ours = set(bpy.context.scene.objects)
    bpy.ops.import_scene.gltf(filepath=os.path.join(KAYKIT, 'rig_medium.glb'))
    arm = None
    for o in list(bpy.context.scene.objects):
        if o in ours:
            continue
        if o.type == 'ARMATURE' and arm is None:
            arm = o
        else:
            bpy.data.objects.remove(o, do_unlink=True)
    for fname in CLIP_FILES:
        before = set(bpy.context.scene.objects)
        bpy.ops.import_scene.gltf(filepath=os.path.join(KAYKIT, fname))
        for o in list(bpy.context.scene.objects):
            if o not in before:
                bpy.data.objects.remove(o, do_unlink=True)
    # The clips' own armatures are gone, which leaves the actions with no
    # users; a fake user keeps them alive for the rest of the run.
    for act in bpy.data.actions:
        act.use_fake_user = True
    arm.matrix_world = Matrix.Identity(4)
    return arm


def nearest_bone(arm, point):
    """Fallback for a part with no tag: the bone whose segment it sits closest
    to, with the centre line pulled towards the spine so a torso box is never
    captured by a leg."""
    best, best_d = 'hips', 1e9
    for b in arm.data.bones:
        if b.name == 'root':
            continue
        h, t = b.head_local, b.tail_local
        seg = t - h
        u = max(0.0, min(1.0, (point - h).dot(seg) / (seg.dot(seg) or 1.0)))
        d = (point - (h + seg * u)).length
        if abs(point.x) < 0.09 and b.name.endswith(('.l', '.r')):
            d += 0.35
        if d < best_d:
            best, best_d = b.name, d
    return best


def bind_parts(arm):
    """Freeze each part's rest world matrix and the bone that drives it."""
    bpy.context.view_layer.update()
    parts = []
    for o in bpy.context.scene.objects:
        if o.type != 'MESH':
            continue
        o.matrix_world = Matrix.Scale(R.RIG_SCALE, 4) @ o.matrix_world
        name = o.get('bind') or nearest_bone(arm, o.matrix_world.translation)
        if name not in arm.data.bones:
            name = 'hips'
        parts.append((o, name, o.matrix_world.copy()))
    return parts


def pose(arm, parts, action, frame, facing, scale=1.0):
    """Put the figure into one frame of one clip, turned to face `facing`.

    The bone delta is computed in armature space, which is world space here
    because the armature is left at the identity. The facing turn goes on the
    outside of it, so it rotates the posed figure rather than the axes the
    pose is expressed in."""
    if arm.animation_data is None:
        arm.animation_data_create()
    ad = arm.animation_data
    if ad.action is not action:
        ad.action = action
        # Since 4.4 an action holds its channels in slots, and one assigned
        # without a slot bound evaluates to nothing at all -- the figure just
        # stands in its rest pose on every frame.
        slots = getattr(action, 'slots', None)
        if slots:
            ad.action_slot = next((s for s in slots if s.target_id_type == 'OBJECT'),
                                  slots[0])
    bpy.context.scene.frame_set(int(round(frame)))
    bpy.context.view_layer.update()
    # Walk cycles travel; the sprite has to stay under its own feet, so the
    # root's horizontal drift is taken back out.
    drift = arm.pose.bones['root'].matrix.translation.copy()
    drift.z = 0.0
    outer = (Matrix.Scale(scale, 4) @ Matrix.Rotation(math.radians(facing), 4, 'Z')
             @ Matrix.Translation(-drift))
    for obj, bone, rest in parts:
        pb = arm.pose.bones[bone]
        obj.matrix_world = outer @ pb.matrix @ arm.data.bones[bone].matrix_local.inverted() @ rest


def frame_list(action, count, loop):
    lo, hi = action.frame_range
    span = hi - lo
    if loop:
        return [lo + span * i / count for i in range(count)]
    return [lo + span * i / max(1, count - 1) for i in range(count)]


def bounds_over(arm, parts, plan, strips=None):
    """Bounding box over every frame of the named clips, both facings."""
    xs, ys, zs = [], [], []
    for strip, action, frames in plan:
        if strips and strip not in strips:
            continue
        for _suffix, facing in FACINGS:
            for f in frames:
                pose(arm, parts, action, f, facing)
                for obj, _b, _r in parts:
                    for corner in obj.bound_box:
                        w = obj.matrix_world @ Vector(corner)
                        xs.append(w.x); ys.append(w.y); zs.append(w.z)
    return (min(xs), max(xs)), (min(ys), max(ys)), (min(zs), max(zs))


def framing(standing, everything, footprint):
    """Camera size and aim.

    Size comes from the standing poses alone. A death animation ends up lying
    flat and is half again as wide as the troop is tall; sizing off that
    shrinks the walk cycle to match a pose that is on screen for a moment. The
    frame is then widened to hold every pose, which costs nothing -- an
    orthographic camera fixes on-screen size by the scale factor, so a roomier
    frame only adds transparent margin, and the margin is cropped off again
    once the frames exist."""
    (x0, x1), (y0, y1), _ = standing
    extent = max(x1 - x0, y1 - y0) or 1.0
    factor = (footprint * 0.94) / extent

    (ax0, ax1), (ay0, ay1), (az0, az1) = everything
    wide = max(ax1 - ax0, ay1 - ay0) * factor
    height = (az1 - min(0.0, az0)) * factor
    diag = max(wide, footprint * 0.94) * math.sqrt(2.0)
    vertical = diag * 0.5 + height * math.cos(math.radians(30))
    return max(diag, vertical) * 1.14, height * 0.46, factor


def build_plan(weapon_kind, kind):
    plan = []
    for strip, count, loop in STRIPS:
        act = bpy.data.actions.get(action_for(strip, weapon_kind, kind))
        if act:
            plan.append((strip, act, frame_list(act, count, loop)))
    return plan


def pack(name, shots, px, anchor, outline_width, ss):
    """Lay the frames out as an atlas, one row per clip.

    Every frame of a clip shares one crop box, which is what keeps the
    animation still -- crop each frame to its own content and the troop jitters
    around its cell as the silhouette changes. Clips do not share a box with
    each other, because a death animation ends up lying flat and half again as
    wide as the troop is tall, and making the walk rows carry that width is
    most of the file for none of the picture."""
    rows, height, width = [], 0, 0
    for clip in sorted(shots):
        frames, box = [], None
        for p in shots[clip]:
            # The keyline is drawn at render resolution and downsampled with
            # the art, so it comes out smooth rather than stair-stepped.
            im = (OUT.outline_one(p, outline_width * ss, 0.85) if outline_width
                  else Image.open(p).convert('RGBA')).resize((px, px), Image.LANCZOS)
            frames.append(im)
            bb = im.getbbox()
            if bb:
                box = bb if box is None else (min(box[0], bb[0]), min(box[1], bb[1]),
                                              max(box[2], bb[2]), max(box[3], bb[3]))
        pad = 2
        crop = (max(0, box[0] - pad), max(0, box[1] - pad),
                min(px, box[2] + pad), min(px, box[3] + pad))
        fw, fh = crop[2] - crop[0], crop[3] - crop[1]
        rows.append((clip, frames, crop, fw, fh, height))
        width = max(width, fw * len(frames))
        height += fh

    sheet = Image.new('RGBA', (width, height), (0, 0, 0, 0))
    layout = {}
    for clip, frames, crop, fw, fh, y in rows:
        for i, im in enumerate(frames):
            sheet.paste(im.crop(crop), (i * fw, y))
        layout[clip] = {'x': 0, 'y': y, 'fw': fw, 'fh': fh, 'n': len(frames),
                        'ax': round(anchor[0] - crop[0], 1),
                        'ay': round(anchor[1] - crop[1], 1)}

    path = os.path.join(OUT_DIR, name + '.png')
    sheet.save(path, optimize=True)
    return {'file': 'assets/sprites/%s.png' % name, 'w': width, 'h': height,
            'drawnShadow': True, 'outlined': True, 'anim': True, 'clips': layout}


def render_unit(key, tint, kind, art, level, hero, args):
    T, ornate = R.level_look(R.DATA['troopLevels'], level)
    R.CUR_LEVEL[0] = int(round(level * 30.0 / len(R.DATA['troopLevels'])))
    R.reset_scene()
    R.RIGGED[0] = True
    # In the rest pose the fist points out along the arm, so a weapon modelled
    # pointing up has to be turned into the grip before it is bound. The extra
    # roll leans it back over the shoulder: held dead vertical, a sword as long
    # as this one reads as a flagpole above the troop rather than a weapon.
    R.WEAPON_ROT[0] = (0.0, math.radians(-90.0), math.radians(-35.0))
    R.build_unit_rigged(tint, kind, T, ornate, hero=hero, art=art)
    R.WEAPON_ROT[0] = (0.0, 0.0, 0.0)
    R.RIGGED[0] = False

    arm = load_rig()
    parts = bind_parts(arm)
    plan = build_plan(R.WEAPONS.get(art, 'sword'), kind)

    sc = bpy.context.scene
    ortho, aim_z, factor = framing(bounds_over(arm, parts, plan, SIZED_BY),
                                   bounds_over(arm, parts, plan), 1.4)
    px = max(64, min(args.max_px, int(round(R.PX_PER_UNIT * ortho))))
    ss = int(os.environ.get('SPRITE_SUPERSAMPLE', '2'))
    sc.render.resolution_x = sc.render.resolution_y = px * ss
    sc.cycles.samples = args.samples
    sc.cycles.use_denoising = True
    cam = R.add_camera(ortho, aim_z)
    R.add_lights(1.0)
    anchor = R.project_origin(sc, cam, px)

    os.makedirs(TMP, exist_ok=True)
    shots = {}
    for strip, action, frames in plan:
        for suffix, facing in FACINGS:
            clip = strip + suffix
            shots[clip] = []
            for i, f in enumerate(frames):
                pose(arm, parts, action, f, facing, scale=factor)
                p = os.path.join(TMP, '%s_%s%02d.png' % (key, clip, i))
                sc.render.filepath = p
                bpy.ops.render.render(write_still=True)
                shots[clip].append(p)

    name = 'anim_%s_L%02d' % (key, level)
    entry = pack(name, shots, px, anchor, args.outline, ss)
    R.MANIFEST[name] = entry
    for paths in shots.values():
        for p in paths:
            os.remove(p)
    print('  %s: %d frames -> %dx%d sheet, %d KB'
          % (name, sum(len(v) for v in shots.values()), entry['w'], entry['h'],
             os.path.getsize(os.path.join(OUT_DIR, name + '.png')) // 1024))
    return entry


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--keys', default='', help='only these troop/hero keys')
    ap.add_argument('--levels', default='4,13,22',
                    help='troop levels to render; the game picks the nearest')
    ap.add_argument('--samples', type=int, default=20)
    ap.add_argument('--max-px', type=int, default=360)
    ap.add_argument('--outline', type=int, default=2, help='keyline width, 0 to skip')
    ap.add_argument('--skip-existing', action='store_true')
    args = ap.parse_args(sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else sys.argv[1:])

    only = set(k.strip() for k in args.keys.split(',') if k.strip())
    levels = [int(x) for x in args.levels.split(',') if x.strip()]

    os.makedirs(OUT_DIR, exist_ok=True)
    manifest_path = os.path.join(OUT_DIR, 'sprites.json')
    if os.path.exists(manifest_path):
        R.MANIFEST.update(json.load(open(manifest_path)))

    units = []
    for t in R.DATA['troops']:
        if t['air']:
            continue                    # flyers have no legs to walk on
        units.append((t['key'], t['tint'],
                      R.unit_kind(t['art'], False, t['housing']), t['art'], False))
    for h in R.DATA['heroes']:
        units.append((h['key'], h['tint'], R.unit_kind(h['art'], False, 0), h['art'], True))

    done = 0
    for key, tint, kind, art, hero in units:
        if only and key not in only:
            continue
        for lvl in levels:
            if args.skip_existing and ('anim_%s_L%02d' % (key, lvl)) in R.MANIFEST:
                continue
            render_unit(key, tint, kind, art, lvl, hero, args)
            done += 1
            R.save_manifest(manifest_path)

    R.write_manifest_js(R.MANIFEST)
    print('wrote %d animation sheets, %d levels available' % (done, len(levels)))


if __name__ == '__main__':
    main()
