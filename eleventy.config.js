import EleventyFetch from "@11ty/eleventy-fetch";

const GAMESDB_API_KEY = process.env.GAMESDB_API_KEY;
const GAMESDB_BASE = "https://api.thegamesdb.net/v1.1";
const YOUTUBE_API_KEY = process.env.YOUTUBE_API_KEY;
const DATA_URL = "https://grimtech.net/2026/nintendo64/Chatters-Choose-Which-N64-Game-I-Play-Next";

async function fetchGameImage(gameName) {
  if (!GAMESDB_API_KEY) {
    console.warn("No GAMESDB_API_KEY set, skipping game image fetch");
    return undefined;
  }

  try {
    const searchUrl = `${GAMESDB_BASE}/Games/ByGameName?apikey=${GAMESDB_API_KEY}&name=${encodeURIComponent(gameName)}&filter[platform]=3&include=boxart`;
    const res = await fetch(searchUrl);

    if (!res.ok) {
      const body = await res.text();
      console.error(`TheGamesDB ${res.status} for "${gameName}": ${body}`);
      return undefined;
    }

    const data = await res.json();
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
    const res = await fetch(apiUrl);

    if (!res.ok) {
      const body = await res.text();
      console.error(`YouTube API ${res.status} for "${handle}": ${body}`);
      return undefined;
    }

    const data = await res.json();
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
      const hrefMatch = cellHtml.match(/href="([^"]*)"/);
      const href = hrefMatch?.[1] ?? "";
      cells.push(decodeHtmlEntities(href || cellHtml.replace(/<[^>]*>/g, "").trim()));
    }
    if (cells.length >= 3 && cells[0]) {
      rows.push({
        game: cells[0],
        completed: cells[1] ?? "",
        votes: cells[2] ?? "",
      });
    }
  }
  return rows;
}

export default function(eleventyConfig) {
  eleventyConfig.addGlobalData("games", async () => {
    const html = await EleventyFetch(DATA_URL, {
      duration: "1d",
      type: "text",
    });

    const rows = parseTableFromHtml(html);
    const enriched = [];

    for (const row of rows) {
      const enrichedRow = { ...row };
      enrichedRow.gameImage = await fetchGameImage(row.game);
      if (row.votes) {
        enrichedRow.voterImage = await fetchYouTubeChannelImage(row.votes);
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
      const aVotes = a.votes ? 1 : 0;
      const bVotes = b.votes ? 1 : 0;
      if (bVotes !== aVotes) return bVotes - aVotes;
      return a.game.localeCompare(b.game);
    });

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
