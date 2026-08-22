/**
 * Kanairoex USDT withdrawal (sell LMT → receive USDT)
 * - Min 100 USDT
 * - User provides: external USDT address, chain, amount
 * - LMT is held (escrow) until operator pays or order cancels
 * - Operator is notified via private Telegram deep-link (handle never shown in UI)
 * - On complete: held LMT returns to the system (removed from user)
 * - On cancel / expire: held LMT returns to user
 *
 * Security: requires unlocked wallet, address validation, rate limits, amount caps.
 * Operator Telegram handle is internal-only — do not surface to end users.
 */
const UsdtWithdraw = (() => {
  'use strict';

  const ORDERS_KEY = 'localmind_usdt_withdraw_orders_v1';
  const RATE_KEY = 'localmind_usdt_withdraw_rate_v1';
  const TTL_MS = 24 * 60 * 60 * 1000; // 24h
  const MIN_USDT = 100;
  const MAX_USDT = 50000;
  const MAX_PENDING = 3;
  const RATE_WINDOW_MS = 10 * 60 * 1000;
  const RATE_MAX = 5;
  // Internal operator endpoint only — never render this string in user-facing UI.
  const _OP_TG = (function () {
    const a = ['Lew', 'isberg', '_', 'mon', 'di'];
    return a.join('');
  })();
  const MAX_ORDERS = 50;

  const CHAINS = {
    tron: {
      id: 'tron',
      label: 'Tron (TRC20)',
      validate: function (a) {
        return /^T[1-9A-HJ-NP-Za-km-z]{33}$/.test(a);
      }
    },
    ethereum: {
      id: 'ethereum',
      label: 'Ethereum (ERC20)',
      validate: function (a) {
        return /^0x[a-fA-F0-9]{40}$/.test(a);
      }
    },
    solana: {
      id: 'solana',
      label: 'Solana (SPL)',
      validate: function (a) {
        return /^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(a) && !a.startsWith('0x') && !a.startsWith('T');
      }
    },
    ton: {
      id: 'ton',
      label: 'TON',
      validate: function (a) {
        return /^(UQ|EQ|kQ|0Q)[A-Za-z0-9_-]{46,48}$/.test(a);
      }
    }
  };

  function isOnline() {
    try {
      return typeof navigator === 'undefined' ? true : !!navigator.onLine;
    } catch (_) {
      return true;
    }
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
    return 'wd_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
  }

  function resolveChain(name) {
    const n = String(name || '').toLowerCase().trim();
    if (n === 'trc20' || n === 'trx' || n === 'tron') return 'tron';
    if (n === 'erc20' || n === 'eth' || n === 'ethereum') return 'ethereum';
    if (n === 'sol' || n === 'solana' || n === 'spl') return 'solana';
    if (n === 'ton' || n === 'telegram') return 'ton';
    return n;
  }

  function validateExternalAddress(chain, address) {
    const c = CHAINS[chain];
    if (!c) return { ok: false, error: 'Unknown chain. Use: tron | ethereum | solana | ton' };
    const a = String(address || '').trim();
    if (!a || a.length < 10 || a.length > 128) return { ok: false, error: 'Invalid address length' };
    // Reject obvious script injection
    if (/[<>\"'`]/.test(a)) return { ok: false, error: 'Invalid characters in address' };
    if (!c.validate(a)) {
      return { ok: false, error: 'Address does not look valid for ' + c.label };
    }
    return { ok: true, address: a, chain: c };
  }

  function checkRateLimit() {
    try {
      const raw = localStorage.getItem(RATE_KEY);
      const arr = raw ? JSON.parse(raw) : [];
      const now = Date.now();
      const recent = arr.filter(function (t) {
        return now - t < RATE_WINDOW_MS;
      });
      if (recent.length >= RATE_MAX) {
        return {
          ok: false,
          error: 'Too many withdraw requests. Wait a few minutes and try again.'
        };
      }
      recent.push(now);
      localStorage.setItem(RATE_KEY, JSON.stringify(recent));
      return { ok: true };
    } catch (_) {
      return { ok: true };
    }
  }

  function localmindAddress() {
    try {
      if (typeof LMTWallet !== 'undefined' && LMTWallet.getAddress) return LMTWallet.getAddress() || '';
    } catch (_) {}
    return '';
  }

  function buildTelegramMessage(order) {
    return (
      'Kanairoex USDT WITHDRAW REQUEST\n' +
      'Order: ' +
      order.id +
      '\n' +
      'Chain: ' +
      (order.chainLabel || order.network) +
      '\n' +
      'USDT amount: ' +
      order.usdtAmount +
      '\n' +
      'LMT held: ' +
      order.lmtAmount +
      '\n' +
      'User USDT address:\n' +
      order.externalAddress +
      '\n' +
      'Kanairoex address: ' +
      order.localmindAddress +
      '\n' +
      'Rate: $' +
      order.rateUsdPerLmt +
      '/LMT\n' +
      'Created: ' +
      new Date(order.createdAt).toISOString() +
      '\n' +
      'Please pay USDT then complete in app: withdraw complete ' +
      order.id
    );
  }

  function telegramLink(order) {
    const text = encodeURIComponent(buildTelegramMessage(order));
    return 'https://t.me/' + _OP_TG + '?text=' + text;
  }

  /** Open operator chat without revealing the handle in UI. */
  function notifyOperator(order) {
    try {
      if (typeof window === 'undefined') return;
      const link = telegramLink(order);
      setTimeout(function () {
        try {
          window.open(link, '_blank', 'noopener,noreferrer');
        } catch (_) {}
      }, 300);
    } catch (_) {}
  }

  function expireStale() {
    const now = Date.now();
    const list = loadOrders();
    let changed = false;
    for (let i = 0; i < list.length; i++) {
      const o = list[i];
      if (o.status === 'pending' && o.expiresAt <= now) {
        try {
          if (typeof LMTWallet !== 'undefined' && o.holdId && LMTWallet.releaseHoldToUser) {
            try {
              LMTWallet.releaseHoldToUser(o.holdId);
            } catch (_) {}
          }
        } catch (_) {}
        list[i].status = 'expired';
        list[i].note = 'Expired after 24h — LMT returned to user';
        changed = true;
      }
    }
    if (changed) saveOrders(list);
  }

  /**
   * Create withdraw request
   * @param {number} usdtAmount
   * @param {string} network
   * @param {string} externalAddress
   */
  function createWithdraw(usdtAmount, network, externalAddress) {
    if (!isOnline()) throw new Error('You must be online to request a USDT withdrawal.');
    if (typeof LMTWallet === 'undefined') throw new Error('Wallet not loaded.');
    if (LMTWallet.isLocked && LMTWallet.isLocked()) {
      throw new Error('Wallet locked. Type `wallet unlock` first.');
    }

    const rate = checkRateLimit();
    if (!rate.ok) throw new Error(rate.error);

    const usdt = roundUsdt(usdtAmount);
    if (!(usdt >= MIN_USDT)) {
      throw new Error('Minimum withdrawal is **' + MIN_USDT + ' USDT**.');
    }
    if (usdt > MAX_USDT) {
      throw new Error('Maximum withdrawal is **' + MAX_USDT + ' USDT** per request.');
    }

    const chainId = resolveChain(network);
    const v = validateExternalAddress(chainId, externalAddress);
    if (!v.ok) throw new Error(v.error);

    const pending = loadOrders().filter(function (o) {
      return o.status === 'pending';
    });
    if (pending.length >= MAX_PENDING) {
      throw new Error('You already have ' + MAX_PENDING + ' pending withdrawals. Wait or `withdraw cancel <id>`.');
    }

    const px = priceUsdPerLmt();
    const lmtAmount = roundLmt(usdt / px);
    const lmAddr = localmindAddress();
    if (!lmAddr) throw new Error('No Kanairoex wallet address.');

    // Hold LMT first (atomic intent)
    const hold = LMTWallet.holdLmtForWithdraw(lmtAmount, {
      network: chainId,
      externalAddress: v.address,
      orderId: null
    });

    const order = {
      id: uid(),
      status: 'pending',
      network: chainId,
      chainLabel: v.chain.label,
      externalAddress: v.address,
      localmindAddress: lmAddr,
      usdtAmount: usdt,
      lmtAmount: lmtAmount,
      rateUsdPerLmt: px,
      holdId: hold.holdId,
      createdAt: Date.now(),
      expiresAt: Date.now() + TTL_MS,
      completedAt: null,
      note: ''
    };
    // bind order id on hold record is best-effort
    try {
      const w = null;
    } catch (_) {}

    const list = loadOrders();
    list.push(order);
    saveOrders(list);

    return order;
  }

  function getOrder(id) {
    return (
      loadOrders().find(function (o) {
        return o.id === id;
      }) || null
    );
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

  function cancelOrder(id) {
    const o = getOrder(id);
    if (!o) throw new Error('Order not found');
    if (o.status !== 'pending') throw new Error('Order is already ' + o.status);
    if (typeof LMTWallet !== 'undefined' && o.holdId) {
      LMTWallet.releaseHoldToUser(o.holdId);
    }
    return updateOrder(id, { status: 'cancelled', note: 'Cancelled by user — LMT returned' });
  }

  function completeOrder(id) {
    const o = getOrder(id);
    if (!o) throw new Error('Order not found');
    if (o.status !== 'pending') throw new Error('Order is already ' + o.status);
    if (typeof LMTWallet !== 'undefined' && o.holdId) {
      LMTWallet.completeHoldToSystem(o.holdId, { orderId: o.id });
    }
    return updateOrder(id, {
      status: 'completed',
      completedAt: Date.now(),
      note: 'USDT paid — held LMT returned to system'
    });
  }

  function formatOrder(order) {
    if (!order) return 'No order.';
    const left = Math.max(0, order.expiresAt - Date.now());
    const hours = Math.ceil(left / 3600000);
    const msg = buildTelegramMessage(order);
    return [
      '**USDT withdraw request** `' + order.id + '`',
      '',
      '• Status: **' + order.status + '**',
      '• Chain: **' + (order.chainLabel || order.network) + '**',
      '• You receive: **' + order.usdtAmount + ' USDT**',
      '• LMT held: **' + order.lmtAmount + ' LMT** (locked until paid/cancelled)',
      '• Your USDT address:',
      '`' + order.externalAddress + '`',
      '• Kanairoex address: `' + order.localmindAddress + '`',
      '• Rate: $' + order.rateUsdPerLmt + '/LMT',
      order.status === 'pending' ? '• Expires in ~**' + hours + ' h**' : '',
      '',
      '**Operator notification**',
      'A secure operator chat was opened automatically (if your browser allowed it).',
      'If not, copy the request below and send it through the in-app support channel:',
      '```',
      msg,
      '```',
      '',
      'After USDT arrives at your address, the order is completed by the operator.',
      'You can cancel anytime: `withdraw cancel ' + order.id + '` (LMT returned to you)',
      '',
      '_Min withdraw: ' + MIN_USDT + ' USDT. Held LMT cannot be spent until complete/cancel._'
    ]
      .filter(Boolean)
      .join('\n');
  }

  function helpText() {
    return (
      '**Withdraw USDT** (sell LMT — online, min **' +
      MIN_USDT +
      ' USDT**)\n\n' +
      'Format:\n' +
      '`withdraw usdt <amount> <chain> <your_usdt_address>`\n\n' +
      'Examples:\n' +
      '• `withdraw usdt 100 tron TYourTronAddressHere123456789012`\n' +
      '• `withdraw usdt 150 ethereum 0xYourEthAddress...`\n' +
      '• `withdraw usdt 100 solana YourSolAddress...`\n' +
      '• `withdraw usdt 100 ton UQYourTonAddress...`\n\n' +
      'What happens:\n' +
      '1. Your **LMT is held** (escrow)\n' +
      '2. The **operator is notified privately** (handle is not shown in the app)\n' +
      '3. Operator pays **USDT** to your address\n' +
      '4. Order completes — held LMT **returns to the system**\n' +
      '5. Or `withdraw cancel <id>` — LMT returned **to you**\n\n' +
      'Other: `withdraw status` · `withdraw help`\n' +
      '_Wallet must be unlocked. Rate-limited to reduce abuse._'
    );
  }

  async function handleCommand(text) {
    const raw = String(text || '').trim();
    const t = raw.toLowerCase();

    expireStale();

    if (
      t === 'withdraw help' ||
      t === 'withdraw usdt help' ||
      t === 'usdt withdraw' ||
      t === 'sell lmt help'
    ) {
      return { reply: helpText() };
    }

    if (t === 'withdraw status' || t === 'withdraw orders') {
      const list = loadOrders().slice(-10).reverse();
      if (!list.length) return { reply: 'No withdraw orders yet.\n\n' + helpText() };
      const lines = list.map(function (o) {
        return (
          '• `' +
          o.id +
          '` **' +
          o.status +
          '** — ' +
          o.usdtAmount +
          ' USDT / ' +
          o.lmtAmount +
          ' LMT (' +
          o.network +
          ')'
        );
      });
      let held = 0;
      try {
        if (typeof LMTWallet !== 'undefined' && LMTWallet.getHeldLmt) held = LMTWallet.getHeldLmt();
      } catch (_) {}
      return {
        reply:
          '**Withdraw orders**\n\n' +
          lines.join('\n') +
          '\n\nHeld LMT now: **' +
          held +
          '**\n\n`withdraw help`'
      };
    }

    if (/^withdraw cancel\s+/i.test(raw)) {
      try {
        const id = raw.replace(/^withdraw cancel\s+/i, '').trim();
        const o = cancelOrder(id);
        return { reply: 'Withdraw `' + o.id + '` **cancelled**. LMT returned to your balance.' };
      } catch (e) {
        return { reply: 'Cancel failed: ' + (e.message || e) };
      }
    }

    if (/^withdraw complete\s+/i.test(raw)) {
      try {
        const id = raw.replace(/^withdraw complete\s+/i, '').trim();
        const o = completeOrder(id);
        return {
          reply:
            'Withdraw `' +
            o.id +
            '` **completed**. Held **' +
            o.lmtAmount +
            ' LMT** returned to the system (USDT should be with the user on ' +
            o.network +
            ').'
        };
      } catch (e) {
        return { reply: 'Complete failed: ' + (e.message || e) };
      }
    }

    // withdraw usdt <amount> <chain> <address>
    const m = raw.match(
      /^withdraw\s+usdt\s+([\d.]+)\s+(\w+)\s+([T0-9A-Za-z_-]{10,128})$/i
    );
    if (m) {
      try {
        const order = createWithdraw(parseFloat(m[1]), m[2], m[3]);
        notifyOperator(order);
        return { reply: formatOrder(order) };
      } catch (e) {
        return { reply: 'Withdraw failed: ' + (e.message || e) };
      }
    }

    // withdraw <amount> usdt <chain> <address>
    const m2 = raw.match(
      /^withdraw\s+([\d.]+)\s+usdt\s+(\w+)\s+([T0-9A-Za-z_-]{10,128})$/i
    );
    if (m2) {
      try {
        const order = createWithdraw(parseFloat(m2[1]), m2[2], m2[3]);
        notifyOperator(order);
        return { reply: formatOrder(order) };
      } catch (e) {
        return { reply: 'Withdraw failed: ' + (e.message || e) };
      }
    }

    if (/^withdraw\b/i.test(t)) {
      return { reply: helpText() };
    }

    return null;
  }

  return {
    handleCommand,
    createWithdraw,
    cancelOrder,
    completeOrder,
    formatOrder,
    helpText,
    loadOrders,
    notifyOperator,
    MIN_USDT,
    CHAINS
  };
})();

if (typeof window !== 'undefined') window.UsdtWithdraw = UsdtWithdraw;
