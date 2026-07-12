import EleventyFetch from "@11ty/eleventy-fetch";
import type { QuartzComponent, QuartzComponentProps } from "@quartz-community/types";

const GAMESDB_BASE = "https://api.thegamesdb.net/v1";

export interface GameVotesOptions {
  dataUrl: string;
  gamesdbApiKey: string;
  platformId: number;
  cacheDuration: string;
}

interface GameRow {
  game: string;
  completed: string;
  votes: string;
  gameImage?: string;
}

function parseTableFromHtml(html: string): GameRow[] {
  const rows: GameRow[] = [];
  const tbodyMatch = html.match(/<tbody>([\s\S]*?)<\/tbody>/);
  if (!tbodyMatch || !tbodyMatch[1]) return rows;

  const tbodyContent = tbodyMatch[1];
  const trRegex = /<tr>([\s\S]*?)<\/tr>/g;
  let trMatch;
  while ((trMatch = trRegex.exec(tbodyContent)) !== null) {
    const trContent = trMatch[1] ?? "";
    const tdRegex = /<td>([\s\S]*?)<\/td>/g;
    const cells: string[] = [];
    let tdMatch;
    while ((tdMatch = tdRegex.exec(trContent)) !== null) {
      const cellHtml = tdMatch[1] ?? "";
      const hrefMatch = cellHtml.match(/href="([^"]*)"/);
      const href = hrefMatch?.[1] ?? "";
      cells.push(href || cellHtml.replace(/<[^>]*>/g, "").trim());
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

async function fetchGameImage(gameName: string, apiKey: string, platformId: number, cacheDuration: string): Promise<string | undefined> {
  try {
    const searchUrl = `${GAMESDB_BASE}/Games/ByGameName?apikey=${apiKey}&name=${encodeURIComponent(gameName)}&filter[platform]=${platformId}&include=boxart`;
    const data = await EleventyFetch(searchUrl, {
      duration: cacheDuration as any,
      type: "json",
    }) as any;

    const game = data?.data?.games?.[0];
    if (!game) return undefined;

    const gameBoxart = data?.include?.boxart?.data?.[String(game.id)];
    if (gameBoxart?.[0]?.filename) {
      const baseUrl = data.include.boxart.base_url?.original || "https://cdn.thegamesdb.net/images/original/";
      return `${baseUrl}${gameBoxart[0].filename}`;
    }

    return undefined;
  } catch (e) {
    console.error(`[game-votes] Failed to fetch image for "${gameName}":`, (e as Error).message);
    return undefined;
  }
}

function formatDate(date: string): string {
  if (!date) return "In Progress";
  try {
    const d = new Date(date);
    return d.toLocaleDateString("en-US", { year: "numeric", month: "short" });
  } catch {
    return date;
  }
}

function channelName(url: string): string {
  if (!url) return "";
  return url.split("/").pop() || "";
}

function renderTable(rows: GameRow[]): string {
  const tableRows = rows.map((row, i) => {
    const bgClass = i % 2 === 0 ? "row-even" : "row-odd";
    const gameCell = row.gameImage
      ? `<td class="cell-game"><div class="game-info"><img src="${row.gameImage}" alt="${row.game}" class="game-thumb" loading="lazy" /><span class="game-name">${row.game}</span></div></td>`
      : `<td class="cell-game"><div class="game-info"><span class="game-name">${row.game}</span></div></td>`;

    const completedCell = row.completed
      ? `<td class="cell-completed"><span class="status-done">${formatDate(row.completed)}</span></td>`
      : `<td class="cell-completed"><span class="status-pending">In Progress</span></td>`;

    const votesCell = row.votes
      ? `<td class="cell-votes"><div class="voter-info"><a href="${row.votes}" target="_blank" class="voter-link">${channelName(row.votes)}</a></div></td>`
      : `<td class="cell-votes"><span class="no-votes">No votes yet</span></td>`;

    return `<tr class="${bgClass}">${gameCell}${completedCell}${votesCell}</tr>`;
  }).join("\n");

  return `
<table class="game-table">
  <thead>
    <tr>
      <th class="col-game">Game</th>
      <th class="col-completed">Completed</th>
      <th class="col-votes">Voted By</th>
    </tr>
  </thead>
  <tbody>
    ${tableRows}
  </tbody>
</table>`;
}

const CSS = `
<style>
.game-table { width: 100%; max-width: 900px; margin: 0 auto; border-collapse: collapse; }
.game-table thead th { background: #e10916; color: #fff; padding: 0.8rem 1rem; text-align: left; font-size: 0.85rem; text-transform: uppercase; letter-spacing: 0.05em; }
.game-table tbody td { padding: 0.6rem 1rem; border-bottom: 1px solid rgba(255,255,255,0.15); vertical-align: middle; }
.row-even { background: rgba(245,178,1,0.1); }
.row-odd { background: rgba(255,255,255,0.05); }
.game-info { display: flex; align-items: center; gap: 0.75rem; }
.game-thumb { width: 48px; height: 48px; object-fit: cover; }
.game-name { font-weight: 600; }
.status-pending { color: #f5b201; font-style: italic; }
.status-done { color: #329900; font-weight: 600; }
.voter-info { display: flex; align-items: center; gap: 0.5rem; }
.voter-link { color: #f5b201; text-decoration: none; font-size: 0.85rem; }
.voter-link:hover { text-decoration: underline; }
.no-votes { color: rgba(255,255,255,0.4); font-style: italic; font-size: 0.85rem; }
.col-game { width: 50%; }
.col-completed { width: 20%; text-align: center; }
.col-votes { width: 30%; }
.game-table tbody td.cell-completed { text-align: center; }
</style>`;

export function GameVotes(opts: Partial<GameVotesOptions>): QuartzComponent {
  const options: GameVotesOptions = {
    dataUrl: opts.dataUrl ?? "https://grimtech.net/2026/nintendo64/Chatters-Choose-Which-N64-Game-I-Play-Next",
    gamesdbApiKey: opts.gamesdbApiKey ?? "",
    platformId: opts.platformId ?? 3,
    cacheDuration: opts.cacheDuration ?? "1d",
  };

  const GameVotesComponent: QuartzComponent = (_props: QuartzComponentProps) => {
    return async () => {
      try {
        const html = await EleventyFetch(options.dataUrl, {
          duration: options.cacheDuration as any,
          type: "text",
        }) as string;

        const rows = parseTableFromHtml(html);

        for (const row of rows) {
          if (options.gamesdbApiKey) {
            row.gameImage = await fetchGameImage(row.game, options.gamesdbApiKey, options.platformId, options.cacheDuration);
          }
        }

        return `${CSS}\n${renderTable(rows)}`;
      } catch (e) {
        console.error("[game-votes] Failed to render game votes table:", (e as Error).message);
        return "<div>Failed to load game votes data</div>";
      }
    };
  };

  GameVotesComponent.css = CSS;
  return GameVotesComponent;
}