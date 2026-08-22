/**
 * Kanairoex Money Market Fund (MMF)
 * 5 tiers, annual yields 3%–7% (nothing above 7%).
 * Interest accrues continuously (compounded by second from APY).
 * Deposit / withdraw LMT; principal + accrued interest returned on withdraw.
 */
const KanairoexMMF = (() => {
  'use strict';

  const STORAGE_KEY = 'localmind_mmf_v1';
  const MAX_APY = 0.07; // hard cap 7%
  const MIN_DEPOSIT = 1;
  const MAX_DEPOSITS_PER_USER = 20;

  /** Five fixed tiers — none above 7% */
  const TIERS = [
    {
      id: 1,
      name: 'Steady',
      apy: 0.03, // 3%
      minLmt: 1,
      lockDays: 0,
      blurb: 'Flexible · 3% APY'
    },
    {
      id: 2,
      name: 'Balance',
      apy: 0.04, // 4%
      minLmt: 10,
      lockDays: 0,
      blurb: 'Balanced · 4% APY'
    },
    {
      id: 3,
      name: 'Growth',
      apy: 0.05, // 5%
      minLmt: 50,
      lockDays: 0,
      blurb: 'Growth · 5% APY'
    },
    {
      id: 4,
      name: 'Plus',
      apy: 0.06, // 6%
      minLmt: 100,
      lockDays: 7,
      blurb: 'Plus · 6% APY · 7-day soft lock'
    },
    {
      id: 5,
      name: 'Prime',
      apy: 0.07, // 7% max
      minLmt: 250,
      lockDays: 14,
      blurb: 'Prime · 7% APY · 14-day soft lock'
    }
  ];

  function assertApy(apy) {
    const a = Number(apy);
    if (!(a >= 0) || a > MAX_APY + 1e-12) {
      throw new Error('APY cannot exceed 7%.');
    }
    return a;
  }

  function loadState() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return { deposits: [] };
      const s = JSON.parse(raw);
      if (!s.deposits) s.deposits = [];
      return s;
    } catch (_) {
      return { deposits: [] };
    }
  }

  function saveState(s) {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(s));
    } catch (e) {
      throw new Error('Could not save MMF state (storage full).');
    }
  }

  function getTier(id) {
    const n = parseInt(id, 10);
    return TIERS.find(function (t) {
      return t.id === n;
    }) || null;
  }

  function uid() {
    return 'mmf_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
  }

  function roundLmt(n) {
    return Math.round(Number(n) * 1000) / 1000;
  }

  /**
   * Continuous compounding from annual rate:
   * value = principal * exp(apy * years)
   * years = elapsedMs / (365.25 * 24 * 3600 * 1000)
   */
  function accruedValue(deposit, atTs) {
    const apy = assertApy(deposit.apy);
    const principal = Number(deposit.principal) || 0;
    const start = Number(deposit.depositedAt) || Date.now();
    const end = atTs != null ? atTs : Date.now();
    const years = Math.max(0, (end - start) / (365.25 * 24 * 3600 * 1000));
    const value = principal * Math.exp(apy * years);
    return {
      principal: roundLmt(principal),
      value: roundLmt(value),
      interest: roundLmt(Math.max(0, value - principal)),
      years: years,
      apy: apy
    };
  }

  function requireWalletUnlocked() {
    if (typeof LMTWallet === 'undefined') throw new Error('Wallet not loaded.');
    if (LMTWallet.isLocked && LMTWallet.isLocked()) {
      throw new Error('Wallet locked. Type `wallet unlock` first.');
    }
  }

  function availableLmt() {
    if (typeof LMTWallet === 'undefined') return 0;
    return Number(LMTWallet.getBalance('LMT') || LMTWallet.getBalance() || 0);
  }

  /** Move LMT from wallet into MMF (debit spendable balance) */
  function debitWallet(amount, note) {
    requireWalletUnlocked();
    if (typeof LMTWallet !== 'undefined' && LMTWallet.debitForMmf) {
      return LMTWallet.debitForMmf(amount, note);
    }
    if (typeof LMTWallet !== 'undefined' && LMTWallet.holdLmtForWithdraw) {
      const h = LMTWallet.holdLmtForWithdraw(amount, { orderId: 'mmf', network: 'mmf' });
      return { holdId: h.holdId, amount: amount };
    }
    throw new Error('Wallet cannot debit for MMF');
  }

  function creditWallet(amount, note) {
    requireWalletUnlocked();
    if (LMTWallet.creditForMmf) {
      return LMTWallet.creditForMmf(amount, note);
    }
    // Fallback: creditPurchase-like
    if (LMTWallet.creditPurchase) {
      return LMTWallet.creditPurchase(amount, { orderId: 'mmf-withdraw', network: 'mmf', usdt: 0 });
    }
    throw new Error('Cannot credit wallet');
  }

  function listTiers() {
    return TIERS.map(function (t) {
      return {
        id: t.id,
        name: t.name,
        apyPct: Math.round(t.apy * 10000) / 100,
        minLmt: t.minLmt,
        lockDays: t.lockDays,
        blurb: t.blurb
      };
    });
  }

  function deposit(tierId, amount) {
    requireWalletUnlocked();
    const tier = getTier(tierId);
    if (!tier) throw new Error('Unknown tier. Use 1–5. Type `mmf` to list.');
    assertApy(tier.apy);
    const amt = roundLmt(amount);
    if (!(amt >= MIN_DEPOSIT)) throw new Error('Minimum deposit is ' + MIN_DEPOSIT + ' LMT.');
    if (amt < tier.minLmt) {
      throw new Error('Tier ' + tier.id + ' (' + tier.name + ') requires at least ' + tier.minLmt + ' LMT.');
    }
    const avail = availableLmt();
    if (amt > avail) {
      throw new Error('Insufficient LMT (available ' + roundLmt(avail) + ', need ' + amt + ').');
    }

    const state = loadState();
    if (state.deposits.length >= MAX_DEPOSITS_PER_USER) {
      throw new Error('Too many open MMF deposits (max ' + MAX_DEPOSITS_PER_USER + '). Withdraw some first.');
    }

    const debit = debitWallet(amt, 'MMF deposit tier ' + tier.id);
    const dep = {
      id: uid(),
      tierId: tier.id,
      tierName: tier.name,
      apy: tier.apy,
      principal: amt,
      depositedAt: Date.now(),
      lockUntil: tier.lockDays > 0 ? Date.now() + tier.lockDays * 86400000 : 0,
      holdId: debit && debit.holdId ? debit.holdId : null,
      status: 'active'
    };
    state.deposits.push(dep);
    saveState(state);
    return dep;
  }

  function getDeposit(id) {
    const state = loadState();
    return (
      state.deposits.find(function (d) {
        return d.id === id && d.status === 'active';
      }) || null
    );
  }

  function positions() {
    const state = loadState();
    const now = Date.now();
    return state.deposits
      .filter(function (d) {
        return d.status === 'active';
      })
      .map(function (d) {
        const a = accruedValue(d, now);
        return {
          id: d.id,
          tierId: d.tierId,
          tierName: d.tierName,
          apyPct: Math.round(d.apy * 10000) / 100,
          principal: a.principal,
          interest: a.interest,
          value: a.value,
          depositedAt: d.depositedAt,
          lockUntil: d.lockUntil || 0,
          locked: !!(d.lockUntil && now < d.lockUntil)
        };
      });
  }

  function summary() {
    const pos = positions();
    let principal = 0;
    let interest = 0;
    let value = 0;
    pos.forEach(function (p) {
      principal += p.principal;
      interest += p.interest;
      value += p.value;
    });
    return {
      count: pos.length,
      principal: roundLmt(principal),
      interest: roundLmt(interest),
      value: roundLmt(value),
      positions: pos,
      tiers: listTiers()
    };
  }

  function withdraw(depositId) {
    requireWalletUnlocked();
    const state = loadState();
    const idx = state.deposits.findIndex(function (d) {
      return d.id === depositId && d.status === 'active';
    });
    if (idx < 0) throw new Error('Deposit not found: ' + depositId);
    const d = state.deposits[idx];
    const now = Date.now();
    if (d.lockUntil && now < d.lockUntil) {
      const hours = Math.ceil((d.lockUntil - now) / 3600000);
      throw new Error(
        'Tier ' + d.tierName + ' is soft-locked for ~' + hours + ' more hours. Wait or choose a flexible tier next time.'
      );
    }
    const a = accruedValue(d, now);
    // Credit full value (principal + interest). If legacy hold exists, clear it without double-paying principal.
    if (d.holdId && typeof LMTWallet !== 'undefined' && LMTWallet.completeHoldToSystem) {
      try {
        // Burn the hold escrow (already left spendable at deposit via debitForMmf); ignore errors
        LMTWallet.completeHoldToSystem(d.holdId, { orderId: d.id });
      } catch (_) {}
    }
    if (typeof LMTWallet !== 'undefined' && LMTWallet.creditForMmf) {
      if (a.principal > 0) LMTWallet.creditForMmf(a.principal, 'MMF principal ' + d.id);
      if (a.interest > 0) LMTWallet.creditForMmf(a.interest, 'MMF interest ' + d.id);
    } else {
      creditWallet(a.value, 'MMF withdraw ' + d.id);
    }
    state.deposits[idx].status = 'closed';
    state.deposits[idx].closedAt = now;
    state.deposits[idx].closedValue = a.value;
    state.deposits[idx].closedInterest = a.interest;
    saveState(state);
    return {
      id: d.id,
      principal: a.principal,
      interest: a.interest,
      value: a.value,
      tierName: d.tierName,
      apyPct: Math.round(d.apy * 10000) / 100
    };
  }

  function formatSummary() {
    const s = summary();
    const lines = [
      '**Kanairoex Money Market Fund**',
      '',
      '_Five tiers · APY 3%–7% · nothing above 7%_',
      '',
      '**Your positions** (' + s.count + ')',
      '• Principal: **' + s.principal + ' LMT**',
      '• Accrued interest: **' + s.interest + ' LMT**',
      '• Current value: **' + s.value + ' LMT**',
      ''
    ];
    if (s.positions.length) {
      s.positions.forEach(function (p) {
        lines.push(
          '• `' +
            p.id +
            '` **T' +
            p.tierId +
            ' ' +
            p.tierName +
            '** ' +
            p.apyPct +
            '% — ' +
            p.principal +
            ' → **' +
            p.value +
            ' LMT** (+' +
            p.interest +
            ')' +
            (p.locked ? ' 🔒' : '')
        );
      });
      lines.push('');
    } else {
      lines.push('_No deposits yet._');
      lines.push('');
    }
    lines.push('**Tiers**');
    s.tiers.forEach(function (t) {
      lines.push(
        '• **T' +
          t.id +
          ' ' +
          t.name +
          '** — **' +
          t.apyPct +
          '% APY** · min ' +
          t.minLmt +
          ' LMT' +
          (t.lockDays ? ' · ' + t.lockDays + 'd lock' : ' · flexible')
      );
    });
    lines.push('');
    lines.push('**Commands**');
    lines.push('• `mmf deposit 2 50` — deposit 50 LMT into tier 2 (4%)');
    lines.push('• `mmf withdraw mmf_xxxx` — withdraw principal + interest');
    lines.push('• `mmf status` · `mmf tiers` · `mmf help`');
    return lines.join('\n');
  }

  function helpText() {
    return (
      '**Money Market Fund (MMF)**\n\n' +
      'Earn **3%–7% APY** on LMT (5 tiers, **max 7%**).\n\n' +
      '| Tier | Name | APY | Min LMT |\n' +
      '|------|------|-----|--------|\n' +
      '| 1 | Steady | 3% | 1 |\n' +
      '| 2 | Balance | 4% | 10 |\n' +
      '| 3 | Growth | 5% | 50 |\n' +
      '| 4 | Plus | 6% | 100 (7d lock) |\n' +
      '| 5 | Prime | 7% | 250 (14d lock) |\n\n' +
      '`mmf deposit <tier> <amount>`\n' +
      '`mmf withdraw <id>`\n' +
      '`mmf` / `mmf status`\n\n' +
      'Interest accrues continuously. Wallet must be unlocked.'
    );
  }

  async function handleCommand(text) {
    const raw = String(text || '').trim();
    const t = raw.toLowerCase();

    if (
      t === 'mmf' ||
      t === 'mmf status' ||
      t === 'money market' ||
      t === 'money market fund' ||
      t === 'fund status'
    ) {
      try {
        return { reply: formatSummary() };
      } catch (e) {
        return { reply: 'MMF error: ' + (e.message || e) };
      }
    }

    if (t === 'mmf help' || t === 'fund help') {
      return { reply: helpText() };
    }

    if (t === 'mmf tiers' || t === 'fund tiers') {
      const lines = ['**MMF tiers** (max **7%** APY)', ''];
      listTiers().forEach(function (x) {
        lines.push(
          '• **T' +
            x.id +
            ' ' +
            x.name +
            '** — **' +
            x.apyPct +
            '%** · min ' +
            x.minLmt +
            ' LMT' +
            (x.lockDays ? ' · ' + x.lockDays + 'd lock' : '')
        );
      });
      lines.push('', 'Deposit: `mmf deposit 2 50`');
      return { reply: lines.join('\n') };
    }

    const dep = raw.match(/^mmf\s+deposit\s+(\d)\s+([\d.]+)$/i);
    if (dep) {
      try {
        const d = deposit(parseInt(dep[1], 10), parseFloat(dep[2]));
        const a = accruedValue(d);
        return {
          reply:
            '**MMF deposit successful** ✅\n\n' +
            '• Id: `' +
            d.id +
            '`\n' +
            '• Tier **' +
            d.tierId +
            ' ' +
            d.tierName +
            '** — **' +
            Math.round(d.apy * 10000) / 100 +
            '% APY**\n' +
            '• Principal: **' +
            a.principal +
            ' LMT**\n' +
            (d.lockUntil
              ? '• Soft lock until: ' + new Date(d.lockUntil).toLocaleString() + '\n'
              : '• Flexible (no lock)\n') +
            '\nInterest starts accruing now. Check with `mmf status`.'
        };
      } catch (e) {
        return { reply: 'Deposit failed: ' + (e.message || e) };
      }
    }

    const wd = raw.match(/^mmf\s+withdraw\s+(mmf_[a-z0-9]+)$/i);
    if (wd) {
      try {
        const r = withdraw(wd[1]);
        return {
          reply:
            '**MMF withdraw complete** ✅\n\n' +
            '• Tier: **' +
            r.tierName +
            '** (' +
            r.apyPct +
            '% APY)\n' +
            '• Principal: **' +
            r.principal +
            ' LMT**\n' +
            '• Interest: **+' +
            r.interest +
            ' LMT**\n' +
            '• Total returned: **' +
            r.value +
            ' LMT**\n\n' +
            'Funds are back in your wallet. `wallet` / `balance`'
        };
      } catch (e) {
        return { reply: 'Withdraw failed: ' + (e.message || e) };
      }
    }

    if (/^mmf\b/i.test(t) || /^fund\b/i.test(t)) {
      return { reply: helpText() };
    }

    return null;
  }

  // Enforce tier APY never > 7% at load
  TIERS.forEach(function (t) {
    if (t.apy > MAX_APY) t.apy = MAX_APY;
  });

  return {
    TIERS,
    MAX_APY,
    listTiers,
    deposit,
    withdraw,
    positions,
    summary,
    formatSummary,
    helpText,
    handleCommand,
    accruedValue
  };
})();

if (typeof window !== 'undefined') window.KanairoexMMF = KanairoexMMF;
