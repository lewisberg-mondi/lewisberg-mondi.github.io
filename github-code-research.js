/**
 * GitHub Code Research for Kanairoex.
 * Browser-safe public GitHub API integration; no secret token is embedded.
 * Prefer repository search (works without auth). Code search often 403/rate-limits unauthenticated.
 */
const GitHubCodeResearch = (() => {
  const API = 'https://api.github.com';
  const MAX_RESULTS = 6;
  const MAX_SNIPPET = 7000;
  const TIMEOUT = 14000;

  async function fetchJson(url) {
    const c = new AbortController();
    const t = setTimeout(() => c.abort(), TIMEOUT);
    try {
      const r = await fetch(url, {
        method: 'GET',
        mode: 'cors',
        credentials: 'omit',
        cache: 'no-store',
        signal: c.signal,
        headers: {
          Accept: 'application/vnd.github+json',
          'X-GitHub-Api-Version': '2022-11-28',
          'User-Agent': 'Kanairoex-LocalMind/1.0 (educational offline AI)'
        }
      });
      if (!r.ok) {
        const e = new Error('GitHub HTTP ' + r.status);
        e.status = r.status;
        try {
          const body = await r.json();
          if (body && body.message) e.message = 'GitHub HTTP ' + r.status + ': ' + body.message;
        } catch (_) {}
        throw e;
      }
      return await r.json();
    } finally {
      clearTimeout(t);
    }
  }

  function clean(q) {
    return String(q || '')
      .trim()
      .replace(/[?.!]+$/g, '')
      .replace(/\s+/g, ' ')
      .slice(0, 180);
  }

  function isIntent(text) {
    const raw = String(text || '').trim();
    // Prefer "search/find code for X" before "search github for ..."
    let m = raw.match(
      /(?:search|find|look\s*up|show|give\s+me|find\s+me)\s+(?:for\s+)?(?:code|github\s+code|an?\s+implementation)\s+(?:for|about|of|on)\s+(.+)/i
    );
    if (!m)
      m = raw.match(
        /(?:search|find|look\s*up)\s+(?:github|github\s+repositories|github\s+repo(?:s)?)\s+(?:for|about|on)?\s*(.+)/i
      );
    if (!m) m = raw.match(/(?:github|github\s+repo(?:s)?)\s+(?:code\s+)?(?:for|about|on)\s+(.+)/i);
    if (!m) m = raw.match(/(?:give|show)\s+me\s+(?:some\s+)?(?:code|implementation)\s+(?:for|of)\s+(.+)/i);
    if (!m) m = raw.match(/\bgithub\b.*\b(?:code|repo|repository)\b.*\b(?:for|about|on)\s+(.+)/i);
    if (!m) return null;
    let q = clean(m[1]);
    // "search GitHub for code for offline wallet" → strip leading "code for/about/on"
    q = q.replace(/^(?:code|implementation)\s+(?:for|about|of|on)\s+/i, '').trim();
    q = q.replace(/^(?:code|repos?|repositories)\s+/i, '').trim();
    q = q.replace(/^(?:an?|the)\s+/i, '').trim();
    return q ? { query: q } : null;
  }

  function rawUrl(htmlUrl) {
    const m = String(htmlUrl || '').match(
      /^https:\/\/github\.com\/([^/]+\/[^/]+)\/blob\/([^/]+)\/(.+)$/
    );
    return m ? 'https://raw.githubusercontent.com/' + m[1] + '/' + m[2] + '/' + m[3] : '';
  }

  function normalizeCodeItem(x) {
    const repo = x.repository || {};
    return {
      name: x.name || x.path || 'source file',
      path: x.path || '',
      repo: repo.full_name || '',
      repoUrl: repo.html_url || (repo.full_name ? 'https://github.com/' + repo.full_name : ''),
      htmlUrl: x.html_url || '',
      rawUrl: rawUrl(x.html_url),
      language: repo.language || '',
      description: repo.description || '',
      license: (repo.license && (repo.license.spdx_id || repo.license.name)) || 'License not reported by API',
      score: Number(x.score || 0)
    };
  }

  function normalizeRepo(r) {
    return {
      name: (r.name || 'repository') + ' (repository)',
      path: '',
      repo: r.full_name || '',
      repoUrl: r.html_url || '',
      htmlUrl: r.html_url || '',
      rawUrl: '',
      language: r.language || '',
      description: r.description || '',
      license: (r.license && (r.license.spdx_id || r.license.name)) || 'License not reported by API',
      score: Number(r.stargazers_count || 0),
      repository: true
    };
  }

  async function searchCode(q, limit) {
    const url =
      API +
      '/search/code?q=' +
      encodeURIComponent(q) +
      '&per_page=' +
      Math.min(limit || MAX_RESULTS, 10);
    const data = await fetchJson(url);
    return (data.items || []).map(normalizeCodeItem).filter((x) => x.htmlUrl);
  }

  async function searchRepos(q, limit) {
    const n = Math.min(limit || MAX_RESULTS, 10);
    const urls = [
      API +
        '/search/repositories?q=' +
        encodeURIComponent(q) +
        '&sort=stars&order=desc&per_page=' +
        n,
      API +
        '/search/repositories?q=' +
        encodeURIComponent(q + ' language:JavaScript OR language:TypeScript OR language:Python OR language:HTML') +
        '&sort=stars&order=desc&per_page=' +
        n
    ];
    let lastErr = null;
    for (const url of urls) {
      try {
        const data = await fetchJson(url);
        const items = (data.items || []).map(normalizeRepo).filter((x) => x.repoUrl || x.htmlUrl);
        if (items.length) return items;
      } catch (e) {
        lastErr = e;
      }
    }
    if (lastErr) throw lastErr;
    return [];
  }

  async function fetchSnippet(item) {
    if (!item.rawUrl) return item;
    try {
      const c = new AbortController();
      const t = setTimeout(() => c.abort(), TIMEOUT);
      const r = await fetch(item.rawUrl, {
        mode: 'cors',
        credentials: 'omit',
        cache: 'no-store',
        signal: c.signal
      });
      clearTimeout(t);
      if (!r.ok) return item;
      const text = await r.text();
      return Object.assign({}, item, { snippet: text.slice(0, MAX_SNIPPET) });
    } catch (_) {
      return item;
    }
  }

  async function search(query, limit) {
    const q = clean(query);
    if (!q) throw Error('GitHub code search query is empty.');

    let items = [];
    let mode = 'repositories';

    // Prefer repositories: unauthenticated code search is almost always rate-limited (403).
    try {
      items = await searchRepos(q, limit || MAX_RESULTS);
      mode = 'repositories';
    } catch (e) {
      /* fall through */
    }

    if (!items.length) {
      try {
        items = await searchCode(q, limit || MAX_RESULTS);
        mode = 'code';
      } catch (_) {
        /* code search often blocked without token */
      }
    }

    // Soften common phrases: "website code" → also try "website"
    if (!items.length && /\bcode\b/i.test(q)) {
      const softer = clean(q.replace(/\bcode\b/gi, '').replace(/\s+/g, ' '));
      if (softer && softer !== q) {
        try {
          items = await searchRepos(softer, limit || MAX_RESULTS);
          mode = 'repositories';
        } catch (_) {}
      }
    }

    if (!items.length) {
      return {
        query: q,
        mode: 'none',
        results: [],
        source: 'GitHub',
        searchedAt: new Date().toISOString(),
        note:
          'No public repositories matched. GitHub code search requires authentication for higher limits; try a shorter or more specific query.'
      };
    }

    const detailed = await Promise.all(
      items.slice(0, limit || MAX_RESULTS).map(fetchSnippet)
    );
    return {
      query: q,
      mode,
      results: detailed,
      source: 'GitHub',
      searchedAt: new Date().toISOString()
    };
  }

  function save(result) {
    if (!result || !result.results) return;
    const text = result.results
      .map(
        (r, i) =>
          `${i + 1}. ${r.repo || r.name}\n${r.path || ''}\n${r.htmlUrl}\nLicense: ${r.license}\n${
            r.snippet ? r.snippet.slice(0, 1800) : r.description || ''
          }`
      )
      .join('\n\n');
    if (typeof Online !== 'undefined' && Online.storeInMemory) {
      Online.storeInMemory(
        'GitHub code research: ' + result.query,
        text,
        'https://github.com/search?q=' + encodeURIComponent(result.query) + '&type=repositories'
      );
    }
    try {
      localStorage.setItem(
        'localmind_github_research_' + Date.now(),
        JSON.stringify(result)
      );
    } catch (_) {}
  }

  return { isIntent, search, save };
})();
if (typeof window !== 'undefined') window.GitHubCodeResearch = GitHubCodeResearch;
