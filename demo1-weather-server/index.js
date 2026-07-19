import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod'; // for schema validation
import http from 'http';
import { URL } from 'url';
import OpenAI from 'openai';

/* Groq client — OpenAI-compatible API (gsk_ keys → api.groq.com) */
const grok = new OpenAI({
  apiKey: process.env.GROK_API_KEY || '',
  baseURL: 'https://api.groq.com/openai/v1',
});

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

/* Grok intent parser — understands any natural language query */
async function parseIntent(userMessage) {
  const today = new Date().toISOString().slice(0, 10); // YYYY-MM-DD, for resolving "today"/"last week" etc.

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
- "weather"     → user is asking about weather, temperature, climate, forecast, rain, humidity of a city/place. entity = city name.
- "nationality" → user is asking about nationality, origin, country, ethnicity of a person's name. entity = person name.
- "exchange"    → user is asking about currency exchange rates, converting money, historical rates, or which currencies are supported (Bank of Israel / ILS data). Pick exactly one "tool" and fill "args" with ONLY that tool's fields, using 3-letter ISO 4217 currency codes (e.g. USD, EUR, GBP) and YYYY-MM-DD dates:
  - "get_exchange_rate"    → args: {"currency": "<code>"} — latest rate for a currency vs ILS
  - "convert_currency"     → args: {"amount": <number>, "fromCurrency": "<code>", "toCurrency": "<code>"} — one of fromCurrency/toCurrency must be "ILS"
  - "get_historical_rates" → args: {"currency": "<code>", "startDate": "YYYY-MM-DD", "endDate": "YYYY-MM-DD"} — daily rates over a range
  - "get_rate_change"      → args: {"currency": "<code>", "startDate": "YYYY-MM-DD", "endDate": "YYYY-MM-DD"} — change between two dates
  - "list_currencies"      → args: {} — no fields needed
- "unknown"     → anything else
- entity is only used for weather/nationality; leave it "" for exchange and unknown.
- tool/args are only used for exchange; leave tool "" and args {} for weather/nationality/unknown.`,
      },
      { role: 'user', content: userMessage },
    ],
    temperature: 0,
  });
  const raw = completion.choices[0].message.content.trim();
  return JSON.parse(raw);
}

/* 4 - HTTP server on port 3001 for the browser frontend */
http.createServer(async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Content-Type', 'application/json');

  try {
    const { pathname, searchParams } = new URL(req.url, 'http://localhost');

    if (pathname === '/parse') {
      const q = searchParams.get('q') || '';
      if (!q) {
        res.writeHead(400);
        return res.end(JSON.stringify({ error: 'q parameter required' }));
      }
      const intent = await parseIntent(q);
      return res.end(JSON.stringify(intent));
    }

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