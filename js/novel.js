/* novel.js — 演義生成: 依存檔的戰局實錄, 由玩家自設的 LLM 端點寫一部想像三國演義。
 * 防幻覺鐵則承襲 sanguo-wiki: 只准根據實錄寫作, 嚴禁引入真實演義的記憶。
 * 設定(端點/金鑰/模型)存 localStorage, 不進存檔; 金鑰只送往玩家自己填的端點。 */
(function () {
  "use strict";
  var CFG_KEY = "sanguo_llm_cfg";
  var aborter = null;

  function $(id) { return document.getElementById(id); }
  function cfg() {
    try { return JSON.parse(localStorage.getItem(CFG_KEY)) || {}; } catch (e) { return {}; }
  }
  function saveCfg(c) {
    try { localStorage.setItem(CFG_KEY, JSON.stringify(c)); } catch (e) {}
  }

  /* ---- 素材: 現況 + 實錄 ---- */
  function situation() {
    var S = State.get(), lines = [];
    Object.keys(S.factions).forEach(function (f) {
      if (!S.factions[f].alive) return;
      var ps = PROVINCES.filter(function (p) { return S.prov[p.id].owner === f; });
      if (!ps.length) return;
      var offs = window.OFFICERS.filter(function (o) {
        var st = S.off[o.name];
        return st && !st.dead && st.fac === f;
      }).sort(function (a, b) { return (b.stats.wu + b.stats.zhi) - (a.stats.wu + a.stats.zhi); })
        .slice(0, 6).map(function (o) { return o.name; });
      lines.push(S.factions[f].name + "(君主" + S.factions[f].ruler + "): 領" +
        ps.map(function (p) { return p.name; }).join("、") + "; 麾下: " + offs.join("、"));
    });
    var neutral = PROVINCES.filter(function (p) { return !S.prov[p.id].owner; }).length;
    if (neutral) lines.push("中立州郡尚餘 " + neutral + " 處");
    return lines.join("\n");
  }

  function buildMessages(rounds) {
    var S = State.get();
    var sys = [
      "你是一位章回小說家，以《三國演義》的文體與筆調寫作白話章回小說。",
      "鐵則（違反即失格）：",
      "1. 你只能根據使用者提供的【戰局實錄】與【天下大勢】寫作。實錄中沒有的重大事件（戰役、攻城、死亡、被俘、投降、結盟、易主）一律不得出現。",
      "2. 嚴禁引入你記憶中真實《三國演義》的情節（桃園結義、三顧茅廬、赤壁之戰、白門樓等），除非實錄中明確記載。這是一條與史實不同的世界線。",
      "3. 出場人物僅限實錄與大勢中出現者，且【天下大勢】中各勢力的麾下名單是人物歸屬的唯一依據——不得把名單外的武將寫進任何勢力，也不得替武將更換陣營。",
      "3-1. 若實錄中沒有「會盟」「聯軍」記載，則嚴禁出現十八路諸侯、共推盟主之類的橋段——各勢力是各自為戰的。",
      "4. 允許的潤飾：對話、心理、天氣、旌旗兵馬的描寫等不改變事實的細節。",
      "5. 章回體：每回以七言對聯回目開頭（如「第一回　○○○○○○○　○○○○○○○」），回末用「欲知後事如何，且聽下回分解。」（最後一回改為收束全書的結語）。"
    ].join("\n");
    var user = "【劇本】" + SCENARIO.start.year + "年，董卓亂政，群雄並起。玩家勢力為【" +
      S.factions[S.player].name + "】。\n\n" +
      "【天下大勢（" + S.year + "年" + S.month + "月現況）】\n" + situation() + "\n\n" +
      "【戰局實錄】（逐月大事，每一條都真實發生，這是唯一可用的事件來源）\n" +
      (S.chronicle || []).join("\n") + "\n\n" +
      "請根據以上實錄，以【" + S.factions[S.player].name + "】為主角視角，寫成 " + rounds +
      " 回章回小說，每回約六百字。記住：只採用實錄事件，可潤飾細節，不得虛構重大事件。";
    return [{ role: "system", content: sys }, { role: "user", content: user }];
  }

  /* ---- SSE 串流。onThink 回報思考進度(Qwen 系 reasoning_content) ---- */
  function generate(c, rounds, onDelta, onThink, onDone, onErr) {
    aborter = new AbortController();
    function request(disableThinking) {
      var body = {
        model: c.model, messages: buildMessages(rounds),
        stream: true, temperature: 0.7, max_tokens: 8000
      };
      /* vLLM/Qwen 系: 關閉 thinking 直接寫正文; 不支援的端點會 400, 降級重試 */
      if (disableThinking) body.chat_template_kwargs = { enable_thinking: false };
      return fetch(c.url.replace(/\/+$/, "") + "/chat/completions", {
        method: "POST",
        signal: aborter.signal,
        headers: Object.assign({ "Content-Type": "application/json" },
          c.key ? { Authorization: "Bearer " + c.key } : {}),
        body: JSON.stringify(body)
      });
    }
    function run(res) {
      if (!res.ok) return res.text().then(function (t) { throw new Error("HTTP " + res.status + ": " + t.slice(0, 200)); });
      var rd = res.body.getReader(), dec = new TextDecoder(), buf = "", thought = 0;
      function pump() {
        rd.read().then(function (r) {
          if (r.done) { onDone(); return; }
          buf += dec.decode(r.value, { stream: true });
          var lines = buf.split("\n");
          buf = lines.pop();
          lines.forEach(function (l) {
            l = l.trim();
            if (l.indexOf("data:") !== 0) return;
            var d = l.slice(5).trim();
            if (d === "[DONE]") return;
            try {
              var delta = JSON.parse(d).choices[0].delta;
              if (delta && delta.content) onDelta(delta.content);
              else if (delta && delta.reasoning_content) { thought += delta.reasoning_content.length; onThink(thought); }
            } catch (e) {}
          });
          pump();
        }).catch(onErr);
      }
      pump();
    }
    request(true).then(function (res) {
      if (res.status === 400) return request(false).then(run); /* 端點不認 chat_template_kwargs */
      return run(res);
    }).catch(onErr);
  }

  /* ---- UI ---- */
  function open() {
    var S = State.get();
    var n = (S.chronicle || []).length;
    var c = cfg();
    var h = '<div class="dlg" style="max-width:480px;"><h2>演義生成</h2>' +
      '<p style="font-size:13px;color:var(--dim);margin-bottom:10px;">根據你的存檔實錄(' + n + ' 條大事)，由你自己的 LLM 寫一部想像三國演義。<br>' +
      '只根據實錄寫作，不憑模型記憶——你的世界線，你的演義。</p>' +
      '<label>端點 URL <input type="text" id="nv-url" style="width:100%;" placeholder="https://.../v1 (OpenAI 相容)" value="' + (c.url || "") + '"></label>' +
      '<label>API Key <input type="password" id="nv-key" style="width:100%;" placeholder="沒有可留空" value="' + (c.key || "") + '"></label>' +
      '<label>模型 <input type="text" id="nv-model" style="width:100%;" placeholder="例: qwen3.6" value="' + (c.model || "") + '"></label>' +
      '<label>回數 <select id="nv-rounds"><option>3</option><option selected>5</option><option>8</option></select></label>' +
      '<p style="font-size:11px;color:var(--dim);">設定只存在你的瀏覽器，金鑰只送往你填的端點。<br>注意: https 頁面無法呼叫 http 端點(混合內容)，本地端點請下載 repo 本地跑。</p>' +
      '<div class="dlg-btns"><button id="nv-go">開始生成</button><button id="nv-x">取消</button></div></div>';
    $("modal").innerHTML = h;
    $("modal").style.display = "flex";
    $("nv-x").onclick = function () { $("modal").style.display = "none"; };
    $("nv-go").onclick = function () {
      var conf = { url: $("nv-url").value.trim(), key: $("nv-key").value.trim(), model: $("nv-model").value.trim() };
      if (!conf.url || !conf.model) { alert("請填端點與模型"); return; }
      saveCfg(conf);
      var rounds = +$("nv-rounds").value;
      $("modal").style.display = "none";
      reader(conf, rounds);
    };
  }

  function reader(conf, rounds) {
    var el = $("novel");
    el.innerHTML = '<div class="nv-bar"><b>演 義</b><span class="spacer"></span>' +
      '<button id="nv-dl" disabled>下載 .md</button><button id="nv-close">關閉</button></div>' +
      '<div class="nv-body" id="nv-body"><p class="nv-wait">正在研墨鋪紙……</p></div>';
    el.style.display = "flex";
    var body = $("nv-body"), text = "", started = false;
    $("nv-close").onclick = function () {
      if (aborter) aborter.abort();
      el.style.display = "none";
    };
    generate(conf, rounds,
      function (chunk) {
        if (!started) { body.innerHTML = ""; started = true; }
        text += chunk;
        body.textContent = text;
        body.scrollTop = body.scrollHeight;
      },
      function (thoughtChars) {
        if (!started) body.innerHTML = '<p class="nv-wait">運籌帷幄中……(' + thoughtChars + ' 字思考)</p>';
      },
      function () {
        $("nv-dl").disabled = false;
        $("nv-dl").onclick = function () {
          var S = State.get();
          var a = document.createElement("a");
          a.href = URL.createObjectURL(new Blob(["# 想像三國演義（" + S.factions[S.player].name + "世界線）\n\n" + text], { type: "text/markdown" }));
          a.download = "yanyi_" + S.year + "_" + S.month + ".md";
          a.click();
        };
      },
      function (err) {
        if (err && err.name === "AbortError") return;
        body.innerHTML += '<p style="color:#E24B4A;">生成失敗: ' + (err && err.message ? err.message : err) + "</p>";
      });
  }

  window.Novel = { open: open };
})();
