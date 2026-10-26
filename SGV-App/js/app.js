/* Núcleo: utilitários de DOM, diálogos, toast, tema e navegação entre telas. */
(function () {
  'use strict';
  var SGV = window.SGV;
  var storage = SGV.storage;

  /* ---- DOM helper: h('div', {class:'x', onclick:fn}, 'texto', outroNo) ---- */
  function h(tag, attrs) {
    var el = document.createElement(tag);
    for (var k in (attrs || {})) {
      var v = attrs[k];
      if (v == null || v === false) continue;
      if (k.slice(0, 2) === 'on' && typeof v === 'function') el.addEventListener(k.slice(2), v);
      else if (k === 'text') el.textContent = v;
      else el.setAttribute(k, v === true ? '' : v);
    }
    for (var i = 2; i < arguments.length; i++) {
      var c = arguments[i];
      if (c == null || c === false) continue;
      el.appendChild(typeof c === 'string' ? document.createTextNode(c) : c);
    }
    return el;
  }

  function icon(name) {
    var ns = 'http://www.w3.org/2000/svg';
    var svg = document.createElementNS(ns, 'svg');
    svg.setAttribute('class', 'ico');
    svg.setAttribute('aria-hidden', 'true');
    var use = document.createElementNS(ns, 'use');
    use.setAttribute('href', '#i-' + name);
    svg.appendChild(use);
    return svg;
  }

  /* ---- Toast ---- */
  var toastEl, toastTimer;
  function toast(msg) {
    toastEl.textContent = msg;
    toastEl.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { toastEl.classList.remove('show'); }, 2200);
  }

  /* ---- Diálogos (confirmação e campos de texto) ---- */
  var dlg, dlgForm, resolver = null;

  function openDialog(opts) {
    return new Promise(function (resolve) {
      var fields = opts.fields || [];
      document.getElementById('dlg-title').textContent = opts.title;
      document.getElementById('dlg-msg').textContent = opts.message || '';
      document.getElementById('dlg-ok').textContent = opts.ok || 'OK';
      var box = document.getElementById('dlg-fields');
      box.textContent = '';
      fields.forEach(function (f, i) {
        box.appendChild(h('label', { class: 'dlg-field' }, f.label,
          h('input', { type: 'text', maxlength: f.max || 24, 'data-i': i, value: f.value || '', autocomplete: 'off' })));
      });
      resolver = function (ok) {
        resolver = null;
        if (!ok) return resolve(null);
        resolve(fields.length
          ? Array.prototype.map.call(box.querySelectorAll('input'), function (inp) { return inp.value.trim(); })
          : true);
      };
      dlg.showModal();
      var first = box.querySelector('input');
      if (first) { first.focus(); first.select(); }
    });
  }

  var ui = {
    confirm: function (title, message, ok) { return openDialog({ title: title, message: message, ok: ok || 'Confirmar' }).then(Boolean); },
    prompt: function (title, fields) { return openDialog({ title: title, fields: fields, ok: 'Salvar' }); },
    toast: toast
  };

  function initDialog() {
    dlg = document.getElementById('dlg');
    dlgForm = document.getElementById('dlg-form');
    dlgForm.addEventListener('submit', function (e) {
      e.preventDefault();
      var r = resolver; dlg.close(); if (r) r(true);
    });
    document.getElementById('dlg-cancel').addEventListener('click', function () {
      var r = resolver; dlg.close(); if (r) r(false);
    });
    dlg.addEventListener('cancel', function () { var r = resolver; if (r) r(false); });
    dlg.addEventListener('click', function (e) {
      if (e.target === dlg) { var r = resolver; dlg.close(); if (r) r(false); }
    });
  }

  /* ---- Tema ---- */
  function applyTheme(t) {
    document.documentElement.setAttribute('data-theme', t);
    document.getElementById('theme-icon').setAttribute('href', t === 'dark' ? '#i-sun' : '#i-moon');
    var meta = document.querySelector('meta[name="theme-color"]');
    if (meta) meta.setAttribute('content', t === 'dark' ? '#0b0d14' : '#f3f5fa');
  }

  /* ---- Navegação por hash (sem recarregar) ---- */
  var modules = {};
  var VIEWS = ['home', 'sorteio', 'placar'];

  function route() {
    var name = (location.hash.replace(/^#\/?/, '') || 'home');
    if (VIEWS.indexOf(name) < 0) name = 'home';
    VIEWS.forEach(function (v) {
      var el = document.getElementById('view-' + v);
      var show = v === name;
      if (show && el.hidden) { el.hidden = false; if (modules[v] && modules[v].enter) modules[v].enter(); }
      else if (!show) el.hidden = true;
    });
    if (name !== 'home') document.getElementById('view-home').classList.remove('intro');
    window.scrollTo(0, 0);
    document.title = name === 'home' ? 'SGVApp' : 'SGVApp · ' + (name === 'sorteio' ? 'Sorteio' : 'Placar');
  }

  SGV.h = h;
  SGV.icon = icon;
  SGV.ui = ui;
  SGV.register = function (name, mod) { modules[name] = mod; };

  document.addEventListener('DOMContentLoaded', function () {
    toastEl = document.getElementById('toast');
    initDialog();

    var settings = storage.get('settings', { theme: 'dark' });
    applyTheme(settings.theme === 'light' ? 'light' : 'dark');
    document.getElementById('btn-theme').addEventListener('click', function () {
      settings.theme = settings.theme === 'light' ? 'dark' : 'light';
      storage.set('settings', settings);
      applyTheme(settings.theme);
    });

    Object.keys(modules).forEach(function (k) { if (modules[k].init) modules[k].init(); });
    window.addEventListener('hashchange', route);
    if (!location.hash || location.hash === '#/home') document.getElementById('view-home').classList.add('intro');
    route();
  });
})();
