import { existsSync } from "node:fs";
import ora from "ora";
import pc from "picocolors";
import { CONFIG_FILE } from "../constants.js";
import { run } from "../index.js";
import { isServiceRunning } from "../utils/processCheck.js";

interface StartOptions {
	daemon?: boolean;
	port?: string;
}

export async function startServer(options: StartOptions) {
	console.log(pc.cyan("🚀 Starting Claude Code Router...\n"));

	// Check if already running
	if (isServiceRunning()) {
		console.log(pc.yellow("⚠️  Server is already running"));
		console.log(pc.dim("Use 'ccr status' to check status or 'ccr restart' to restart"));
		return;
	}

	// Check if config exists
	if (!existsSync(CONFIG_FILE)) {
		console.log(pc.red("❌ No configuration found"));
		console.log(pc.dim("Run 'ccr init' to set up your configuration"));
		return;
	}

	const spinner = ora("Initializing server...").start();

	try {
		// Override port if provided
		if (options.port) {
			const port = Number.parseInt(options.port);
			if (Number.isNaN(port) || port < 1024 || port > 65535) {
				spinner.fail("Invalid port number");
				return;
			}
			process.env.PORT = options.port;
		}

		// Start server
		spinner.text = "Starting router service...";

		if (options.daemon) {
			spinner.text = "Starting in daemon mode...";
			// TODO: Implement proper daemon mode with detached process
		}

		await run();
		spinner.succeed("Server started successfully");

		console.log(`
${pc.green("✅ Claude Code Router is running")}

${pc.cyan("Server Details:")}
  ${pc.dim("•")} Host: ${process.env.HOST || "127.0.0.1"}
  ${pc.dim("•")} Port: ${process.env.PORT || "3456"}
  ${pc.dim("•")} URL: ${pc.blue(`http://${process.env.HOST || "127.0.0.1"}:${process.env.PORT || "3456"}`)}

${pc.cyan("Usage:")}
  ${pc.white('ccr code "Your prompt here"')} ${pc.dim("# Send requests through router")}
  ${pc.white("ccr status")} ${pc.dim("# Check server status")}
  ${pc.white("ccr stop")} ${pc.dim("# Stop the server")}

${pc.dim("Server is ready to route Claude Code requests!")}
`);
	} catch (error) {
		spinner.fail("Failed to start server");

		if (error instanceof Error) {
			console.error(pc.red(`Error: ${error.message}`));

			// Provide helpful troubleshooting
			if (error.message.includes("EADDRINUSE")) {
				console.log(
					pc.yellow(`
💡 Port is already in use. Try:
  • ${pc.white("ccr start --port 3457")} (use different port)
  • ${pc.white("ccr stop")} (stop existing server)
  • Check if another service is using the port
`)
				);
			} else if (error.message.includes("EACCES")) {
				console.log(
					pc.yellow(`
💡 Permission denied. Try:
  • Use a port number > 1024
  • Run with appropriate permissions
  • ${pc.white("ccr start --port 8080")} (use unprivileged port)
`)
				);
			} else if (error.message.includes("config")) {
				console.log(
					pc.yellow(`
💡 Configuration issue. Try:
  • ${pc.white("ccr config --validate")} (check config)
  • ${pc.white("ccr init --force")} (reconfigure)
`)
				);
			}
		}

		process.exit(1);
	}
}
