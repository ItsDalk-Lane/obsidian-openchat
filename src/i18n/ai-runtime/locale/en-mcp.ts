export default {
	// MCP
	'MCP Servers': 'MCP Servers',
	'Enable MCP': 'Enable MCP',
	'Enable MCP description': 'When enabled, AI chat and form actions can use tools provided by MCP servers',
	'No MCP servers configured': 'No MCP servers configured. Click + to add or import mcp.json.',
	'Add MCP server': 'Add MCP Server',
	'Edit MCP server': 'Edit MCP Server',
	'Import MCP config': 'Import MCP Config',
	'Import mcp.json': 'Import mcp.json',
	'MCP server name': 'Name',
	'MCP server name desc': 'A name to identify this MCP server',
	'MCP transport type': 'Transport Type',
	'MCP command': 'Command',
	'MCP command desc': 'Command to start the MCP server',
	'MCP args': 'Arguments',
	'MCP args desc': 'Comma-separated command line arguments',
	'MCP env': 'Environment Variables',
	'MCP env desc': 'KEY=VALUE pairs, one per line',
	'MCP cwd': 'Working Directory',
	'MCP cwd desc': 'Optional process working directory',
	'MCP transport stdio': 'Stdio (Local Process)',
	'MCP transport sse legacy': 'SSE (Legacy Local Process)',
	'MCP transport websocket': 'WebSocket (Remote)',
	'MCP transport http': 'HTTP (Remote Request)',
	'MCP transport remote sse': 'Remote SSE (Event Stream)',
	'MCP websocket url': 'WebSocket URL',
	'MCP url': 'URL',
	'MCP url desc': 'Remote MCP service endpoint URL',
	'MCP headers': 'Headers',
	'MCP headers desc': 'Custom HTTP headers in key/value pairs (e.g. Authorization)',
	'MCP add header': 'Add Header',
	'MCP remove header': 'Remove',
	'MCP header key placeholder': 'Header Name',
	'MCP header value placeholder': 'Header Value',
	'MCP timeout': 'Timeout (ms)',
	'MCP timeout desc': 'Maximum wait time for connection and requests',
	'MCP status idle': 'Idle',
	'MCP status connecting': 'Connecting...',
	'MCP status running': 'Running',
	'MCP status stopping': 'Stopping...',
	'MCP status stopped': 'Stopped',
	'MCP status error': 'Error',
	'MCP import success': 'Import successful',
	'MCP import failed': 'Import failed',
	'MCP server name required': 'Please enter server name',
	'MCP command required': 'Please enter command',
	'MCP url required': 'Please enter URL',
	'Vendor API keys': 'Vendor API keys',
	'Vendor API keys description': 'Configure API keys by vendor here. New models from the same vendor will reuse this key automatically.',
	'Vendor API key empty description': 'Leave empty to avoid configuring a key for this vendor on the current device',
	'API key': 'API key',
	'API Secret': 'API Secret',
	'Show or hide secret': 'Show or hide secret',
	'Select action or action group to add': 'Select action or action group to add...',
	'No local models detected': 'No local models detected',
	'Click to scan local models': 'Click to scan local models',
	'AI Tab completion': 'AI Tab completion',
	'Enable Tab completion': 'Enable Tab completion',
	'Enable Tab completion description': 'Press Alt to trigger AI continuation suggestions. Press Alt again or Enter to accept, and Esc or any other key to cancel.',
	'Tab completion trigger key': 'Trigger hotkey',
	'Tab completion trigger key description': 'Hotkey used to trigger Tab completion',
	'Alt key': 'Alt key',
	'Tab completion AI provider': 'Tab completion AI provider',
	'Tab completion AI provider description': 'Choose the AI provider used for Tab completion. Leave empty to use the first available provider.',
	'Auto select first available': 'Auto select (first available)',
	'Tab completion context before': 'Context length (before cursor)',
	'Tab completion context before description': 'Number of characters before the cursor sent to AI',
	'Tab completion context after': 'Context length (after cursor)',
	'Tab completion context after description': 'Number of characters after the cursor sent to AI',
	'Tab completion timeout': 'Request timeout',
	'Tab completion timeout description': 'Maximum wait time for AI requests in seconds',
	'Tab completion system prompt': 'System prompt',
	'Tab completion system prompt description': 'System prompt sent to the AI model before the editor context. Leave empty to skip system-level instructions.',
	'Tab completion system prompt edit btn': 'Edit',
	'Tab completion system prompt modal title': 'Tab Completion System Prompt',
	'Tab completion system prompt placeholder': 'Enter the system prompt for Tab completion (leave empty to skip injection)...',
	'Debug mode': 'Debug mode',
	'Debug mode description': 'When enabled, debug logs will be printed to the console. Reload the plugin after changing this setting.',
	'LLM console log': 'LLM console log (messages / response preview)',
	'LLM console log description': 'Independent from debug mode: print each model call messages array and response preview to the console.',
	'LLM response preview length': 'LLM response preview length',
	'LLM response preview length description': 'Number of characters shown from the AI response in console output (default: 100)',
	'Debug log level': 'Debug log level',
	'Debug log level description': 'Choose the minimum log level to output. debug=all, info=info and above, warn=warnings and above, error=errors only',
	'Doubao image detail': 'Image detail (detail)',
	'Doubao image detail description':
		'Controls how precisely the model understands images. Low resolution is faster; high resolution captures more detail. Leave empty to use the API default.',
	'Unset (use default)': 'Unset (use default)',
	'Low resolution (faster)': 'Low resolution (faster)',
	'High resolution (more detail)': 'High resolution (more detail)',
	'Doubao min pixels': 'Minimum image pixels (min_pixels)',
	'Doubao min pixels description':
		'Minimum pixels for image understanding (196-36000000). Leave empty or 0 to unset. Higher priority than the detail field.',
	'Doubao max pixels': 'Maximum image pixels (max_pixels)',
	'Doubao max pixels description':
		'Maximum pixels for image understanding (196-36000000). Leave empty or 0 to unset. Higher priority than the detail field.',
	'For example: 3136': 'For example: 3136',
	'For example: 1048576': 'For example: 1048576',
	'Supports preset resolutions (1K/2K/4K) or exact pixel values':
		'Supports preset resolutions (1K/2K/4K) or exact pixel values',
	'Image response format': 'Image response format',
	'Choose how to receive generated images': 'Choose how to receive generated images.',
	'Base64 JSON (recommended)': 'Base64 JSON (recommended)',
	'Group image generation': 'Group image generation',
	'Group image generation description':
		'When enabled, the model can generate multiple related images from a single prompt.',
	'Disabled (single image output)': 'Disabled (single image output)',
	'Auto (group image output)': 'Auto (group image output)',
	'Maximum image count': 'Maximum image count',
	'Maximum image count description':
		'Maximum number of images in group mode (1-15). Note: reference images + generated images must be less than or equal to 15.',
	'Streaming output': 'Streaming output',
	'Streaming output description':
		'When enabled, each image is returned as soon as it is generated instead of waiting for the full batch. This may increase processing time.',
	'Prompt optimization mode': 'Prompt optimization mode',
	'Prompt optimization mode description':
		'Standard mode has better quality but takes longer. Fast mode is quicker but lower quality.',
	'Standard mode (recommended)': 'Standard mode (recommended)',
	'Fast mode': 'Fast mode',
	Watermark: 'Watermark',
	'Add watermark to generated images': 'Add a watermark to generated images.',
	'Search engine': 'Search engine',
	'Search engine description':
		'Choose the search engine. Auto uses native for OpenAI/Anthropic and Exa for other providers.',
	'Auto select (recommended)': 'Auto (recommended)',
	'Native search': 'Native search',
	'General search with Exa': 'Exa (general search)',
	'Search result count': 'Search result count',
	'Search result count description':
		'Controls how many search results are returned (1-10). More results may provide broader coverage but cost more tokens.',
	'Custom search prompt': 'Custom search prompt',
	'Custom search prompt description':
		'Custom text added before search results. Leave empty to use the default prompt.',
	'Default web search prompt':
		'A web search was conducted on {date}. Incorporate the following web search results into your response.\n\nIMPORTANT: Cite them using markdown links.',
	'Parameter scope': 'Parameter scope',
	'OpenRouter image parameter scope description':
		'These image parameters apply only to OpenRouter models that support image generation. Text models ignore them.',
	'Image aspect ratio': 'Image aspect ratio',
	'Image aspect ratio description':
		'Choose the aspect ratio for generated images. Each ratio maps to a different pixel size.',
	'Streaming image generation': 'Streaming image generation',
	'Streaming image generation description':
		'When enabled, image generation results are returned as a stream. Some models can show intermediate progress.',
	'Image response format description':
		'Choose the format returned for generated images. This writes the response_format field and only applies to image generation models.',
	'Image save as attachment': 'Save images as attachments',
	'Image save as attachment description':
		'Choose whether generated images are saved as attachments. When disabled, URL or Base64 data is returned directly.',
	'Image display width description pixels': 'Set the display width of images in notes (pixels).',
	Minimal: 'Minimal',
	'Medium (recommended)': 'Medium (recommended)',
	'OpenRouter reasoning effort description':
		'Only applies when reasoning is enabled and the model uses the Responses API. Higher levels think longer and consume more tokens.',
	'Zhipu thinking type': 'Thinking type',
	Disabled: 'Disabled',
	'Zhipu thinking type description': 'Controls the reasoning behavior of Zhipu AI models. ',
	'Zhipu structured output': 'Structured Output',
	'Zhipu structured output description':
		'When enabled, the model will output JSON format. Useful for programmatic processing, data extraction, and API integration.',
	'Model compatibility hint': 'Model compatibility hint',
	'Qwen thinking mode': 'Thinking mode',
	'Qwen thinking mode description':
		'Enable reasoning output for Qwen models. When enabled, the model shows its thinking process before the final answer. All models can attempt this and the API handles compatibility automatically.',
	'Qwen thinking mode note': 'Thinking mode note',
	'Qwen thinking mode note description':
		'Verified models that support thinking mode: {models}. Other models may also support it, and the API will handle compatibility automatically.',
	'Enable deep thinking': 'Enable deep thinking',
	'QianFan deep thinking description':
		'When enabled, QianFan sends enable_thinking=true and shows reasoning_content in streaming responses.',
	'Image response format description qianfan':
		'Only applies to image generation models (such as qwen-image and flux-1-schnell). Writes the response_format field.',
	'Images per request': 'Images per request',
	'Images per request description':
		'Only applies to image generation models and maps to the n parameter of images/generations.',
	'Image display width description attachment only':
		'Only applies when image generation results are saved as attachments.',
	'OpenAI reasoning description':
		'When enabled, OpenAI prefers the Responses API and shows reasoning. When disabled, it uses the chat.completions compatibility path.',
	'Poe reasoning description':
		'When enabled, Poe requests reasoning through the Responses API and shows the reasoning process.',
	'Azure reasoning description':
		'When enabled, Azure prefers official reasoning event parsing from the Responses API. When disabled, it uses the chat.completions compatibility path.',
	'Doubao Responses API is not supported for this model':
		'This Doubao model does not support the Responses API.',
	'Doubao Responses missing tool executor':
		'Doubao Responses returned a function call, but no tool executor is configured.',
	'Doubao tool loop exceeded maximum iterations':
		'Doubao tool loop exceeded the maximum iterations ({count}).',
	'Doubao Responses missing response id':
		'Doubao Responses did not return a response id, so the tool loop could not continue.',
	'Debug log level debug option': 'Debug (all)',
	'Debug log level info option': 'Info',
	'Debug log level warn option': 'Warn',
	'Debug log level error option': 'Error',
	'Action group short label': 'Grp',
	'Action short label': 'Act',
	'Action group option prefix': '[Group] ',
	'Action option prefix': '[Action] ',
	'Custom prompt role': 'Custom prompt role',
	'System message role': 'System message',
	'User message role': 'User message',
	'Delete provider': 'Delete provider',
	'No models available from remote endpoint or fallback list':
		'No models available from the remote endpoint or fallback list.',
	'Failed to load models. Please try again later.':
		'Failed to load models. Please try again later.',
	'Chat session saved': 'Chat session saved',
	'Provider settings saved': 'Provider settings saved',
	'Generation failed. Please try again later.': 'Generation failed. Please try again later.',
	'{mode} mode does not support parameter {field}': '{mode} mode does not support parameter {field}',
	'{mode} mode does not support start_line; it was removed automatically. Use segment mode for line-offset reads.':
		'{mode} mode does not support start_line; it was removed automatically. Use segment mode for line-offset reads.',
	'Vault mode only supports traversing from the Vault root. Omit directory_path or pass /.':
		'Vault mode only supports traversing from the Vault root. Omit directory_path or pass /.',
	'select.fields or select.aggregates must provide at least one item':
		'select.fields or select.aggregates must provide at least one item',
	'{aggregate} aggregate requires field': '{aggregate} aggregate requires field',
	'operator=in requires value to be an array': 'operator=in requires value to be an array',
	'operator={operator} does not accept an array value':
		'operator={operator} does not accept an array value',
	'[Notice] {message}': '[Notice] {message}',
	'[More content available. Continue from line {line}]':
		'[More content available. Continue from line {line}]',
	'{mode} was converted to read_mode={mode} and line_count':
		'{mode} was converted to read_mode={mode} and line_count',
	'{mode} mode does not accept start_line; it was removed automatically':
		'{mode} mode does not accept start_line; it was removed automatically',
	'full mode does not accept start_line; use segment for long files':
		'full mode does not accept start_line; use segment for long files',
	'head mode does not accept start_line; use segment to read from a specific line':
		'head mode does not accept start_line; use segment to read from a specific line',
	'tail mode does not accept start_line; use segment to read from a specific line':
		'tail mode does not accept start_line; use segment to read from a specific line',
	'Read content once the file path is known. Use segment for long files; if you only know the name, call find_paths first.':
		'Read content once the file path is known. Use segment for long files; if you only know the name, call find_paths first.',
	'max_chars has been removed; use read_mode + line_count to control the range':
		'max_chars has been removed; use read_mode + line_count to control the range',
	'Use this to preview multiple known file paths. For a single long document, use read_file.':
		'Use this to preview multiple known file paths. For a single long document, use read_file.',
	'max_chars has been removed; batch reads now use read_mode + line_count':
		'max_chars has been removed; batch reads now use read_mode + line_count',
	'Use this only for known media file paths.': 'Use this only for known media file paths.',
	'Use this for whole-file writes or overwrites; use edit_file for partial edits.':
		'Use this for whole-file writes or overwrites; use edit_file for partial edits.',
	'Use this for partial edits to known files; read with read_file first.':
		'Use this for partial edits to known files; read with read_file first.',
	'Use this for minimal partial edits to known files; keep edits narrowly scoped and read the target segment with read_file first when needed.':
		'Use this for minimal partial edits to known files; keep edits narrowly scoped and read the target segment with read_file first when needed.',
	'Failed to move action. Please try again.':
		'Failed to move action. Please try again.',
	'Failed to keep child actions. Please try again.':
		'Failed to keep child actions. Please try again.',
	'Failed to delete child actions. Please try again.':
		'Failed to delete child actions. Please try again.',
	'MCP connection failed ({name})': 'MCP connection failed ({name})',
	'Tool call failed: {message}': 'Tool call failed: {message}',
	'Poe Responses missing tool executor':
		'Poe Responses returned function_call, but no tool executor is configured.',
	'Poe tool loop exceeded maximum iterations':
		'Poe tool loop exceeded maximum iterations ({count}).',
	'Poe Responses missing response id':
		'Poe Responses did not return response.id, so the tool loop cannot continue.',
	'Poe upstream provider returned 5xx. Try switching to Claude-Sonnet-4.5 or GPT-5.2 and retry.':
		'Poe upstream provider returned 5xx. Try switching to Claude-Sonnet-4.5 or GPT-5.2 and retry.',
	'Poe response body is not readable': 'Poe response body is not readable',
	'Invalid base64 data': 'Invalid base64 data',
	'Image exceeds the 20MB limit': 'Image exceeds the 20MB limit',
	'Image download timed out': 'Image download timed out',
	'Failed to download image ({status})': 'Failed to download image ({status})',
	'Image save failed: {message}': 'Image save failed: {message}',
	'API returned an incomplete response. Content may be truncated.':
		'API returned an incomplete response. Content may be truncated.',
	'Failed to parse response: {message}': 'Failed to parse response: {message}',
	'Structured output': 'Structured Output',
	'Structured output description':
		'When enabled, the model will output JSON format. Useful for programmatic processing, data extraction, and API integration.',
	'Provider has API key': 'API key configured',
} as const
