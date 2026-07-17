/* court.js — 人事與外交: 賞賜 / 挖角 / 同盟 / 勸降。皆消耗該州當月指令。 */
(function () {
  "use strict";
  function $(id) { return document.getElementById(id); }
  function provData(pid) { return PROVINCES.find(function (p) { return p.id === pid; }); }
  function faceOf(o, px) {
    return Face.render(Object.assign({ wu: o.stats.wu, zhi: o.stats.zhi }, o.face), px, o.name);
  }
  function close() { $("modal").style.display = "none"; UI.refresh(); }
  function guard(pid) {
    var S = State.get();
    if (S.done[pid]) { Turn.log("⚠ 本月已下過指令"); UI.refresh(); return false; }
    return true;
  }
  function bestMei(pid) {
    var S = State.get();
    var staff = Commands.officersIn(pid, S.player);
    return staff.length ? Math.max.apply(null, staff.map(function (o) { return o.stats.mei; })) : 30;
  }

  /* ---- 賞賜: 金 200, 忠誠 +12~20 ---- */
  function reward(pid) {
    var S = State.get(), pv = S.prov[pid];
    if (!guard(pid)) return;
    if (pv.gold < 200) { Turn.log("⚠ 金不足 (需 200)"); UI.refresh(); return; }
    var staff = Commands.officersIn(pid, S.player).filter(function (o) { return o.name !== S.factions[S.player].ruler; });
    if (!staff.length) { Turn.log("⚠ 此州無可賞賜的部下"); UI.refresh(); return; }
    var h = '<div class="dlg"><h2>賞賜・' + provData(pid).name + '</h2><div class="dlg-offs">' +
      staff.map(function (o, i) {
        return '<div class="dlg-off pick" data-i="' + i + '">' + faceOf(o, 40) + o.name + "<small>忠" + S.off[o.name].loyal + "</small></div>";
      }).join("") + '</div><div class="dlg-btns"><button id="dlg-x">取消</button></div></div>';
    $("modal").innerHTML = h; $("modal").style.display = "flex";
    $("dlg-x").onclick = close;
    $("modal").querySelectorAll(".pick").forEach(function (n) {
      n.onclick = function () {
        var o = staff[+n.getAttribute("data-i")];
        pv.gold -= 200;
        var v = 12 + Math.round(Math.random() * 8);
        S.off[o.name].loyal = Math.min(100, S.off[o.name].loyal + v);
        S.done[pid] = "reward";
        Turn.log("賞賜【" + o.name + "】金帛, 忠誠 +" + v);
        close();
      };
    });
  }

  /* ---- 挖角: 金 500, 目標=鄰接敵州武將, 義理>=90 免疫 ---- */
  function poach(pid) {
    var S = State.get(), pv = S.prov[pid];
    if (!guard(pid)) return;
    if (pv.gold < 500) { Turn.log("⚠ 金不足 (需 500)"); UI.refresh(); return; }
    var pool = [];
    provData(pid).neighbors.forEach(function (nid) {
      var owner = S.prov[nid].owner;
      if (!owner || owner === S.player) return;
      Commands.officersIn(nid, owner).forEach(function (o) {
        if (o.name === S.factions[owner].ruler || o.stats.yi >= 90) return;
        pool.push({ o: o, pid: nid, owner: owner });
      });
    });
    if (!pool.length) { Turn.log("⚠ 鄰接敵州無可挖角之將"); UI.refresh(); return; }
    var h = '<div class="dlg"><h2>挖角・遣使密訪</h2><div class="dlg-offs">' +
      pool.map(function (t, i) {
        return '<div class="dlg-off pick" data-i="' + i + '">' + faceOf(t.o, 40) + t.o.name +
          "<small>" + provData(t.pid).name + "・忠" + S.off[t.o.name].loyal + "</small></div>";
      }).join("") + '</div><div class="dlg-btns"><button id="dlg-x">取消</button></div></div>';
    $("modal").innerHTML = h; $("modal").style.display = "flex";
    $("dlg-x").onclick = close;
    $("modal").querySelectorAll(".pick").forEach(function (n) {
      n.onclick = function () {
        var t = pool[+n.getAttribute("data-i")];
        pv.gold -= 500;
        S.done[pid] = "poach";
        var st = S.off[t.o.name];
        var p = (90 - st.loyal) / 90 * (0.4 + bestMei(pid) / 200);
        if (Math.random() < Math.max(0.05, p)) {
          st.fac = S.player; st.prov = pid; st.loyal = 45 + Math.round(t.o.stats.yi / 5);
          Turn.log("★【" + t.o.name + "】棄暗投明, 來投我軍!");
        } else {
          st.loyal = Math.min(100, st.loyal + 5);
          Turn.log("挖角【" + t.o.name + "】失敗, 反使其忠誠更堅");
        }
        close();
      };
    });
  }

  /* ---- 外交: 同盟(金1000) / 破盟 / 勸降(1州弱國) ---- */
  function diplomacy(pid) {
    var S = State.get(), pv = S.prov[pid];
    if (!guard(pid)) return;
    var others = Object.keys(S.factions).filter(function (f) { return f !== S.player && S.factions[f].alive; });
    if (!others.length) { Turn.log("⚠ 天下已無他國"); UI.refresh(); return; }
    var myTroops = Object.keys(S.prov).reduce(function (s, p) { return s + (S.prov[p].owner === S.player ? S.prov[p].troops : 0); }, 0);
    var h = '<div class="dlg"><h2>外交・遣使</h2><div class="dlg-offs" style="flex-direction:column;">' +
      others.map(function (f, i) {
        var key = [S.player, f].sort().join("|");
        var fprovs = Object.keys(S.prov).filter(function (p) { return S.prov[p].owner === f; });
        var ftroops = fprovs.reduce(function (s, p) { return s + S.prov[p].troops; }, 0);
        var canSurr = fprovs.length === 1 && ftroops < myTroops * 0.25;
        var row = '<div class="dlg-off" style="flex-direction:row;gap:10px;width:100%;justify-content:space-between;"><span>' +
          S.factions[f].name + "<small>　" + fprovs.length + "州</small></span><span>";
        if (S.ally[key]) row += '<button class="dip" data-a="break" data-f="' + f + '">破盟</button>';
        else row += '<button class="dip" data-a="ally" data-f="' + f + '"' + (pv.gold < 1000 ? " disabled" : "") + ">同盟(金1000)</button>";
        if (canSurr) row += ' <button class="dip" data-a="surr" data-f="' + f + '">勸降</button>';
        return row + "</span></div>";
      }).join("") + '</div><div class="dlg-btns"><button id="dlg-x">取消</button></div></div>';
    $("modal").innerHTML = h; $("modal").style.display = "flex";
    $("dlg-x").onclick = close;
    $("modal").querySelectorAll(".dip").forEach(function (b) {
      b.onclick = function () {
        var f = b.getAttribute("data-f"), act = b.getAttribute("data-a");
        var key = [S.player, f].sort().join("|");
        S.done[pid] = "diplomacy";
        if (act === "break") {
          delete S.ally[key];
          Turn.log("與【" + S.factions[f].name + "】斷盟!");
        } else if (act === "ally") {
          pv.gold -= 1000;
          if (Math.random() < 0.3 + bestMei(pid) / 250) {
            S.ally[key] = true;
            Turn.log("★ 與【" + S.factions[f].name + "】締結同盟!");
          } else Turn.log("【" + S.factions[f].name + "】拒絕了同盟提議");
        } else if (act === "surr") {
          if (Math.random() < 0.25 + bestMei(pid) / 300) {
            Object.keys(S.prov).forEach(function (p) { if (S.prov[p].owner === f) S.prov[p].owner = S.player; });
            window.OFFICERS.forEach(function (o) {
              if (S.off[o.name].fac === f && !S.off[o.name].dead) {
                S.off[o.name].fac = S.player;
                S.off[o.name].loyal = 50 + Math.round(o.stats.yi / 5);
              }
            });
            S.factions[f].alive = false;
            Turn.log("★★【" + S.factions[f].name + "】舉國來降!");
          } else Turn.log("【" + S.factions[f].name + "】嚴詞拒降");
        }
        close();
      };
    });
  }

  window.Court = { reward: reward, poach: poach, diplomacy: diplomacy };
})();
