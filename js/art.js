/* Procedural SVG art.
   Town Halls are drawn from the per-level design descriptor, so every one of
   the 30 levels has its own silhouette, ornament set and colour scheme. */
(function (G) {
  'use strict';

  function esc(s) { return String(s).replace(/"/g, '&quot;'); }
  function rect(x, y, w, h, fill, extra) {
    return '<rect x="' + x + '" y="' + y + '" width="' + w + '" height="' + h + '" fill="' + fill + '" ' + (extra || '') + '/>';
  }
  function poly(pts, fill, extra) {
    return '<polygon points="' + pts + '" fill="' + fill + '" ' + (extra || '') + '/>';
  }
  function circ(cx, cy, r, fill, extra) {
    return '<circle cx="' + cx + '" cy="' + cy + '" r="' + r + '" fill="' + fill + '" ' + (extra || '') + '/>';
  }
  function ell(cx, cy, rx, ry, fill, extra) {
    return '<ellipse cx="' + cx + '" cy="' + cy + '" rx="' + rx + '" ry="' + ry + '" fill="' + fill + '" ' + (extra || '') + '/>';
  }
  function path(d, fill, extra) {
    return '<path d="' + d + '" fill="' + fill + '" ' + (extra || '') + '/>';
  }
  function line(x1, y1, x2, y2, stroke, w, extra) {
    return '<line x1="' + x1 + '" y1="' + y1 + '" x2="' + x2 + '" y2="' + y2 + '" stroke="' + stroke + '" stroke-width="' + w + '" ' + (extra || '') + '/>';
  }

  var GROUND = 172;

  /* Each body returns the main silhouette plus the y of its apex so the shared
     ornament layer knows where the top of the building is. */
  var BODIES = {
    hut: function (p) {
      return {
        top: 74,
        svg: poly('100,60 152,110 48,110', p.roof) +
             rect(58, 108, 84, 56, p.stone) +
             poly('100,52 106,62 94,62', p.accent) +
             rect(92, 132, 16, 32, p.roof)
      };
    },
    lodge: function (p) {
      return {
        top: 62,
        svg: poly('100,54 158,104 42,104', p.roof) +
             rect(52, 102, 96, 62, p.stone) +
             rect(52, 102, 96, 8, p.roof) +
             rect(90, 128, 20, 36, p.roof) +
             line(52, 120, 148, 120, p.panelEdge, 3)
      };
    },
    stonehouse: function (p) {
      return {
        top: 58,
        svg: poly('100,50 156,98 44,98', p.roof) +
             rect(50, 96, 100, 68, p.stone) +
             rect(62, 84, 14, 20, p.roof) +
             rect(88, 126, 24, 38, p.roof) +
             rect(50, 156, 100, 8, p.panelEdge)
      };
    },
    keep: function (p) {
      return {
        top: 46,
        svg: rect(56, 76, 88, 88, p.stone) +
             poly('100,40 150,78 50,78', p.roof) +
             rect(56, 76, 88, 6, p.roof) +
             rect(86, 124, 28, 40, p.roof) +
             rect(50, 100, 100, 6, p.panelEdge) +
             circ(100, 92, 7, p.accent)
      };
    },
    bastion: function (p) {
      var merlons = '';
      for (var i = 0; i < 6; i++) merlons += rect(54 + i * 16, 68, 10, 12, p.stone);
      return {
        top: 52,
        svg: rect(52, 80, 96, 84, p.stone) + merlons +
             poly('100,44 132,70 68,70', p.roof) +
             rect(84, 122, 32, 42, p.roof) +
             rect(52, 104, 96, 5, p.panelEdge)
      };
    },
    court: function (p) {
      return {
        top: 44,
        svg: rect(48, 92, 104, 72, p.stone) +
             path('M62 92 A38 38 0 0 1 138 92 Z', p.roof) +
             circ(100, 66, 9, p.accent) +
             rect(88, 124, 24, 40, p.roof) +
             rect(48, 150, 104, 14, p.panelEdge)
      };
    },
    obsidian: function (p) {
      return {
        top: 34,
        svg: poly('100,34 146,96 100,120 54,96', p.roof) +
             rect(56, 96, 88, 68, p.stone) +
             poly('100,44 132,94 68,94', p.accent, 'opacity="0.35"') +
             rect(88, 126, 24, 38, p.roof) +
             poly('56,96 144,96 138,110 62,110', p.panelEdge)
      };
    },
    forge: function (p) {
      return {
        top: 40,
        svg: rect(50, 86, 100, 78, p.stone) +
             poly('100,52 152,88 48,88', p.roof) +
             rect(118, 40, 18, 50, p.panelEdge) +
             ell(127, 40, 10, 5, p.accent) +
             rect(84, 122, 32, 42, p.roof) +
             circ(70, 110, 8, p.accent, 'opacity="0.8"')
      };
    },
    citadel: function (p) {
      return {
        top: 36,
        svg: rect(54, 84, 92, 80, p.stone) +
             poly('100,38 146,84 54,84', p.roof) +
             rect(66, 100, 68, 6, p.accent, 'opacity="0.6"') +
             rect(86, 122, 28, 42, p.roof) +
             poly('100,46 124,82 76,82', p.accent2, 'opacity="0.4"')
      };
    },
    spire: function (p) {
      return {
        top: 22,
        svg: poly('100,22 128,96 72,96', p.roof) +
             rect(64, 94, 72, 70, p.stone) +
             path('M100 30 L112 92 L88 92 Z', p.accent) +
             rect(88, 128, 24, 36, p.roof) +
             circ(100, 74, 8, p.glow, 'opacity="0.8"')
      };
    },
    sanctum: function (p) {
      return {
        top: 34,
        svg: rect(52, 96, 96, 68, p.stone) +
             path('M58 96 A42 42 0 0 1 142 96 Z', p.roof) +
             circ(100, 62, 12, p.accent, 'opacity="0.9"') +
             circ(100, 62, 5, p.glow) +
             rect(86, 126, 28, 38, p.roof)
      };
    },
    ziggurat: function (p) {
      var s = '';
      for (var i = 0; i < 5; i++) {
        s += rect(46 + i * 8, 148 - i * 18, 108 - i * 16, 18, i % 2 ? p.stone : p.roof);
      }
      return { top: 58, svg: s + rect(90, 44, 20, 20, p.accent) + circ(100, 44, 8, p.glow) };
    },
    crown: function (p) {
      var t = '';
      for (var i = 0; i < 5; i++) t += poly((56 + i * 22) + ',72 ' + (66 + i * 22) + ',44 ' + (76 + i * 22) + ',72', p.accent);
      return {
        top: 40,
        svg: rect(52, 70, 96, 94, p.stone) + t +
             rect(52, 70, 96, 8, p.roof) +
             rect(86, 124, 28, 40, p.roof)
      };
    },
    menagerie: function (p) {
      return {
        top: 44,
        svg: rect(50, 92, 100, 72, p.stone) +
             path('M50 92 Q100 40 150 92 Z', p.roof) +
             ell(72, 84, 14, 9, p.accent2, 'opacity="0.8"') +
             ell(128, 80, 16, 10, p.accent, 'opacity="0.8"') +
             ell(100, 70, 18, 11, p.accent2, 'opacity="0.6"') +
             rect(86, 124, 28, 40, p.roof)
      };
    },
    conclave: function (p) {
      var cols = '';
      for (var i = 0; i < 5; i++) cols += rect(56 + i * 22, 96, 10, 68, p.stone);
      return {
        top: 40,
        svg: rect(46, 88, 108, 10, p.roof) + cols +
             poly('100,44 156,88 44,88', p.roof) +
             rect(46, 158, 108, 8, p.panelEdge) +
             circ(100, 68, 8, p.accent)
      };
    },
    monolith: function (p) {
      return {
        top: 26,
        svg: rect(72, 26, 56, 138, p.roof) +
             rect(78, 34, 44, 122, p.stone, 'opacity="0.55"') +
             rect(50, 140, 100, 24, p.panelEdge) +
             line(100, 44, 100, 140, p.accent, 3, 'opacity="0.9"') +
             circ(100, 60, 7, p.glow)
      };
    },
    quiver: function (p) {
      var slots = '';
      for (var i = 0; i < 4; i++) slots += rect(60 + i * 22, 84, 8, 26, p.accent, 'opacity="0.85"');
      return {
        top: 40,
        svg: rect(52, 80, 96, 84, p.stone) + slots +
             poly('100,42 148,80 52,80', p.roof) +
             rect(86, 126, 28, 38, p.roof)
      };
    },
    foundry: function (p) {
      return {
        top: 34,
        svg: rect(48, 88, 104, 76, p.stone) +
             poly('100,50 150,88 50,88', p.roof) +
             rect(56, 36, 16, 54, p.panelEdge) + rect(128, 44, 14, 46, p.panelEdge) +
             circ(100, 116, 16, p.roof) + circ(100, 116, 7, p.accent) +
             rect(88, 138, 24, 26, p.roof)
      };
    },
    cathedral: function (p) {
      return {
        top: 18,
        svg: poly('100,18 122,80 78,80', p.roof) +
             rect(58, 78, 84, 86, p.stone) +
             poly('100,86 118,120 82,120', p.accent, 'opacity="0.85"') +
             path('M86 164 L86 132 A14 14 0 0 1 114 132 L114 164 Z', p.roof) +
             rect(58, 78, 84, 6, p.roof)
      };
    },
    aurora: function (p) {
      return {
        top: 20,
        svg: poly('100,20 124,100 76,100', p.roof) +
             rect(66, 98, 68, 66, p.stone) +
             path('M76 96 Q100 44 124 96 Z', p.accent, 'opacity="0.55"') +
             circ(100, 66, 9, p.glow) +
             rect(88, 130, 24, 34, p.roof)
      };
    },
    nexus: function (p) {
      var arms = '';
      for (var i = 0; i < 5; i++) {
        var a = (Math.PI * 2 / 5) * i - Math.PI / 2;
        arms += line(100, 84, 100 + Math.cos(a) * 44, 84 + Math.sin(a) * 44, p.accent, 4, 'opacity="0.8"') +
                circ(100 + Math.cos(a) * 44, 84 + Math.sin(a) * 44, 6, p.accent2);
      }
      return {
        top: 34,
        svg: rect(64, 104, 72, 60, p.stone) + arms +
             circ(100, 84, 18, p.roof) + circ(100, 84, 9, p.glow) +
             rect(88, 132, 24, 32, p.roof)
      };
    },
    gravity: function (p) {
      return {
        top: 30,
        svg: rect(58, 100, 84, 64, p.stone) +
             path('M58 100 Q100 46 142 100 Z', p.roof) +
             ell(100, 100, 46, 12, 'none', 'stroke="' + p.accent + '" stroke-width="3" opacity="0.85"') +
             ell(100, 88, 30, 8, 'none', 'stroke="' + p.accent2 + '" stroke-width="2" opacity="0.7"') +
             circ(100, 82, 10, p.glow) +
             rect(88, 130, 24, 34, p.roof)
      };
    },
    nullbody: function (p) {
      return {
        top: 28,
        svg: poly('100,28 138,86 138,164 62,164 62,86', p.stone) +
             poly('100,36 130,88 70,88', p.roof) +
             circ(100, 116, 24, p.panel) +
             circ(100, 116, 24, 'none', 'stroke="' + p.accent + '" stroke-width="2" opacity="0.8"') +
             rect(88, 140, 24, 24, p.roof)
      };
    },
    voidhold: function (p) {
      return {
        top: 26,
        svg: poly('100,26 144,80 144,164 56,164 56,80', p.stone) +
             circ(100, 104, 26, '#05030a') +
             circ(100, 104, 26, 'none', 'stroke="' + p.accent + '" stroke-width="3"') +
             circ(100, 104, 14, p.accent2, 'opacity="0.5"') +
             poly('100,34 132,80 68,80', p.roof)
      };
    },
    orbital: function (p) {
      return {
        top: 24,
        svg: rect(62, 106, 76, 58, p.stone) +
             poly('100,54 138,106 62,106', p.roof) +
             circ(100, 42, 16, p.roof) + circ(100, 42, 8, p.accent) +
             line(100, 58, 100, 106, p.accent2, 3, 'opacity="0.7"') +
             ell(100, 42, 34, 9, 'none', 'stroke="' + p.accent + '" stroke-width="2" opacity="0.75"') +
             rect(88, 134, 24, 30, p.roof)
      };
    },
    fracture: function (p) {
      return {
        top: 26,
        svg: poly('100,26 142,88 128,164 72,164 58,88', p.stone) +
             poly('100,36 128,86 72,86', p.roof) +
             path('M100 60 L92 100 L106 104 L94 148', 'none', 'stroke="' + p.accent + '" stroke-width="3" opacity="0.95"') +
             circ(100, 92, 8, p.glow, 'opacity="0.85"')
      };
    },
    titanforge: function (p) {
      return {
        top: 30,
        svg: rect(46, 96, 108, 68, p.stone) +
             poly('100,46 154,96 46,96', p.roof) +
             rect(54, 30, 18, 68, p.panelEdge) + rect(128, 40, 18, 58, p.panelEdge) +
             ell(63, 30, 11, 5, p.accent) + ell(137, 40, 11, 5, p.accent2) +
             rect(80, 118, 40, 20, p.roof) +
             rect(86, 138, 28, 26, p.roof)
      };
    },
    ark: function (p) {
      return {
        top: 22,
        svg: path('M52 164 Q52 92 100 60 Q148 92 148 164 Z', p.stone) +
             path('M68 164 Q68 104 100 78 Q132 104 132 164 Z', p.roof, 'opacity="0.75"') +
             circ(100, 106, 20, p.panel) + circ(100, 106, 12, p.accent) + circ(100, 106, 5, '#ffffff') +
             ell(100, 106, 46, 13, 'none', 'stroke="' + p.accent2 + '" stroke-width="2" opacity="0.8"')
      };
    },
    aegis: function (p) {
      var t = '';
      for (var i = 0; i < 6; i++) t += poly((52 + i * 19) + ',68 ' + (61 + i * 19) + ',38 ' + (70 + i * 19) + ',68', p.accent);
      return {
        top: 34,
        svg: path('M56 70 L144 70 L144 118 Q144 158 100 168 Q56 158 56 118 Z', p.stone) + t +
             path('M70 82 L130 82 L130 116 Q130 142 100 150 Q70 142 70 116 Z', p.roof, 'opacity="0.8"') +
             circ(100, 110, 12, p.glow, 'opacity="0.9"')
      };
    },
    apex: function (p) {
      var s = '';
      for (var i = 0; i < 4; i++) s += rect(52 + i * 10, 150 - i * 16, 96 - i * 20, 16, i % 2 ? p.stone : p.roof);
      return {
        top: 18,
        svg: s +
             poly('100,18 126,88 74,88', p.roof) +
             poly('100,30 116,86 84,86', p.accent) +
             circ(100, 50, 10, p.glow) +
             circ(100, 50, 20, 'none', 'stroke="' + p.accent2 + '" stroke-width="2" opacity="0.7"')
      };
    }
  };

  var BODY_FOR_LEVEL = {
    hut: 'hut', lodge: 'lodge', stonehouse: 'stonehouse', keep: 'keep', bastion: 'bastion',
    court: 'court', obsidian: 'obsidian', forge: 'forge', citadel: 'citadel', spire: 'spire',
    sanctum: 'sanctum', ziggurat: 'ziggurat', crown: 'crown', menagerie: 'menagerie',
    conclave: 'conclave', monolith: 'monolith', quiver: 'quiver', foundry: 'foundry',
    cathedral: 'cathedral', aurora: 'aurora', nexus: 'nexus', gravity: 'gravity',
    'null': 'nullbody', voidhold: 'voidhold', orbital: 'orbital', fracture: 'fracture',
    titanforge: 'titanforge', ark: 'ark', aegis: 'aegis', apex: 'apex'
  };

  function ornaments(p, d, top) {
    var out = '';
    // Side towers, spread symmetrically around the body.
    for (var i = 0; i < d.towers; i++) {
      var side = i % 2 === 0 ? -1 : 1;
      var idx = Math.floor(i / 2);
      var x = 100 + side * (56 + idx * 13);
      var h = 46 + idx * 10;
      if (x < 12 || x > 188) continue;
      out += rect(x - 8, GROUND - h, 16, h, p.stone) +
             poly((x - 11) + ',' + (GROUND - h) + ' ' + x + ',' + (GROUND - h - 18) + ' ' + (x + 11) + ',' + (GROUND - h), p.roof) +
             rect(x - 3, GROUND - h + 14, 6, 8, p.glow, 'opacity="0.85"');
    }
    // Banners on poles.
    for (var b = 0; b < d.banners; b++) {
      var bx = 26 + b * (148 / Math.max(1, d.banners - 1 || 1));
      if (d.banners === 1) bx = 100;
      out += line(bx, GROUND, bx, GROUND - 40, p.panelEdge, 2) +
             poly(bx + ',' + (GROUND - 40) + ' ' + (bx + 16) + ',' + (GROUND - 33) + ' ' + bx + ',' + (GROUND - 26), b % 2 ? p.accent2 : p.accent);
    }
    // Lit windows.
    for (var w = 0; w < d.windows; w++) {
      var wx = 64 + (w % 4) * 22;
      var wy = 118 + Math.floor(w / 4) * 16;
      out += rect(wx, wy, 8, 11, p.glow, 'opacity="0.9"');
    }
    // Orbit rings above the apex.
    for (var r = 0; r < d.rings; r++) {
      out += ell(100, top - 6 - r * 9, 30 + r * 12, 8 + r * 2, 'none',
        'stroke="' + (r % 2 ? p.accent2 : p.accent) + '" stroke-width="1.6" opacity="' + (0.75 - r * 0.09).toFixed(2) + '"');
    }
    // Floating orbs.
    for (var o = 0; o < d.orbs; o++) {
      var a = (Math.PI * 2 / Math.max(1, d.orbs)) * o;
      out += circ(100 + Math.cos(a) * (38 + o * 4), top + 4 + Math.sin(a) * 16, 3.5, p.glow, 'opacity="0.9"');
    }
    return out;
  }

  /* Full Town Hall portrait for a given level.
     `noSky` drops the sky panel so the hall can sit straight on the village
     grass instead of looking like a card pinned to the field. */
  function townHallSVG(level, size, noSky) {
    var th = G.thData(level);
    var p = th.palette, d = th.design;
    var bodyFn = BODIES[BODY_FOR_LEVEL[d.body]] || BODIES.keep;
    var body = bodyFn(p, d);
    var s = size || 200;
    var id = 'thg' + level;

    var steps = '';
    for (var i = 0; i < d.steps; i++) {
      steps += rect(100 - (34 + i * 7), GROUND - 4 + i * 2, (34 + i * 7) * 2, 5, i % 2 ? p.panelEdge : p.stone, 'opacity="0.85"');
    }

    return '<svg viewBox="0 0 200 200" width="' + s + '" height="' + s + '" role="img" aria-label="' + esc(th.name) + '">' +
      '<defs>' +
        '<radialGradient id="' + id + '" cx="50%" cy="35%" r="70%">' +
          '<stop offset="0%" stop-color="' + p.sky1 + '"/>' +
          '<stop offset="100%" stop-color="' + p.sky2 + '"/>' +
        '</radialGradient>' +
      '</defs>' +
      (noSky ? '' : rect(0, 0, 200, 200, 'url(#' + id + ')')) +
      ell(100, GROUND + 8, 82, 18, p.ground, noSky ? 'opacity="0.45"' : '') +
      ell(100, GROUND + 10, 60, 11, p.groundAlt, 'opacity="0.85"') +
      steps +
      body.svg +
      ornaments(p, d, body.top) +
      '</svg>';
  }

  /* ------------------------------------------------------ building art */
  // Compact glyphs used on the village grid and in lists.
  var GLYPHS = {
    mine: function (c) { return poly('10,44 32,14 54,44', c.a) + rect(12, 44, 40, 10, c.b) + circ(32, 32, 6, c.c); },
    collector: function (c) { return rect(16, 24, 32, 30, c.a) + ell(32, 24, 16, 7, c.b) + ell(32, 22, 10, 4, c.c); },
    drill: function (c) { return rect(20, 28, 24, 26, c.a) + poly('32,8 42,30 22,30', c.b) + rect(18, 50, 28, 6, c.c); },
    vault: function (c) { return rect(14, 22, 36, 32, c.a) + rect(14, 22, 36, 8, c.b) + circ(32, 40, 8, c.c); },
    tank: function (c) { return rect(18, 20, 28, 34, c.a) + ell(32, 20, 14, 6, c.b) + rect(18, 38, 28, 5, c.c); },
    darkvault: function (c) { return circ(32, 36, 18, c.a) + circ(32, 36, 10, c.b) + rect(14, 52, 36, 4, c.c); },
    treasury: function (c) { return rect(14, 26, 36, 28, c.a) + rect(24, 34, 16, 12, c.b) + circ(32, 40, 3, c.c); },
    clock: function (c) { return rect(22, 18, 20, 36, c.a) + circ(32, 28, 9, c.b) + line(32, 28, 32, 22, c.c, 2) + line(32, 28, 37, 30, c.c, 2); },
    barracks: function (c) { return rect(12, 26, 40, 28, c.a) + poly('8,26 32,10 56,26', c.b) + rect(28, 38, 8, 16, c.c); },
    darkbarracks: function (c) { return rect(12, 26, 40, 28, c.a) + poly('8,26 32,8 56,26', c.b) + circ(32, 40, 6, c.c); },
    camp: function (c) { return poly('32,12 54,52 10,52', c.a) + rect(26, 36, 12, 16, c.b) + circ(32, 20, 4, c.c); },
    lab: function (c) { return rect(20, 30, 24, 24, c.a) + path('M26 30 L26 16 L38 16 L38 30 Z', c.b) + circ(32, 42, 6, c.c); },
    spell: function (c) { return ell(32, 40, 18, 14, c.a) + ell(32, 26, 12, 6, c.b) + circ(32, 38, 6, c.c); },
    darkspell: function (c) { return ell(32, 40, 18, 14, c.a) + circ(32, 24, 8, c.b) + circ(32, 40, 6, c.c); },
    siege: function (c) { return rect(12, 32, 40, 18, c.a) + circ(20, 52, 6, c.b) + circ(44, 52, 6, c.b) + rect(28, 18, 8, 16, c.c); },
    pethouse: function (c) { return path('M12 52 Q12 22 32 14 Q52 22 52 52 Z', c.a) + circ(32, 36, 8, c.b) + circ(28, 34, 2, c.c) + circ(36, 34, 2, c.c); },
    herohall: function (c) { return rect(14, 28, 36, 26, c.a) + poly('10,28 32,10 54,28', c.b) + poly('32,34 38,46 26,46', c.c); },
    smith: function (c) { return rect(14, 38, 36, 16, c.a) + rect(24, 24, 8, 16, c.b) + poly('34,22 50,30 34,34', c.c); },
    cannon: function (c) { return rect(14, 38, 36, 14, c.a) + rect(28, 22, 26, 10, c.b) + circ(26, 36, 9, c.c); },
    archer: function (c) { return rect(20, 30, 24, 24, c.a) + poly('16,30 32,14 48,30', c.b) + rect(30, 36, 4, 12, c.c); },
    mortar: function (c) { return rect(16, 36, 32, 18, c.a) + path('M24 36 L40 36 L44 20 L20 20 Z', c.b) + circ(32, 20, 6, c.c); },
    airdef: function (c) { return rect(18, 38, 28, 16, c.a) + poly('26,38 32,14 38,38', c.b) + circ(32, 18, 4, c.c); },
    wizard: function (c) { return rect(22, 34, 20, 20, c.a) + poly('18,34 32,10 46,34', c.b) + circ(32, 24, 5, c.c); },
    sweeper: function (c) { return rect(22, 36, 20, 18, c.a) + path('M42 30 A14 14 0 0 1 42 46 Z', c.b) + circ(32, 32, 4, c.c); },
    tesla: function (c) { return rect(24, 34, 16, 20, c.a) + poly('32,10 40,30 26,30', c.b) + circ(32, 30, 4, c.c); },
    bombtower: function (c) { return rect(22, 30, 20, 24, c.a) + circ(32, 24, 10, c.b) + line(32, 14, 38, 8, c.c, 2); },
    xbow: function (c) { return rect(18, 38, 28, 14, c.a) + path('M14 30 Q32 16 50 30', 'none', 'stroke="' + c.b + '" stroke-width="4"') + line(14, 30, 50, 30, c.c, 2); },
    inferno: function (c) { return rect(24, 32, 16, 22, c.a) + path('M32 8 Q42 24 32 34 Q22 24 32 8 Z', c.b) + circ(32, 26, 3, c.c); },
    eagle: function (c) { return rect(16, 40, 32, 14, c.a) + path('M22 40 L42 40 L48 18 L16 18 Z', c.b) + circ(32, 26, 5, c.c); },
    scatter: function (c) { return rect(16, 38, 32, 16, c.a) + circ(24, 28, 7, c.b) + circ(40, 28, 7, c.b) + circ(32, 18, 5, c.c); },
    monolithdef: function (c) { return rect(24, 10, 16, 44, c.a) + rect(16, 46, 32, 8, c.b) + line(32, 18, 32, 44, c.c, 3); },
    multiarcher: function (c) { return rect(20, 32, 24, 22, c.a) + poly('16,32 32,12 48,32', c.b) + rect(24, 36, 4, 10, c.c) + rect(30, 36, 4, 10, c.c) + rect(36, 36, 4, 10, c.c); },
    ricochet: function (c) { return rect(14, 36, 36, 16, c.a) + rect(30, 22, 24, 10, c.b) + circ(24, 34, 8, c.c) + circ(50, 20, 3, c.c); },
    prism: function (c) { return poly('32,10 48,44 16,44', c.a) + poly('32,20 40,40 24,40', c.b) + line(32, 44, 32, 54, c.c, 3); },
    gravity: function (c) { return ell(32, 38, 20, 8, 'none', 'stroke="' + c.a + '" stroke-width="3"') + circ(32, 30, 9, c.b) + ell(32, 30, 26, 10, 'none', 'stroke="' + c.c + '" stroke-width="1.5"'); },
    nullfield: function (c) { return circ(32, 32, 18, 'none', 'stroke="' + c.a + '" stroke-width="4"') + circ(32, 32, 8, c.b) + line(18, 46, 46, 18, c.c, 3); },
    orbital: function (c) { return circ(32, 20, 9, c.a) + ell(32, 20, 22, 7, 'none', 'stroke="' + c.b + '" stroke-width="2"') + rect(26, 34, 12, 20, c.c); },
    fracturecannon: function (c) { return rect(16, 36, 32, 18, c.a) + rect(30, 24, 22, 8, c.b) + path('M20 34 L26 44 L18 48', 'none', 'stroke="' + c.c + '" stroke-width="2.5"'); },
    aegis: function (c) { return path('M32 10 L50 18 L50 36 Q50 50 32 56 Q14 50 14 36 L14 18 Z', c.a) + path('M32 18 L44 24 L44 36 Q44 44 32 48 Q20 44 20 36 L20 24 Z', c.b) + circ(32, 34, 5, c.c); },
    singularity: function (c) { return circ(32, 32, 16, c.a) + circ(32, 32, 8, '#000') + ell(32, 32, 26, 9, 'none', 'stroke="' + c.b + '" stroke-width="2"') + ell(32, 32, 20, 22, 'none', 'stroke="' + c.c + '" stroke-width="1.5"'); },
    trapbomb: function (c) { return circ(32, 38, 12, c.a) + rect(30, 22, 4, 8, c.b) + circ(32, 20, 3, c.c); },
    trapspring: function (c) { return path('M20 46 Q32 34 44 46 Q32 40 20 46 Z', c.a) + rect(20, 46, 24, 6, c.b) + circ(32, 30, 5, c.c); },
    trapair: function (c) { return circ(32, 34, 11, c.a) + poly('32,14 38,28 26,28', c.b) + circ(32, 34, 4, c.c); },
    trapgiant: function (c) { return circ(32, 36, 16, c.a) + rect(29, 16, 6, 8, c.b) + circ(32, 14, 4, c.c); },
    trapseek: function (c) { return circ(32, 36, 11, c.a) + poly('32,12 40,30 24,30', c.b) + circ(32, 36, 3, c.c); },
    trapskull: function (c) { return circ(32, 32, 13, c.a) + circ(27, 30, 3, '#111') + circ(37, 30, 3, '#111') + rect(28, 40, 8, 6, c.b); },
    traptornado: function (c) { return path('M16 18 L48 18 L40 30 L24 30 Z', c.a) + path('M24 30 L40 30 L34 42 L30 42 Z', c.b) + circ(32, 48, 4, c.c); },
    trapmirror: function (c) { return rect(20, 16, 24, 34, c.a) + rect(24, 20, 16, 26, c.b) + line(24, 46, 40, 20, c.c, 2); },
    trapemp: function (c) { return circ(32, 34, 14, 'none', 'stroke="' + c.a + '" stroke-width="3"') + poly('32,20 38,34 26,34', c.b) + circ(32, 34, 4, c.c); },
    trapsand: function (c) { return ell(32, 40, 20, 10, c.a) + ell(32, 40, 12, 6, c.b) + circ(32, 40, 4, c.c); },
    wall: function (c) { return rect(10, 28, 44, 24, c.a) + rect(10, 28, 44, 6, c.b) + line(32, 34, 32, 52, c.c, 2); }
  };

  function buildingSVG(artKey, palette, size, tint) {
    var p = palette;
    var colors = { a: tint || p.stone, b: p.roof, c: p.accent };
    var g = GLYPHS[artKey] || GLYPHS.wall;
    var s = size || 48;
    return '<svg viewBox="0 0 64 64" width="' + s + '" height="' + s + '">' + g(colors) + '</svg>';
  }

  /* ---------------------------------------------------------- unit art */
  // Troops/heroes/spells get a readable silhouette rather than a full portrait.
  function unitSVG(art, tint, size, air) {
    var s = size || 44;
    var body;
    if (air) {
      body = ell(32, 34, 15, 11, tint) +
             path('M17 30 Q6 18 22 22 Z', tint, 'opacity="0.75"') +
             path('M47 30 Q58 18 42 22 Z', tint, 'opacity="0.75"') +
             circ(38, 31, 3, '#0d0d12');
    } else {
      body = circ(32, 22, 10, tint) +
             path('M20 54 Q20 32 32 32 Q44 32 44 54 Z', tint) +
             circ(29, 21, 2, '#0d0d12') + circ(35, 21, 2, '#0d0d12');
    }
    var mark = '';
    switch (art) {
      case 'sapper': mark = circ(32, 44, 6, '#1a1a20') + line(32, 38, 36, 32, '#ffb03a', 2); break;
      case 'brute': case 'colossus': case 'golem': case 'titanborn':
        mark = rect(16, 36, 32, 8, '#00000033'); break;
      case 'mage': case 'warlock': case 'hexweaver':
        mark = poly('32,4 40,20 24,20', tint); break;
      case 'ripper': mark = poly('20,50 26,38 32,50 38,38 44,50', '#00000044'); break;
      case 'banner': mark = line(46, 12, 46, 42, '#00000055', 2) + poly('46,12 60,18 46,24', tint); break;
      case 'warden': case 'oracle': case 'seer': case 'ascendant':
        mark = ell(32, 30, 22, 24, 'none', 'stroke="' + tint + '" stroke-width="1.5" opacity="0.6"'); break;
      case 'champion': case 'ironclad': case 'vanguard':
        mark = path('M32 30 L42 34 L42 44 Q42 50 32 54 Q22 50 22 44 L22 34 Z', '#00000038'); break;
    }
    return '<svg viewBox="0 0 64 64" width="' + s + '" height="' + s + '">' + body + mark + '</svg>';
  }

  function spellSVG(tint, size) {
    var s = size || 40;
    return '<svg viewBox="0 0 64 64" width="' + s + '" height="' + s + '">' +
      ell(32, 40, 17, 15, tint) +
      ell(32, 40, 10, 9, '#ffffff', 'opacity="0.25"') +
      rect(24, 16, 16, 10, tint, 'opacity="0.8"') +
      rect(27, 10, 10, 7, tint) + '</svg>';
  }

  G.art = {
    townHallSVG: townHallSVG,
    buildingSVG: buildingSVG,
    unitSVG: unitSVG,
    spellSVG: spellSVG
  };
})(window.G = window.G || {});
