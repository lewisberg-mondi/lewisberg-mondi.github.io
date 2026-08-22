/**
 * Extra tools: JSON backup, CSV plot, code sandbox, free-body sketch, reasoning export
 */
const ToolsX = (() => {
  function exportBackup() {
    const data = {
      version: 2,
      exportedAt: new Date().toISOString(),
      knowledge: (typeof Knowledge !== "undefined" && Knowledge.getAll) ? Knowledge.getAll() : [],
      settings: (typeof AI !== "undefined" && AI.loadSettings) ? AI.loadSettings() : {},
      course: (typeof Study !== "undefined" && Study.getCourse) ? Study.getCourse() : "General",
      hebbStats: (typeof Neurons !== "undefined" && Neurons.getStats) ? Neurons.getStats() : {}
    };
    try {
      data.neurons = Neurons.getAll && Neurons.getAll();
      data.neuronLinks = Neurons.getStrongestLinks && Neurons.getStrongestLinks(50);
    } catch (e) {}
    return data;
  }

  function importBackup(obj) {
    if (!obj || typeof obj !== "object") return "Invalid backup.";
    let n = 0;
    if (obj.knowledge && typeof Knowledge !== "undefined" && Knowledge.add) {
      obj.knowledge.forEach(function (f) {
        if (f.subject && f.content) {
          Knowledge.add(f.subject, f.content, f.category || "imported");
          n++;
        }
      });
    }
    return "Imported **" + n + "** facts from backup.";
  }

  function plotCSV(csvText) {
    const lines = String(csvText || "").trim().split(/\r?\n/).filter(Boolean);
    if (lines.length < 2) return { ok: false, message: "Need CSV header + rows." };
    const headers = lines[0].split(",").map(function (h) { return h.trim(); });
    const rows = lines.slice(1, 31).map(function (line) {
      return line.split(",").map(function (c) { return c.trim(); });
    });
    const W = 640, H = 360;
    const canvas = document.createElement("canvas");
    canvas.width = W; canvas.height = H;
    const ctx = canvas.getContext("2d");
    ctx.fillStyle = "#0b1522";
    ctx.fillRect(0, 0, W, H);
    // numeric columns
    const cols = [];
    for (let c = 0; c < headers.length; c++) {
      const nums = rows.map(function (r) { return parseFloat(r[c]); });
      if (nums.every(function (x) { return !isNaN(x); })) cols.push({ i: c, name: headers[c], vals: nums });
    }
    if (!cols.length) {
      return { ok: false, message: "No numeric columns found to plot." };
    }
    const series = cols[0];
    const min = Math.min.apply(null, series.vals);
    const max = Math.max.apply(null, series.vals);
    const pad = 40;
    ctx.strokeStyle = "#5b8def";
    ctx.lineWidth = 2;
    ctx.beginPath();
    series.vals.forEach(function (v, i) {
      const x = pad + (i / Math.max(1, series.vals.length - 1)) * (W - 2 * pad);
      const y = H - pad - ((v - min) / (max - min + 1e-9)) * (H - 2 * pad);
      if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
    });
    ctx.stroke();
    ctx.fillStyle = "#e7ecf3";
    ctx.font = "13px system-ui";
    ctx.fillText("CSV plot: " + series.name + " (" + series.vals.length + " points)", 12, 22);
    ctx.fillStyle = "#9bb0c9";
    ctx.fillText("min " + min + " · max " + max, 12, H - 12);
    return {
      ok: true,
      message: "Plotted column **" + series.name + "** from CSV.",
      creative: { type: "image", dataUrl: canvas.toDataURL("image/png"), prompt: "csv plot", message: "CSV plot" }
    };
  }

  function freeBody(prompt) {
    const W = 480, H = 360;
    const canvas = document.createElement("canvas");
    canvas.width = W; canvas.height = H;
    const ctx = canvas.getContext("2d");
    ctx.fillStyle = "#0b1522";
    ctx.fillRect(0, 0, W, H);
    // block
    ctx.fillStyle = "#5b8def";
    ctx.fillRect(W / 2 - 40, H / 2 - 30, 80, 60);
    ctx.strokeStyle = "#3ecf8e";
    ctx.lineWidth = 3;
    // arrows
    function arrow(x1, y1, x2, y2, label) {
      ctx.beginPath();
      ctx.moveTo(x1, y1);
      ctx.lineTo(x2, y2);
      ctx.stroke();
      ctx.fillStyle = "#e7ecf3";
      ctx.font = "12px system-ui";
      ctx.fillText(label, x2 + 4, y2);
    }
    arrow(W / 2, H / 2, W / 2, H / 2 - 90, "N");
    arrow(W / 2, H / 2, W / 2, H / 2 + 100, "mg");
    if (/friction|push|force/i.test(prompt || "")) {
      arrow(W / 2, H / 2, W / 2 + 110, H / 2, "F");
      arrow(W / 2, H / 2, W / 2 - 90, H / 2, "f");
    }
    ctx.fillStyle = "#9bb0c9";
    ctx.fillText("Free-body diagram (sketch)", 12, 24);
    return {
      type: "image",
      dataUrl: canvas.toDataURL("image/png"),
      prompt: prompt,
      message: "Free-body diagram sketch. Label forces to match your problem."
    };
  }

  function runSandbox(code) {
    const src = String(code || "").slice(0, 3000);
    // extremely limited: no DOM, no fetch
    const logs = [];
    const fakeConsole = {
      log: function () {
        logs.push(Array.prototype.slice.call(arguments).map(String).join(" "));
      }
    };
    try {
      const fn = new Function("console", "\"use strict\";\n" + src);
      fn(fakeConsole);
      return "**Sandbox result**\n\n```\n" + (logs.join("\n") || "(no output)") + "\n```\n\n_Only pure JS; no DOM/network._";
    } catch (e) {
      return "**Sandbox error:** " + (e && e.message);
    }
  }

  function exportThinking(thinking, reply) {
    return (
      "**Reasoning timeline export**\n\n" +
      "### Thinking\n" + String(thinking || "").replace(/^→ /gm, "- ") + "\n\n" +
      "### Answer\n" + String(reply || "").slice(0, 2000) + "\n\n" +
      "_Copy into your lab report as process documentation._"
    );
  }

  function detect(text) {
    const t = text || "";
    const lower = t.toLowerCase();
    if (/^export backup\b|^backup data\b/i.test(lower)) return { type: "export" };
    if (/^import backup\s*[:\-]/i.test(t)) return { type: "import", body: t.replace(/^import backup\s*[:\-]?\s*/i, "").trim() };
    if (/^plot csv\s*[:\-]/i.test(t)) return { type: "csv", body: t.replace(/^plot csv\s*[:\-]?\s*/i, "").trim() };
    if (/free[- ]body|draw forces|fbd\b/i.test(lower)) return { type: "fbd", body: t };
    if (/^run js\s*[:\-]/i.test(t) || /^sandbox\s*[:\-]/i.test(t)) {
      return { type: "js", body: t.replace(/^(run js|sandbox)\s*[:\-]?\s*/i, "").trim() };
    }
    if (/export thinking|reasoning timeline/i.test(lower)) return { type: "think_export" };
    return null;
  }

  function handle(intent, ctx) {
    ctx = ctx || {};
    if (!intent) return null;
    if (intent.type === "export") {
      const data = exportBackup();
      const json = JSON.stringify(data, null, 2);
      return {
        reply: "Backup JSON ready (" + json.length + " chars). Download below — keep offline for SPCK/university work.",
        creative: {
          type: "code",
          filename: "localmind-backup.json",
          code: json,
          language: "json"
        }
      };
    }
    if (intent.type === "import") {
      try {
        const obj = JSON.parse(intent.body);
        return { reply: importBackup(obj) };
      } catch (e) {
        return { reply: "Paste full JSON after **Import backup:**" };
      }
    }
    if (intent.type === "csv") {
      const r = plotCSV(intent.body);
      if (!r.ok) return { reply: r.message };
      return { reply: r.message, creative: r.creative };
    }
    if (intent.type === "fbd") {
      const img = freeBody(intent.body);
      return { reply: img.message, creative: img };
    }
    if (intent.type === "js") return { reply: runSandbox(intent.body) };
    if (intent.type === "think_export") {
      return { reply: exportThinking(ctx.thinking, ctx.reply) };
    }
    return null;
  }

  return { detect: detect, handle: handle, exportBackup: exportBackup };
})();
