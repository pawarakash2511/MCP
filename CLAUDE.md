# MCP Workshop Project

## What This Is

An educational project with two hand-built MCP (Model Context Protocol) server demos — one in JavaScript, one in Python — plus a third demo showing how to bridge an already-published MCP server from npm into the same stdio + HTTP pattern. Built to run a hands-on workshop where participants build MCP servers from scratch, then see how pre-built ones slot into the same architecture.

The full step-by-step workshop guide lives in `WORKSHOP.md` at this root.

## Project Structure

```
MCP/
├── CLAUDE.md                          ← You are here
├── WORKSHOP.md                        ← Full workshop guide for participants (Phase 1–3)
├── frontend.html                      ← Phase 3 chatbot UI (LLM intent + MCP data)
├── logic.md                           ← End-to-end architecture explanation
├── README.md                          ← GitHub landing page
├── .gitignore                         ← Excludes node_modules/, venv/, __pycache__/
├── .vscode/
│   └── mcp.json                       ← Registers all three servers + GROK_API_KEY env var
├── demo1-weather-server/              ← JavaScript MCP server
│   ├── package.json                   ← type: "module", openai dependency
│   └── index.js                       ← McpServer + getWeather + /parse + HTTP on :3001
├── demo2-nationalize-server/          ← Python MCP server
│   ├── venv/                          ← Python virtual environment (not in git)
│   └── server.py                      ← FastMCP + predict_nationality tool + HTTP on :3002
└── demo3-boi-exchange-server/         ← JavaScript bridge (wraps a third-party npm MCP server)
    ├── package.json                   ← type: "module", @modelcontextprotocol/sdk dependency
    └── index.js                       ← spawns `npx @skills-il/boi-exchange-mcp` internally,
                                           relays it to Claude over stdio, exposes HTTP on :3003
```

## Servers at a Glance

| Server | Language | Tool | External API | HTTP Port |
|--------|----------|------|-------------|-----------|
| demo1-weather-server | JavaScript (Node.js) | `getWeather(city)` | wttr.in | :3001 |
| demo2-nationalize-server | Python | `predict_nationality(name)` | api.nationalize.io | :3002 |
| demo3-boi-exchange-server (bridges `@skills-il/boi-exchange-mcp`) | JavaScript (bridge over a pre-built npm package) | `get_exchange_rate`, `convert_currency`, `get_historical_rates`, `get_rate_change`, `list_currencies` | Bank of Israel SDMX API | :3003 |

## Key Technical Decisions

- **`"type": "module"` in package.json** — required because the MCP SDK uses ES Module `import` syntax
- **Zod for JS params** — schema validation on tool inputs; Python uses type hints instead
- **venv for Python** — isolated environment; `mcp.json` must point to `venv/Scripts/python`, not the global `python`, because VSCode doesn't auto-activate venvs
- **stdio transport** — both servers communicate via stdin/stdout for MCP (Claude in VSCode)
- **HTTP alongside stdio** — each server also exposes an HTTP endpoint (Node built-in `http`, Python built-in `http.server`) so `frontend.html` can reach them from a browser; no extra dependencies needed
- **CORS header `Access-Control-Allow-Origin: *`** — required because the browser opens `frontend.html` as a `file://` URL and would otherwise block cross-origin requests to localhost
- **mcp.json auto-starts HTTP too** — when VSCode spawns the servers via `mcp.json`, the HTTP servers on :3001/:3002 start automatically; no separate terminal needed to use `frontend.html`
- **Groq for LLM intent parsing** — Phase 3 uses Groq (groq.com, `gsk_` keys, `api.groq.com/openai/v1`) via the `openai` npm package (OpenAI-compatible). LLM classifies user intent only; actual data always comes from MCP servers
- **`/parse` endpoint in index.js** — shared intent router: receives any natural-language query, calls Groq, returns `{type, entity, tool, args}` JSON. Frontend routes to `:3001/weather`, `:3002/nationality`, or `:3003/exchange` based on result
- **`GROK_API_KEY` in mcp.json `env` block** — VSCode doesn't inherit terminal env vars; the `env` block injects them into the spawned server process
- **`temperature: 0` for LLM classifier** — deterministic output required; any randomness risks malformed JSON that breaks the parse
- **AbortController with 10s timeout** — prevents the browser UI from hanging if the `/parse` fetch stalls
- **`demo3-boi-exchange-server` is a bridge, not a hand-built server** — the real tool logic (`get_exchange_rate`, etc.) lives entirely in the third-party npm package `@skills-il/boi-exchange-mcp`; we don't own its source and it has no HTTP endpoint of its own. `index.js` spawns it internally via the MCP SDK's `Client`/`StdioClientTransport`, then re-exposes the exact same tools to Claude/VSCode using the SDK's low-level `Server` class (`ListToolsRequestSchema`/`CallToolRequestSchema` forwarded verbatim — no schema translation, so it stays correct if the upstream package changes) while also serving HTTP on :3003 for the browser. `mcp.json` spawns `node demo3-boi-exchange-server/index.js` (not `npx` directly) so this one process does both jobs
- **Generic `/exchange?tool=<name>&<args>` endpoint** — rather than hardcoding 5 separate HTTP routes, the bridge reads each tool's own JSON Schema (from the upstream's `listTools()`) to coerce query params to the right types and forward them — works for all 5 tools (and any future ones) without per-tool route code

## How to Run

```powershell
# JavaScript server (MCP + HTTP on :3001, Groq intent parser)
cd demo1-weather-server
$env:GROK_API_KEY = "gsk_your_key_here"   # only needed for manual start
node index.js

# Python server (MCP + HTTP on :3002)
cd demo2-nationalize-server
venv\Scripts\Activate.ps1
python server.py

# BOI exchange bridge (MCP + HTTP on :3003, spawns npx internally)
cd demo3-boi-exchange-server
node index.js
```

All three servers wait silently when started — that is correct. They respond to:
- **MCP clients** (Claude in VSCode) via stdio
- **Browser requests** from `frontend.html` via HTTP on their respective ports (:3001, :3002, :3003)

**Easiest way to run:** open the project in VSCode with the Claude extension active — `mcp.json` spawns all three servers automatically (with `GROK_API_KEY` injected for the weather server). Then just open `frontend.html` in a browser (chatbot UI) — it now handles weather, nationality, and currency-exchange questions all in one chat.

## Workshop Context

The user is preparing this as workshop material. When extending this project:
- Keep explanations beginner-friendly with "Why X?" callouts
- Update `WORKSHOP.md` whenever new demos or steps are added
- Each new demo should follow the same pattern: create folder → install deps → define one tool → test locally → register in mcp.json
