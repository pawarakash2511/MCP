# MCP Workshop Project

## What This Is

An educational project with two MCP (Model Context Protocol) server demos — one in JavaScript, one in Python. Built to run a hands-on workshop where participants build MCP servers from scratch.

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
│   └── mcp.json                       ← Registers both servers + GROK_API_KEY env var
├── demo1-weather-server/              ← JavaScript MCP server
│   ├── package.json                   ← type: "module", openai dependency
│   └── index.js                       ← McpServer + getWeather + /parse + HTTP on :3001
└── demo2-nationalize-server/          ← Python MCP server
    ├── venv/                          ← Python virtual environment (not in git)
    └── server.py                      ← FastMCP + predict_nationality tool + HTTP on :3002
```

## Servers at a Glance

| Server | Language | Tool | External API | HTTP Port |
|--------|----------|------|-------------|-----------|
| demo1-weather-server | JavaScript (Node.js) | `getWeather(city)` | wttr.in | :3001 |
| demo2-nationalize-server | Python | `predict_nationality(name)` | api.nationalize.io | :3002 |

## Key Technical Decisions

- **`"type": "module"` in package.json** — required because the MCP SDK uses ES Module `import` syntax
- **Zod for JS params** — schema validation on tool inputs; Python uses type hints instead
- **venv for Python** — isolated environment; `mcp.json` must point to `venv/Scripts/python`, not the global `python`, because VSCode doesn't auto-activate venvs
- **stdio transport** — both servers communicate via stdin/stdout for MCP (Claude in VSCode)
- **HTTP alongside stdio** — each server also exposes an HTTP endpoint (Node built-in `http`, Python built-in `http.server`) so `frontend.html` can reach them from a browser; no extra dependencies needed
- **CORS header `Access-Control-Allow-Origin: *`** — required because the browser opens `frontend.html` as a `file://` URL and would otherwise block cross-origin requests to localhost
- **mcp.json auto-starts HTTP too** — when VSCode spawns the servers via `mcp.json`, the HTTP servers on :3001/:3002 start automatically; no separate terminal needed to use `frontend.html`
- **Groq for LLM intent parsing** — Phase 3 uses Groq (groq.com, `gsk_` keys, `api.groq.com/openai/v1`) via the `openai` npm package (OpenAI-compatible). LLM classifies user intent only; actual data always comes from MCP servers
- **`/parse` endpoint in index.js** — shared intent router: receives any natural-language query, calls Groq, returns `{type, entity}` JSON. Frontend routes to `:3001/weather` or `:3002/nationality` based on result
- **`GROK_API_KEY` in mcp.json `env` block** — VSCode doesn't inherit terminal env vars; the `env` block injects them into the spawned server process
- **`temperature: 0` for LLM classifier** — deterministic output required; any randomness risks malformed JSON that breaks the parse
- **AbortController with 10s timeout** — prevents the browser UI from hanging if the `/parse` fetch stalls

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
```

Both servers wait silently when started — that is correct. They respond to:
- **MCP clients** (Claude in VSCode) via stdio
- **Browser requests** from `frontend.html` via HTTP on their respective ports

**Easiest way to run:** open the project in VSCode with the Claude extension active — `mcp.json` spawns both servers automatically with `GROK_API_KEY` injected. Then just open `frontend.html` in a browser (chatbot UI).

## Workshop Context

The user is preparing this as workshop material. When extending this project:
- Keep explanations beginner-friendly with "Why X?" callouts
- Update `WORKSHOP.md` whenever new demos or steps are added
- Each new demo should follow the same pattern: create folder → install deps → define one tool → test locally → register in mcp.json
