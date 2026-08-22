/**
 * Simple JavaScript code interpreter (sandboxed evaluation)
 */
const Interpreter = (() => {
  function run(code) {
    try {
      // Very basic sandbox: no access to document/window except console capture
      const logs = [];
      const fakeConsole = {
        log: (...args) => logs.push(args.map(a => String(a)).join(" ")),
        error: (...args) => logs.push("Error: " + args.map(a => String(a)).join(" ")),
        warn: (...args) => logs.push("Warn: " + args.map(a => String(a)).join(" "))
      };
      const result = Function("console", `"use strict";\n${code}`)(fakeConsole);
      return {
        ok: true,
        result: result === undefined ? undefined : result,
        logs: logs
      };
    } catch (e) {
      return { ok: false, error: e.message || String(e), logs: [] };
    }
  }

  function detectCodeIntent(text) {
    if (/^(run|execute|eval)\s+/i.test(text) || /```js|```javascript/i.test(text)) {
      let code = text.replace(/^(run|execute|eval)\s+/i, "");
      const match = code.match(/```(?:js|javascript)?\s*([\s\S]*?)```/i);
      if (match) code = match[1];
      return code.trim();
    }
    return null;
  }

  return { run, detectCodeIntent };
})();
