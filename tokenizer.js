/** Simple character / word tokenizer for the mini LM */
const CoreTokenizer = (() => {
  let vocab = { '<pad>': 0, '<unk>': 1, '<bos>': 2, '<eos>': 3 };
  let id2tok = ['<pad>', '<unk>', '<bos>', '<eos>'];

  function buildFromText(text, maxVocab = 500) {
    const freq = {};
    const words = text.toLowerCase().match(/[a-z0-9']+|[.,!?;]/g) || [];
    for (const w of words) freq[w] = (freq[w] || 0) + 1;
    const sorted = Object.keys(freq).sort((a, b) => freq[b] - freq[a]).slice(0, maxVocab - 4);
    vocab = { '<pad>': 0, '<unk>': 1, '<bos>': 2, '<eos>': 3 };
    id2tok = ['<pad>', '<unk>', '<bos>', '<eos>'];
    sorted.forEach(w => {
      vocab[w] = id2tok.length;
      id2tok.push(w);
    });
    return vocabSize();
  }

  function encode(text, addSpecial = true) {
    const words = (text || '').toLowerCase().match(/[a-z0-9']+|[.,!?;]/g) || [];
    const ids = addSpecial ? [vocab['<bos>']] : [];
    for (const w of words) ids.push(vocab[w] !== undefined ? vocab[w] : vocab['<unk>']);
    if (addSpecial) ids.push(vocab['<eos>']);
    return ids;
  }

  function decode(ids) {
    return ids.map(i => id2tok[i] || '<unk>').filter(t => !t.startsWith('<')).join(' ');
  }

  function vocabSize() { return id2tok.length; }
  function getVocab() { return { vocab, id2tok }; }

  // Default mini vocab so the system works out of the box
  buildFromText("hello world the a is are was were i you he she it we they what when where who why how yes no good bad time day memory knowledge mind reason truth will create draw sing think learn remember file code math calculate");

  return { buildFromText, encode, decode, vocabSize, getVocab };
})();
if (typeof module !== 'undefined') module.exports = CoreTokenizer;
