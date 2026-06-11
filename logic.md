# Logic: How Everything Works End-to-End

This document explains the complete picture — what the LLM is, how it decides to call tools, how MCP connects it to your code, how the browser frontend fits in, and how every piece talks to every other piece.

---

## 1. The Big Picture

There are three separate worlds in this project. Each speaks a different language:

```
┌─────────────────────────────────────────────────────────────────┐
│  WORLD 1: The LLM (Claude)                                      │
│  Lives on Anthropic's servers. Understands language.            │
│  Speaks: MCP protocol over stdio                                │
└──────────────────────────┬──────────────────────────────────────┘
                           │  stdio (stdin/stdout pipes)
                           │  MCP JSON messages
┌──────────────────────────▼──────────────────────────────────────┐
│  WORLD 2: Your Custom MCP Servers (your code)                   │
│  index.js  (Node.js)   →  getWeather tool + /parse endpoint     │
│  server.py (Python)    →  predict_nationality tool              │
│  Lives on your machine. Executes your business logic.           │
│  Speaks: MCP over stdio (to Claude) + HTTP (to browser)         │
└──────────┬──────────────────────────────────┬───────────────────┘
           │  HTTP (fetch to external APIs     │  HTTP (from browser)
           │  + Groq API for intent parsing)   │
┌──────────▼───────────┐           ┌───────────▼──────────────────┐
│  WORLD 3A: External  │           │  WORLD 3B: Browser           │
│  APIs                │           │  frontend.html (chatbot UI)  │
│  wttr.in             │           │  Speaks: HTTP to localhost   │
│  api.nationalize.io  │           └──────────────────────────────┘
│  api.groq.com        │
└──────────────────────┘
```

---

## 2. What is the LLM and How Does It Decide to Call Tools?

**Claude** is a Large Language Model (LLM) made by Anthropic. It runs entirely on Anthropic's cloud servers — none of the Claude model code runs on your machine.

### What an LLM actually is

An LLM is a neural network trained on billions of text examples. It predicts the most likely next token (word piece) given everything it has seen so far. That's the entire mechanism — but at scale, this produces reasoning, code generation, and tool use.

### How Claude knows your tools exist

When VSCode launches your MCP servers, it sends Claude a **system-level message** at the start of the conversation that lists all available tools with their names, descriptions, and parameter schemas:

```
Available tools:
- getWeather(city: string) — "Get the current weather for a given city"
- predict_nationality(name: string) — "Predict the nationality of a person based on their name"
```

Claude reads this. From that point on, when you ask a question, Claude's model weights cause it to decide: *"This question requires real-time data I don't have. I should call the getWeather tool."*

### The tool-call decision (inside Claude's "thinking")

```
User: "What's the weather in Tokyo?"

Claude reasons:
  1. I don't have real-time weather data in my training
  2. I have a tool called getWeather that can fetch it
  3. The parameter schema says I need: city (string, min 2 chars)
  4. I will call: getWeather({ city: "Tokyo" })
```

Claude does **not** call the tool directly. It produces a structured JSON message saying *"I want to call this tool with these arguments"* and sends it to the MCP client (VSCode). VSCode then actually runs the tool and sends the result back to Claude. Claude then writes the final human-readable response.

---

## 3. What is MCP?

**Model Context Protocol (MCP)** is an open standard created by Anthropic that defines:

1. How an AI client (Claude in VSCode) discovers available tools
2. How it requests a tool call
3. How the tool returns results
4. What the JSON message format looks like

Think of it as a contract. Both sides (Claude and your server) agree to speak the same language.

### The MCP message format (simplified)

**Tool discovery** — Claude asks: what tools do you have?
```json
{ "method": "tools/list" }
```

Your server responds:
```json
{
  "tools": [
    {
      "name": "getWeather",
      "description": "Get the current weather for a given city",
      "inputSchema": {
        "type": "object",
        "properties": {
          "city": { "type": "string", "minLength": 2 }
        },
        "required": ["city"]
      }
    }
  ]
}
```

**Tool call** — Claude says: call this tool with these args:
```json
{
  "method": "tools/call",
  "params": {
    "name": "getWeather",
    "arguments": { "city": "Tokyo" }
  }
}
```

**Tool result** — your server responds:
```json
{
  "content": [
    { "type": "text", "text": "The weather in Tokyo is Partly Cloudy, 22°C..." }
  ]
}
```

All these messages travel over **stdio** (stdin/stdout pipes).

---

## 4. The Transport Layer: stdio

### What stdio means

Every process on your computer has three standard streams:
- `stdin` — input (keyboard by default)
- `stdout` — output (screen by default)
- `stderr` — error/log output

When VSCode spawns your MCP server (e.g., `node index.js`), it **hijacks** stdin and stdout. Instead of your keyboard/screen, these pipes now connect directly to the VSCode/Claude runtime.

```
VSCode ──→ stdin  ──→ node index.js
VSCode ←── stdout ←── node index.js
```

Every MCP JSON message is written as a single line to stdout and read from stdin. This is why your server "waits silently" when you run it manually — it's blocked on `stdin.read()`, waiting for a message that never comes because nothing is connected.

### Why stdio and not HTTP?

- **Simplicity** — no port management, no networking stack needed
- **Security** — only the process that spawned you can talk to you
- **Low latency** — in-process pipe, no TCP overhead
- **Automatic lifecycle** — when VSCode closes, the pipe closes, the server exits

### Why stderr is safe for logs

The MCP protocol only uses `stdout` for JSON messages. `stderr` is completely ignored by the MCP client. That's why:

```javascript
process.stderr.write('HTTP server on :3001\n');  // safe — Claude never sees this
```

Writing to `stdout` for logs would corrupt the protocol — Claude would try to parse your log line as a JSON-RPC message and fail.

---

## 5. How mcp.json Wires It All Together

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
    }
  }
}
```

When VSCode loads this file, it does the following for each entry:

1. **Spawns a child process** — runs the command with the given args
2. **Connects stdin/stdout** — creates a pipe between itself and the child process
3. **Sends `tools/list`** — asks the server what tools it has
4. **Tells Claude** — forwards the tool list so Claude knows what's available
5. **Stays connected** — keeps the pipe open for the entire VSCode session

`${workspaceFolder}` is a VSCode variable that resolves to the folder you opened — in your case `D:\UPWORK\Github_project\MCP`.

**Why `env` in `mcp.json`?**
VSCode spawns your server as a child process. That child process does **not** inherit your terminal's environment variables — it starts with a clean environment. The `env` block injects variables directly into the spawned process. This is how `GROK_API_KEY` reaches `index.js` without you having to set it in every terminal session.

**Why the venv path for Python?**
```
"command": "${workspaceFolder}/demo2-nationalize-server/venv/Scripts/python"
```
VSCode does not activate your venv before running the command. If you used the global `python`, the `mcp` and `requests` packages would not be found (they're installed only inside the venv). Pointing directly to `venv/Scripts/python` means Python already "knows" it's inside that venv.

---

## 6. Your Code: How the JS Server Works (`index.js`)

### Startup sequence

```javascript
// 1. Import the MCP SDK (these are the only non-built-in imports)
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';
import OpenAI from 'openai';  // also used for Groq (OpenAI-compatible)

// 2. Import built-ins (no npm install needed)
import http from 'http';
import { URL } from 'url';

// 3. Groq client — same OpenAI SDK, different baseURL
const grok = new OpenAI({
  apiKey: process.env.GROK_API_KEY || '',
  baseURL: 'https://api.groq.com/openai/v1',
});
```

### The McpServer object

```javascript
const server = new McpServer({ name: 'Weather Service', version: '1.0.0' });
```

This object is a registry. It holds a list of tools. It doesn't start listening yet — it just exists in memory.

### Tool registration

```javascript
server.tool(
  'getWeather',                          // name — Claude uses this to call it
  'Get the current weather for a city',  // description — Claude reads this to decide WHEN to call it
  { city: z.string().min(2) },          // Zod schema — validated before handler runs
  async ({ city }) => { ... }           // handler — your actual logic
);
```

**The description is critical.** Claude's decision to call the tool is based entirely on reading this string. If you write a bad description, Claude won't know when to use the tool.

**Zod schema** validates inputs before your handler runs. If Claude sends `{ city: "X" }` (too short), Zod rejects it and returns an error to Claude before your code runs.

### The shared function

```javascript
async function getWeather(city) {
  const res = await fetch(`https://wttr.in/${encodeURIComponent(city)}?format=j1`);
  const data = await res.json();
  const current = data.current_condition[0];
  return `The weather in ${city} is ${current.weatherDesc[0].value}, ...`;
}
```

This is the actual business logic. It calls the external weather API and formats the result. It is called by **both** the MCP tool handler (when Claude asks) and the HTTP handler (when the browser asks). One function, two callers.

### Connecting to stdio

```javascript
const transport = new StdioServerTransport();
await server.connect(transport);
```

`server.connect(transport)` is a blocking call. It opens stdin for reading and starts the MCP message loop. The process now waits here forever, processing one MCP JSON message at a time. This is what makes the server "wait silently" when you run `node index.js` manually.

---

## 7. Your Code: How the Python Server Works (`server.py`)

### FastMCP vs the JS SDK

The JS server uses the low-level `McpServer` class — you explicitly register tools with `server.tool(...)`.

The Python server uses `FastMCP` — a higher-level wrapper that uses **decorators** and **type hints** to do the same thing with less code.

```python
server = FastMCP("Nationalize Service")

@server.tool()
def predict_nationality(name: str) -> dict:
    """Predict the nationality of a person based on their name."""
    ...
```

When Python sees `@server.tool()`, it calls `server.tool(predict_nationality)` automatically. FastMCP inspects the function:
- **Name** → `predict_nationality` (tool name)
- **Docstring** → `"Predict the nationality..."` (tool description — Claude reads this)
- **Type hint** `name: str` → parameter schema (equivalent to Zod in JS)
- **Return type** `dict` → tells MCP the response format

### Threading: running two blocking loops

```python
def _start_http():
    HTTPServer(("", 3002), NationalityHandler).serve_forever()

t = threading.Thread(target=_start_http, daemon=True)
t.start()   # HTTP server starts in background thread
server.run()  # FastMCP blocks the main thread
```

Both `serve_forever()` and `server.run()` are infinite blocking loops. You can't run two infinite loops sequentially — the first one never ends. Threading solves this: the HTTP loop runs on a background thread, FastMCP blocks the main thread. Both run simultaneously.

`daemon=True` means: when the main thread exits (when FastMCP stops), kill this thread too. Without it, the process would hang after FastMCP exits because the HTTP thread is still alive.

---

## 8. End-to-End Flow: Claude Path

**You type:** *"What's the weather in Tokyo?"*

```
Step 1  You type the message in VSCode chat
        ↓
Step 2  Claude's LLM reads the message + the tool list it received at startup
        Claude decides: "I need getWeather(city='Tokyo')"
        Claude produces a tool-call JSON message
        ↓
Step 3  VSCode receives the tool-call intention
        VSCode writes to stdin of node index.js:
        {"method":"tools/call","params":{"name":"getWeather","arguments":{"city":"Tokyo"}}}
        ↓
Step 4  StdioServerTransport reads the message from stdin
        MCP SDK routes it to the registered "getWeather" handler
        ↓
Step 5  Zod validates { city: "Tokyo" } → passes (length >= 2)
        ↓
Step 6  getWeather("Tokyo") runs:
        → fetch("https://wttr.in/Tokyo?format=j1")
        → wttr.in returns JSON with temperature, description, humidity
        → returns formatted string
        ↓
Step 7  MCP SDK wraps the result:
        {"content":[{"type":"text","text":"The weather in Tokyo is..."}]}
        → written to stdout
        ↓
Step 8  VSCode reads the result from stdout
        VSCode forwards it to Claude
        ↓
Step 9  Claude reads the tool result
        Claude writes the final human-readable reply
        ↓
Step 10 You see: "The weather in Tokyo is Partly Cloudy, 22°C (feels like 20°C), humidity 65%."
```

**Total round trips:** Your machine → Anthropic (Claude decides) → Your machine (tool runs) → wttr.in (data) → Your machine → Anthropic (Claude responds) → Your screen.

---

## 9. End-to-End Flow: Browser Path (Phase 3 Chatbot)

**User types:** *"pune ka weather kya hai"* — any phrasing, any language

```
Step 1  User types in the chatbot input and presses Send
        ↓
Step 2  frontend.html calls the /parse endpoint:
        fetch("http://localhost:3001/parse?q=pune ka weather kya hai")
        ↓
Step 3  index.js receives the request, calls Groq LLM:
        POST https://api.groq.com/openai/v1/chat/completions
        { model: "llama-3.3-70b-versatile", messages: [system prompt + user message], temperature: 0 }
        ↓
Step 4  Groq LLM returns:
        { "type": "weather", "entity": "pune" }
        index.js parses the JSON and sends it back to the browser
        ↓
Step 5  Browser sees type="weather", calls the weather endpoint:
        fetch("http://localhost:3001/weather?city=pune")
        ↓
Step 6  Node's HTTP handler calls getWeather("pune")
        → fetch("https://wttr.in/pune?format=j1")
        → formats the result string
        ↓
Step 7  HTTP handler returns:
        {"text":"The weather in Pune is Sunny, 34°C...","server":"Weather Service (MCP · index.js)"}
        with header: Access-Control-Allow-Origin: *
        ↓
Step 8  Browser renders a bot chat bubble with the weather text
        + green badge: ✓ Weather Service (MCP · index.js)
```

**Groq is used only as a router** — it understands the question and extracts the entity. The actual weather data comes from your `index.js` → wttr.in. Groq never sees or returns weather data.

**Claude (Anthropic) is NOT involved in the browser path.** The chatbot uses Groq for intent classification, not Claude.

---

## 10. The Dual Transport Architecture (Key Insight)

Both paths share the same business logic but use different entry points:

```
                      ┌──────────────────────┐
                      │     index.js         │
                      │                      │
  Claude via stdio ──→│  MCP tool handler    │──┐
                      │  async ({ city }) => │  │
                      │    getWeather(city)  │  ├──→ getWeather(city)
  Browser via HTTP ──→│  HTTP GET handler    │──┘       ↓
                      │  req.url → city      │    fetch(wttr.in)
                      │  getWeather(city)    │          ↓
                      └──────────────────────┘    formatted string
```

The `getWeather(city)` function doesn't know or care who called it — Claude or a browser. It just takes a city name and returns a weather string. This separation of concerns is what makes the dual-transport design clean.

---

## 11. Phase 3: LLM Intent Parsing with Groq

### Why Groq instead of regex?

Phase 2's frontend used regex to detect keywords like "weather" or "nationality". Regex breaks the moment a user rephrases:

- `"pune ka weather kya hai"` → regex misses it (no English keyword)
- `"where is Ronen from?"` → regex misses "nationality"

Groq solves this with a real LLM that understands language, not patterns.

### How Groq works in this project

Groq (groq.com) is an AI inference platform. Their API is **OpenAI-compatible** — same SDK, different `baseURL` and API key format (`gsk_`).

```javascript
const grok = new OpenAI({
  apiKey: process.env.GROK_API_KEY,
  baseURL: 'https://api.groq.com/openai/v1',  // NOT api.x.ai (that's xAI Grok)
});
```

The `/parse` endpoint sends any user message to Groq with a tightly constrained system prompt:

```
You are an intent classifier. Respond with ONLY valid JSON:
{"type":"weather"|"nationality"|"unknown","entity":"<city or name>"}
```

`temperature: 0` makes the output deterministic — same input always produces the same JSON structure.

### The parse → route pattern

```
User: "amit ka nationality kya hai"
         ↓
/parse → Groq → { "type": "nationality", "entity": "amit" }
         ↓
frontend calls :3002/nationality?name=amit
         ↓
server.py → api.nationalize.io → ranked country list
         ↓
bot bubble: "The name amit is most likely from 🇮🇳 India (85%)..."
```

The `/parse` endpoint lives in `index.js` (not `server.py`) because it is a **shared router** — it handles intent classification for both weather and nationality, then the frontend decides which server to call.

### Why not put Groq in server.py as well?

`server.py` only ever receives a clean name string like `"amit"` — the frontend has already extracted it via Groq before calling `:3002`. There is no ambiguity left for server.py to resolve. One classifier, two data sources.

---

## 12. How the "MCP Source" Badge Proves Your Server Handled It

Every HTTP response from your server includes a `server` field injected by your own code:

```javascript
// index.js
res.end(JSON.stringify({ text, server: 'Weather Service (MCP · index.js)' }));
```

```python
# server.py
result["server"] = "Nationalize Service (MCP · server.py)"
```

The external APIs (wttr.in, api.nationalize.io) never return a `server` field. If you saw `server: "Weather Service (MCP · index.js)"` in the response, it could **only** have come from your `index.js`. The frontend displays this as the green badge.

If the servers are not running, the `fetch()` in the browser fails immediately with a network error — the "Could not reach server" message appears. There is no fallback to the external API directly.

---

## 13. File-by-File Reference

| File | What it is | What it does |
|------|-----------|-------------|
| `.vscode/mcp.json` | VSCode config | Spawns both servers; injects `GROK_API_KEY` env var into the weather server |
| `demo1-weather-server/index.js` | JS MCP server | Registers `getWeather` tool; `/parse` endpoint (Groq intent); HTTP on :3001; stdio |
| `demo1-weather-server/package.json` | Node config | `"type":"module"` enables ES imports; lists MCP SDK + Zod + openai deps |
| `demo2-nationalize-server/server.py` | Python MCP server | Registers `predict_nationality` tool; runs HTTP on :3002 in a thread |
| `demo2-nationalize-server/venv/` | Python venv | Isolated Python environment with `mcp` and `requests` installed |
| `frontend.html` | Browser chatbot | Single chat window; calls `/parse` → routes to `:3001/weather` or `:3002/nationality` |

---

## 14. What Runs Where

| Component | Runs on | Started by |
|-----------|---------|-----------|
| Claude LLM | Anthropic cloud | Anthropic (always on) |
| Groq LLM | Groq cloud | Called by your index.js `/parse` endpoint |
| VSCode + Claude extension | Your machine | You |
| `node index.js` | Your machine | VSCode via mcp.json (or manually) |
| `python server.py` | Your machine | VSCode via mcp.json (or manually) |
| `frontend.html` JS | Your browser | You (open the file) |
| wttr.in API | wttr.in servers | Called by your index.js |
| api.nationalize.io | nationalize.io servers | Called by your server.py |
| api.groq.com | Groq servers | Called by your index.js `/parse` handler |

---

## 15. What Each Layer "Knows"

| Layer | Knows about |
|-------|-------------|
| Claude (LLM) | Tool names, descriptions, schemas — NOT your code |
| Groq (LLM) | User's intent + entity — NOT weather data, NOT nationality data |
| MCP SDK (`McpServer`, `FastMCP`) | How to parse JSON-RPC, route calls, format responses — NOT your business logic |
| Your handler (`getWeather`, `predict_nationality`) | How to call the external API — NOT MCP, NOT Claude, NOT Groq |
| External APIs (wttr.in, nationalize.io) | Weather/nationality data — NOT MCP, NOT any LLM, NOT your code |
| `frontend.html` | localhost HTTP endpoints — NOT MCP, NOT Claude; uses Groq via `/parse` only for routing |

Each layer has one job. None of them need to know how the others work internally. This is the power of the MCP standard — you swap any layer without touching the others.

---

## 16. Summary: The Complete Request Lifecycle

```
USER PROMPT (Claude path)
─────────────────────────
You (VSCode chat)
  → Claude LLM (Anthropic cloud) decides to call tool
    → VSCode writes JSON to stdin of node index.js
      → MCP SDK parses message, runs Zod validation
        → getWeather("Tokyo") calls wttr.in
          → result flows back: code → MCP SDK → stdout → VSCode → Claude → you

BROWSER CHATBOT (Phase 3 path)
───────────────────────────────
You type: "pune ka weather kya hai" (frontend.html)
  → fetch("/parse?q=pune ka weather kya hai")  → index.js → Groq LLM
    → { type: "weather", entity: "pune" }
      → fetch("/weather?city=pune")  → index.js → wttr.in
        → { text: "The weather in Pune is...", server: "Weather Service (MCP · index.js)" }
          → chat bubble + ✓ MCP badge → you

You type: "what is nationality of Ronen"
  → fetch("/parse?q=...")  → index.js → Groq LLM
    → { type: "nationality", entity: "Ronen" }
      → fetch(":3002/nationality?name=Ronen")  → server.py → api.nationalize.io
        → { country: [...], server: "Nationalize Service (MCP · server.py)" }
          → chat bubble + ✓ MCP badge → you
```

**Groq** is involved only as a language router — it understands the question and extracts the entity. **Your MCP servers** own all the data. **Claude (Anthropic)** is not involved in the browser path at all.
