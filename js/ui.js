/* UI shell: theming, formatting, navigation, toasts and modals. */
(function (G) {
  'use strict';

  var ui = {
    screens: {},
    order: [],
    current: 'village'
  };

  /* ---------------------------------------------------------- format */
  function fmt(n) {
    n = Math.floor(n || 0);
    if (n >= 1e9) return (n / 1e9).toFixed(n >= 1e10 ? 0 : 1) + 'B';
    if (n >= 1e6) return (n / 1e6).toFixed(n >= 1e7 ? 0 : 1) + 'M';
    if (n >= 1e4) return (n / 1e3).toFixed(n >= 1e5 ? 0 : 1) + 'K';
    return n.toLocaleString();
  }
  function fmtTime(sec) {
    sec = Math.max(0, Math.round(sec));
    var d = Math.floor(sec / 86400);
    var h = Math.floor((sec % 86400) / 3600);
    var m = Math.floor((sec % 3600) / 60);
    var s = sec % 60;
    if (d) return d + 'd ' + h + 'h';
    if (h) return h + 'h ' + m + 'm';
    if (m) return m + 'm ' + s + 's';
    return s + 's';
  }
  function esc(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }
  ui.fmt = fmt;
  ui.fmtTime = fmtTime;
  ui.esc = esc;

  ui.costHTML = function (res, amount, short) {
    return '<span class="cost ' + res + (short ? ' short' : '') + '"><i class="dot"></i>' + fmt(amount) + '</span>';
  };

  /* ---------------------------------------------------------- theming */
  ui.applyTheme = function (level) {
    var th = G.thData(level);
    var p = th.palette;
    var root = document.documentElement;
    Object.keys(p).forEach(function (k) { root.style.setProperty('--' + k, p[k]); });
    document.getElementById('thName').textContent = th.name;
    document.getElementById('thSub').textContent = 'Town Hall ' + th.level + ' · ' + th.tier;
    var thumbKey = G.sprites && G.sprites.townHallKey(th.level);
    document.getElementById('thThumb').innerHTML = thumbKey
      ? G.sprites.img(thumbKey, 46, th.name)
      : G.art.townHallSVG(th.level, 46);
    document.title = 'Ascendancy — ' + th.name + ' (TH' + th.level + ')';
  };

  /* ----------------------------------------------------------- toasts */
  ui.toast = function (msg, bad) {
    var host = document.getElementById('toasts');
    var el = document.createElement('div');
    el.className = 'toast' + (bad ? ' bad' : '');
    el.textContent = msg;
    host.appendChild(el);
    setTimeout(function () {
      el.style.transition = 'opacity 300ms';
      el.style.opacity = '0';
      setTimeout(function () { el.remove(); }, 320);
    }, 2600);
  };
  // Shorthand for engine results of the shape { ok, why, msg }.
  ui.report = function (r, okMsg) {
    if (!r) return false;
    if (r.ok) { ui.toast(r.msg || okMsg || 'Done'); return true; }
    ui.toast(r.why || 'Cannot do that', true);
    return false;
  };

  /* ------------------------------------------------------------ modal */
  ui.modal = function (html) {
    var m = document.getElementById('modal');
    document.getElementById('modalSheet').innerHTML =
      '<button class="close" data-act="close-modal">&times;</button>' + html;
    m.classList.add('open');
  };
  ui.closeModal = function () {
    document.getElementById('modal').classList.remove('open');
  };

  /* ------------------------------------------------------------ nav */
  ui.register = function (key, def) {
    ui.screens[key] = def;
    ui.order.push(key);
  };

  function renderNav() {
    var nav = document.getElementById('nav');
    var s = G.state;
    nav.innerHTML = ui.order.map(function (key) {
      var d = ui.screens[key];
      if (d.hidden && d.hidden(s)) return '';
      var badge = d.badge ? d.badge(s) : '';
      return '<button data-nav="' + key + '" class="' + (key === ui.current ? 'active' : '') + '">' +
        esc(d.title) + (badge ? '<span class="badge">' + esc(badge) + '</span>' : '') + '</button>';
    }).join('');
  }

  ui.go = function (key) {
    if (!ui.screens[key]) return;
    ui.current = key;
    ui.render();
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  /* ---------------------------------------------------- resource row */
  // The HUD. Resources read as gauges rather than text: a filled bar, the
  // amount over its cap, and the rate it is climbing at. Gems and builders sit
  // apart from the three storages, because they behave differently -- neither
  // has a cap that matters, and builders are the thing you actually run out of.
  function renderResources() {
    var s = G.state;
    var E = G.engine;
    var caps = E.caps(s);
    var prod = E.productionPerHour(s);
    var row = document.getElementById('resRow');

    function gauge(kind, label, value, cap, rate) {
      var pct = cap ? Math.min(100, (value / cap) * 100) : 0;
      var full = cap && value >= cap;
      return '<div class="res ' + kind + (full ? ' full' : '') + '" title="' + label +
        (cap ? ' — ' + fmt(value) + ' of ' + fmt(cap) : '') +
        (rate ? ' · +' + fmt(rate) + '/hr' : '') + '">' +
        '<i class="dot"></i>' +
        '<div class="res-body">' +
          '<div class="res-nums"><b>' + fmt(value) + '</b>' +
            (cap ? '<span class="cap">' + fmt(cap) + '</span>' : '') + '</div>' +
          (cap ? '<span class="bar"><i style="width:' + pct + '%"></i></span>' : '') +
        '</div>' +
        (rate ? '<span class="rate">+' + fmt(rate) + '</span>' : '') +
        '</div>';
    }

    var busy = E.busyBuilders(s), total = s.builders.length;
    var free = total - busy;
    row.innerHTML =
      gauge('gold', 'Gold', s.resources.gold, caps.gold, prod.gold) +
      gauge('elixir', 'Elixir', s.resources.elixir, caps.elixir, prod.elixir) +
      (s.th >= 7 ? gauge('dark', 'Dark Elixir', s.resources.dark, caps.dark, prod.dark) : '') +
      '<div class="hud-side">' +
        '<div class="res gems" title="Gems"><i class="dot"></i>' +
          '<div class="res-body"><div class="res-nums"><b>' + fmt(s.resources.gems) + '</b></div></div></div>' +
        '<div class="builders' + (free ? '' : ' none') + '" title="' + free + ' of ' + total +
          ' builders free" data-nav="village">' +
          '<i class="hammer"></i><b>' + free + '</b><span>/' + total + '</span></div>' +
      '</div>';
  }

  /* ----------------------------------------------------------- render */
  var lastScreen = null;
  ui.render = function () {
    var s = G.state;
    ui.applyTheme(s.th);
    renderNav();
    renderResources();
    var host = document.getElementById('screen');
    var def = ui.screens[ui.current];
    if (!def) return;
    if (lastScreen !== ui.current) { host.scrollTop = 0; lastScreen = ui.current; }
    host.innerHTML = def.render(s);
    if (def.mount) def.mount(host, s);
  };

  // Light refresh: timers and resource counters only, so a drag or a text
  // field is never yanked out from under the player.
  ui.refreshLive = function () {
    renderResources();
    var def = ui.screens[ui.current];
    if (def && def.live) def.live(document.getElementById('screen'), G.state);
  };

  /* ---------------------------------------------- global click routing */
  ui.actions = {};
  document.addEventListener('click', function (ev) {
    var navBtn = ev.target.closest('[data-nav]');
    if (navBtn) { ui.go(navBtn.getAttribute('data-nav')); return; }
    var actEl = ev.target.closest('[data-act]');
    if (!actEl) return;
    var act = actEl.getAttribute('data-act');
    if (act === 'close-modal') { ui.closeModal(); return; }
    var fn = ui.actions[act];
    if (!fn) return;
    ev.preventDefault();
    fn(actEl, G.state, ev);
  });

  document.getElementById('modal').addEventListener('click', function (ev) {
    if (ev.target.id === 'modal') ui.closeModal();
  });

  /* --------------------------------------------------- shared widgets */
  // Progress + timer + gem-skip for anything with { ends, total }.
  // Which book finishes which kind of job, so the dialog can offer it the way
  // Clash offers a Book of Fighting on a running research.
  var BOOK_FOR = { building: 'book_building', research: 'book_fighting', hero: 'book_heroes' };

  ui.jobHTML = function (job, extraAttrs) {
    var left = Math.max(0, (job.ends - Date.now()) / 1000);
    var pct = job.total ? Math.max(0, Math.min(100, (1 - left / job.total) * 100)) : 0;
    var s = G.state;
    var book = job.kind && BOOK_FOR[job.kind];
    var hasBook = book && s && (s.items[book] || 0) > 0;
    var hasEvery = s && (s.items.book_everything || 0) > 0;
    return '<div class="progress"><i style="width:' + pct.toFixed(1) + '%"></i></div>' +
      '<div class="timer" data-ends="' + job.ends + '" data-total="' + job.total + '">' +
      fmtTime(left) + ' left</div>' +
      '<div class="finish-row">' +
      (extraAttrs ? '<button class="btn sm ghost" ' + extraAttrs + '>Finish · ' +
        G.engine.gemsToSkip(left) + ' gems</button>' : '') +
      (hasBook
        ? '<button class="btn sm ghost book" data-act="finish-with-book" data-book="' + book +
          '" data-label="' + esc(job.label || '') + '">Finish · ' +
          esc(G.itemData[book].name) + ' (' + s.items[book] + ')</button>'
        : hasEvery
          ? '<button class="btn sm ghost book" data-act="finish-with-book" data-book="book_everything"' +
            ' data-label="' + esc(job.label || '') + '">Finish · Book of Everything (' +
            s.items.book_everything + ')</button>'
          : '') +
      '</div>';
  };

  // Spending a book from wherever the job is shown.
  ui.actions['finish-with-book'] = function (el) {
    var r = G.engine.useItem(G.state, el.getAttribute('data-book'), el.getAttribute('data-label'));
    if (ui.report(r)) { ui.closeModal(); ui.render(); }
  };

  // Re-tick any timer nodes in place without a full re-render.
  ui.tickTimers = function (host) {
    if (!host) return;
    var nodes = host.querySelectorAll('.timer[data-ends]');
    for (var i = 0; i < nodes.length; i++) {
      var n = nodes[i];
      var left = Math.max(0, (parseFloat(n.getAttribute('data-ends')) - Date.now()) / 1000);
      var total = parseFloat(n.getAttribute('data-total')) || 0;
      n.textContent = fmtTime(left) + ' left';
      var bar = n.previousElementSibling;
      if (bar && bar.classList.contains('progress') && total) {
        bar.firstChild.style.width = Math.max(0, Math.min(100, (1 - left / total) * 100)).toFixed(1) + '%';
      }
    }
  };

  ui.emptyState = function (msg) {
    return '<p class="hint" style="padding:18px;text-align:center">' + esc(msg) + '</p>';
  };

  G.ui = ui;
})(window.G = window.G || {});
