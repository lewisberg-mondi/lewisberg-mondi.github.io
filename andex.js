/**
 * Kanairoex Advanced Hub — practical modules only
 * Multi-token wallet · WebRTC P2P · system status
 */
const Advanced = (() => {
  async function fullStatus() {
    return {
      opfs: typeof OPFSStore !== "undefined" ? await OPFSStore.status() : { supported: false },
      webrtc: typeof WebRTCPeer !== "undefined" ? WebRTCPeer.status() : { supported: false },
      idb: typeof IDBStore !== "undefined" ? await IDBStore.status() : { supported: false },
      crypto: typeof CryptoUtils !== "undefined" ? CryptoUtils.status() : { supported: false },
      wallet:
        typeof LMTWallet !== "undefined"
          ? { loaded: true, address: LMTWallet.getAddress() }
          : { loaded: false }
    };
  }

  async function handleCommand(text) {
    const t = (text || "").trim().toLowerCase();
    const raw = (text || "").trim();

    if (t === "advanced status" || t === "tech status" || t === "feature status" || t === "status") {
      const s = await fullStatus();
      const lines = ["**System status**\n"];
      const ch = (s.webrtc && s.webrtc.channel) || "none";
      lines.push("• WebRTC: " + (s.webrtc && s.webrtc.supported ? "✅" : "❌") + " · channel **" + ch + "**");
      lines.push("• Wallet: " + (s.wallet && s.wallet.loaded ? "✅ `" + s.wallet.address + "`" : "❌"));
      lines.push("• OPFS: " + (s.opfs && s.opfs.supported ? "✅" : "❌"));
      lines.push("• IndexedDB: " + (s.idb && s.idb.supported ? "✅" : "❌"));
      if (typeof LMTWallet !== "undefined") {
        const w = LMTWallet.info();
        lines.push("• 💎 LMT: **" + w.balance + "** · portfolio ≈ **" + (w.portfolioUsd || w.valueUsd) + " USD**");
        const ob = (LMTWallet.loadOutbox && LMTWallet.loadOutbox()) || [];
        lines.push("• Outbox: **" + ob.length + "** queued");
      }
      lines.push("\n**Commands:** `wallet` · `create token MYT Name 1000000 0.01 🚀` · `pay 10 MYT LMT-ADDR` · `p2p pay …` · `webrtc offer` · `flush outbox`");
      return { reply: lines.join("\n") };
    }

    if (t === "wallet" || t === "lmt wallet" || t === "balance" || t === "lmt balance" || t === "my wallet" || t === "my balance" || t === "check balance" || t === "lmt" || t === "show balance" || t === "show wallet") {
      if (typeof LMTWallet === "undefined") return { reply: "Wallet not loaded." };
      const w = LMTWallet.info();
      const portfolio = (w.portfolio || []).map(function (p) {
        const em = p.emoji || (p.symbol === "LMT" ? "💎" : "");
        const label = (typeof LMTWallet.displaySymbol === "function")
          ? LMTWallet.displaySymbol(p.symbol)
          : ((em ? em + " " : "") + p.symbol);
        // Always show ticker symbol so balance is unambiguous
        return "  • **" + label + "** (" + (p.name || p.symbol) + "): **" + p.balance + " " + p.symbol + "** · @" + p.priceUsd + " USD · ≈ " + p.valueUsd + " USD";
      }).join("\n");
      return {
        reply:
          "**Multi-token wallet** 💎\n\n" +
          "• Address: `" + w.address + "`\n" +
          "• Locked: " + (w.locked ? "**yes** — `wallet unlock`" : "no") + " · Password: " + (w.passwordSet ? "set" : "none") + "\n" +
          "• **Symbol: 💎 LMT** · Balance: **" + w.balance + " LMT** @" + w.priceUsdPerLmt + " USD · ≈ **" + w.valueUsd + " USD**\n" +
          "• Portfolio ≈ **" + (w.portfolioUsd || w.valueUsd) + " USD**\n" +
          (portfolio ? "\n**Holdings**\n" + portfolio + "\n" : "") +
          "\n**Commands:**\n`create token MYT MyToken 1000000 0.01 🚀` *(emoji required)*\n`pay 20 LMT-ADDR` · `pay 10 MYT LMT-ADDR`\n`p2p pay 5 MYT LMT-ADDR`\n`add liquidity 100 LMT MYT 90000`\n`remove liquidity MYT 10`\n`lp MYT` · `flush outbox`"
      };
    }

    if (t === "wallet password" || t === "set wallet password" || t === "lmt password") {
      if (typeof LMTWallet === "undefined") return { reply: "Wallet not loaded." };
      const r = await LMTWallet.startSetPassword();
      return { reply: r.instructions };
    }
    if (t === "wallet unlock" || t === "unlock wallet" || t === "lmt unlock") {
      if (typeof LMTWallet === "undefined") return { reply: "Wallet not loaded." };
      const r = await LMTWallet.startUnlock();
      return { reply: r.instructions || r.message };
    }
    if (t === "wallet lock" || t === "lock wallet") {
      if (typeof LMTWallet === "undefined") return { reply: "Wallet not loaded." };
      return { reply: LMTWallet.lock() };
    }
    if (/^wallet solve\s+/i.test(raw) || /^lmt solve\s+/i.test(raw)) {
      if (typeof LMTWallet === "undefined") return { reply: "Wallet not loaded." };
      const body = raw.replace(/^(wallet|lmt)\s+solve\s+/i, "");
      const r = await LMTWallet.submitSolve(body);
      return { reply: r.message || (r.ok ? "OK" : "Failed") };
    }

    if (t === "lmt history" || t === "wallet history") {
      if (typeof LMTWallet === "undefined") return { reply: "Wallet not loaded." };
      const h = LMTWallet.history(15);
      if (!h.length) return { reply: "No history yet." };
      return {
        reply: "**Recent activity**\n\n" + h.map(function (x) {
          return "• " + (x.type || "?") + " **" + x.amount + " " + (x.asset || "LMT") + "**" +
            (x.to ? " → `" + x.to + "`" : "") + (x.from ? " from `" + x.from + "`" : "");
        }).join("\n")
      };
    }

    if (t === "lmt faucet" || t === "faucet") {
      if (typeof LMTWallet === "undefined") return { reply: "Wallet not loaded." };
      try {
        const bal = LMTWallet.faucet(1);
        return { reply: "Faucet +1 💎 LMT · balance **" + bal + " LMT**" };
      } catch (e) {
        return { reply: "Faucet failed: " + e.message };
      }
    }

    if (t === "lmt price" || t === "price lmt") {
      if (typeof LMTWallet === "undefined") return { reply: "Wallet not loaded." };
      return { reply: "💎 LMT price (sim): **" + LMTWallet.priceUsdPerLmt() + " USD/LMT**" };
    }

    if (t === "explorer" || t === "lmt explorer") {
      if (typeof LMTWallet === "undefined") return { reply: "Wallet not loaded." };
      const ex = LMTWallet.explorer();
      const lines = (ex.recent || []).slice(0, 8).map(function (x) {
        return "• " + (x.type || "tx") + " " + x.amount + " " + (x.asset || "LMT");
      });
      return {
        reply: "**Local explorer**\n\n• Address: `" + ex.address + "`\n• Balance: **" + ex.balanceLmt +
          " LMT**\n• Outbox: " + ex.outbox + "\n\n" + (lines.join("\n") || "(no txs)")
      };
    }

    if (t === "outbox" || t === "lmt outbox" || t === "flush outbox") {
      if (typeof LMTWallet === "undefined") return { reply: "Wallet not loaded." };
      if (t === "flush outbox") {
        const r = LMTWallet.flushOutbox();
        let extra = "";
        if (r.remaining > 0) {
          const st = typeof WebRTCPeer !== "undefined" ? WebRTCPeer.status() : {};
          extra = "\n\nChannel: **" + (st.channel || "none") + "**\n" +
            (r.reason ? "Note: " + r.reason + "\n" : "") +
            "Finish `webrtc offer` / `webrtc answer` so the channel is **open**.";
        }
        return { reply: "Flushed outbox: sent **" + r.sent + "** · remaining **" + r.remaining + "**" + extra };
      }
      const q = LMTWallet.loadOutbox();
      if (!q.length) return { reply: "Outbox empty. ✅" };
      return {
        reply: "**Queued transfers** (" + q.length + ")\n\n" +
          q.map(function (x) {
            return "• " + x.amount + " " + (x.symbol || "LMT") + " → `" + x.to + "`";
          }).join("\n") +
          "\n\nWhen channel is open: `flush outbox`"
      };
    }

    if (/^pay\s+/i.test(raw) || /^send lmt\s+/i.test(raw) || /^lmt send\s+/i.test(raw) ||
        /^p2p pay\s+/i.test(raw) || /^p2p send lmt\s+/i.test(raw) || /^send\s+[\d.]/i.test(raw)) {
      if (typeof LMTWallet === "undefined") return { reply: "Wallet not loaded." };
      const viaP2P = /^p2p\s+/i.test(raw) || /^webrtc\s+/i.test(raw);
      let m = raw.match(/^(?:p2p\s+|webrtc\s+)?(?:pay|send lmt|lmt send|send)\s+([\d.]+)\s+([A-Z]{2,8})\s+(?:to\s+)?(LMT-[A-Za-z0-9]+)\b(?:\s+(.+))?$/i);
      let amount, symbol, toAddr, note;
      if (m) {
        amount = parseFloat(m[1]); symbol = m[2].toUpperCase(); toAddr = m[3]; note = m[4];
      } else {
        m = raw.match(/^(?:p2p\s+|webrtc\s+)?(?:pay|send lmt|lmt send|send)\s+([\d.]+)\s+(?:to\s+)?(LMT-[A-Za-z0-9]+)\b(?:\s+(.+))?$/i);
        if (!m) {
          return { reply: "**Send tokens**\n\n• `pay 20 LMT-ABCD1234`\n• `pay 10 MYT LMT-ABCD1234`\n• `p2p pay 5 MYT LMT-ABCD1234`\n\nYour address: `" + LMTWallet.getAddress() + "`" };
        }
        amount = parseFloat(m[1]); symbol = "LMT"; toAddr = m[2]; note = m[3];
      }
      try {
        const tx = await LMTWallet.send(amount, toAddr, note || (viaP2P ? "P2P pay" : "transfer"), viaP2P, symbol);
        const queued = viaP2P && (typeof WebRTCPeer === "undefined" || WebRTCPeer.channelState() !== "open");
        const bal = LMTWallet.getBalance(tx.symbol);
        return {
          reply: (viaP2P ? "P2P " : "") + "Sent **" + tx.amount + " " + tx.symbol + "** → `" + tx.to + "`\nTx: `" + tx.txId +
            "` · Balance: **" + bal + " " + tx.symbol + "**" +
            (queued ? "\n\n_Queued in outbox — open P2P then `flush outbox`._" : "")
        };
      } catch (e) {
        return { reply: "Send failed: " + e.message };
      }
    }

    if (/^create token\s+/i.test(raw) || /^create symbol\s+/i.test(raw)) {
      if (typeof LMTWallet === "undefined") return { reply: "Wallet not loaded." };
      const body = raw.replace(/^(create token|create symbol)\s+/i, "").trim();
      // Parse: SYM Name supply [price] EMOJI — emoji required
      let emoji = "";
      if (LMTWallet.extractEmojiFromText) {
        emoji = LMTWallet.extractEmojiFromText(body) || "";
      }
      let rest = body;
      if (emoji) {
        // strip last occurrence of emoji from body
        const idxE = body.lastIndexOf(emoji);
        if (idxE >= 0) rest = (body.slice(0, idxE) + body.slice(idxE + emoji.length)).trim();
      } else {
        const tail = body.split(/\s+/);
        if (tail.length) {
          const last = tail[tail.length - 1];
          if (LMTWallet.isEmojiSymbol && LMTWallet.isEmojiSymbol(last)) {
            emoji = last;
            rest = body.slice(0, body.length - last.length).trim();
          }
        }
      }
      const parts = rest.split(/\s+/).filter(Boolean);
      const symbol = (parts[0] || "").toUpperCase();
      // name may be multi-word until a number
      let nameParts = [];
      let supply = 1000000;
      let baseUsd = 0.0001;
      let i = 1;
      while (i < parts.length && !/^[\d.]+$/.test(parts[i])) {
        nameParts.push(parts[i]);
        i++;
      }
      const name = nameParts.length ? nameParts.join(" ") : symbol;
      if (i < parts.length && /^[\d.]+$/.test(parts[i])) {
        supply = Number(parts[i]);
        i++;
      }
      if (i < parts.length && /^[\d.]+$/.test(parts[i])) {
        baseUsd = Number(parts[i]);
        i++;
      }
      // If emoji was not at the end, check remaining tokens
      if (!emoji && i < parts.length) {
        const maybe = parts.slice(i).join("");
        if (LMTWallet.isEmojiSymbol && LMTWallet.isEmojiSymbol(maybe)) emoji = maybe;
      }
      if (!emoji) {
        return {
          reply:
            "**Emoji required** to create a token 💎\n\n" +
            "Format:\n`create token SYM Name supply price EMOJI`\n\n" +
            "Examples:\n" +
            "• `create token MYT MyToken 1000000 0.01 🚀`\n" +
            "• `create token FIRE FireCoin 500000 0.05 🔥`\n" +
            "• `create token STAR StarToken 1000000 0.02 ⭐`\n\n" +
            "LMT itself uses **💎**. Your token needs its own emoji symbol."
        };
      }
      try {
        const r = LMTWallet.createToken(symbol, name, supply, baseUsd, emoji);
        const px = LMTWallet.priceUsdPerToken(symbol);
        const st = (LMTWallet.tokenStats && LMTWallet.tokenStats(symbol)) || {};
        return {
          reply: "**Token created** " + emoji + " (pool-backed by 💎 LMT)\n\n" +
            "• " + emoji + " `" + r.meta.symbol + "` — " + r.meta.name + "\n" +
            "• Max supply: **" + supply + "**\n" +
            "• **Your share (creator): 10%** = **" + r.balance + " " + symbol + "**\n" +
            "• **For sale in pool: 90%** = **" + (st.availableInPool != null ? st.availableInPool : r.availableInPool) + " " + symbol + "** — others buy with `swap`\n" +
            "• Create fee **" + (r.feeLmt || 10000) + " 💎 LMT** → **liquidity pool**\n" +
            "• Pool now: **" + (st.poolLmt != null ? st.poolLmt : r.feeLmt) + " 💎** + **" + (st.poolToken || "?") + " " + symbol + "**\n" +
            "• Price: **" + (st.priceLmt != null ? st.priceLmt : "?") + " 💎** · **" + (st.priceUsd != null ? st.priceUsd : px) + " USD**\n" +
            "• 💎 LMT left: **" + r.lmtBalance + "**\n\n" +
            "Others (any device): `swap 100 LMT " + symbol + "` after `sync pools` / P2P.\n" +
            "Stats: `token " + symbol + "` · Markets: `markets`"
        };
      } catch (e) {
        return { reply: "Create token failed: " + e.message };
      }
    }

    // Liquidity-provider commands
    if (/^(add liquidity|add lp)\s+/i.test(raw)) {
      if (typeof LMTWallet === "undefined") return { reply: "Wallet not loaded." };
      const m = raw.match(/^(?:add liquidity|add lp)\s+([\d.]+)\s+LMT\s+([A-Za-z][A-Za-z0-9]{1,7})\s+([\d.]+)$/i);
      if (!m) return { reply: "**Add liquidity**\n\n`add liquidity 100 LMT MYT 90000`\n\nThe LMT and token amounts must match the pool ratio." };
      try {
        const r = LMTWallet.addLiquidity(Number(m[1]), m[2], Number(m[3]));
        return { reply: "**Liquidity added** ✅\n\n• Deposited: **" + r.amountLmt + " 💎 LMT** + **" + r.amountToken + " " + r.token + "**\n• LP shares: **" + r.lpShares + "**\n• Your LP balance: **" + r.lpBalance + "**\n• Pool: **" + r.pool.poolLmt + " 💎** + **" + r.pool.poolToken + " " + r.token + "**" };
      } catch(e) { return { reply: "Add liquidity failed: " + e.message }; }
    }

    if (/^(remove liquidity|remove lp)\s+/i.test(raw)) {
      if (typeof LMTWallet === "undefined") return { reply: "Wallet not loaded." };
      const m = raw.match(/^(?:remove liquidity|remove lp)\s+([A-Za-z][A-Za-z0-9]{1,7})\s+([\d.]+)$/i);
      if (!m) return { reply: "**Remove liquidity**\n\n`remove liquidity MYT 10`" };
      try {
        const r = LMTWallet.removeLiquidity(m[1], Number(m[2]));
        return { reply: "**Liquidity removed** ✅\n\n• Burned LP shares: **" + r.lpShares + "**\n• Received: **" + r.amountLmt + " 💎 LMT** + **" + r.amountToken + " " + r.token + "**\n• Remaining LP: **" + r.lpBalance + "**" };
      } catch(e) { return { reply: "Remove liquidity failed: " + e.message }; }
    }

    if (/^(lp|liquidity)\s+/i.test(raw)) {
      if (typeof LMTWallet === "undefined") return { reply: "Wallet not loaded." };
      const m = raw.match(/^(?:lp|liquidity)\s+([A-Za-z][A-Za-z0-9]{1,7})$/i);
      if (!m) return { reply: "Use `lp MYT` to view your liquidity position." };
      const st = LMTWallet.tokenStats(m[1]);
      if (!st) return { reply: "Unknown token `" + m[1].toUpperCase() + "`." };
      return { reply: "**Liquidity position " + st.emoji + " " + st.symbol + "**\n\n• Your LP shares: **" + st.lpBalance + "**\n• Total LP shares: **" + st.lpSupply + "**\n• Pool: **" + st.poolLmt + " 💎** + **" + st.poolToken + " " + st.symbol + "**\n• Pool fee: **0.30%** per swap\n\n`add liquidity 100 LMT " + st.symbol + " <token amount>`\n`remove liquidity " + st.symbol + " <LP shares>`" };
    }

    // swap 100 LMT MYT  |  exchange 50 MYT LMT
    if (/^(swap|exchange)\s+/i.test(raw)) {
      if (typeof LMTWallet === "undefined") return { reply: "Wallet not loaded." };
      const m = raw.match(/^(?:swap|exchange)\s+([\d.]+)\s+([A-Za-z]{2,8})\s+(?:to\s+)?([A-Za-z]{2,8})\b/i);
      if (!m) {
        return {
          reply: "**Swap tokens** (system rates, Kanairoex chain)\n\n`swap 100 LMT MYT`\n`swap 50 MYT LMT`\n`exchange 10 MYT OTHER`\n\nCreate fee: **" + (LMTWallet.CREATE_FEE_LMT || 10000) + " LMT** · owner **10%** · pool **90%** · new wallet genesis **1 LMT**."
        };
      }
      try {
        const r = LMTWallet.swap(Number(m[1]), m[2], m[3]);
        let extra = "";
        if (r.pool) {
          extra = "\n• Pool after: **" + r.pool.poolLmt + " 💎** + **" + r.pool.poolToken + " " + r.pool.symbol +
            "** · price **" + r.pool.priceLmt + " 💎** / **" + r.pool.priceUsd + " USD**";
        }
        return {
          reply: "**Pool swap** ✅\n\n• In: **" + r.amountIn + " " + r.from +
            "**\n• Out: **" + r.amountOut + " " + r.to +
            "**\n• Route: " + (r.route || "") +
            "\n• ~USD: " + (r.usdValue != null ? Number(r.usdValue).toFixed(6) : "?") +
            "\n• Balances: " + r.from + " " + r.balances[r.from] + " · " + r.to + " " + r.balances[r.to] +
            extra
        };
      } catch (e) {
        return { reply: "Swap failed: " + e.message };
      }
    }

    if (/^token price\s+/i.test(raw) || /^price\s+[A-Z]{2,8}$/i.test(raw) ||
        /^token\s+[A-Z]{2,8}$/i.test(raw) || /^pool\s+[A-Z]{2,8}$/i.test(raw) ||
        /^circulation\s+[A-Z]{2,8}$/i.test(raw) || /^market\s+[A-Z]{2,8}$/i.test(raw)) {
      if (typeof LMTWallet === "undefined") return { reply: "Wallet not loaded." };
      const sym = raw.replace(/^(token price|price|token|pool|circulation|market)\s+/i, "").trim().toUpperCase() || "LMT";
      if (sym === "LMT") {
        const px = LMTWallet.priceUsdPerLmt();
        const bal = LMTWallet.getBalance("LMT");
        return {
          reply: "**💎 LMT** — system stable unit of account\n\n" +
            "• Price: **" + px + " USD / LMT** (protocol rate)\n" +
            "• Your balance: **" + bal + " 💎**\n" +
            "• Other tokens are priced against LMT via liquidity pools.\n" +
            "• Create fee (10,000 💎) seeds each new token pool."
        };
      }
      const st = LMTWallet.tokenStats ? LMTWallet.tokenStats(sym) : null;
      if (!st) return { reply: "Unknown token `" + sym + "`. Create with `create token " + sym + " Name 1000000 0.01 🚀`" };
      const bal = LMTWallet.getBalance(sym);
      const em = st.emoji || "🪙";
      return {
        reply:
          "**" + em + " " + st.symbol + "** — " + st.name + "\n\n" +
          "• Price: **" + st.priceLmt + " 💎 LMT** · **" + st.priceUsd + " USD**\n" +
          "• Your balance: **" + bal + "** · value ≈ **" + (bal * st.priceUsd).toFixed(6) + " USD**\n" +
          "• Max supply: **" + st.maxSupply + "** · Circulating (out of pool): **" + st.circulating + "**\n" +
          "• **Available to buy in pool: " + st.availableInPool + " " + st.symbol + "**\n" +
          "• Pool: **" + st.poolLmt + " 💎 LMT** + **" + st.poolToken + " " + st.symbol + "**\n" +
          "• Market cap (circ.): ≈ **" + st.marketCapUsd + " USD**\n" +
          "• Volume (LMT): **" + st.volumeLmt + "** · Swaps: **" + st.swaps + "**\n" +
          "• Creator: `" + (st.creator || "?") + "`\n\n" +
          "_Price moves when users `swap` against the pool. More 💎 in the pool raises token price._"
      };
    }

    if (t === "token status" || t === "token lab" || t === "economy status" ||
        t === "markets" || t === "pools" || t === "all tokens" || t === "token list") {
      if (typeof LMTWallet === "undefined") return { reply: "Wallet not loaded." };
      const lmtBal = LMTWallet.getBalance("LMT");
      const lmtPx = LMTWallet.priceUsdPerLmt();
      const rows = (LMTWallet.allTokenStats && LMTWallet.allTokenStats()) || [];
      let body = "**Token markets** (💎 LMT = system stable coin)\n\n";
      body += "• **💎 LMT** @" + lmtPx + " USD · your bal **" + lmtBal + "**\n";
      body += "• Create fee **10,000 💎** seeds each new token's liquidity pool.\n\n";
      if (!rows.length) {
        body += "_No custom tokens yet. `create token MYT MyToken 1000000 0.01 🚀`_\n";
      } else {
        body += rows.map(function (st) {
          const em = st.emoji || "🪙";
          return "• " + em + " **" + st.symbol + "** " + st.name +
            "\n  price **" + st.priceLmt + " 💎** / **" + st.priceUsd + " USD**" +
            " · for sale **" + st.availableInPool + "** · circ **" + st.circulating + "**/" + st.maxSupply +
            "\n  pool **" + st.poolLmt + " 💎** + **" + st.poolToken + " " + st.symbol + "**" +
            " · mcap ≈ " + st.marketCapUsd + " USD" +
            " · you hold **" + LMTWallet.getBalance(st.symbol) + "**";
        }).join("\n\n");
      }
      body += "\n\n`token MYT` · `swap 50 LMT MYT` · `create token SYM Name supply price EMOJI`";
      return { reply: body };
    }

    // Global / P2P pool sync
    // Memory node — automatic mutual protection
    if (t === "node status" || t === "memory node" || t === "node") {
      if (typeof MemoryNode === "undefined") return { reply: "Memory node not loaded." };
      const s = MemoryNode.status();
      return {
        reply:
          "**Memory node** 🛡️\n\n" +
          "• Node ID: `" + s.nodeId + "`\n" +
          "• Auto-share: **" + (s.autoShare ? "on" : "off") + "**\n" +
          "• Online: " + (s.online ? "✅" : "offline") + " · P2P channel: **" + s.p2p + "**\n" +
          "• Local facts: **" + s.facts + "**\n" +
          "• Last sync: " + (s.lastSync || "never") + "\n" +
          "• Sync URL: " + (s.syncUrl || "_not set_") + "\n\n" +
          "When online or P2P is open, this node shares knowledge + token pools so peers keep copies.\n" +
          "`node on` · `node off` · `share memory` · `memory sync url https://…`"
      };
    }
    if (t === "node on" || t === "protect on" || t === "auto share on") {
      if (typeof MemoryNode === "undefined") return { reply: "Memory node not loaded." };
      MemoryNode.setAutoShare(true);
      MemoryNode.start();
      return { reply: "🛡️ Node protection **on**. Memory will share automatically when online or P2P is connected." };
    }
    if (t === "node off" || t === "protect off" || t === "auto share off") {
      if (typeof MemoryNode === "undefined") return { reply: "Memory node not loaded." };
      MemoryNode.setAutoShare(false);
      return { reply: "Node auto-share **off**. Use `share memory` to send manually." };
    }
    if (t === "share memory" || t === "sync memory" || t === "protect now") {
      if (typeof MemoryNode === "undefined") return { reply: "Memory node not loaded." };
      try {
        const r = await MemoryNode.shareNow("manual");
        return {
          reply:
            "**Memory shared** 🛡️\n\n" +
            "• Facts in packet: **" + r.facts + "**\n" +
            "• P2P: " + (r.p2p && r.p2p.sent ? "✅" : "— " + ((r.p2p && r.p2p.reason) || "")) + "\n" +
            "• Same-browser tabs: " + (r.tab && r.tab.sent ? "✅" : "—") + "\n" +
            "• Online URL: " + (r.http && r.http.ok ? "✅" : "— " + ((r.http && (r.http.reason || r.http.error)) || "skipped")) + "\n\n" +
            "_Peers absorb new facts without deleting their own (merge-only)._"
        };
      } catch (e) {
        return { reply: "Share failed: " + (e.message || e) };
      }
    }
    if (/^memory sync url\s+/i.test(raw) || /^node sync url\s+/i.test(raw)) {
      if (typeof MemoryNode === "undefined") return { reply: "Memory node not loaded." };
      const url = raw.replace(/^(memory sync url|node sync url)\s+/i, "").trim();
      try {
        const r = MemoryNode.setSyncUrl(url);
        return { reply: r.url ? "Memory sync URL set: `" + r.url + "`" : "Memory sync URL cleared." };
      } catch (e) {
        return { reply: e.message || String(e) };
      }
    }

        if (t === "sync pools" || t === "pool sync" || t === "sync market" || t === "download pools") {
      if (typeof LMTWallet === "undefined") return { reply: "Wallet not loaded." };
      try {
        const r = await LMTWallet.syncPoolsOnline();
        const m = r.merged;
        let lines = ["**Pool sync** 💎\n"];
        lines.push("• P2P broadcast: " + (r.p2p && r.p2p.sent ? "✅ sent to peer" : "— " + ((r.p2p && r.p2p.reason) || "no open channel")));
        if (r.http && r.http.ok) lines.push("• Online URL: ✅ fetched");
        else lines.push("• Online URL: " + ((r.http && (r.http.reason || r.http.error)) || "not set"));
        if (m && m.ok) lines.push("• Merged: **" + m.added + "** new · **" + m.updated + "** updated · **" + m.total + "** listed");
        lines.push("\nOpen P2P (`webrtc offer` / `answer`) so peers exchange pools, or set `pool sync url https://…`");
        lines.push("Then: `markets` · `swap 50 LMT TOKEN`");
        return { reply: lines.join("\n") };
      } catch (e) {
        return { reply: "Sync failed: " + (e.message || e) };
      }
    }
    if (/^pool sync url\s+/i.test(raw) || /^set pool sync url\s+/i.test(raw)) {
      if (typeof LMTWallet === "undefined") return { reply: "Wallet not loaded." };
      const url = raw.replace(/^(pool sync url|set pool sync url)\s+/i, "").trim();
      try {
        const r = LMTWallet.setPoolSyncUrl(url === "clear" || url === "none" ? "" : url);
        return { reply: r.url ? "Pool sync URL set to `" + r.url + "`. Run `sync pools` when online." : "Pool sync URL cleared." };
      } catch (e) {
        return { reply: e.message || String(e) };
      }
    }
    if (t === "export pools" || t === "pool export") {
      if (typeof LMTWallet === "undefined") return { reply: "Wallet not loaded." };
      const snap = LMTWallet.exportPools();
      const n = Object.keys(snap.tokens || {}).length;
      return {
        reply: "**Pool registry export** (" + n + " tokens)\n\n```json\n" +
          JSON.stringify(snap, null, 2).slice(0, 3500) +
          "\n```\n\nConnect P2P and run `sync pools` on both devices to share listings."
      };
    }



    if (t === "p2p turn" || t === "p2p turn status" || t === "my turn" || t === "private turn") {
      if (typeof WebRTCPeer === "undefined") return { reply: "WebRTC not loaded." };
      const st = WebRTCPeer.personalTurnStatus ? WebRTCPeer.personalTurnStatus() : {};
      const s = WebRTCPeer.status();
      return {
        reply:
          "**Private TURN (this browser)**\n\n" +
          "• Device ID: `" + (st.deviceId || s.deviceId || "?") + "`\n" +
          "• Private host: " + (st.privateConfigured ? ("**" + (st.host || "custom urls") + "**") : "_not configured (using public fallback)_") + "\n" +
          "• Auth secret: " + (st.hasSecret ? "yes (ephemeral user/pass per browser)" : "no") + "\n" +
          "• TURN username: `" + (st.turnUsername || s.turnUsername || "—") + "`\n" +
          "• Method: " + (st.method || s.turnMethod || "—") + "\n" +
          "• ICE servers: " + (s.iceServerCount || 0) + " · TURN entries: **" + (s.turnServerCount || 0) + "**\n\n" +
          "**New users** automatically get a unique device ID and unique TURN username on this device.\n\n" +
          "Setup private relay:\n" +
          "`p2p turn set HOST SECRET`\n" +
          "Example: `p2p turn set turn.example.com mySharedSecret`\n\n" +
          "`p2p turn refresh` · `p2p turn clear` · `p2p ice`"
      };
    }
    if (/^p2p turn set\s+/i.test(raw)) {
      if (typeof WebRTCPeer === "undefined") return { reply: "WebRTC not loaded." };
      const body = raw.replace(/^p2p turn set\s+/i, "").trim();
      const parts = body.split(/\s+/);
      if (parts.length < 1 || !parts[0]) {
        return { reply: "Usage: `p2p turn set turn.example.com yourSharedSecret`" };
      }
      const host = parts[0];
      const secret = parts.slice(1).join(" ") || "";
      try {
        WebRTCPeer.configurePrivateTurn({ host: host, secret: secret });
        await WebRTCPeer.prepareIceServers(true);
        const stTurn = WebRTCPeer.personalTurnStatus();
        return {
          reply:
            "**Private TURN configured** for this deployment.\n\n" +
            "• Host: `" + host + "`\n" +
            "• This browser device ID: `" + stTurn.deviceId + "`\n" +
            "• TURN user: `" + stTurn.turnUsername + "`\n" +
            "• Method: " + stTurn.method + "\n\n" +
            "Each browser generates **its own** username/password from the shared secret.\n" +
            "Create a **new** `p2p offer` after this.\n\n" +
            "coturn needs `use-auth-secret` + `static-auth-secret` set to your secret."
        };
      } catch (e) {
        return { reply: e.message || String(e) };
      }
    }
    if (t === "p2p turn refresh" || t === "turn refresh") {
      if (typeof WebRTCPeer === "undefined") return { reply: "WebRTC not loaded." };
      await WebRTCPeer.prepareIceServers(true);
      const stR = WebRTCPeer.personalTurnStatus();
      return {
        reply:
          "TURN credentials refreshed.\n\n• Device: `" +
          stR.deviceId +
          "`\n• User: `" +
          stR.turnUsername +
          "`\n• Method: " +
          stR.method
      };
    }
    if (t === "p2p turn clear" || t === "turn clear") {
      if (typeof WebRTCPeer === "undefined") return { reply: "WebRTC not loaded." };
      WebRTCPeer.clearPrivateTurn();
      WebRTCPeer.clearIceOverride();
      return { reply: "Private TURN config cleared. Back to public fallback + unique device ID. New `p2p offer` recommended." };
    }

    if (t === "p2p mode" || t === "webrtc mode") {
      if (typeof WebRTCPeer === "undefined") return { reply: "WebRTC not loaded." };
      const m = WebRTCPeer.getMode ? WebRTCPeer.getMode() : "auto";
      return { reply: "**P2P mode:** `" + m + "`\n\nSet with:\n• `p2p mode auto` — STUN+TURN\n• `p2p mode relay` — force TURN\n• `p2p mode local` — LAN-friendly" };
    }
    if (/^p2p mode\s+/i.test(raw) || /^webrtc mode\s+/i.test(raw)) {
      if (typeof WebRTCPeer === "undefined") return { reply: "WebRTC not loaded." };
      const mode = raw.replace(/^(?:p2p|webrtc)\s+mode\s+/i, "").trim().toLowerCase();
      try {
        WebRTCPeer.setMode(mode);
        return { reply: "P2P mode set to **" + mode + "**. Create a **new** `p2p offer` so ICE uses this mode." };
      } catch (e) {
        return { reply: e.message || String(e) };
      }
    }
    if (t === "p2p ice" || t === "p2p ice status" || t === "ice status") {
      if (typeof WebRTCPeer === "undefined") return { reply: "WebRTC not loaded." };
      const st = WebRTCPeer.status();
      const servers = WebRTCPeer.loadIceServers ? WebRTCPeer.loadIceServers() : [];
      const lines = servers.slice(0, 12).map(function (s) {
        const u = s.urls || s.url || "?";
        return "• " + (Array.isArray(u) ? u[0] : u);
      });
      return {
        reply: "**ICE servers** (" + st.iceServerCount + ", TURN: " + st.turnServerCount + ")\n\n" +
          lines.join("\n") +
          "\n\n`p2p ice reset` · custom via localStorage `localmind_ice_servers`"
      };
    }
    if (t === "p2p ice reset" || t === "ice reset") {
      if (typeof WebRTCPeer === "undefined") return { reply: "WebRTC not loaded." };
      WebRTCPeer.clearIceOverride();
      return { reply: "ICE servers restored to defaults (STUN + openrelay TURN). Start a new `p2p offer`." };
    }
    if (t === "p2p chat outbox" || t === "flush chat outbox") {
      if (typeof WebRTCPeer === "undefined") return { reply: "WebRTC not loaded." };
      if (t === "flush chat outbox") {
        const r = WebRTCPeer.flushChatOutbox ? WebRTCPeer.flushChatOutbox() : { sent: 0, remaining: 0 };
        return { reply: "Chat outbox: sent **" + r.sent + "** · remaining **" + r.remaining + "**" };
      }
      const st = WebRTCPeer.status();
      return { reply: "Queued chat messages: **" + (st.chatOutbox || 0) + "**\n\n`flush chat outbox` when channel is open." };
    }

    if (t === "p2p setup" || t === "p2p help" || t === "webrtc setup" || t === "webrtc help" || t === "p2p") {
      if (typeof WebRTCPeer === "undefined") return { reply: "WebRTC module not loaded." };
      const guide = WebRTCPeer.getSetupGuide ? WebRTCPeer.getSetupGuide() : "Use: webrtc offer → webrtc answer";
      const st = WebRTCPeer.status();
      return { reply: guide + "\n\n**Now:** channel **" + (st.channel || "none") + "** · connection " + (st.connectionState || "n/a") };
    }

    if (t === "p2p status" || t === "webrtc status") {
      if (typeof WebRTCPeer === "undefined") return { reply: "WebRTC module not loaded." };
      const st = WebRTCPeer.status();
      const ready = st.channel === "open";
      return {
        reply:
          "**P2P status**\n\n" +
          "• Channel: **" + (st.channel || "none") + "**\n" +
          "• Connection: " + (st.connectionState || "n/a") + "\n" +
          "• ICE: " + (st.iceConnectionState || "n/a") + " (gathering: " + (st.iceGatheringState || "?") + ")\n" +
          "• Role: " + (st.role || "—") + "\n" +
          "• Online: " + (st.online ? "yes" : "no") + " · Mode: **" + (st.mode || "auto") + "**\n" +
          "• ICE servers: " + (st.iceServerCount || 0) + " · TURN: **" + (st.turnServerCount || 0) + "**\n" +
          "• Chat outbox: " + (st.chatOutbox || 0) +
          (st.lastError ? "\n• Last error: " + st.lastError : "") +
          (ready
            ? "\n\n✅ Ready — `p2p send Hello` · `p2p file` · `share profile` · `p2p pay …`"
            : "\n\nRun `p2p setup` then offer/answer. If NAT blocks you: `p2p mode relay` then new offer.")
      };
    }

    if (t === "webrtc offer" || t === "p2p offer") {
      if (typeof WebRTCPeer === "undefined") return { reply: "WebRTC module not loaded." };
      try {
        const sdp = await WebRTCPeer.createOffer();
        return {
          reply: "**Offer created** — send this JSON to the other device:\n\n```\n" + sdp +
            "\n```\n\nThey type: `webrtc answer ` + this JSON\nThen you paste their answer with `webrtc answer …`"
        };
      } catch (e) {
        return { reply: "Offer failed: " + e.message };
      }
    }

    if (t.startsWith("webrtc answer ") || t.startsWith("p2p answer ")) {
      const sdp = raw.replace(/^(webrtc|p2p)\s+answer\s+/i, "").trim();
      if (!sdp) return { reply: "Paste the SDP JSON after the command." };
      try {
        if (WebRTCPeer.getRole() === "offer") {
          await WebRTCPeer.acceptAnswer(sdp);
          return { reply: "Answer accepted. Waiting for channel… Check `p2p status`." };
        }
        const answer = await WebRTCPeer.acceptOffer(sdp);
        return { reply: "**Answer created** — send this back to the offerer:\n\n```\n" + answer + "\n```" };
      } catch (e) {
        return { reply: "WebRTC failed: " + e.message };
      }
    }

    if ((t.startsWith("p2p send ") || t.startsWith("p2p msg ") || t.startsWith("p2p message ")) && !/^p2p send lmt\b/i.test(t) && !/^p2p send file\b/i.test(t)) {
      if (typeof WebRTCPeer === "undefined") return { reply: "WebRTC not loaded." };
      const msg = raw.replace(/^(?:p2p send|p2p msg|p2p message)\s+/i, "").trim();
      if (!msg) return { reply: "Usage: `p2p send Hello there`" };
      try {
        if (WebRTCPeer.sendChat) {
          const r = WebRTCPeer.sendChat(msg, { queue: true });
          if (r.queued) {
            return {
              reply:
                "Channel not open — message **queued** (" + r.queueSize + ").\n" +
                "Finish `p2p offer` / `p2p answer`, then it sends automatically (or `flush chat outbox`)."
            };
          }
          return { reply: "P2P message sent ✅\n\n_" + msg.slice(0, 200) + "_" };
        }
        if (WebRTCPeer.channelState() !== "open") {
          return { reply: "Channel not open. Finish offer/answer first." };
        }
        WebRTCPeer.send({ type: "chat", text: msg, ts: Date.now() });
        return { reply: "P2P message sent ✅" };
      } catch (e) {
        return { reply: "Send failed: " + e.message };
      }
    }

    // Trigger file picker for P2P send (image / video / any file)
    if (t === "p2p file" || t === "p2p send file" || t === "send file" || t === "p2p image" || t === "p2p video") {
      if (typeof WebRTCPeer === "undefined") return { reply: "WebRTC not loaded." };
      if (WebRTCPeer.channelState() !== "open") {
        return { reply: "Channel not open. Run `p2p setup`, exchange offer/answer, then try again." };
      }
      return {
        reply: "Choose a file, image, or video to send over P2P…",
        _pickP2PFile: true
      };
    }

    return null;
  }

  function p2pStatus() {
    if (typeof WebRTCPeer === "undefined") return { connected: false, channel: "none" };
    const st = WebRTCPeer.status ? WebRTCPeer.status() : {};
    const open = typeof WebRTCPeer.channelState === "function"
      ? WebRTCPeer.channelState() === "open"
      : !!(st && st.channel === "open");
    return {
      connected: open,
      channel: (st && st.channel) || (open ? "open" : "none"),
      connectionState: (st && st.connectionState) || null
    };
  }

  return { fullStatus, handleCommand, p2pStatus };
})();

if (typeof window !== "undefined") window.Advanced = Advanced;
