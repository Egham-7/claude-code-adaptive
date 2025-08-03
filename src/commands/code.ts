import { spawn } from "node:child_process";
import { join } from "node:path";
import ora from "ora";
import pc from "picocolors";
import { executeCodeCommand } from "../utils/codeCommand.js";
import { isServiceRunning } from "../utils/processCheck.js";

interface CodeOptions {
	model?: string;
	timeout?: string;
}

async function waitForService(timeout = 10000, initialDelay = 1000): Promise<boolean> {
	await new Promise((resolve) => setTimeout(resolve, initialDelay));

	const startTime = Date.now();
	while (Date.now() - startTime < timeout) {
		if (isServiceRunning()) {
			await new Promise((resolve) => setTimeout(resolve, 500));
			return true;
		}
		await new Promise((resolve) => setTimeout(resolve, 100));
	}
	return false;
}

export async function executeCode(promptArgs: string[], options: CodeOptions) {
	// Join prompt arguments
	const prompt = promptArgs.join(" ");

	// If prompt is provided, show what we're executing
	if (prompt.trim()) {
		console.log(pc.cyan("🤖 Executing Claude Code request...\n"));
		console.log(pc.dim(`Prompt: ${prompt}`));

		if (options.model) {
			console.log(pc.dim(`Model: ${options.model}`));
		}
		if (options.timeout) {
			console.log(pc.dim(`Timeout: ${options.timeout}ms`));
		}

		console.log();
	} else {
		// No prompt provided - starting interactive mode
		console.log(pc.cyan("🤖 Starting Claude Code in interactive mode...\n"));

		if (options.model) {
			console.log(pc.dim(`Model: ${options.model}`));
		}
		if (options.timeout) {
			console.log(pc.dim(`Timeout: ${options.timeout}ms`));
		}

		if (options.model || options.timeout) {
			console.log();
		}
	}

	// Check if service is running
	if (!isServiceRunning()) {
		const spinner = ora("Service not running, starting automatically...").start();

		try {
			// Start service in background
			const cliPath = join(process.cwd(), "dist", "cli.js");
			const startProcess = spawn("node", [cliPath, "start"], {
				detached: true,
				stdio: "ignore",
			});

			startProcess.on("error", (error) => {
				spinner.fail("Failed to start service");
				console.error(pc.red(`Error: ${error.message}`));
				process.exit(1);
			});

			startProcess.unref();

			// Wait for service to be ready
			spinner.text = "Waiting for service to be ready...";
			const isReady = await waitForService();

			if (!isReady) {
				spinner.fail("Service startup timeout");
				console.log(
					pc.red(`
❌ Failed to start the router service automatically.

${pc.cyan("Please try:")}
  ${pc.white("ccr start")} ${pc.dim("# Start the service manually")}
  ${pc.white("ccr status")} ${pc.dim("# Check service status")}
  ${pc.white("ccr init")} ${pc.dim("# Initialize configuration if needed")}
`)
				);
				process.exit(1);
			}

			spinner.succeed("Service started and ready");
		} catch (error) {
			spinner.fail("Failed to start service");
			console.error(pc.red(`Error: ${error}`));
			process.exit(1);
		}
	}

	// Prepare arguments for executeCodeCommand
	const args: string[] = [];

	// Add prompt if provided
	if (prompt.trim()) {
		args.push(prompt);
	}

	// Add model option if provided
	if (options.model) {
		args.push("--model", options.model);
	}

	// Add timeout option if provided
	if (options.timeout) {
		const timeoutMs = Number.parseInt(options.timeout);
		if (!Number.isNaN(timeoutMs)) {
			args.push("--timeout", options.timeout);
		}
	}

	console.log(pc.cyan("📡 Routing request through Claude Code Router..."));
	console.log();

	try {
		// Execute the code command
		await executeCodeCommand(args);

		console.log();
		if (prompt.trim()) {
			console.log(pc.green("✅ Request completed successfully"));
		}
	} catch (error) {
		console.log();
		console.error(pc.red("❌ Request failed"));

		if (error instanceof Error) {
			console.error(pc.red(`Error: ${error.message}`));

			// Provide helpful troubleshooting
			if (error.message.includes("ECONNREFUSED")) {
				console.log(
					pc.yellow(`
💡 Connection refused. Try:
  ${pc.white("ccr status")} ${pc.dim("# Check server status")}
  ${pc.white("ccr restart")} ${pc.dim("# Restart the server")}
`)
				);
			} else if (error.message.includes("timeout")) {
				console.log(
					pc.yellow(`
💡 Request timed out. Try:
  ${pc.white('ccr code --timeout 60000 "your prompt"')} ${pc.dim("# Increase timeout")}
  ${pc.white("ccr test")} ${pc.dim("# Test connection")}
`)
				);
			} else if (
				error.message.includes("authentication") ||
				error.message.includes("unauthorized")
			) {
				console.log(
					pc.yellow(`
💡 Authentication failed. Try:
  ${pc.white("ccr config --show")} ${pc.dim("# Check API key")}
  ${pc.white("ccr init --force")} ${pc.dim("# Reconfigure with new API key")}
`)
				);
			} else if (error.message.includes("claude")) {
				console.log(
					pc.yellow(`
💡 Claude Code not found. Try:
  ${pc.white("npm install -g @anthropic-ai/claude-code")} ${pc.dim("# Install Claude Code")}
  ${pc.white("which claude")} ${pc.dim("# Check if Claude Code is in PATH")}
`)
				);
			}
		}

		process.exit(1);
	}
}
