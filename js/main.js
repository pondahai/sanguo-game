/* main.js — 啟動: 有存檔 → 遊戲內選單(續玩/新局), 否則選君主開新局 */
(function () {
  "use strict";
  function newGameFlow() {
    UI.chooser(function (fid) {
      var S = State.newGame(fid);
      /* 開局天下大勢寫入實錄 (演義生成的第一章素材) */
      var lay = Object.keys(S.factions).map(function (f) {
        var ps = PROVINCES.filter(function (p) { return S.prov[p.id].owner === f; })
          .map(function (p) { return p.name; }).join("、");
        return S.factions[f].name + "據" + ps;
      }).join("；");
      Turn.chron("【開局】" + S.year + "年" + S.month + "月 董卓亂政, 群雄並起: " + lay + "。其餘州郡皆為中立之地。玩家勢力為" + S.factions[fid].name + "。");
      Turn.log("你成為【" + S.factions[fid].name + "】之主, 亂世爭霸開始!");
      State.save();
      UI.refresh();
    });
  }
  window.addEventListener("DOMContentLoaded", function () {
    var saved = State.load();
    if (!saved) { newGameFlow(); return; }
    var el = document.getElementById("overlay");
    el.innerHTML = '<div class="choose"><h1>三 國 志</h1>' +
      "<p>發現存檔: " + saved.year + "年" + saved.month + "月・" +
      (saved.factions[saved.player] ? saved.factions[saved.player].name : "") + "</p>" +
      '<div class="dlg-btns"><button id="bt-cont">繼 續</button><button id="bt-new">開 新 局</button></div></div>';
    el.style.display = "flex";
    document.getElementById("bt-cont").onclick = function () {
      el.style.display = "none";
      UI.refresh();
    };
    document.getElementById("bt-new").onclick = function () {
      try { localStorage.removeItem("sanguo_save_v1"); } catch (e) {}
      newGameFlow();
    };
  });
})();
