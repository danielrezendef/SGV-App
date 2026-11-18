/* Campeonato: chaves (todos contra todos) + fase final.
   Só é liberado depois do sorteio de equipes. Cada confronto abre o placar. */
(function () {
  'use strict';
  var SGV = window.SGV, h = SGV.h, ui = SGV.ui, storage = SGV.storage;

  var LETTERS = 'ABCDEFGH';
  var GCOLORS = ['#4cc3f1', '#ff8a3d', '#7de0c1', '#ff7a9c', '#ffd24d', '#9aa8ff', '#f59e8b', '#f2d49b'];
  var HEX = /^#[0-9a-f]{6}$/i;

  var teams = [];        // equipes do último sorteio
  var cur = null;        // campeonato salvo
  var mode = 'setup';    // setup | main
  var tab = 'groups';    // groups | knock
  var cfg = { groups: 2, dbl: false, direct: false };
  var plan = null;       // sorteio das chaves em andamento
  var flash = null;      // {id} partida recém-finalizada (anima ao voltar)
  var lastPos = {};      // posição anterior na tabela (setas ▲ ▼)
  var seeded = '';
  var keepOld = false;   // permite continuar um campeonato de sorteio antigo
  var token = 0;         // cancela animações do sorteio de chaves ao sair
  var unlockReady = false;
  var el = {};

  /* ---------- utilidades ---------- */
  function reduced() { return !!(window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches); }

  function randInt(n) {
    if (window.crypto && crypto.getRandomValues) {
      var a = new Uint32Array(1), max = Math.floor(4294967296 / n) * n;
      do { crypto.getRandomValues(a); } while (a[0] >= max);
      return a[0] % n;
    }
    return Math.floor(Math.random() * n);
  }

  function shuffle(list) {
    var a = list.slice();
    for (var i = a.length - 1; i > 0; i--) { var j = randInt(i + 1), t = a[i]; a[i] = a[j]; a[j] = t; }
    return a;
  }

  function ico(name, cls) {
    var i = SGV.icon(name);
    if (cls) i.setAttribute('class', 'ico ' + cls);
    return i;
  }

  function loadTeams() {
    var s = storage.get('teams', null), out = [];
    if (s && Array.isArray(s.teams)) {
      s.teams.forEach(function (t) {
        if (!t || typeof t.name !== 'string') return;
        out.push({
          name: t.name.slice(0, 24),
          color: HEX.test(t.color) ? t.color : '#ff8a3d',
          players: Array.isArray(t.players) ? t.players.filter(function (p) { return typeof p === 'string'; }).slice(0, 12) : []
        });
      });
    }
    return out;
  }

  function sigOf(list) {
    return list.map(function (t) { return t.name + ':' + t.players.join(','); }).join('|');
  }

  function unlocked() { return loadTeams().length >= 2; }

  function loadCamp() {
    var c = storage.get('camp', null);
    if (!c || c.v !== 1 || !Array.isArray(c.teams) || !Array.isArray(c.groups) || !Array.isArray(c.matches)) return null;
    return c;
  }

  function save() { storage.set('camp', cur); }
  function byId(id) { for (var i = 0; i < cur.matches.length; i++) if (cur.matches[i].id === id) return cur.matches[i]; return null; }
  function isTeam(v) { return typeof v === 'number' && v >= 0; }

  /* ---------- chaves e jogos ---------- */
  function maxGroups(n) { return Math.max(1, Math.min(8, Math.floor(n / 2))); }

  function groupSizes(n, g) {
    var base = Math.floor(n / g), extra = n % g, out = [];
    for (var i = 0; i < g; i++) out.push(base + (i < extra ? 1 : 0));
    return out;
  }

  function countMatches(sizes, dbl) {
    var t = 0;
    sizes.forEach(function (s) { t += s * (s - 1) / 2; });
    return t * (dbl ? 2 : 1);
  }

  /* Método do círculo: cada equipe joga uma vez por rodada. */
  function roundRobin(list) {
    var arr = list.slice();
    if (arr.length % 2) arr.push(null);
    var n = arr.length, rounds = [];
    for (var r = 0; r < n - 1; r++) {
      var pairs = [];
      for (var i = 0; i < n / 2; i++) {
        var a = arr[i], b = arr[n - 1 - i];
        if (a === null || b === null) continue;
        pairs.push(i === 0 && r % 2 ? [b, a] : [a, b]);
      }
      rounds.push(pairs);
      arr.splice(1, 0, arr.pop());
    }
    return rounds;
  }

  function createCamp(order, g, dbl) {
    var groups = [], i;
    for (i = 0; i < g; i++) groups.push({ teams: [] });
    order.forEach(function (t, k) { groups[k % g].teams.push(t); });
    var matches = [], n = 0;
    groups.forEach(function (grp, gi) {
      var rounds = roundRobin(grp.teams), all = rounds.slice();
      if (dbl) rounds.forEach(function (r) { all.push(r.map(function (p) { return [p[1], p[0]]; })); });
      all.forEach(function (r, ri) {
        r.forEach(function (p) {
          matches.push({ id: 'g' + (n++), stage: 'g', group: gi, round: ri + 1, a: p[0], b: p[1], sa: null, sb: null, done: false });
        });
      });
    });
    var c = baseCamp(groups);
    c.dbl = !!dbl;
    c.matches = matches;
    return c;
  }

  function baseCamp(groups) {
    return {
      v: 1, id: Date.now().toString(36), sig: sigOf(teams), dbl: false, direct: false,
      teams: teams.map(function (t) { return { name: t.name, color: t.color, players: t.players.slice() }; }),
      groups: groups, matches: [], knock: null, crowned: false
    };
  }

  function groupMatches(gi) {
    return cur.matches.filter(function (m) { return m.stage === 'g' && m.group === gi; });
  }
  function groupDone(gi) { return groupMatches(gi).every(function (m) { return m.done; }); }
  function allGroupsDone() { return cur.groups.every(function (g, gi) { return groupDone(gi); }); }

  function rowCmp(x, y) { return (y.pts - x.pts) || ((y.pp - y.pc) - (x.pp - x.pc)) || (y.pp - x.pp); }

  /* Classificação: pontos (vitória = 3), saldo de pontos e pontos pró. */
  function standings(gi) {
    var rows = {};
    cur.groups[gi].teams.forEach(function (t) { rows[t] = { t: t, j: 0, v: 0, d: 0, pp: 0, pc: 0, pts: 0 }; });
    groupMatches(gi).forEach(function (m) {
      if (!m.done) return;
      var A = rows[m.a], B = rows[m.b];
      A.j++; B.j++;
      A.pp += m.sa; A.pc += m.sb; B.pp += m.sb; B.pc += m.sa;
      if (m.sa > m.sb) { A.v++; B.d++; A.pts += 3; } else { B.v++; A.d++; B.pts += 3; }
    });
    return cur.groups[gi].teams.map(function (t, i) { rows[t].ord = i; return rows[t]; })
      .sort(function (x, y) { return rowCmp(x, y) || (x.ord - y.ord); });
  }

  /* ---------- fase final ---------- */
  function seedOrder(s) {
    var a = [1];
    while (a.length < s) {
      var n = a.length * 2, nx = [];
      a.forEach(function (x) { nx.push(x, n + 1 - x); });
      a = nx;
    }
    return a;
  }

  function winnerOf(m) {
    if (m.bye) return isTeam(m.a) ? m.a : m.b;
    return m.sa > m.sb ? m.a : m.b;
  }

  function advance(m) {
    if (m.stage !== 'k') return;
    var nx = byId('k' + (m.round + 1) + '_' + (m.idx >> 1));
    if (nx) nx[m.idx % 2 === 0 ? 'a' : 'b'] = winnerOf(m);
  }

  function nextDone(m) {
    if (m.stage !== 'k') return false;
    var nx = byId('k' + (m.round + 1) + '_' + (m.idx >> 1));
    return !!(nx && nx.done);
  }

  /* Os 2 primeiros de cada chave avançam. Quem sobra de vaga vira "folga" (BYE). */
  function buildKnock() {
    var winners = [], seconds = [];
    cur.groups.forEach(function (g, gi) {
      var st = standings(gi);
      winners.push({ t: st[0].t, g: gi, r: st[0] });
      seconds.push({ t: st[1].t, g: gi, r: st[1] });
    });
    function by(x, y) { return rowCmp(x.r, y.r); }
    winners.sort(by); seconds.sort(by);
    var seeds = winners.concat(seconds), Q = seeds.length, S = 2;
    while (S < Q) S *= 2;
    var order = seedOrder(S), pairs = [], i;
    for (i = 0; i < S; i += 2) {
      pairs.push([order[i], order[i + 1]].map(function (sd) { return sd <= Q ? seeds[sd - 1] : null; }));
    }
    /* evita rever, logo de cara, equipes da mesma chave */
    function clash(p) { return p[0] && p[1] && p[0].g === p[1].g; }
    pairs.forEach(function (p) {
      if (!clash(p)) return;
      for (var j = 0; j < pairs.length; j++) {
        var q = pairs[j];
        if (q === p || !q[0] || !q[1]) continue;
        var t = p[1]; p[1] = q[1]; q[1] = t;
        if (!clash(p) && !clash(q)) return;
        t = p[1]; p[1] = q[1]; q[1] = t;
      }
    });
    buildBracket(pairs.map(function (p) { return [p[0] ? p[0].t : -1, p[1] ? p[1].t : -1]; }));
  }

  /* Monta as rodadas do mata-mata a partir dos confrontos da 1ª rodada ([a, b], -1 = folga/BYE). */
  function buildBracket(pairs) {
    var S = pairs.length * 2, R = Math.round(Math.log(S) / Math.LN2), ms = [], r, i;
    for (r = 1; r <= R; r++) {
      for (i = 0; i < S / Math.pow(2, r); i++) {
        ms.push({ id: 'k' + r + '_' + i, stage: 'k', round: r, idx: i, a: null, b: null, sa: null, sb: null, done: false });
      }
    }
    cur.matches = cur.matches.concat(ms);
    cur.knock = { rounds: R };
    pairs.forEach(function (p, idx) {
      var m = byId('k1_' + idx);
      m.a = p[0]; m.b = p[1];
      if (m.a === -1 || m.b === -1) { m.done = true; m.bye = true; advance(m); }
    });
  }

  /* Mata-mata direto: sorteia as equipes nas vagas do chaveamento (sem fase de grupos). */
  function directPairs(order) {
    var n = order.length, S = 2;
    while (S < n) S *= 2;
    var seeds = seedOrder(S), pairs = [], k = 0;
    for (var i = 0; i < S; i += 2) {
      pairs.push([seeds[i] <= n ? order[k++] : -1, seeds[i + 1] <= n ? order[k++] : -1]);
    }
    return pairs;
  }

  function createDirect(pairs) {
    cur = baseCamp([]);
    cur.direct = true;
    buildBracket(pairs);
    return cur;
  }

  function champion() {
    if (!cur) return null;
    if (cur.knock) {
      var f = byId('k' + cur.knock.rounds + '_0');
      return f && f.done ? winnerOf(f) : null;
    }
    if (cur.groups.length === 1 && groupDone(0)) return standings(0)[0].t;
    return null;
  }

  function roundName(r, R) {
    var d = R - r;
    return d === 0 ? 'Final' : d === 1 ? 'Semifinal' : d === 2 ? 'Quartas de final' : d === 3 ? 'Oitavas de final' : 'Rodada ' + r;
  }

  function labelOf(m) {
    return m.stage === 'g' ? 'Chave ' + LETTERS[m.group] + ' · Rodada ' + m.round : roundName(m.round, cur.knock.rounds);
  }

  /* ---------- regras de edição ---------- */
  function canEdit(m) {
    if (!isTeam(m.a) || !isTeam(m.b) || m.bye) return false;
    return m.stage === 'g' ? !cur.knock : !nextDone(m);
  }

  /* Andamento de um jogo ainda não finalizado (vem do placar ou foi guardado). */
  function liveOf(m) {
    if (m.done) return null;
    var ps = storage.get('placar', null);
    if (ps && ps.match === m.id && ps.a && ps.b && ps.a.score + ps.b.score > 0) return { sa: ps.a.score, sb: ps.b.score };
    if (m.live && m.live.sa + m.live.sb > 0) return m.live;
    return null;
  }

  /* ---------- API usada pelo placar ---------- */
  function finishMatch(id, sa, sb) {
    cur = loadCamp();
    if (!cur) return false;
    var m = byId(id);
    if (!m || !canEdit(m) || sa === sb) return false;
    m.sa = sa; m.sb = sb; m.done = true;
    delete m.live;
    advance(m);
    flash = { id: id };
    save();
    return true;
  }

  function savePartial(id, sa, sb) {
    var c = loadCamp();
    if (!c) return;
    var prev = cur; cur = c;
    var m = byId(id);
    if (m && !m.done) {
      if (sa + sb > 0) m.live = { sa: sa, sb: sb }; else delete m.live;
      save();
    }
    cur = prev && prev.id === c.id ? c : prev;
  }

  function openMatch(m) {
    if (m.bye) return;
    if (!isTeam(m.a) || !isTeam(m.b)) { ui.toast('Aguardando os classificados da fase anterior'); return; }
    if (!canEdit(m)) { ui.toast(m.stage === 'g' ? 'A fase de grupos já foi encerrada' : 'A rodada seguinte já começou'); return; }
    var A = cur.teams[m.a], B = cur.teams[m.b], live = m.live;
    SGV.placar.startMatch({
      id: m.id, label: labelOf(m),
      a: { name: A.name, color: A.color, score: m.done ? m.sa : (live ? live.sa : 0) },
      b: { name: B.name, color: B.color, score: m.done ? m.sb : (live ? live.sb : 0) }
    });
  }

  /* ---------- efeitos ---------- */
  function confetti() {
    if (reduced() || el.view.hidden) return;
    var colors = ['#f5c542', '#ff8a3d', '#4cc3f1', '#7de0c1', '#ff7a9c', '#ffffff'];
    var box = h('div', { class: 'confetti', 'aria-hidden': 'true' });
    for (var i = 0; i < 80; i++) {
      var w = 6 + randInt(7);
      box.appendChild(h('i', {
        style: '--x:' + randInt(100) + 'vw;--w:' + w + 'px;--c:' + colors[randInt(colors.length)] +
          ';--d:' + (2.4 + randInt(18) / 10) + 's;--dl:' + (randInt(9) / 10) + 's;--s:' + (randInt(240) - 120) + 'px;--r:' + randInt(360) + 'deg'
      }));
    }
    document.body.appendChild(box);
    setTimeout(function () { box.remove(); }, 4600);
  }

  function shake(node) {
    node.classList.remove('shake');
    void node.offsetWidth;
    node.classList.add('shake');
  }

  /* ---------- componentes ---------- */
  function dot() { return h('i', { class: 'dot' }); }

  function pill(text, cls) { return h('span', { class: 'pill' + (cls ? ' ' + cls : ''), text: text }); }

  function matchCard(m, i) {
    var A = cur.teams[m.a], B = cur.teams[m.b], live = liveOf(m);
    var wa = m.done && m.sa > m.sb, wb = m.done && m.sb > m.sa;
    var cls = 'mc ' + (m.done ? 'done' : live ? 'live' : 'ready') + (canEdit(m) ? '' : ' locked') + (flash && flash.id === m.id ? ' just' : '');
    var mid;
    if (m.done || live) {
      var sa = m.done ? m.sa : live.sa, sb = m.done ? m.sb : live.sb;
      mid = h('span', { class: 'mc-mid' },
        h('span', { class: 'mc-score' },
          h('em', { class: wa ? 'win' : '', text: String(sa) }), h('s', { text: '×' }), h('em', { class: wb ? 'win' : '', text: String(sb) })),
        live ? pill('Em jogo', 'pill--live') : null);
    } else {
      mid = h('span', { class: 'mc-mid mc-vs' }, h('b', { text: 'VS' }), pill(canEdit(m) ? 'Jogar' : 'Aguardando'));
    }
    return h('button', {
      class: cls, type: 'button', 'data-id': m.id, style: '--ca:' + A.color + ';--cb:' + B.color + ';--i:' + i,
      'aria-label': A.name + ' contra ' + B.name + (m.done ? ': ' + m.sa + ' a ' + m.sb : ''),
      onclick: function () { openMatch(m); }
    },
      h('span', { class: 'mc-team a' + (wa ? ' win' : '') + (wb ? ' lose' : '') }, h('b', { text: A.name }), dot()),
      mid,
      h('span', { class: 'mc-team b' + (wb ? ' win' : '') + (wa ? ' lose' : '') }, dot(), h('b', { text: B.name })));
  }

  function standingsTable(gi) {
    var st = standings(gi), multi = cur.groups.length > 1;
    var tbody = h('tbody', {});
    st.forEach(function (r, pos) {
      var T = cur.teams[r.t], key = gi + ':' + r.t, prev = lastPos[key];
      var delta = prev == null ? 0 : prev - pos;
      lastPos[key] = pos;
      var sp = r.pp - r.pc;
      tbody.appendChild(h('tr', {
        class: 'st-row' + (multi && pos < 2 ? ' q' : '') + (pos === 0 && r.j ? ' lead' : '') + (delta > 0 ? ' up' : delta < 0 ? ' down' : ''),
        style: '--c:' + T.color + ';--i:' + pos
      },
        h('td', { class: 'st-pos' }, h('span', { text: String(pos + 1) })),
        h('td', { class: 'st-team', title: T.players.join(', ') },
          h('div', { class: 'in' }, dot(), h('b', { text: T.name }), delta ? h('span', { class: 'mv', text: delta > 0 ? '▲' : '▼' }) : null)),
        h('td', { text: String(r.j) }),
        h('td', { text: String(r.v) }),
        h('td', { text: String(r.d) }),
        h('td', { text: (sp > 0 ? '+' : '') + sp }),
        h('td', { class: 'st-pts', text: String(r.pts) })));
    });
    return h('table', { class: 'st' },
      h('thead', {}, h('tr', {},
        h('th', { text: '#' }), h('th', { class: 'l', text: 'Equipe' }), h('th', { title: 'Jogos', text: 'J' }), h('th', { title: 'Vitórias', text: 'V' }),
        h('th', { title: 'Derrotas', text: 'D' }), h('th', { title: 'Saldo de pontos', text: 'SP' }), h('th', { title: 'Pontos', text: 'PTS' }))),
      tbody);
  }

  function groupCard(gi) {
    var mine = groupMatches(gi), done = mine.filter(function (m) { return m.done; }).length;
    var multi = cur.groups.length > 1;
    var list = h('div', { class: 'rd-list' }), rounds = {}, n = 0;
    mine.forEach(function (m) { (rounds[m.round] = rounds[m.round] || []).push(m); });
    Object.keys(rounds).forEach(function (r) {
      list.appendChild(h('div', { class: 'rd-label', text: 'Rodada ' + r }));
      rounds[r].forEach(function (m) { list.appendChild(matchCard(m, n++)); });
    });
    return h('article', { class: 'grp' + (done === mine.length ? ' complete' : ''), style: '--i:' + gi + ';--gc:' + GCOLORS[gi % GCOLORS.length] },
      h('header', { class: 'grp-head' },
        h('span', { class: 'grp-letter' }, h('b', { text: LETTERS[gi] })),
        h('div', {}, h('h4', { text: 'Chave ' + LETTERS[gi] }),
          h('span', { class: 'grp-sub', text: cur.groups[gi].teams.length + ' equipes · ' + done + '/' + mine.length + ' jogos' }))),
      standingsTable(gi),
      multi ? h('div', { class: 'st-legend' }, h('i', { class: 'lg' }), 'Os 2 primeiros avançam para a fase final') : null,
      list);
  }

  function ctaEl() {
    var chips = h('div', { class: 'cta-q' });
    cur.groups.forEach(function (g, gi) {
      standings(gi).slice(0, 2).forEach(function (r, pos) {
        var T = cur.teams[r.t];
        chips.appendChild(h('span', { class: 'tchip', style: '--c:' + T.color + ';--i:' + (gi * 2 + pos) }, h('em', { text: (pos + 1) + 'º ' + LETTERS[gi] }), T.name));
      });
    });
    return h('section', { class: 'cta' },
      h('div', {}, h('strong', { text: 'Fase de grupos concluída!' }),
        h('p', { class: 'hint', text: 'Estes são os classificados para o mata-mata.' }), chips),
      h('button', { class: 'btn btn--primary btn--xl', type: 'button', onclick: genKnock }, ico('trophy'), h('span', { text: 'Gerar fase final' })));
  }

  function groupsView() {
    var wrap = h('div', { class: 'camp-groups' });
    if (cur.groups.length > 1 && !cur.knock && allGroupsDone()) wrap.appendChild(ctaEl());
    var grid = h('div', { class: 'grp-grid' });
    cur.groups.forEach(function (g, gi) { grid.appendChild(groupCard(gi)); });
    wrap.appendChild(grid);
    return wrap;
  }

  function slotRow(v, win, lose, score) {
    var T = isTeam(v) ? cur.teams[v] : null;
    return h('span', { class: 'kc-row' + (win ? ' win' : '') + (lose ? ' lose' : '') + (T ? '' : ' tbd'), style: T ? '--c:' + T.color : null },
      T ? dot() : null,
      h('b', { text: T ? T.name : v === -1 ? 'BYE' : 'A definir' }),
      score == null ? null : h('em', { text: String(score) }));
  }

  function kCard(m, r, R) {
    var live = liveOf(m), ok = isTeam(m.a) && isTeam(m.b);
    var played = m.done && !m.bye;
    var wa = played && m.sa > m.sb, wb = played && m.sb > m.sa;
    var sa = played ? m.sa : live ? live.sa : null, sb = played ? m.sb : live ? live.sb : null;
    var cls = 'kc' + (r === R ? ' final' : '') + (m.bye ? ' bye' : m.done ? ' done' : ok ? (live ? ' live' : ' ready') : ' tbd') +
      (canEdit(m) ? '' : ' locked') + (flash && flash.id === m.id ? ' just' : '');
    var foot = m.bye ? pill('Avança direto')
      : m.done ? null
      : live ? pill('Em jogo', 'pill--live')
      : ok ? pill('Jogar') : pill('Aguardando');
    return h('button', {
      class: cls, type: 'button', 'data-id': m.id, style: '--r:' + (r - 1) + ';--i:' + m.idx,
      'aria-label': roundName(r, R) + (ok ? ': ' + cur.teams[m.a].name + ' contra ' + cur.teams[m.b].name : ''),
      onclick: function () { openMatch(m); }
    },
      h('span', { class: 'kc-in' }, slotRow(m.a, wa, wb, sa), slotRow(m.b, wb, wa, sb), foot ? h('span', { class: 'kc-foot' }, foot) : null));
  }

  function knockView() {
    var R = cur.knock.rounds, board = h('div', { class: 'k-board' }), r;
    for (r = 1; r <= R; r++) {
      var ms = cur.matches.filter(function (m) { return m.stage === 'k' && m.round === this; }, r).sort(function (x, y) { return x.idx - y.idx; });
      var slots = h('div', { class: 'k-slots' });
      for (var i = 0; i < ms.length; i++) {
        slots.appendChild(h('div', { class: 'k-slot' + (r < R ? (ms[i].idx % 2 === 0 ? ' pt' : ' pb') : '') }, kCard(ms[i], r, R)));
      }
      board.appendChild(h('div', { class: 'k-col' }, h('div', { class: 'k-head', text: roundName(r, R) }), slots));
    }
    var c = champion();
    board.appendChild(h('div', { class: 'k-col k-end' },
      h('div', { class: 'k-head', text: 'Campeão' }),
      h('div', { class: 'k-slots' }, h('div', { class: 'k-slot' },
        h('div', { class: 'kc kc-end' + (c != null ? ' got' : ''), style: c != null ? '--c:' + cur.teams[c].color : null },
          h('span', { class: 'kc-in kc-trophy' }, ico('cup', 'cup'), h('b', { text: c != null ? cur.teams[c].name : 'A definir' })))))));
    return h('div', { class: 'k-wrap' },
      h('p', { class: 'hint', text: 'Toque em um confronto para jogar. Deslize para o lado para ver todas as fases.' }), board);
  }

  function champEl(c) {
    var T = cur.teams[c];
    return h('section', { class: 'champ', style: '--tc:' + T.color, role: 'button', tabindex: '0', 'aria-label': 'Campeão: ' + T.name + '. Toque para comemorar',
      onclick: confetti, onkeydown: function (e) { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); confetti(); } } },
      h('div', { class: 'champ-trophy' }, ico('cup')),
      h('span', { class: 'eyebrow', text: 'Campeão' }),
      h('h2', { text: T.name }),
      h.apply(null, ['ul', { class: 'champ-players' }].concat(T.players.map(function (n) { return h('li', { text: n }); }))),
      h('span', { class: 'champ-tip', text: 'Toque para comemorar' }));
  }

  function heroEl() {
    var ms = cur.matches.filter(function (m) { return !m.bye && (cur.knock ? m.stage === 'k' : m.stage === 'g'); });
    var done = ms.filter(function (m) { return m.done; }).length;
    var pct = ms.length ? Math.round(done / ms.length * 100) : 0;
    var g = cur.groups.length;
    var phase = cur.direct ? 'Mata-mata' : cur.knock ? 'Fase final' : g > 1 ? 'Fase de grupos' : 'Todos contra todos';
    return h('section', { class: 'camp-hero' },
      h('div', { class: 'hero-badge' }, ico('trophy')),
      h('div', { class: 'hero-txt' },
        h('span', { class: 'eyebrow', text: 'Campeonato SGV' }),
        h('h3', { text: phase }),
        h('p', { text: cur.teams.length + ' equipes · ' + (cur.direct ? 'eliminatória direta' : g + (g === 1 ? ' chave' : ' chaves')) })),
      h('div', { class: 'prog' },
        h('div', { class: 'prog-bar', role: 'progressbar', 'aria-valuemin': '0', 'aria-valuemax': '100', 'aria-valuenow': String(pct), 'aria-label': 'Jogos concluídos' }, h('i', { style: '--p:' + pct + '%' })),
        h('span', { text: done + '/' + ms.length + ' jogos' })));
  }

  /* ---------- telas ---------- */
  function fillPane(pane) {
    pane.textContent = '';
    pane.classList.remove('camp-pane');
    void pane.offsetWidth;
    pane.classList.add('camp-pane');
    pane.appendChild(tab === 'knock' && cur.knock ? knockView() : groupsView());
  }

  function tabsEl(pane) {
    var bar = h('div', { class: 'camp-tabs', role: 'tablist' }), btns = {};
    function mk(key, label, lockedNow) {
      var b = h('button', { class: 'ctab' + (lockedNow ? ' locked' : ''), type: 'button', role: 'tab', 'aria-selected': String(tab === key) },
        key === 'knock' && lockedNow ? ico('lock') : null, h('span', { text: label }));
      b.addEventListener('click', function () {
        if (key === 'knock' && !cur.knock) {
          if (allGroupsDone()) { genKnock(); return; }
          shake(b);
          ui.toast('Conclua todos os jogos das chaves para liberar a fase final');
          return;
        }
        if (tab === key) return;
        tab = key;
        Object.keys(btns).forEach(function (k) { btns[k].setAttribute('aria-selected', String(k === tab)); });
        fillPane(pane);
      });
      btns[key] = b;
      bar.appendChild(b);
    }
    mk('groups', 'Chaves', false);
    mk('knock', 'Fase final', !cur.knock);
    return bar;
  }

  function renderMain() {
    var wrap = h('div', { class: 'camp-main' });
    wrap.appendChild(heroEl());
    var champ = champion();
    if (champ != null) wrap.appendChild(champEl(champ));
    var pane = h('div', { class: 'camp-pane' });
    if (cur.direct) tab = 'knock';
    else if (cur.groups.length > 1) wrap.appendChild(tabsEl(pane));
    else tab = 'groups';
    wrap.appendChild(pane);
    el.body.appendChild(wrap);
    pane.classList.remove('camp-pane');
    fillPane(pane);
    afterRender();
  }

  function afterRender() {
    var f = flash; flash = null;
    var c = champion(), crowned = false;
    if (c != null && !cur.crowned) { cur.crowned = true; crowned = true; save(); setTimeout(confetti, 450); }
    else if (c == null && cur.crowned) { cur.crowned = false; save(); }
    setTimeout(function () {
      var behavior = reduced() ? 'auto' : 'smooth';
      if (crowned) window.scrollTo({ top: 0, behavior: behavior });
      else if (f) {
        var node = el.body.querySelector('[data-id="' + f.id + '"]');
        if (node) node.scrollIntoView({ block: 'center', behavior: behavior });
      }
    }, 140);
  }

  function genKnock() {
    if (cur.knock) return;
    buildKnock();
    tab = 'knock';
    save();
    render();
    window.scrollTo(0, 0);
    ui.toast('Fase final montada!');
  }

  /* ---------- configuração e sorteio das chaves ---------- */
  function describeSizes(sizes) {
    var same = sizes.every(function (s) { return s === sizes[0]; });
    return same ? sizes[0] + ' equipes por chave' : sizes.join(' / ') + ' equipes';
  }

  function renderSetup() {
    var n = teams.length, mg = maxGroups(n);
    cfg.groups = Math.max(1, Math.min(cfg.groups, mg));
    var same = !!(cur && cur.sig === sigOf(teams));
    var wrap = h('div', { class: 'camp-setup' });

    wrap.appendChild(h('section', { class: 'camp-intro' },
      h('div', { class: 'camp-trophy' }, ico('trophy')),
      h('div', {},
        h('span', { class: 'eyebrow', text: 'Campeonato SGV' }),
        h('h3', { text: 'Monte o campeonato' }),
        h('p', { class: 'hint', text: 'Chaves de todos contra todos com fase final, ou direto para o mata-mata.' }))));

    if (cur && !same) {
      wrap.appendChild(h('p', { class: 'notice', text: 'Há um sorteio de equipes novo. O campeonato anterior usa as equipes antigas.' }));
    }

    var chips = h('div', { class: 'team-chips' });
    teams.forEach(function (t, i) {
      chips.appendChild(h('span', { class: 'tchip', style: '--c:' + t.color + ';--i:' + i }, dot(), t.name, h('em', { text: String(t.players.length) })));
    });
    wrap.appendChild(h('section', { class: 'card' },
      h('div', { class: 'card-head' }, h('h3', { text: 'Equipes sorteadas' }), h('span', { class: 'badge', text: n + ' equipes' })), chips));

    var seg = h('div', { class: 'segmented', role: 'radiogroup', 'aria-label': 'Quantidade de chaves' });
    seg.style.gridTemplateColumns = 'repeat(' + mg + ',1fr)';
    var prev = h('p', { class: 'camp-preview', 'aria-live': 'polite' });
    var cb = h('input', { type: 'checkbox' });
    cb.checked = cfg.dbl;
    var fmt = h('div', { class: 'segmented fmt', role: 'radiogroup', 'aria-label': 'Formato do campeonato' });
    var opts = h('div', { class: 'camp-opts' },
      h('h3', { text: 'Quantas chaves?' }), seg,
      h('label', { class: 'check' }, cb, h('span', { class: 'box' }), h('span', { class: 'p-name', text: 'Jogos de ida e volta' })));
    var draw = h('span', {});

    function fmtBtn(direct, title, sub) {
      return h('button', {
        class: 'seg seg--fmt', type: 'button', role: 'radio', 'aria-checked': String(cfg.direct === direct),
        onclick: function () { cfg.direct = direct; paint(); }
      }, h('b', { text: title }), h('small', { text: sub }));
    }

    function paint() {
      fmt.textContent = '';
      fmt.appendChild(fmtBtn(false, 'Chaves + mata-mata', 'Todos contra todos, com pontuação'));
      fmt.appendChild(fmtBtn(true, 'Mata-mata direto', 'Sem chaves: perdeu, saiu'));
      opts.hidden = cfg.direct;
      draw.textContent = cfg.direct ? 'Sortear confrontos' : 'Sortear chaves';
      seg.textContent = '';
      for (var g = 1; g <= mg; g++) seg.appendChild(segBtn(g));
      if (cfg.direct) {
        var S = 2;
        while (S < n) S *= 2;
        var byes = S - n;
        prev.textContent = n + ' equipes · ' + (n - 1) + (n - 1 === 1 ? ' jogo' : ' jogos') + ' eliminatórios' +
          (byes ? ' · ' + byes + (byes === 1 ? ' equipe com folga' : ' equipes com folga') : '');
        return;
      }
      var sizes = groupSizes(n, cfg.groups), total = countMatches(sizes, cfg.dbl);
      prev.textContent = cfg.groups + (cfg.groups === 1 ? ' chave' : ' chaves') + ' · ' + describeSizes(sizes) + ' · ' +
        total + (total === 1 ? ' jogo' : ' jogos') + (cfg.groups > 1 ? ' + fase final' : '');
    }
    function segBtn(g) {
      return h('button', {
        class: 'seg', type: 'button', role: 'radio', 'aria-checked': String(g === cfg.groups), text: String(g),
        'aria-label': g + (g === 1 ? ' chave' : ' chaves'),
        onclick: function () { cfg.groups = g; paint(); }
      });
    }
    cb.addEventListener('change', function () { cfg.dbl = cb.checked; paint(); });
    paint();

    wrap.appendChild(h('section', { class: 'card' },
      h('h3', { text: 'Formato' }), fmt, opts, prev,
      h('button', { class: 'btn btn--primary btn--xl', type: 'button', onclick: startDraw }, ico('shuffle'), draw),
      cur ? h('button', { class: 'chip', type: 'button', onclick: function () { keepOld = true; mode = 'main'; render(); window.scrollTo(0, 0); } },
        same ? 'Voltar ao campeonato em andamento' : 'Ver campeonato anterior') : null));

    el.body.appendChild(wrap);
  }

  function startDraw() {
    var order = shuffle(teams.map(function (t, i) { return i; }));
    plan = cfg.direct
      ? { direct: true, order: order, pairs: directPairs(order) }
      : { direct: false, order: order, g: cfg.groups, dbl: cfg.dbl };
    renderDraw();
  }

  function clearFlies() {
    Array.prototype.forEach.call(document.querySelectorAll('.fly'), function (n) { n.remove(); });
  }

  /* chip "voa" da lista de equipes até a vaga na chave */
  function fly(src, dst, done) {
    var a = src.getBoundingClientRect(), b = dst.getBoundingClientRect();
    var clone = src.cloneNode(true);
    clone.classList.remove('picked', 'gone');
    clone.classList.add('fly');
    var cs = clone.style;   /* mantém o --c (cor da equipe) definido inline */
    cs.position = 'fixed'; cs.left = a.left + 'px'; cs.top = a.top + 'px';
    cs.width = a.width + 'px'; cs.height = a.height + 'px'; cs.margin = '0'; cs.zIndex = '60';
    document.body.appendChild(clone);
    var dx = b.left - a.left + 6, dy = b.top - a.top + (b.height - a.height) / 2;
    var anim = clone.animate([
      { transform: 'translate(0,0) scale(1.1) rotate(0deg)' },
      { transform: 'translate(' + dx * 0.5 + 'px,' + (dy * 0.5 - 36) + 'px) scale(1.2) rotate(-5deg)', offset: 0.5 },
      { transform: 'translate(' + dx + 'px,' + dy + 'px) scale(1) rotate(0deg)' }
    ], { duration: 380, easing: 'cubic-bezier(.3,.7,.3,1)', fill: 'forwards' });
    anim.onfinish = function () { clone.remove(); done(); };
  }

  function renderDraw() {
    var my = ++token, skip = false, direct = !!plan.direct, g = plan.g, order = plan.order, i;
    el.body.textContent = '';
    window.scrollTo(0, 0);
    var title = h('h3', { class: 'draw-title', text: direct ? 'Sorteando os confrontos…' : 'Sorteando as chaves…' });
    var pool = h('div', { class: 'draw-pool' }), chips = {};
    teams.forEach(function (t, k) {
      chips[k] = h('span', { class: 'tchip', style: '--c:' + t.color }, dot(), t.name);
      pool.appendChild(chips[k]);
    });
    var slots = [], place = [], grid = h('div', { class: 'draw-groups' });
    if (direct) {
      plan.pairs.forEach(function (p, pi) {
        var col = h('div', { class: 'dg', style: '--i:' + pi + ';--gc:' + GCOLORS[pi % GCOLORS.length] },
          h('div', { class: 'dg-head' }, h('b', { text: String(pi + 1) }), h('span', { text: 'Jogo ' + (pi + 1) })));
        slots[pi] = [];
        [0, 1].forEach(function (side) {
          var sl;
          if (p[side] === -1) sl = h('div', { class: 'dg-slot bye', text: 'BYE · avança direto' });
          else { sl = h('div', { class: 'dg-slot' }); place.push({ col: pi, slot: side, t: p[side] }); }
          slots[pi].push(sl);
          col.appendChild(sl);
        });
        grid.appendChild(col);
      });
    } else {
      var sizes = groupSizes(order.length, g);
      for (i = 0; i < g; i++) {
        var col = h('div', { class: 'dg', style: '--i:' + i + ';--gc:' + GCOLORS[i % GCOLORS.length] },
          h('div', { class: 'dg-head' }, h('b', { text: LETTERS[i] }), h('span', { text: 'Chave ' + LETTERS[i] })));
        slots[i] = [];
        for (var s = 0; s < sizes[i]; s++) { var sl = h('div', { class: 'dg-slot' }); slots[i].push(sl); col.appendChild(sl); }
        grid.appendChild(col);
      }
      order.forEach(function (t, k) { place.push({ col: k % g, slot: Math.floor(k / g), t: t }); });
    }
    var skipBtn = h('button', { class: 'btn btn--ghost', type: 'button', onclick: function () { skip = true; skipBtn.disabled = true; } }, 'Pular animação');
    var actions = h('div', { class: 'draw-actions' }, skipBtn);
    el.body.appendChild(h('div', { class: 'draw' }, title, pool, grid, actions));

    var k = 0;
    function alive() { return my === token && !el.view.hidden && el.body.contains(pool); }

    function finishDraw() {
      title.textContent = direct ? 'Confrontos definidos!' : 'Chaves definidas!';
      title.classList.add('ok');
      pool.classList.add('empty');
      actions.textContent = '';
      actions.appendChild(h('button', { class: 'btn btn--ghost', type: 'button', onclick: startDraw }, ico('shuffle'), h('span', { text: 'Sortear de novo' })));
      actions.appendChild(h('button', { class: 'btn btn--accent', type: 'button', onclick: begin }, ico('flag'), h('span', { text: 'Iniciar campeonato' })));
      if (!skip) confetti();
    }

    var pending = 0;   // chips ainda em voo (vários voam ao mesmo tempo)
    function step() {
      if (!alive() || k >= place.length) return;
      var pl = place[k++], t = pl.t, slot = slots[pl.col][pl.slot], src = chips[t];
      pending++;
      function land() {
        slot.style.setProperty('--c', teams[t].color);
        slot.classList.add('on', 'land');
        slot.appendChild(dot());
        slot.appendChild(document.createTextNode(teams[t].name));
        src.classList.add('gone');
        if (navigator.vibrate) navigator.vibrate(8);
        if (--pending === 0 && k >= place.length) finishDraw();
      }
      if (skip || reduced()) { land(); setTimeout(step, 0); return; }
      src.classList.add('gone');
      fly(src, slot, function () { if (alive()) land(); });
      setTimeout(step, 130);
    }
    setTimeout(step, reduced() ? 0 : 200);
  }

  function begin() {
    cur = plan.direct ? createDirect(plan.pairs) : createCamp(plan.order, plan.g, plan.dbl);
    save();
    if (SGV.placar && SGV.placar.clearMatch) SGV.placar.clearMatch();
    lastPos = {};
    keepOld = false;
    seeded = cur.id;
    tab = cur.direct ? 'knock' : 'groups';
    mode = 'main';
    render();
    window.scrollTo(0, 0);
    ui.toast('Campeonato iniciado!');
  }

  /* ---------- ciclo de vida ---------- */
  function render() {
    token++;
    el.body.textContent = '';
    el.newBtn.hidden = mode !== 'main';
    if (mode === 'main' && cur) renderMain(); else renderSetup();
  }

  function enter() {
    teams = loadTeams();
    cur = loadCamp();
    var same = !!(cur && cur.sig === sigOf(teams));
    mode = cur && (same || keepOld) ? 'main' : 'setup';
    if (mode === 'main') {
      if (flash) {
        var fm = byId(flash.id);
        if (fm) tab = fm.stage === 'k' ? 'knock' : 'groups';
      } else if (cur.knock && seeded !== cur.id) tab = 'knock';
      seeded = cur.id;
      if (tab === 'knock' && !cur.knock) tab = 'groups';
    } else flash = null;
    render();
  }

  /* ---------- botão da tela inicial ---------- */
  function refreshLock() {
    var btn = document.getElementById('btn-camp');
    if (!btn) return;
    var n = loadTeams().length, ok = n >= 2, was = btn.classList.contains('is-locked');
    btn.classList.toggle('is-locked', !ok);
    btn.setAttribute('aria-disabled', String(!ok));
    document.getElementById('camp-sub').textContent = ok ? n + ' equipes prontas' : 'Libera após o sorteio';
    if (ok && was && unlockReady) {
      btn.classList.remove('unlock');
      void btn.offsetWidth;
      btn.classList.add('unlock');
      setTimeout(function () { ui.toast('Campeonato liberado!'); }, 500);
    }
    unlockReady = true;
  }

  function init() {
    el.view = document.getElementById('view-campeonato');
    el.body = document.getElementById('camp-body');
    el.newBtn = document.getElementById('camp-new');
    el.newBtn.addEventListener('click', function () {
      ui.confirm('Novo campeonato?', 'O campeonato atual fica guardado até você sortear novas chaves.', 'Novo').then(function (ok) {
        if (!ok) return;
        keepOld = false;
        mode = 'setup';
        render();
        window.scrollTo(0, 0);
      });
    });

    var btn = document.getElementById('btn-camp');
    btn.addEventListener('click', function (e) {
      if (unlocked()) return;
      e.preventDefault();
      shake(btn);
      ui.toast('Sorteie as equipes primeiro para liberar o Campeonato');
    });
    btn.addEventListener('animationend', function () { btn.classList.remove('shake'); });
    refreshLock();

    window.addEventListener('hashchange', function () {
      refreshLock();
      if (!/^#\/campeonato/.test(location.hash)) { token++; clearFlies(); }
    });
  }

  SGV.campeonato = { unlocked: unlocked, finishMatch: finishMatch, savePartial: savePartial };
  SGV.register('campeonato', { init: init, enter: enter });
})();
