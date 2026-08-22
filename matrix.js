/** Matrix ops on flat Float64Array row-major */
const CoreMatrix = (() => {
  function zeros(rows, cols) {
    return { data: new Float64Array(rows * cols), rows, cols };
  }
  function randn(rows, cols, scale = 0.02) {
    const m = zeros(rows, cols);
    for (let i = 0; i < m.data.length; i++) m.data[i] = (CoreRandom ? CoreRandom.normal() : (Math.random() * 2 - 1)) * scale;
    return m;
  }
  function matmul(A, B) {
    // A: (m,k) B: (k,n) -> (m,n)
    const m = A.rows, k = A.cols, n = B.cols;
    const C = zeros(m, n);
    for (let i = 0; i < m; i++) {
      for (let p = 0; p < k; p++) {
        const a = A.data[i * k + p];
        for (let j = 0; j < n; j++) {
          C.data[i * n + j] += a * B.data[p * n + j];
        }
      }
    }
    return C;
  }
  function matvec(A, v) {
    const out = new Float64Array(A.rows);
    for (let i = 0; i < A.rows; i++) {
      let s = 0;
      for (let j = 0; j < A.cols; j++) s += A.data[i * A.cols + j] * v[j];
      out[i] = s;
    }
    return out;
  }
  function transpose(A) {
    const T = zeros(A.cols, A.rows);
    for (let i = 0; i < A.rows; i++)
      for (let j = 0; j < A.cols; j++)
        T.data[j * A.rows + i] = A.data[i * A.cols + j];
    return T;
  }
  function addInPlace(A, B) {
    for (let i = 0; i < A.data.length; i++) A.data[i] += B.data[i];
    return A;
  }
  return { zeros, randn, matmul, matvec, transpose, addInPlace };
})();
if (typeof module !== 'undefined') module.exports = CoreMatrix;
