import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod'; // for schema validation
import http from 'http';
import { URL } from 'url';

/* 1 - Initialization */
const server = new McpServer({
  name: 'Weather Service',
  version: '1.0.0',
});

/* Shared weather logic — used by both the MCP tool and the HTTP server */
async function getWeather(city) {
  const res = await fetch(
    `https://wttr.in/${encodeURIComponent(city)}?format=j1`
  );
  const data = await res.json();
  const current = data.current_condition[0];
  return (
    `The weather in ${city} is ${current.weatherDesc[0].value}, ` +
    `${current.temp_C}°C (feels like ${current.FeelsLikeC}°C), ` +
    `humidity ${current.humidity}%.`
  );
}

/* 2 - Tool Definition */
server.tool(
  'getWeather', // Unique tool name
  'Get the current weather for a given city', // Tool description
  {
    // Check that city is at least 2 characters long and provide a description
    // for better documentation
    city: z.string().min(2).describe('Name of the city to get the weather for'),
  },
  /* 3 - Implementation */
  async ({ city }) => {
    const text = await getWeather(city);
    return { content: [{ type: 'text', text }] };
  }
);

/* 4 - HTTP server on port 3001 for the browser frontend */
http.createServer(async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
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

/* 5 - Transport */
// Start STDIO transport (best for local dev)
const transport = new StdioServerTransport();
await server.connect(transport);