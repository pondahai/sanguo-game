/* map.js — 州郡節點圖 (SVG)。勢力上色、選取、本月已下令標記 */
(function () {
  "use strict";
  var NEUTRAL = "#484440";

  function factionColor(fid) {
    var S = State.get();
    /* 勢力色量化到 16 色母盤, 統一時代色感 */
    return fid && S.factions[fid] ? Face.quant(S.factions[fid].color) : NEUTRAL;
  }

  function render(selectedId, onClick) {
    var S = State.get();
    var svg = '<svg viewBox="140 60 790 760" style="width:100%;height:100%;">';
    /* 鄰接線 (每條畫一次) */
    var seen = {};
    PROVINCES.forEach(function (a) {
      a.neighbors.forEach(function (nid) {
        var key = a.id < nid ? a.id + "|" + nid : nid + "|" + a.id;
        if (seen[key]) return;
        seen[key] = 1;
        var b = PROVINCES.find(function (x) { return x.id === nid; });
        svg += '<line x1="' + a.x + '" y1="' + a.y + '" x2="' + b.x + '" y2="' + b.y +
          '" stroke="#442808" stroke-width="3"/>';
      });
    });
    PROVINCES.forEach(function (p) {
      var pv = S.prov[p.id];
      var sel = p.id === selectedId;
      var mine = pv.owner === S.player;
      svg += '<g class="node" data-id="' + p.id + '" style="cursor:pointer">';
      svg += '<circle cx="' + p.x + '" cy="' + p.y + '" r="17" fill="' + factionColor(pv.owner) + '"' +
        (sel ? ' stroke="#E0C040" stroke-width="4"' : mine ? ' stroke="#F0F0E0" stroke-width="1.5"' : "") + "/>";
      if (mine && Commands.remaining(p.id) <= 0) {
        svg += '<text x="' + p.x + '" y="' + (p.y + 6) + '" text-anchor="middle" font-size="18" fill="#181410" font-weight="bold">✓</text>';
      }
      svg += '<text x="' + p.x + '" y="' + (p.y + 38) + '" text-anchor="middle" font-size="21" fill="#F0F0E0" font-weight="bold" style="paint-order:stroke;stroke:#181410;stroke-width:4px;">' + p.name + "</text>";
      svg += "</g>";
    });
    svg += "</svg>";
    var el = document.getElementById("map");
    el.innerHTML = svg;
    el.querySelectorAll("g.node").forEach(function (n) {
      n.addEventListener("click", function () { onClick(n.getAttribute("data-id")); });
    });
  }

  window.GameMap = { render: render, factionColor: factionColor };
})();
