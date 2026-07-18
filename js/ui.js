/* ui.js — 面板渲染: 頂欄 / 州郡詳情 / 指令鈕 / 武將列 / 日誌 / 選君主畫面 */
(function () {
  "use strict";
  var selected = null;

  function el(id) { return document.getElementById(id); }
  function provData(pid) { return PROVINCES.find(function (p) { return p.id === pid; }); }

  function refresh() {
    var S = State.get();
    GameMap.render(selected, select);
    var f = S.factions[S.player];
    el("topbar").innerHTML =
      '<span class="date">' + S.year + "年 " + S.month + "月</span>" +
      '<span class="fac" style="color:' + f.color + '">◉ ' + f.name + "</span>" +
      '<span class="spacer"></span>' +
      '<a href="roster.html" target="_blank" style="color:var(--dim);font-size:13px;">武將名冊</a>' +
      '<a href="face.html" target="_blank" style="color:var(--dim);font-size:13px;">臉譜工房</a>' +
      '<button id="btn-next">下月 ▶</button>' +
      '<button id="btn-save">匯出存檔</button>' +
      '<label class="filebtn">讀檔<input type="file" id="btn-load" accept=".json" hidden></label>';
    el("btn-next").onclick = function () { Turn.nextMonth(refresh); };
    el("btn-save").onclick = State.exportSave;
    el("btn-load").onchange = function (e) {
      if (e.target.files[0]) State.importSave(e.target.files[0], refresh);
    };
    renderSide();
    el("log").innerHTML = S.log.slice(0, 40).map(function (m) { return "<div>" + m + "</div>"; }).join("");
  }

  function select(pid) { selected = pid; refresh(); }

  function statRow(label, val, max) {
    return '<div class="row"><span>' + label + '</span><b>' + val + (max ? ' <i>/' + max + "</i>" : "") + "</b></div>";
  }

  function renderSide() {
    var S = State.get();
    if (!selected) { el("side").innerHTML = '<p class="hint">點選地圖上的州郡</p>'; return; }
    var pv = S.prov[selected], pd = provData(selected);
    var mine = pv.owner === S.player;
    var ownerName = pv.owner ? S.factions[pv.owner].name : "中立";
    var h = "<h2>" + pd.name + '<small>' + pd.zhou + "・" + ownerName + "</small></h2>";

    if (mine || !pv.owner) {
      h += statRow("金", pv.gold) + statRow("糧", pv.food) +
        statRow("兵", pv.troops) + statRow("訓練", pv.train, 100) +
        statRow("土地", pv.farm, pv.farmMax) + statRow("商業", pv.trade, pv.tradeMax) +
        statRow("治水", pv.flood, 100) + statRow("民忠", pv.loyal, 100);
    } else {
      h += '<p class="hint">敵州虛實不明(兵約 ' + (Math.round(pv.troops / 1000) * 1000 || "?") + ")</p>";
    }

    if (mine) {
      var used = Commands.usedList(selected).length, bud = Commands.budget(selected);
      var spent = used >= bud;
      var drafted = Commands.usedList(selected).indexOf("draft") >= 0;
      h += '<h3>指令<small>本月 ' + used + " / " + bud + "(駐將數,上限3)</small></h3>";
      h += '<div class="cmds">';
      Object.keys(Commands.CMDS).forEach(function (cid) {
        var c = Commands.CMDS[cid];
        var cost = [];
        if (c.gold) cost.push("金" + c.gold);
        if (c.food) cost.push("糧" + c.food);
        var off = spent || (cid === "draft" && drafted);
        h += '<button class="cmd" data-cmd="' + cid + '"' + (off ? " disabled" : "") + ">" +
          c.name + (cost.length ? '<small>' + cost.join(" ") + "</small>" : "") + "</button>";
      });
      h += "</div>";
      h += "<h3>軍務・人事</h3>";
      var dis = spent ? " disabled" : "";
      h += '<div class="cmds">' +
        '<button class="mil" data-mil="march"' + dis + ">出征<small>攻打鄰州</small></button>" +
        '<button class="mil" data-mil="move"' + dis + ">移動<small>調往我方鄰州</small></button>" +
        '<button class="mil" data-mil="reward"' + dis + ">賞賜<small>金200 忠誠+</small></button>" +
        '<button class="mil" data-mil="poach"' + dis + ">挖角<small>金500 策反敵將</small></button>" +
        '<button class="mil" data-mil="diplomacy"' + dis + ">外交<small>同盟/勸降</small></button></div>";
    }

    var staff = pv.owner ? Commands.officersIn(selected, pv.owner) : [];
    if ((mine || !pv.owner) && pv.owner) {
      h += "<h3>駐州武將 " + staff.length + " 名</h3>";
      h += '<div class="offs">' + staff.map(function (o) {
        var fp = Object.assign({ wu: o.stats.wu, zhi: o.stats.zhi }, o.face);
        return '<div class="off" data-wiki="' + o.name + '" title="點擊看列傳">' + Face.render(fp, 44, o.name) +
          "<span>" + o.name + '</span><small>武' + o.stats.wu + " 智" + o.stats.zhi +
          " 忠" + S.off[o.name].loyal + "</small></div>";
      }).join("") + "</div>";
    }
    el("side").innerHTML = h;
    el("side").querySelectorAll("button.cmd").forEach(function (b) {
      b.onclick = function () {
        var r = Commands.exec(selected, b.getAttribute("data-cmd"));
        Turn.log(r.ok ? "【" + provData(selected).name + "】" + r.msg : "⚠ " + r.msg);
        refresh();
      };
    });
    el("side").querySelectorAll("button.mil").forEach(function (b) {
      b.onclick = function () {
        var m = b.getAttribute("data-mil");
        if (m === "march") Battle.marchDialog(selected);
        else if (m === "move") Battle.moveDialog(selected);
        else if (m === "reward") Court.reward(selected);
        else if (m === "poach") Court.poach(selected);
        else Court.diplomacy(selected);
      };
    });
  }

  /* --- 結局畫面 --- */
  function endScreen(win) {
    var S = State.get();
    var ruler = window.OFFICERS.find(function (o) { return o.name === S.factions[S.player].ruler; });
    var fp = ruler ? Object.assign({ wu: ruler.stats.wu, zhi: ruler.stats.zhi }, ruler.face, win ? { hat: "crown" } : {}) : { color: "black", wu: 50, zhi: 50 };
    var h = '<div class="choose"><h1>' + (win ? "天 下 歸 一" : "霸 業 成 空") + "</h1>" +
      '<div style="margin:14px 0;">' + Face.render(fp, 160, S.factions[S.player].ruler) + "</div>" +
      "<p>" + (win
        ? S.year + "年, " + S.factions[S.player].name + "掃平群雄, 一統天下。亂世終焉, 新朝始立。"
        : S.year + "年, " + S.factions[S.player].name + "失去了最後的立足之地。天下大勢, 分久必合, 合久必分——只是再與你無關。") + "</p>" +
      '<div class="dlg-btns"><button id="end-restart">重新開始</button></div></div>';
    el("overlay").innerHTML = h;
    el("overlay").style.display = "flex";
    el("end-restart").onclick = function () {
      try { localStorage.removeItem("sanguo_save_v1"); } catch (e) {}
      location.reload();
    };
  }

  /* --- 選君主畫面 --- */
  function chooser(onPick) {
    var h = '<div class="choose"><h1>三 國 志</h1>' +
      '<p style="letter-spacing:.3em;">─ 擇主公・189 年 董卓亂政 ─</p><div class="facs">';
    SCENARIO.factions.forEach(function (f) {
      var o = State.officerByName ? window.OFFICERS.find(function (x) { return x.name === f.ruler; }) : null;
      var fp = Object.assign({ wu: o.stats.wu, zhi: o.stats.zhi }, o.face, { hat: "crown" });
      h += '<div class="fc" data-f="' + f.id + '">' + Face.render(fp, 96, f.ruler) +
        "<b>" + f.ruler + "</b><small>" + f.provinces.length + " 州</small></div>";
    });
    h += "</div></div>";
    el("overlay").innerHTML = h;
    el("overlay").style.display = "flex";
    el("overlay").querySelectorAll(".fc").forEach(function (n) {
      n.onclick = function () {
        el("overlay").style.display = "none";
        onPick(n.getAttribute("data-f"));
      };
    });
  }

  window.UI = { refresh: refresh, chooser: chooser, select: select, endScreen: endScreen };
})();
