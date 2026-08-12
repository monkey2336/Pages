/* Per-level visual identity.

   There are no art "tiers" here: every Town Hall level has its own building
   design, every wall level its own masonry, and every troop level its own kit.
   The materials are five anchor eras blended continuously, so level 12 and
   level 13 are visibly different rather than two names for one model, and the
   whole village still reads as one family at any point in the run.

   Both the game and tools/render_sprites.py read these numbers, so the
   rendered sprite for a level always matches what the UI says about it. */
(function (G) {
  'use strict';

  // Anchor material sets. Levels land between them and are interpolated.
  var ERAS = [
    {
      key: 'timber', at: 1, name: 'Timber & Thatch',
      blurb: 'Lashed logs, straw, river stone and hammered iron.',
      mat: {
        stone: '#a8987c', stoneDark: '#7d7059', trim: '#8b5e34', trimDark: '#5f3f22',
        roof: '#b4442f', roofDark: '#7d2c1d', metal: '#9aa3ad', metalDark: '#636b75',
        accent: '#e0be63', glow: '#ffd98a', wood: '#8b5e34', cloth: '#c9563f'
      }
    },
    {
      key: 'stonework', at: 8, name: 'Cut Stone & Steel',
      blurb: 'Dressed blocks, banded steel, slate roofs and forge-light.',
      mat: {
        stone: '#9aa3ad', stoneDark: '#6b737d', trim: '#5f6b7a', trimDark: '#3d4551',
        roof: '#3f5470', roofDark: '#28374d', metal: '#c3ccd6', metalDark: '#7f8a96',
        accent: '#ffb02e', glow: '#ffcf7a', wood: '#6b4a2a', cloth: '#c2703a'
      }
    },
    {
      key: 'gilded', at: 15, name: 'Gilded Masonry',
      blurb: 'Pale ashlar with gold leaf, verdigris copper and lantern glass.',
      mat: {
        stone: '#c2bca8', stoneDark: '#8d886f', trim: '#c9a227', trimDark: '#8a6a15',
        roof: '#2f6b60', roofDark: '#1c4740', metal: '#d8cfa8', metalDark: '#94896a',
        accent: '#ffd24d', glow: '#ffe9a8', wood: '#5c4a3a', cloth: '#2f8a7a'
      }
    },
    {
      key: 'arcane', at: 22, name: 'Arcane Alloy',
      blurb: 'Violet alloy, floating trim and rune-cut channels that hum.',
      mat: {
        stone: '#6f6a8c', stoneDark: '#474360', trim: '#a05cff', trimDark: '#6b39b0',
        roof: '#3b3358', roofDark: '#241f3a', metal: '#b9c2e0', metalDark: '#767f9c',
        accent: '#c07bff', glow: '#e0c2ff', wood: '#4a3f5c', cloth: '#7b4dd6'
      }
    },
    {
      key: 'ascendant', at: 30, name: 'Ascendant Core',
      blurb: 'Dark composite, cyan cores, gold ribs and contained light.',
      mat: {
        stone: '#3f5666', stoneDark: '#243642', trim: '#ffc93c', trimDark: '#b3862a',
        roof: '#12303f', roofDark: '#0a1e29', metal: '#8fb6c9', metalDark: '#4f6d7d',
        accent: '#22e0ff', glow: '#a8f2ff', wood: '#33424d', cloth: '#00c2a8'
      }
    }
  ];

  var MAT_KEYS = Object.keys(ERAS[0].mat);

  /* ------------------------------------------------------------- colour */
  function hexToRgb(h) {
    h = String(h).replace('#', '');
    if (h.length === 3) h = h[0] + h[0] + h[1] + h[1] + h[2] + h[2];
    return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)];
  }
  function rgbToHex(c) {
    return '#' + c.map(function (v) {
      var s = Math.max(0, Math.min(255, Math.round(v))).toString(16);
      return s.length < 2 ? '0' + s : s;
    }).join('');
  }
  function mixHex(a, b, t) {
    var ca = hexToRgb(a), cb = hexToRgb(b);
    return rgbToHex([0, 1, 2].map(function (i) { return ca[i] + (cb[i] - ca[i]) * t; }));
  }
  // Small deterministic per-level nudge so neighbouring levels never share a
  // palette exactly, even in the middle of an era.
  function jitter(hex, level, seed) {
    var n = Math.sin(level * 12.9898 + seed * 78.233) * 43758.5453;
    var f = 1 + ((n - Math.floor(n)) - 0.5) * 0.09;
    var c = hexToRgb(hex);
    return rgbToHex(c.map(function (v) { return v * f; }));
  }

  /* ----------------------------------------------------------- per level */
  // `level` is 1..span. Materials slide through the eras across that range.
  function materialsFor(level, span) {
    span = span || 30;
    var pos = 1 + (Math.max(1, Math.min(span, level)) - 1) * (29 / (span - 1)); // -> 1..30
    var lo = ERAS[0], hi = ERAS[ERAS.length - 1];
    for (var i = 0; i < ERAS.length - 1; i++) {
      if (pos >= ERAS[i].at && pos <= ERAS[i + 1].at) { lo = ERAS[i]; hi = ERAS[i + 1]; break; }
    }
    var t = hi.at === lo.at ? 0 : (pos - lo.at) / (hi.at - lo.at);
    var out = {};
    MAT_KEYS.forEach(function (k, idx) {
      out[k] = jitter(mixHex(lo.mat[k], hi.mat[k], t), level, idx);
    });
    return out;
  }

  // Which era a level reads as, for labels.
  function eraFor(level, span) {
    span = span || 30;
    var pos = 1 + (Math.max(1, Math.min(span, level)) - 1) * (29 / (span - 1));
    var best = ERAS[0];
    for (var i = 0; i < ERAS.length; i++) {
      if (pos >= ERAS[i].at) best = ERAS[i];
    }
    return best;
  }

  // How ornate a level is, 0..1: drives rivet counts, trim, banners and glow.
  function detailFor(level, span) {
    span = span || 30;
    return Math.max(0, Math.min(1, (Math.max(1, level) - 1) / (span - 1)));
  }

  G.ERAS = ERAS;
  G.materialsFor = materialsFor;
  G.eraFor = eraFor;
  G.detailFor = detailFor;

  /* ----------------------------------------------- spans per art family */
  // Buildings get one design for every Town Hall level.
  G.BUILDING_ART_SPAN = 30;
  // Troop research tops out at 25, so troops get one design per level.
  G.TROOP_ART_SPAN = 25;
  // Heroes climb to 100; four levels share a design so the set stays sane.
  G.HERO_ART_SPAN = 25;
  G.HERO_LEVELS_PER_DESIGN = 4;

  G.buildingArtLevel = function (level) {
    return Math.max(1, Math.min(G.BUILDING_ART_SPAN, Math.round(level || 1)));
  };
  G.troopArtLevel = function (level) {
    return Math.max(1, Math.min(G.TROOP_ART_SPAN, Math.round(level || 1)));
  };
  G.heroArtLevel = function (level) {
    return Math.max(1, Math.min(G.HERO_ART_SPAN,
      Math.ceil(Math.max(1, level || 1) / G.HERO_LEVELS_PER_DESIGN)));
  };

  // Walls already carry 30 levels of their own; they use the same ramp so a
  // wall always matches the buildings standing behind it.
  G.wallEra = function (level) { return eraFor(level, 30); };
  G.wallMaterials = function (level) { return materialsFor(level, 30); };

  G.eraForTH = function (th) { return eraFor(th, 30); };
})(window.G = window.G || {});
