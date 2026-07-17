/* wiki.js — 點武將頭像 → 浮動視窗顯示 sanguo-wiki 生平頁 */
(function () {
  "use strict";
  var BASE = "https://pondahai.github.io/sanguo-wiki/";

  function urlFor(name) {
    return BASE + encodeURIComponent("人物") + "/" + encodeURIComponent(name) + ".html";
  }

  function show(name) {
    var url = urlFor(name);
    var win = document.getElementById("wikiwin");
    if (!win) {
      win = document.createElement("div");
      win.id = "wikiwin";
      document.body.appendChild(win);
    }
    win.innerHTML =
      '<div class="ww-bar"><b>' + name + ' 列傳</b><span class="spacer"></span>' +
      '<a href="' + url + '" target="_blank" rel="noopener">開新分頁 ↗</a>' +
      '<button id="ww-x">✕</button></div>' +
      '<iframe src="' + url + '" title="' + name + ' 生平"></iframe>';
    win.style.display = "flex";
    document.getElementById("ww-x").onclick = function () { win.style.display = "none"; };
  }

  /* 事件委派: 任何帶 data-wiki 的元素點擊即開 */
  document.addEventListener("click", function (e) {
    var n = e.target.closest ? e.target.closest("[data-wiki]") : null;
    if (n) show(n.getAttribute("data-wiki"));
  });

  window.Wiki = { show: show, urlFor: urlFor };
})();
