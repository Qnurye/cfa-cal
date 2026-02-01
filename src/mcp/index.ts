// MCP Server setup for CFA Calendar
// Initializes the MCP server and registers all tools, resources, and prompts

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { createMcpHandler } from 'agents/mcp';
import type { Env } from '../types';
import { registerTools } from './tools';
import { registerResources } from './resources';
import { registerPrompts } from './prompts';

/**
 * Create and configure the MCP server
 */
function createMcpServer(env: Env): McpServer {
  const server = new McpServer({
    name: 'CFA Calendar',
    version: '1.0.0',
  });

  // Register all components
  registerTools(server, env);
  registerResources(server, env);
  registerPrompts(server);

  return server;
}

/**
 * Create the MCP request handler for use with Hono/Workers
 */
export function createMcpRequestHandler(env: Env, ctx: ExecutionContext) {
  const server = createMcpServer(env);

  const handler = createMcpHandler(server, {
    route: '/mcp',
    corsOptions: {
      origin: '*',
      methods: 'GET, POST, DELETE, OPTIONS',
      headers: 'Content-Type, Authorization, Mcp-Session-Id',
    },
  });

  return handler;
}

/**
 * Handle an MCP request
 */
export async function handleMcpRequest(
  request: Request,
  env: Env,
  ctx: ExecutionContext
): Promise<Response> {
  const handler = createMcpRequestHandler(env, ctx);
  return handler(request, env, ctx);
}
