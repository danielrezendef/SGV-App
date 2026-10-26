/* Persistência em LocalStorage, com fallback em memória se estiver indisponível. */
(function () {
  'use strict';
  var PREFIX = 'sgvapp:';
  var memory = {};

  function get(key, fallback) {
    try {
      var raw = localStorage.getItem(PREFIX + key);
      if (raw === null) return fallback;
      return JSON.parse(raw);
    } catch (e) {
      return key in memory ? memory[key] : fallback;
    }
  }

  function set(key, value) {
    memory[key] = value;
    try {
      localStorage.setItem(PREFIX + key, JSON.stringify(value));
    } catch (e) { /* armazenamento cheio ou bloqueado: segue em memória */ }
  }

  window.SGV = window.SGV || {};
  window.SGV.storage = { get: get, set: set };
})();
