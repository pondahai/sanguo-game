/* main.js — 啟動: 有存檔 → 遊戲內選單(續玩/新局), 否則選君主開新局 */
(function () {
  "use strict";
  function newGameFlow() {
    UI.chooser(function (fid) {
      State.newGame(fid);
      Turn.log("你成為【" + State.get().factions[fid].name + "】之主, 亂世爭霸開始!");
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
