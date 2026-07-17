/* face.js — 國劇臉譜式八位元點陣頭像生成器
 * 規格見 DESIGN.md 第五節。
 * 細版 32×46(武將卡/單挑) 、粗版 20×26(戰場棋子)，共用參數:
 *   { color, wu, zhi, beard, hat, fab, cheek, old }
 * 用法: Face.render(params, heightPx) -> SVG 字串 (heightPx < 64 自動用粗版)
 */
(function () {
  "use strict";

  /* ==== 三國志II風 16色母調色盤 (PC-98/KOEI 色感) ==== */
  var K16 = {
    blk: "#181410", wht: "#F0F0E0", tan: "#E0A878", org: "#D07028",
    red: "#C03028", dred: "#701810", brn: "#805020", dbrn: "#442808",
    yel: "#E0C040", grn: "#388030", dgrn: "#1C4818", blu: "#3858A8",
    dblu: "#182860", cyn: "#68A0C0", gry: "#908C80", dgry: "#484440"
  };
  /* 抖色對: 渲染時以 (x+y) 奇偶棋盤格交錯兩色, 仿 16 色時代的中間調 */
  function D(a, b) { return [K16[a], K16[b]]; }
  /* 任意 hex 量化到母盤最近色 (供資料端自訂布色) */
  function quant(hex) {
    var r = parseInt(hex.slice(1, 3), 16), g = parseInt(hex.slice(3, 5), 16), b = parseInt(hex.slice(5, 7), 16);
    var best = null, bd = 1e9;
    Object.keys(K16).forEach(function (k) {
      var h = K16[k];
      var r2 = parseInt(h.slice(1, 3), 16), g2 = parseInt(h.slice(3, 5), 16), b2 = parseInt(h.slice(5, 7), 16);
      var d = (r - r2) * (r - r2) + (g - g2) * (g - g2) + (b - b2) * (b - b2);
      if (d < bd) { bd = d; best = h; }
    });
    return best;
  }

  var PAL = {
    red:    { skin: K16.red,  sh: D("red", "dred"),  dk: K16.dred, lt: K16.tan,  label: "紅・忠義" },
    black:  { skin: K16.dgry, sh: D("dgry", "blk"),  dk: K16.blk,  lt: K16.tan,  label: "黑・剛直" },
    white:  { skin: K16.wht,  sh: D("wht", "gry"),   dk: K16.gry,  lt: K16.dgry, label: "白・多謀" },
    yellow: { skin: K16.yel,  sh: D("yel", "org"),   dk: K16.brn,  lt: K16.wht,  label: "黃・梟勇" },
    blue:   { skin: K16.blu,  sh: D("blu", "dblu"),  dk: K16.dblu, lt: K16.tan,  label: "藍・驍悍" },
    purple: { skin: D("blu", "red"), sh: D("dblu", "dred"), dk: K16.dblu, lt: K16.tan, label: "紫・沉穩" },
    pink:   { skin: K16.tan,  sh: D("tan", "org"),   dk: K16.brn,  lt: K16.wht,  label: "粉・老成" }
  };
  /* 索引: 1 skin 2 dk 3 lt 4 墨 5 霜白 6 鬚紋 7 shade
   *       8/9 金屬 10/11 金 12/13 布 14 紅纓 15/16 白鬚 */
  var FIXED = { 4: K16.blk, 5: K16.wht, 6: K16.dgry, 8: K16.gry, 9: K16.dgry,
                10: K16.yel, 11: K16.brn, 14: K16.red, 15: K16.wht, 16: D("wht", "gry") };
  var DEF_FAB = [K16.cyn, K16.dblu];

  var H32 = [6,8,10,11,12,13,13,14,14,15,15,15,16,16,16,16,16,16,16,15,15,15,14,14,13,12,11,10,9,8,6,4];
  var H20 = [4,6,7,8,9,9,10,10,10,10,10,10,10,10,9,9,8,7,6,5];
  var YO = 6;

  function grid(w, h) {
    var g = [];
    for (var y = 0; y < h; y++) { g.push(new Array(w).fill(0)); }
    return g;
  }

  /* ---------- 細版 32×46 ---------- */
  function px32(o) {
    var W = 32, H = 46, g = grid(W, H);
    function F(x, r) { return r >= 0 && r < 32 && x >= 0 && x < W && Math.abs(x - 15.5) + 0.5 <= H32[r]; }
    function G(x, r, v) { g[r + YO][x] = v; }
    function Mi(x, r, v) { G(x, r, v); G(31 - x, r, v); }
    function S(x, y, v) { if (x >= 0 && x < W && y >= 0 && y < H) g[y][x] = v; }
    var r, x, y, i, k;

    for (r = 0; r < 32; r++) for (x = 0; x < W; x++) if (F(x, r)) G(x, r, 1);
    for (r = 6; r < 32; r++) for (x = 0; x < W; x++) if (F(x, r) && (!F(x - 1, r) || !F(x + 1, r))) G(x, r, 7);

    var hairy = o.hat === "topknot" || !o.hat;
    if (hairy) {
      for (r = 0; r <= 4; r++) for (x = 0; x < W; x++) if (F(x, r)) G(x, r, 2);
      for (x = 0; x < W; x++) {
        if (F(x, 5) && (x < 11 || x > 20)) G(x, 5, 2);
        if (F(x, 6) && (x < 9 || x > 22)) G(x, 6, 2);
      }
    }
    if (o.zhi >= 60 && o.hat !== "scarf" && o.cheek !== "butterfly") {
      var dw = [1, 3, 5, 3, 1];
      for (i = 0; i < 5; i++) {
        var w0 = dw[i], x0 = 16 - Math.ceil(w0 / 2);
        for (x = x0; x < x0 + w0; x++) if (F(x, 8 + i)) G(x, 8 + i, 3);
      }
      G(15, 10, 2); G(16, 10, 2);
    }
    for (r = 13; r <= 21; r++) for (x = 3; x <= 13; x++) {
      var e = (r === 13 || r === 21) && (x < 5 || x > 11);
      if (F(x, r) && !e && g[r + YO][x] === 1) { G(x, r, 3); G(31 - x, r, 3); }
    }
    var bc = o.old ? 15 : 2;
    var t = o.wu >= 80 ? 3 : o.wu >= 50 ? 2 : 0, th = o.wu >= 80 ? 2 : 1;
    for (i = 0; i < 7; i++) {
      x = 4 + i; r = 15 - Math.round(i * t / 6);
      for (k = 0; k < th; k++) if (F(x, r - k)) Mi(x, r - k, bc);
    }
    if (o.cheek === "butterfly") {
      [[2,11],[3,11],[2,12],[3,12],[4,12]].forEach(function (p) { if (F(p[0], p[1])) Mi(p[0], p[1], 3); });
      [[4,14],[3,15],[3,16],[4,17],[6,15]].forEach(function (p) { Mi(p[0], p[1], 2); });
      for (r = 11; r <= 13; r++) { G(15, r, 3); G(16, r, 3); }
      Mi(14, 10, 2);
    }
    for (x = 6; x <= 11; x++) Mi(x, 16, 2);
    var dEye = o.wu >= 90, r1 = 17, r2 = dEye ? 19 : 18;
    for (r = r1; r <= r2; r++) for (x = 6; x <= 11; x++) {
      var trim = (r === r1 || r === r2) && (x === 6 || x === 11);
      Mi(x, r, trim ? 3 : 5);
    }
    for (r = r1; r <= r2; r++) for (x = 8; x <= 9; x++) Mi(x, r, 4);
    if (dEye) { G(9, 17, 5); G(22, 17, 5); }
    for (x = 6; x <= 11; x++) Mi(x, r2 + 1, 7);
    for (r = 20; r <= 23; r++) { G(14, r, 7); G(17, r, 7); }
    G(15, 23, 7); G(16, 23, 7);
    G(13, 24, 2); G(18, 24, 2); for (x = 14; x <= 17; x++) G(x, 24, 7);
    for (x = 12; x <= 19; x++) G(x, 26, 7);
    for (x = 11; x <= 20; x++) G(x, 27, 2);
    for (x = 12; x <= 19; x++) G(x, 28, 7);

    var B = o.beard || 0, bs = o.old ? 15 : 4;
    function tex(x, r) { return (x + r) % 3 === 0 ? (o.old ? 16 : 6) : (o.old ? 15 : 4); }
    if (B === 1) {
      for (r = 25; r <= 26; r++) for (x = 10; x <= 21; x++) if (F(x, r) && !(x >= 15 && x <= 16 && r === 25)) G(x, r, bs);
      for (r = 29; r <= 31; r++) for (x = 12; x <= 19; x++) if (F(x, r)) G(x, r, bs);
    }
    if (B === 2) {
      for (r = 25; r <= 26; r++) for (x = 9; x <= 22; x++) if (F(x, r) && !(x >= 15 && x <= 16 && r === 25)) G(x, r, bs);
      for (r = 26; r <= 31; r++) for (x = 4; x <= 9; x++) if (F(x, r)) { G(x, r, tex(x, r)); G(31 - x, r, tex(31 - x, r)); }
      for (r = 29; r <= 31; r++) for (x = 8; x <= 23; x++) if (F(x, r)) G(x, r, tex(x, r));
      var wv2 = [16, 15, 13, 11, 9, 7, 5, 3];
      for (i = 0; i < 8; i++) { var w2 = wv2[i], xa = Math.round((32 - w2) / 2); for (x = xa; x < xa + w2; x++) G(x, 32 + i, tex(x, 32 + i)); }
    }
    if (B === 3) {
      for (r = 22; r <= 31; r++) for (x = 2; x <= 29; x++) {
        var nose = x >= 13 && x <= 18 && r <= 24, mouth = x >= 11 && x <= 20 && r === 27;
        if (F(x, r) && !nose && !mouth) G(x, r, tex(x, r));
      }
      var wv3 = [22, 18, 14, 10, 7, 4];
      for (i = 0; i < 6; i++) { var w3 = wv3[i], xb = Math.round((32 - w3) / 2); for (x = xb; x < xb + w3; x++) G(x, 32 + i, tex(x, 32 + i)); }
    }

    if (o.hat === "topknot") {
      for (y = 2; y <= 4; y++) for (x = 14; x <= 17; x++) S(x, y, 2);
      for (x = 13; x <= 18; x++) S(x, 5, 10);
    }
    if (o.hat === "helmet") {
      for (r = 0; r <= 5; r++) {
        var hw = H32[r] + 1;
        for (x = 0; x < W; x++) if (Math.abs(x - 15.5) + 0.5 <= hw) {
          S(x, r + YO, Math.abs(x - 15.5) + 0.5 > hw - 1 ? 9 : 8);
        }
      }
      for (x = 0; x < W; x++) if (Math.abs(x - 15.5) + 0.5 <= H32[5] + 1) S(x, 11, 9);
      for (y = 2; y <= 4; y++) { S(15, y, 10); S(16, y, 10); }
      S(15, 0, 14); S(16, 0, 14); S(14, 1, 14); S(15, 1, 14); S(16, 1, 14); S(17, 1, 14);
    }
    if (o.hat === "crown") {
      for (r = 0; r <= 2; r++) for (x = 0; x < W; x++) if (F(x, r)) S(x, r + YO, 10);
      for (x = 5; x <= 26; x++) { S(x, 3, 11); S(x, 4, 10); }
      for (y = 1; y <= 2; y++) for (x = 12; x <= 19; x++) S(x, y, 10);
      for (x = 12; x <= 19; x++) S(x, 1, 11);
      for (y = 5; y <= 8; y++) { var c = y % 2 ? 5 : 10; S(5, y, c); S(26, y, c); S(8, y, c); S(23, y, c); }
    }
    if (o.hat === "scarf") {
      for (r = 0; r <= 6; r++) for (x = 0; x < W; x++) if (F(x, r)) S(x, r + YO, (x + r) % 5 === 0 ? 13 : 12);
      var tw = [2, 5, 8, 10, 12];
      for (i = 0; i < 5; i++) {
        var w4 = tw[i], xc = 16 - Math.ceil(w4 / 2);
        for (x = xc; x < xc + w4; x++) S(x, 1 + i, (x + 1 + i) % 5 === 0 ? 13 : 12);
      }
      for (x = 0; x < W; x++) if (F(x, 6)) S(x, 12, 13);
      for (y = 13; y <= 18; y++) { S(27, y, 12); S(28, y, y % 3 === 0 ? 13 : 12); }
    }
    if (o.hat === "civil") {
      for (y = 0; y <= 1; y++) for (x = 15; x <= 21; x++) S(x, y, 4);
      for (y = 2; y <= 3; y++) for (x = 13; x <= 21; x++) S(x, y, 4);
      for (y = 4; y <= 5; y++) for (x = 12; x <= 21; x++) S(x, y, 4);
      S(14, 2, 6); S(13, 4, 6);
      for (x = 10; x <= 22; x++) S(x, 6, 10);
      for (r = 0; r <= 1; r++) for (x = 0; x < W; x++) if (F(x, r)) S(x, r + YO, 2);
    }
    return { g: g, W: W, H: H };
  }

  /* ---------- 粗版 20×26 (戰場棋子: 底色+眉+眼+鬚) ---------- */
  function px20(o) {
    var W = 20, g = grid(W, 26);
    function F(x, y) { return y < 20 && Math.abs(x - 9.5) + 0.5 <= H20[y]; }
    var x, y, i;
    for (y = 0; y < 20; y++) for (x = 0; x < W; x++) if (F(x, y)) g[y][x] = 1;
    for (y = 0; y <= 4; y++) for (x = 0; x < W; x++) if (F(x, y)) g[y][x] = 2;
    for (y = 9; y <= 13; y++) for (x = 2; x <= 7; x++) if (F(x, y) && g[y][x] === 1) { g[y][x] = 3; g[y][19 - x] = 3; }
    var t = o.wu >= 80 ? 2 : o.wu >= 50 ? 1 : 0, bc = o.old ? 15 : 2;
    for (i = 0; i < 4; i++) {
      x = 3 + i; y = 10 - Math.round(i * t / 3);
      if (F(x, y)) { g[y][x] = bc; g[y][19 - x] = bc; }
      if (o.wu >= 80 && F(x, y - 1)) { g[y - 1][x] = bc; g[y - 1][19 - x] = bc; }
    }
    if (o.wu >= 90) {
      [[4, 11], [5, 11], [4, 12], [5, 12]].forEach(function (p) { g[p[1]][p[0]] = 4; g[p[1]][19 - p[0]] = 4; });
      g[11][5] = 5; g[11][14] = 5;
    } else {
      [[4, 12], [5, 12]].forEach(function (p) { g[p[1]][p[0]] = 4; g[p[1]][19 - p[0]] = 4; });
      g[12][5] = 5; g[12][14] = 5;
    }
    g[13][9] = 2; g[13][10] = 2; g[14][9] = 2; g[14][10] = 2;
    for (x = 7; x <= 12; x++) g[16][x] = 2;
    var B = o.beard || 0, bs = o.old ? 15 : 4;
    if (B === 1) for (y = 17; y <= 18; y++) for (x = 6; x <= 13; x++) { if (F(x, y)) g[y][x] = bs; }
    if (B === 2) {
      for (y = 17; y <= 19; y++) for (x = 5; x <= 14; x++) if (F(x, y)) g[y][x] = bs;
      var wv = [8, 7, 6, 4, 2];
      for (i = 0; i < 5; i++) { var w = wv[i], x0 = Math.round((20 - w) / 2); for (x = x0; x < x0 + w; x++) g[20 + i][x] = bs; }
    }
    if (B === 3) {
      for (y = 15; y <= 19; y++) for (x = 3; x <= 16; x++) if (F(x, y)) g[y][x] = bs;
      var wv2 = [12, 10, 8, 5];
      for (i = 0; i < 4; i++) { var w2 = wv2[i], x1 = Math.round((20 - w2) / 2); for (x = x1; x < x1 + w2; x++) g[20 + i][x] = bs; }
      for (x = 7; x <= 12; x++) g[17][x] = 1;
    }
    return { g: g, W: 20, H: 26 };
  }

  function toSVG(gr, o, heightPx, title) {
    var p = PAL[o.color] || PAL.red;
    var fab = o.fab ? [quant(o.fab[0]), quant(o.fab[1])] : DEF_FAB;
    function col(v) {
      if (v === 1) return p.skin;
      if (v === 2) return p.dk;
      if (v === 3) return p.lt;
      if (v === 7) return p.sh;
      if (v === 12) return fab[0];
      if (v === 13) return fab[1];
      return FIXED[v];
    }
    /* 淺色底板 (KOEI 頭像框式), 讓深色臉譜在暗色 UI 上跳出來 */
    var out = '<rect x="0" y="0" width="' + gr.W + '" height="' + gr.H + '" fill="' + K16.cyn + '"/>';
    for (var y = 0; y < gr.H; y++) {
      var x = 0;
      while (x < gr.W) {
        var v = gr.g[y][x];
        if (!v) { x++; continue; }
        var x2 = x;
        while (x2 < gr.W && gr.g[y][x2] === v) x2++;
        var c = col(v);
        if (typeof c === "string") {
          out += '<rect x="' + x + '" y="' + y + '" width="' + (x2 - x) + '" height="1" fill="' + c + '"/>';
        } else {
          /* 抖色: 整段鋪底色 A, 再依 (x+y) 奇偶點上 B */
          out += '<rect x="' + x + '" y="' + y + '" width="' + (x2 - x) + '" height="1" fill="' + c[0] + '"/>';
          for (var xd = x; xd < x2; xd++) {
            if ((xd + y) % 2 === 1) out += '<rect x="' + xd + '" y="' + y + '" width="1" height="1" fill="' + c[1] + '"/>';
          }
        }
        x = x2;
      }
    }
    var w = Math.round(heightPx * gr.W / gr.H);
    return '<svg width="' + w + '" height="' + heightPx + '" viewBox="0 0 ' + gr.W + " " + gr.H +
      '" shape-rendering="crispEdges" role="img"><title>' + (title || "臉譜") + "</title>" + out + "</svg>";
  }

  window.Face = {
    PAL: PAL, K16: K16, quant: quant,
    /* CSS 2px 棋盤格抖色背景 (地形等 UI 用) */
    ditherCSS: function (a, b) {
      return "background:" + K16[a] + ";background-image:conic-gradient(" + K16[b] + " 25%,transparent 0 50%," +
        K16[b] + " 0 75%,transparent 0);background-size:4px 4px;";
    },
    render: function (params, heightPx, title) {
      var gr = heightPx < 64 ? px20(params) : px32(params);
      return toSVG(gr, params, heightPx, title);
    }
  };
})();
