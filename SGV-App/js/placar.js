/* Placar interativo: tocar no número soma 1 ponto. */
(function () {
  'use strict';
  var SGV = window.SGV, ui = SGV.ui, storage = SGV.storage;

  var DEFAULT = {
    a: { name: 'Equipe A', score: 0, color: '' },
    b: { name: 'Equipe B', score: 0, color: '' },
    history: []
  };
  var state;
  var el = {};

  function sanitize(s) {
    var d = JSON.parse(JSON.stringify(DEFAULT));
    if (!s || typeof s !== 'object') return d;
    ['a', 'b'].forEach(function (k) {
      var t = s[k] || {};
      if (typeof t.name === 'string' && t.name.trim()) d[k].name = t.name.slice(0, 24);
      if (Number.isInteger(t.score) && t.score >= 0) d[k].score = t.score;
      if (typeof t.color === 'string' && /^#[0-9a-f]{6}$/i.test(t.color)) d[k].color = t.color;
    });
    if (Array.isArray(s.history)) d.history = s.history.filter(function (x) { return x === 'a' || x === 'b'; }).slice(-500);
    return d;
  }

  function save() { storage.set('placar', state); }

  function paint(k) {
    var t = state[k], txt = String(t.score).padStart(2, '0');
    el['num' + k].textContent = txt;
    el['num' + k].dataset.len = String(txt.length);
    el['name' + k].textContent = t.name;
    el['btn' + k].setAttribute('aria-label', 'Adicionar ponto para ' + t.name + '. Placar atual: ' + t.score);
    if (t.color) el['side' + k].style.setProperty('--c', t.color);
    else el['side' + k].style.removeProperty('--c');
  }

  function render() {
    paint('a'); paint('b');
    el.undo.disabled = state.history.length === 0;
  }

  function restart(node, cls) {
    node.classList.remove(cls);
    void node.offsetWidth; // reinicia a animação mesmo com toques rápidos
    node.classList.add(cls);
  }

  function addPoint(k) {
    state[k].score++;
    state.history.push(k);
    if (state.history.length > 500) state.history.shift();
    save();
    paint(k);
    el.undo.disabled = false;
    restart(el['num' + k], 'bump');
    restart(el['side' + k], 'glow');
    if (navigator.vibrate) navigator.vibrate(10);
  }

  function undo() {
    var k = state.history.pop();
    if (!k) return;
    if (state[k].score > 0) state[k].score--;
    save();
    render();
    restart(el['num' + k], 'bump');
  }

  function reset() {
    ui.confirm('Reiniciar placar?', 'A pontuação das duas equipes voltará para zero.', 'Reiniciar').then(function (ok) {
      if (!ok) return;
      state.a.score = state.b.score = 0;
      state.history = [];
      save();
      render();
    });
  }

  function rename() {
    ui.prompt('Nomes das equipes', [
      { label: 'Equipe da esquerda', value: state.a.name },
      { label: 'Equipe da direita', value: state.b.name }
    ]).then(function (v) {
      if (!v) return;
      state.a.name = v[0] || 'Equipe A';
      state.b.name = v[1] || 'Equipe B';
      save();
      render();
    });
  }

  /* ---- Tela cheia ---- */
  function fsElement() { return document.fullscreenElement || document.webkitFullscreenElement; }
  function toggleFull() {
    var root = document.documentElement;
    try {
      if (fsElement()) (document.exitFullscreen || document.webkitExitFullscreen).call(document);
      else (root.requestFullscreen || root.webkitRequestFullscreen).call(root);
    } catch (e) { ui.toast('Tela cheia indisponível'); }
  }
  function syncFull() {
    var on = !!fsElement();
    document.getElementById('full-icon').setAttribute('href', on ? '#i-exit-fullscreen' : '#i-fullscreen');
    el.full.lastElementChild.textContent = on ? 'Sair' : 'Tela cheia';
  }

  /* Chamado pelo sorteio: inicia o placar com duas equipes. */
  function startWith(a, b) {
    function go() {
      state = sanitize({
        a: { name: a.name, score: 0, color: a.color },
        b: { name: b.name, score: 0, color: b.color },
        history: []
      });
      save();
      location.hash = '#/placar';
    }
    if (state.a.score + state.b.score > 0) {
      ui.confirm('Substituir placar atual?', 'Há uma partida em andamento. Iniciar uma nova zera a pontuação.', 'Iniciar novo').then(function (ok) { if (ok) go(); });
    } else go();
  }

  function init() {
    ['a', 'b'].forEach(function (k) {
      el['side' + k] = document.getElementById('side-' + k);
      el['name' + k] = document.getElementById('name-' + k);
      el['btn' + k] = document.getElementById('score-' + k);
      el['num' + k] = document.getElementById('num-' + k);
      el['btn' + k].addEventListener('click', function () { addPoint(k); });
      el['num' + k].addEventListener('animationend', function (e) { e.target.classList.remove('bump'); });
      el['side' + k].addEventListener('animationend', function (e) { if (e.target === e.currentTarget || e.animationName === 'glow') el['side' + k].classList.remove('glow'); });
    });
    el.undo = document.getElementById('btn-undo');
    el.full = document.getElementById('btn-full');
    el.undo.addEventListener('click', undo);
    document.getElementById('btn-reset').addEventListener('click', reset);
    document.getElementById('btn-rename').addEventListener('click', rename);
    el.full.addEventListener('click', toggleFull);
    document.addEventListener('fullscreenchange', syncFull);
    document.addEventListener('webkitfullscreenchange', syncFull);
    if (!(document.documentElement.requestFullscreen || document.documentElement.webkitRequestFullscreen)) el.full.hidden = true;
    render();
  }

  state = sanitize(storage.get('placar', null));
  SGV.placar = { startWith: startWith };
  SGV.register('placar', { init: init, enter: function () { if (el.numa) render(); } });
})();
