/**
 * Kanairoex USDT → LMT purchase (online)
 * User requests LMT, is shown a network deposit address + exact USDT amount,
 * app polls public explorers for matching incoming USDT, credits local LMT on match.
 * Orders expire after 30 minutes with no deposit.
 *
 * Merchant addresses are configured below (operator receives real USDT).
 * Operator is also notified via private Telegram deep-link (handle never shown in UI).
 * LMT credited is the Kanairoex in-app token (see LMTWallet).
 */
const UsdtBuy = (() => {
  'use strict';

  const ORDERS_KEY = 'localmind_usdt_buy_orders_v1';
  const CFG_KEY = 'localmind_usdt_buy_cfg_v1';
  const TTL_MS = 30 * 60 * 1000; // 30 minutes
  const POLL_MS = 90 * 1000;
  const MAX_ORDERS = 40;
  // Internal operator endpoint only — never render this string in user-facing UI.
  const _OP_TG = (function () {
    const a = ['Lew', 'isberg', '_', 'mon', 'di'];
    return a.join('');
  })();

  /** Default merchant receive addresses (USDT) */
  const DEFAULT_ADDRESSES = {
    tron: {
      network: 'tron',
      label: 'Tron (TRC20)',
      address: 'TP6L4J5AAoYfoFYnBdQPPZWgLodgAZXU2V',
      usdtContract: 'TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t',
      explorer: 'https://tronscan.org/#/address/'
    },
    ethereum: {
      network: 'ethereum',
      label: 'Ethereum (ERC20)',
      address: '0xf62853a3F579c54d2D85186F86aed01bFaDB7990',
      usdtContract: '0xdac17f958d2ee523a2206206994597c13d831ec7',
      explorer: 'https://etherscan.io/address/'
    },
    solana: {
      network: 'solana',
      label: 'Solana (SPL)',
      address: 'g2RErGJ7qnHg2G252twYUR5HG7wxZfV7AfMhb3sgxp6',
      usdtMint: 'Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB',
      explorer: 'https://solscan.io/account/'
    },
    ton: {
      network: 'ton',
      label: 'TON',
      address: 'UQBCx1p5WecrOvGiuqoOLaOS5FbRHSaNFyGdaX-fPJ6TknBl',
      explorer: 'https://tonviewer.com/'
    }
  };

  let pollTimer = null;

  function isOnline() {
    try {
      return typeof navigator === 'undefined' ? true : !!navigator.onLine;
    } catch (_) {
      return true;
    }
  }

  function loadCfg() {
    try {
      const raw = localStorage.getItem(CFG_KEY);
      if (raw) {
        const c = JSON.parse(raw);
        return Object.assign({ addresses: DEFAULT_ADDRESSES }, c);
      }
    } catch (_) {}
    return { addresses: DEFAULT_ADDRESSES };
  }

  function saveCfg(c) {
    try {
      localStorage.setItem(CFG_KEY, JSON.stringify(c));
    } catch (_) {}
  }

  function loadOrders() {
    try {
      return JSON.parse(localStorage.getItem(ORDERS_KEY) || '[]') || [];
    } catch (_) {
      return [];
    }
  }

  function saveOrders(list) {
    try {
      localStorage.setItem(ORDERS_KEY, JSON.stringify((list || []).slice(-MAX_ORDERS)));
    } catch (_) {}
  }

  function priceUsdPerLmt() {
    try {
      if (typeof LMTWallet !== 'undefined' && LMTWallet.priceUsdPerLmt) {
        return Number(LMTWallet.priceUsdPerLmt()) || 0.01;
      }
    } catch (_) {}
    return 0.01;
  }

  function roundUsdt(n) {
    return Math.round(Number(n) * 100) / 100;
  }

  function roundLmt(n) {
    return Math.round(Number(n) * 1000) / 1000;
  }

  function uid() {
    return 'ord_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
  }

  /** Unique USDT amount: base + 0.01..0.99 so we can match the exact transfer */
  function uniqueUsdtAmount(baseUsdt) {
    const base = Math.max(1, roundUsdt(baseUsdt));
    const micro = ((Date.now() % 99) + 1) / 100; // 0.01–0.99
    return roundUsdt(base + micro);
  }

  function resolveNetwork(name) {
    const n = String(name || 'tron').toLowerCase().trim();
    if (n === 'trc20' || n === 'trx' || n === 'tron') return 'tron';
    if (n === 'erc20' || n === 'eth' || n === 'ethereum') return 'ethereum';
    if (n === 'sol' || n === 'solana' || n === 'spl') return 'solana';
    if (n === 'ton' || n === 'telegram') return 'ton';
    return n;
  }

  function getMerchant(network) {
    const cfg = loadCfg();
    const key = resolveNetwork(network);
    return (cfg.addresses && cfg.addresses[key]) || DEFAULT_ADDRESSES[key] || null;
  }

  /**
   * Create a buy order.
   * @param {number} lmtAmount - LMT the user wants
   * @param {string} network - tron|ethereum|solana|ton
   * @param {string} [buyerNote] - optional note / external wallet
   */
  function createOrder(lmtAmount, network, buyerNote) {
    if (!isOnline()) {
      throw new Error('You must be online to start a USDT purchase.');
    }
    const lmt = roundLmt(lmtAmount);
    if (!(lmt >= 1)) throw new Error('Minimum buy is 1 LMT.');
    if (lmt > 10000000) throw new Error('Amount too large for a single order.');

    const net = resolveNetwork(network || 'tron');
    const merchant = getMerchant(net);
    if (!merchant || !merchant.address) {
      throw new Error('Unknown network. Use: tron | ethereum | solana | ton');
    }

    const rate = priceUsdPerLmt();
    const baseUsdt = roundUsdt(lmt * rate);
    const payUsdt = uniqueUsdtAmount(Math.max(baseUsdt, 1));
    // Recalculate LMT for the unique payment (user pays slightly more micro-amount)
    const creditLmt = roundLmt(payUsdt / rate);

    let buyerAddress = '';
    try {
      if (typeof LMTWallet !== 'undefined' && LMTWallet.getAddress) {
        buyerAddress = LMTWallet.getAddress() || '';
      }
    } catch (_) {}

    const order = {
      id: uid(),
      status: 'pending', // pending | paid | expired | cancelled
      network: net,
      label: merchant.label,
      merchantAddress: merchant.address,
      explorerBase: merchant.explorer || '',
      usdtContract: merchant.usdtContract || merchant.usdtMint || null,
      lmtRequested: lmt,
      lmtCredit: creditLmt,
      usdtPay: payUsdt,
      rateUsdPerLmt: rate,
      buyerAddress: buyerAddress,
      buyerNote: String(buyerNote || '').slice(0, 120),
      createdAt: Date.now(),
      expiresAt: Date.now() + TTL_MS,
      paidAt: null,
      txId: null,
      lastCheckAt: null,
      lastCheckNote: ''
    };

    const list = loadOrders();
    list.push(order);
    saveOrders(list);
    ensurePoller();
    return order;
  }

  function buildOperatorMessage(order) {
    return (
      'Kanairoex USDT DEPOSIT (BUY) REQUEST\n' +
      'Order: ' + order.id + '\n' +
      'Network: ' + (order.label || order.network) + '\n' +
      'User pays: ' + order.usdtPay + ' USDT\n' +
      'LMT credit: ' + order.lmtCredit + '\n' +
      'Merchant address:\n' + order.merchantAddress + '\n' +
      'Buyer Kanairoex: ' + (order.buyerAddress || 'n/a') + '\n' +
      'Rate: $' + order.rateUsdPerLmt + '/LMT\n' +
      'Created: ' + new Date(order.createdAt).toISOString() + '\n' +
      'Expires: ' + new Date(order.expiresAt).toISOString()
    );
  }

  function operatorTelegramLink(order) {
    const text = encodeURIComponent(buildOperatorMessage(order));
    return 'https://t.me/' + _OP_TG + '?text=' + text;
  }

  /** Open operator chat without revealing the handle in UI. */
  function notifyOperator(order) {
    try {
      if (typeof window === 'undefined') return;
      const link = operatorTelegramLink(order);
      setTimeout(function () {
        try {
          window.open(link, '_blank', 'noopener,noreferrer');
        } catch (_) {}
      }, 300);
    } catch (_) {}
  }

  function getOrder(id) {
    return loadOrders().find(function (o) {
      return o.id === id;
    }) || null;
  }

  function activeOrders() {
    const now = Date.now();
    return loadOrders().filter(function (o) {
      return o.status === 'pending' && o.expiresAt > now;
    });
  }

  function updateOrder(id, patch) {
    const list = loadOrders();
    const i = list.findIndex(function (o) {
      return o.id === id;
    });
    if (i < 0) return null;
    list[i] = Object.assign({}, list[i], patch);
    saveOrders(list);
    return list[i];
  }

  function expireStale() {
    const now = Date.now();
    const list = loadOrders();
    let changed = false;
    for (let i = 0; i < list.length; i++) {
      if (list[i].status === 'pending' && list[i].expiresAt <= now) {
        list[i].status = 'expired';
        list[i].lastCheckNote = 'Expired after 30 minutes — no matching USDT deposit detected.';
        changed = true;
      }
    }
    if (changed) saveOrders(list);
  }

  /** Credit local LMT wallet after confirmed USDT */
  function creditLmt(order) {
    if (typeof LMTWallet === 'undefined') {
      throw new Error('LMT wallet not loaded.');
    }
    if (LMTWallet.creditPurchase) {
      return LMTWallet.creditPurchase(order.lmtCredit, {
        orderId: order.id,
        usdt: order.usdtPay,
        network: order.network,
        txId: order.txId || ''
      });
    }
    // Fallback: faucet-style credit without unlock
    if (LMTWallet.faucet) {
      try {
        // faucet may require unlock — try credit via receive-like path
      } catch (_) {}
    }
    throw new Error('Wallet cannot credit purchase (creditPurchase missing). Update LMTWallet.');
  }

  // ── Explorer checks (public APIs, best-effort) ─────────

  async function checkTron(order) {
    // TronGrid account TRC20 transfers
    const addr = order.merchantAddress;
    const url =
      'https://api.trongrid.io/v1/accounts/' +
      encodeURIComponent(addr) +
      '/transactions/trc20?limit=30&contract_address=' +
      encodeURIComponent(order.usdtContract || 'TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t');
    const res = await fetch(url, {
      headers: { Accept: 'application/json' }
    });
    if (!res.ok) throw new Error('Tron API HTTP ' + res.status);
    const data = await res.json();
    const rows = data.data || data || [];
    const need = order.usdtPay;
    const since = order.createdAt - 60000;
    for (let i = 0; i < rows.length; i++) {
      const tx = rows[i];
      const to = (tx.to || tx.to_address || '').toLowerCase();
      if (to !== addr.toLowerCase()) continue;
      const ts = Number(tx.block_timestamp || tx.timestamp || 0);
      if (ts && ts < since) continue;
      // USDT TRC20 has 6 decimals
      const raw = Number(tx.value || tx.quant || 0);
      const amount = raw / 1e6;
      if (Math.abs(amount - need) <= 0.02) {
        return {
          matched: true,
          txId: tx.transaction_id || tx.txID || tx.hash || null,
          amount: amount
        };
      }
    }
    return { matched: false, note: 'No matching TRC20 USDT of ' + need + ' yet' };
  }

  async function checkEthereum(order) {
    // Public Ethereum RPC via eth_getLogs is heavy; use eth.blockscout or etherscan-free style
    // Fallback: Blockscout-compatible token transfers if available; else JSON-RPC call via public endpoint
    const addr = order.merchantAddress.toLowerCase();
    const contract = (order.usdtContract || '0xdac17f958d2ee523a2206206994597c13d831ec7').toLowerCase();
    // Use public eth_call-free approach: Etherscan-like eth.llamarpc + getLogs Transfer
    const topicTransfer =
      '0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef';
    const padAddr = '0x' + addr.replace(/^0x/, '').padStart(64, '0');
    const body = {
      jsonrpc: '2.0',
      id: 1,
      method: 'eth_getLogs',
      params: [
        {
          address: contract,
          topics: [topicTransfer, null, padAddr],
          fromBlock: '0x0',
          toBlock: 'latest'
        }
      ]
    };
    // Limit: many public RPCs reject wide fromBlock — use recent window via block number
    try {
      const bnRes = await fetch('https://ethereum.publicnode.com', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ jsonrpc: '2.0', id: 0, method: 'eth_blockNumber', params: [] })
      });
      const bnJson = await bnRes.json();
      const latest = parseInt(bnJson.result, 16);
      const from = Math.max(0, latest - 5000); // ~recent blocks
      body.params[0].fromBlock = '0x' + from.toString(16);
    } catch (_) {}

    const res = await fetch('https://ethereum.publicnode.com', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    });
    if (!res.ok) throw new Error('Ethereum RPC HTTP ' + res.status);
    const data = await res.json();
    if (data.error) throw new Error(data.error.message || 'RPC error');
    const logs = data.result || [];
    const need = order.usdtPay;
    // USDT ERC20: 6 decimals
    for (let i = logs.length - 1; i >= 0; i--) {
      const log = logs[i];
      const raw = parseInt(log.data, 16);
      if (!isFinite(raw)) continue;
      const amount = raw / 1e6;
      if (Math.abs(amount - need) <= 0.02) {
        return { matched: true, txId: log.transactionHash, amount: amount };
      }
    }
    return { matched: false, note: 'No matching ERC20 USDT of ' + need + ' in recent blocks' };
  }

  async function checkSolana(order) {
    const body = {
      jsonrpc: '2.0',
      id: 1,
      method: 'getSignaturesForAddress',
      params: [order.merchantAddress, { limit: 20 }]
    };
    const res = await fetch('https://api.mainnet-beta.solana.com', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    });
    if (!res.ok) throw new Error('Solana RPC HTTP ' + res.status);
    const data = await res.json();
    const sigs = (data.result || []).filter(function (s) {
      return s && s.signature && !s.err;
    });
    // Lightweight: cannot easily decode SPL amount without extra calls —
    // mark as needs manual confirm if any recent tx after order time
    const since = order.createdAt / 1000 - 60;
    const recent = sigs.filter(function (s) {
      return (s.blockTime || 0) >= since;
    });
    if (recent.length) {
      return {
        matched: false,
        note:
          'Recent Solana activity seen (' +
          recent.length +
          '). SPL USDT auto-match is limited — run `buy check` again or verify on Solscan. Expected **' +
          order.usdtPay +
          ' USDT**.',
        candidates: recent.slice(0, 3).map(function (s) {
          return s.signature;
        })
      };
    }
    return { matched: false, note: 'No recent Solana txs to merchant address' };
  }

  async function checkTon(order) {
    const addr = order.merchantAddress;
    const url = 'https://tonapi.io/v2/blockchain/accounts/' + encodeURIComponent(addr) + '/transactions?limit=20';
    const res = await fetch(url, { headers: { Accept: 'application/json' } });
    if (!res.ok) throw new Error('TON API HTTP ' + res.status);
    const data = await res.json();
    const txs = data.transactions || data || [];
    const since = order.createdAt / 1000 - 60;
    const recent = (Array.isArray(txs) ? txs : []).filter(function (t) {
      return (t.utime || t.now || 0) >= since;
    });
    if (recent.length) {
      return {
        matched: false,
        note:
          'Recent TON activity (' +
          recent.length +
          '). Jetton USDT auto-decode is limited — verify on tonviewer for **' +
          order.usdtPay +
          ' USDT**.',
        candidates: recent.slice(0, 3).map(function (t) {
          return t.hash || t.transaction_id || '';
        })
      };
    }
    return { matched: false, note: 'No recent TON txs to merchant address' };
  }

  async function checkOrder(order) {
    if (!order || order.status !== 'pending') {
      return { order: order, matched: false };
    }
    if (Date.now() > order.expiresAt) {
      updateOrder(order.id, {
        status: 'expired',
        lastCheckAt: Date.now(),
        lastCheckNote: 'Expired (30 min) — no deposit detected.'
      });
      return { order: getOrder(order.id), matched: false, expired: true };
    }
    if (!isOnline()) {
      return { order: order, matched: false, note: 'Offline — cannot check explorer' };
    }

    let result = { matched: false, note: '' };
    try {
      if (order.network === 'tron') result = await checkTron(order);
      else if (order.network === 'ethereum') result = await checkEthereum(order);
      else if (order.network === 'solana') result = await checkSolana(order);
      else if (order.network === 'ton') result = await checkTon(order);
      else result = { matched: false, note: 'Unsupported network' };
    } catch (e) {
      result = { matched: false, note: 'Check failed: ' + (e.message || e) };
    }

    if (result.matched) {
      updateOrder(order.id, {
        status: 'paid',
        paidAt: Date.now(),
        txId: result.txId || null,
        lastCheckAt: Date.now(),
        lastCheckNote: 'Matched USDT deposit ' + (result.amount || order.usdtPay)
      });
      const paid = getOrder(order.id);
      try {
        creditLmt(paid);
        updateOrder(order.id, { credited: true });
      } catch (ce) {
        updateOrder(order.id, {
          credited: false,
          lastCheckNote: 'Deposit matched but LMT credit failed: ' + (ce.message || ce)
        });
      }
      return { order: getOrder(order.id), matched: true, result: result };
    }

    updateOrder(order.id, {
      lastCheckAt: Date.now(),
      lastCheckNote: result.note || 'Waiting for deposit'
    });
    return { order: getOrder(order.id), matched: false, result: result };
  }

  async function checkAllPending() {
    expireStale();
    const active = activeOrders();
    const out = [];
    for (let i = 0; i < active.length; i++) {
      out.push(await checkOrder(active[i]));
    }
    return out;
  }

  function ensurePoller() {
    if (pollTimer) return;
    if (!activeOrders().length) return;
    pollTimer = setInterval(function () {
      if (!isOnline()) return;
      const pending = activeOrders();
      if (!pending.length) {
        stopPoller();
        return;
      }
      checkAllPending().catch(function () {});
    }, POLL_MS);
  }

  function stopPoller() {
    if (pollTimer) clearInterval(pollTimer);
    pollTimer = null;
  }

  function formatOrder(order) {
    if (!order) return 'No order.';
    const left = Math.max(0, order.expiresAt - Date.now());
    const mins = Math.ceil(left / 60000);
    const lines = [
      '**USDT → LMT order** `' + order.id + '`',
      '',
      '• Status: **' + order.status + '**',
      '• Network: **' + (order.label || order.network) + '**',
      '• Send exactly: **' + order.usdtPay + ' USDT**',
      '• You receive: **' + order.lmtCredit + ' LMT** (rate $' + order.rateUsdPerLmt + '/LMT)',
      '• Deposit to:',
      '`' + order.merchantAddress + '`',
      '',
      order.explorerBase
        ? '• Explorer: ' + order.explorerBase + order.merchantAddress
        : '',
      order.status === 'pending'
        ? '• Expires in ~**' + mins + ' min** (cancel if no deposit)'
        : '',
      order.txId ? '• Tx: `' + order.txId + '`' : '',
      order.lastCheckNote ? '• Check: _' + order.lastCheckNote + '_' : '',
      '',
      '**Commands:** `buy check` · `buy status` · `buy cancel ' + order.id + '`'
    ];
    return lines.filter(Boolean).join('\n');
  }

  function helpText() {
    return (
      '**Buy LMT with USDT** (online)\n\n' +
      '1. `buy lmt 1000` — default network **Tron TRC20**\n' +
      '2. `buy lmt 1000 tron` · `buy lmt 500 ethereum` · `buy lmt 200 solana` · `buy lmt 100 ton`\n' +
      '3. Send the **exact USDT amount** shown to the deposit address\n' +
      '4. `buy check` — poll explorers for your deposit\n' +
      '5. On match → **LMT credited** to your Kanairoex wallet\n' +
      '6. No deposit in **30 minutes** → order **expires**\n\n' +
      'Networks:\n' +
      '• Tron TRC20\n• Ethereum ERC20\n• Solana SPL\n• TON\n\n' +
      '_You must be online. Tron/Ethereum auto-match is strongest; Solana/TON may need explorer confirmation._'
    );
  }

  /**
   * Chat command handler
   */
  async function handleCommand(text) {
    const raw = String(text || '').trim();
    const t = raw.toLowerCase();

    if (t === 'buy help' || t === 'usdt buy' || t === 'buy lmt help') {
      return { reply: helpText() };
    }

    if (t === 'buy status' || t === 'buy orders') {
      expireStale();
      const list = loadOrders().slice(-8).reverse();
      if (!list.length) return { reply: 'No buy orders yet.\n\n' + helpText() };
      const lines = list.map(function (o) {
        return (
          '• `' +
          o.id +
          '` **' +
          o.status +
          '** — ' +
          o.usdtPay +
          ' USDT → ' +
          o.lmtCredit +
          ' LMT (' +
          o.network +
          ')'
        );
      });
      return { reply: '**Recent buy orders**\n\n' + lines.join('\n') + '\n\n`buy check` to re-scan pending.' };
    }

    if (t === 'buy check' || t === 'check buy' || t === 'check deposit') {
      if (!isOnline()) return { reply: 'Go **online** to check blockchain explorers.' };
      expireStale();
      const active = activeOrders();
      if (!active.length) {
        return { reply: 'No pending buy orders. Start with `buy lmt 100`.' };
      }
      const results = await checkAllPending();
      const lines = results.map(function (r) {
        if (r.matched) {
          return '✅ **Paid** `' + r.order.id + '` — LMT credited. Tx: `' + (r.order.txId || 'n/a') + '`';
        }
        if (r.expired) return '⌛ Expired `' + (r.order && r.order.id) + '`';
        return (
          '⏳ `' +
          r.order.id +
          '` waiting — ' +
          ((r.result && r.result.note) || r.order.lastCheckNote || 'no match yet')
        );
      });
      return { reply: '**Deposit check**\n\n' + lines.join('\n') };
    }

    if (/^buy cancel\s+/i.test(raw)) {
      const id = raw.replace(/^buy cancel\s+/i, '').trim();
      const o = getOrder(id);
      if (!o) return { reply: 'Order not found: `' + id + '`' };
      if (o.status !== 'pending') return { reply: 'Order is already **' + o.status + '**.' };
      updateOrder(id, { status: 'cancelled', lastCheckNote: 'Cancelled by user' });
      return { reply: 'Order `' + id + '` cancelled.' };
    }

    // buy lmt <amount> [network]
    // buy <amount> lmt [network]   (e.g. "Buy 19 lmt")
    // purchase lmt <amount> [network]
    let m = raw.match(/^buy\s+lmt\s+([\d.]+)(?:\s+(\w+))?$/i);
    if (!m) m = raw.match(/^buy\s+([\d.]+)\s+lmt(?:\s+(\w+))?$/i);
    if (!m) m = raw.match(/^purchase\s+lmt\s+([\d.]+)(?:\s+(\w+))?$/i);
    if (m) {
      try {
        if (!isOnline()) {
          return { reply: 'You must be **online** to buy LMT with USDT.\n\nGo online, then try again: `buy lmt ' + m[1] + ' tron`' };
        }
        const order = createOrder(parseFloat(m[1]), m[2] || 'tron', '');
        notifyOperator(order);
        return { reply: formatOrder(order) };
      } catch (e) {
        return { reply: 'Buy failed: ' + (e.message || e) };
      }
    }

    // buy <amount> usdt [network]  → treat amount as USDT to spend
    const m2 = raw.match(/^buy\s+([\d.]+)\s+usdt(?:\s+(\w+))?$/i);
    if (m2) {
      try {
        if (!isOnline()) {
          return { reply: 'You must be **online** to buy LMT with USDT.' };
        }
        const usdt = parseFloat(m2[1]);
        const rate = priceUsdPerLmt();
        const lmt = usdt / rate;
        const order = createOrder(lmt, m2[2] || 'tron', '');
        notifyOperator(order);
        return { reply: formatOrder(order) };
      } catch (e) {
        return { reply: 'Buy failed: ' + (e.message || e) };
      }
    }

    // Bare "buy lmt" / "buy" → help
    if (/^(buy|buy\s+lmt|purchase\s+lmt)$/i.test(t)) {
      return { reply: helpText() };
    }

    return null;
  }

  // Auto-start poller if pending orders exist
  try {
    if (typeof window !== 'undefined') {
      setTimeout(function () {
        expireStale();
        if (activeOrders().length) ensurePoller();
      }, 2000);
    }
  } catch (_) {}

  return {
    createOrder,
    checkOrder,
    checkAllPending,
    activeOrders,
    getOrder,
    formatOrder,
    handleCommand,
    helpText,
    loadOrders,
    getMerchant,
    TTL_MS,
    DEFAULT_ADDRESSES
  };
})();

if (typeof window !== 'undefined') window.UsdtBuy = UsdtBuy;
