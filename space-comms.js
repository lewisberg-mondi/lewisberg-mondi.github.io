/**
 * Kanairoex Space Communications Layer
 * Inspired by pre-internet NASA technology:
 *   - Telemetry frames (spacecraft → ground)
 *   - Formal command protocol with ACK/NACK (ground → spacecraft)
 *   - Beacon / heartbeat
 *   - Delay-tolerant store-and-forward outbox
 *   - Mission Control status board
 */
(function (root) {
  'use strict';

  const NS = 'localmind_space_v1_';
  const MAX_TM = 200;
  const MAX_CMD = 100;
  const MAX_OB = 50;

  const state = {
    seq: loadN('seq', 1),
    cmdSeq: loadN('cmdSeq', 1),
    beaconTimer: null,
    beaconIntervalMs: loadN('beaconInterval', 60000),
    beaconEnabled: loadP('beaconEnabled', false),
    lastBeacon: null,
    tmLog: loadP('tmLog', []),
    cmdLog: loadP('cmdLog', []),
    outbox: loadP('outbox', []),
    callsign: loadP('callsign', 'LM-1')
  };

  function saveP(k, v) {
    try { localStorage.setItem(NS + k, JSON.stringify(v)); } catch (_) {}
  }
  function loadP(k, d) {
    try {
      const v = localStorage.getItem(NS + k);
      return v != null ? JSON.parse(v) : d;
    } catch (_) { return d; }
  }
  function loadN(k, d) {
    const v = loadP(k, d);
    return typeof v === 'number' ? v : d;
  }
  function nextSeq() {
    state.seq = (state.seq || 1) + 1;
    saveP('seq', state.seq);
    return state.seq;
  }
  function nextCmdSeq() {
    state.cmdSeq = (state.cmdSeq || 1) + 1;
    saveP('cmdSeq', state.cmdSeq);
    return state.cmdSeq;
  }
  function pad(n, w) {
    n = String(n);
    while (n.length < w) n = '0' + n;
    return n;
  }
  function nowIso() {
    return new Date().toISOString().replace(/\.\d{3}Z$/, 'Z');
  }
  function csum(str) {
    let h = 0;
    const s = String(str || '');
    for (let i = 0; i < s.length; i++) h = ((h << 5) - h + s.charCodeAt(i)) | 0;
    return (h >>> 0).toString(16).toUpperCase().slice(-4).padStart(4, '0');
  }

  /* ---------- Telemetry ---------- */

  function collectMetrics() {
    const m = {
      ts: nowIso(),
      callsign: state.callsign,
      memMB: null,
      knowledge: null,
      neurons: null,
      blocks: null,
      llm: 'none',
      p2p: 'down',
      online: typeof navigator !== 'undefined' ? !!navigator.onLine : null,
      beacon: state.beaconEnabled ? 'on' : 'off'
    };
    try {
      if (performance && performance.memory) {
        m.memMB = Math.round(performance.memory.usedJSHeapSize / 1048576 * 10) / 10;
      }
    } catch (_) {}
    try {
      if (root.Knowledge && typeof root.Knowledge.count === 'function') m.knowledge = root.Knowledge.count();
      else if (root.Knowledge && root.Knowledge.all) m.knowledge = (root.Knowledge.all() || []).length;
    } catch (_) {}
    try {
      if (root.Neurons && typeof root.Neurons.count === 'function') m.neurons = root.Neurons.count();
    } catch (_) {}
    try {
      if (root.Blockchain && typeof root.Blockchain.length === 'function') m.blocks = root.Blockchain.length();
      else if (root.Blockchain && root.Blockchain.chain) m.blocks = (root.Blockchain.chain || []).length;
    } catch (_) {}
    try {
      if (root.ExternalLLM && root.ExternalLLM.isActive()) {
        const s = root.ExternalLLM.status();
        m.llm = (s.activeBackend || 'ext') + '/' + (s.activeModel || '?');
      } else if (root.LocalLLM && root.LocalLLM.status().ready) {
        m.llm = 'webllm/' + (root.LocalLLM.status().modelId || '?');
      }
    } catch (_) {}
    try {
      if (root.Advanced && root.Advanced.p2pStatus) {
        const st = root.Advanced.p2pStatus();
        m.p2p = (st && st.connected) ? 'up' : 'down';
      } else if (root.WebRTCPeer && root.WebRTCPeer.isConnected) {
        m.p2p = root.WebRTCPeer.isConnected() ? 'up' : 'down';
      }
    } catch (_) {}
    return m;
  }

  function formatTM(metrics, seq) {
    const body = [
      'TM', pad(seq, 4), metrics.ts, metrics.callsign || 'LM-1', 'OK',
      'MEM:' + (metrics.memMB != null ? metrics.memMB + 'MB' : 'n/a'),
      'KNOW:' + (metrics.knowledge != null ? metrics.knowledge : '?'),
      'NEURONS:' + (metrics.neurons != null ? metrics.neurons : '?'),
      'BLOCKS:' + (metrics.blocks != null ? metrics.blocks : '?'),
      'LLM:' + (metrics.llm || 'none'),
      'P2P:' + (metrics.p2p || '?'),
      'NET:' + (metrics.online ? 'up' : 'down'),
      'BEACON:' + (metrics.beacon || 'off')
    ].join(' ');
    return body + ' CS:' + csum(body);
  }

  function emitTelemetry(reason) {
    const seq = nextSeq();
    const metrics = collectMetrics();
    const frame = formatTM(metrics, seq);
    const entry = { seq: seq, ts: metrics.ts, frame: frame, reason: reason || 'manual', metrics: metrics };
    state.tmLog.push(entry);
    if (state.tmLog.length > MAX_TM) state.tmLog = state.tmLog.slice(-MAX_TM);
    saveP('tmLog', state.tmLog);
    state.lastBeacon = entry;
    try {
      window.dispatchEvent(new CustomEvent('localmind-telemetry', { detail: entry }));
    } catch (_) {}
    return entry;
  }

  /* ---------- Beacon ---------- */

  function startBeacon(intervalMs) {
    stopBeacon();
    if (intervalMs && intervalMs >= 5000) {
      state.beaconIntervalMs = intervalMs;
      saveP('beaconInterval', state.beaconIntervalMs);
    }
    state.beaconEnabled = true;
    saveP('beaconEnabled', true);
    emitTelemetry('beacon-start');
    state.beaconTimer = setInterval(function () {
      emitTelemetry('beacon');
    }, state.beaconIntervalMs);
    return { ok: true, intervalMs: state.beaconIntervalMs };
  }

  function stopBeacon() {
    if (state.beaconTimer) {
      clearInterval(state.beaconTimer);
      state.beaconTimer = null;
    }
    state.beaconEnabled = false;
    saveP('beaconEnabled', false);
    return { ok: true };
  }

  /* ---------- Command Protocol ---------- */

  function parseCommand(text) {
    const raw = String(text || '').trim();
    const m = raw.match(/^CMD(?:\s+(\d+))?\s+(\w+)(?:\s+(.+))?$/i);
    if (!m) return null;
    const seq = m[1] ? parseInt(m[1], 10) : nextCmdSeq();
    const verb = m[2].toUpperCase();
    const rest = m[3] || '';
    const args = {};
    const re = /(\w+)=(?:"([^"]*)"|(\S+))/g;
    let match;
    while ((match = re.exec(rest)) !== null) {
      args[match[1].toLowerCase()] = match[2] != null ? match[2] : match[3];
    }
    if (!Object.keys(args).length && rest.trim()) args.text = rest.trim();
    const body = 'CMD ' + pad(seq, 4) + ' ' + verb + (rest ? ' ' + rest : '');
    return { seq: seq, verb: verb, args: args, raw: raw, body: body, checksum: csum(body) };
  }

  function executeCommand(cmd) {
    const logEntry = {
      seq: cmd.seq, ts: nowIso(), verb: cmd.verb, args: cmd.args,
      status: 'RECV', reply: null
    };
    let ack = true;
    let reason = '';
    let resultText = '';

    try {
      switch (cmd.verb) {
        case 'TEACH': {
          const subject = cmd.args.subject || cmd.args.topic || 'fact';
          const fact = cmd.args.fact || cmd.args.text || cmd.args.content || '';
          if (!fact) { ack = false; reason = 'MISSING_FACT'; break; }
          if (root.Knowledge && root.Knowledge.add) {
            root.Knowledge.add(subject, fact, cmd.args.category || 'space-cmd');
            resultText = 'Stored: ' + subject;
          } else {
            ack = false;
            reason = 'NO_KNOWLEDGE_MODULE';
          }
          break;
        }
        case 'TELEMETRY':
        case 'TM': {
          const entry = emitTelemetry('command');
          resultText = entry.frame;
          break;
        }
        case 'BEACON': {
          const action = (cmd.args.action || cmd.args.text || 'status').toLowerCase();
          if (action === 'on' || action === 'start') {
            const ms = parseInt(cmd.args.interval || cmd.args.ms || state.beaconIntervalMs, 10);
            startBeacon(ms);
            resultText = 'Beacon ON interval=' + state.beaconIntervalMs + 'ms';
          } else if (action === 'off' || action === 'stop') {
            stopBeacon();
            resultText = 'Beacon OFF';
          } else {
            resultText = 'Beacon ' + (state.beaconEnabled ? 'ON' : 'OFF') +
              ' interval=' + state.beaconIntervalMs + 'ms';
          }
          break;
        }
        case 'STATUS':
        case 'HEALTH': {
          resultText = formatTM(collectMetrics(), nextSeq());
          break;
        }
        case 'CALLSIGN': {
          if (cmd.args.name || cmd.args.text) {
            state.callsign = String(cmd.args.name || cmd.args.text).slice(0, 16);
            saveP('callsign', state.callsign);
            resultText = 'Callsign set to ' + state.callsign;
          } else {
            resultText = 'Callsign ' + state.callsign;
          }
          break;
        }
        case 'ECHO': {
          resultText = cmd.args.text || JSON.stringify(cmd.args);
          break;
        }
        case 'OUTBOX': {
          resultText = formatOutbox();
          break;
        }
        case 'FLUSH': {
          const r = flushOutbox();
          resultText = 'Flushed ' + r.sent + ' item(s), ' + r.remaining + ' remaining';
          break;
        }
        case 'QUEUE': {
          const payload = cmd.args.text || cmd.args.msg || cmd.args.message || '';
          if (!payload) { ack = false; reason = 'MISSING_TEXT'; break; }
          queueOutbox({ type: 'msg', text: payload, to: cmd.args.to || null });
          resultText = 'Queued (' + state.outbox.length + ' in outbox)';
          break;
        }
        case 'RESET_SEQ': {
          state.seq = 1;
          state.cmdSeq = 1;
          saveP('seq', 1);
          saveP('cmdSeq', 1);
          resultText = 'Sequences reset';
          break;
        }
        default:
          ack = false;
          reason = 'UNKNOWN_VERB';
          resultText = 'Unknown verb: ' + cmd.verb;
      }
    } catch (err) {
      ack = false;
      reason = 'EXCEPTION';
      resultText = (err && err.message) ? err.message : String(err);
    }

    logEntry.status = ack ? 'ACK' : 'NACK';
    logEntry.reason = reason || null;
    logEntry.reply = resultText;
    state.cmdLog.push(logEntry);
    if (state.cmdLog.length > MAX_CMD) state.cmdLog = state.cmdLog.slice(-MAX_CMD);
    saveP('cmdLog', state.cmdLog);

    return {
      ok: ack,
      seq: cmd.seq,
      verb: cmd.verb,
      reply: (ack ? 'ACK' : 'NACK') + ' ' + pad(cmd.seq, 4) +
        (reason ? ' REASON=' + reason : '') +
        (resultText ? ' ' + resultText : ''),
      result: resultText,
      reason: reason || null
    };
  }

  /* ---------- Delay-tolerant Outbox ---------- */

  function queueOutbox(item) {
    const entry = {
      id: 'ob_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 6),
      ts: nowIso(),
      type: item.type || 'msg',
      text: item.text || '',
      to: item.to || null,
      meta: item.meta || null,
      attempts: 0
    };
    state.outbox.push(entry);
    if (state.outbox.length > MAX_OB) state.outbox = state.outbox.slice(-MAX_OB);
    saveP('outbox', state.outbox);
    return entry;
  }

  function formatOutbox() {
    if (!state.outbox.length) return 'Outbox empty';
    return state.outbox.map(function (e, i) {
      return (i + 1) + '. [' + e.type + '] ' + (e.text || '').slice(0, 80) +
        (e.to ? ' → ' + e.to : '');
    }).join('\n');
  }

  function flushOutbox() {
    let sent = 0;
    const remaining = [];
    const connected = (function () {
      try {
        if (root.WebRTCPeer && root.WebRTCPeer.isConnected) return !!root.WebRTCPeer.isConnected();
        if (root.Advanced && root.Advanced.p2pStatus) {
          const s = root.Advanced.p2pStatus();
          return !!(s && s.connected);
        }
      } catch (_) {}
      return false;
    })();

    state.outbox.forEach(function (item) {
      if (!connected) {
        remaining.push(item);
        return;
      }
      try {
        if (root.Advanced && typeof root.Advanced.p2pSend === 'function') {
          root.Advanced.p2pSend(item.text || JSON.stringify(item));
          sent++;
        } else if (root.WebRTCPeer && typeof root.WebRTCPeer.send === 'function') {
          root.WebRTCPeer.send(item.text || JSON.stringify(item));
          sent++;
        } else {
          item.attempts = (item.attempts || 0) + 1;
          remaining.push(item);
        }
      } catch (_) {
        item.attempts = (item.attempts || 0) + 1;
        remaining.push(item);
      }
    });

    state.outbox = remaining;
    saveP('outbox', state.outbox);
    return { sent: sent, remaining: remaining.length, connected: connected };
  }

  /* ---------- Mission Control ---------- */

  function missionControl() {
    const m = collectMetrics();
    return {
      callsign: state.callsign,
      metrics: m,
      telemetryFrame: formatTM(m, state.seq),
      beacon: {
        enabled: state.beaconEnabled,
        intervalMs: state.beaconIntervalMs,
        last: state.lastBeacon ? state.lastBeacon.frame : null
      },
      outboxCount: state.outbox.length,
      recentTelemetry: state.tmLog.slice(-5).map(function (e) { return e.frame; }),
      recentCommands: state.cmdLog.slice(-5).map(function (e) {
        return e.status + ' ' + pad(e.seq, 4) + ' ' + e.verb +
          (e.reason ? ' (' + e.reason + ')' : '');
      }),
      seq: state.seq,
      cmdSeq: state.cmdSeq
    };
  }

  function renderMissionControlText() {
    const mc = missionControl();
    const lines = [
      '══════════════════════════════════════════',
      '   LOCALMIND MISSION CONTROL  [' + mc.callsign + ']',
      '══════════════════════════════════════════',
      '',
      'LINK STATUS',
      '  NET........ ' + (mc.metrics.online ? 'UP' : 'DOWN'),
      '  P2P........ ' + String(mc.metrics.p2p || '?').toUpperCase(),
      '  LLM........ ' + (mc.metrics.llm || 'none'),
      '  BEACON..... ' + (mc.beacon.enabled ? 'ON @ ' + mc.beacon.intervalMs + 'ms' : 'OFF'),
      '',
      'SPACECRAFT STATE',
      '  MEM........ ' + (mc.metrics.memMB != null ? mc.metrics.memMB + ' MB' : 'n/a'),
      '  KNOWLEDGE.. ' + (mc.metrics.knowledge != null ? mc.metrics.knowledge : '?'),
      '  NEURONS.... ' + (mc.metrics.neurons != null ? mc.metrics.neurons : '?'),
      '  BLOCKS..... ' + (mc.metrics.blocks != null ? mc.metrics.blocks : '?'),
      '',
      'TELEMETRY (latest)',
      '  ' + (mc.telemetryFrame || '—'),
      '',
      'OUTBOX....... ' + mc.outboxCount + ' item(s)',
      '',
      'RECENT COMMANDS'
    ];
    if (mc.recentCommands.length) {
      mc.recentCommands.forEach(function (c) { lines.push('  ' + c); });
    } else {
      lines.push('  (none)');
    }
    lines.push('');
    lines.push('SEQ ' + mc.seq + '  CMD_SEQ ' + mc.cmdSeq);
    lines.push('══════════════════════════════════════════');
    return lines.join('\n');
  }

  /* ---------- Chat command router ---------- */

  function isSpaceCommand(text) {
    const t = String(text || '').trim();
    if (/^CMD\b/i.test(t)) return true;
    // Plain "outbox" / "flush outbox" belong to Advanced (wallet). Use
    // "space outbox", "tm outbox", or CMD OUTBOX for the space queue.
    // Flexible spacing so chips / "Mission Control" always match.
    return /^(telemetry|beacon|mission\s*control|missioncontrol|mc\b|spacecraft\s*status|tm\b|space\s*outbox|tm\s*outbox|queue\s+|callsign)/i.test(t);
  }

  function handleSpaceCommand(text) {
    const t = String(text || '').trim();

    if (/^CMD\b/i.test(t)) {
      const cmd = parseCommand(t);
      if (!cmd) return { reply: 'NACK 0000 REASON=PARSE_ERROR' };
      const csMatch = t.match(/CS:([0-9A-Fa-f]{4})/);
      if (csMatch && csMatch[1].toUpperCase() !== cmd.checksum) {
        return { reply: 'NACK ' + pad(cmd.seq, 4) + ' REASON=BAD_CHECKSUM' };
      }
      const result = executeCommand(cmd);
      return { reply: result.reply, thinking: '→ Space command ' + cmd.verb };
    }

    const lower = t.toLowerCase();

    if (/^(telemetry|tm)\b/i.test(lower)) {
      const e = emitTelemetry('user');
      return { reply: e.frame, thinking: '→ Telemetry' };
    }

    if (/^beacon\b/i.test(lower)) {
      if (/beacon\s+(on|start)/i.test(lower)) {
        const msMatch = lower.match(/(\d+)\s*(ms|s|sec)?/);
        let ms = state.beaconIntervalMs;
        if (msMatch) {
          ms = parseInt(msMatch[1], 10);
          if (msMatch[2] && msMatch[2].startsWith('s')) ms *= 1000;
        }
        startBeacon(ms);
        return {
          reply: 'Beacon ON — interval ' + state.beaconIntervalMs + ' ms\n' +
            (state.lastBeacon ? state.lastBeacon.frame : ''),
          thinking: '→ Beacon'
        };
      }
      if (/beacon\s+(off|stop)/i.test(lower)) {
        stopBeacon();
        return { reply: 'Beacon OFF', thinking: '→ Beacon' };
      }
      return {
        reply: 'Beacon is ' + (state.beaconEnabled ? 'ON' : 'OFF') +
          ' (interval ' + state.beaconIntervalMs + ' ms)\nType `beacon on` or `beacon off`.',
        thinking: '→ Beacon'
      };
    }

    if (/mission\s*control|^mc$/i.test(lower) || /spacecraft\s*status|space\s*status/i.test(lower)) {
      return {
        reply: '```\n' + renderMissionControlText() + '\n```',
        thinking: '→ Mission Control'
      };
    }

    if (/^(space outbox|tm outbox|outbox)$/i.test(lower)) {
      return { reply: formatOutbox(), thinking: '→ Space outbox' };
    }

    if (/^(flush space outbox|flush tm outbox)$/i.test(lower)) {
      const r = flushOutbox();
      return {
        reply: 'Space flush complete. Sent: ' + r.sent + ' | Remaining: ' + r.remaining +
          ' | Link: ' + (r.connected ? 'UP' : 'DOWN'),
        thinking: '→ Flush space outbox'
      };
    }

    if (/^queue\s+/i.test(lower)) {
      const payload = t.replace(/^queue\s+/i, '').trim();
      if (!payload) return { reply: 'Usage: queue <message to send when peer is in view>' };
      queueOutbox({ type: 'msg', text: payload });
      return {
        reply: 'Queued for delay-tolerant delivery (' + state.outbox.length + ' in outbox).',
        thinking: '→ Queue'
      };
    }

    if (/^callsign\b/i.test(lower)) {
      const name = t.replace(/^callsign\b/i, '').trim();
      if (name) {
        state.callsign = name.slice(0, 16);
        saveP('callsign', state.callsign);
        return { reply: 'Callsign set to **' + state.callsign + '**' };
      }
      return { reply: 'Callsign: **' + state.callsign + '**\nSet with: callsign LM-7' };
    }

    return null;
  }

  // Restore beacon if it was enabled
  if (state.beaconEnabled) {
    try { startBeacon(state.beaconIntervalMs); } catch (_) {}
  }

  root.SpaceComms = {
    emitTelemetry: emitTelemetry,
    startBeacon: startBeacon,
    stopBeacon: stopBeacon,
    parseCommand: parseCommand,
    executeCommand: executeCommand,
    queueOutbox: queueOutbox,
    flushOutbox: flushOutbox,
    formatOutbox: formatOutbox,
    missionControl: missionControl,
    renderMissionControlText: renderMissionControlText,
    isSpaceCommand: isSpaceCommand,
    handleSpaceCommand: handleSpaceCommand,
    collectMetrics: collectMetrics,
    formatTelemetryFrame: formatTM,
    simpleChecksum: csum,
    _state: state
  };
})(typeof window !== 'undefined' ? window : globalThis);
