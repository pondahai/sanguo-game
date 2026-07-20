/* wiki.js — 點武將頭像 → 浮動視窗顯示 大頭像 + 遊戲數值 + sanguo-wiki 生平頁 */
(function () {
  "use strict";
  var BASE = "https://pondahai.github.io/sanguo-wiki/";

  var STATS = [
    { k: "wu",    label: "武力" },
    { k: "zhi",   label: "智力" },
    { k: "zheng", label: "政治" },
    { k: "mei",   label: "魅力" },
    { k: "yi",    label: "義理" }
  ];

  function urlFor(name) {
    return BASE + encodeURIComponent("人物") + "/" + encodeURIComponent(name) + ".html";
  }

  /* 依姓名或別名找出武將資料 */
  function findOfficer(name) {
    var list = window.OFFICERS || [];
    for (var i = 0; i < list.length; i++) {
      var o = list[i];
      if (o.name === name) return o;
      if (o.aliases && o.aliases.indexOf(name) >= 0) return o;
    }
    return null;
  }

  /* 大頭像 + 數值列 */
  function headHTML(name) {
    var o = findOfficer(name);
    if (!o) return "";
    var fp = Object.assign({ wu: o.stats.wu, zhi: o.stats.zhi }, o.face);
    var face = window.Face ? Face.render(fp, 120, o.name) : "";
    var rows = STATS.map(function (s) {
      var v = o.stats[s.k];
      if (typeof v !== "number") return "";
      return '<div class="ww-stat"><span class="ww-k">' + s.label + '</span>' +
        '<span class="ww-bar-track"><i style="width:' + Math.max(0, Math.min(100, v)) + '%"></i></span>' +
        '<b class="ww-v">' + v + "</b></div>";
    }).join("");
    var life = "";
    if (o.birth || o.death) {
      life = '<div class="ww-life">' + (o.birth || "?") + " – " + (o.death || "?") + "</div>";
    }
    return '<div class="ww-head">' +
      '<div class="ww-face">' + face + life + "</div>" +
      '<div class="ww-stats">' + rows + "</div></div>";
  }

  /* 首次呼叫時注入樣式 (index.html / roster.html 共用) */
  function injectCSS() {
    if (document.getElementById("ww-style")) return;
    var css =
      "#wikiwin .ww-head{display:flex;gap:14px;padding:12px 14px;border-bottom:1px solid var(--line);align-items:center;}" +
      "#wikiwin .ww-face{flex:0 0 auto;text-align:center;}" +
      "#wikiwin .ww-face svg{border-radius:6px;box-shadow:0 2px 8px #0008;display:block;}" +
      "#wikiwin .ww-life{margin-top:6px;font-size:11px;color:var(--dim);}" +
      "#wikiwin .ww-stats{flex:1;display:flex;flex-direction:column;gap:5px;min-width:0;}" +
      "#wikiwin .ww-stat{display:flex;align-items:center;gap:8px;font-size:12px;}" +
      "#wikiwin .ww-k{flex:0 0 34px;color:var(--dim);}" +
      "#wikiwin .ww-bar-track{flex:1;height:8px;background:var(--line);border-radius:4px;overflow:hidden;}" +
      "#wikiwin .ww-bar-track i{display:block;height:100%;background:linear-gradient(90deg,var(--gold),#E8C25A);}" +
      "#wikiwin .ww-v{flex:0 0 26px;text-align:right;color:var(--text);}";
    var st = document.createElement("style");
    st.id = "ww-style";
    st.textContent = css;
    document.head.appendChild(st);
  }

  function show(name) {
    injectCSS();
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
      headHTML(name) +
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
