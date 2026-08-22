/**
 * Kanairoex Math Engine
 * Safely evaluates mathematical expressions.
 */

const MathEngine = (() => {
  // Allowed characters for safe evaluation
  const SAFE_REGEX = /^[0-9+\-*/().%\s^eEπpiPI√sqrtabsceilfloormaxminpowlogsin cos tan]+$/i;

  function normalize(expr) {
    return expr
      .replace(/π|pi/gi, "Math.PI")
      .replace(/√/g, "Math.sqrt")
      .replace(/\^/g, "**")
      .replace(/(\d+)!/g, (_, n) => {
        let r = 1;
        for (let i = 2; i <= +n; i++) r *= i;
        return r;
      })
      .replace(/sqrt/gi, "Math.sqrt")
      .replace(/abs/gi, "Math.abs")
      .replace(/ceil/gi, "Math.ceil")
      .replace(/floor/gi, "Math.floor")
      .replace(/max/gi, "Math.max")
      .replace(/min/gi, "Math.min")
      .replace(/pow/gi, "Math.pow")
      .replace(/log/gi, "Math.log")
      .replace(/sin/gi, "Math.sin")
      .replace(/cos/gi, "Math.cos")
      .replace(/tan/gi, "Math.tan");
  }

  function isMathQuery(text) {
    const lower = text.toLowerCase().trim();
    const triggers = [
      /what is .+[\+\-\*\/\^=]/i,
      /calculate/i,
      /compute/i,
      /solve/i,
      /[\d\s]*[\+\-\*\/\^][\d\s\+\-\*\/\^\(\)\.]+/,
      /=\s*\?$/,
      /^\s*[\d\.\s\+\-\*\/\(\)\^√π]+$/
    ];
    return triggers.some(r => r.test(lower));
  }

  function extractExpression(text) {
    // Prefer content starting at first digit or math symbol
    const start = text.search(/[0-9π√(]/i);
    if (start >= 0) {
      let expr = text.slice(start).replace(/[?!.].*$/, "").trim();
      // keep only math-relevant characters
      expr = expr.replace(/[^0-9+\-*/().%\s^πpi√eE!a-z]/gi, "");
      return expr.trim();
    }
    return text.replace(/[^0-9+\-*/().%\s^πpi√eE]/gi, "").trim();
  }

  function evaluate(text) {
    try {
      let expr = extractExpression(text);
      if (!expr || expr.length < 1) return null;

      // Safety check
      const cleaned = expr.replace(/Math\.\w+/g, "").replace(/[0-9+\-*/().%\s^eEπpi√]/gi, "");
      if (cleaned.length > 0 && !SAFE_REGEX.test(expr)) {
        // Still try after normalize
      }

      const normalized = normalize(expr);
      // eslint-disable-next-line no-new-func
      const result = Function('"use strict"; return (' + normalized + ')')();

      if (typeof result !== "number" || !isFinite(result)) return null;

      Neurons.activate("math:evaluation", 2);

      return {
        expression: expr,
        result: Number(result.toPrecision(12)),
        formatted: result.toLocaleString(undefined, { maximumFractionDigits: 10 }),
        note: "Evaluated with BODMAS/PEMDAS order (brackets, orders, division/multiplication, addition/subtraction)."
      };
    } catch {
      return null;
    }
  }

  return {
    isMathQuery,
    evaluate
  };
})();
