# MCP Workshop

A hands-on workshop project demonstrating how to build **Model Context Protocol (MCP) servers** from scratch — one in JavaScript, one in Python — plus a browser frontend that connects to both.

---

## What is MCP?

**Model Context Protocol** is an open standard by Anthropic that lets AI models (like Claude) call external tools in a structured, safe way.

```
Claude (VSCode)  ←→  stdio  ←→  Your MCP Server  ←→  External API
Browser          ←→  HTTP   ←→  ↑ same server
```

---

## Project Structure

```
MCP/
├── frontend.html                      ← Browser UI (Weather + Nationality)
├── logic.md                           ← How everything works end-to-end
├── WORKSHOP.md                        ← Step-by-step build guide
├── CLAUDE.md                          ← Project context for Claude Code
├── .vscode/
│   └── mcp.json                       ← Registers servers with VSCode/Claude
├── demo1-weather-server/
│   ├── package.json
│   └── index.js                       ← JS MCP server + HTTP on :3001
└── demo2-nationalize-server/
    ├── venv/                          ← Python venv (not in git)
    └── server.py                      ← Python MCP server + HTTP on :3002
```

---

## Servers

| Server | Language | Tool | API | HTTP Port |
|--------|----------|------|-----|-----------|
| demo1-weather-server | Node.js | `getWeather(city)` | wttr.in | :3001 |
| demo2-nationalize-server | Python | `predict_nationality(name)` | api.nationalize.io | :3002 |

---

## Quick Start

### Prerequisites

- [Node.js](https://nodejs.org/) (v18+)
- [Python](https://python.org/) (3.9+)
- [VSCode](https://code.visualstudio.com/) with the [Claude extension](https://marketplace.visualstudio.com/items?itemName=Anthropic.claude-code)

### 1. Clone the repo

```powershell
git clone https://github.com/pawarakash2511/MCP.git
cd MCP
```

### 2. Install JavaScript dependencies

```powershell
cd demo1-weather-server
npm install
cd ..
```

### 3. Set up Python environment

```powershell
cd demo2-nationalize-server
python -m venv venv
venv\Scripts\Activate.ps1
pip install mcp requests
deactivate
cd ..
```

### 4. Run via VSCode (recommended)

Open the project folder in VSCode. The Claude extension reads `.vscode/mcp.json` and **automatically starts both servers** — no terminal commands needed.

Both MCP tools (`getWeather`, `predict_nationality`) will appear in the Claude tools panel.

### 5. Open the browser frontend

Double-click `frontend.html` to open it in your browser. Both servers start HTTP endpoints alongside MCP:

- Weather card → calls `http://localhost:3001/weather?city=...`
- Nationality card → calls `http://localhost:3002/nationality?name=...`

Each result shows a green badge confirming your custom server handled the request:

```
✓ Weather Service (MCP · index.js)
✓ Nationalize Service (MCP · server.py)
```

---

## Manual Start (without VSCode)

```powershell
# Terminal 1 — JavaScript server
cd demo1-weather-server
node index.js
# → HTTP server on :3001

# Terminal 2 — Python server
cd demo2-nationalize-server
venv\Scripts\Activate.ps1
python server.py
# → HTTP server on :3002
```

Then open `frontend.html` in your browser.

---

## Test with Claude

Once servers are running in VSCode, ask Claude:

- *"What's the weather in Tokyo?"* → triggers `getWeather`
- *"What nationality is the name Ronen?"* → triggers `predict_nationality`

---

## Documentation

| File | Contents |
|------|----------|
| [`WORKSHOP.md`](WORKSHOP.md) | Full step-by-step guide to build both servers from scratch (Phase 1 + Phase 2) |
| [`logic.md`](logic.md) | End-to-end explanation: LLM internals, MCP protocol, stdio transport, dual-transport architecture |
| [`CLAUDE.md`](CLAUDE.md) | Project context and technical decisions (for Claude Code) |

---

## How It Works (Short Version)

1. VSCode spawns your server processes via `mcp.json`
2. Claude reads the tool list (`getWeather`, `predict_nationality`) at startup
3. When you ask a question, Claude decides which tool to call
4. VSCode sends the call over stdin to your server
5. Your server calls the external API and returns the result over stdout
6. Claude reads the result and replies

The browser frontend skips Claude entirely — it calls your servers directly over HTTP. Same business logic, different transport.

> Full details in [`logic.md`](logic.md)

---

## License

MIT
