/* Kanairoex Token Lab + Universal Economy bridge to LMT wallet.
   Kanairoex system tokens — transferable between users via wallet/P2P. */
(function () {
  'use strict';
  const DB = 'lm9-token-lab';
  const state = () => {
    try { return JSON.parse(localStorage.getItem(DB)) || null; } catch (e) { return null; }
  };
  let s = state() || {
    chainId: 'localmind-simnet',
    tokens: {
      LMT: {
        symbol: 'LMT',
        emoji: '💎',
        name: 'Kanairoex Token',
        decimals: 3,
        totalSupply: 33000000000,
        balances: { treasury: 33000000000 },
        rights: 'System utility token (linked to LMTWallet)'
      },
      LM: {
        symbol: 'LM',
        emoji: '🪙',
        name: 'Kanairoex Utility',
        decimals: 6,
        totalSupply: 1000000000,
        balances: { treasury: 1000000000 },
        rights: 'System utility token'
      }
    },
    balances: {},
    transactions: [],
    assets: [],
    reputation: {},
    offers: [],
    identity: {}
  };

  function save() { localStorage.setItem(DB, JSON.stringify(s)); }

  function hash(x) {
    let h = 2166136261;
    for (let i = 0; i < x.length; i++) {
      h ^= x.charCodeAt(i);
      h = Math.imul(h, 16777619);
    }
    return ('00000000' + (h >>> 0).toString(16)).slice(-8);
  }

  // Sync LMT balances from live wallet when available
  function syncFromLMTWallet() {
    if (typeof LMTWallet === 'undefined') return;
    try {
      const info = LMTWallet.info();
      if (!s.tokens.LMT) {
        s.tokens.LMT = {
          symbol: 'LMT', name: 'Kanairoex Token', decimals: 3,
          totalSupply: 33000000000, balances: {}, rights: 'System'
        };
      }
      s.tokens.LMT.balances[info.address] = info.balance;
      save();
    } catch (e) {}
  }

  const Token = {
    status() {
      syncFromLMTWallet();
      // Keep token-lab metadata synchronized with the wallet registry, including emoji.
      try {
        if (typeof LMTWallet !== 'undefined' && LMTWallet.listTokens) {
          LMTWallet.listTokens().forEach(function (meta) {
            if (!meta || !meta.symbol) return;
            if (!s.tokens[meta.symbol]) {
              s.tokens[meta.symbol] = {
                symbol: meta.symbol,
                emoji: meta.emoji || (meta.symbol === 'LMT' ? '💎' : '🪙'),
                name: meta.name || meta.symbol,
                totalSupply: Number(meta.maxSupply) || 0,
                decimals: 6,
                balances: {},
                rights: 'Wallet token'
              };
            } else if (meta.emoji) {
              s.tokens[meta.symbol].emoji = meta.emoji;
            }
          });
          save();
        }
      } catch (_) {}
      return {
        chainId: s.chainId,
        tokens: s.tokens,
        transactions: s.transactions.slice(-30),
        assets: s.assets,
        offers: s.offers,
        identity: s.identity,
        reputation: s.reputation,
        lmtLinked: typeof LMTWallet !== 'undefined'
      };
    },

    createSymbol(symbol, name, supply, rights, emoji) {
      symbol = String(symbol || '').toUpperCase().trim();
      if (!/^[A-Z][A-Z0-9]{1,7}$/.test(symbol)) throw Error('Invalid token ticker');
      if (s.tokens[symbol]) throw Error('Token already exists');
      emoji = String(emoji || '').trim();
      if (symbol === 'LMT') {
        emoji = '💎';
      } else if (typeof LMTWallet !== 'undefined' && LMTWallet.isEmojiSymbol) {
        if (!LMTWallet.isEmojiSymbol(emoji)) throw Error('Custom tokens require a valid emoji symbol');
        if (emoji === '💎') throw Error('💎 is reserved for LMT');
      } else if (!emoji || /\s/.test(emoji)) {
        throw Error('Custom tokens require an emoji symbol');
      }
      const maxSupply = Number(supply) || 0;
      if (maxSupply < 0 || maxSupply > 1e15) throw Error('Invalid token supply');
      s.tokens[symbol] = {
        symbol, emoji, name: String(name || symbol).trim().slice(0, 48),
        totalSupply: 0,
        maxSupply,
        decimals: 6,
        balances: {},
        rights: rights || 'System token'
      };
      save();
      return s.tokens[symbol];
    },

    mint(symbol, to, amount) {
      const t = s.tokens[symbol];
      if (!t) throw Error('Unknown token');
      amount = Number(amount);
      if (!Number.isFinite(amount) || amount <= 0) throw Error('Invalid amount');
      const max = Number(t.maxSupply);
      if (Number.isFinite(max) && max > 0 && t.totalSupply + amount > max) {
        throw Error('Mint exceeds token max supply');
      }
      t.totalSupply += amount;
      t.balances[to] = (t.balances[to] || 0) + amount;
      s.transactions.push({ type: 'mint', symbol, to, amount, at: new Date().toISOString() });
      save();
      return t.balances[to];
    },

    transfer(symbol, from, to, amount) {
      const t = s.tokens[symbol];
      amount = Number(amount);
      if (!t || amount <= 0 || ((t.balances[from] || 0) < amount)) {
        // Allow LMT transfers to be recorded even if lab balance is stale
        if (symbol !== 'LMT') throw Error('Insufficient balance or invalid token');
      }
      if (t.balances[from] != null) t.balances[from] = Math.max(0, (t.balances[from] || 0) - amount);
      t.balances[to] = (t.balances[to] || 0) + amount;
      const tx = { type: 'transfer', symbol, from, to, amount, at: new Date().toISOString() };
      tx.hash = hash(JSON.stringify(tx));
      s.transactions.push(tx);
      save();
      return tx;
    },

    balance(symbol, who) {
      if (symbol === 'LMT' && typeof LMTWallet !== 'undefined') {
        try {
          const info = LMTWallet.info();
          if (!who || who === info.address) return info.balance;
        } catch (e) {}
      }
      return s.tokens[symbol]?.balances[who] || 0;
    },

    /** Create a custom token and optionally airdrop to LMT wallet address */
    createAndLink(symbol, name, supply, rights, emoji) {
      const t = this.createSymbol(symbol, name, supply, rights, emoji);
      if (typeof LMTWallet !== 'undefined') {
        try {
          const addr = LMTWallet.getAddress();
          // record a zero LMT touch so explorer knows the wallet
          s.tokens.LMT = s.tokens.LMT || { symbol: 'LMT', balances: {} };
          s.tokens.LMT.balances[addr] = LMTWallet.getBalance();
        } catch (e) {}
      }
      save();
      return t;
    },

    /** High-level send that prefers live LMT wallet when symbol is LMT */
    async sendToWallet(symbol, toAddress, amount, note) {
      symbol = String(symbol || 'LMT').toUpperCase();
      if (symbol === 'LMT' && typeof LMTWallet !== 'undefined') {
        return LMTWallet.send(amount, toAddress, note || 'Token Lab send', true);
      }
      const from = (typeof LMTWallet !== 'undefined' && LMTWallet.getAddress()) || 'treasury';
      return this.transfer(symbol, from, toAddress, amount);
    },

    addAsset(name, type, description, verification) {
      const a = {
        id: 'asset_' + Date.now(),
        name, type, description,
        verification: verification || 'unverified',
        status: 'sandbox',
        createdAt: new Date().toISOString()
      };
      s.assets.push(a);
      save();
      return a;
    },

    tokenizeAsset(assetId, symbol, units) {
      const a = s.assets.find(x => x.id === assetId), t = s.tokens[symbol];
      if (!a || !t) throw Error('Asset/token not found');
      a.tokenSymbol = symbol;
      a.units = Number(units) || 0;
      a.status = 'sandbox-tokenized';
      a.disclaimer = 'These are Kanairoex system balances transferred between users in the system. They are not bank deposits or exchange-listed assets.';
      save();
      return a;
    },

    offer(title, kind, price, currency) {
      const o = {
        id: 'offer_' + Date.now(),
        title, kind,
        price: Number(price) || 0,
        currency: currency || 'LMT',
        status: 'sandbox',
        createdAt: new Date().toISOString()
      };
      s.offers.push(o);
      save();
      return o;
    },

    identitySet(data) {
      s.identity = Object.assign({}, s.identity, data, { updatedAt: new Date().toISOString() });
      save();
      return s.identity;
    },

    reputationSet(user, points) {
      s.reputation[user] = Math.max(0, Number(points) || 0);
      save();
      return s.reputation[user];
    },

    export() { return JSON.stringify(s, null, 2); },
    reset() { localStorage.removeItem(DB); location.reload(); }
  };

  window.KanairoexToken = Token;
})();
