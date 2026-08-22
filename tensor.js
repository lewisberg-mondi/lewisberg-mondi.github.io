/** Minimal Tensor wrapper */
const CoreTensor = (() => {
  function tensor(data, shape) {
    const flat = data instanceof Float64Array ? data : Float64Array.from(data);
    return { data: flat, shape: shape || [flat.length], size: flat.length };
  }
  function zeros(shape) {
    const size = shape.reduce((a, b) => a * b, 1);
    return tensor(new Float64Array(size), shape);
  }
  function randn(shape, scale = 0.02) {
    const size = shape.reduce((a, b) => a * b, 1);
    const data = new Float64Array(size);
    for (let i = 0; i < size; i++) data[i] = (typeof CoreRandom !== 'undefined' ? CoreRandom.normal() : (Math.random() * 2 - 1)) * scale;
    return tensor(data, shape);
  }
  function reshape(t, shape) {
    return tensor(t.data, shape);
  }
  return { tensor, zeros, randn, reshape };
})();
if (typeof module !== 'undefined') module.exports = CoreTensor;
