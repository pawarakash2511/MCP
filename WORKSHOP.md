# Workshop: Build an MCP Server from Scratch

## What is MCP?

**Model Context Protocol (MCP)** is a standard protocol that lets AI models (like Claude) talk to external tools and services in a safe, structured way.

Think of it like a **USB standard for AI tools** — instead of each AI needing custom integrations, any MCP-compliant tool can plug in and work.

```
Claude / AI Client
      ↕  (stdio: stdin/stdout)
  MCP Server
      ↕  (HTTP)
 External API (weather, database, etc.)
```

---

## Project Structure

```
MCP/
├── .gitignore                      ← Excludes venv/, node_modules/, __pycache__/
├── .vscode/
│   └── mcp.json                    ← Tells VSCode about your MCP servers
├── demo1-weather-server/           ← JavaScript server
│   ├── node_modules/               ← installed JS packages (do NOT commit to git)
│   ├── package.json
│   └── index.js
├── demo2-nationalize-server/       ← Python server
│   ├── venv/                       ← virtual environment (do NOT commit to git)
│   └── server.py
├── demo3-boi-exchange-server/      ← JS bridge (added in Phase 2, see "DEMO 4B" below)
│   ├── node_modules/               ← installed JS packages (do NOT commit to git)
│   ├── package.json
│   └── index.js                    ← wraps the pre-built npm package @skills-il/boi-exchange-mcp
└── WORKSHOP.md                     ← This file

(In Phase 1, "DEMO 3 (Bonus)" below registers boi-exchange directly via
 raw `npx` — no local folder needed yet. The demo3-boi-exchange-server/
 folder above only appears once Phase 2's "DEMO 4B" bridges it to HTTP.)
```

---

## Git Setup & `.gitignore`

Before writing any code, initialize git and create a `.gitignore` at the **project root**:

```powershell
git init
```

Create `.gitignore`:

```
# JavaScript — never commit installed packages
node_modules/

# Python — never commit virtual environment or bytecode cache
venv/
__pycache__/
*.pyc
```

**Why each entry:**
- `node_modules/` — thousands of files, regenerated with `npm install`; committing them wastes space and causes conflicts
- `venv/` — platform-specific Python binaries; won't work on another machine anyway
- `__pycache__/` and `*.pyc` — compiled Python bytecode; auto-generated, not human-readable

> `.gitignore` must live at the **root** of the repo (next to `.vscode/`), not inside a subfolder — git reads it from the root and applies it recursively.

---

## DEMO 1: JavaScript Weather Server — Build from Scratch

### Step 1: Create the project folder

```powershell
mkdir demo1-weather-server
cd demo1-weather-server
```

### Step 2: Initialize Node.js project

```powershell
npm init -y
```

This creates `package.json`. The `-y` flag accepts all defaults.

### Step 3: Set module type (IMPORTANT!)

Open `package.json` and add `"type": "module"` so you can use `import` syntax:

```json
{
  "name": "demo1-weather-server",
  "version": "1.0.0",
  "type": "module",
  "scripts": {
    "start": "node index.js"
  }
}
```

**Why `"type": "module"`?** The MCP SDK uses ES Module syntax (`import`/`export`). Without this, Node.js defaults to CommonJS (`require`) and throws errors.

### Step 4: Install MCP SDK and Zod

```powershell
npm install @modelcontextprotocol/sdk zod
```

- `@modelcontextprotocol/sdk` — Anthropic's official Node.js SDK for MCP
- `zod` — Schema validation library (validates tool input parameters)

### Step 5: Create `index.js`

```javascript
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';

// 1. Create the MCP server instance
const server = new McpServer({
  name: 'Weather Service',
  version: '1.0.0',
});

// 2. Register a tool
server.tool(
  'getWeather',                                    // tool name (AI calls this)
  'Get the current weather for a given city',      // description (AI reads this)
  {
    city: z.string().min(2).describe('Name of the city to get weather for'),
  },                                               // parameter schema (Zod)
  async ({ city }) => {                            // handler function
    const res = await fetch(
      `https://wttr.in/${encodeURIComponent(city)}?format=j1`
    );
    const data = await res.json();
    const current = data.current_condition[0];

    return {
      content: [
        {
          type: 'text',
          text: `Weather in ${city}:
Condition: ${current.weatherDesc[0].value}
Temperature: ${current.temp_C}°C (feels like ${current.FeelsLikeC}°C)
Humidity: ${current.humidity}%`,
        },
      ],
    };
  }
);

// 3. Connect via stdio transport (how the AI communicates with this server)
const transport = new StdioServerTransport();
await server.connect(transport);
```

**Key concepts in this file:**
- `McpServer` — the server object that holds all your tools
- `server.tool(name, description, schema, handler)` — registers one tool
- `Zod schema` — validates that the AI sends correct parameters
- `StdioServerTransport` — communication happens via stdin/stdout (not HTTP)
- The handler returns `{ content: [{ type: 'text', text: '...' }] }` — MCP's response format

### Step 6: Test it locally

```powershell
node index.js
```

If it starts without error, it's working. It will wait silently for input (that's normal — it's waiting for an MCP client to connect).

---

## DEMO 2: Python Nationalize Server — Build from Scratch

### Step 1: Create the project folder

```powershell
mkdir demo2-nationalize-server
cd demo2-nationalize-server
```

### Step 2: Create a virtual environment (IMPORTANT!)

```powershell
python -m venv venv
```

This creates a `venv/` folder inside your project — it's an isolated Python environment just for this project.

**Why virtual env?** Without it, `pip install` puts packages into your global Python, which causes version conflicts when you have multiple projects. With a venv, each project gets its own isolated packages.

**Activate it:**

```powershell
# Windows (PowerShell)
venv\Scripts\Activate.ps1

# Mac/Linux
source venv/bin/activate
```

After activation you'll see `(venv)` at the start of your terminal prompt — that means you're inside the isolated environment. All `pip install` commands from now on go into this venv only.

**To deactivate later:**

```powershell
deactivate
```

> **For the `mcp.json` config** — since the server runs inside the venv, you must point VSCode to the venv's Python interpreter, not the global one:
> ```json
> "command": "${workspaceFolder}/demo2-nationalize-server/venv/Scripts/python"
> ```
> (On Mac/Linux: `venv/bin/python`)

### Step 3: Install dependencies

```powershell
pip install mcp requests
```

- `mcp` — Anthropic's Python MCP SDK (includes `FastMCP`)
- `requests` — HTTP library for calling external APIs

> These install into `venv/` only, not your global Python.

### Step 4: Create `server.py`

```python
import requests
from mcp.server.fastmcp import FastMCP

# 1. Create the server
server = FastMCP("Nationalize Service")

# 2. Define a tool using the @server.tool() decorator
@server.tool()
def predict_nationality(name: str) -> dict:
    """Predict the nationality of a person based on their name."""
    url = f"https://api.nationalize.io/?name={name}"
    response = requests.get(url, timeout=15)
    return response.json()

# 3. Run the server
if __name__ == "__main__":
    server.run()
```

**Key concepts in this file:**
- `FastMCP` — a high-level Python wrapper that handles all the protocol boilerplate
- `@server.tool()` — a decorator that registers the function as a tool
- The **docstring** (`"""..."""`) becomes the tool's description that the AI reads
- **Type hints** (`name: str`) become the parameter schema automatically
- `server.run()` — starts the server (handles transport automatically)

**Why Python is simpler here:** `FastMCP` does more work for you compared to the JS SDK. Python type hints + docstrings replace Zod schemas.

### Step 5: Test it locally

```powershell
python server.py
```

Again, it will wait silently — that's correct.

---

## DEMO 3 (Bonus): Plug in a Pre-Built MCP Server (npx)

Demos 1 and 2 were **built from scratch** — you wrote every line of `index.js` and `server.py` yourself. But most of the time, someone else has already published an MCP server for the API you want. This demo shows how to consume one of those with **zero custom code**.

### The package: `@skills-il/boi-exchange-mcp`

An MCP server for official **Bank of Israel** exchange rates — daily representative rates ("sha'ar yatzig") for 30+ currencies against the Israeli Shekel (ILS), backed by the BOI's public SDMX API.

| Tool | Purpose |
|------|---------|
| `get_exchange_rate` | Latest representative rate for a currency vs. ILS |
| `get_historical_rates` | Daily rates across a date range |
| `list_currencies` | All supported currency codes |
| `get_rate_change` | Absolute/percentage change between two dates |
| `convert_currency` | Convert an amount between ILS and another currency |

**No API key needed** — the BOI API is public.

### Step 1: Register it in `mcp.json` — that's it

No folder, no `npm install`, no `pip install`. Just add an entry to `.vscode/mcp.json`:

```json
"boi-exchange": {
  "type": "stdio",
  "command": "npx",
  "args": ["-y", "@skills-il/boi-exchange-mcp"]
}
```

**Why `npx -y`?** `npx` downloads a package from the npm registry and runs it immediately, without a permanent local install. `-y` auto-confirms the "ok to install this package?" prompt so it doesn't hang waiting for input when VSCode spawns it. The first run downloads the package (cached by npm for next time); subsequent runs start instantly.

### Step 2: Reload VSCode

`Ctrl+Shift+P` → `Developer: Reload Window`. VSCode re-reads `mcp.json`, and `npx` fetches/starts `@skills-il/boi-exchange-mcp` alongside your two hand-built servers.

### For now, this one is stdio-only

Demos 1 and 2 later grow an HTTP endpoint (see Phase 2 below) so `frontend.html` can call them from a browser. `boi-exchange` is a **third-party package** — you don't own its source, so you can't add an HTTP server inside it the way you did for `index.js`/`server.py`. Right now it only works as an MCP tool inside Claude/VSCode (stdio), not from the browser chatbot.

**Phase 2 fixes this** with a small *bridge* process (`demo3-boi-exchange-server/index.js`) that spawns this same package internally and adds an HTTP door for the browser — see "DEMO 4B: Bridge `boi-exchange` to HTTP" below.

### Test it

Ask Claude in VSCode:
- *"What's today's exchange rate for USD to ILS?"* → should trigger `get_exchange_rate`
- *"Convert 100 USD to ILS"* → should trigger `convert_currency`

---

## Connecting to VSCode / Claude

### The `.vscode/mcp.json` file

This file tells VSCode (and Claude inside it) where your MCP servers are:

```json
{
  "servers": {
    "weather": {
      "type": "stdio",
      "command": "node",
      "args": ["${workspaceFolder}/demo1-weather-server/index.js"]
    },
    "nationalize": {
      "type": "stdio",
      "command": "${workspaceFolder}/demo2-nationalize-server/venv/Scripts/python",
      "args": ["${workspaceFolder}/demo2-nationalize-server/server.py"]
    },
    "boi-exchange": {
      "type": "stdio",
      "command": "npx",
      "args": ["-y", "@skills-il/boi-exchange-mcp"]
    }
  }
}
```

> **Why the venv path for Python?** When VSCode spawns the server process, it doesn't activate your venv — so you must point `command` directly to the venv's Python binary. That way, `mcp` and `requests` packages are found automatically. On Mac/Linux, use `venv/bin/python` instead.

**Key fields:**
- `type: "stdio"` — communication via stdin/stdout (most common for local servers)
- `command` — what program to run
- `args` — arguments to pass to the program
- `${workspaceFolder}` — VSCode variable that resolves to your project root

When Claude is active in VSCode, it reads this file, spawns all three server processes, and can now call `getWeather`, `predict_nationality`, and the BOI exchange-rate tools.

---

## The MCP Request/Response Flow (Step by Step)

1. You ask Claude: *"What's the weather in Tel Aviv?"*
2. Claude decides to call the `getWeather` tool with `{ city: "Tel Aviv" }`
3. VSCode sends the call over stdio to `node index.js`
4. `index.js` validates params with Zod, calls `wttr.in` API
5. The response `{ content: [{ type: 'text', text: '...' }] }` goes back to Claude
6. Claude reads it and tells you the weather

---

## Concepts to Explain in Your Workshop

| Concept | One-liner |
|---------|-----------|
| MCP Protocol | Standardized way for AI to use external tools |
| stdio transport | Server talks to client via keyboard I/O pipes |
| Tool schema | Tells AI what parameters to send |
| Zod (JS) | Schema validation library — catches bad inputs |
| FastMCP (Python) | High-level wrapper that handles protocol boilerplate |
| `mcp.json` | Config file that registers servers with the AI client |
| Decorator (`@server.tool()`) | Python syntax to mark a function as an MCP tool |
| ES Modules (`"type": "module"`) | Modern JS module system needed by the MCP SDK |
| Virtual env (`venv`) | Isolated Python environment — keeps packages per-project |
| `.gitignore` | Tells git which files/folders to never track |

---

## Full Command Sequence (Rebuild from Zero)

```powershell
# === Root setup ===
git init
# Create .gitignore at root (paste content from section above)

# === JavaScript Server ===
mkdir demo1-weather-server
cd demo1-weather-server
npm init -y
# Add "type": "module" to package.json manually
npm install @modelcontextprotocol/sdk zod
# Create index.js (paste the code above)
node index.js                        # test it — waits silently = working
cd ..

# === Python Server ===
mkdir demo2-nationalize-server
cd demo2-nationalize-server
python -m venv venv                  # create virtual environment
venv\Scripts\Activate.ps1           # activate it (you'll see "(venv)" in prompt)
pip install mcp requests             # installs into venv only
# Create server.py (paste the code above)
python server.py                     # test it — waits silently = working
deactivate                           # exit venv when done
cd ..

# === BOI Exchange Server (pre-built, no local folder) ===
# Nothing to create — just add the "boi-exchange" entry to .vscode/mcp.json
# npx downloads and runs @skills-il/boi-exchange-mcp on demand

# === VSCode Config ===
mkdir .vscode
# Create .vscode/mcp.json with all three server entries (paste content from section above)
# Reload VSCode window → Claude can now use all three tools
```

---

## Verification

After setup, open Claude in VSCode and ask:
- *"What's the weather in New York?"* → should trigger `getWeather`
- *"What nationality is the name Ronen?"* → should trigger `predict_nationality`
- *"What's today's exchange rate for USD to ILS?"* → should trigger `get_exchange_rate`
- *"Convert 100 USD to ILS"* → should trigger `convert_currency`

All four should return real data from the external APIs.

---

---

# PHASE 2: Browser Frontend — Connect Your MCP Servers to a Web Page

## Why do we need a frontend?

So far, only **Claude in VSCode** can talk to your MCP servers — because they use **stdio transport** (stdin/stdout pipes). A browser can't open a pipe.

Browsers speak **HTTP**. So the plan is:

```
Before (Phase 1):
  Claude in VSCode ←→ stdio ←→ MCP Server ←→ External API

After (Phase 2):
  Claude in VSCode ←→ stdio ←→ MCP Server ←→ External API
  Browser          ←→ HTTP ←→ ↑ same server
```

Each server will handle **both** transports at once — stdio for Claude, HTTP for the browser. No extra processes, no new dependencies.

---

## DEMO 3: Expand `index.js` — Add HTTP on Port 3001

### What changes

- Extract the weather fetch into a reusable `getWeather(city)` function
- Add Node's built-in `http` module — **no new npm packages needed**
- Start an HTTP server on port 3001 alongside the existing MCP stdio server

### Updated `index.js`

```javascript
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';
import http from 'http';        // built-in — no npm install needed
import { URL } from 'url';      // built-in

const server = new McpServer({ name: 'Weather Service', version: '1.0.0' });

// Shared logic — called by BOTH the MCP tool and the HTTP server
async function getWeather(city) {
  const res = await fetch(`https://wttr.in/${encodeURIComponent(city)}?format=j1`);
  const data = await res.json();
  const current = data.current_condition[0];
  return (
    `The weather in ${city} is ${current.weatherDesc[0].value}, ` +
    `${current.temp_C}°C (feels like ${current.FeelsLikeC}°C), ` +
    `humidity ${current.humidity}%.`
  );
}

// MCP tool — calls the same function
server.tool(
  'getWeather',
  'Get the current weather for a given city',
  { city: z.string().min(2).describe('Name of the city to get weather for') },
  async ({ city }) => {
    const text = await getWeather(city);
    return { content: [{ type: 'text', text }] };
  }
);

// HTTP server on :3001 — for the browser frontend
http.createServer(async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');   // allow browser file:// requests
  res.setHeader('Content-Type', 'application/json');

  try {
    const { pathname, searchParams } = new URL(req.url, 'http://localhost');
    if (pathname === '/weather') {
      const city = searchParams.get('city') || '';
      if (city.length < 2) {
        res.writeHead(400);
        return res.end(JSON.stringify({ error: 'city must be at least 2 characters' }));
      }
      const text = await getWeather(city);
      res.end(JSON.stringify({ text, server: 'Weather Service (MCP · index.js)' }));
    } else {
      res.writeHead(404);
      res.end(JSON.stringify({ error: 'Not found' }));
    }
  } catch (err) {
    res.writeHead(500);
    res.end(JSON.stringify({ error: err.message }));
  }
}).listen(3001, () => {
  process.stderr.write('HTTP server on :3001\n');
});

// MCP stdio transport — for Claude in VSCode
const transport = new StdioServerTransport();
await server.connect(transport);
```

**Why `process.stderr.write` for the log?** The MCP protocol uses stdout for communication. Writing to stdout here would corrupt the protocol. `stderr` is safe for logs — Claude ignores it.

**Why `Access-Control-Allow-Origin: *`?** When you open `frontend.html` by double-clicking it, the browser treats it as a `file://` URL. Browsers block HTTP requests from `file://` to `localhost` unless the server explicitly allows it with this header.

---

## DEMO 4: Expand `server.py` — Add HTTP on Port 3002

### What changes

- Add Python's built-in `http.server` module — **no pip install needed**
- Run the HTTP server in a background thread so it doesn't block FastMCP
- Keep the `@server.tool()` decorator and `predict_nationality` function exactly as-is

### Updated `server.py`

```python
from mcp.server.fastmcp import FastMCP
import requests
import threading
import json
from http.server import BaseHTTPRequestHandler, HTTPServer
from urllib.parse import urlparse, parse_qs
import sys

server = FastMCP("Nationalize Service")

@server.tool()
def predict_nationality(name: str) -> dict:
    """Predict the nationality of a person based on their name."""
    url = f"https://api.nationalize.io/?name={name}"
    response = requests.get(url, timeout=15)
    return response.json()

# HTTP server on :3002 — for the browser frontend
class NationalityHandler(BaseHTTPRequestHandler):
    def log_message(self, format, *args):
        pass  # silence default access logs

    def do_GET(self):
        parsed = urlparse(self.path)
        params = parse_qs(parsed.query)

        self.send_response(200)
        self.send_header("Content-Type", "application/json")
        self.send_header("Access-Control-Allow-Origin", "*")
        self.end_headers()

        try:
            if parsed.path == "/nationality":
                name = params.get("name", [""])[0]
                if not name:
                    self.wfile.write(json.dumps({"error": "name is required"}).encode())
                    return
                result = predict_nationality(name)
                result["server"] = "Nationalize Service (MCP · server.py)"
                self.wfile.write(json.dumps(result).encode())
            else:
                self.wfile.write(json.dumps({"error": "Not found"}).encode())
        except Exception as e:
            self.wfile.write(json.dumps({"error": str(e)}).encode())

def _start_http():
    HTTPServer(("", 3002), NationalityHandler).serve_forever()

if __name__ == "__main__":
    t = threading.Thread(target=_start_http, daemon=True)  # daemon=True → dies with main process
    t.start()
    print("HTTP server on :3002", file=sys.stderr)
    server.run()
```

**Why `threading.Thread`?** `server.run()` blocks the main thread forever (it's waiting for MCP messages). The HTTP server also needs to block. Running them in the same thread would mean only one could run. A background thread lets both run simultaneously.

**Why `daemon=True`?** A daemon thread is automatically killed when the main process exits. Without it, the HTTP server thread would keep the process alive even after FastMCP exits — the script would never fully close.

---

## DEMO 4B: Bridge `boi-exchange` to HTTP (`demo3-boi-exchange-server`)

`boi-exchange` is a **third-party package** — you can't paste an `http.createServer` call into someone else's npm package. Instead, build a small **bridge**: a new server that spawns the real package internally (as its own MCP client) and re-exposes it two ways — stdio for Claude, HTTP for the browser.

### Step 1: Create the folder and install the SDK

```powershell
mkdir demo3-boi-exchange-server
cd demo3-boi-exchange-server
npm init -y
# Add "type": "module" to package.json, same as demo1
npm install @modelcontextprotocol/sdk
```

### Step 2: Create `index.js`

```javascript
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { ListToolsRequestSchema, CallToolRequestSchema } from '@modelcontextprotocol/sdk/types.js';
import http from 'http';
import { URL } from 'url';

// 1 - Spawn the real package as an internal MCP client
const upstreamTransport = new StdioClientTransport({
  command: 'npx',
  args: ['-y', '@skills-il/boi-exchange-mcp'],
});
const upstream = new Client({ name: 'boi-exchange-bridge-client', version: '1.0.0' });
await upstream.connect(upstreamTransport);

const { tools } = await upstream.listTools();
const toolsByName = new Map(tools.map((t) => [t.name, t]));

// 2 - Passthrough MCP server: same tools/schemas, forwarded verbatim to Claude
const server = new Server(
  { name: 'BOI Exchange Bridge', version: '1.0.0' },
  { capabilities: { tools: {} } }
);
server.setRequestHandler(ListToolsRequestSchema, async () => ({ tools }));
server.setRequestHandler(CallToolRequestSchema, async (request) => upstream.callTool(request.params));

// Coerce HTTP query params into a tool's argument types using its OWN JSON Schema
function coerceArgs(tool, searchParams) {
  const props = tool.inputSchema?.properties || {};
  const args = {};
  for (const [key, schema] of Object.entries(props)) {
    if (!searchParams.has(key)) continue;
    const raw = searchParams.get(key);
    args[key] = schema.type === 'number' || schema.type === 'integer' ? Number(raw) : raw;
  }
  return args;
}

// 3 - HTTP server on :3003 for the browser frontend
http.createServer(async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Content-Type', 'application/json');
  try {
    const { pathname, searchParams } = new URL(req.url, 'http://localhost');

    if (pathname === '/tools') {
      return res.end(JSON.stringify({ tools }));
    }

    if (pathname === '/exchange') {
      const toolName = searchParams.get('tool') || '';
      const tool = toolsByName.get(toolName);
      if (!tool) {
        res.writeHead(400);
        return res.end(JSON.stringify({ error: `unknown tool "${toolName}"` }));
      }
      const args = coerceArgs(tool, searchParams);
      const result = await upstream.callTool({ name: toolName, arguments: args });
      const raw = result.content?.[0]?.text ?? '';
      let payload;
      try { payload = JSON.parse(raw); } catch { payload = { text: raw }; }
      payload.server = 'BOI Exchange Service (MCP · demo3-boi-exchange-server/index.js)';
      return res.end(JSON.stringify(payload));
    }

    res.writeHead(404);
    res.end(JSON.stringify({ error: 'Not found' }));
  } catch (err) {
    res.writeHead(500);
    res.end(JSON.stringify({ error: err.message }));
  }
}).listen(3003, () => process.stderr.write('HTTP server on :3003\n'));

// 4 - Transport for Claude/VSCode
const serverTransport = new StdioServerTransport();
await server.connect(serverTransport);
```

**Key concepts:**
- **`Server` (low-level), not `McpServer`** — `McpServer` wants a Zod schema per tool, but we already have the upstream's raw JSON Schema and don't want to hand-translate 5 schemas (or re-translate them every time the package updates). The low-level `Server` lets us register `ListToolsRequestSchema`/`CallToolRequestSchema` handlers directly and forward requests verbatim — a **transparent passthrough**.
- **One generic `/exchange?tool=<name>&...` route, not 5 hardcoded ones** — the bridge reads each tool's own `inputSchema.properties` to know which query params to expect and whether to parse them as numbers. This automatically supports all 5 tools (and any the package adds later) with one route.
- **The bridge is both an MCP client AND an MCP server** — client to the internal `npx` child (upstream), server to Claude/VSCode (via its own stdio) — plus a plain HTTP server for the browser. Three roles, one process.

### Step 3: Point `mcp.json` at the bridge instead of raw `npx`

```json
"boi-exchange": {
  "type": "stdio",
  "command": "node",
  "args": ["${workspaceFolder}/demo3-boi-exchange-server/index.js"]
}
```

Claude's experience doesn't change — same tool names, same schemas — it's just talking to the bridge now instead of the package directly, and the bridge happens to also serve HTTP.

### Step 4: Test it

```powershell
cd demo3-boi-exchange-server
node index.js
# → "HTTP server on :3003"
```

In another terminal:
```powershell
curl "http://localhost:3003/exchange?tool=get_exchange_rate&currency=USD"
```
You should get back real Bank of Israel data with a `server` field proving it went through your bridge.

---

## DEMO 5: Create `frontend.html`

Create a single file `frontend.html` at the **project root**. It needs no build tools — just open it in a browser.

### The structure

```html
<!DOCTYPE html>
<html lang="en">
<head>
  <title>MCP Demo Frontend</title>
  <!-- all CSS goes here -->
</head>
<body>
  <!-- Two cards side by side -->
  <div id="weather-card">
    <input id="weatherInput" placeholder="Enter city…" />
    <button onclick="fetchWeather()">Ask</button>
    <div id="weatherResult"></div>
  </div>

  <div id="nationality-card">
    <input id="nameInput" placeholder="Enter a name…" />
    <button onclick="fetchNationality()">Ask</button>
    <div id="nationalityResult"></div>
  </div>

  <script>
    async function fetchWeather() {
      const city = document.getElementById('weatherInput').value.trim();
      const res = await fetch(`http://localhost:3001/weather?city=${encodeURIComponent(city)}`);
      const data = await res.json();
      document.getElementById('weatherResult').innerText = data.text;
      // data.server → "Weather Service (MCP · index.js)" — proof it hit your server
    }

    async function fetchNationality() {
      const name = document.getElementById('nameInput').value.trim();
      const res = await fetch(`http://localhost:3002/nationality?name=${encodeURIComponent(name)}`);
      const data = await res.json();
      // data.country → [{country_id: "IL", probability: 0.48}, ...]
      // data.server  → "Nationalize Service (MCP · server.py)"
    }
  </script>
</body>
</html>
```

**Key JavaScript concept — `fetch()`:** The browser's built-in HTTP client. `fetch(url)` returns a Promise. `await` pauses until the response arrives. `.json()` parses the body as JSON.

**Why is `encodeURIComponent()` needed?** City names with spaces or special characters (e.g., "New York", "São Paulo") would break the URL. `encodeURIComponent` converts them to safe URL-encoded strings.

---

## How to Run Phase 2

### Option A — Via VSCode (recommended, zero extra steps)

`mcp.json` already starts all three servers. When it does, the HTTP servers on :3001, :3002, and :3003 come up automatically — they're part of the same processes.

1. Open the project in VSCode with the Claude extension active
2. Servers start automatically (you'll see them listed in the Claude tools panel)
3. Double-click `frontend.html` to open it in your browser
4. Type a city or name → results appear (the `boi-exchange` bridge isn't wired into the two-card frontend yet — that happens in Phase 3's chatbot rewrite)

No separate terminal windows needed.

### Option B — Manual terminals

```powershell
# Terminal 1
cd demo1-weather-server
node index.js
# → "HTTP server on :3001"

# Terminal 2
cd demo2-nationalize-server
venv\Scripts\Activate.ps1
python server.py
# → "HTTP server on :3002"

# Terminal 3
cd demo3-boi-exchange-server
node index.js
# → "HTTP server on :3003"
```

Then open `frontend.html` in your browser.

---

## How to Verify It's Your MCP Server (Not a Direct API Call)

Every response from your servers includes a `server` field:

```json
{ "text": "The weather in London is ...", "server": "Weather Service (MCP · index.js)" }
{ "country": [...], "server": "Nationalize Service (MCP · server.py)" }
```

The frontend displays this as a green badge:

```
✓ Weather Service (MCP · index.js)
✓ Nationalize Service (MCP · server.py)
```

If that badge appears, the request went through **your custom server code** — not directly to the external API. If the servers aren't running, you'll see a "Could not reach server" error instead.

---

## Phase 2 Concepts

| Concept | One-liner |
|---------|-----------|
| HTTP alongside stdio | Same server, two transports — each client type uses what it speaks |
| `http.createServer` (Node) | Built-in HTTP server — no Express needed for simple endpoints |
| `BaseHTTPRequestHandler` (Python) | Built-in HTTP request handler — no Flask needed |
| `threading.Thread(daemon=True)` | Runs HTTP server in background without blocking FastMCP |
| `Access-Control-Allow-Origin: *` | Required CORS header so browsers can call localhost from a `file://` page |
| `fetch()` (browser JS) | Built-in browser API for making HTTP requests asynchronously |
| `encodeURIComponent()` | Encodes special characters so they're safe in a URL query string |
| `data-server` badge | A field injected by the server into its own response — proves the request went through your code |

---

## Full Command Sequence — Phase 2 (from existing Phase 1 setup)

```powershell
# === Step 1: Update the JavaScript server ===
# Replace demo1-weather-server/index.js with the Phase 2 version from DEMO 3 above
# (adds: import http, getWeather() function, http.createServer().listen(3001))

# Test it
cd demo1-weather-server
node index.js
# You should see: "HTTP server on :3001" printed in the terminal
# Press Ctrl+C to stop, then go back to root
cd ..

# === Step 2: Update the Python server ===
# Replace demo2-nationalize-server/server.py with the Phase 2 version from DEMO 4 above
# (adds: import threading/json/http.server, NationalityHandler class, daemon thread)

# Test it
cd demo2-nationalize-server
venv\Scripts\Activate.ps1
python server.py
# You should see: "HTTP server on :3002" printed in the terminal
# Press Ctrl+C to stop
deactivate
cd ..

# === Step 3: Build the boi-exchange bridge ===
# Create demo3-boi-exchange-server/ (see DEMO 4B above)
# Update mcp.json's "boi-exchange" entry to point at it instead of raw npx

# === Step 4: Create the frontend ===
# Create frontend.html at the project root
# (paste the complete HTML from DEMO 5 above, or use the full version from the repo)

# === Step 5: Run everything ===

# Option A — VSCode (recommended)
# 1. Open project folder in VSCode with Claude extension active
# 2. Servers start automatically via mcp.json (HTTP on :3001, :3002, :3003 included)
# 3. Double-click frontend.html to open in browser

# Option B — Manual (three terminals)
# Terminal 1:
cd demo1-weather-server
node index.js                        # keeps running — HTTP on :3001 + MCP stdio

# Terminal 2:
cd demo2-nationalize-server
venv\Scripts\Activate.ps1
python server.py                     # keeps running — HTTP on :3002 + MCP stdio

# Terminal 3:
cd demo3-boi-exchange-server
node index.js                        # keeps running — HTTP on :3003 + MCP stdio (bridged)

# Then open frontend.html in your browser (double-click in File Explorer)
```

---

## Phase 2 Verification

Open `frontend.html` in your browser and confirm:
- Type **"London"** in the weather card → weather result appears with green badge `✓ Weather Service (MCP · index.js)`
- Type **"Ronen"** in the nationality card → ranked country list appears with green badge `✓ Nationalize Service (MCP · server.py)`
- Stop one of the servers → that card shows "Could not reach server" error (proves the frontend is truly connected to your servers, not a fallback)

Also confirm the new bridge independently (it isn't wired into this two-card frontend yet, but it should already be live):
```powershell
curl "http://localhost:3003/exchange?tool=get_exchange_rate&currency=USD"
```
→ should return real Bank of Israel data with `"server": "BOI Exchange Service (MCP · demo3-boi-exchange-server/index.js)"`.

---

---

# PHASE 3: LLM-Powered Chatbot — Natural Language Interface

## Why Phase 3?

Phase 2 gave us a working browser frontend, but it had **two separate input cards** — one for weather, one for nationality. Users had to know which box to type in.

Real users don't think in boxes. They ask questions naturally:

- *"Pune ka weather kya hai?"*
- *"Can you tell me the nationality of Ronen?"*
- *"amit name nationality"*
- *"is it raining in delhi?"*

Phase 3 solves this with two upgrades:

1. **Chatbot UI** — a single conversation window instead of two separate cards
2. **LLM intent parsing** — the user's message is sent to an LLM (Groq) that understands what they're asking and extracts the city or name automatically

**Important:** The LLM is used **only** to understand the question. The actual data (weather, nationality) still comes exclusively from your MCP servers.

```
User types anything (any language, any phrasing)
         ↓
/parse endpoint → Groq LLM → { type: "weather", entity: "Pune" }
         ↓
/weather?city=Pune → your index.js → wttr.in → answer
         ↓
Chat bubble with ✓ Weather Service (MCP · index.js)
```

---

## DEMO 6: Redesign `frontend.html` as a Chatbot

Replace the two-card layout with a full-page chat window:

```
┌─────────────────────────────────────────┐
│  🤖 MCP Chatbot        JS·3001 Py·3002  │  ← header
├─────────────────────────────────────────┤
│                                         │
│   ┌─────────────────────────────────┐   │
│   │ 👤 pune ka weather kya hai      │   │  ← user bubble (right)
│   └─────────────────────────────────┘   │
│  ┌──────────────────────────────────┐   │
│  │ 🤖 The weather in Pune is...     │   │  ← bot bubble (left, plain text)
│  │    ✓ Weather Service (MCP)       │   │
│  └──────────────────────────────────┘   │
│                                         │
├─────────────────────────────────────────┤
│  [Type anything…]             [Send ➤]  │  ← input bar (fixed at bottom)
└─────────────────────────────────────────┘
```

**Key UI concepts:**
- `display: flex; flex-direction: column; height: 100vh` — makes the page fill the screen
- `.msg-row.user` → `align-self: flex-end` (right side)
- `.msg-row.bot` → `align-self: flex-start` (left side)
- Typing indicator (animated dots) shows while the LLM + server respond
- `AbortController` with a 10-second timeout prevents the UI from hanging forever

---

## DEMO 7: Add `/parse` Endpoint to `index.js` (Groq LLM)

### Why Groq?

Groq (groq.com) is a free AI inference platform. Their API is **OpenAI-compatible** — you use the same `openai` npm package, just with a different `baseURL` and API key.

**API key format:** starts with `gsk_` — get one free at [console.groq.com](https://console.groq.com)

> ⚠️ Do not confuse Groq (groq.com, `gsk_` keys) with Grok (xAI, `xai-` keys). They are different services with different base URLs.

### Step 1: Install the OpenAI SDK

```powershell
cd demo1-weather-server
npm install openai
```

The `openai` package works with any OpenAI-compatible API — including Groq.

### Step 2: Update `index.js`

Add these imports and the Groq client at the top:

```javascript
import OpenAI from 'openai';

// Groq client — OpenAI-compatible (gsk_ keys → api.groq.com)
const grok = new OpenAI({
  apiKey: process.env.GROK_API_KEY || '',
  baseURL: 'https://api.groq.com/openai/v1',
});
```

Add the `parseIntent` function:

```javascript
async function parseIntent(userMessage) {
  const today = new Date().toISOString().slice(0, 10); // resolves "today"/"last week" etc.

  const completion = await grok.chat.completions.create({
    model: 'llama-3.3-70b-versatile',
    messages: [
      {
        role: 'system',
        content: `You are an intent classifier for a chatbot that handles weather, nationality, and currency-exchange queries.
Today's date is ${today} (YYYY-MM-DD) — use it to resolve relative dates like "today", "last week", "past 7 days".
Given the user message, respond with ONLY valid JSON — no markdown, no explanation, no extra text.
Format: {"type":"weather"|"nationality"|"exchange"|"unknown","entity":"<extracted value or empty string>","tool":"<tool name or empty string>","args":{}}
Rules:
- "weather"     → user asking about weather, temperature, climate, forecast of a city/place. entity = city name.
- "nationality" → user asking about nationality, origin, country of a person's name. entity = person name.
- "exchange"    → user asking about currency exchange rates, converting money, historical rates, or supported currencies. Pick exactly one "tool" and fill "args" with ONLY that tool's fields (3-letter ISO 4217 codes, YYYY-MM-DD dates):
  - "get_exchange_rate"    → args: {"currency": "<code>"}
  - "convert_currency"     → args: {"amount": <number>, "fromCurrency": "<code>", "toCurrency": "<code>"} — one of them must be "ILS"
  - "get_historical_rates" → args: {"currency": "<code>", "startDate": "YYYY-MM-DD", "endDate": "YYYY-MM-DD"}
  - "get_rate_change"      → args: {"currency": "<code>", "startDate": "YYYY-MM-DD", "endDate": "YYYY-MM-DD"}
  - "list_currencies"      → args: {}
- "unknown"     → anything else
- entity is only used for weather/nationality; tool/args are only used for exchange`,
      },
      { role: 'user', content: userMessage },
    ],
    temperature: 0,
  });
  const raw = completion.choices[0].message.content.trim();
  return JSON.parse(raw);
}
```

**Why inject `today` into the prompt?** The LLM has no built-in sense of "now" — without telling it today's date, it can't turn "last week" or "the past 7 days" into concrete `YYYY-MM-DD` values for `get_historical_rates`/`get_rate_change`.

Add the `/parse` route inside the existing HTTP server (alongside `/weather`):

```javascript
if (pathname === '/parse') {
  const q = searchParams.get('q') || '';
  if (!q) {
    res.writeHead(400);
    return res.end(JSON.stringify({ error: 'q parameter required' }));
  }
  const intent = await parseIntent(q);
  return res.end(JSON.stringify(intent));
}
```

**Why `temperature: 0`?** We want deterministic output — always the same JSON structure for the same input. Higher temperatures add randomness, which would cause unpredictable JSON that might fail to parse.

**Why one `/parse` endpoint for weather, nationality, AND exchange?** The LLM classifies the intent and extracts the entity (or tool+args). The frontend then routes to `:3001/weather`, `:3002/nationality`, or `:3003/exchange` based on the result. One classifier, three data sources — clean separation of concerns.

### Step 3: Set the API key in `mcp.json`

Add an `env` block to the weather server entry so VSCode passes the key automatically:

```json
{
  "servers": {
    "weather": {
      "type": "stdio",
      "command": "node",
      "args": ["${workspaceFolder}/demo1-weather-server/index.js"],
      "env": {
        "GROK_API_KEY": "gsk_your_key_here"
      }
    },
    "nationalize": {
      "type": "stdio",
      "command": "${workspaceFolder}/demo2-nationalize-server/venv/Scripts/python",
      "args": ["${workspaceFolder}/demo2-nationalize-server/server.py"]
    },
    "boi-exchange": {
      "type": "stdio",
      "command": "node",
      "args": ["${workspaceFolder}/demo3-boi-exchange-server/index.js"]
    }
  }
}
```

**Why `env` in `mcp.json`?** When VSCode spawns the server process, it doesn't inherit your terminal's environment variables. The `env` block injects them into the child process directly.

### Step 4: Update `frontend.html`

Replace the regex-based `parseIntent` function with an async fetch to the new endpoint:

```javascript
async function parseIntent(message) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 10000); // 10s timeout
  try {
    const res = await fetch(
      `http://localhost:3001/parse?q=${encodeURIComponent(message)}`,
      { signal: controller.signal }
    );
    return res.json(); // { type: "weather", entity: "Pune" }
  } finally {
    clearTimeout(timeout);
  }
}
```

The `handleSend` function now awaits `parseIntent` before deciding which server to call:

```javascript
async function handleSend() {
  const text = input.value.trim();
  addMessage('user', text);           // show user bubble
  addTyping();                        // show loading dots

  const { type, entity, tool, args } = await parseIntent(text);  // Groq classifies

  if (type === 'weather') {
    const data = await getWeather(entity);           // your MCP :3001
    addMessage('bot', renderWeather(data));
  } else if (type === 'nationality') {
    const data = await getNationality(entity);       // your MCP :3002
    addMessage('bot', renderNationality(entity, data));
  } else if (type === 'exchange') {
    const data = await getExchange(tool, args || {}); // your MCP :3003 (bridge)
    addMessage('bot', renderExchange(tool, data));
  } else {
    addMessage('bot', 'Sorry, MCP is not configured for that information.');
  }
}
```

Add the fetch call for the bridge — same shape as `getWeather`/`getNationality`, just forwarding whatever `tool`/`args` the classifier picked:

```javascript
async function getExchange(tool, args) {
  const params = new URLSearchParams({ tool, ...args });
  const res = await fetch(`http://localhost:3003/exchange?${params.toString()}`);
  return res.json();
}
```

Responses are plain conversational text — no cards or charts:

```javascript
// Weather → plain sentence from server
function renderWeather(data) {
  return data.text;  // "The weather in Pune is Sunny, 34°C..."
}

// Nationality → natural sentence built from country list
function renderNationality(name, data) {
  const parts = data.country.map((c, i) =>
    i === 0
      ? `most likely from ${flag(c.country_id)} ${country(c.country_id)} (${pct(c.probability)}%)`
      : `${flag(c.country_id)} ${country(c.country_id)} (${pct(c.probability)}%)`
  );
  return `The name ${name} is ${parts[0]}, followed by ${parts.slice(1).join(', ')}.`;
}

// Exchange → one sentence per tool, since each returns a different shape
function renderExchange(tool, data) {
  if (tool === 'get_exchange_rate') return `The latest rate is ${data.unit} (as of ${data.date}).`;
  if (tool === 'convert_currency')  return `${data.from.amount} ${data.from.currency} = ${data.to.amount} ${data.to.currency} (${data.rateDescription}).`;
  if (tool === 'list_currencies')   return `Supported currencies: ${data.currencies.join(', ')}.`;
  if (tool === 'get_rate_change')   return `${data.currency}: ${data.direction} (${data.percentChange}% from ${data.startDate} to ${data.endDate}).`;
  if (tool === 'get_historical_rates') return data.rates.map(r => `${r.date}: ${r.rate}`).join('<br>');
  return data.text || 'No exchange data available.';
}
```

---

## How to Run Phase 3

### Step 1: Get a Groq API key
1. Go to [console.groq.com](https://console.groq.com)
2. Sign up (free) → API Keys → Create API Key
3. Copy the key (starts with `gsk_`)

### Step 2: Add the key to `mcp.json`
Paste your key into `.vscode/mcp.json` under the `weather` server's `env` block (see DEMO 7 Step 3).

### Step 3: Restart the servers

**Via VSCode (recommended):**
- `Ctrl+Shift+P` → `Developer: Reload Window`
- VSCode re-reads `mcp.json` and respawns all three servers with the env var set

**Via manual terminal:**
```powershell
# Terminal 1
cd demo1-weather-server
$env:GROK_API_KEY = "gsk_your_key_here"
node index.js
# → "HTTP server on :3001"

# Terminal 2
cd demo2-nationalize-server
venv\Scripts\Activate.ps1
python server.py
# → "HTTP server on :3002"

# Terminal 3
cd demo3-boi-exchange-server
node index.js
# → "HTTP server on :3003"
```

### Step 4: Open the chatbot
Double-click `frontend.html` — the chat window opens.

---

## Full Command Sequence — Phase 3

```powershell
# === Step 1: Install Groq/OpenAI SDK ===
cd demo1-weather-server
npm install openai
cd ..

# === Step 2: Update index.js ===
# Add: import OpenAI, Groq client init, parseIntent() function, /parse route
# (see DEMO 7 Step 2 above for full code)

# === Step 3: Rewrite frontend.html ===
# Replace two-card layout with chatbot UI
# Replace regex parseIntent() with async fetch to /parse
# Add getExchange()/renderExchange() and the "exchange" branch in handleSend()
# (see DEMO 6 and DEMO 7 Step 4 above)

# === Step 4: Add API key to mcp.json ===
# Add "env": { "GROK_API_KEY": "gsk_..." } to weather server entry

# === Step 5: Restart ===
# Option A (VSCode): Ctrl+Shift+P → Developer: Reload Window
# Option B (manual):
cd demo1-weather-server
$env:GROK_API_KEY = "gsk_your_key_here"
node index.js                          # → HTTP server on :3001

# (new terminal)
cd demo2-nationalize-server
venv\Scripts\Activate.ps1
python server.py                       # → HTTP server on :3002

# (new terminal)
cd demo3-boi-exchange-server
node index.js                          # → HTTP server on :3003

# Open frontend.html in browser
```

---

## Phase 3 Concepts

| Concept | One-liner |
|---------|-----------|
| LLM intent classification | Use an LLM to understand what the user is asking — no regex, any language, any phrasing |
| Groq API | Free OpenAI-compatible inference platform — same SDK, different `baseURL` |
| `openai` npm package | Works with OpenAI AND any OpenAI-compatible API (Groq, xAI, Azure, etc.) |
| `baseURL` override | Redirect OpenAI SDK to a different provider's endpoint |
| `temperature: 0` | Makes LLM output deterministic — critical when you need predictable JSON |
| `process.env.GROK_API_KEY` | Read API key from environment variable — never hardcode secrets in source code |
| `env` in `mcp.json` | Inject environment variables into a server process spawned by VSCode |
| `AbortController` + timeout | Cancel a hanging `fetch()` after N seconds — prevents the UI from freezing |
| Separation of concerns | LLM understands language; MCP servers own the data — each layer does one job |
| Bridging a third-party MCP server | When you don't own a tool's source, spawn it internally and relay it — same "one process, two transports" shape, one extra hop |
| Generic tool-schema-driven routing | Reading a tool's own JSON Schema to build its HTTP route generically avoids hardcoding param names per tool |

---

## Phase 3 Verification

Open `frontend.html` and test these inputs — all should return answers without knowing which server handles what:

| What you type | Expected response |
|---|---|
| `pune ka weather` | Weather for Pune from `:3001` |
| `can you tell me weather of delhi` | Weather for Delhi from `:3001` |
| `what is nationality of Ronen` | Nationality of Ronen from `:3002` |
| `amit name nationality` | Nationality of Amit from `:3002` |
| `is it raining in Mumbai?` | Weather for Mumbai from `:3001` |
| `where is Sara from?` | Nationality of Sara from `:3002` |
| `what's the USD exchange rate today?` | Latest USD→ILS rate from `:3003` (`get_exchange_rate`) |
| `convert 100 USD to ILS` | Conversion result from `:3003` (`convert_currency`) |
| `what currencies do you support?` | Currency list from `:3003` (`list_currencies`) |
| `how has USD changed over the past week?` | Rate change from `:3003` (`get_rate_change`) |
| `show me USD rates for the last 5 days` | Daily rate series from `:3003` (`get_historical_rates`) |
| `tell me a joke` | "Sorry, MCP is not configured for that information." |

Every weather, nationality, and exchange answer ends with a green `✓` MCP source badge proving the data came from your server (or bridge), not the LLM.
