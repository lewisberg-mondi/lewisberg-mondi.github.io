/**
 * Document writer — CV, resume, letters, reports, stories, film outlines
 * Varied styles from memory + templates
 */
const Writer = (() => {
  function detect(text) {
    const lower = text.toLowerCase();
    if (/\b(cv|curriculum vitae)\b/i.test(lower) && /(write|create|draft|make|generate)/i.test(lower))
      return { type: "cv", prompt: text };
    if (/\bresume\b/i.test(lower) && /(write|create|draft|make|generate)/i.test(lower))
      return { type: "resume", prompt: text };
    if (/cover letter/i.test(lower) && /(write|create|draft|make|generate)/i.test(lower))
      return { type: "cover", prompt: text };
    if (/formal letter|business letter/i.test(lower) && /(write|create|draft|make|generate)/i.test(lower))
      return { type: "formal_letter", prompt: text };
    if (/\breport\b/i.test(lower) && /(write|create|draft|make|generate)/i.test(lower))
      return { type: "report", prompt: text };
    if (/\bsummary\b/i.test(lower) && /(write|create|draft|make|generate|summarize)/i.test(lower))
      return { type: "summary", prompt: text };
    if (/data report|report on data|analyze data/i.test(lower))
      return { type: "data_report", prompt: text };
    if (/(write|draft|outline)\s+(a\s+)?(book|novel|story)/i.test(lower))
      return { type: "book", prompt: text };
    if (/(write|draft|outline)\s+(a\s+)?(film|movie|screenplay)/i.test(lower))
      return { type: "film", prompt: text };
    if (/brainstorm/i.test(lower))
      return { type: "brainstorm", prompt: text };
    return null;
  }

  function extractTopic(text) {
    return text
      .replace(/^(write|create|draft|make|generate|outline|summarize)\s+/i, "")
      .replace(/^(a|an|the)\s+/i, "")
      .replace(/\b(cv|resume|cover letter|formal letter|report|summary|book|film|movie)\b/gi, "")
      .replace(/\s+/g, " ")
      .trim()
      .slice(0, 120) || "general topic";
  }

  function fromMemory(topic) {
    if (typeof Knowledge === "undefined") return [];
    return Knowledge.findRelevant(topic, 4) || [];
  }

  function stylePick() {
    const styles = ["formal", "concise", "detailed", "persuasive"];
    return styles[Math.floor(Math.random() * styles.length)];
  }

  function cv(prompt) {
    const topic = extractTopic(prompt);
    const name = (typeof Profile !== "undefined" && Profile.getName()) || "[Your Full Name]";
    const mem = fromMemory(topic);
    const extra = mem.map(f => "• " + f.content).join("\n") || "• [Add achievements relevant to " + topic + "]";
    return {
      title: "Curriculum Vitae",
      text:
`**CURRICULUM VITAE**

**${name}**
[Phone] · [Email] · [City, Country]

**Professional Summary**
Motivated candidate with interest in **${topic}**. Clear communicator, reliable, and focused on continuous learning.

**Education**
• [Degree / Certificate] — [Institution], [Year]
• Relevant coursework: ${topic}

**Experience**
• [Role], [Organisation] ([Year–Year])
  - Delivered results related to ${topic}
  - Collaborated in a team and met deadlines

**Skills**
• Communication · Problem-solving · Time management
• ${topic}

**Additional**
${extra}

**References**
Available on request.`
    };
  }

  function resume(prompt) {
    const topic = extractTopic(prompt);
    const name = (typeof Profile !== "undefined" && Profile.getName()) || "[Your Name]";
    return {
      title: "Resume",
      text:
`**RESUME — ${name}**

**Objective**
Seeking an opportunity in **${topic}** where I can apply skills and grow professionally.

**Highlights**
• Strong written and verbal communication
• Organised and detail-oriented
• Experience / interest: ${topic}

**Experience**
**[Job Title]** — [Company] | [Dates]
- Key achievement related to ${topic}
- Supported team goals and customer needs

**Education**
[School / University] — [Qualification], [Year]

**Skills**
${topic} · Teamwork · Digital literacy · Problem solving`
    };
  }

  function cover(prompt) {
    const topic = extractTopic(prompt);
    const name = (typeof Profile !== "undefined" && Profile.getName()) || "[Your Name]";
    return {
      title: "Cover Letter",
      text:
`[Your Address]
[Date]

[Hiring Manager's Name]
[Company Name]

Dear Hiring Manager,

I am writing to apply for the opportunity related to **${topic}**. I am motivated, ready to learn, and committed to contributing positively to your team.

Through study and practice in ${topic}, I have developed reliability, clear communication, and a careful approach to tasks. I would welcome the chance to discuss how I can support your goals.

Thank you for your time and consideration.

Yours sincerely,  
**${name}**`
    };
  }

  function formalLetter(prompt) {
    const topic = extractTopic(prompt);
    const name = (typeof Profile !== "undefined" && Profile.getName()) || "[Your Name]";
    return {
      title: "Formal Letter",
      text:
`[Your Address]
[Date]

[Recipient's Name]
[Recipient's Address]

Dear Sir/Madam,

**Re: ${topic}**

I am writing regarding **${topic}**. I wish to present the matter clearly and request your kind attention.

[State facts briefly.]  
[State what you request or propose.]

I look forward to your response.

Yours faithfully,  
**${name}**`
    };
  }

  function report(prompt) {
    const topic = extractTopic(prompt);
    const mem = fromMemory(topic);
    const findings = mem.length
      ? mem.map((f, i) => (i + 1) + ". " + f.subject + ": " + f.content).join("\n")
      : "1. Background research is limited in memory — add sources with Remember that…\n2. Scope focuses on " + topic + ".";
    return {
      title: "Report",
      text:
`**REPORT: ${topic}**

**1. Introduction**
This report examines **${topic}**. The aim is to present a clear, structured overview.

**2. Scope and focus**
The discussion is limited to key points useful for study or decision-making.

**3. Findings**
${findings}

**4. Analysis**
Based on available information, ${topic} requires careful definition of terms, evidence, and practical implications.

**5. Conclusion**
${topic} can be understood more deeply by combining definitions, examples, and verified facts.

**6. Recommendations**
• Clarify objectives  
• Gather reliable data  
• Review conclusions against new evidence`
    };
  }

  function summary(prompt) {
    const topic = extractTopic(prompt);
    const mem = fromMemory(topic);
    if (mem.length) {
      return {
        title: "Summary",
        text: "**Summary — " + topic + "**\n\n" +
          mem.map(f => "• **" + f.subject + "**: " + f.content).join("\n") +
          "\n\n**In brief:** the main ideas above capture what is currently stored about this topic."
      };
    }
    return {
      title: "Summary",
      text: "**Summary — " + topic + "**\n\nA concise overview: define the topic, note 2–3 key points, and end with the practical takeaway. Teach me facts on this topic to produce a memory-based summary."
    };
  }

  function dataReport(prompt) {
    return {
      title: "Data Report",
      text:
`**Data Report**

**Question / focus:** ${extractTopic(prompt)}

**1. Data description**  
[Describe variables, units, and source.]

**2. Key figures**  
• Total / count: […]  
• Average: […]  
• Highest / lowest: […]

**3. Patterns**  
• Trend over time or categories  
• Notable outliers

**4. Interpretation**  
Explain what the numbers mean in plain language.

**5. Limitations**  
Sample size, missing values, measurement error.

**6. Conclusion**  
One clear sentence on the main result.`
    };
  }

  function book(prompt) {
    const topic = extractTopic(prompt);
    return {
      title: "Book Outline",
      text:
`**Book outline: ${topic}**

**Working title:** ${topic}
**Logline:** A journey of understanding and change centered on ${topic}.

**Chapter plan**
1. Opening — the world and the problem  
2. Characters / ideas introduced  
3. Rising challenges  
4. Turning point  
5. Climax  
6. Resolution and reflection  

**Themes:** learning, resilience, truth  
**Style options:** narrative · educational · hybrid  

**Next step:** choose chapter 1 scene and draft 500 words.`
    };
  }

  function film(prompt) {
    const topic = extractTopic(prompt);
    return {
      title: "Film Outline",
      text:
`**Film concept: ${topic}**

**Genre:** drama / adventure (adjust as needed)  
**Logline:** When circumstances force a choice about ${topic}, ordinary people must act.

**Act I** — Setup and inciting incident  
**Act II** — Obstacles, alliances, failure  
**Act III** — Confrontation and resolution  

**Key scenes**
1. Ordinary world  
2. Call to action  
3. Midpoint revelation  
4. Lowest point  
5. Final test  

**Visual motif:** contrast between confinement and open space.`
    };
  }

  function brainstorm(prompt) {
    const topic = extractTopic(prompt.replace(/brainstorm/i, ""));
    const mem = fromMemory(topic);
    const ideas = [
      "Define the core problem in one sentence",
      "List 5 assumptions and challenge each",
      "Consider the opposite approach",
      "Who benefits and who is left out?",
      "What would a simple pilot version look like?",
      "What evidence would prove success?"
    ];
    let text = "**Brainstorm — " + topic + "**\n\n";
    ideas.forEach((id, i) => { text += (i + 1) + ". " + id + "\n"; });
    if (mem.length) {
      text += "\n**From memory:**\n" + mem.map(f => "• " + f.subject + ": " + f.content).join("\n");
    }
    text += "\n\n**Next:** pick one idea and ask for a plan or draft.";
    return { title: "Brainstorm", text };
  }

  function generate(intent) {
    const map = {
      cv: cv, resume: resume, cover: cover, formal_letter: formalLetter,
      report: report, summary: summary, data_report: dataReport,
      book: book, film: film, brainstorm: brainstorm
    };
    const fn = map[intent.type] || summary;
    const doc = fn(intent.prompt);
    const style = stylePick();
    return {
      reply: "**" + doc.title + "** _(style: " + style + ")_\n\n" + doc.text,
      creative: { type: "document", title: doc.title, code: doc.text, filename: doc.title.replace(/\s+/g, "_").toLowerCase() + ".txt" }
    };
  }

  return { detect, generate, extractTopic };
})();
