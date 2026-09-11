import { createHash } from "crypto";
import { readFileSync, writeFileSync, mkdirSync, existsSync } from "fs";
import { join } from "path";

const CACHE_DIR = join(process.cwd(), ".cache", "api");

function getCacheKey(url) {
  return createHash("sha256").update(url).digest("hex");
}

async function cachedFetch(url, durationMs) {
  mkdirSync(CACHE_DIR, { recursive: true });
  const key = getCacheKey(url);
  const cacheFile = join(CACHE_DIR, `${key}.json`);

  if (existsSync(cacheFile)) {
    const cached = JSON.parse(readFileSync(cacheFile, "utf-8"));
    if (Date.now() - cached.time < durationMs) {
      return cached.data;
    }
  }

  const res = await fetch(url);
  if (!res.ok) {
    const body = await res.text();
    console.error(`HTTP ${res.status} for ${url}: ${body}`);
    throw new Error(`HTTP ${res.status}`);
  }

  const data = await res.json();
  writeFileSync(cacheFile, JSON.stringify({ time: Date.now(), data }));
  return data;
}

const GAMESDB_API_KEY = process.env.GAMESDB_API_KEY;
const GAMESDB_BASE = "https://api.thegamesdb.net/v1.1";
const YOUTUBE_API_KEY = process.env.YOUTUBE_API_KEY;
const DATA_URL = "https://grimtech.net/2026/nintendo64/Chatters-Choose-Which-N64-Game-I-Play-Next";

// Fetch the source page fresh on every build. Unlike EleventyFetch, this never
// silently falls back to an expired cache entry, so vote data cannot go stale
// when the source is temporarily unreachable. A failure fails the build loudly
// instead of regenerating the site from outdated data.
//
// The source (grimtech.net) sits behind a BunnyCDN edge that ignores query
// strings when computing its cache key, so a `?cb=` value alone does NOT
// guarantee a cache miss: a given edge can keep serving an outdated copy of the
// page. To reliably read the current content we make several attempts that each
// add cache-bypassing request headers (`Cache-Control: no-cache`) plus a unique
// query string, then keep the response with the newest `last-modified` header
// (a stale edge reports an old date; the origin reports the page's real one).
// This way a single stale edge cannot poison the build.
async function fetchSource(attempts = 4) {
  const candidates = [];

  for (let i = 0; i < attempts; i++) {
    try {
      const res = await fetch(`${DATA_URL}?cb=${Date.now()}-${i}-${Math.random()}`, {
        headers: {
          "Cache-Control": "no-cache",
          Pragma: "no-cache",
        },
      });
      if (!res.ok) {
        const body = await res.text();
        console.error(`HTTP ${res.status} for ${DATA_URL}: ${body}`);
        continue;
      }
      candidates.push({
        html: await res.text(),
        etag: res.headers.get("etag"),
        lastModified: res.headers.get("last-modified"),
        fetchedAt: new Date().toISOString(),
      });
    } catch (e) {
      console.error(`Fetch attempt ${i + 1}/${attempts} failed for ${DATA_URL}:`, e.message);
    }
  }

  if (candidates.length === 0) {
    throw new Error(`Failed to fetch ${DATA_URL} after ${attempts} attempts`);
  }

  const newest = candidates.reduce((best, c) => {
    const a = Date.parse(best.lastModified) || 0;
    const b = Date.parse(c.lastModified) || 0;
    return b > a ? c : best;
  }, candidates[0]);

  return newest;
}

async function fetchGameImage(gameName) {
  if (!GAMESDB_API_KEY) {
    console.warn("No GAMESDB_API_KEY set, skipping game image fetch");
    return undefined;
  }

  try {
    const searchUrl = `${GAMESDB_BASE}/Games/ByGameName?apikey=${GAMESDB_API_KEY}&name=${encodeURIComponent(gameName)}&filter[platform]=3&include=boxart`;
    const data = await cachedFetch(searchUrl, 90 * 24 * 60 * 60 * 1000);

    const games = data?.data?.games;
    if (!games || Object.keys(games).length === 0) return undefined;

    const normalize = s => s.toLowerCase().replace(/[^a-z0-9]/g, "");
    const gameList = Object.values(games);
    const game = gameList.find(g => normalize(g.game_title || "") === normalize(gameName)) || gameList[0];

    const gameBoxart = data?.include?.boxart?.data?.[String(game.id)];
    if (gameBoxart) {
      const front = gameBoxart.find(b => b.side === "front") || gameBoxart[0];
      if (front?.filename) {
        const baseUrl = data.include.boxart.base_url?.original || "https://cdn.thegamesdb.net/images/original/";
        return `${baseUrl}${front.filename}`;
      }
    }

    return undefined;
  } catch (e) {
    console.error(`Failed to fetch game image for "${gameName}":`, e.message);
    return undefined;
  }
}

async function fetchYouTubeChannelImage(channelUrl) {
  if (!YOUTUBE_API_KEY || !channelUrl) return undefined;

  try {
    const handle = channelUrl.split("/").pop();
    if (!handle) return undefined;

    const apiUrl = `https://www.googleapis.com/youtube/v3/channels?forHandle=${encodeURIComponent(handle)}&part=snippet&key=${YOUTUBE_API_KEY}`;
    const data = await cachedFetch(apiUrl, 90 * 24 * 60 * 60 * 1000);

    return data?.items?.[0]?.snippet?.thumbnails?.default?.url || undefined;
  } catch (e) {
    console.error(`Failed to fetch YouTube image for "${channelUrl}":`, e.message);
    return undefined;
  }
}

function decodeHtmlEntities(str) {
  return str
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&#x27;/g, "'");
}

function parseTableFromHtml(html) {
  const rows = [];
  const tbodyMatch = html.match(/<tbody>([\s\S]*?)<\/tbody>/);
  if (!tbodyMatch || !tbodyMatch[1]) return rows;

  const tbodyContent = tbodyMatch[1];
  const trRegex = /<tr>([\s\S]*?)<\/tr>/g;
  let trMatch;
  while ((trMatch = trRegex.exec(tbodyContent)) !== null) {
    const trContent = trMatch[1] ?? "";
    const tdRegex = /<td>([\s\S]*?)<\/td>/g;
    const cells = [];
    let tdMatch;
    while ((tdMatch = tdRegex.exec(trContent)) !== null) {
      const cellHtml = tdMatch[1] ?? "";
      const hrefs = [...cellHtml.matchAll(/href="([^"]*)"/g)].map(m => decodeHtmlEntities(m[1]));
      const text = decodeHtmlEntities(cellHtml.replace(/<[^>]*>/g, "").trim());
      cells.push(hrefs.length > 0 ? hrefs : text);
    }
    if (cells.length >= 3 && cells[0]) {
      const votesCell = cells[2];
      rows.push({
        game: cells[0],
        completed: cells[1] ?? "",
        votes: Array.isArray(votesCell) ? votesCell : votesCell ? [votesCell] : [],
      });
    }
  }
  return rows;
}

export default function(eleventyConfig) {
  eleventyConfig.addGlobalData("games", async () => {
    const source = await fetchSource();
    const html = source.html;

    const rows = parseTableFromHtml(html);
    const enriched = [];

    for (const row of rows) {
      const enrichedRow = { ...row };
      enrichedRow.gameImage = await fetchGameImage(row.game);
      enrichedRow.voters = [];
      for (const url of row.votes) {
        const voterImage = await fetchYouTubeChannelImage(url);
        enrichedRow.voters.push({ url, image: voterImage });
      }
      enriched.push(enrichedRow);
    }

    enriched.sort((a, b) => {
      const aDone = a.completed ? 1 : 0;
      const bDone = b.completed ? 1 : 0;
      if (aDone !== bDone) return aDone - bDone;
      if (aDone && bDone) {
        return new Date(b.completed) - new Date(a.completed);
      }
      const aVotes = a.voters.length;
      const bVotes = b.voters.length;
      if (bVotes !== aVotes) return bVotes - aVotes;
      return a.game.localeCompare(b.game);
    });

    enriched.meta = {
      etag: source.etag,
      lastModified: source.lastModified,
      fetchedAt: source.fetchedAt,
    };

    return enriched;
  });

  eleventyConfig.addFilter("formatDate", (date) => {
    if (!date) return "In Progress";
    try {
      const d = new Date(date);
      return d.toLocaleDateString("en-US", { year: "numeric", month: "short" });
    } catch {
      return date;
    }
  });

  eleventyConfig.addFilter("channelName", (url) => {
    if (!url) return "";
    return url.split("/").pop() || "";
  });

  return {
    dir: {
      input: "src/site",
      output: "_site",
    },
    templateFormats: ["njk", "html", "md"],
    htmlTemplateEngine: "njk",
    markdownTemplateEngine: "njk",
  };
};
