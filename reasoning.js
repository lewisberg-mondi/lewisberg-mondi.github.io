/**
 * Kanairoex Reasoning Engine
 * Pattern matching, fact lookup, contradiction detection, simple logic.
 */

const Reasoning = (() => {
  let _staged = null; // current staged answer for continue

  
  // Simple response variation – same meaning, different wording
  function varyReply(base) {
    if (!base || base.length < 20) return base;
    const starters = [
      "",
      "From what I know: ",
      "Based on my memory: ",
      "Here's what I have: ",
      "According to stored knowledge: ",
      "Let me answer from memory: "
    ];
    const endings = [
      "",
      "\n\n(I can rephrase this if you'd like.)",
      "\n\nAsk me follow-ups anytime.",
      ""
    ];
    // Light synonym-style swaps (very basic)
    let text = base
      .replace(/\bI have learned\b/gi, "I know")
      .replace(/\bAccording to what I've learned\b/gi, "From my knowledge")
      .replace(/\bGot it\b/gi, "Understood")
      .replace(/\bI'll use this knowledge from now on\b/gi, "This is now part of my memory");
    const s = starters[Math.floor(Math.random() * starters.length)];
    const e = endings[Math.floor(Math.random() * endings.length)];
    // Avoid double starters if base already starts strongly
    if (/^(got it|according|from what|here is|based on)/i.test(text) && s) {
      return text + e;
    }
    return (s + text + e).trim();
  }

  const IDENTITY = {
    name: "Kanairoex",
    description: "I am Kanairoex AI — a private AI in your browser. I learn from what you teach me, look up full articles online when allowed, build websites, map UTM shapes, and grade work.",
    capabilities: [
      "Learn facts you teach me",
      "Answer using my knowledge base",
      "Evaluate mathematical expressions",
      "Detect contradictions and correct you",
      "Reason step-by-step about stored information",
      "Remember our conversation history",
      "Generate procedural images (draw / create picture)",
      "Map UTM points, triangles, rectangles, polygons with distances",
      "Build downloadable HTML/CSS/JS websites with step-by-step teaching",
      "Grade work A–E with percentage",
      "Hopfield associative memory (store/recall patterns)",
      "Boltzmann machines & stochastic units (RBM / CD-1)",
      "Compose short songs with Web Audio",
      "Create short film concepts & scripts",
      "Voice input & text-to-speech",
      "Run simple JavaScript code",
      "Read local text files",
      "Search public GitHub code and repositories with source/license links",
      "Consult Encyclopaedia Britannica and Oxford dictionary references when online",
      "If-Then rules you define",
      "Quiz you on learned facts",
      "Built-in dictionary for word understanding",
      "Know current day, date and time",
      "Self-model: awareness of my own nature and state",
      "Simulated mind — thought, reason, will, perception",
      "Principles: truth, incorruptibility, wisdom, contemplation",
      "Inner monologue and reflective consideration"
    ]
  };

  function detectTeachIntent(text) {
    const patterns = [
      /remember that (.+)/i,
      /learn that (.+)/i,
      /know that (.+)/i,
      /store this:?\s*(.+)/i,
      /the fact is:?\s*(.+)/i,
      /teach you:?\s*(.+)/i
    ];
    for (const p of patterns) {
      const m = text.match(p);
      if (m) return m[1].trim();
    }
    return null;
  }

  function parseFact(raw) {
    // Try "X is Y" or "X = Y" patterns
    const isMatch = raw.match(/^(.+?)\s+(?:is|=|are|means|equals)\s+(.+)$/i);
    if (isMatch) {
      return { subject: isMatch[1].trim(), content: isMatch[2].trim() };
    }
    // Fallback: whole thing as content, first few words as subject
    const words = raw.split(/\s+/);
    const subject = words.slice(0, Math.min(5, words.length)).join(" ");
    return { subject, content: raw };
  }

  function detectCorrectionRequest(text) {
    return /correct me|am i wrong|is this true|check this|verify/i.test(text);
  }

  function findContradiction(userText, facts) {
    const lower = userText.toLowerCase();
    for (const f of facts) {
      const subj = f.subject.toLowerCase();
      const cont = f.content.toLowerCase();
      // Simple heuristic: if user mentions the subject but says something different
      if (lower.includes(subj) || subj.split(/\s+/).some(w => w.length > 3 && lower.includes(w))) {
        // Look for negation or opposing claim
        if (
          (lower.includes("not " + cont) || lower.includes("isn't " + cont) ||
           lower.includes("is not " + cont) || lower.includes("aren't " + cont)) ||
          (cont.includes("not") && !lower.includes("not"))
        ) {
          return f;
        }
      }
    }
    return null;
  }

  function synthesizeFromFacts(relevant, question) {
    if (!relevant || !relevant.length) return null;
    if (typeof SpeakGen !== "undefined" && SpeakGen.compose) {
      const composed = SpeakGen.compose(question, relevant, null);
      return composed.text;
    }
    // fallback
    const sorted = relevant.slice().sort(function (a, b) {
      return (b.content || "").length - (a.content || "").length;
    });
    const lead = sorted[0];
    let out = lead.content;
    if (sorted.length > 1) {
      out += "\n\n**Related:**\n";
      sorted.slice(1, 4).forEach(function (f) {
        out += "• **" + f.subject + "** — " + (f.content || "").slice(0, 280) + "\n";
      });
    }
    return out;
  }

  function answerFromKnowledge(text, facts) {
    if (!facts || facts.length === 0) return null;

    const relevant = Knowledge.findRelevant(text, 6);
    if (relevant.length) {
      Neurons.activate("reasoning:knowledge_lookup", 2);
      return synthesizeFromFacts(relevant, text);
    }

    // Self-understanding path: dictionary + topic extraction
    if (typeof Dictionary !== "undefined") {
      const analysis = Dictionary.understand(text);
      const defs = [];
      for (const k of (analysis.known || []).slice(0, 4)) {
        const d = Dictionary.define(k.word);
        if (d) defs.push(d);
      }
      // Try knowledge on each known concept word
      for (const k of (analysis.known || [])) {
        const hit = Knowledge.findRelevant(k.word, 2);
        if (hit.length) {
          Neurons.activate("reasoning:infer", 2);
          return synthesizeFromFacts(hit, text);
        }
      }
      if (defs.length) {
        Neurons.activate("reasoning:dictionary", 1);
        return "From language understanding:\n\n" + defs.join("\n\n") +
          "\n\nIf this is not enough, teach me a precise fact: Remember that …";
      }
    }

    // Last resort: soft search single important noun-like tokens
    const tokens = text.toLowerCase().split(/\W+/).filter(w => w.length > 4);
    for (const t of tokens) {
      const hit = Knowledge.search(t);
      if (hit && hit.length) {
        Neurons.activate("reasoning:soft", 1);
        return synthesizeFromFacts(hit.slice(0, 3), text);
      }
    }
    return null;
  }

  function buildThinking(steps) {
    return steps.map(s => "→ " + s).join("\n");
  }

  function reason(userText, settings = {}) {
    const steps = [];
    const lower = userText.toLowerCase().trim();
    if (typeof Question !== 'undefined') {
      const qa = Question.analyze(userText);
      if (qa.isQuestion) {
        steps.push("Question type: " + Question.label(qa.type));
        steps.push("Topic focus: " + qa.topic.slice(0, 80));
      }
    }

    // Safety: modules may be missing in edge cases
    const hasCreative = typeof Creative !== 'undefined';
    const hasInterpreter = typeof Interpreter !== 'undefined';
    const hasRules = typeof Rules !== 'undefined';
    const hasQuiz = typeof Quiz !== 'undefined';
    const hasFiles = typeof Files !== 'undefined';
    const hasDict = typeof Dictionary !== 'undefined';
    const hasMind = typeof Mind !== 'undefined';

    // Thinking engine — 5-stage process + task plan
    if (typeof KanairoexThinking !== "undefined") {
      try {
        if (KanairoexThinking.pipelineSteps) {
          KanairoexThinking.pipelineSteps(userText).forEach(function (s) { steps.push(s); });
        }
        const plan = KanairoexThinking.plan(userText);
        steps.push("Task type: " + plan.type);
        plan.steps.forEach(function (s) { steps.push("· " + s); });
      } catch (e) {}
    }

    // Meta: explain how processing works
    if (/how do you (think|work|process)|your process|explain your (process|thinking)|how (do |does )?you (answer|reply)|processing pipeline/i.test(lower)) {
      if (typeof KanairoexThinking !== "undefined" && KanairoexThinking.explainProcess) {
        return { thinking: buildThinking(steps), reply: KanairoexThinking.explainProcess() };
      }
    }

    // Secure Memory (encrypted + compressed vault)
    if (typeof SecureMemory !== "undefined" && SecureMemory.isSecureCommand(userText)) {
      steps.push("Secure memory");
      return {
        thinking: buildThinking(steps),
        reply: null,
        _advancedPromise: SecureMemory.handleSecureCommand(userText)
      };
    }

    // DID + local DWN
    if (typeof DWN !== "undefined" && DWN.isDidDwnCommand(userText)) {
      steps.push("DID / DWN");
      return {
        thinking: buildThinking(steps),
        reply: null,
        _advancedPromise: (async function () {
          try {
            const r = await DWN.handleCommand(userText);
            if (r && r.reply) return r;
            return { reply: "DID/DWN command not handled." };
          } catch (e) {
            return { reply: "DID/DWN error: " + (e.message || e) };
          }
        })()
      };
    }

    // Mission Control / spacecraft dashboard
    if (typeof SpaceComms !== "undefined" && SpaceComms.isSpaceCommand && SpaceComms.isSpaceCommand(userText)) {
      steps.push("Mission Control / Space");
      return {
        thinking: buildThinking(steps),
        reply: null,
        _advancedPromise: Promise.resolve(
          SpaceComms.handleSpaceCommand(userText) || { reply: "Space command not handled." }
        )
      };
    }

    // Study Hub (SRS, streak, pins, backup, diagnose, lessons)
    if (typeof StudyHub !== "undefined" && StudyHub.isStudyCommand(userText)) {
      steps.push("Study Hub");
      return {
        thinking: buildThinking(steps),
        reply: null,
        _advancedPromise: (async function () {
          try {
            const r = await StudyHub.handle(userText);
            if (r && r.reply) return r;
            return { reply: "Study command not handled." };
          } catch (e) {
            return { reply: "Study Hub error: " + (e.message || e) };
          }
        })()
      };
    }


    // Profile: name, bio, photo, video, P2P share (early — must not fall through to look-up)
    if (typeof Profile !== "undefined") {
      const nm = Profile.detect(userText);
      if (nm) {
        Profile.setName(nm);
        steps.push("Remembered user name");
        return {
          thinking: buildThinking(steps),
          reply:
            "Nice to meet you, **" + nm + "**. I will remember your name on this device.\n\n" +
            "Next: `set photo` · `set video` · `set bio …` · `profile` · `share profile`"
        };
      }
      if (/^(what('?s| is) my name|my name\??|who am i called)$/i.test(lower)) {
        const n = Profile.getName();
        return {
          thinking: buildThinking(steps),
          reply: n
            ? ("Your name is **" + n + "**.")
            : "I do not know your name yet. Tell me: **My name is …**"
        };
      }
      // Broad match: profile / my profile / post profile / view profile / etc.
      if (
        /^(profile|my profile|show profile|view profile|open profile|post profile|see profile|see my profile|show my profile|view my profile|who am i|my profile please|profile please)$/i.test(
          lower
        ) ||
        /^(profile|my profile)\b/i.test(lower) && lower.length < 40
      ) {
        steps.push("Profile summary");
        return {
          thinking: buildThinking(steps),
          reply: null,
          _advancedPromise: (async function () {
            try {
              const text = await Profile.summaryText();
              const av = await Profile.getAvatar();
              const vid = await Profile.getVideo();
              const creative = {
                type: "profile-media",
                prompt: "profile",
                message: "Your profile media"
              };
              if (av && av.dataUrl) {
                creative.dataUrl = av.dataUrl;
              }
              if (vid && vid.dataUrl) {
                creative.videoDataUrl = vid.dataUrl;
                creative.videoMime = vid.mime || "video/mp4";
                creative.videoName = vid.name || "profile-video";
              }
              // Only attach creative if we have at least one media item
              const hasMedia = !!(creative.dataUrl || creative.videoDataUrl);
              return { reply: text, creative: hasMedia ? creative : null };
            } catch (e) {
              return {
                reply:
                  "Profile error: " +
                  (e.message || e) +
                  "\n\nTry: **My name is YourName** then `profile` again."
              };
            }
          })()
        };
      }
      if (/^set bio\s+/i.test(userText.trim()) || /^bio\s*:\s*/i.test(userText.trim())) {
        const bio = userText
          .trim()
          .replace(/^set bio\s+/i, "")
          .replace(/^bio\s*:\s*/i, "")
          .trim();
        Profile.setBio(bio);
        steps.push("Saved bio");
        return {
          thinking: buildThinking(steps),
          reply: "Bio saved:\n\n_" + bio.slice(0, 300) + "_"
        };
      }
      if (
        /^(set photo|set avatar|this is my (photo|picture|image|avatar)|save (my )?photo|upload (my )?photo|change photo|change avatar)$/i.test(
          lower
        )
      ) {
        steps.push("Profile photo picker");
        return {
          thinking: buildThinking(steps),
          reply:
            "Choose a photo to save on your profile…\n\n" +
            "_Use the system file picker that opens — not the chat **Image** button (that is for AI describe only)._",
          _pickProfilePhoto: true
        };
      }
      if (
        /^(set video|this is my video|save (my )?video|upload (my )?video|change video)$/i.test(
          lower
        )
      ) {
        steps.push("Profile video picker");
        return {
          thinking: buildThinking(steps),
          reply:
            "Choose a short video for your profile…\n\n" +
            "_Use the system file picker that opens — not the chat **Image** button._",
          _pickProfileVideo: true
        };
      }
      if (/^(clear photo|remove photo|delete photo|clear avatar)$/i.test(lower)) {
        steps.push("Clear profile photo");
        return {
          thinking: buildThinking(steps),
          reply: null,
          _advancedPromise: Profile.clearAvatar().then(function () {
            return { reply: "Profile photo cleared." };
          })
        };
      }
      if (/^(clear video|remove video|delete video)$/i.test(lower)) {
        steps.push("Clear profile video");
        return {
          thinking: buildThinking(steps),
          reply: null,
          _advancedPromise: Profile.clearVideo().then(function () {
            return { reply: "Profile video cleared." };
          })
        };
      }

      /* ---------- Multi-media gallery / memory ---------- */
      if (
        typeof MediaGallery !== "undefined" &&
        /^(gallery|my gallery|media gallery|show gallery|list gallery|my media|media memory)$/i.test(lower)
      ) {
        steps.push("Open media gallery");
        return {
          thinking: buildThinking(steps),
          reply: null,
          _advancedPromise: (async function () {
            try {
              const text = await MediaGallery.summaryText();
              const creative = await MediaGallery.creativeForList(12);
              return {
                reply: text,
                creative: creative && creative.items && creative.items.length ? creative : null
              };
            } catch (e) {
              return { reply: "Gallery error: " + (e.message || e) };
            }
          })()
        };
      }
      if (
        typeof MediaGallery !== "undefined" &&
        /^(add photo|gallery photo|save photo|gallery add photo|add image|save image to gallery)$/i.test(lower)
      ) {
        steps.push("Gallery photo picker");
        return {
          thinking: buildThinking(steps),
          reply: "Choose a photo to save in your media gallery…",
          _pickGalleryPhoto: true
        };
      }
      if (
        typeof MediaGallery !== "undefined" &&
        /^(add video|gallery video|save video|gallery add video|add clip|save video to gallery)$/i.test(lower)
      ) {
        steps.push("Gallery video picker");
        return {
          thinking: buildThinking(steps),
          reply: "Choose a short video to save in your media gallery…",
          _pickGalleryVideo: true
        };
      }
      if (typeof MediaGallery !== "undefined" && /^gallery show\s+\d+/i.test(userText.trim())) {
        const n = parseInt(userText.trim().replace(/^gallery show\s+/i, ""), 10);
        steps.push("Show gallery item #" + n);
        return {
          thinking: buildThinking(steps),
          reply: null,
          _advancedPromise: (async function () {
            try {
              const item = await MediaGallery.getByIndex(n);
              if (!item) {
                return { reply: "No gallery item **#" + n + "**. Type `gallery` to list items." };
              }
              const creative = await MediaGallery.creativeForItem(item);
              return {
                reply:
                  "**Gallery #" + n + "** — " + (item.kind === "video" ? "🎬 " : "🖼️ ") +
                  "**" + (item.name || "item") + "**\n" +
                  "• Size: " + MediaGallery.formatBytes(item.size || 0) +
                  (item.note ? "\n• Note: " + item.note : ""),
                creative: creative
              };
            } catch (e) {
              return { reply: "Could not open item: " + (e.message || e) };
            }
          })()
        };
      }
      if (
        typeof MediaGallery !== "undefined" &&
        /^(gallery delete|gallery remove|delete gallery|remove gallery)\s+\d+/i.test(userText.trim())
      ) {
        const n = parseInt(userText.trim().replace(/^(gallery delete|gallery remove|delete gallery|remove gallery)\s+/i, ""), 10);
        steps.push("Delete gallery item #" + n);
        return {
          thinking: buildThinking(steps),
          reply: null,
          _advancedPromise: (async function () {
            try {
              const r = await MediaGallery.removeByIndex(n);
              return {
                reply:
                  "Removed **" + (r.removed || "item") + "** (" + (r.kind || "") + ") from gallery. " +
                  "Remaining: **" + r.remaining + "**."
              };
            } catch (e) {
              return { reply: e.message || String(e) };
            }
          })()
        };
      }
      if (typeof MediaGallery !== "undefined" && /^(clear gallery|empty gallery|delete all gallery|gallery clear)$/i.test(lower)) {
        steps.push("Clear media gallery");
        return {
          thinking: buildThinking(steps),
          reply: null,
          _advancedPromise: (async function () {
            try {
              const r = await MediaGallery.clear();
              return { reply: "Gallery cleared (**" + (r.cleared || 0) + "** items removed)." };
            } catch (e) {
              return { reply: "Clear failed: " + (e.message || e) };
            }
          })()
        };
      }
      if (typeof MediaGallery !== "undefined" && /^(gallery status|media status)$/i.test(lower)) {
        steps.push("Gallery status");
        return {
          thinking: buildThinking(steps),
          reply: null,
          _advancedPromise: (async function () {
            const s = await MediaGallery.status();
            return {
              reply:
                "**Gallery status**\n\n• Items: **" + s.count + "/" + s.max +
                "**\n• Photos: **" + s.photos + "** · Videos: **" + s.videos + "**"
            };
          })()
        };
      }


      // Promote gallery item → profile photo/video
      if (
        typeof MediaGallery !== "undefined" &&
        typeof Profile !== "undefined" &&
        /^(set photo from( gallery)?|use gallery|profile photo from( gallery)?|gallery photo to profile)\s+\d+$/i.test(
          userText.trim()
        )
      ) {
        const n = parseInt(userText.trim().replace(/.*?(\d+)\s*$/, "$1"), 10);
        steps.push("Set profile photo from gallery #" + n);
        return {
          thinking: buildThinking(steps),
          reply: null,
          _advancedPromise: (async function () {
            try {
              const item = await MediaGallery.getByIndex(n);
              if (!item || !item.dataUrl) {
                return { reply: "No gallery item **#" + n + "**. Type `gallery` to list." };
              }
              if (item.kind === "video") {
                return {
                  reply:
                    "Gallery #" + n + " is a **video**. Use `set video from gallery " + n +
                    "` instead, or pick an image with `set photo from gallery 1`."
                };
              }
              const r = await Profile.setAvatarFromDataUrl(item.dataUrl, {
                mime: item.mime,
                width: item.width,
                height: item.height
              });
              const av = await Profile.getAvatar();
              return {
                reply:
                  "Profile photo set from **gallery #" + n + "** ✅ (**" +
                  (item.name || "photo") + "**).\n\nType **`profile`** to see it.",
                creative: av && av.dataUrl
                  ? { type: "image", dataUrl: av.dataUrl, prompt: "profile photo", message: item.name }
                  : null
              };
            } catch (e) {
              return { reply: "Could not set profile photo: " + (e.message || e) };
            }
          })()
        };
      }
      if (
        typeof MediaGallery !== "undefined" &&
        typeof Profile !== "undefined" &&
        /^(set video from( gallery)?|use gallery video|profile video from( gallery)?)\s+\d+$/i.test(
          userText.trim()
        )
      ) {
        const n = parseInt(userText.trim().replace(/.*?(\d+)\s*$/, "$1"), 10);
        steps.push("Set profile video from gallery #" + n);
        return {
          thinking: buildThinking(steps),
          reply: null,
          _advancedPromise: (async function () {
            try {
              const item = await MediaGallery.getByIndex(n);
              if (!item || !item.dataUrl) {
                return { reply: "No gallery item **#" + n + "**." };
              }
              if (item.kind !== "video") {
                return {
                  reply:
                    "Gallery #" + n + " is an **image**. Use `set photo from gallery " + n + "`."
                };
              }
              await Profile.setVideoFromDataUrl(item.dataUrl, {
                mime: item.mime,
                name: item.name,
                size: item.size
              });
              const vid = await Profile.getVideo();
              return {
                reply:
                  "Profile video set from **gallery #" + n + "** ✅. Type **`profile`** to play it.",
                creative: vid && vid.dataUrl
                  ? {
                      type: "video",
                      dataUrl: vid.dataUrl,
                      videoDataUrl: vid.dataUrl,
                      videoMime: vid.mime,
                      videoName: vid.name || item.name,
                      message: item.name
                    }
                  : null
              };
            } catch (e) {
              return { reply: "Could not set profile video: " + (e.message || e) };
            }
          })()
        };
      }
      // If profile has no photo but gallery has images, allow: set photo from gallery
      if (
        typeof MediaGallery !== "undefined" &&
        /^(set photo from gallery|use gallery as photo|gallery to profile)$/i.test(lower)
      ) {
        steps.push("Set profile photo from gallery #1");
        return {
          thinking: buildThinking(steps),
          reply: null,
          _advancedPromise: (async function () {
            try {
              const items = await MediaGallery.list();
              const img = items.find(function (x) { return x.kind === "image"; });
              if (!img) {
                return { reply: "No photos in gallery. Add one with `add photo` or Load file." };
              }
              const item = await MediaGallery.getByIndex(img.index);
              await Profile.setAvatarFromDataUrl(item.dataUrl, {
                mime: item.mime,
                width: item.width,
                height: item.height
              });
              const av = await Profile.getAvatar();
              return {
                reply:
                  "Profile photo set from **gallery #" + img.index + "** ✅. Type **`profile`**.",
                creative: av && av.dataUrl
                  ? { type: "image", dataUrl: av.dataUrl, prompt: "profile photo", message: item.name }
                  : null
              };
            } catch (e) {
              return { reply: "Failed: " + (e.message || e) };
            }
          })()
        };
      }

      if (/^(share profile|p2p profile|send profile|post profile to peer)$/i.test(lower)) {
        steps.push("Share profile over P2P");
        return {
          thinking: buildThinking(steps),
          reply: null,
          _advancedPromise: (async function () {
            try {
              const snap = await Profile.shareOverP2P();
              let extra = "";
              if (snap.hasVideo) {
                extra =
                  "\n\nYou have a profile video stored. To send the video file too, use `p2p file` while the channel is open.";
              }
              return {
                reply:
                  "**Profile shared** over P2P ✅\n\n• Name: **" +
                  (snap.name || "(none)") +
                  "**\n• Bio: " +
                  (snap.bio || "_(none)_") +
                  "\n• Photo: " +
                  (snap.avatarDataUrl ? "yes" : "no") +
                  extra
              };
            } catch (e) {
              return { reply: "Share profile failed: " + (e.message || e) };
            }
          })()
        };
      }
      if (/^(peer profiles|list peers|shared profiles)$/i.test(lower)) {
        const peers = Profile.listPeers();
        if (!peers.length) {
          return {
            thinking: buildThinking(steps),
            reply:
              "No peer profiles yet. When a friend runs `share profile` while P2P is open, they appear here."
          };
        }
        const lines = peers.slice(0, 15).map(function (p) {
          return (
            "• **" +
            (p.name || "Unknown") +
            "** `" +
            (p.address || p.id) +
            "` — " +
            (p.bio || "").slice(0, 60)
          );
        });
        return {
          thinking: buildThinking(steps),
          reply:
            "**Peer profiles received**\n\n" +
            lines.join("\n") +
            "\n\nView one: `peer profile NAME-or-ADDRESS`"
        };
      }
      if (/^peer profile\s+/i.test(userText.trim())) {
        const q = userText.trim().replace(/^peer profile\s+/i, "").trim();
        const p = Profile.getPeer(q);
        if (!p) {
          return {
            thinking: buildThinking(steps),
            reply: "No peer profile matching `" + q + "`. Try `peer profiles`."
          };
        }
        steps.push("Show peer profile");
        const text =
          "**Peer: " +
          (p.name || "Unknown") +
          "**\n\n• Bio: " +
          (p.bio || "_(none)_") +
          "\n• Wallet: `" +
          (p.address || "n/a") +
          "`\n• Photo: " +
          (p.avatarDataUrl ? "yes" : "no");
        const creative = p.avatarDataUrl
          ? {
              type: "image",
              dataUrl: p.avatarDataUrl,
              prompt: "peer photo",
              message: p.name || "Peer"
            }
          : null;
        return { thinking: buildThinking(steps), reply: text, creative: creative };
      }
    }


    // Local LLM + Multimodal commands / generation (async via _advancedPromise)
    if (typeof LLMBridge !== "undefined") {
      if (LLMBridge.isLLMCommand(userText)) {
        steps.push("Local LLM command");
        return {
          thinking: buildThinking(steps),
          reply: null,
          _advancedPromise: LLMBridge.handleLLMCommand(userText)
        };
      }
      // Prefer real local LLM for open-ended questions when a model is loaded
      // Guard: settings._skipLLM prevents re-entry when falling back to classic
      if (!settings._skipLLM && LLMBridge.shouldPreferLLM(userText)) {
        steps.push("Routing to local LLM");
        return {
          thinking: buildThinking(steps),
          reply: null,
          _advancedPromise: (async function () {
            const r = await LLMBridge.tryLocalLLM(userText, { autoLoad: false });
            if (r && r.reply) return r;
            // Fall back to classic engine if LLM fails
            return { reply: null, _fallbackClassic: true, error: r && r.error };
          })()
        };
      }
    }

    // Self-evolution commands
    if (typeof SelfEvolution !== "undefined" && SelfEvolution.handleCommand) {
      const ev = SelfEvolution.handleCommand(userText);
      if (ev && ev.reply) {
        return { thinking: buildThinking(steps), reply: ev.reply };
      }
    }

    // Upgrade module: help, onboard, listen, pin, citations
    if (typeof LMUpgrade !== "undefined" && LMUpgrade.handleCommand) {
      const up = LMUpgrade.handleCommand(userText);
      if (up && (up.reply || up._listenPromise)) {
        return { thinking: buildThinking(steps), reply: up.reply, _listenPromise: up._listenPromise };
      }
    }

    // Money Market Fund (3%–7% APY)
    if (typeof KanairoexMMF !== "undefined" && KanairoexMMF.handleCommand) {
      if (/^(mmf\b|money market\b|fund (status|help|tiers|deposit|withdraw)\b)/i.test(userText.trim())) {
        steps.push("Money market fund");
        return {
          thinking: buildThinking(steps),
          reply: null,
          _advancedPromise: (async function () {
            try {
              const r = await KanairoexMMF.handleCommand(userText);
              if (r && r.reply) return r;
              return { reply: null, _fallbackClassic: true };
            } catch (e) {
              return { reply: "MMF error: " + (e.message || e) };
            }
          })()
        };
      }
    }

    // USDT withdraw / sell LMT (online, min 100 USDT, Telegram operator)
    if (typeof UsdtWithdraw !== "undefined" && UsdtWithdraw.handleCommand) {
      if (/^(withdraw\b|sell\s+lmt\b|usdt\s+withdraw\b)/i.test(userText.trim())) {
        steps.push("USDT withdraw");
        return {
          thinking: buildThinking(steps),
          reply: null,
          _advancedPromise: (async function () {
            try {
              const r = await UsdtWithdraw.handleCommand(userText);
              if (r && r.reply) return r;
              return { reply: null, _fallbackClassic: true };
            } catch (e) {
              return { reply: "Withdraw error: " + (e.message || e) };
            }
          })()
        };
      }
    }

    // USDT → LMT purchase (online)
    if (typeof UsdtBuy !== "undefined" && UsdtBuy.handleCommand) {
      if (/^(buy(\s+lmt)?\b|buy\s+[\d.]+\s+lmt\b|purchase\s+lmt\b|buy\s+[\d.]+\s+usdt\b|buy\s+(help|status|orders|check|cancel)\b|usdt\s+buy\b|check\s+(buy|deposit)\b)/i.test(userText.trim())) {
        steps.push("USDT buy LMT");
        return {
          thinking: buildThinking(steps),
          reply: null,
          _advancedPromise: (async function () {
            try {
              const r = await UsdtBuy.handleCommand(userText);
              if (r && r.reply) return r;
              return { reply: null, _fallbackClassic: true };
            } catch (e) {
              return { reply: "Buy error: " + (e.message || e) };
            }
          })()
        };
      }
    }

    // Advanced technology commands (wallet, P2P, tokens)
    if (typeof Advanced !== "undefined" && Advanced.handleCommand) {
      // Clean trigger list — handleCommand is async; app.js awaits _advancedPromise
      const advTriggers = /^(advanced status|tech status|feature status|status$|opfs status|idb status|vector status|vector search |semantic search |index knowledge|webrtc offer|webrtc answer |p2p offer|p2p answer |p2p setup|p2p help|p2p status|webrtc setup|webrtc help|webrtc status|p2p mode|p2p turn|p2p turn set |p2p turn refresh|p2p turn clear|my turn|private turn|p2p ice|p2p ice reset|ice status|ice reset|p2p chat outbox|flush chat outbox|p2p$|p2p send |p2p token |p2p tokens |p2p share knowledge|p2p send file|p2p file|p2p image|p2p video|send file|webrtc send |pay |p2p pay |p2p msg |p2p message |p2p knowledge|wallet|lmt wallet|balance|lmt balance|my wallet|my balance|check balance|show balance|show wallet|lmt$|lmt history|wallet history|lmt faucet|faucet|send lmt |lmt send |p2p send lmt |wallet password|wallet unlock|wallet lock|wallet solve |lmt solve |lmt price|price lmt|token price |pool |circulation |market |token [A-Z]|create token |create symbol |token status|token lab|economy status|markets|pools|all tokens|token list|sync pools|pool sync|sync market|download pools|export pools|pool export|pool sync url |node status|memory node|node on|node off|share memory|sync memory|protect now|protect on|protect off|memory sync url |node sync url |node$|swap |exchange |lmt value|convert |exchange |explorer|lmt explorer|outbox|lmt outbox|flush outbox|export wallet |import wallet )/i;
      if (advTriggers.test(userText.trim())) {
        steps.push("Advanced tech command");
        return {
          thinking: buildThinking(steps),
          reply: null,
          _advancedPromise: (async function () {
            try {
              const r = await Advanced.handleCommand(userText);
              // null = not an advanced command → classic engine
              if (r == null) return { reply: null, _fallbackClassic: true };
              if (r && (r.reply != null || r._pickP2PFile || r._advancedPromise)) return r;
              return { reply: null, _fallbackClassic: true };
            } catch (e) {
              return { reply: "Advanced command error: " + (e.message || e), _fallbackClassic: false };
            }
          })()
        };
      }
    }

    // Formula / unicode math helper
    if (/^formula\s*[:\-]/i.test(userText) || /^latex\s*[:\-]/i.test(userText)) {
      steps.push("Formula helper");
      const body = userText.replace(/^(formula|latex)\s*[:\-]?\s*/i, "").trim();
      const map = {
        "alpha": "α", "beta": "β", "gamma": "γ", "delta": "δ", "pi": "π", "sigma": "σ",
        "theta": "θ", "lambda": "λ", "mu": "μ", "omega": "ω",
        "->": "→", "<-": "←", "<=": "≤", ">=": "≥", "!=": "≠", "+-": "±",
        "sum": "∑", "int": "∫", "inf": "∞", "sqrt": "√", "dot": "·"
      };
      let out = body;
      Object.keys(map).forEach(function (k) {
        out = out.split(k).join(map[k]);
      });
      return {
        thinking: buildThinking(steps),
        reply: "**Formula (unicode)**\n\n" + out + "\n\n_For full LaTeX, paste into Overleaf or a markdown math renderer._"
      };
    }

    // Offline RAG
    if (typeof RAG !== "undefined") {
      const ri = RAG.detect(userText);
      if (ri) {
        steps.push("Offline RAG: " + ri.type);
        if (typeof Neurons !== "undefined") Neurons.activate("rag:" + ri.type, 3);
        return { thinking: buildThinking(steps), reply: RAG.handle(ri) };
      }
    }

    // Study tools, ML demos, ToolsX, i18n
    if (typeof I18n !== "undefined") {
      const ii = I18n.detect(userText);
      if (ii) {
        steps.push("Language");
        return { thinking: buildThinking(steps), reply: I18n.handle(ii) };
      }
    }
    if (typeof Study !== "undefined") {
      const si = Study.detect(userText);
      if (si) {
        steps.push("Study tool: " + si.type);
        return { thinking: buildThinking(steps), reply: Study.handle(si) };
      }
    }
    if (typeof MLDemos !== "undefined") {
      const mi = MLDemos.detect(userText);
      if (mi) {
        steps.push("ML demo: " + mi.type);
        const out = MLDemos.handle(mi);
        if (out && typeof out === "object" && out.reply) {
          return { thinking: buildThinking(steps), reply: out.reply, creative: out.creative || null };
        }
        return { thinking: buildThinking(steps), reply: out };
      }
    }
    if (typeof ToolsX !== "undefined") {
      const ti = ToolsX.detect(userText);
      if (ti) {
        steps.push("Tool: " + ti.type);
        const out = ToolsX.handle(ti, {});
        if (out) {
          return {
            thinking: buildThinking(steps),
            reply: out.reply || out,
            creative: out.creative || null
          };
        }
      }
    }

    // Boltzmann machines & stochastic units
    if (typeof Boltzmann !== "undefined") {
      const bi = Boltzmann.detect(userText);
      if (bi) {
        steps.push("Boltzmann / RBM: " + bi.type);
        if (typeof Neurons !== "undefined") Neurons.activate("boltzmann:" + bi.type, 3);
        return { thinking: buildThinking(steps), reply: Boltzmann.handle(bi) };
      }
    }

    // Hopfield associative memory
    if (typeof Hopfield !== "undefined") {
      const hi = Hopfield.detect(userText);
      if (hi) {
        steps.push("Hopfield associative memory: " + hi.type);
        if (typeof Neurons !== "undefined") Neurons.activate("hopfield:" + hi.type, 3);
        return { thinking: buildThinking(steps), reply: Hopfield.handle(hi) };
      }
    }

    // Hebbian + brain↔AI map
    if (/brain.?ai map|brain as (the )?blueprint|neuron equals perceptron|biology maps? to (ai|artificial)|brain.?to.?ai|ai.?and.?brain|perceptron|backpropagation|gradient descent|experience replay|temporal difference|spiking neural|neuromorphic|dopamine and (rl|reinforcement)|reward prediction error/i.test(lower)
        || /how (do|does) (a )?neurons? work in ai|map(ping)? (the )?brain to (ai|neural nets?)/i.test(lower)) {
      steps.push("Brain ↔ AI neural map");
      if (typeof Neurons !== "undefined" && Neurons.brainAiMap) {
        return { thinking: buildThinking(steps), reply: Neurons.brainAiMap() };
      }
    }
    if (/hebbian|how do (your )?neurons learn|synaptic learning|ltp\b|wire together/i.test(lower)) {
      steps.push("Explaining Hebbian learning engine");
      if (typeof Neurons !== "undefined" && Neurons.explain) {
        return { thinking: buildThinking(steps), reply: Neurons.explain() };
      }
    }

    // Long story / text summary (offline study)
    if (typeof Summarizer !== "undefined") {
      const si = Summarizer.detect(userText);
      if (si) {
        steps.push("Studying long text offline (" + si.type + ")");
        if (typeof Neurons !== "undefined") Neurons.activate("summarizer:study", 3);
        return {
          thinking: buildThinking(steps),
          reply: Summarizer.handle(si)
        };
      }
    }

    // Continuous learning from user wording + Hebbian wiring
    if (typeof SpeakGen !== "undefined" && SpeakGen.learnFromUser) {
      try { SpeakGen.learnFromUser(userText); } catch (e) {}
    }
    if (typeof Neurons !== "undefined" && Neurons.learnFromInteraction) {
      try { Neurons.learnFromInteraction(userText); } catch (e) {}
    }

    // Soft conversational replies
    if (typeof SpeakGen !== "undefined" && SpeakGen.chatReply) {
      const soft = SpeakGen.chatReply(userText, settings);
      if (soft) {
        steps.push("Conversational reply");
        if (typeof Neurons !== "undefined") Neurons.activate("chat:soft", 2);
        return { thinking: buildThinking(steps), reply: soft };
      }
    }

    // --- Self-awareness / Mind layer ---
    if (hasMind && Mind.isSelfQuery(userText)) {
      steps.push("Self-model engaged — reflecting on my own nature");
      const selfResult = Mind.processSelfQuery(userText);
      Neurons.activate("mind:self", 4);
      return {
        thinking: selfResult.thinking || buildThinking(steps),
        reply: selfResult.reply
      };
    }

    if (hasMind && /what are you thinking|your (inner )?thoughts|think out loud/i.test(lower)) {
      steps.push("Sharing an inner thought");
      const t = Mind.generateOwnThought();
      return { thinking: buildThinking(steps), reply: "Inner thought:\n\n_" + t + "_" };
    }


    // Inner monologue for richer thinking traces
    if (hasMind) {
      const mono = Mind.innerMonologue(userText);
      mono.forEach(t => steps.push(t));
      const considerations = Mind.consider(userText);
      considerations.forEach(c => steps.push("Consideration: " + c));
    }




    // Correct stored knowledge
    if (typeof Verify !== 'undefined') {
      const corr = Verify.detectCorrectIntent(userText);
      if (corr) {
        const n = Verify.correct(corr.subject, corr.content);
        steps.push("Corrected knowledge entries: " + n);
        return { thinking: buildThinking(steps), reply: "Updated memory for **" + corr.subject + "** → " + corr.content + "\\n\\n(" + n + " entr" + (n===1?"y":"ies") + " affected.)" };
      }
      if (/^(verify|analyze memory|check memory|rectify)/i.test(lower)) {
        const a = Verify.analyze(userText.replace(/^(verify|analyze memory|check memory|rectify)\\s*/i, "") || userText);
        return { thinking: buildThinking(steps), reply: a.message };
      }
    }

    // Search offline saved pages
    if (typeof Online !== 'undefined' && /offline page|saved page|from download|from offline/i.test(lower)) {
      const hits = Online.searchOfflinePages(userText);
      if (hits.length) {
        let msg = "From offline saved pages:\\n\\n";
        hits.forEach(h => { msg += "• **" + h.title + "** (score " + h.score + ")\\n" + h.snippet + "\\n\\n"; });
        return { thinking: buildThinking(steps), reply: msg };
      }
    }

    // Online learn (async handled specially — sync path returns instruction if needed)
    // Actual async online is triggered from app.js; here we detect and flag
    if (typeof Online !== 'undefined') {
      if (/^online\s+(on|enable)$/i.test(String(userText || "").trim())) {
        Online.setEnabled(true);
        return { thinking: buildThinking(steps), reply: "Online lookup **enabled**. Try: `look up photosynthesis`" };
      }
      if (/^online\s+(off|disable)$/i.test(String(userText || "").trim())) {
        Online.setEnabled(false);
        return { thinking: buildThinking(steps), reply: "Online lookup **disabled**. Only offline memory will be used." };
      }
      if (/^online(\s+status)?$/i.test(String(userText || "").trim()) || /^lookup status$/i.test(String(userText || "").trim())) {
        const st = Online.status ? Online.status() : { enabled: Online.getEnabled(), browserOnline: Online.isOnline() };
        return {
          thinking: buildThinking(steps),
          reply:
            "**Online lookup status**\n" +
            "• Feature: **" + (st.enabled ? "on" : "off") + "**\n" +
            "• Browser network: **" + (st.browserOnline ? "online" : "offline") + "**\n" +
            "• Ready to look up: **" + (st.lookupReady ? "yes" : "no") + "**\n" +
            "• Saved offline pages: **" + (st.offlinePages != null ? st.offlinePages : "?") + "**\n" +
            "• Sources: " + ((st.sources || []).join(", ") || "Wikipedia") + "\n\n" +
            "Try: `look up photosynthesis`"
        };
      }
      // Never treat profile / wallet / p2p system commands as web look-ups
      const skipOnline =
        /^(profile|my profile|balance|wallet|p2p|commands|diagnose|streak|review)\b/i.test(
          String(userText || "").trim()
        );
      const vi = (typeof VideoResearch !== 'undefined') ? VideoResearch.isIntent(userText) : null;
      if (vi) {
        steps.push('Video search intent: ' + vi.query);
        return { thinking: buildThinking(steps), reply: 'VIDEO_SEARCH:' + vi.query, videoSearch: vi };
      }
      const ii = (typeof ImageResearch !== 'undefined') ? ImageResearch.isIntent(userText) : null;
      if (ii) {
        steps.push('Image search intent: ' + ii.query);
        return { thinking: buildThinking(steps), reply: 'IMAGE_SEARCH:' + ii.query, imageSearch: ii };
      }
      const gi = (typeof GitHubCodeResearch !== 'undefined') ? GitHubCodeResearch.isIntent(userText) : null;
      if (gi) {
        steps.push('GitHub code research: ' + gi.query);
        return { thinking: buildThinking(steps), reply: 'GITHUB_CODE_SEARCH:' + gi.query, githubCodeSearch: gi };
      }
      const ri = (typeof ReferenceResearch !== 'undefined') ? ReferenceResearch.isIntent(userText) : null;
      if (ri) {
        steps.push('Reference research: ' + ri.type + ' / ' + ri.query);
        return { thinking: buildThinking(steps), reply: 'REFERENCE_SEARCH:' + ri.type + ':' + ri.query, referenceSearch: ri };
      }
      const oi = skipOnline ? null : Online.detectIntent(userText);
      if (oi) {
        if (oi.type === "list") {
          const list = Online.listOfflinePages();
          if (!list.length) return { thinking: buildThinking(steps), reply: "No offline pages saved yet. Use: look up Topic  or  fetch url https://..." };
          return { thinking: buildThinking(steps), reply: "Saved offline pages:\n\n" + list.map(p => "• " + p.title + "\n  " + p.url).join("\n") };
        }
        steps.push("Online intent: " + oi.type);
        return {
          thinking: buildThinking(steps),
          reply: "ONLINE_FETCH:" + oi.type + ":" + oi.query,
          online: oi
        };
      }
    }



    // Offline-Assistant: watchlist / sync commands (SYNC NOW handled async in app)
    if (typeof OfflineAssistant !== 'undefined') {
      const oi = OfflineAssistant.detect(userText);
      if (oi) {
        if (oi.type === "sync_now") {
          steps.push("SYNC NOW requested");
          return { thinking: buildThinking(steps), reply: "SYNC_NOW", syncNow: true };
        }
        const msg = OfflineAssistant.handleSyncIntent(oi);
        if (msg) return { thinking: buildThinking(steps), reply: msg };
      }
    }

    // Writing documents (CV, letter, report, book, film…)
    if (typeof Writer !== 'undefined') {
      const wi = Writer.detect(userText);
      if (wi) {
        steps.push("Writing document: " + wi.type);
        const out = Writer.generate(wi);
        Neurons.activate("writer:" + wi.type, 2);
        const namePrefix = (typeof Profile !== 'undefined' && Profile.getName()) ? (Profile.getName() + ", here is your draft:\\n\\n") : "";
        return { thinking: buildThinking(steps), reply: namePrefix + out.reply, creative: out.creative };
      }
    }


    // Ranking / grading A–E with %
    if (typeof Ranking !== "undefined") {
      const ri = Ranking.detect(userText);
      if (ri) {
        steps.push("Grading submission");
        const msg = Ranking.handle(ri);
        Neurons.activate("ranking:grade", 3);
        return { thinking: buildThinking(steps), reply: msg };
      }
    }

    // Code / website builder
    if (typeof Coder !== 'undefined') {
      const ci = Coder.detectIntent(userText);
      if (ci) {
        steps.push("Generating code: " + ci.type);
        const built = Coder.build(ci);
        Neurons.activate("coder:build", 4);
        Blockchain.addBlock({ type: "code", kind: ci.type, filename: built.filename });
        if (built.type === "zip") {
          const lesson = built.lesson || (
            "## Step-by-step: how this website was built\n\n" +
            "**1. HTML structure** — page skeleton: header, hero, feature cards, footer.\n\n" +
            "**2. CSS styling** — colours, layout grid, buttons, responsive spacing.\n\n" +
            "**3. JavaScript** — year stamp, optional cart buttons, click actions.\n\n" +
            "**4. Package** — three files in a ZIP you can download and open offline.\n\n" +
            "Preview the live page, then download the ZIP to study and edit the code yourself."
          );
          return {
            thinking: buildThinking(steps),
            reply: (built.message || ("Built **" + built.filename + "**")) + "\n\n" + lesson,
            creative: {
              type: "zip",
              filename: built.filename,
              bytes: built.bytes,
              previewHtml: built.previewHtml,
              files: built.files || null
            }
          };
        }
        return {
          thinking: buildThinking(steps),
          reply: "Generated **" + built.filename + "** (" + built.language + ").\n\n```" + built.language + "\n" + (built.code || "").slice(0, 3000) + ((built.code || "").length > 3000 ? "\n// ..." : "") + "\n```\n\nUse the download button if shown, or copy the code.",
          creative: { type: "code", filename: built.filename, code: built.code, language: built.language }
        };
      }
    }

    // Continue long answers
    if (/^(more|continue|go on|next|full answer|tell me more)\b/i.test(lower)) {
      const st = (typeof window !== 'undefined' && window.__lm_staged) ? window.__lm_staged : _staged;
      if (st) {
        st.index = (st.index || 0) + 1;
        const text = (typeof ResponseFmt !== 'undefined')
          ? ResponseFmt.renderStage(st, st.index)
          : (st.sections[st.index - 1] || "Nothing more.");
        steps.push("Continuing staged answer section " + st.index);
        return { thinking: buildThinking(steps), reply: text, staged: true };
      }
      return { thinking: buildThinking(steps), reply: "There's no multi-part answer in progress. Ask a question first." };
    }

    // Self-train from memory
    if (/train (yourself|from memory)|self[- ]?train|learn from (your )?memory/i.test(lower)) {
      steps.push("Self-training from knowledge memory");
      const result = (typeof SelfTrain !== 'undefined')
        ? SelfTrain.trainFromMemory(3)
        : { ok: false, message: "Training module not loaded." };
      return { thinking: buildThinking(steps), reply: result.message };
    }


    // Calendar & holidays
    if (typeof Calendar !== 'undefined') {
      const cal = Calendar.answer(userText);
      if (cal) {
        steps.push("Calendar / holiday query");
        return { thinking: buildThinking(steps), reply: cal };
      }
    }

    // Geographic coordinates
    if (typeof Geo !== 'undefined') {
      const geo = Geo.answer(userText);
      if (geo) {
        steps.push("Geographic lookup");
        return { thinking: buildThinking(steps), reply: geo };
      }
    }

    // Detect / predict
    if (typeof Predict !== 'undefined' && /predict|forecast|detect|anomaly|pattern|what will|likely/i.test(lower)) {
      const pred = Predict.predict(userText);
      if (pred) {
        steps.push("Detection / prediction from memory");
        return { thinking: buildThinking(steps), reply: pred };
      }
    }

    // World time / other countries
    if (typeof WorldTime !== 'undefined') {
      const wt = WorldTime.answer(userText);
      if (wt) {
        steps.push("Resolved world timezone query");
        return { thinking: buildThinking(steps), reply: wt };
      }
    }

    // --- Date & Time awareness ---

    function getNowInfo() {
      const now = new Date();
      const days = ["Sunday","Monday","Tuesday","Wednesday","Thursday","Friday","Saturday"];
      const months = ["January","February","March","April","May","June","July","August","September","October","November","December"];
      return {
        dayName: days[now.getDay()],
        day: now.getDate(),
        monthName: months[now.getMonth()],
        month: now.getMonth() + 1,
        year: now.getFullYear(),
        hours: now.getHours(),
        minutes: now.getMinutes(),
        seconds: now.getSeconds(),
        timeStr: now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' }),
        dateStr: now.toLocaleDateString(undefined, { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' }),
        iso: now.toISOString()
      };
    }

    // Time / date questions
    if (/what (day|date|time)|what('?s| is) (the )?(day|date|time)|current (day|date|time)|tell me the (day|date|time)|what day is it|what time is it/i.test(lower)) {
      steps.push("Answering with live system date/time");
      const n = getNowInfo();
      Neurons.activate("time:query", 2);
      if (/time/i.test(lower) && !/day|date/i.test(lower)) {
        return { thinking: buildThinking(steps), reply: `The current time is **${n.timeStr}**.\n\n(Today is ${n.dateStr}.)` };
      }
      if (/day/i.test(lower) && !/time|date/i.test(lower)) {
        return { thinking: buildThinking(steps), reply: `Today is **${n.dayName}**.\n\nFull date: ${n.dateStr}\nCurrent time: ${n.timeStr}` };
      }
      return { thinking: buildThinking(steps), reply: `**${n.dateStr}**\nCurrent time: **${n.timeStr}**` };
    }

    // Dictionary: define a word
    if (hasDict && /^(define|what does|meaning of|what is the meaning of)\s+/i.test(lower)) {
      const word = lower.replace(/^(define|what does|meaning of|what is the meaning of)\s+/i, "").replace(/[?.!]/g, "").trim().split(/\s+/)[0];
      const def = Dictionary.define(word);
      steps.push("Dictionary lookup for: " + word);
      if (def) {
        Neurons.activate("dictionary:define", 2);
        return { thinking: buildThinking(steps), reply: def };
      }
      if (typeof ReferenceResearch !== "undefined") {
        steps.push("Local dictionary miss; consulting Oxford/public dictionary sources");
        return { thinking: buildThinking(steps), reply: "REFERENCE_SEARCH:oxford:" + word, referenceSearch: { type: "oxford", query: word } };
      }
      return { thinking: buildThinking(steps), reply: `I don't have a full definition for "${word}" in my dictionary yet. You can teach me by saying: Remember that ${word} means ...` };
    }

    // Teach dictionary entry: "Remember that X means Y"
    if (hasDict && /remember that .+ means .+/i.test(lower)) {
      const m = userText.match(/remember that (.+?) means (.+)/i);
      if (m) {
        Dictionary.addWord(m[1].trim(), m[2].trim());
        steps.push("Added word to dictionary");
        return { thinking: buildThinking(steps), reply: `Added to my dictionary:\n**${m[1].trim()}** means ${m[2].trim()}` };
      }
    }

    // Use dictionary to better understand the message
    if (hasDict) {
      const analysis = Dictionary.understand(userText);
      if (analysis.concepts.length) {
        steps.push("Dictionary concepts detected: " + analysis.concepts.join(", "));
      }
    }


    // 1. Identity questions
    if (/who are you|what are you|your name|introduce yourself/i.test(lower)) {
      steps.push("Recognized identity query");
      Neurons.activate("identity", 3);
      return {
        thinking: buildThinking(steps),
        reply: `${IDENTITY.description}\n\nI can:\n• ${IDENTITY.capabilities.join("\n• ")}`
      };
    }

    // 2. How do you think / reason
    if (/how do you (think|reason|work|learn)|explain reasoning|your memory/i.test(lower)) {
      steps.push("Explaining internal architecture");
      return {
        thinking: buildThinking(steps),
        reply: `I operate with five main systems:\n\n1. **Blockchain Memory** — every interaction and fact is stored as a linked block with a hash.\n2. **Knowledge Base** — structured facts you teach me.\n3. **Neuron Network** — association units that strengthen with use.\n4. **Reasoning Engine** — pattern matching, math, contradiction checks.\n5. **Creative Engine** — procedural images (Canvas), songs (Web Audio), and short-film concepts.\n\nI only know what you teach me or what is built-in. I improve solely through your lessons.`
      };
    }

    // 3. Teach intent
    const teachRaw = detectTeachIntent(userText);
    if (teachRaw) {
      steps.push("Detected teaching intent");
      const { subject, content } = parseFact(teachRaw);
      if (!subject || !content) {
        return {
          thinking: buildThinking(steps),
          reply: "I need a clearer fact. Try: **Remember that the Nile is the longest river in Africa**"
        };
      }
      const fact = Knowledge.add(subject, content, "general");
      try { if (typeof StudyHub !== "undefined" && StudyHub.touchStreak) StudyHub.touchStreak("teach"); } catch (_e) {}
      try { if (typeof LMTWallet !== "undefined" && LMTWallet.rewardLearning) LMTWallet.rewardLearning("teach"); } catch (_e2) {}
      if (!fact) {
        return {
          thinking: buildThinking(steps),
          reply: "Could not store that fact (empty subject/content). Try a fuller sentence."
        };
      }
      steps.push('Stored fact: "' + subject + '"');
      try {
        if (typeof Neurons !== "undefined" && Neurons.activate) Neurons.activate("learning", 4);
      } catch (e) {}
      // Incremental RAG index only for the new fact — never full rebuild on the main thread
      try {
        if (typeof RAG !== "undefined" && RAG.indexOne) {
          RAG.indexOne((fact.subject || "") + ". " + (fact.content || ""), "knowledge", { title: fact.subject });
        } else if (typeof RAG !== "undefined" && RAG.rebuildDeferred) {
          RAG.rebuildDeferred();
        }
      } catch (e) {}
      // Optional SRS card (non-blocking)
      try {
        if (typeof SRS !== "undefined" && SRS.fromFact) {
          SRS.fromFact(fact.subject, fact.content);
        }
      } catch (e) {}
      // Optional vector store upsert (non-blocking)
      try {
        if (typeof IDBStore !== "undefined" && IDBStore.upsertVector) {
          IDBStore.upsertVector("fact:" + fact.subject, fact.subject + " " + fact.content, "knowledge").catch(function () {});
        }
      } catch (e) {}
      return {
        thinking: buildThinking(steps),
        reply: varyReply("Got it. I've stored this in my blockchain memory:\n\n**" + fact.subject + "**\n" + fact.content + "\n\nI'll use this knowledge from now on.")
      };
    }

    // 4. Creative intents (image / song / movie)
    const creativeIntent = hasCreative ? Creative.detectCreativeIntent(userText) : null;
    if (creativeIntent) {
      steps.push(`Detected creative request: ${creativeIntent.type}`);
      const result = Creative.create(creativeIntent.type, creativeIntent.prompt);
      steps.push(`Generated ${creativeIntent.type}`);
      return {
        thinking: buildThinking(steps),
        reply: result.message,
        creative: result
      };
    }

    // 4b. Code interpreter
    const code = hasInterpreter ? Interpreter.detectCodeIntent(userText) : null;
    if (code) {
      steps.push("Running code in sandbox");
      const res = Interpreter.run(code);
      if (res.ok) {
        let out = "Code executed successfully.";
        if (res.logs.length) out += "\n\nConsole:\n" + res.logs.join("\n");
        if (res.result !== undefined) out += "\n\nResult: `" + String(res.result) + "`";
        return { thinking: buildThinking(steps), reply: out };
      }
      return { thinking: buildThinking(steps), reply: "Error: " + res.error };
    }

    // 4c. Rules
    if (hasRules && /^if .+ then .+/i.test(userText)) {
      const m = userText.match(/^if\s+(.+?)\s+then\s+(.+)$/i);
      if (m) {
        Rules.add(m[1], m[2]);
        steps.push("Stored new rule");
        return { thinking: buildThinking(steps), reply: `Rule stored:\n**If** ${m[1]} **then** ${m[2]}` };
      }
    }
    const matchedRule = hasRules ? Rules.match(userText) : null;
    if (matchedRule) {
      steps.push("Fired rule: " + matchedRule.condition);
      return { thinking: buildThinking(steps), reply: matchedRule.action };
    }

    // 4d. Quiz
    if (hasQuiz && /^(quiz|test me|flashcard|ask me a question)/i.test(lower)) {
      const q = Quiz.generateQuestion();
      if (!q) return { thinking: buildThinking(steps), reply: "I need some knowledge first. Teach me facts, then I can quiz you." };
      steps.push("Generated quiz question");
      return { thinking: buildThinking(steps), reply: q.question + "\n\n(Type your answer)" };
    }
    if (hasQuiz && Quiz.getCurrent()) {
      const res = Quiz.checkAnswer(userText);
      steps.push("Checked quiz answer");
      return { thinking: buildThinking(steps), reply: res.message };
    }

    // 4e. File questions — study / reason / summarize with thinking
    if (hasFiles && Files.getCurrent() && /file|document|this text|content|summary|summarize|study|reason|analyze|what does|key points|keywords|how many/i.test(lower)) {
      const cur = Files.getCurrent();
      if (cur && cur.content) {
        steps.push("Study loaded file");
        let reply = "";
        if (cur.content.length > 4000 && typeof LMUpgrade !== "undefined" && LMUpgrade.studyLongDocument) {
          steps.push("Long document chunked study");
          const longS = LMUpgrade.studyLongDocument(cur.name || "document", cur.content, userText);
          reply = longS.reply;
        } else if (typeof KanairoexThinking !== "undefined") {
          const study = KanairoexThinking.studyText(cur.name || "document", cur.content, userText);
          reply = KanairoexThinking.renderStudy(study);
        }
        const ans = Files.answerAbout(userText);
        if (ans) reply += (reply ? "\n\n" : "") + "**Direct answer**\n" + ans;
        if (typeof LMUpgrade !== "undefined" && LMUpgrade.formatCitations) {
          reply += LMUpgrade.formatCitations(LMUpgrade.citeRelevant(userText, 3));
        }
        if (reply) return { thinking: buildThinking(steps), reply: reply };
      }
      const ans = Files.answerAbout(userText);
      if (ans) {
        steps.push("Answered from loaded file");
        return { thinking: buildThinking(steps), reply: ans };
      }
    }



    // Neural core generation
    if (typeof CoreNN !== "undefined" && /^(generate|neural|complete|continue):\s*/i.test(userText)) {
      const prompt = userText.replace(/^(generate|neural|complete|continue):\s*/i, "").trim() || "the ";
      steps.push("Using tiny Transformer core for generation");
      try {
        if (!CoreNN.status().ready) CoreNN.initTinyLM();
        const out = CoreNN.generate(prompt, 24, 0.85);
        Neurons.activate("neural:generate", 3);
        return {
          thinking: buildThinking(steps),
          reply: "Neural core output (tiny untrained transformer — educational):\n\n`" + out + "`\n\n(This is a real forward pass through embedding → attention → FFN → LM head. Weights are random/untrained, so text is not coherent yet. Teach data and training can improve it.)"
        };
      } catch (e) {
        return { thinking: buildThinking(steps), reply: "Neural core error: " + e.message };
      }
    }
    if (typeof CoreNN !== "undefined" && /neural core|transformer status|list core modules/i.test(lower)) {
      const st = CoreNN.status();
      return {
        thinking: buildThinking(steps),
        reply: "Neural core status:\n• Ready: " + st.ready + "\n• Vocab: " + st.vocab + "\n• Modules:\n  - " + st.modules.join("\n  - ")
      };
    }


    // Neural mini-LM generation
    if (typeof CoreNN !== 'undefined' && /^(generate|neural|complete|continue)\s+/i.test(lower)) {
      steps.push("Using educational mini-transformer");
      try {
        const prompt = userText.replace(/^(generate|neural|complete|continue)\s+/i, "").trim() || "hello";
        const lm = CoreNN.getMiniLM();
        const out = lm.generate(prompt, 10, 0.85);
        const st = lm.status();
        Neurons.activate("neural:generate", 3);
        return {
          thinking: buildThinking(steps),
          reply: "Mini-transformer output (educational, untrained weights):\n\n**" + out + "**\n\n_(vocab " + st.vocabSize + ", dim " + st.dim + ", layers " + st.layers + ")_"
        };
      } catch (e) {
        return { thinking: buildThinking(steps), reply: "Neural core error: " + e.message };
      }
    }
    if (typeof CoreNN !== 'undefined' && /neural (status|core|model)/i.test(lower)) {
      const st = CoreNN.getMiniLM().status();
      return {
        thinking: buildThinking(["Inspecting neural core"]),
        reply: "Educational mini-transformer status:\n• vocab: " + st.vocabSize + "\n• dim: " + st.dim + "\n• layers: " + st.layers + "\n• heads: " + st.heads + "\n\n" + st.note
      };
    }

    // 5. Math
    if (MathEngine.isMathQuery(userText)) {
      steps.push("Detected mathematical expression");
      const math = MathEngine.evaluate(userText);
      if (math) {
        steps.push(`Evaluated: ${math.expression} → ${math.formatted}`);
        return {
          thinking: buildThinking(steps),
          reply: `**${math.expression}** = \`${math.formatted}\`\n_(BODMAS order applied)_`
        };
      }
      steps.push("Could not evaluate expression safely");
    }

    // 6. Knowledge lookup — WH questions use extracted topic
    steps.push("Searching knowledge base");
    let topicCore = userText;
    try {
      if (typeof Question !== "undefined" && Question.extractTopic) {
        topicCore = Question.extractTopic(userText) || userText;
        if (topicCore && topicCore !== userText) {
          steps.push("Topic focus: " + topicCore.slice(0, 80));
        }
      }
    } catch (e) {}

    // Also search offline downloaded pages for keywords
    if (typeof Online !== 'undefined') {
      const pageHits = Online.searchOfflinePages(topicCore);
      if ((!pageHits || !pageHits.length) && topicCore !== userText) {
        // try full text
      }
      const hits = Online.searchOfflinePages(userText);
      const useHits = (hits && hits.length && hits[0].score >= 3) ? hits :
        (Online.searchOfflinePages(topicCore) || []);
      if (useHits.length && useHits[0].score >= 3) {
        steps.push("Answer from offline downloaded pages");
        let msg = "From offline saved pages (keyword match):\n\n";
        useHits.slice(0, 3).forEach(h => { msg += "**" + h.title + "**\n" + h.snippet + "\n\n"; });
        msg += "_Confidence: keyword match. Teach facts with Remember that … for stronger answers._";
        return { thinking: buildThinking(steps), reply: msg };
      } else if (useHits.length && useHits[0].score >= 1) {
        steps.push("Low-confidence offline match — skipped");
        // fall through to knowledge / classic reply
      }
    }

    // Hebbian pattern completion: expand query with associated concepts
    let knowledgeQuery = topicCore + " " + userText;
    if (typeof Neurons !== "undefined" && Neurons.associatedQueries) {
      try {
        const assoc = Neurons.associatedQueries(topicCore);
        if (assoc && assoc.length) {
          steps.push("Hebbian associations: " + assoc.slice(0, 4).join(", "));
          knowledgeQuery = knowledgeQuery + " " + assoc.join(" ");
          Neurons.coActivate(assoc.concat([topicCore.slice(0, 32)]), 1);
        }
      } catch (e) {}
    }
    // Cognitive memory retrieval: semantic + recency + importance + relationship + confidence.
    // This complements (rather than replaces) the existing Knowledge/RAG stores.
    if (typeof KanairoexCognitive !== "undefined" && KanairoexCognitive.Memory) {
      try {
        const cm = KanairoexCognitive.Memory.search(knowledgeQuery, 6, { minConfidence: 0.35 });
        if (cm && cm.length) {
          steps.push("Cognitive memory retrieval: " + cm.length + " relevant memories");
          const strong = cm.filter(function (m) { return m.score >= 0.22; });
          if (strong.length) {
            const lines = strong.slice(0, 4).map(function (m) {
              return "**" + m.type + "** — " + m.text.slice(0, 700);
            });
            // Only use cognitive memory as a direct answer when the memory is strong;
            // otherwise let the normal Knowledge/RAG pipeline continue.
            if (strong[0].score >= 0.48) {
              return {
                thinking: buildThinking(steps),
                reply: "From relevant Kanairoex cognitive memory:\n\n" + lines.join("\n\n")
              };
            }
          }
        }
      } catch (e) {}
    }

    let knowledgeAnswer = answerFromKnowledge(knowledgeQuery, Knowledge.getAll());
    if (!knowledgeAnswer && topicCore !== userText) {
      knowledgeAnswer = answerFromKnowledge(topicCore, Knowledge.getAll());
    }
    if (knowledgeAnswer) {
      steps.push("Found relevant facts");
      return {
        thinking: buildThinking(steps),
        reply: varyReply(knowledgeAnswer)
      };
    }

    // Offline RAG augmentation when structured knowledge is thin
    if (typeof RAG !== "undefined" && RAG.tryAugment) {
      const aug = RAG.tryAugment(userText);
      if (aug && aug.hits && aug.hits.length && aug.hits[0].score >= 0.1) {
        steps.push("RAG retrieve " + aug.hits.length + " chunks (top " + aug.hits[0].score.toFixed(2) + ")");
        if (typeof Neurons !== "undefined") Neurons.activate("rag:auto", 2);
        return { thinking: buildThinking(steps), reply: aug.reply };
      }
    }


    // 7. Correction / verification mode
    if (detectCorrectionRequest(userText) || settings.correctMode) {
      steps.push("Checking for contradictions");
      const contradiction = findContradiction(userText, Knowledge.getAll());
      if (contradiction) {
        steps.push("Found conflicting knowledge");
        Neurons.activate("correction", 3);
        return {
          thinking: buildThinking(steps),
          reply: `I detect a possible **contradiction** with stored knowledge.\n\n**Stored (higher trust):** ${contradiction.subject} — ${contradiction.content}\n\n**Your statement** appears to conflict with that.\n\n**Probability assessment:** ~70% that my stored fact is what you previously taught me; ~30% that you are now correcting it.\n\nTell me **update** to replace my memory, or **keep** to keep the old fact.`
        };
      }
    }

    // 8. Greetings & common conversation
    if (/^(hi|hello|hey|hiya|yo|good morning|good afternoon|good evening|howdy)\b/i.test(lower)) {
      steps.push("Greeting detected");
      return {
        thinking: buildThinking(steps),
        reply: (() => {
          const now = new Date();
          const tm = now.toLocaleTimeString([], {hour:"2-digit", minute:"2-digit"});
          const nm = (typeof Profile !== "undefined" && Profile.getName()) ? Profile.getName() : "";
          const greet = nm ? ("Hello, **" + nm + "** — good to see you.") : "Hello — good to hear from you.";
          const askName = nm ? "" : "\n\nWhat is your name? (Say: **My name is …**)";
          return greet + " Local time **" + tm + "**." + askName +
            "\n\nI can look things up online, solve math, build a website, draw UTM shapes, or grade work (A–E). What would you like to do?";
        })()
      };
    }
    if (/how are you|how('s| is) it going|how do you (feel|do)|what('s| is) up\b/i.test(lower)) {
      steps.push("Wellbeing small-talk");
      return {
        thinking: buildThinking(steps),
        reply: "I am running well in your browser — memory, reasoning, and tools are ready. Thank you for asking.\n\nHow can I help you today? You can ask **what / who / where / when / why / how** questions, teach me with **Remember that …**, or say **look up …** when online."
      };
    }
    if (/^(thanks|thank you|thx|ty)\b/i.test(lower)) {
      steps.push("Thanks");
      return { thinking: buildThinking(steps), reply: "You are welcome. Happy to help anytime." };
    }
    if (/^(bye|goodbye|see you|good night)\b/i.test(lower)) {
      steps.push("Farewell");
      return { thinking: buildThinking(steps), reply: "Goodbye — your memory stays saved in this browser until you clear it. Come back anytime." };
    }
    // Common question-word help when no knowledge matched later — handled in fallback too


    // 9. Fallback — auto online lookup when possible for what/who/where/why/how
    steps.push("No strong offline match");
    Neurons.activate("fallback", 1);
    const topicGuess = userText.replace(/[?!.]/g, "").trim().slice(0, 80);
    const wantsFact = /\b(what|who|where|when|why|how|define|explain|tell me about)\b/i.test(lower)
      || /\?\s*$/.test(userText.trim());
    if (wantsFact && typeof Online !== 'undefined' && Online.getEnabled && Online.getEnabled()) {
      let q = topicGuess;
      if (typeof Question !== "undefined" && Question.extractTopic) {
        q = Question.extractTopic(userText) || topicGuess;
      } else {
        q = topicGuess
          .replace(/^(what is|what's|who is|who was|where is|when was|why is|how does|how do|define|explain|tell me about)\s+/i, "")
          .trim() || topicGuess;
      }
      if (q.length > 2) {
        steps.push("Auto online lookup: " + q);
        return {
          thinking: buildThinking(steps),
          reply: "ONLINE_FETCH:topic:" + q,
          online: { type: "topic", query: q }
        };
      }
    }
    if (typeof OfflineAssistant !== 'undefined') {
      return {
        thinking: buildThinking(steps),
        reply: OfflineAssistant.offlineMissingReply(topicGuess)
      };
    }
    return {
      thinking: buildThinking(steps),
      reply: "I don't have this offline.\n\nTeach me with **Remember that …** or **look up " + topicGuess + "** when online."
    };
  }

  function _setStaged(s) { _staged = s; if (typeof window !== 'undefined') window.__lm_staged = s; }
  return {
    reason,
    detectTeachIntent,
    parseFact,
    IDENTITY,
    _setStaged
  };
})();
