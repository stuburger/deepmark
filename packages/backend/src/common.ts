export const McpErrorCodes = {
	// Standard JSON-RPC error codes
	ConnectionClosed: -32000,
	RequestTimeout: -32001,
	ParseError: -32700,
	InvalidRequest: -32600,
	MethodNotFound: -32601,
	InvalidParams: -32602,
	InternalError: -32603,
} as const
