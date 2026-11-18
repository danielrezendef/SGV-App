/* Rede de fundo: malha em losangos presa no topo, ondulando como rede de vôlei ao vento.
   Cada nó da malha é deslocado por ondas que viajam pela rede (as células esticam,
   comprimem e brilham conforme a "dobra"), em vez de a malha inteira balançar rígida. */
(function () {
  'use strict';

  var S = 36.77;                 // meia diagonal do losango (malha de 52px girada 45°)
  var FPS_GAP = 1000 / 30;       // 30 quadros/s bastam para um movimento lento
  var canvas, ctx, W = 0, H = 0, dpr = 1, rows = 0, cols = 0, nodes = [];
  var raf = 0, last = 0, still = false;

  function reduced() { return !!(window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches); }

  function resize() {
    W = window.innerWidth; H = window.innerHeight;
    dpr = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = Math.round(W * dpr);
    canvas.height = Math.round(H * dpr);
    canvas.style.width = W + 'px';
    canvas.style.height = H + 'px';
    rows = Math.ceil(H * 0.72 / S) + 2;      // a rede some (máscara CSS) antes de chegar ao fim da tela
    cols = Math.ceil(W / S) + 5;
    nodes = [];
    for (var j = 0; j < rows; j++) {
      for (var i = -2; i < cols - 2; i++) {
        if ((i + j) % 2 === 0) nodes.push({ i: i, j: j, x: 0, y: 0, z: 0 });
      }
    }
    index();
    draw(performance.now());
  }

  /* posição ondulada de cada nó */
  function place(n, t) {
    var x0 = n.i * S, y0 = n.j * S;
    var f = Math.min(1, y0 / (H * 0.5));
    f = Math.pow(f, 1.2);                                // preso no topo, solto embaixo
    var w1 = Math.sin(x0 * 0.019 + y0 * 0.010 - t * 1.05);         // onda que viaja na diagonal
    var w2 = Math.sin(x0 * 0.010 - y0 * 0.016 - t * 0.70 + 1.7);   // onda cruzada, mais lenta
    var z = (w1 * 0.6 + w2 * 0.4) * f;                   // "profundidade" da dobra: -1..1
    var wind = Math.sin(t * 0.55 - y0 * 0.006);          // rajada que desce pela rede
    n.x = x0 + (x0 - W / 2) * z * 0.075 + wind * f * 16 + w2 * f * 9;
    n.y = y0 + z * 16 + wind * f * 5;
    n.z = z;
  }

  function node(i, j) {
    // índice do nó (i, j) dentro de `nodes`; a ordem é por linha, então calculamos por busca direta
    return grid[j] && grid[j][i + 2];
  }

  var grid = [];

  function index() {
    grid = [];
    nodes.forEach(function (n) { (grid[n.j] = grid[n.j] || [])[n.i + 2] = n; });
  }

  function draw(now) {
    var t = still ? 0 : now / 1000;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, W, H);
    nodes.forEach(function (n) { place(n, t); });
    ctx.lineWidth = 1.7;
    ctx.lineCap = 'round';
    nodes.forEach(function (a) {
      [-1, 1].forEach(function (d) {
        var b = node(a.i + d, a.j + 1);
        if (!b) return;
        var light = 0.6 + 0.4 * ((a.z + b.z) / 2);         // a dobra "pega luz"
        ctx.strokeStyle = 'rgba(255,255,255,' + light.toFixed(3) + ')';
        ctx.beginPath();
        ctx.moveTo(a.x, a.y);
        ctx.lineTo(b.x, b.y);
        ctx.stroke();
      });
    });
  }

  function loop(now) {
    raf = requestAnimationFrame(loop);
    if (now - last < FPS_GAP) return;
    last = now;
    draw(now);
  }

  function start() {
    cancelAnimationFrame(raf);
    still = reduced();
    if (still) { draw(0); return; }
    raf = requestAnimationFrame(loop);
  }

  function init() {
    canvas = document.createElement('canvas');
    canvas.id = 'net';
    canvas.setAttribute('aria-hidden', 'true');
    document.body.insertBefore(canvas, document.body.firstChild);
    ctx = canvas.getContext('2d');
    if (!ctx) return;
    var timer;
    window.addEventListener('resize', function () {
      clearTimeout(timer);
      timer = setTimeout(resize, 120);
    });
    resize();
    start();
    if (window.matchMedia) {
      var mq = matchMedia('(prefers-reduced-motion: reduce)');
      if (mq.addEventListener) mq.addEventListener('change', start);
    }
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
