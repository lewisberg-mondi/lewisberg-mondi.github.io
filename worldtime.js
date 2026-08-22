/**
 * World time — clocks for major cities / timezones
 */
const WorldTime = (() => {
  const zones = [
    { city: "Nairobi", tz: "Africa/Nairobi" },
    { city: "Lagos", tz: "Africa/Lagos" },
    { city: "Cairo", tz: "Africa/Cairo" },
    { city: "London", tz: "Europe/London" },
    { city: "Paris", tz: "Europe/Paris" },
    { city: "Berlin", tz: "Europe/Berlin" },
    { city: "Moscow", tz: "Europe/Moscow" },
    { city: "Dubai", tz: "Asia/Dubai" },
    { city: "Mumbai", tz: "Asia/Kolkata" },
    { city: "Beijing", tz: "Asia/Shanghai" },
    { city: "Tokyo", tz: "Asia/Tokyo" },
    { city: "Singapore", tz: "Asia/Singapore" },
    { city: "Sydney", tz: "Australia/Sydney" },
    { city: "New York", tz: "America/New_York" },
    { city: "Chicago", tz: "America/Chicago" },
    { city: "Denver", tz: "America/Denver" },
    { city: "Los Angeles", tz: "America/Los_Angeles" },
    { city: "Sao Paulo", tz: "America/Sao_Paulo" },
    { city: "UTC", tz: "UTC" }
  ];

  function nowIn(tz) {
    try {
      const d = new Date();
      const time = d.toLocaleTimeString("en-GB", { timeZone: tz, hour: "2-digit", minute: "2-digit", second: "2-digit" });
      const date = d.toLocaleDateString("en-GB", { timeZone: tz, weekday: "short", year: "numeric", month: "short", day: "numeric" });
      return { time, date };
    } catch {
      return null;
    }
  }

  function findZone(query) {
    const q = query.toLowerCase();
    return zones.find(z =>
      q.includes(z.city.toLowerCase()) ||
      q.includes(z.tz.toLowerCase()) ||
      (q.includes("kenya") && z.city === "Nairobi") ||
      (q.includes("uk") && z.city === "London") ||
      (q.includes("usa") && z.city === "New York") ||
      (q.includes("us ") && z.city === "New York") ||
      (q.includes("india") && z.city === "Mumbai") ||
      (q.includes("japan") && z.city === "Tokyo") ||
      (q.includes("china") && z.city === "Beijing") ||
      (q.includes("australia") && z.city === "Sydney")
    );
  }

  function answer(query) {
    const lower = query.toLowerCase();
    const timeIntent = /\b(time|clock|timezone|time zone|what time|hours in|o'?clock)\b/i.test(lower)
      || /all (countries|timezones|cities)|world clock|times around the world/i.test(lower);
    if (!timeIntent) return null;
    if (/all (countries|timezones|cities)|world clock|times around the world/i.test(lower)) {
      let out = "**World clocks (now):**\n\n";
      for (const z of zones) {
        const n = nowIn(z.tz);
        if (n) out += `• **${z.city}**: ${n.time} (${n.date})\n`;
      }
      return out;
    }
    const z = findZone(lower);
    if (z) {
      const n = nowIn(z.tz);
      if (n) return `In **${z.city}** (${z.tz}) it is **${n.time}** on ${n.date}.`;
    }
    // default local already handled elsewhere
    return null;
  }

  function listCities() {
    return zones.map(z => z.city).join(", ");
  }

  return { answer, listCities, zones, nowIn };
})();
