/**
 * Code builder — websites (HTML/CSS/JS) with ZIP download + preview, and code snippets
 */
const Coder = (() => {
  function detectIntent(text) {
    const lower = text.toLowerCase();
    const siteRe = /(shopping|ecommerce|e-commerce|business|school|trading|chat|chatting|portfolio|blog|landing|personal)?\s*(website|web site|web page|webpage|site)/i;
    if (/(build|create|make|generate|code)\s+.*/i.test(lower) && siteRe.test(lower)) {
      let kind = "general";
      if (/shop|ecommerce|e-commerce/i.test(lower)) kind = "shopping";
      else if (/business|company|corporate/i.test(lower)) kind = "business";
      else if (/school|university|college|education/i.test(lower)) kind = "school";
      else if (/trad(e|ing)|market|stock/i.test(lower)) kind = "trading";
      else if (/chat/i.test(lower)) kind = "chat";
      else if (/portfolio|personal/i.test(lower)) kind = "portfolio";
      else if (/blog/i.test(lower)) kind = "blog";
      const prompt = text.replace(/^(build|create|make|generate|code)\s+(me\s+)?(a\s+)?/i, "").trim();
      return { type: "website", kind: kind, prompt: prompt };
    }
    if (/^(write|generate|create)\s+(a\s+)?(python|js|javascript|html|css|sql)\b/i.test(lower) || /^code\s+/i.test(lower)) {
      return { type: "snippet", prompt: text };
    }
    return null;
  }

  /** CRC32 for ZIP */
  const CRC_TABLE = (function () {
    const t = new Uint32Array(256);
    for (let i = 0; i < 256; i++) {
      let c = i;
      for (let k = 0; k < 8; k++) c = (c & 1) ? (0xedb88320 ^ (c >>> 1)) : (c >>> 1);
      t[i] = c >>> 0;
    }
    return t;
  })();
  function crc32(buf) {
    let c = 0xffffffff;
    for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
    return (c ^ 0xffffffff) >>> 0;
  }
  function strToU8(s) {
    if (typeof TextEncoder !== "undefined") return new TextEncoder().encode(s);
    const arr = new Uint8Array(s.length);
    for (let i = 0; i < s.length; i++) arr[i] = s.charCodeAt(i) & 0xff;
    return arr;
  }
  function u32(n) { return [n & 255, (n >> 8) & 255, (n >> 16) & 255, (n >>> 24) & 255]; }
  function u16(n) { return [n & 255, (n >> 8) & 255]; }

  /** Build a store-method ZIP from {filename: string content} */
  function makeZip(files) {
    const parts = [];
    const central = [];
    let offset = 0;
    const names = Object.keys(files);
    for (let i = 0; i < names.length; i++) {
      const name = names[i];
      const data = strToU8(files[name]);
      const nameU8 = strToU8(name);
      const crc = crc32(data);
      const local = [];
      local.push(0x50, 0x4b, 0x03, 0x04); // local header
      local.push.apply(local, u16(20)); // version
      local.push.apply(local, u16(0)); // flags
      local.push.apply(local, u16(0)); // method store
      local.push.apply(local, u16(0)); // time
      local.push.apply(local, u16(0)); // date
      local.push.apply(local, u32(crc));
      local.push.apply(local, u32(data.length));
      local.push.apply(local, u32(data.length));
      local.push.apply(local, u16(nameU8.length));
      local.push.apply(local, u16(0)); // extra
      for (let j = 0; j < nameU8.length; j++) local.push(nameU8[j]);
      const localArr = new Uint8Array(local);
      parts.push(localArr);
      parts.push(data);

      const cen = [];
      cen.push(0x50, 0x4b, 0x01, 0x02);
      cen.push.apply(cen, u16(20));
      cen.push.apply(cen, u16(20));
      cen.push.apply(cen, u16(0));
      cen.push.apply(cen, u16(0));
      cen.push.apply(cen, u16(0));
      cen.push.apply(cen, u16(0));
      cen.push.apply(cen, u32(crc));
      cen.push.apply(cen, u32(data.length));
      cen.push.apply(cen, u32(data.length));
      cen.push.apply(cen, u16(nameU8.length));
      cen.push.apply(cen, u16(0));
      cen.push.apply(cen, u16(0));
      cen.push.apply(cen, u16(0));
      cen.push.apply(cen, u16(0));
      cen.push.apply(cen, u32(0));
      cen.push.apply(cen, u32(offset));
      for (let j = 0; j < nameU8.length; j++) cen.push(nameU8[j]);
      central.push(new Uint8Array(cen));
      offset += localArr.length + data.length;
    }
    const centralSize = central.reduce(function (s, a) { return s + a.length; }, 0);
    const end = [];
    end.push(0x50, 0x4b, 0x05, 0x06);
    end.push.apply(end, u16(0));
    end.push.apply(end, u16(0));
    end.push.apply(end, u16(names.length));
    end.push.apply(end, u16(names.length));
    end.push.apply(end, u32(centralSize));
    end.push.apply(end, u32(offset));
    end.push.apply(end, u16(0));
    const all = parts.concat(central).concat([new Uint8Array(end)]);
    let total = 0;
    for (let i = 0; i < all.length; i++) total += all[i].length;
    const out = new Uint8Array(total);
    let o = 0;
    for (let i = 0; i < all.length; i++) {
      out.set(all[i], o);
      o += all[i].length;
    }
    return out;
  }

  function website(prompt, kind) {
    kind = kind || "general";
    const title = (prompt || "My Site").replace(/build\s+(a\s+)?/i, "").slice(0, 60).replace(/[<>]/g, "") || "My Site";
    const safe = title.replace(/&/g, "&amp;");

    const css = `/* Generated by Kanairoex */
:root {
  --bg: #0f1419;
  --card: #1a2332;
  --text: #e7ecf3;
  --muted: #8b9bb4;
  --accent: #5b8def;
  --accent2: #3ecf8e;
  --radius: 12px;
  --font: system-ui, -apple-system, Segoe UI, Roboto, sans-serif;
}
* { box-sizing: border-box; margin: 0; padding: 0; }
body {
  font-family: var(--font);
  background: var(--bg);
  color: var(--text);
  line-height: 1.6;
  min-height: 100vh;
}
a { color: var(--accent); text-decoration: none; }
a:hover { text-decoration: underline; }
.wrap { max-width: 960px; margin: 0 auto; padding: 24px 20px 64px; }
header {
  display: flex; align-items: center; justify-content: space-between;
  padding: 16px 0 32px; border-bottom: 1px solid #243044; margin-bottom: 32px;
}
.logo { font-weight: 700; font-size: 1.25rem; letter-spacing: -0.02em; }
nav { display: flex; gap: 18px; flex-wrap: wrap; }
nav a { color: var(--muted); font-size: 0.95rem; }
nav a:hover { color: var(--text); }
.hero {
  background: linear-gradient(135deg, #1a2332 0%, #152238 100%);
  border: 1px solid #2a3a52;
  border-radius: var(--radius);
  padding: 40px 32px;
  margin-bottom: 28px;
}
.hero h1 { font-size: clamp(1.6rem, 4vw, 2.4rem); margin-bottom: 12px; letter-spacing: -0.03em; }
.hero p { color: var(--muted); max-width: 520px; margin-bottom: 20px; }
.btn {
  display: inline-block; background: var(--accent); color: #fff !important;
  padding: 10px 18px; border-radius: 8px; font-weight: 600; border: none; cursor: pointer;
  text-decoration: none !important;
}
.btn:hover { filter: brightness(1.08); }
.btn.ghost { background: transparent; border: 1px solid #3a4d6a; color: var(--text) !important; margin-left: 8px; }
.grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(240px, 1fr)); gap: 16px; margin: 28px 0; }
.card {
  background: var(--card); border: 1px solid #2a3a52; border-radius: var(--radius);
  padding: 20px;
}
.card h3 { margin-bottom: 8px; font-size: 1.05rem; }
.card p { color: var(--muted); font-size: 0.92rem; }
footer { margin-top: 48px; padding-top: 20px; border-top: 1px solid #243044; color: var(--muted); font-size: 0.85rem; text-align: center; }
.tag { display: inline-block; background: #243044; color: var(--accent2); font-size: 0.75rem; padding: 2px 8px; border-radius: 999px; margin-bottom: 10px; }
`;

    let bodyExtra = "";
    if (kind === "shopping") {
      bodyExtra = `
    <div class="grid">
      <div class="card"><span class="tag">New</span><h3>Product One</h3><p>Quality item for everyday use. $29</p><button class="btn" data-add="Product One">Add to cart</button></div>
      <div class="card"><span class="tag">Popular</span><h3>Product Two</h3><p>Customer favourite. $49</p><button class="btn" data-add="Product Two">Add to cart</button></div>
      <div class="card"><span class="tag">Sale</span><h3>Product Three</h3><p>Limited offer. $19</p><button class="btn" data-add="Product Three">Add to cart</button></div>
    </div>
    <p id="cartStatus" style="color:var(--muted)">Cart: empty</p>`;
    } else if (kind === "portfolio") {
      bodyExtra = `
    <div class="grid">
      <div class="card"><h3>Project Alpha</h3><p>Web app with clean UI and solid performance.</p></div>
      <div class="card"><h3>Project Beta</h3><p>Research tool for students and teams.</p></div>
      <div class="card"><h3>Project Gamma</h3><p>Open-source utility library.</p></div>
    </div>`;
    } else if (kind === "school") {
      bodyExtra = `
    <div class="grid">
      <div class="card"><h3>Courses</h3><p>Browse current semester classes and syllabi.</p></div>
      <div class="card"><h3>Library</h3><p>Access digital resources and study guides.</p></div>
      <div class="card"><h3>Events</h3><p>Workshops, clubs, and campus news.</p></div>
    </div>`;
    } else if (kind === "business") {
      bodyExtra = `
    <div class="grid">
      <div class="card"><h3>Services</h3><p>Consulting, delivery, and support tailored to you.</p></div>
      <div class="card"><h3>About</h3><p>Trusted by teams who value clarity and results.</p></div>
      <div class="card"><h3>Contact</h3><p>Email hello@example.com — we reply within one day.</p></div>
    </div>`;
    } else {
      bodyExtra = `
    <div class="grid">
      <div class="card"><h3>Feature One</h3><p>Fast, private, and easy to customize.</p></div>
      <div class="card"><h3>Feature Two</h3><p>Works offline once you download the files.</p></div>
      <div class="card"><h3>Feature Three</h3><p>Built with plain HTML, CSS, and JavaScript.</p></div>
    </div>`;
    }

    const js = `// Generated by Kanairoex — ${safe.replace(/"/g, "")}
(function () {
  console.log("Site ready:", document.title);
  var year = document.getElementById("year");
  if (year) year.textContent = new Date().getFullYear();
  var cart = [];
  document.querySelectorAll("[data-add]").forEach(function (btn) {
    btn.addEventListener("click", function () {
      cart.push(btn.getAttribute("data-add"));
      var el = document.getElementById("cartStatus");
      if (el) el.textContent = "Cart: " + cart.join(", ");
    });
  });
  var cta = document.getElementById("cta");
  if (cta) cta.addEventListener("click", function (e) {
    e.preventDefault();
    alert("Thanks for visiting ${safe.replace(/"/g, '\\"')}!");
  });
})();
`;

    const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>${safe}</title>
  <link rel="stylesheet" href="styles.css" />
</head>
<body>
  <div class="wrap">
    <header>
      <div class="logo">${safe}</div>
      <nav>
        <a href="#home">Home</a>
        <a href="#features">Features</a>
        <a href="#about">About</a>
      </nav>
    </header>
    <section class="hero" id="home">
      <h1>${safe}</h1>
      <p>A clean starter website generated by Kanairoex. Edit the HTML, CSS, and JavaScript to make it yours.</p>
      <a class="btn" href="#features" id="cta">Get started</a>
      <a class="btn ghost" href="#about">Learn more</a>
    </section>
    <section id="features">
      <h2 style="margin-bottom:12px">Highlights</h2>
      ${bodyExtra}
    </section>
    <section id="about" style="margin-top:32px">
      <div class="card">
        <h3>About this site</h3>
        <p>Generated locally in your browser. No account required. Download the ZIP, open <code>index.html</code>, or host the three files anywhere.</p>
      </div>
    </section>
    <footer>
      <p>&copy; <span id="year"></span> ${safe} · Built with Kanairoex</p>
    </footer>
  </div>
  <script src="app.js"></script>
</body>
</html>
`;

    // Single-file preview (inline CSS/JS) for iframe/window
    const previewHtml = html
      .replace('<link rel="stylesheet" href="styles.css" />', "<style>\\n" + css + "\\n</style>")
      .replace('<script src="app.js"></script>', "<script>\\n" + js + "\\n</script>");
    // fix the double-escaped - actually in template we need real newlines
    const preview = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>${safe}</title>
  <style>
${css}
  </style>
</head>
<body>
  <div class="wrap">
    <header>
      <div class="logo">${safe}</div>
      <nav>
        <a href="#home">Home</a>
        <a href="#features">Features</a>
        <a href="#about">About</a>
      </nav>
    </header>
    <section class="hero" id="home">
      <h1>${safe}</h1>
      <p>A clean starter website generated by Kanairoex. Edit the HTML, CSS, and JavaScript to make it yours.</p>
      <a class="btn" href="#features" id="cta">Get started</a>
      <a class="btn ghost" href="#about">Learn more</a>
    </section>
    <section id="features">
      <h2 style="margin-bottom:12px">Highlights</h2>
      ${bodyExtra}
    </section>
    <section id="about" style="margin-top:32px">
      <div class="card">
        <h3>About this site</h3>
        <p>Generated locally in your browser. Download the ZIP for index.html, styles.css, and app.js.</p>
      </div>
    </section>
    <footer>
      <p>&copy; <span id="year"></span> ${safe} · Built with Kanairoex</p>
    </footer>
  </div>
  <script>
${js}
  </script>
</body>
</html>`;

    const files = {
      "index.html": html,
      "styles.css": css,
      "app.js": js,
      "README.txt": "Kanairoex website export\\n\\nOpen index.html in a browser, or host all three files together.\\nPreview works offline.\\n"
    };

    const lesson =
      "## Learn by building — step by step\n\n" +
      "### Step 1 — HTML (structure)\n" +
      "We create `index.html` with a header, hero section, feature cards, and footer. " +
      "HTML is the skeleton: headings, paragraphs, links, and buttons.\n\n" +
      "```html\n" +
      "<header>…logo + nav…</header>\n<section class=\"hero\">…title + CTA…</section>\n" +
      "<div class=\"grid\">…cards…</div>\n<footer>…</footer>\n```\n\n" +
      "### Step 2 — CSS (design)\n" +
      "In `styles.css` we define colours (`--bg`, `--accent`), layout (`.grid`, `.card`), and buttons. " +
      "CSS controls look and spacing without changing the content.\n\n" +
      "### Step 3 — JavaScript (behaviour)\n" +
      "In `app.js` we set the year in the footer and wire button clicks (e.g. cart). " +
      "JS makes the page interactive after it loads.\n\n" +
      "### Step 4 — Package & preview\n" +
      "All three files go into a ZIP. Use **Preview** to try the page, then **Download** to study offline. " +
      "Open `index.html` in your browser after unzipping.\n\n" +
      "_Tip: change the hero text and accent colour to make the site yours._";

    const bytes = makeZip(files);
    const slug = safe.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 40) || "site";

    return {
      type: "zip",
      filename: slug + ".zip",
      language: "zip",
      code: "", // multi-file
      bytes: bytes,
      previewHtml: preview,
      files: files,
      lesson: lesson,
      message: "Built **" + safe + "** (" + kind + ") as a full website (HTML + CSS + JS).\n\nDownload the ZIP for offline use, or open Preview."
    };
  }


  function snippet(prompt) {
    const lower = (prompt || "").toLowerCase();
    if (/python/.test(lower)) {
      return {
        type: "code",
        filename: "script.py",
        language: "python",
        code: "# Generated by Kanairoex\n# " + String(prompt).slice(0, 100) + "\n\ndef main():\n    print('Hello from Kanairoex')\n\nif __name__ == '__main__':\n    main()\n"
      };
    }
    if (/sql/.test(lower)) {
      return {
        type: "code",
        filename: "query.sql",
        language: "sql",
        code: "-- Generated by Kanairoex\nSELECT * FROM users WHERE active = 1 ORDER BY created_at DESC LIMIT 50;\n"
      };
    }
    if (/html/.test(lower)) {
      return {
        type: "code",
        filename: "page.html",
        language: "html",
        code: "<!DOCTYPE html>\n<html><head><meta charset=\"UTF-8\"><title>Page</title></head>\n<body><h1>Hello</h1><script>console.log('ok')</script></body></html>\n"
      };
    }
    return {
      type: "code",
      filename: "script.js",
      language: "javascript",
      code: "// Generated by Kanairoex\nfunction main() {\n  console.log('Hello from Kanairoex');\n}\nmain();\n"
    };
  }

  function build(intent) {
    if (intent.type === "website") {
      return website(intent.prompt, intent.kind);
    }
    return snippet(intent.prompt);
  }


  return { detectIntent: detectIntent, build: build, website: website, snippet: snippet, makeZip: makeZip };
})();
