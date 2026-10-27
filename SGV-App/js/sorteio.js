/* Tela de sorteio de equipes. */
(function () {
  'use strict';
  var SGV = window.SGV, h = SGV.h, ui = SGV.ui, storage = SGV.storage;

  var COLORS = ['#ff8a3d', '#4cc3f1', '#f2d49b', '#ff7a9c', '#7de0c1', '#ffd24d', '#9aa8ff', '#f59e8b'];
  var SIZES = [2, 3, 4, 6];

  var players = [];          // [{id, name}]
  var present = new Set();   // ids marcados como presentes
  var size = 4;
  var result = null;         // {teams:[{name,color,players:[]}], bench:[]}
  var picked = [];           // índices das equipes escolhidas para o placar
  var drawing = false;
  var el = {};

  /* ---- Sorteio ---- */
  function randInt(n) {
    if (window.crypto && crypto.getRandomValues) {
      var a = new Uint32Array(1), max = Math.floor(4294967296 / n) * n;
      do { crypto.getRandomValues(a); } while (a[0] >= max);
      return a[0] % n;
    }
    return Math.floor(Math.random() * n);
  }

  function fisherYates(list) {
    var a = list.slice();
    for (var i = a.length - 1; i > 0; i--) {
      var j = randInt(i + 1), t = a[i]; a[i] = a[j]; a[j] = t;
    }
    return a;
  }

  function buildTeams(names) {
    var shuffled = fisherYates(names);
    var count = Math.floor(shuffled.length / size);
    var teams = [];
    for (var i = 0; i < count; i++) {
      teams.push({ name: 'Equipe ' + (i + 1), color: COLORS[i % COLORS.length], players: shuffled.slice(i * size, (i + 1) * size) });
    }
    return { teams: teams, bench: shuffled.slice(count * size) };
  }

  function presentNames() {
    return players.filter(function (p) { return present.has(p.id); }).map(function (p) { return p.name; });
  }

  /* ---- Persistência ---- */
  function saveRoster() {
    storage.set('players', players);
    storage.set('present', Array.from(present));
  }

  /* ---- Jogadores ---- */
  function uid() { return Date.now().toString(36) + Math.random().toString(36).slice(2, 7); }

  /* Aceita um nome ou uma lista colada (linhas, vírgulas, "1. Ana", "- Ana", "• Ana"). */
  function parseNames(text) {
    return text.split(/\r?\n|[;,]/).map(function (line) {
      return line
        .replace(/^\s*(?:\d+\s*[.)\-–:]|[-–•*·▪●◦])\s*/, '')
        .replace(/^[*_~\s]+|[*_~\s]+$/g, '')
        .replace(/\s+/g, ' ');
    }).filter(Boolean);
  }

  function addPlayers(text) {
    var known = new Set(players.map(function (p) { return p.name.toLowerCase(); }));
    var added = 0;
    parseNames(text).slice(0, 200).forEach(function (n) {
      n = n.slice(0, 24);
      if (known.has(n.toLowerCase())) return;
      known.add(n.toLowerCase());
      var p = { id: uid(), name: n };
      players.push(p);
      present.add(p.id);
      added++;
    });
    if (added) { saveRoster(); renderPlayers(); }
    return added;
  }

  function editPlayer(p) {
    ui.prompt('Editar jogador', [{ label: 'Nome', value: p.name }]).then(function (v) {
      if (!v || !v[0]) return;
      p.name = v[0];
      saveRoster();
      renderPlayers();
    });
  }

  function removePlayer(p) {
    players = players.filter(function (x) { return x.id !== p.id; });
    present.delete(p.id);
    saveRoster();
    renderPlayers();
    ui.toast(p.name + ' removido');
  }

  function renderPlayers() {
    el.list.textContent = '';
    players.forEach(function (p) {
      var cb = h('input', { type: 'checkbox', 'aria-label': 'Presente: ' + p.name });
      cb.checked = present.has(p.id);
      var li = h('li', { class: 'player' + (cb.checked ? '' : ' off') },
        h('label', { class: 'check' }, cb, h('span', { class: 'box' }), h('span', { class: 'p-name', text: p.name })),
        h('button', { class: 'mini-btn', type: 'button', 'aria-label': 'Editar ' + p.name, onclick: function () { editPlayer(p); } }, SGV.icon('edit')),
        h('button', { class: 'mini-btn danger', type: 'button', 'aria-label': 'Excluir ' + p.name, onclick: function () { removePlayer(p); } }, SGV.icon('trash')));
      cb.addEventListener('change', function () {
        if (cb.checked) present.add(p.id); else present.delete(p.id);
        li.classList.toggle('off', !cb.checked);
        saveRoster();
        updateCount();
      });
      el.list.appendChild(li);
    });
    el.empty.hidden = players.length > 0;
    updateCount();
  }

  function updateCount() {
    var n = present.size;
    el.badge.textContent = n + (n === 1 ? ' presente' : ' presentes') + ' de ' + players.length;
  }

  /* ---- Tamanho da equipe ---- */
  function renderSizes() {
    el.seg.textContent = '';
    SIZES.forEach(function (s) {
      el.seg.appendChild(h('button', {
        class: 'seg', type: 'button', role: 'radio', 'aria-checked': String(s === size), text: String(s),
        'aria-label': s + ' jogadores por equipe',
        onclick: function () { size = s; storage.set('size', s); renderSizes(); }
      }));
    });
  }

  /* ---- Resultado ---- */
  function renderResult(res, mode) {
    el.grid.textContent = '';
    el.grid.classList.toggle('shuffling', mode === 'shuffle');
    el.grid.classList.toggle('reveal', mode === 'reveal');
    res.teams.forEach(function (t, i) {
      var pressed = picked.indexOf(i) >= 0;
      var card = h('div', {
        class: 'team', role: 'button', tabindex: mode === 'shuffle' ? '-1' : '0', 'aria-pressed': String(pressed),
        'aria-label': t.name + ': ' + t.players.join(', '),
        style: '--c:' + t.color + ';--i:' + i
      },
        h('div', { class: 'team-title' }, h('strong', { text: t.name }), h('span', { class: 'team-tag', text: picked.indexOf(i) === 0 ? 'A' : 'B' })),
        h.apply(null, ['ul', {}].concat(t.players.map(function (n) { return h('li', { text: n }); }))));
      if (mode !== 'shuffle') {
        card.addEventListener('click', function () { togglePick(i); });
        card.addEventListener('keydown', function (e) {
          if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); togglePick(i); }
        });
      }
      el.grid.appendChild(card);
    });
    if (res.bench.length) {
      el.grid.appendChild(h('div', { class: 'team team--bench', style: '--i:' + res.teams.length },
        h('div', { class: 'team-title' }, h('strong', { text: 'Reservas' })),
        h.apply(null, ['ul', {}].concat(res.bench.map(function (n) { return h('li', { text: n }); })))));
    }
  }

  function togglePick(i) {
    var pos = picked.indexOf(i);
    if (pos >= 0) picked.splice(pos, 1);
    else { if (picked.length === 2) picked.shift(); picked.push(i); }
    renderResult(result, null);
    updateStart();
  }

  function updateStart() {
    var ok = picked.length === 2;
    el.start.disabled = !ok;
    el.startLabel.textContent = ok
      ? 'Abrir placar: ' + result.teams[picked[0]].name + ' × ' + result.teams[picked[1]].name
      : 'Escolha duas equipes';
  }

  function draw() {
    if (drawing) return;
    var names = presentNames();
    if (names.length < size * 2) {
      ui.toast('Marque pelo menos ' + size * 2 + ' jogadores para formar 2 equipes de ' + size);
      return;
    }
    drawing = true;
    picked = [];
    el.result.hidden = false;
    el.draw.disabled = el.redraw.disabled = true;
    var reduce = window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches;
    var final = buildTeams(names);

    function finish() {
      result = final;
      storage.set('teams', result);
      renderResult(result, 'reveal');
      updateStart();
      drawing = false;
      el.draw.disabled = el.redraw.disabled = false;
      if (navigator.vibrate) navigator.vibrate(25);
      el.result.scrollIntoView({ behavior: reduce ? 'auto' : 'smooth', block: 'start' });
    }

    if (reduce) return finish();
    el.start.disabled = true;
    el.startLabel.textContent = 'Sorteando…';
    el.result.scrollIntoView({ behavior: 'smooth', block: 'start' });
    var timer = setInterval(function () { renderResult(buildTeams(names), 'shuffle'); }, 90);
    renderResult(buildTeams(names), 'shuffle');
    setTimeout(function () { clearInterval(timer); finish(); }, 1500);
  }

  /* ---- WhatsApp ---- */
  function whatsappText() {
    var lines = ['🏐 *SGVApp — Equipes*', ''];
    result.teams.forEach(function (t) {
      lines.push('*' + t.name + '*');
      t.players.forEach(function (n) { lines.push('• ' + n); });
      lines.push('');
    });
    if (result.bench.length) lines.push('_Reservas:_ ' + result.bench.join(', '));
    return lines.join('\n').trim();
  }

  function copyText(text) {
    if (navigator.clipboard && navigator.clipboard.writeText) {
      return navigator.clipboard.writeText(text).catch(function () { return legacyCopy(text); });
    }
    return legacyCopy(text);
  }

  function legacyCopy(text) {
    return new Promise(function (resolve, reject) {
      var ta = h('textarea', { style: 'position:fixed;opacity:0;top:0;left:0', 'aria-hidden': 'true' });
      ta.value = text;
      document.body.appendChild(ta);
      ta.select();
      var ok = false;
      try { ok = document.execCommand('copy'); } catch (e) { /* ignora */ }
      ta.remove();
      ok ? resolve() : reject();
    });
  }

  /* ---- Módulo ---- */
  function init() {
    el.list = document.getElementById('player-list');
    el.empty = document.getElementById('players-empty');
    el.badge = document.getElementById('count-badge');
    el.seg = document.getElementById('size-seg');
    el.draw = document.getElementById('btn-draw');
    el.redraw = document.getElementById('btn-redraw');
    el.result = document.getElementById('result');
    el.grid = document.getElementById('teams-grid');
    el.start = document.getElementById('btn-start');
    el.startLabel = document.getElementById('start-label');

    var list = storage.get('players', []);
    players = Array.isArray(list) ? list.filter(function (p) { return p && typeof p.name === 'string' && p.id; }) : [];
    var ids = storage.get('present', null);
    present = new Set(Array.isArray(ids) ? ids : players.map(function (p) { return p.id; }));
    var s = storage.get('size', 4);
    size = SIZES.indexOf(s) >= 0 ? s : 4;
    var saved = storage.get('teams', null);
    if (saved && Array.isArray(saved.teams) && saved.teams.length >= 2) result = { teams: saved.teams, bench: saved.bench || [] };

    renderPlayers();
    renderSizes();
    if (result) { el.result.hidden = false; renderResult(result, null); updateStart(); }

    document.getElementById('form-player').addEventListener('submit', function (e) {
      e.preventDefault();
      var input = document.getElementById('input-player');
      var n = addPlayers(input.value);
      if (!n && input.value.trim()) ui.toast('Jogador já está na lista');
      else if (n > 1) ui.toast(n + ' jogadores adicionados');
      input.value = '';
      input.focus();
    });
    document.getElementById('input-player').addEventListener('paste', function (e) {
      var text = (e.clipboardData || window.clipboardData).getData('text');
      if (!/[\n;,]/.test(text.trim())) return; // nome simples: cola normalmente
      e.preventDefault();
      var n = addPlayers(text);
      ui.toast(n ? n + (n === 1 ? ' jogador adicionado' : ' jogadores adicionados') : 'Nenhum jogador novo na lista');
    });
    document.getElementById('btn-all').addEventListener('click', function () {
      players.forEach(function (p) { present.add(p.id); }); saveRoster(); renderPlayers();
    });
    document.getElementById('btn-none').addEventListener('click', function () {
      present.clear(); saveRoster(); renderPlayers();
    });
    el.draw.addEventListener('click', draw);
    el.redraw.addEventListener('click', draw);
    document.getElementById('btn-copy').addEventListener('click', function () {
      if (!result) return;
      copyText(whatsappText()).then(
        function () { ui.toast('Equipes copiadas! Cole no WhatsApp'); },
        function () { ui.toast('Não foi possível copiar'); });
    });
    el.start.addEventListener('click', function () {
      if (picked.length !== 2) return;
      var a = result.teams[picked[0]], b = result.teams[picked[1]];
      SGV.placar.startWith(a, b);
    });
  }

  SGV.register('sorteio', { init: init });
})();
