/* commands.js — 內政指令。每州每月一道 (三國志 I 制)。
 * 執行者 = 該州駐留武將中該指令主屬性最高者，AI 與玩家共用同一套函式。 */
(function () {
  "use strict";

  function officersIn(pid, fac) {
    var S = State.get();
    return window.OFFICERS.filter(function (o) {
      var st = S.off[o.name];
      return st && !st.dead && st.fac === fac && st.prov === pid && State.available(o.name);
    });
  }
  function freeOfficersIn(pid) {
    var S = State.get();
    return window.OFFICERS.filter(function (o) {
      var st = S.off[o.name];
      return st && !st.dead && st.fac === null && st.prov === pid && State.available(o.name);
    });
  }
  function bestBy(list, stat) {
    return list.reduce(function (a, b) { return (b.stats[stat] > (a ? a.stats[stat] : -1)) ? b : a; }, null);
  }

  /* 指令表: id, 名稱, 主屬性, 檢查/執行。回傳 log 字串或 null(不可執行) */
  var CMDS = {
    farm: { name: "開墾", stat: "zheng", gold: 100,
      run: function (pv, ex) {
        var v = Math.round(ex.stats.zheng * 0.4 + Math.random() * 10);
        pv.farm = Math.min(pv.farmMax, pv.farm + v);
        return ex.name + "主持開墾，土地 +" + v;
      } },
    flood: { name: "治水", stat: "zheng", gold: 50,
      run: function (pv, ex) {
        var v = Math.round(ex.stats.zheng * 0.15 + 2);
        pv.flood = Math.min(100, pv.flood + v);
        return ex.name + "修築堤防，治水 +" + v;
      } },
    trade: { name: "商業", stat: "zhi", gold: 100,
      run: function (pv, ex) {
        var v = Math.round((ex.stats.zhi + ex.stats.zheng) * 0.15 + Math.random() * 8);
        pv.trade = Math.min(pv.tradeMax, pv.trade + v);
        return ex.name + "振興市集，商業 +" + v;
      } },
    give: { name: "施捨", stat: "mei", food: 500,
      run: function (pv, ex) {
        var v = Math.round(ex.stats.mei * 0.08 + 2);
        pv.loyal = Math.min(100, pv.loyal + v);
        return ex.name + "開倉施捨，民忠 +" + v;
      } },
    draft: { name: "徵兵", stat: "mei", gold: 200, food: 500,
      run: function (pv, ex) {
        var v = 500 + Math.round(ex.stats.mei * 10);
        pv.troops += v;
        pv.loyal = Math.max(0, pv.loyal - 3);
        pv.train = Math.max(0, pv.train - 5);
        return ex.name + "招募新兵 +" + v + "(民忠-3)";
      } },
    train: { name: "訓練", stat: "wu",
      run: function (pv, ex) {
        var v = Math.round(ex.stats.wu * 0.12 + 2);
        pv.train = Math.min(100, pv.train + v);
        return ex.name + "操演士卒，訓練 +" + v;
      } },
    search: { name: "搜索", stat: "mei",
      run: function (pv, ex, pid) {
        var S = State.get();
        var pool = freeOfficersIn(pid);
        if (!pool.length) return ex.name + "尋訪賢士，一無所獲";
        if (Math.random() < ex.stats.mei / 150 + 0.2) {
          var found = pool[0];
          S.off[found.name].fac = S.prov[pid].owner;
          S.off[found.name].loyal = 50 + Math.round(found.stats.yi / 4);
          return ex.name + "尋得賢士【" + found.name + "】出仕!";
        }
        return ex.name + "聽聞有賢士隱居於此，但未能尋得";
      } }
  };

  /* 執行指令。回傳 {ok, msg} */
  function exec(pid, cmdId) {
    var S = State.get(), pv = S.prov[pid], c = CMDS[cmdId];
    if (!pv || !c) return { ok: false, msg: "無此指令" };
    if (S.done[pid]) return { ok: false, msg: "本月已下過指令" };
    if ((c.gold || 0) > pv.gold) return { ok: false, msg: "金不足" };
    if ((c.food || 0) > pv.food) return { ok: false, msg: "糧不足" };
    var staff = officersIn(pid, pv.owner);
    if (!staff.length) return { ok: false, msg: "此州無武將可執行" };
    var ex = bestBy(staff, c.stat);
    pv.gold -= c.gold || 0;
    pv.food -= c.food || 0;
    var msg = c.run(pv, ex, pid);
    S.done[pid] = cmdId;
    return { ok: true, msg: msg };
  }

  window.Commands = { CMDS: CMDS, exec: exec, officersIn: officersIn, freeOfficersIn: freeOfficersIn };
})();
