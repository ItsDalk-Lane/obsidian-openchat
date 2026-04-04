import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { App } from 'obsidian';
import {
	BUILTIN_FILESYSTEM_SERVER_ID,
	BUILTIN_FILESYSTEM_SERVER_NAME,
} from '../runtime/constants';
import { BuiltinToolRegistry, type BuiltinToolInfo } from '../runtime/tool-registry';
import { registerReadWriteHandlers } from './filesystemReadWriteHandlers';
import { registerSearchHandlers } from './filesystemSearchHandlers';
import { registerFilesystemWrapperTools } from './filesystemWrapperTools';

export interface FilesystemBuiltinRuntime {
	serverId: string;
	serverName: string;
	client: Client;
	callTool: (name: string, args: Record<string, unknown>) => Promise<string>;
	listTools: () => Promise<BuiltinToolInfo[]>;
	close: () => Promise<void>;
}
const formatToolError = (error: unknown): string =>
	`[工具执行错误] ${error instanceof Error ? error.message : String(error)}`;
export async function createFilesystemBuiltinRuntime(
	app: App
): Promise<FilesystemBuiltinRuntime> {
	const registry = new BuiltinToolRegistry();
	registerFilesystemTools(app, registry);
	let closed = false;

	const context = {
		app,
		callTool: async (): Promise<unknown> => {
			throw new Error('filesystem runtime 不支持跨工具调用');
		},
	};

	const close = async (): Promise<void> => {
		closed = true;
		registry.clear();
	};

	return {
		serverId: BUILTIN_FILESYSTEM_SERVER_ID,
		serverName: BUILTIN_FILESYSTEM_SERVER_NAME,
		client: {} as Client,
		callTool: async (name: string, args: Record<string, unknown>) => {
			if (closed) {
				throw new Error('Filesystem builtin runtime 已关闭');
			}
			const result = await registry.execute(name, args, context);
			return result.status === 'completed'
				? result.serializedResult
				: formatToolError(result.content);
		},
		listTools: async () => {
			if (closed) {
				throw new Error('Filesystem builtin runtime 已关闭');
			}
			return registry.listTools(BUILTIN_FILESYSTEM_SERVER_ID);
		},
		close,
	};
}
export function registerFilesystemBuiltinTools(
	server: McpServer,
	app: App,
	registry: BuiltinToolRegistry
): void {
	registerReadWriteHandlers(server, app, registry);
	registerFilesystemWrapperTools(server, app, registry);
	registerSearchHandlers(server, app, registry);
}

export function registerFilesystemTools(
	app: App,
	registry: BuiltinToolRegistry
): void {
	const noopServer = {
		registerTool: () => undefined,
	} as unknown as McpServer;
	registerFilesystemBuiltinTools(noopServer, app, registry);
}
