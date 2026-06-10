import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod'; // for schema validation

/* 1 - Initialization */
const server = new McpServer({
  name: 'Weather Service',
  version: '1.0.0',
});

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
    // fetch data from weather api (wttr.in is free, no API key needed)
    const res = await fetch(
      `https://wttr.in/${encodeURIComponent(city)}?format=j1`
    );
    const data = await res.json();
    const current = data.current_condition[0];

    return {
      content: [
        {
          type: 'text',
          text:
            `The weather in ${city} is ${current.weatherDesc[0].value}, ` +
            `${current.temp_C}°C (feels like ${current.FeelsLikeC}°C), ` +
            `humidity ${current.humidity}%.`,
        },
      ],
    };
  }
);

/* 4 - Transport */
// Start STDIO transport (best for local dev)
const transport = new StdioServerTransport();
await server.connect(transport);