/** Minimal autograd tape (educational) */
const CoreAutograd = (() => {
  const tape = [];
  function push(op) { tape.push(op); }
  function clear() { tape.length = 0; }
  function backward(lossGrad = 1) {
    // Very simplified: user supplies grads via callbacks stored on tape
    for (let i = tape.length - 1; i >= 0; i--) {
      if (typeof tape[i].backward === 'function') tape[i].backward();
    }
  }
  return { push, clear, backward, tape };
})();
if (typeof module !== 'undefined') module.exports = CoreAutograd;
