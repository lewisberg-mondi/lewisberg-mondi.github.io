/** Seeded PRNG for reproducible experiments */
const CoreRandom = (() => {
  let s = 123456789;
  function seed(n) { s = (n >>> 0) || 1; }
  function next() {
    s ^= s << 13; s ^= s >>> 17; s ^= s << 5;
    return (s >>> 0) / 4294967296;
  }
  function uniform(a = 0, b = 1) { return a + (b - a) * next(); }
  function normal(mean = 0, std = 1) {
    const u = Math.max(1e-12, next()), v = next();
    return mean + std * Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
  }
  function randn(shape) {
    const n = shape.reduce((a, b) => a * b, 1);
    const data = new Float64Array(n);
    for (let i = 0; i < n; i++) data[i] = normal();
    return data;
  }
  return { seed, next, uniform, normal, randn };
})();
if (typeof module !== 'undefined') module.exports = CoreRandom;
