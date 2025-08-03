#!/usr/bin/env node
import { Command } from "commander";
import pc from "picocolors";
import { version } from "../package.json";
import { executeCode } from "./commands/code.js";
import { configCommand } from "./commands/config.js";
import { initConfig } from "./commands/init.js";
import { showLogs } from "./commands/logs.js";
import { restartServer } from "./commands/restart.js";
import { startServer } from "./commands/start.js";
import { showStatus } from "./commands/status.js";
import { stopServer } from "./commands/stop.js";
import { testConnection } from "./commands/test.js";

const program = new Command();

program
	.name("ccr")
	.description("Claude Code Router - Route Claude Code requests to any LLM provider")
	.version(version, "-v, --version", "Show version information")
	.configureHelp({
		sortSubcommands: true,
		showGlobalOptions: true,
	});

// Init command - Interactive setup wizard
program
	.command("init")
	.description("Initialize configuration with interactive setup")
	.option("-f, --force", "Overwrite existing configuration")
	.action(initConfig);

// Start command
program
	.command("start")
	.description("Start the router server")
	.option("-d, --daemon", "Run in daemon mode")
	.option("-p, --port <port>", "Override port number")
	.action(startServer);

// Stop command
program.command("stop").description("Stop the router server").action(stopServer);

// Restart command
program.command("restart").description("Restart the router server").action(restartServer);

// Status command
program
	.command("status")
	.description("Show server status and configuration")
	.option("-j, --json", "Output in JSON format")
	.action(showStatus);

// Code command - Execute Claude Code through router
program
	.command("code")
	.description("Execute Claude Code through the router")
	.argument("[prompt...]", "The prompt to send to Claude Code")
	.option("-m, --model <model>", "Override model selection")
	.option("-t, --timeout <ms>", "Request timeout in milliseconds")
	.action(executeCode);

// Config command - Manage configuration
program
	.command("config")
	.description("Manage configuration settings")
	.option("-s, --show", "Show current configuration")
	.option("-e, --edit", "Edit configuration file")
	.option("-v, --validate", "Validate configuration")
	.option("-r, --reset", "Reset to default configuration")
	.action(configCommand);

// Test command - Test connection and configuration
program
	.command("test")
	.description("Test connection to configured LLM provider")
	.option("-v, --verbose", "Show detailed test information")
	.action(testConnection);

// Logs command - Show server logs
program
	.command("logs")
	.description("Show server logs")
	.option("-f, --follow", "Follow log output")
	.option("-n, --lines <count>", "Number of lines to show", "50")
	.action(showLogs);

// Global error handler
program.exitOverride((err) => {
	if (err.code === "commander.version") {
		console.log(`${pc.cyan("Claude Code Router")} v${version}`);
		process.exit(0);
	}

	if (err.code === "commander.helpDisplayed") {
		process.exit(0);
	}

	console.error(pc.red(`Error: ${err.message}`));
	process.exit(1);
});

// Custom help
program.addHelpText(
	"after",
	`
${pc.cyan("Examples:")}
  ${pc.gray("$")} ccr init                    ${pc.dim("# Interactive setup wizard")}
  ${pc.gray("$")} ccr start                   ${pc.dim("# Start the router server")}
  ${pc.gray("$")} ccr code "Hello world"      ${pc.dim("# Send prompt through router")}
  ${pc.gray("$")} ccr status --json           ${pc.dim("# Show status in JSON format")}
  ${pc.gray("$")} ccr test --verbose          ${pc.dim("# Test connection with details")}

${pc.cyan("Documentation:")}
  ${pc.blue("https://github.com/Egham-7/claude-code-adaptive")}
`
);

// Parse command line arguments
async function main() {
	try {
		await program.parseAsync(process.argv);
	} catch (error) {
		if (error instanceof Error) {
			console.error(pc.red(`Fatal error: ${error.message}`));
			process.exit(1);
		}
		throw error;
	}
}

// Handle unhandled rejections
process.on("unhandledRejection", (reason, promise) => {
	console.error(pc.red("Unhandled Rejection at:"), promise, pc.red("reason:"), reason);
	process.exit(1);
});

process.on("uncaughtException", (error) => {
	console.error(pc.red("Uncaught Exception:"), error);
	process.exit(1);
});

main().catch(console.error);
