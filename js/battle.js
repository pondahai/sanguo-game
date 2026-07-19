/* battle.js — 方格戰棋。出征/移動指令、戰場引擎、單挑、火計、佔領。
 * 戰場 13×9,一日一回合,30 日攻不下撤退。地形由州 id hash 確定性生成。 */
(function () {
  "use strict";
  var GW = 13, GH = 9;
  var B = null; /* 戰鬥狀態 */

  function $(id) { return document.getElementById(id); }
  function provData(pid) { return PROVINCES.find(function (p) { return p.id === pid; }); }
  function faceOf(o, px) {
    if (!o) return Face.render({ color: "black", wu: 50, zhi: 40, beard: 0, hat: "topknot" }, px, "民兵");
    return Face.render(Object.assign({ wu: o.stats.wu, zhi: o.stats.zhi }, o.face), px, o.name);
  }
  function uName(u) { return u.off ? u.off.name : "民兵"; }
  function uWu(u) { return u.off ? u.off.stats.wu : 50; }
  function uZhi(u) { return u.off ? u.off.stats.zhi : 30; }

  /* ================= 出征 / 移動 對話框 ================= */
  function pickTargets(pid, wantEnemy) {
    var S = State.get();
    return provData(pid).neighbors.filter(function (nid) {
      var own = S.prov[nid].owner;
      return wantEnemy ? own !== S.player : own === S.player;
    });
  }

  function armyDialog(pid, isMarch) {
    var S = State.get(), pv = S.prov[pid];
    if (Commands.remaining(pid) <= 0) { Turn.log("⚠ 本月指令已用盡"); UI.refresh(); return; }
    var targets = pickTargets(pid, isMarch);
    if (!targets.length) { Turn.log("⚠ 無" + (isMarch ? "可出兵的鄰州" : "相鄰我方州郡")); UI.refresh(); return; }
    var staff = Commands.officersIn(pid, pv.owner);
    if (isMarch && !staff.length) { Turn.log("⚠ 此州無武將領兵"); UI.refresh(); return; }

    var h = '<div class="dlg"><h2>' + (isMarch ? "出征" : "移動") + "・" + provData(pid).name + "</h2>";
    h += '<label>目標: <select id="dlg-target">' + targets.map(function (t) {
      var o = S.prov[t].owner;
      return '<option value="' + t + '">' + provData(t).name + "(" + (o ? S.factions[o].name : "中立") + ")</option>";
    }).join("") + "</select></label>";
    h += '<div class="dlg-offs">' + staff.map(function (o, i) {
      var on = i < 5;
      return '<label class="dlg-off' + (on ? " sel" : " dim") + '"><input type="checkbox" data-i="' + i + '"' + (on ? " checked" : "") + ">" +
        faceOf(o, 40) + o.name + '<small>武' + o.stats.wu + "</small></label>";
    }).join("") + "</div>";
    h += '<label>兵力 <input type="range" id="dlg-troops" value="' + Math.min(pv.troops, 15000) + '" min="0" max="' + pv.troops + '" step="100"><b id="dlg-troops-v"></b>/' + pv.troops + "</label>";
    h += '<label>帶糧 <input type="range" id="dlg-food" value="' + Math.min(pv.food, 3000) + '" min="0" max="' + pv.food + '" step="100"><b id="dlg-food-v"></b>/' + pv.food + "</label>";
    h += '<div class="dlg-btns"><button id="dlg-go">' + (isMarch ? "進軍!" : "移動") + '</button><button id="dlg-x">取消</button></div></div>';
    $("modal").innerHTML = h; $("modal").style.display = "flex";
    /* 選將高亮/黯淡 */
    $("modal").querySelectorAll(".dlg-off input").forEach(function (c) {
      c.onchange = function () {
        c.parentNode.className = "dlg-off" + (c.checked ? " sel" : " dim");
      };
    });
    /* 拉桿即時顯示數值 */
    ["troops", "food"].forEach(function (k) {
      var r = $("dlg-" + k), v = $("dlg-" + k + "-v");
      v.textContent = r.value;
      r.oninput = function () { v.textContent = r.value; };
    });
    $("dlg-x").onclick = function () { $("modal").style.display = "none"; };
    $("dlg-go").onclick = function () {
      var sel = [];
      $("modal").querySelectorAll("input[type=checkbox]").forEach(function (c) {
        if (c.checked) sel.push(staff[+c.getAttribute("data-i")]);
      });
      if (isMarch && (!sel.length || sel.length > 5)) { Turn.log("⚠ 出征需 1~5 名武將"); return; }
      var troops = Math.min(pv.troops, Math.max(0, +$("dlg-troops").value || 0));
      var food = Math.min(pv.food, Math.max(0, +$("dlg-food").value || 0));
      if (isMarch && troops < 100) { Turn.log("⚠ 兵力太少"); return; }
      var target = $("dlg-target").value;
      pv.troops -= troops; pv.food -= food;
      Commands.consume(pid, isMarch ? "march" : "move");
      $("modal").style.display = "none";
      if (isMarch) start(pid, target, sel, troops, food, {});
      else doMove(pid, target, sel, troops, food);
    };
  }

  function doMove(from, to, offs, troops, food) {
    var S = State.get(), tv = S.prov[to];
    tv.troops += troops; tv.food += food;
    offs.forEach(function (o) { S.off[o.name].prov = to; });
    Turn.log("【" + provData(from).name + "】" + (offs.length ? offs.map(function (o) { return o.name; }).join("、") + "率" : "") + "兵 " + troops + " 移往【" + provData(to).name + "】");
    UI.refresh();
  }

  /* ================= 戰場生成 ================= */
  function makeTerrain(pid) {
    var seed = State.h32(pid), t = [];
    for (var y = 0; y < GH; y++) { t.push(new Array(GW).fill(0)); }
    if (seed % 3 === 0) { /* 河流帶渡口 */
      var col = 5 + (seed >>> 4) % 3;
      for (var y2 = 0; y2 < GH; y2++) t[y2][col] = 2;
      t[(seed >>> 6) % GH][col] = 0;
      t[((seed >>> 9) % GH)][col] = 0;
    }
    var n = 8 + (seed >>> 3) % 5;
    for (var i = 0; i < n; i++) {
      var x = 2 + (seed >>> (i * 2) & 1023) % (GW - 3), y3 = (seed >>> (i * 3 + 5) & 1023) % GH;
      if (t[y3][x] === 0 && !(x === 10 && y3 === 4)) t[y3][x] = 1;
    }
    t[4][10] = 3; /* 城 */
    return t;
  }

  function start(from, target, offs, troops, food, opts) {
    var S = State.get();
    var atkFac = opts.atkFac || S.player;
    var defFac = S.prov[target].owner;
    var defStaff = defFac ? Commands.officersIn(target, defFac) : [];
    B = {
      from: from, prov: target, atk: atkFac, def: defFac,
      day: 1, terrain: makeTerrain(target), fire: {}, units: [], sel: null, mode: null,
      atkFood: food,
      pSide: atkFac === S.player ? "atk" : "def",
      onEnd: opts.onEnd || null
    };
    var per = Math.floor(troops / offs.length);
    offs.forEach(function (o, i) {
      B.units.push({ off: o, side: "atk", troops: per, train: S.prov[from].train, x: 0, y: 1 + i * Math.floor((GH - 2) / Math.max(1, offs.length - 1) || 1), acted: false });
    });
    /* 守軍: 有武將分兵駐防; 中立/無將 = 民兵 */
    var dTroops = S.prov[target].troops;
    var dUnits = defStaff.slice(0, 5);
    if (!dUnits.length) dUnits = [null, null].slice(0, dTroops > 3000 ? 2 : 1);
    var dper = Math.floor(dTroops / dUnits.length);
    dUnits.forEach(function (o, i) {
      B.units.push({ off: o, side: "def", troops: dper, train: S.prov[target].train, x: 9 - (i % 2), y: 3 + i, acted: false });
    });
    S.prov[target].troops = 0; /* 全軍上陣, 敗則歸還存活數 */
    Turn.log("【" + provData(from).name + "】" + offs.map(function (o) { return o.name; }).join("、") + " 率 " + troops + " 兵進攻【" + provData(target).name + "】!");
    render();
    $("battle").style.display = "flex";
  }

  /* ================= 渲染 ================= */
  /* 三國志II風地形: 16色母盤 + 棋盤格抖色 */
  var TSTYLE = {
    0: Face.ditherCSS("grn", "dgrn"),
    1: Face.ditherCSS("brn", "dbrn"),
    2: Face.ditherCSS("blu", "cyn"),
    3: Face.ditherCSS("yel", "brn")
  };
  var TNAME = { 0: "平地", 1: "山", 2: "河", 3: "城" };

  function unitAt(x, y) {
    return B.units.find(function (u) { return u.x === x && u.y === y; });
  }
  function dist(a, b) { return Math.abs(a.x - b.x) + Math.abs(a.y - b.y); }

  function moveSet(u) {
    var res = {}, q = [{ x: u.x, y: u.y, c: 0 }];
    while (q.length) {
      var n = q.shift();
      [[0, 1], [0, -1], [1, 0], [-1, 0]].forEach(function (d) {
        var x = n.x + d[0], y = n.y + d[1];
        if (x < 0 || x >= GW || y < 0 || y >= GH) return;
        var tt = B.terrain[y][x];
        if (tt === 2) return;
        var c = n.c + (tt === 1 ? 2 : 1);
        if (c > 2 || unitAt(x, y)) return;
        var k = x + "," + y;
        if (res[k] !== undefined && res[k] <= c) return;
        res[k] = c;
        q.push({ x: x, y: y, c: c });
      });
    }
    return res;
  }

  function render() {
    var S = State.get();
    var h = '<div class="bt-top"><b>' + provData(B.prov).name + "之戰</b><span>第 " + B.day +
      ' 日 / 30</span><span>攻方糧 ' + B.atkFood + '</span><span class="spacer"></span><button id="bt-end">結束本日</button><button id="bt-flee">' +
      (B.pSide === "atk" ? "撤退" : "棄城") + "</button></div>";
    h += '<div class="bt-grid" style="grid-template-columns:repeat(' + GW + ',1fr)">';
    var ms = B.sel && !B.sel.acted && B.mode === "move" ? moveSet(B.sel) : {};
    for (var y = 0; y < GH; y++) for (var x = 0; x < GW; x++) {
      var u = unitAt(x, y), tt = B.terrain[y][x], k = x + "," + y;
      var cls = "cell", style = TSTYLE[tt];
      if (B.fire[k]) style = Face.ditherCSS("red", "org");
      if (ms[k] !== undefined) cls += " mv";
      if (B.mode === "fire" && B.sel && dist(B.sel, { x: x, y: y }) <= 2 && !(x === B.sel.x && y === B.sel.y)) cls += " fr";
      h += '<div class="' + cls + '" data-x="' + x + '" data-y="' + y + '" style="' + style + '" title="' + TNAME[tt] + '">';
      if (tt === 3) h += '<span class="city">城</span>';
      if (u) {
        var selc = u === B.sel ? " usel" : "";
        h += '<div class="unit ' + u.side + selc + (u.acted ? " done" : "") + '">' + faceOf(u.off, 30) +
          '<small>' + uName(u) + "</small><i>" + u.troops + "</i></div>";
      }
      h += "</div>";
    }
    h += "</div>";
    /* 底欄: 選中單位操作 */
    h += '<div class="bt-bottom">';
    if (B.sel && B.sel.side === B.pSide) {
      h += "<b>" + uName(B.sel) + "</b> 兵" + B.sel.troops + (B.sel.acted ? "(已行動)" : "");
      if (!B.sel.acted) {
        h += ' <button data-m="move">移動</button><button data-m="fire">火計</button><button data-m="wait">待機</button>';
        h += '<small>　移動後點格子; 攻擊/單挑直接點相鄰敵軍</small>';
      }
    } else {
      h += '<small>點選我方部隊下令。點相鄰敵軍 = 攻擊選項。</small>';
    }
    h += "</div>";
    h += '<div id="bt-log">' + btLogHtml() + "</div>";
    $("battle").innerHTML = h;
    var lg = $("bt-log"); lg.scrollTop = lg.scrollHeight;

    $("bt-end").onclick = endDay;
    $("bt-flee").onclick = function () { finish(B.pSide === "def", true); };
    $("battle").querySelectorAll(".bt-bottom button").forEach(function (b) {
      b.onclick = function () {
        if (!B) return;
        var m = b.getAttribute("data-m");
        if (m === "wait") { if (B.sel) B.sel.acted = true; B.sel = null; B.mode = null; }
        else B.mode = m;
        render();
      };
    });
    $("battle").querySelectorAll(".cell").forEach(function (c) {
      c.onclick = function () { cellClick(+c.getAttribute("data-x"), +c.getAttribute("data-y")); };
    });
  }

  function cellClick(x, y) {
    if (!B) return; /* 戰鬥已結束的殘留 DOM 點擊 */
    var u = unitAt(x, y), k = x + "," + y;
    if (B.mode === "fire" && B.sel && !B.sel.acted && dist(B.sel, { x: x, y: y }) <= 2) {
      var p = uZhi(B.sel) / 130 + 0.15;
      if (Math.random() < p) { B.fire[k] = 3; blog(uName(B.sel) + "放火成功! 烈焰燃起"); }
      else blog(uName(B.sel) + "放火失敗");
      B.sel.acted = true; B.sel = null; B.mode = null; render(); return;
    }
    if (u && u.side === B.pSide) { B.sel = u; B.mode = "move"; render(); return; }
    if (u && u.side !== B.pSide && B.sel && !B.sel.acted && dist(B.sel, u) === 1) { attackMenu(B.sel, u); return; }
    if (!u && B.sel && !B.sel.acted && B.mode === "move") {
      var ms = moveSet(B.sel);
      if (ms[k] !== undefined) { B.sel.x = x; B.sel.y = y; B.sel.acted = true; B.sel = null; render(); }
      return;
    }
  }

  /* ================= 戰鬥計算 ================= */
  function blog(msg) {
    Turn.log("〔戰〕" + msg);
    /* 戰場內事件紀錄, 供陣中回查 */
    if (B) {
      (B.log = B.log || []).push("第" + B.day + "日　" + msg);
      var el = $("bt-log");
      if (el) { el.innerHTML = btLogHtml(); el.scrollTop = el.scrollHeight; }
    }
  }
  function btLogHtml() {
    return (B.log || []).map(function (l) { return "<div>" + l + "</div>"; }).join("");
  }

  function dmg(a, d) {
    var v = Math.round(a.troops * (0.15 + uWu(a) * 0.001) * (0.5 + a.train / 200));
    var tt = B.terrain[d.y][d.x];
    if (tt === 1 || tt === 3) v = Math.round(v * 0.6);
    return Math.max(50, v);
  }

  function applyDmg(u, v) {
    u.troops -= v;
    if (u.troops <= 200) removeUnit(u, true);
  }

  function removeUnit(u, routed) {
    var S = State.get();
    B.units = B.units.filter(function (x) { return x !== u; });
    if (u.off) {
      if (routed && Math.random() < 0.4) {
        capture(u.off, u.side === "atk" ? B.def : B.atk);
      } else {
        /* 逃回: 攻方回出發州, 守方留原州 */
        S.off[u.off.name].prov = u.side === "atk" ? B.from : B.prov;
        blog(u.off.name + "軍潰散, 隻身逃走");
      }
    } else blog("民兵潰散");
    checkEnd();
  }

  var pendingCaptives = [];
  function capture(off, byFac) {
    blog(off.name + "被俘!");
    pendingCaptives.push({ off: off, by: byFac });
  }

  function attackMenu(a, d) {
    var canDuel = !!d.off;
    var h = '<div class="dlg"><h2>攻擊 ' + uName(d) + "</h2><div class=\"dlg-btns\">" +
      '<button id="am-atk">突擊</button>' +
      (canDuel ? '<button id="am-duel">單挑!</button>' : "") +
      '<button id="am-x">取消</button></div></div>';
    $("modal").innerHTML = h; $("modal").style.display = "flex";
    $("am-x").onclick = function () { $("modal").style.display = "none"; };
    $("am-atk").onclick = function () {
      $("modal").style.display = "none";
      var v = dmg(a, d);
      blog(uName(a) + "突擊" + uName(d) + ", 殲敵 " + v);
      applyDmg(d, v);
      /* applyDmg 可能終結戰鬥(B=null), 之後全部要防 */
      if (B && B.units.indexOf(d) >= 0) applyDmg(a, Math.round(dmg(d, a) * 0.5)); /* 反擊 */
      if (B) { a.acted = true; B.sel = null; B.mode = null; render(); }
    };
    if (canDuel) $("am-duel").onclick = function () {
      $("modal").style.display = "none";
      duel(a, d);
    };
  }

  /* ================= 單挑 (臉譜對峙) ================= */
  function duel(a, d) {
    var ao = a.off, dd = d.off;
    /* 敵將武力低太多會拒戰 */
    if (dd.stats.wu + 12 < ao.stats.wu && Math.random() < 0.6) {
      blog(dd.name + "避而不戰!");
      a.acted = true; B.sel = null; render(); return;
    }
    var hp = { a: 100, d: 100 };
    var h = '<div class="duel"><h2>單 挑</h2><div class="duel-stage">' +
      '<div class="dfig" id="df-a">' + faceOf(ao, 130) + "<b>" + ao.name + '</b><div class="hp"><i id="hp-a" style="width:100%"></i></div></div>' +
      '<span class="vs">VS</span>' +
      '<div class="dfig" id="df-d">' + faceOf(dd, 130) + "<b>" + dd.name + '</b><div class="hp"><i id="hp-d" style="width:100%"></i></div></div>' +
      '</div><div class="duel-log" id="duel-log">' + ao.name + " 拍馬而出, 直取 " + dd.name + "!</div></div>";
    $("modal").innerHTML = h; $("modal").style.display = "flex";
    var round = 0;
    var iv = setInterval(function () {
      round++;
      var ra = ao.stats.wu * (0.7 + Math.random() * 0.6), rd = dd.stats.wu * (0.7 + Math.random() * 0.6);
      var loser = ra >= rd ? "d" : "a";
      var hit = Math.round(Math.abs(ra - rd) / 2) + 8;
      hp[loser] -= hit;
      $("hp-" + loser).style.width = Math.max(0, hp[loser]) + "%";
      var fig = $("df-" + loser);
      fig.classList.add("shake");
      setTimeout(function () { fig.classList.remove("shake"); }, 350);
      $("duel-log").textContent = "第" + round + "合: " + (loser === "d" ? ao.name + "一招搶攻, " + dd.name + "險險避過!" : dd.name + "反手一擊, " + ao.name + "招架不住!");
      if (hp.a <= 0 || hp.d <= 0 || round >= 8) {
        clearInterval(iv);
        var winU = hp.a >= hp.d ? a : d, loseU = winU === a ? d : a;
        var ko = hp[winU === a ? "d" : "a"] <= 0;
        $("df-" + (winU === a ? "d" : "a")).classList.add("fall");
        $("duel-log").textContent = (winU === a ? ao.name : dd.name) + " 勝!" + (ko ? " 將 " + (loseU === a ? ao.name : dd.name) + " 斬落馬下!" : "");
        setTimeout(function () {
          $("modal").style.display = "none";
          blog("單挑: " + uName(winU) + " 勝 " + uName(loseU) + (ko ? "(生擒!)" : ""));
          if (ko) {
            /* 斬落馬下 = 必定被俘, 不走潰散隨機逃脫 */
            B.units = B.units.filter(function (x) { return x !== loseU; });
            capture(loseU.off, winU.side === "atk" ? B.atk : B.def);
            blog(uName(loseU) + "所部潰散");
            checkEnd();
          } else {
            applyDmg(loseU, Math.round(loseU.troops * 0.3));
          }
          if (B) { a.acted = true; B.sel = null; B.mode = null; render(); }
        }, 1400);
      }
    }, 750);
  }

  /* ================= 回合推進 / AI / 結束 ================= */
  function endDay() {
    if (!B) return;
    /* AI 方 (玩家的對面) */
    var aiSide = B.pSide === "atk" ? "def" : "atk";
    B.units.filter(function (u) { return u.side === aiSide; }).forEach(function (u) {
      if (!B) return;
      var foes = B.units.filter(function (x) { return x.side !== aiSide; });
      if (!foes.length) return;
      var near = foes.reduce(function (a, b) { return dist(u, b) < dist(u, a) ? b : a; });
      if (dist(u, near) === 1) {
        var v = dmg(u, near);
        blog(uName(u) + "攻擊" + uName(near) + ", 殲敵 " + v);
        applyDmg(near, v);
      } else if (aiSide === "atk" || dist(u, near) <= 4 || B.day > 6) {
        /* AI 當攻方時永遠推進; 當守方時近敵或開戰數日後才出擊 */
        var ms = moveSet(u), best = null, bd = dist(u, near);
        Object.keys(ms).forEach(function (k) {
          var p = k.split(",").map(Number), dd2 = Math.abs(p[0] - near.x) + Math.abs(p[1] - near.y);
          if (dd2 < bd) { bd = dd2; best = p; }
        });
        if (best) { u.x = best[0]; u.y = best[1]; }
      }
    });
    if (!B) return;
    /* 火焰傷害與熄滅 */
    Object.keys(B.fire).forEach(function (k) {
      var p = k.split(",").map(Number), u = unitAt(p[0], p[1]);
      if (u) { blog(uName(u) + "陷於火場!"); applyDmg(u, Math.round(u.troops * 0.12)); }
      if (B) { B.fire[k]--; if (B.fire[k] <= 0) delete B.fire[k]; }
    });
    if (!B) return;
    /* 兵糧 */
    var atkT = B.units.filter(function (u) { return u.side === "atk"; });
    B.atkFood -= Math.ceil(atkT.reduce(function (s, u) { return s + u.troops; }, 0) * 0.02);
    if (B.atkFood <= 0) {
      B.atkFood = 0;
      atkT.forEach(function (u) { u.troops = Math.round(u.troops * 0.88); });
      blog("我軍糧盡! 士卒饑潰");
      atkT.filter(function (u) { return u.troops <= 200; }).forEach(function (u) { removeUnit(u, false); });
    }
    if (!B) return;
    B.day++;
    B.units.forEach(function (u) { u.acted = false; });
    B.sel = null; B.mode = null;
    if (B.day > 30) { finish(false, true); return; }
    checkEnd();
    if (B) render();
  }

  function checkEnd() {
    if (!B) return;
    var a = B.units.some(function (u) { return u.side === "atk"; });
    var d = B.units.some(function (u) { return u.side === "def"; });
    if (!d) finish(true, false);
    else if (!a) finish(false, false);
  }

  function finish(win, retreatOrTimeout) {
    var S = State.get(), pid = B.prov;
    var pv = S.prov[pid], pd = provData(pid);
    var atkLeft = B.units.filter(function (u) { return u.side === "atk"; });
    var defLeft = B.units.filter(function (u) { return u.side === "def"; });
    if (win) {
      var oldOwner = B.def;
      pv.owner = B.atk;
      pv.loyal = Math.max(10, pv.loyal - 15);
      pv.troops = atkLeft.reduce(function (s, u) { return s + u.troops; }, 0);
      pv.food += B.atkFood;
      atkLeft.forEach(function (u) { if (u.off) S.off[u.off.name].prov = pid; });
      Turn.log("★【" + pd.name + "】攻陷! " + S.factions[B.atk].name + "佔領此州");
      if (oldOwner && !Object.keys(S.prov).some(function (p) { return S.prov[p].owner === oldOwner; })) {
        S.factions[oldOwner].alive = false;
        window.OFFICERS.forEach(function (o) {
          if (S.off[o.name].fac === oldOwner && !S.off[o.name].dead) S.off[o.name].fac = null;
        });
        Turn.log("☠【" + S.factions[oldOwner].name + "】勢力覆滅!");
      }
    } else {
      /* 攻方敗/撤: 存活攻軍回出發州, 守軍回城 */
      var back = atkLeft.reduce(function (s, u) { return s + u.troops; }, 0);
      S.prov[B.from].troops += back;
      S.prov[B.from].food += B.atkFood;
      atkLeft.forEach(function (u) { if (u.off) S.off[u.off.name].prov = B.from; });
      pv.troops = defLeft.reduce(function (s, u) { return s + u.troops; }, 0) || pv.troops;
      Turn.log("【" + pd.name + "】攻略失敗, " + (retreatOrTimeout ? "我軍撤退" : "全軍潰敗") + "(殘兵 " + back + ")");
    }
    var onEnd = B.onEnd;
    B = null;
    $("battle").style.display = "none";
    $("battle").innerHTML = ""; /* 清掉殘留 DOM, 杜絕舊 handler 誤觸 */
    processCaptives(function () {
      var winAll = Object.keys(S.prov).every(function (p) { return S.prov[p].owner === S.player; });
      if (winAll) { Turn.log("★★★ 天下歸一! 你統一了全境! ★★★"); S.gameOver = true; }
      State.save();
      if (onEnd) onEnd(); else UI.refresh();
      if (winAll) UI.endScreen(true);
    });
  }

  /* ================= 自動戰結算 (AI vs AI / 無將防守) ================= */
  function power(troops, train, wu) {
    return troops * (0.5 + train / 200) * (1 + wu / 200);
  }
  function bestWuIn(pid, fac) {
    var staff = fac ? Commands.officersIn(pid, fac) : [];
    return staff.length ? Math.max.apply(null, staff.map(function (o) { return o.stats.wu; })) : 50;
  }
  function autoResolve(from, target, atkFac) {
    var S = State.get(), fv = S.prov[from], tv = S.prov[target];
    var defFac = tv.owner;
    var troops = Math.round(fv.troops * 0.7), food = Math.round(fv.food * 0.5);
    if (troops < 500) return;
    fv.troops -= troops; fv.food -= food;
    var ap = power(troops, fv.train, bestWuIn(from, atkFac));
    var dp = power(tv.troops, tv.train, bestWuIn(target, defFac)) * 1.25 + 200;
    var atkOffs = Commands.officersIn(from, atkFac).slice(0, 5);
    var defOffs = defFac ? Commands.officersIn(target, defFac) : [];
    if (ap > dp) {
      var surv = Math.round(troops * (1 - 0.5 * dp / ap));
      var oldOwner = tv.owner;
      tv.owner = atkFac; tv.troops = surv; tv.food += food;
      tv.loyal = Math.max(10, tv.loyal - 15);
      atkOffs.forEach(function (o) { S.off[o.name].prov = target; });
      /* 敗方武將四散: 逃往本勢力他州, 無處可逃則在野 */
      defOffs.forEach(function (o) {
        var home = Object.keys(S.prov).find(function (p) { return S.prov[p].owner === defFac; });
        if (home) S.off[o.name].prov = home;
        else { S.off[o.name].fac = null; }
      });
      Turn.log("◆ " + S.factions[atkFac].name + "攻陷【" + provData(target).name + "】" + (defFac ? "(原屬" + S.factions[defFac].name + ")" : ""));
      if (defFac && !Object.keys(S.prov).some(function (p) { return S.prov[p].owner === defFac; })) {
        S.factions[defFac].alive = false;
        window.OFFICERS.forEach(function (o) {
          if (S.off[o.name].fac === defFac && !S.off[o.name].dead) S.off[o.name].fac = null;
        });
        Turn.log("☠【" + S.factions[defFac].name + "】勢力覆滅!");
      }
    } else {
      var back = Math.round(troops * (0.4 * ap / dp));
      fv.troops += back; fv.food += Math.round(food * 0.3);
      tv.troops = Math.round(tv.troops * (1 - 0.5 * ap / dp));
      Turn.log("◇ " + S.factions[atkFac].name + "進攻【" + provData(target).name + "】失利");
    }
  }

  /* 俘虜處置 (玩家俘獲 → 選項; 敵方俘獲玩家武將 → 直接釋放, M4 再細) */
  function processCaptives(done) {
    var S = State.get();
    var c = pendingCaptives.shift();
    if (!c) { done(); return; }
    if (c.by !== S.player) {
      /* AI 俘獲: 義理低者可能降敵, 否則放歸在野 */
      if (c.off.stats.yi < 50 && Math.random() < 0.5 && c.by) {
        S.off[c.off.name].fac = c.by;
        S.off[c.off.name].loyal = 45;
        Turn.log("【" + c.off.name + "】被俘後投降了" + S.factions[c.by].name + "!");
      } else {
        S.off[c.off.name].fac = null;
        Turn.log(c.off.name + "被俘後獲釋, 流落在野");
      }
      processCaptives(done); return;
    }
    var h = '<div class="dlg"><h2>俘獲 ' + c.off.name + "</h2>" + faceOf(c.off, 90) +
      '<p>武' + c.off.stats.wu + " 智" + c.off.stats.zhi + " 義理" + c.off.stats.yi + '</p><div class="dlg-btns">' +
      '<button id="cp-r">招降</button><button id="cp-f">釋放</button><button id="cp-k">處斬</button></div></div>';
    $("modal").innerHTML = h; $("modal").style.display = "flex";
    function close() { $("modal").style.display = "none"; processCaptives(done); }
    $("cp-r").onclick = function () {
      var p = (110 - c.off.stats.yi) / 110;
      if (Math.random() < p) {
        S.off[c.off.name].fac = S.player;
        S.off[c.off.name].prov = B ? B.prov : S.off[c.off.name].prov;
        S.off[c.off.name].loyal = 40 + Math.round(c.off.stats.yi / 4);
        Turn.log("【" + c.off.name + "】歸降!");
      } else Turn.log(c.off.name + "寧死不降, 只得放走");
      S.off[c.off.name].fac === S.player || (S.off[c.off.name].fac = null);
      close();
    };
    $("cp-f").onclick = function () {
      S.off[c.off.name].fac = null;
      Turn.log("釋放了" + c.off.name);
      close();
    };
    $("cp-k").onclick = function () {
      S.off[c.off.name].dead = true;
      Turn.log("處斬了" + c.off.name + "……(天下義士寒心)");
      close();
    };
  }

  window.Battle = {
    marchDialog: function (pid) { armyDialog(pid, true); },
    moveDialog: function (pid) { armyDialog(pid, false); },
    active: function () { return !!B; },
    autoResolve: autoResolve,
    _terrain: makeTerrain, /* 測試用 */
    /* AI 攻打玩家 → 玩家守城互動戰 */
    startDefense: function (req, onEnd) {
      var S = State.get(), fv = S.prov[req.from];
      var troops = Math.round(fv.troops * 0.7), food = Math.round(fv.food * 0.5);
      fv.troops -= troops; fv.food -= food;
      var offs = Commands.officersIn(req.from, req.fac).slice(0, 5);
      Turn.log("‼【" + S.factions[req.fac].name + "】大舉來犯【" + provData(req.target).name + "】!");
      start(req.from, req.target, offs, troops, food, { atkFac: req.fac, onEnd: onEnd });
    }
  };
})();
