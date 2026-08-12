"""Draw a dark outline round every sprite's silhouette.

The single largest readability difference between these renders and painted
game art is the outline. Painted assets carry a dark keyline that separates
them from whatever they stand on; a raw render blends into the ground, and at
village zoom a base turns to mush.

This runs over the finished PNGs rather than the renderer, because a silhouette
outline is a 2D operation -- dilate the alpha, subtract the original, fill the
ring with a dark colour, composite the sprite back on top. Seconds for the
whole set instead of hours of re-rendering.

    python tools/outline.py [--width 3] [--only b_cannon]
"""

import argparse
import json
import os

from PIL import Image, ImageFilter

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SPRITES = os.path.join(ROOT, 'assets', 'sprites')
MANIFEST = os.path.join(SPRITES, 'sprites.json')
ALPHA_CUT = 40          # below this the pixel is background, not soft edge
OUTLINE_RGB = (26, 20, 16)


def outline_one(path, width, alpha):
    im = Image.open(path).convert('RGBA')
    a = im.getchannel('A').point(lambda v: 255 if v >= ALPHA_CUT else 0)

    # Grow the silhouette; the growth ring is the outline.
    grown = a.filter(ImageFilter.MaxFilter(width * 2 + 1))
    ring = Image.new('L', im.size, 0)
    ring.paste(grown, (0, 0))
    # Subtract the original silhouette so the outline sits outside the art.
    ring = Image.composite(Image.new('L', im.size, 0), ring, a)
    # Soften so the keyline is not aliased.
    ring = ring.filter(ImageFilter.GaussianBlur(0.6))
    ring = ring.point(lambda v: int(v * alpha))

    out = Image.new('RGBA', im.size, OUTLINE_RGB + (0,))
    out.putalpha(ring)
    out.alpha_composite(im)
    return out


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--width', type=int, default=3, help='outline thickness in rendered pixels')
    ap.add_argument('--alpha', type=float, default=0.85, help='outline opacity, 0..1')
    ap.add_argument('--only', default='', help='comma-separated name prefixes')
    args = ap.parse_args()

    manifest = json.load(open(MANIFEST)) if os.path.exists(MANIFEST) else {}
    only = [p.strip() for p in args.only.split(',') if p.strip()]
    done = 0
    for name in sorted(manifest):
        if only and not any(name.startswith(p) for p in only):
            continue
        entry = manifest[name]
        if entry.get('outlined'):
            continue
        path = os.path.join(ROOT, entry['file'])
        if not os.path.exists(path):
            continue
        outline_one(path, args.width, args.alpha).save(path)
        entry['outlined'] = True
        done += 1

    json.dump(manifest, open(MANIFEST, 'w'), indent=1, sort_keys=True)
    print('outlined %d sprites' % done)


if __name__ == '__main__':
    main()
