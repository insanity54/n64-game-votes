# @insanity54/quartz-game-votes

A Quartz plugin that renders a game votes table with box art from TheGamesDB.

## Installation

```bash
npx quartz plugin add github:insanity54/insanity54-game-votes
```

## Usage

```yaml
plugins:
  - source: github:insanity54/insanity54-game-votes
    enabled: true
    options:
      dataUrl: "https://grimtech.net/2026/nintendo64/Chatters-Choose-Which-N64-Game-I-Play-Next"
      gamesdbApiKey: "YOUR_API_KEY"
      platformId: 3
      cacheDuration: "1d"
```

## Configuration

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `dataUrl` | `string` | `https://grimtech.net/...` | URL to fetch game votes data from |
| `gamesdbApiKey` | `string` | `""` | TheGamesDB API key for fetching box art |
| `platformId` | `number` | `3` | Platform ID (3 = Nintendo 64) |
| `cacheDuration` | `string` | `"1d"` | Cache duration for fetched data |

## How it works

1. Fetches game votes data from the specified URL (cached via eleventy-fetch)
2. Parses the HTML table from the page
3. Fetches game box art from TheGamesDB API (filtered by platform)
4. Renders a styled HTML table with game info, completion status, and voter links

## Color Palette

- `#01009a` - Blue (background)
- `#f5b201` - Yellow/Gold (accents)
- `#e10916` - Red (headers)
- `#329900` - Green (completed status)

## Development

```bash
bun install
bun run build
```

## License

MIT