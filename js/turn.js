/* turn.js — 回合流程: 玩家下令(UI) → AI 行動 → 月結算 → 下月 */
(function () {
  "use strict";
  window.BALANCE_VERSION = "v2";

  function log(msg) {
    var S = State.get();
    var line = S.year + "年" + S.month + "月　" + msg;
    S.log.unshift(line);
    if (S.log.length > 120) S.log.pop();
    /* 戰局實錄: 完整保存大事(供演義生成), 濾掉戰術雜訊與警告 */
    var noise = (msg.indexOf("〔戰〕") === 0 && msg.indexOf("單挑") < 0 && msg.indexOf("被俘") < 0) ||
                msg.indexOf("⚠") === 0;
    if (!noise) (S.chronicle = S.chronicle || []).push(line);
  }
  /* 只進實錄不進畫面日誌 (開局佈局等) */
  function chron(msg) {
    var S = State.get();
    (S.chronicle = S.chronicle || []).push(msg);
  }

  function allied(a, b) {
    var S = State.get();
    if (!a || !b) return false;
    return !!(S.ally || {})[[a, b].sort().join("|")];
  }

  /* --- AI: 內政 + 擴張。回傳對玩家的互動攻勢 (至多一場) 或 null --- */
  function aiTurn() {
    var S = State.get();
    S.ally = S.ally || {};
    var interactive = null;

    /* 擴張: 每勢力每月至多一次, 兵糧優勢 >1.5 才動手 */
    Object.keys(S.factions).forEach(function (fid) {
      if (fid === S.player || !S.factions[fid].alive) return;
      if (Math.random() > 0.65) return; /* 節奏閘 */
      var provs = Object.keys(S.prov).filter(function (p) { return S.prov[p].owner === fid; });
      for (var i = 0; i < provs.length; i++) {
        var pid = provs[i], pv = S.prov[pid];
        if (Commands.remaining(pid) <= 0 || pv.troops < 6000 || pv.train < 50 || !Commands.officersIn(pid, fid).length) continue;
        var pd = PROVINCES.find(function (x) { return x.id === pid; });
        var target = null, tScore = 1e18;
        pd.neighbors.forEach(function (nid) {
          var tv = S.prov[nid];
          if (tv.owner === fid || allied(fid, tv.owner)) return;
          var def = tv.troops * (0.5 + tv.train / 200) * 1.25 + 200;
          var atk = pv.troops * 0.7 * (0.5 + pv.train / 200);
          var need = tv.owner ? 1.5 : 1.2; /* 打中立門檻較低, 加快前期圈地 */
          if (atk > def * need && def < tScore) { tScore = def; target = nid; }
        });
        if (!target) continue;
        Commands.consume(pid, "march");
        if (S.prov[target].owner === S.player && !interactive &&
            Commands.officersIn(target, S.player).length) {
          interactive = { from: pid, target: target, fac: fid };
        } else {
          Battle.autoResolve(pid, target, fid);
        }
        break;
      }
    });

    /* 內政: 依預算(駐將數,上限3)逐道下令, 優先序同一條鏈 */
    Object.keys(S.prov).forEach(function (pid) {
      var pv = S.prov[pid];
      if (!pv.owner || pv.owner === S.player) return;
      for (var k = 0; k < 3 && Commands.remaining(pid) > 0; k++) {
        var used = Commands.usedList(pid);
        var cmd = null;
        var troopCap = Math.min(12000, pv.farm * 12); /* 糧產養得起才徵 */
        if (pv.loyal < 50 && pv.food >= 500) cmd = "give";
        else if (pv.food < pv.troops * 0.4 && pv.gold >= 100) cmd = "farm";
        else if (used.indexOf("draft") < 0 && pv.troops < troopCap && pv.gold >= 200 && pv.food >= 1000 && pv.loyal > 55) cmd = "draft";
        else if (S.month === 4 && pv.flood < 50 && pv.gold >= 50) cmd = "flood";
        else if (pv.train < 70) cmd = "train";
        else if (pv.gold >= 100) cmd = (pv.farm / pv.farmMax <= pv.trade / pv.tradeMax) ? "farm" : "trade";
        else cmd = "search";
        if (!Commands.exec(pid, cmd).ok) break;
      }
    });
    return interactive;
  }

  /* --- 月結算 --- */
  function settle() {
    var S = State.get();
    Object.keys(S.prov).forEach(function (pid) {
      var pv = S.prov[pid], pd = PROVINCES.find(function (x) { return x.id === pid; });
      var mine = pv.owner === S.player;

      if (S.month === 1 && pv.owner) {
        var tax = Math.round(pv.trade * 3);
        pv.gold += tax;
        if (mine) log("【" + pd.name + "】收稅金 " + tax);
      }
      if (S.month === 7 && pv.owner) {
        var factor = 1, note = "";
        var r = Math.random();
        if (r < 0.08) { factor = 0.5; note = "(蝗災!)"; }
        else if (r > 0.92) { factor = 1.3; note = "(豐收!)"; }
        var crop = Math.round(pv.farm * 8 * factor);
        pv.food += crop;
        if (mine) log("【" + pd.name + "】秋收糧 " + crop + note);
      }
      if (S.month === 8 && pv.owner && pv.flood < 40 && Math.random() < 0.25) {
        pv.farm = Math.round(pv.farm * 0.9);
        pv.loyal = Math.max(0, pv.loyal - 5);
        if (mine) log("【" + pd.name + "】洪水! 土地受損, 民忠下降");
      }
      /* 兵糧消耗 */
      if (pv.owner) {
        var eat = Math.round(pv.troops * 0.05);
        pv.food -= eat;
        if (pv.food < 0) {
          pv.food = 0;
          pv.troops = Math.round(pv.troops * 0.85);
          pv.loyal = Math.max(0, pv.loyal - 4);
          if (mine) log("【" + pd.name + "】糧盡! 士卒逃散");
        }
      }
      /* 民變 */
      if (pv.owner && pv.loyal < 25 && Math.random() < 0.15) {
        if (mine || true) log("【" + pd.name + "】民變四起, " + (S.factions[pv.owner] ? S.factions[pv.owner].name : "") + "失去此州!");
        pv.owner = null;
        pv.troops = Math.round(pv.troops * 0.5);
      }
    });

    /* 史實武將死亡 */
    window.OFFICERS.forEach(function (o) {
      var st = S.off[o.name];
      if (!st || st.dead || !o.death) return;
      if (S.year > o.death) {
        st.dead = true;
        if (st.fac) {
          log("【訃】" + o.name + "病逝");
          var fac = S.factions[st.fac];
          if (fac && fac.ruler === o.name) succession(st.fac);
        }
      }
    });
  }

  /* 君主死亡 → 魅力最高者繼位; 無人 → 勢力瓦解 (M4 再做正式繼承) */
  function succession(fid) {
    var S = State.get();
    var heirs = window.OFFICERS.filter(function (o) {
      var st = S.off[o.name];
      return st && !st.dead && st.fac === fid;
    }).sort(function (a, b) { return b.stats.mei - a.stats.mei; });
    if (heirs.length) {
      S.factions[fid].ruler = heirs[0].name;
      S.factions[fid].name = heirs[0].name + "軍";
      S.off[heirs[0].name].loyal = 100;
      log("【" + heirs[0].name + "】繼立為主公");
    } else {
      S.factions[fid].alive = false;
      Object.keys(S.prov).forEach(function (pid) {
        if (S.prov[pid].owner === fid) S.prov[pid].owner = null;
      });
      log("一方勢力就此覆滅");
    }
  }

  function nextMonth(cb) {
    var S = State.get();
    function cont() {
      settle();
      S.month++;
      if (S.month > 12) { S.month = 1; S.year++; }
      S.done = {};
      State.save();
      if (!S.gameOver && !Object.keys(S.prov).some(function (p) { return S.prov[p].owner === S.player; })) {
        log("☠☠ 你已失去所有州郡……天下再無你的立足之地 (遊戲結束)");
        S.gameOver = true;
        if (cb) cb();
        UI.endScreen(false);
        return;
      }
      if (cb) cb();
    }
    var atk = aiTurn();
    if (atk) Battle.startDefense(atk, cont);
    else cont();
  }

  window.Turn = { nextMonth: nextMonth, log: log, chron: chron, allied: allied };
})();
