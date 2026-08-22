/**
 * Kanairoex Self-Evolution — practical, local, safe self-improvement
 * Logs upgrades, stores new skills/rules in knowledge, can apply local patches.
 * Does NOT download arbitrary remote code. Educational sandbox only.
 */
const SelfEvolution = (() => {
  const KEY = 'localmind_self_evolution_v1';

  function load() {
    try {
      return JSON.parse(localStorage.getItem(KEY) || '{}');
    } catch {
      return {};
    }
  }

  function save(state) {
    localStorage.setItem(KEY, JSON.stringify(state));
  }

  function state() {
    const s = load();
    if (!s.version) s.version = 1;
    if (!s.log) s.log = [];
    if (!s.skills) s.skills = [];
    if (!s.patches) s.patches = [];
    return s;
  }

  function log(entry) {
    const s = state();
    s.log.unshift(Object.assign({ at: new Date().toISOString() }, entry));
    s.log = s.log.slice(0, 100);
    save(s);
    if (typeof Blockchain !== 'undefined') {
      try {
        Blockchain.addBlock({ type: 'self-evolution', ...entry });
      } catch (e) {}
    }
    return entry;
  }

  function status() {
    const s = state();
    return {
      version: s.version,
      skills: s.skills.length,
      patches: s.patches.length,
      last: s.log[0] || null,
      note: 'Local self-improvement only. No remote code execution.'
    };
  }

  /** Learn a skill description into memory + evolution log */
  function learnSkill(name, description) {
    name = String(name || '').trim().slice(0, 80);
    description = String(description || '').trim().slice(0, 4000);
    if (!name || !description) throw new Error('Need skill name and description');
    const s = state();
    s.skills.push({ name: name, description: description, at: Date.now() });
    s.skills = s.skills.slice(-50);
    save(s);
    if (typeof Knowledge !== 'undefined') {
      Knowledge.add('Skill: ' + name, description, 'self-evolution');
    }
    log({ type: 'skill', name: name, chars: description.length });
    return { name: name, stored: true };
  }

  /** Propose and record an upgrade (capability note) */
  function proposeUpgrade(title, plan) {
    const s = state();
    const patch = {
      id: 'up-' + Date.now(),
      title: String(title || 'upgrade').slice(0, 120),
      plan: String(plan || '').slice(0, 4000),
      applied: false,
      at: Date.now()
    };
    s.patches.push(patch);
    s.patches = s.patches.slice(-40);
    save(s);
    log({ type: 'propose', title: patch.title });
    return patch;
  }

  /** Apply a local upgrade: store rule in knowledge + bump version */
  function applyUpgrade(title, implementationNote) {
    const s = state();
    s.version = (s.version || 1) + 1;
    const note = String(implementationNote || '').slice(0, 4000);
    const patch = {
      id: 'ap-' + Date.now(),
      title: String(title || 'applied').slice(0, 120),
      plan: note,
      applied: true,
      at: Date.now()
    };
    s.patches.push(patch);
    save(s);
    if (typeof Knowledge !== 'undefined') {
      Knowledge.add(
        'Self-upgrade v' + s.version + ': ' + patch.title,
        note || patch.title,
        'self-evolution'
      );
    }
    if (typeof Rules !== 'undefined' && Rules.add && note) {
      try { Rules.add(patch.title, note); } catch (e) {}
    }
    log({ type: 'apply', title: patch.title, version: s.version });
    return { version: s.version, patch: patch };
  }

  /** Auto-improve from a successful online learn */
  function afterOnlineLearn(subject, chars) {
    log({ type: 'online-learn', subject: String(subject || '').slice(0, 120), chars: chars || 0 });
    if (typeof Knowledge !== 'undefined' && subject) {
      // already stored by Online; mark as evolution growth
    }
    return true;
  }

  function handleCommand(text) {
    const t = (text || '').trim();
    const lower = t.toLowerCase();
    if (lower === 'evolve status' || lower === 'self status' || lower === 'upgrade status') {
      const st = status();
      return {
        reply:
          '**Self-evolution status**\n\n' +
          '• Version: **' + st.version + '**\n' +
          '• Skills learned: ' + st.skills + '\n' +
          '• Patches: ' + st.patches + '\n' +
          '• Last: ' + (st.last ? st.last.type + ' — ' + (st.last.title || st.last.name || '') : 'none') +
          '\n\n_Local only. Use `evolve learn SkillName | description` or `evolve apply Title | note`._'
      };
    }
    if (/^evolve learn\s+/i.test(t)) {
      const body = t.replace(/^evolve learn\s+/i, '');
      const parts = body.split('|');
      const name = (parts[0] || '').trim();
      const desc = (parts.slice(1).join('|') || '').trim();
      try {
        const r = learnSkill(name, desc || name);
        return { reply: 'Learned skill **' + r.name + '** into memory + evolution log.' };
      } catch (e) {
        return { reply: e.message };
      }
    }
    if (/^evolve apply\s+/i.test(t) || /^upgrade apply\s+/i.test(t)) {
      const body = t.replace(/^(evolve apply|upgrade apply)\s+/i, '');
      const parts = body.split('|');
      try {
        const r = applyUpgrade((parts[0] || 'upgrade').trim(), (parts.slice(1).join('|') || '').trim());
        return {
          reply:
            'Applied self-upgrade → version **' + r.version + '**\n' +
            'Title: ' + r.patch.title + '\nStored in knowledge as a lasting rule/skill.'
        };
      } catch (e) {
        return { reply: e.message };
      }
    }
    if (/^evolve propose\s+/i.test(t)) {
      const body = t.replace(/^evolve propose\s+/i, '');
      const parts = body.split('|');
      const p = proposeUpgrade((parts[0] || 'idea').trim(), (parts.slice(1).join('|') || '').trim());
      return { reply: 'Proposed upgrade **' + p.title + '** (not applied yet). Use `evolve apply ' + p.title + ' | details`.' };
    }
    if (lower === 'evolve' || lower === 'self evolve' || lower === 'upgrade myself' || lower === 'improve yourself') {
      return {
        reply:
          '**Self-evolution (local)**\n\n' +
          'I can grow by:\n' +
          '1. Saving online research into knowledge automatically\n' +
          '2. Learning skills you teach: `evolve learn Summarizer | Prefer bullet key points`\n' +
          '3. Applying upgrades: `evolve apply Better file study | Always extract keywords and 5 key points`\n' +
          '4. Status: `evolve status`\n\n' +
          '_No remote code install. Changes stay on this device in memory + evolution log._'
      };
    }
    return null;
  }

  return {
    status,
    learnSkill,
    proposeUpgrade,
    applyUpgrade,
    afterOnlineLearn,
    handleCommand,
    log
  };
})();

if (typeof window !== 'undefined') window.SelfEvolution = SelfEvolution;
