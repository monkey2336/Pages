/* Sprite lookup for the Blender-rendered art.

   Sprites are rendered isometrically at 64px per village tile, and the
   manifest records where world origin lands in each image so a sprite can be
   pinned to its tile exactly. Anything without a sprite falls back to the
   vector art in js/art.js, so the game still runs if assets are missing. */
(function (G) {
  'use strict';

  var M = G.SPRITES || {};
  var TILE_W = 64;          // screen width of one tile diamond
  var TILE_H = 32;          // 2:1 isometric

  function key(name) {
    return M[name] ? name : null;
  }

  function townHallKey(level) {
    return key('th' + String(Math.max(1, Math.min(30, level))).padStart(2, '0'));
  }

  function pad2(n) {
    return String(n).length < 2 ? '0' + n : String(n);
  }

  /* Every level has its own render. The lookup walks down from the level you
     asked for to the nearest one that exists, so a partial asset set still
     draws the closest design rather than nothing. */
  function perLevel(prefix, itemKey, level, span) {
    var want = Math.max(1, Math.min(span, Math.round(level || 1)));
    for (var l = want; l >= 1; l--) {
      var k = key(prefix + itemKey + '_L' + pad2(l));
      if (k) return k;
    }
    for (var u = want + 1; u <= span; u++) {
      var k2 = key(prefix + itemKey + '_L' + pad2(u));
      if (k2) return k2;
    }
    return key(prefix + itemKey);
  }

  function buildingKey(bKey, level) {
    if (bKey === 'townhall') return null;
    return perLevel('b_', bKey, G.buildingArtLevel ? G.buildingArtLevel(level) : level,
      G.BUILDING_ART_SPAN || 30);
  }

  function wallKey(level) {
    return key('wall' + pad2(Math.max(1, Math.min(30, level))));
  }

  function unitKey(uKey, level) {
    return perLevel('u_', uKey, G.troopArtLevel ? G.troopArtLevel(level) : level,
      G.TROOP_ART_SPAN || 25);
  }

  // Heroes climb far higher than troops, so their level maps onto the design
  // set before lookup.
  function heroKey(hKey, level) {
    return perLevel('u_', hKey, G.heroArtLevel ? G.heroArtLevel(level) : level,
      G.HERO_ART_SPAN || 25);
  }

  /* Animation sheets exist for a handful of levels rather than all of them --
     a walk cycle at every troop level would be forty times the art for a
     difference nobody can see on a moving 40px figure. This picks the nearest
     rendered level, so the material era still tracks the troop's rank. */
  function animKey(uKey, level) {
    var want = Math.max(1, Math.round(level || 1));
    var best = null, bestGap = Infinity;
    for (var l = 1; l <= 30; l++) {
      var k = 'anim_' + uKey + '_L' + pad2(l);
      if (!M[k]) continue;
      var gap = Math.abs(l - want);
      if (gap < bestGap) { bestGap = gap; best = k; }
    }
    return best;
  }

  /* A plain <img> sized to a given height, for cards and lists. */
  function img(name, px, alt, extraClass) {
    var s = M[name];
    if (!s) return '';
    return '<img class="sprite ' + (extraClass || '') + '" src="' + s.file +
      '" width="' + px + '" height="' + px + '" alt="' + (alt || '').replace(/"/g, '') +
      '" loading="lazy">';
  }

  /* Positioned sprite for the isometric village.
     `lx`/`ly` are grid coords relative to the current view origin. */
  function stageSprite(name, lx, ly, size, scale, attrs, inner) {
    var s = M[name];
    if (!s) return null;
    scale = scale || 1;
    var cx = lx + size / 2, cy = ly + size / 2;
    var sx = (cx - cy) * (TILE_W / 2);
    var sy = (cx + cy) * (TILE_H / 2);
    var w = s.w * scale, h = s.h * scale;
    var left = sx - s.anchorX * scale;
    var top = sy - s.anchorY * scale;
    // Badges are pinned to the sprite's anchor -- the base of the model --
    // rather than the image box, which is mostly empty sky above tall halls.
    return '<div class="iso-obj" style="left:' + left.toFixed(1) + 'px;top:' + top.toFixed(1) +
      'px;width:' + w.toFixed(1) + 'px;height:' + h.toFixed(1) + 'px;z-index:' +
      Math.round((lx + ly + size) * 10) +
      ';--anchor-x:' + (s.anchorX * scale).toFixed(1) + 'px' +
      ';--anchor-y:' + (s.anchorY * scale).toFixed(1) + 'px" ' + (attrs || '') + '>' +
      '<img src="' + s.file + '" draggable="false" alt="">' + (inner || '') + '</div>';
  }

  /* Screen position of a tile's centre, used for labels and hit testing. */
  function tileCentre(lx, ly, size) {
    var cx = lx + size / 2, cy = ly + size / 2;
    return { x: (cx - cy) * (TILE_W / 2), y: (cx + cy) * (TILE_H / 2) };
  }

  /* Screen -> grid, for dropping a dragged building. */
  function screenToGrid(sx, sy) {
    var a = sx / (TILE_W / 2);
    var b = sy / (TILE_H / 2);
    return { x: (b + a) / 2, y: (b - a) / 2 };
  }

  G.sprites = {
    manifest: M,
    available: Object.keys(M).length > 0,
    TILE_W: TILE_W,
    TILE_H: TILE_H,
    get: function (name) { return M[name]; },
    has: function (name) { return !!M[name]; },
    townHallKey: townHallKey,
    buildingKey: buildingKey,
    wallKey: wallKey,
    unitKey: unitKey,
    heroKey: heroKey,
    animKey: animKey,
    img: img,
    stageSprite: stageSprite,
    tileCentre: tileCentre,
    screenToGrid: screenToGrid
  };
})(window.G = window.G || {});
