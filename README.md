# FigJambo

Extract all content from FigJam boards into markdown files with image assets — locally, with no paid Figma plan required.

## How it works

FigJambo runs as a FigJam plugin inside Figma Desktop. It traverses the board, extracts text/structured data/images, and sends everything to a local Fastify server that converts it to markdown.

```
FigJam Board → Plugin extracts nodes → Local server → Markdown + images
```

**Why the Plugin API?** Figma's REST API and MCP Server are limited to 6 requests/month on the free Starter plan. The Plugin API has no rate limits and runs entirely in-memory.

## Quick start

```bash
# 1. Install dependencies
npm install

# 2. Build the plugin
npm run build:plugins

# 3. Start the local server
npm run dev:server

# 4. Import plugin in Figma Desktop
#    Plugins → Development → Import plugin from manifest
#    Select: packages/plugins/extractor/manifest.json

# 5. Open a FigJam board, run the plugin, click "Extract to Markdown"
```

Output is written to `output/{board-name}/`:
```
output/
└── my-board/
    ├── README.md        # Extracted markdown
    └── assets/
        ├── abc123.png   # Images (content-addressed by hash)
        └── ...
```

## Development

```bash
npm run watch:extractor   # Auto-rebuild plugin on changes
npm run dev:server        # Server with hot reload (http://localhost:8000)
npm run typecheck         # Type-check all packages
npm run build             # Build everything
```

## Project structure

```
packages/
├── shared/              # Shared TypeScript types (@figjambo/shared)
├── plugin-utils/        # esbuild build scripts for plugins & widgets
├── plugins/extractor/   # FigJam extractor plugin
├── server/              # Fastify backend (markdown conversion + image storage)
└── widgets/             # Future FigJam widgets
```

## Supported node types

Sticky notes, text, shapes with text, connectors, code blocks, tables, sections, stamps, frames, and media/images.

## Configuration

| Variable | Default | Description |
|----------|---------|-------------|
| `FIGJAMBO_PORT` | `8000` | Server port |
| `FIGJAMBO_HOST` | `127.0.0.1` | Server host |
| `FIGJAMBO_OUTPUT_DIR` | `./output` | Output directory for extracted boards |

## Requirements

- Node.js >= 18
- npm >= 9
- Figma Desktop app (browser doesn't support dev plugins)
