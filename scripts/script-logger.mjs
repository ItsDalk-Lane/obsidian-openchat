import process from "node:process";

const VERBOSE_TRUE_VALUES = new Set(["1", "true", "yes", "on"]);

function isVerboseEnabled() {
	const rawValue = process.env.OPENCHAT_SCRIPT_VERBOSE ?? process.env.OPENCHAT_VERBOSE;
	if (typeof rawValue !== "string") {
		return false;
	}

	return VERBOSE_TRUE_VALUES.has(rawValue.trim().toLowerCase());
}

function writeLine(stream, prefix, message) {
	stream.write(`${prefix} ${String(message)}\n`);
}

export function createScriptLogger(scope) {
	const prefix = `[openchat][${scope}]`;

	return {
		info(message) {
			writeLine(process.stdout, prefix, message);
		},
		error(message) {
			writeLine(process.stderr, prefix, message);
		},
		verbose(message) {
			if (isVerboseEnabled()) {
				writeLine(process.stdout, prefix, message);
			}
		}
	};
}