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
├── frontend.html                      ← Phase 3 chatbot UI (LLM intent + MCP data)
├── logic.md                           ← How everything works end-to-end
├── WORKSHOP.md                        ← Step-by-step build guide (Phase 1–3)
├── CLAUDE.md                          ← Project context for Claude Code
├── .vscode/
│   └── mcp.json                       ← Registers servers + GROK_API_KEY env var
├── demo1-weather-server/
│   ├── package.json                   ← openai dependency added
│   └── index.js                       ← JS MCP server + /parse + HTTP on :3001
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

### 2. Get a Groq API key

Sign up free at [console.groq.com](https://console.groq.com) → API Keys → Create. The key starts with `gsk_`.

Add it to `.vscode/mcp.json` under the `weather` server's `env` block (it's already wired up — just paste your key).

### 3. Install JavaScript dependencies

```powershell
cd demo1-weather-server
npm install
cd ..
```

### 4. Set up Python environment

```powershell
cd demo2-nationalize-server
python -m venv venv
venv\Scripts\Activate.ps1
pip install mcp requests
deactivate
cd ..
```

### 5. Run via VSCode (recommended)

Open the project folder in VSCode. The Claude extension reads `.vscode/mcp.json` and **automatically starts both servers with `GROK_API_KEY` injected** — no terminal commands needed.

Both MCP tools (`getWeather`, `predict_nationality`) will appear in the Claude tools panel.

### 6. Open the chatbot

Double-click `frontend.html` to open the chatbot in your browser. Type anything naturally:

- *"pune ka weather kya hai"*
- *"what is nationality of Ronen"*
- *"is it raining in Mumbai?"*

The chatbot uses Groq to understand your question, then fetches the answer from your MCP servers. Each response shows a green badge confirming the data came from your server:

```
✓ Weather Service (MCP · index.js)
✓ Nationalize Service (MCP · server.py)
```

---

## Manual Start (without VSCode)

```powershell
# Terminal 1 — JavaScript server
cd demo1-weather-server
$env:GROK_API_KEY = "gsk_your_key_here"
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
| [`WORKSHOP.md`](WORKSHOP.md) | Full step-by-step guide to build both servers + chatbot UI (Phase 1–3) |
| [`logic.md`](logic.md) | End-to-end explanation: LLM internals, MCP protocol, stdio transport, dual-transport architecture |
| [`CLAUDE.md`](CLAUDE.md) | Project context and technical decisions (for Claude Code) |

---

## How It Works (Short Version)

**Claude in VSCode:**
1. VSCode spawns your server processes via `mcp.json`
2. Claude reads the tool list (`getWeather`, `predict_nationality`) at startup
3. When you ask a question, Claude decides which tool to call and sends it over stdin
4. Your server calls the external API and returns the result over stdout

**Browser chatbot (`frontend.html`):**
1. User types anything — any phrasing, any language
2. Frontend calls `/parse` on `:3001` → Groq LLM classifies intent → `{type, entity}`
3. Frontend calls `:3001/weather` or `:3002/nationality` with the extracted entity
4. Answer displayed as a chat bubble with a `✓` MCP source badge

The LLM understands the question; your MCP servers own the data.

> Full details in [`logic.md`](logic.md)

---

## License

MIT
