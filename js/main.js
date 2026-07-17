/* main.js — 啟動: 有存檔續玩, 否則選君主開新局 */
(function () {
  "use strict";
  window.addEventListener("DOMContentLoaded", function () {
    var saved = State.load();
    if (saved && confirm("發現存檔 (" + saved.year + "年" + saved.month + "月), 要繼續嗎?\n取消 = 開新遊戲")) {
      UI.refresh();
      return;
    }
    UI.chooser(function (fid) {
      State.newGame(fid);
      Turn.log("你成為【" + State.get().factions[fid].name + "】之主, 亂世爭霸開始!");
      State.save();
      UI.refresh();
    });
  });
})();
