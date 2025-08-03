import { spawn } from "node:child_process";
import { createReadStream, existsSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import pc from "picocolors";
import { HOME_DIR } from "../constants.js";

interface LogsOptions {
	follow?: boolean;
	lines?: string;
}

const LOG_FILE = join(HOME_DIR, "claude-code-router.log");

export async function showLogs(options: LogsOptions) {
	const lineCount = Number.parseInt(options.lines || "50");

	if (Number.isNaN(lineCount) || lineCount < 1) {
		console.error(pc.red("❌ Invalid line count"));
		return;
	}

	console.log(
		pc.cyan(`📄 Router Logs ${options.follow ? "(following)" : `(last ${lineCount} lines)`}\n`)
	);

	// Check if log file exists
	if (!existsSync(LOG_FILE)) {
		console.log(pc.yellow("⚠️  No log file found"));
		console.log(pc.dim(`Expected location: ${LOG_FILE}`));
		console.log(`
${pc.cyan("Possible reasons:")}
  • Server has not been started yet
  • Logging is disabled in configuration
  • Server has not generated any logs

${pc.cyan("To enable logging:")}
  ${pc.white("ccr config --show")} ${pc.dim("# Check if logging is enabled")}
  ${pc.white("ccr start")} ${pc.dim("# Start server to generate logs")}
`);
		return;
	}

	try {
		const stats = statSync(LOG_FILE);
		console.log(pc.dim(`Log file: ${LOG_FILE}`));
		console.log(
			pc.dim(`Size: ${formatBytes(stats.size)} | Modified: ${stats.mtime.toLocaleString()}`)
		);
		console.log(pc.dim("─".repeat(80)));

		if (options.follow) {
			// Follow mode - use tail -f equivalent
			await followLogs(lineCount);
		} else {
			// Show last N lines
			await showLastLines(lineCount);
		}
	} catch (error) {
		console.error(pc.red(`❌ Failed to read log file: ${error}`));
	}
}

async function showLastLines(lineCount: number) {
	try {
		// Use tail-like functionality to get last N lines
		const content = readFileSync(LOG_FILE, "utf-8");
		const lines = content.split("\n").filter((line) => line.trim());
		const lastLines = lines.slice(-lineCount);

		if (lastLines.length === 0) {
			console.log(pc.yellow("📝 Log file is empty"));
			return;
		}

		for (const line of lastLines) {
			console.log(formatLogLine(line));
		}

		console.log(pc.dim("\n─".repeat(80)));
		console.log(pc.dim(`Showing ${lastLines.length} of ${lines.length} total lines`));

		if (lines.length > lineCount) {
			console.log(
				pc.dim(`Use --lines ${lines.length} to see all lines or --follow to watch new logs`)
			);
		}
	} catch (error) {
		console.error(pc.red(`❌ Failed to read log content: ${error}`));
	}
}

async function followLogs(initialLines: number) {
	// Show initial lines first
	await showLastLines(initialLines);

	console.log(pc.yellow("\n👀 Following logs (Ctrl+C to stop)...\n"));

	// Use tail -f to follow the file
	const tail = spawn("tail", ["-f", LOG_FILE], {
		stdio: ["pipe", "pipe", "pipe"],
	});

	tail.stdout.on("data", (data) => {
		const lines = data
			.toString()
			.split("\n")
			.filter((line: string) => line.trim());
		for (const line of lines) {
			console.log(formatLogLine(line));
		}
	});

	tail.stderr.on("data", (data) => {
		console.error(pc.red(`tail error: ${data}`));
	});

	tail.on("error", (error) => {
		console.error(pc.red(`❌ Failed to follow logs: ${error.message}`));

		// Fallback to manual polling if tail is not available
		console.log(pc.yellow("Falling back to polling mode..."));
		pollLogFile();
	});

	tail.on("close", (code) => {
		if (code !== 0) {
			console.log(pc.yellow(`\n📄 Log following stopped (exit code: ${code})`));
		}
	});

	// Handle Ctrl+C gracefully
	process.on("SIGINT", () => {
		console.log(pc.yellow("\n\n👋 Stopped following logs"));
		tail.kill();
		process.exit(0);
	});
}

function pollLogFile() {
	let lastSize = 0;
	let lastPosition = 0;

	try {
		const stats = statSync(LOG_FILE);
		lastSize = stats.size;
		lastPosition = stats.size;
	} catch {
		// File might not exist yet
	}

	const pollInterval = setInterval(() => {
		try {
			const stats = statSync(LOG_FILE);

			if (stats.size > lastSize) {
				// File has grown, read new content
				const stream = createReadStream(LOG_FILE, {
					start: lastPosition,
					end: stats.size,
				});

				let buffer = "";
				stream.on("data", (chunk) => {
					buffer += chunk.toString();
				});

				stream.on("end", () => {
					const lines = buffer.split("\n").filter((line) => line.trim());
					for (const line of lines) {
						console.log(formatLogLine(line));
					}
				});

				lastSize = stats.size;
				lastPosition = stats.size;
			}
		} catch {
			// File might have been deleted or moved
			console.log(pc.yellow("📄 Log file no longer accessible"));
			clearInterval(pollInterval);
		}
	}, 1000);

	// Handle Ctrl+C
	process.on("SIGINT", () => {
		console.log(pc.yellow("\n\n👋 Stopped following logs"));
		clearInterval(pollInterval);
		process.exit(0);
	});
}

function formatLogLine(line: string): string {
	if (!line.trim()) return "";

	// Try to parse as JSON log (structured logging)
	try {
		const logEntry = JSON.parse(line);
		return formatStructuredLog(logEntry);
	} catch {
		// Not JSON, treat as plain text
		return formatPlainLog(line);
	}
}

function formatStructuredLog(log: any): string {
	const timestamp = log.timestamp || log.time || new Date().toISOString();
	const level = (log.level || "info").toUpperCase();
	const message = log.message || log.msg || "";
	const extra = { ...log };
	delete extra.timestamp;
	delete extra.time;
	delete extra.level;
	delete extra.message;
	delete extra.msg;

	const levelColor = getLevelColor(level);
	const timeStr = pc.dim(new Date(timestamp).toLocaleTimeString());

	let output = `${timeStr} ${levelColor(level.padEnd(5))} ${message}`;

	// Add extra fields if present
	const extraKeys = Object.keys(extra);
	if (extraKeys.length > 0) {
		const extraStr = extraKeys.map((key) => `${key}=${extra[key]}`).join(" ");
		output += pc.dim(` | ${extraStr}`);
	}

	return output;
}

function formatPlainLog(line: string): string {
	// Simple timestamp detection and formatting
	const timestampRegex = /^(\d{4}-\d{2}-\d{2}[T\s]\d{2}:\d{2}:\d{2})/;
	const match = line.match(timestampRegex);

	if (match) {
		const timestamp = match[1];
		const rest = line.slice(match[0].length).trim();
		const timeStr = pc.dim(new Date(timestamp).toLocaleTimeString());
		return `${timeStr} ${rest}`;
	}

	// Look for log level indicators
	const levelRegex = /\b(ERROR|WARN|INFO|DEBUG|TRACE)\b/i;
	const levelMatch = line.match(levelRegex);

	if (levelMatch) {
		const level = levelMatch[1].toUpperCase();
		const levelColor = getLevelColor(level);
		return line.replace(levelRegex, levelColor(level));
	}

	return line;
}

function getLevelColor(level: string) {
	switch (level.toUpperCase()) {
		case "ERROR":
			return pc.red;
		case "WARN":
		case "WARNING":
			return pc.yellow;
		case "INFO":
			return pc.blue;
		case "DEBUG":
			return pc.cyan;
		case "TRACE":
			return pc.dim;
		default:
			return pc.white;
	}
}

function formatBytes(bytes: number): string {
	if (bytes === 0) return "0 B";

	const k = 1024;
	const sizes = ["B", "KB", "MB", "GB"];
	const i = Math.floor(Math.log(bytes) / Math.log(k));

	return `${parseFloat((bytes / k ** i).toFixed(1))} ${sizes[i]}`;
}
