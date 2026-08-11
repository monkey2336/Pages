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
  function renderResources() {
    var s = G.state;
    var caps = G.engine.caps(s);
    var prod = G.engine.productionPerHour(s);
    var row = document.getElementById('resRow');
    function chip(kind, label, value, cap, rate) {
      var pct = cap ? Math.min(100, (value / cap) * 100) : 0;
      return '<div class="res ' + kind + '" title="' + label +
        (rate ? ' · +' + fmt(rate) + '/hr' : '') + '">' +
        '<i class="dot"></i><span>' + fmt(value) + '</span>' +
        (cap ? '<span class="cap">/ ' + fmt(cap) + '</span>' +
          '<span class="bar" style="color:var(--' + kind + ')"><i style="width:' + pct + '%"></i></span>' : '') +
        '</div>';
    }
    row.innerHTML =
      chip('gold', 'Gold', s.resources.gold, caps.gold, prod.gold) +
      chip('elixir', 'Elixir', s.resources.elixir, caps.elixir, prod.elixir) +
      (s.th >= 7 ? chip('dark', 'Dark Elixir', s.resources.dark, caps.dark, prod.dark) : '') +
      chip('gems', 'Gems', s.resources.gems, 0, 0);
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
  ui.jobHTML = function (job, extraAttrs) {
    var left = Math.max(0, (job.ends - Date.now()) / 1000);
    var pct = job.total ? Math.max(0, Math.min(100, (1 - left / job.total) * 100)) : 0;
    return '<div class="progress"><i style="width:' + pct.toFixed(1) + '%"></i></div>' +
      '<div class="timer" data-ends="' + job.ends + '" data-total="' + job.total + '">' +
      fmtTime(left) + ' left</div>' +
      (extraAttrs ? '<button class="btn sm ghost" style="margin-top:6px" ' + extraAttrs + '>Finish · ' +
        G.engine.gemsToSkip(left) + ' gems</button>' : '');
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
