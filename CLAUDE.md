# MCP Workshop Project

## What This Is

An educational project with two MCP (Model Context Protocol) server demos — one in JavaScript, one in Python. Built to run a hands-on workshop where participants build MCP servers from scratch.

The full step-by-step workshop guide lives in `WORKSHOP.md` at this root.

## Project Structure

```
MCP/
├── CLAUDE.md                          ← You are here
├── WORKSHOP.md                        ← Full workshop guide for participants
├── .gitignore                         ← Excludes node_modules/, venv/, __pycache__/
├── .vscode/
│   └── mcp.json                       ← Registers both servers with VSCode/Claude
├── demo1-weather-server/              ← JavaScript MCP server
│   ├── package.json                   ← type: "module" required
│   └── index.js                       ← McpServer + getWeather tool
└── demo2-nationalize-server/          ← Python MCP server
    ├── venv/                          ← Python virtual environment (not in git)
    └── server.py                      ← FastMCP + predict_nationality tool
```

## Servers at a Glance

| Server | Language | Tool | External API |
|--------|----------|------|-------------|
| demo1-weather-server | JavaScript (Node.js) | `getWeather(city)` | wttr.in |
| demo2-nationalize-server | Python | `predict_nationality(name)` | api.nationalize.io |

## Key Technical Decisions

- **`"type": "module"` in package.json** — required because the MCP SDK uses ES Module `import` syntax
- **Zod for JS params** — schema validation on tool inputs; Python uses type hints instead
- **venv for Python** — isolated environment; `mcp.json` must point to `venv/Scripts/python`, not the global `python`, because VSCode doesn't auto-activate venvs
- **stdio transport** — both servers communicate via stdin/stdout, not HTTP

## How to Run

```powershell
# JavaScript server
cd demo1-weather-server
node index.js

# Python server
cd demo2-nationalize-server
venv\Scripts\Activate.ps1
python server.py
```

Both servers wait silently when started — that is correct. They respond only when an MCP client (Claude in VSCode) connects and sends a tool call.

## Workshop Context

The user is preparing this as workshop material. When extending this project:
- Keep explanations beginner-friendly with "Why X?" callouts
- Update `WORKSHOP.md` whenever new demos or steps are added
- Each new demo should follow the same pattern: create folder → install deps → define one tool → test locally → register in mcp.json
