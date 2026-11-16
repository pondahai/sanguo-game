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
      var done = mine && Commands.remaining(p.id) <= 0;
      svg += '<g class="node" data-id="' + p.id + '" style="cursor:pointer">';
      /* 己方: 方形城 + 白框 (形狀辨識, 不靠顏色); 他方: 圓形 */
      if (mine) {
        if (!done) { /* 尚有命令未下: 呼吸光暈 */
          svg += '<rect class="pending" x="' + (p.x - 25) + '" y="' + (p.y - 25) + '" width="50" height="50" rx="9"' +
            ' fill="none" stroke="#F0D060" stroke-width="4"/>';
        }
        svg += '<rect x="' + (p.x - 17) + '" y="' + (p.y - 17) + '" width="34" height="34" rx="4" fill="' +
          factionColor(pv.owner) + '" stroke="#F0F0E0" stroke-width="3.5"/>';
      } else {
        svg += '<circle cx="' + p.x + '" cy="' + p.y + '" r="17" fill="' + factionColor(pv.owner) + '"/>';
      }
      /* 選取: 外圈虛線金框, 不覆蓋己方標記 */
      if (sel) {
        svg += mine
          ? '<rect x="' + (p.x - 30) + '" y="' + (p.y - 30) + '" width="60" height="60" rx="11" fill="none" stroke="#E0C040" stroke-width="3" stroke-dasharray="7 4"/>'
          : '<circle cx="' + p.x + '" cy="' + p.y + '" r="26" fill="none" stroke="#E0C040" stroke-width="3" stroke-dasharray="7 4"/>';
      }
      if (done) {
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
