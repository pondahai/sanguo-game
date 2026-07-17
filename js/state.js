/* state.js — 遊戲狀態單一物件 + 初始化 + 存讀檔 */
(function () {
  "use strict";
  var S = null;
  var SAVE_KEY = "sanguo_save_v1";

  function h32(s) {
    var h = 2166136261;
    for (var i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = (h * 16777619) >>> 0; }
    return h;
  }

  function officerByName(name) {
    return window.OFFICERS.find(function (o) { return o.name === name; });
  }

  function newGame(playerFactionId) {
    S = {
      year: SCENARIO.start.year, month: SCENARIO.start.month,
      player: playerFactionId,
      factions: {}, prov: {}, off: {}, done: {}, log: [], ally: {}
    };
    var provIds = PROVINCES.map(function (p) { return p.id; });

    SCENARIO.factions.forEach(function (f) {
      S.factions[f.id] = { ruler: f.ruler, color: f.color, name: f.ruler + "軍", alive: true };
    });

    PROVINCES.forEach(function (p) {
      S.prov[p.id] = {
        owner: null,
        farm: p.farm * 40, farmMax: p.farm * 250,
        trade: p.trade * 30, tradeMax: p.trade * 250,
        flood: 30, loyal: 50, gold: 100, food: 1000,
        troops: 1000, train: 30
      };
    });

    window.OFFICERS.forEach(function (o) {
      S.off[o.name] = { fac: null, prov: provIds[h32(o.name) % provIds.length], loyal: 50, dead: false };
    });

    SCENARIO.factions.forEach(function (f) {
      f.provinces.forEach(function (pid, i) {
        var pv = S.prov[pid], pd = PROVINCES.find(function (x) { return x.id === pid; });
        pv.owner = f.id;
        pv.gold = 800; pv.food = 5000; pv.troops = 5000; pv.train = 50; pv.loyal = 65;
        pv.farm = pd.farm * 80; pv.trade = pd.trade * 60;
      });
      f.officers.forEach(function (name, i) {
        if (!S.off[name]) return;
        S.off[name].fac = f.id;
        S.off[name].prov = f.provinces[i % f.provinces.length];
        var od = officerByName(name);
        S.off[name].loyal = name === f.ruler ? 100 : 60 + Math.round(od.stats.yi / 3);
      });
      S.off[f.ruler].prov = f.provinces[0];
    });
    return S;
  }

  /* 武將是否已「出世」(年齡>=15) 且在世 */
  function available(name) {
    var o = officerByName(name), st = S.off[name];
    if (!st || st.dead) return false;
    if (o.birth && S.year < o.birth + 15) return false;
    return true;
  }

  function save() {
    try { localStorage.setItem(SAVE_KEY, JSON.stringify(S)); } catch (e) { /* file:// 無 storage 時忽略 */ }
  }
  function load() {
    try {
      var raw = localStorage.getItem(SAVE_KEY);
      if (raw) { S = JSON.parse(raw); return S; }
    } catch (e) {}
    return null;
  }
  function exportSave() {
    var a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([JSON.stringify(S)], { type: "application/json" }));
    a.download = "sanguo_save_" + S.year + "_" + S.month + ".json";
    a.click();
  }
  function importSave(file, cb) {
    var r = new FileReader();
    r.onload = function () { S = JSON.parse(r.result); save(); cb(); };
    r.readAsText(file);
  }

  window.State = {
    newGame: newGame, save: save, load: load,
    exportSave: exportSave, importSave: importSave,
    available: available, officerByName: officerByName, h32: h32,
    get: function () { return S; }
  };
})();
