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
  var drawing = false;
  var pairs = {};            // histórico: "ana|beto" -> vezes juntos
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

  function splitTeams(shuffled) {
    var count = Math.floor(shuffled.length / size);
    var teams = [];
    for (var i = 0; i < count; i++) {
      teams.push({ name: 'Equipe ' + (i + 1), color: COLORS[i % COLORS.length], players: shuffled.slice(i * size, (i + 1) * size) });
    }
    return { teams: teams, bench: shuffled.slice(count * size) };
  }

  /* Histórico de duplas: quantas vezes cada par já jogou junto. */
  function pairKey(a, b) {
    a = a.toLowerCase(); b = b.toLowerCase();
    return a < b ? a + '|' + b : b + '|' + a;
  }

  function forEachPair(res, fn) {
    res.teams.forEach(function (t) {
      for (var i = 0; i < t.players.length; i++)
        for (var j = i + 1; j < t.players.length; j++) fn(pairKey(t.players[i], t.players[j]));
    });
  }

  function repeatCost(res) {
    var c = 0;
    forEachPair(res, function (k) { c += pairs[k] || 0; });
    return c;
  }

  function recordPairs(res) {
    forEachPair(res, function (k) { pairs[k] = (pairs[k] || 0) + 1; });
    storage.set('pairs', pairs);
  }

  /* smart: testa várias divisões aleatórias e fica com a que menos repete duplas. */
  function buildTeams(names, smart) {
    var best = splitTeams(fisherYates(names));
    if (!smart) return best;
    var bestCost = repeatCost(best);
    for (var n = 0; n < 400 && bestCost > 0; n++) {
      var cand = splitTeams(fisherYates(names)), c = repeatCost(cand);
      if (c < bestCost) { best = cand; bestCost = c; }
    }
    return best;
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

  function allPresent() { return players.length > 0 && present.size >= players.length; }

  function updateCount() {
    var n = present.size;
    el.badge.textContent = n + (n === 1 ? ' presente' : ' presentes') + ' de ' + players.length;
    /* o botão alterna entre marcar e desmarcar todos */
    el.toggleAll.textContent = allPresent() ? 'Desmarcar todos' : 'Marcar todos';
    el.toggleAll.disabled = players.length === 0;
    el.clearAll.disabled = players.length === 0 && !result && !hasCampeonato();
  }

  function hasCampeonato() { return !!storage.get('camp', null); }

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
      el.grid.appendChild(h('div', { class: 'team', style: '--c:' + t.color + ';--i:' + i },
        h('div', { class: 'team-title' }, h('strong', { text: t.name })),
        h.apply(null, ['ul', {}].concat(t.players.map(function (n) { return h('li', { text: n }); })))));
    });
    if (res.bench.length) {
      el.grid.appendChild(h('div', { class: 'team team--bench', style: '--i:' + res.teams.length },
        h('div', { class: 'team-title' }, h('strong', { text: 'Reservas' })),
        h.apply(null, ['ul', {}].concat(res.bench.map(function (n) { return h('li', { text: n }); })))));
    }
  }

  /* Botão do campeonato: mostra quantas equipes estão prontas; fica inativo enquanto sorteia. */
  function updateCamp(busy) {
    el.start.classList.toggle('is-busy', !!busy);
    el.start.setAttribute('aria-disabled', String(!!busy));
    var n = result ? result.teams.length : 0;
    el.startLabel.textContent = busy ? 'Sorteando…' : n + ' equipes prontas';
  }

  function draw() {
    if (drawing) return;
    var names = presentNames();
    if (names.length < size * 2) {
      ui.toast('Marque pelo menos ' + size * 2 + ' jogadores para formar 2 equipes de ' + size);
      return;
    }
    drawing = true;
    el.result.hidden = false;
    el.draw.disabled = true;
    var reduce = window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches;
    var final = buildTeams(names, true);

    function finish() {
      result = final;
      recordPairs(result);
      storage.set('teams', result);
      renderResult(result, 'reveal');
      updateCamp(false);
      drawing = false;
      el.draw.disabled = false;
      if (navigator.vibrate) navigator.vibrate(25);
      el.result.scrollIntoView({ behavior: reduce ? 'auto' : 'smooth', block: 'start' });
    }

    if (reduce) return finish();
    updateCamp(true);
    el.result.scrollIntoView({ behavior: 'smooth', block: 'start' });
    var timer = setInterval(function () { renderResult(buildTeams(names, false), 'shuffle'); }, 90);
    renderResult(buildTeams(names, false), 'shuffle');
    setTimeout(function () { clearInterval(timer); finish(); }, 1500);
  }

  /* ---- WhatsApp ---- */
  function whatsappText() {
    var lines = ['🏐 *VoleiApp — Equipes*', ''];
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
    el.toggleAll = document.getElementById('btn-all');
    el.clearAll = document.getElementById('btn-none');
    el.seg = document.getElementById('size-seg');
    el.draw = document.getElementById('btn-draw');
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
    var hist = storage.get('pairs', {});
    pairs = hist && typeof hist === 'object' ? hist : {};
    var saved = storage.get('teams', null);
    if (saved && Array.isArray(saved.teams) && saved.teams.length >= 2) result = { teams: saved.teams, bench: saved.bench || [] };

    renderPlayers();
    renderSizes();
    if (result) { el.result.hidden = false; renderResult(result, null); updateCamp(false); }

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
    el.toggleAll.addEventListener('click', function () {
      if (allPresent()) present.clear();
      else players.forEach(function (p) { present.add(p.id); });
      saveRoster(); renderPlayers();
    });
    el.clearAll.addEventListener('click', function () {
      if (drawing) return;
      var parts = [];
      if (players.length) parts.push('a lista de ' + players.length + (players.length === 1 ? ' jogador' : ' jogadores'));
      if (result) parts.push('as equipes sorteadas');
      if (hasCampeonato()) parts.push('o campeonato em andamento');
      if (!parts.length) return;
      var msg = 'Isso apaga ' + parts.join(', ').replace(/, ([^,]*)$/, ' e $1') + '. Não dá para desfazer.';
      ui.confirm('Limpar tudo?', msg, 'Limpar tudo').then(function (ok) {
        if (!ok) return;
        players = [];
        present.clear();
        saveRoster();
        /* equipes sorteadas */
        result = null;
        storage.set('teams', null);
        el.grid.textContent = '';
        el.result.hidden = true;
        /* campeonato ativo (e o jogo dele aberto no placar) */
        storage.set('camp', null);
        if (SGV.placar && SGV.placar.clearMatch) SGV.placar.clearMatch();
        renderPlayers();
        ui.toast('Tudo limpo');
      });
    });
    document.getElementById('btn-clear-pairs').addEventListener('click', function () {
      pairs = {}; storage.set('pairs', pairs); ui.toast('Histórico de duplas zerado');
    });
    el.draw.addEventListener('click', draw);
    document.getElementById('btn-copy').addEventListener('click', function () {
      if (!result) return;
      copyText(whatsappText()).then(
        function () { ui.toast('Equipes copiadas! Cole no WhatsApp'); },
        function () { ui.toast('Não foi possível copiar'); });
    });
    el.start.addEventListener('click', function (e) {
      if (drawing) e.preventDefault();       // ainda sorteando: não abre o campeonato
    });
  }

  SGV.register('sorteio', { init: init, enter: function () { if (el.badge) updateCount(); } });
})();
