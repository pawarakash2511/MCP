import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { ListToolsRequestSchema, CallToolRequestSchema } from '@modelcontextprotocol/sdk/types.js';
import http from 'http';
import { URL } from 'url';

/*
 * This is a BRIDGE, not a hand-built server like demo1/demo2. The actual tool
 * logic (get_exchange_rate, convert_currency, etc.) lives entirely inside the
 * third-party npm package @skills-il/boi-exchange-mcp, which only speaks MCP
 * over stdio and has no HTTP endpoint of its own. So this file:
 *   1. Spawns that package as an internal MCP CLIENT (upstream)
 *   2. Re-exposes its exact tools to Claude/VSCode as a passthrough MCP SERVER (stdio)
 *   3. Also exposes a generic HTTP endpoint on :3003 for the browser frontend
 */

/* 1 - Spawn the real upstream package as an internal MCP client */
const upstreamTransport = new StdioClientTransport({
  command: 'npx',
  args: ['-y', '@skills-il/boi-exchange-mcp'],
});
const upstream = new Client({ name: 'boi-exchange-bridge-client', version: '1.0.0' });
await upstream.connect(upstreamTransport);

const { tools } = await upstream.listTools();
const toolsByName = new Map(tools.map((t) => [t.name, t]));

/* 2 - Passthrough MCP server — same tools/schemas as upstream, forwarded verbatim */
const server = new Server(
  { name: 'BOI Exchange Bridge', version: '1.0.0' },
  { capabilities: { tools: {} } }
);

server.setRequestHandler(ListToolsRequestSchema, async () => ({ tools }));
server.setRequestHandler(CallToolRequestSchema, async (request) => {
  return upstream.callTool(request.params);
});

/* Coerce HTTP query params into a tool's argument types using its own JSON Schema */
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

/* 3 - HTTP server on :3003 for the browser frontend */
http
  .createServer(async (req, res) => {
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
        try {
          payload = JSON.parse(raw);
        } catch {
          payload = { text: raw };
        }
        payload.server = 'BOI Exchange Service (MCP · demo3-boi-exchange-server/index.js)';
        return res.end(JSON.stringify(payload));
      }

      res.writeHead(404);
      res.end(JSON.stringify({ error: 'Not found' }));
    } catch (err) {
      res.writeHead(500);
      res.end(JSON.stringify({ error: err.message }));
    }
  })
  .listen(3003, () => {
    process.stderr.write('HTTP server on :3003\n');
  });

/* 4 - Transport for Claude/VSCode */
const serverTransport = new StdioServerTransport();
await server.connect(serverTransport);
process.stderr.write('BOI Exchange Bridge ready (stdio to Claude, HTTP on :3003, upstream via npx)\n');
