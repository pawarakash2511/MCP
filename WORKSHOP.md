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
└── WORKSHOP.md                     ← This file
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

When Claude is active in VSCode, it reads this file, spawns both server processes, and can now call `getWeather` and `predict_nationality` as tools.

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

# === VSCode Config ===
mkdir .vscode
# Create .vscode/mcp.json (paste content from section above)
# Reload VSCode window → Claude can now use both tools
```

---

## Verification

After setup, open Claude in VSCode and ask:
- *"What's the weather in New York?"* → should trigger `getWeather`
- *"What nationality is the name Ronen?"* → should trigger `predict_nationality`

Both should return real data from the external APIs.
