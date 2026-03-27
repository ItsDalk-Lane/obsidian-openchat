// English

export default {
	// Common
	Error: 'Error',
	user: 'user',
	system: 'system',
	assistant: 'assistant',
	newChat: 'newChat',
	'Conversion failed. Selected sections is a': 'Conversion failed. Selected sections is a',
	message: 'message',
	'Check the developer console for error details. ': 'Check the developer console for error details. ',
	'Cancel generation': 'Cancel generation',

	// commands/asstTag.ts
	'Regenerate?': 'Regenerate?',
	'This will delete the current response content. You can configure this in settings to not require confirmation.':
		'This will delete the current response content. You can configure this in settings to not require confirmation.',
	Yes: 'Yes',

	// commands/export.ts
	'Export conversations to JSONL': 'Export conversations to JSONL',
	'No conversation found': 'No conversation found',
	'Exported to the same directory, Obsidian does not display the JSONL format. Please open with another software.':
		'Exported to the same directory, Obsidian does not display the JSONL format. Please open with another software.',

	// commands/replaceTag.ts
	'Replace speaker with tag': 'Replace speaker with tag',
	'No speaker found': 'No speaker found',
	'Replace the names of the two most frequently occurring speakers with tag format.':
		'Replace the names of the two most frequently occurring speakers with tag format.',
	Replace: 'Replace',

	// commands/select.ts
	'Select message at cursor': 'Select message at cursor',
	'No message found at cursor': 'No message found at cursor',

	// providers
	'API key is required': 'API key is required',
	'API secret is required': 'API secret is required',
	'Model is required': 'Model is required',
	'API URL is required': 'API URL is required',
	'API key may be incorrect. Please check your API key.': 'API key may be incorrect. Please check your API key.',
	'Access denied. Please check your API permissions.': 'Access denied. Please check your API permissions.',
	'Provider not configured': 'Provider not configured. Please add it in OpenChat settings first.',
	'Text Generation': 'Text Generation',
	'Image Vision': 'Image Vision',
	'PDF Vision': 'PDF Vision',
	'Image Generation': 'Image Generation',
	'Image Editing': 'Image Editing',
	'Web Search': 'Web Search',
	Reasoning: 'Reasoning',
	'Only PNG, JPEG, GIF, and WebP images are supported.': 'Only PNG, JPEG, GIF, and WebP images are supported.',
	'Only PNG, JPEG, GIF, WebP, and PDF files are supported.': 'Only PNG, JPEG, GIF, WebP, and PDF files are supported.',

	// providers/gptImage.ts
	'Only the last user message is used for image generation. Other messages are ignored.':
		'Only the last user message is used for image generation. Other messages are ignored.',
	'Multiple embeds found, only the first one will be used': 'Multiple embeds found, only the first one will be used',
	'Only PNG, JPEG, and WebP images are supported for editing.':
		'Only PNG, JPEG, and WebP images are supported for editing.',
	'Embed data is empty or invalid': 'Embed data is empty or invalid',
	'Failed to generate image. no data received from API': 'Failed to generate image. no data received from API',

	// editor.ts
	'Please add a user message first, or wait for the user message to be parsed.':
		'Please add a user message first, or wait for the user message to be parsed.',
	'Waiting for metadata to be ready. Please try again.': 'Waiting for metadata to be ready. Please try again.',
	'No text generated': 'No text generated',
	characters: 'characters',

	// main.ts
	'Removed commands': 'Removed commands',
	'Added commands': 'Added commands',
	'No active generation to cancel': 'No active generation to cancel',
	'Generation already cancelled': 'Generation already cancelled',
	'Generation cancelled': 'Generation cancelled',

	// settingTab.ts
	'Restore default': 'Restore default',
	'AI assistants': 'AI assistants',
	'New AI assistant': 'Model provider',
	'For those compatible with the OpenAI protocol, you can select OpenAI.':
		'For those compatible with the OpenAI protocol, you can select OpenAI.',
	'Add AI Provider': 'Add model provider',
	'AI Provider': 'Model provider',
	'API protocol': 'API protocol',
	'Settings': 'Settings',
	'Save': 'Save',
	'Please select an option': 'Please select an option',
	'Please add at least one AI assistant to start using the plugin.':
		'Please add at least one AI assistant to start using the plugin.',
	'Please add a model first': 'Please add a model first',
	'Please select a model to test': 'Please select a model to test',
	'Please select an AI provider first': 'Please select a model provider first',
	'No models added yet': 'No models added yet',
	'Test model': 'Test model',
	'Test model description': 'Send a simple request to verify the current provider configuration.',
	'Test now': 'Test now',
	'Testing model...': 'Testing model...',
	'Model test succeeded': 'Model test passed',
	'Model test failed': 'Model test failed',
	'Vendor not found': 'Vendor not found',
	'Model test embed unsupported': 'Embeds are not supported during testing.',
	'Model test system prompt': 'You are verifying connectivity for the Obsidian OpenChat plugin.',
	'Model test user prompt': 'Please reply with a short confirmation message.',
	'Model test empty response': 'Model returned empty response during testing.',
	'Obtain key from ': 'Obtain key from ',
	'Web search': 'Web search',
	'Enable web search for AI': 'Enable web search for AI',
	'API key (required)': 'API key (required)',
	'API key (已设置)': 'API key (configured)',
	'API Secret (已设置)': 'API Secret (configured)',
	'Default:': 'Default:',
	'Refer to the technical documentation': 'Refer to the technical documentation',
	Model: 'Model',
	'Supported features': 'Supported features',
	'Select the model to use': 'Select the model to use',
	'Custom': 'Custom',
	'Custom model name': 'Custom model name',
	'Enter custom model name': 'Enter custom model name',
	'Back to preset models': 'Back to preset models',
	'Switch to custom input': 'Switch to custom input',
	'Switch to model selection': 'Switch to model selection',
	'Please input API key first': 'Please input API key first',
	'Please enter a number': 'Please enter a number',
	'Minimum value is 256': 'Minimum value is 256',
	'Invalid URL': 'Invalid URL',
	'Override input parameters': 'Override input parameters',
	'Developer feature, in JSON format. For example, if the model list doesn\'t have the model you want, enter {"model": "your desired model"}':
		'Developer feature, in JSON format. For example, if the model list doesn\'t have the model you want, enter {"model": "your desired model"}',
	'Advanced parameters in JSON format. For other parameters besides model (e.g., temperature, top_p, etc.). Model name should be set in the Model field above.':
		'Advanced parameters in JSON format. For other parameters besides model (e.g., temperature, top_p, etc.). Model name should be set in the Model field above.',
	'Additional parameters': 'Additional parameters',
	'Additional parameters description':
		'Set additional API parameters in JSON format (e.g., temperature, top_p, max_tokens). Note: Do not set the model parameter here.',
	'Additional parameters modal hint':
		'Enter additional parameters in JSON format.\nYou can provide common fields such as temperature, top_p, max_tokens, presence_penalty, and frequency_penalty.\nDo not set model here; configure the model in the model section above.',
	'Additional parameters modal placeholder': '{\n  "temperature": 0.7,\n  "top_p": 0.9,\n  "max_tokens": 2000\n}',
	'Invalid JSON format': 'Invalid JSON format',
	'Please set model in the Model field above, not here': 'Please set model in the Model field above, not here',
	'Context length': 'Context length',
	'Context length description': 'Set the context length (tokens) supported by the model, used for context management and message truncation.',
	'Common parameters example': 'Common parameters example: {"temperature": 0.7, "top_p": 0.9, "max_tokens": 2000}',
	'Remove AI assistant': 'Remove AI assistant',
	Remove: 'Remove',
	Endpoint: 'Endpoint',
	'API version': 'API version',
	'Select assistant': 'Select assistant',
	'Model identifier must be unique': 'Model identifier must be unique',

	'Internal links': 'Internal links',
	'Internal links in user and system messages will be replaced with their referenced content. When disabled, only the original text of the links will be used.':
		'Internal links in user and system messages will be replaced with their referenced content. When disabled, only the original text of the links will be used.',

	// Advanced settings
	'System message': 'System message',
	'Enable default system message': 'Enable default system message',
	'Automatically add a system message when none exists in the conversation':
		'Automatically add a system message when none exists in the conversation',
	'Default system message': 'Default system message',
	Advanced: 'Advanced',

	// gpt image settings
	'Image settings': 'Image settings',
	'Image Display Width': 'Image Display Width',
	'Example: 400px width would output as ![[image.jpg|400]]': 'Example: 400px width would output as ![[image.jpg|400]]',
	'Number of images': 'Number of images',
	'Number of images to generate (1-5)': 'Number of images to generate (1-5)',
	'Image size': 'Image size',
	landscape: 'landscape',
	portrait: 'portrait',
	'Output format': 'Output format',
	Quality: 'Quality',
	'Quality level for generated images. default: Auto': 'Quality level for generated images. default: Auto',
	Auto: 'Auto',
	Enabled: 'Enabled',
	High: 'High',
	Medium: 'Medium',
	Low: 'Low',
	Background: 'Background',
	'Background of the generated image. default: Auto': 'Background of the generated image. default: Auto',
	Transparent: 'Transparent',
	Opaque: 'Opaque',
	'Output compression': 'Output compression',
	'Compression level of the output image, 10% - 100%. Only for webp or jpeg output format':
		'Compression level of the output image, 10% - 100%. Only for webp or jpeg output format',

	// suggest.ts
	'AI generate': 'AI generate',
	'Text generated successfully': 'Text generated successfully',
	'This is a non-streaming request, please wait...': 'This is a non-streaming request, please wait...',

	// Claude thinking settings
	Thinking: 'Thinking',
	'When enabled, Claude will show its reasoning process before giving the final answer.':
		'When enabled, Claude will show its reasoning process before giving the final answer.',
	'Budget tokens for thinking': 'Budget tokens for thinking',
	'Must be ≥1024 and less than max_tokens': 'Must be ≥1024 and less than max_tokens',
	'Minimum value is 1024': 'Minimum value is 1024',

	// Doubao thinking settings
	'Doubao thinking mode': 'Doubao thinking mode',
	'Select a model first to configure deep thinking.': 'Select a model first to configure deep thinking.',
	'Select a model first': 'Select a model first',
	'Current model does not support configuring deep thinking.':
		'Current model does not support configuring deep thinking.',
	'Not supported': 'Not supported',
	'Force enable deep thinking': 'Force enable deep thinking',
	'Force disable deep thinking': 'Force disable deep thinking',
	'Let the model decide deep thinking automatically': 'Let the model decide deep thinking automatically',
	'Disable reasoning and reply directly': 'Disable reasoning and reply directly',
	'Always enable deep reasoning': 'Always enable deep reasoning',
	'Let the model decide whether to use reasoning': 'Let the model decide whether to use reasoning',
	'Control whether the Doubao model performs deep thinking before answering.':
		'Control whether the Doubao model performs deep thinking before answering.',
	'Reasoning effort': 'Reasoning effort',
	'Adjust how long the model thinks before answering. Only available when deep thinking is enabled.':
		'Adjust how long the model thinks before answering. Only available when deep thinking is enabled.',
	'Minimal reasoning (direct answer)': 'Minimal reasoning (direct answer)',
	'Low reasoning (quick response)': 'Low reasoning (quick response)',
	'Medium reasoning (balanced)': 'Medium reasoning (balanced)',
	'High reasoning (deep analysis)': 'High reasoning (deep analysis)',
	'Reasoning is supported (metadata)': 'This model is confirmed by official metadata to support reasoning.',
	'Reasoning is supported (probe)': 'This model was confirmed by a manual probe to support reasoning.',
	'Reasoning is supported': 'This model supports reasoning.',
	'Reasoning is unsupported (metadata)': 'Official metadata marks this model as not supporting reasoning.',
	'Reasoning is unsupported (probe)': 'A manual probe determined that this model does not support reasoning.',
	'Reasoning is unsupported': 'This model does not support reasoning.',
	'Reasoning is unknown': 'Reasoning capability has not been verified yet (enabled by default). Click "Reasoning test" for a more accurate result.',
	'Enable reasoning feature': 'Enable reasoning',
	'Enable reasoning feature description': 'When enabled, the model will show its reasoning process. Reasoning content will be wrapped in [!quote] blocks.',
	'Reasoning capability probe': 'Reasoning capability probe',
	'Reasoning capability probe description': 'Manually probe whether the current model supports reasoning. The result is cached for 7 days.',
	'Probe reasoning capability': 'Reasoning test',
	'Probing reasoning capability...': 'Probing...',
	'Reasoning capability probe failed': 'Reasoning capability probe failed',
	'Reasoning mode notice': 'Reasoning mode ({effort}) - Model: {model}',
	'Image generation mode': 'Image generation mode',
	'Web search mode': 'Web search mode',
	'Delete action group confirmation': 'Delete action group',
	'Action group delete dialog body': 'This action group contains {count} child actions (including nested ones). Choose how to delete it:',
	'Keep child actions': 'Keep child actions (move them to top level)',
	'Delete child actions': 'Delete child actions',
	'Action group members': 'Action group members',
	'Action group members hint': 'Add existing actions/groups here, or create new ones and include them.',
	'No action group members yet': 'No members yet (can be empty)',
	'Add action group': '+ Add Action Group',

	// statusBarManager.ts
	'AI Generation Details': 'AI Generation Details',
	Round: 'Round',
	Duration: 'Duration',
	'Start Time': 'Start Time',
	'End Time': 'End Time',
	'Error Details': 'Error Details',
	'Error Type': 'Error Type',
	'Error Message': 'Error Message',
	'Occurrence Time': 'Occurrence Time',
	'Stack Trace': 'Stack Trace',
	'Copy Error Info': 'Copy Error Info',
	'Error info copied to clipboard': 'Error info copied to clipboard',
	'Unknown Error': 'Unknown Error',
	'OpenChat AI runtime is ready': 'OpenChat AI runtime is ready',
	'Generating round': 'Generating round',
	'answer...': 'answer...',
	'Generating...': 'Generating...',
	'Click status bar for error details. ': 'Click status bar for error details. ',
	Vendor: 'Vendor',
	Characters: 'Characters',

	'Enable AI runtime feature': 'Enable AI assistant feature',
	'AI runtime feature disabled description': 'Enable the feature above to configure AI assistants.',

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
	'Tab completion prompt template': 'Tab completion prompt template',
	'Tab completion prompt template description': 'Template used to build the user message sent to AI. Available placeholders: {{rules}} and {{context}}.',
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
