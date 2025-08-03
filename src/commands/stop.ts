import { existsSync, readFileSync, unlinkSync } from "node:fs";
import ora from "ora";
import pc from "picocolors";
import { PID_FILE, REFERENCE_COUNT_FILE } from "../constants.js";
import { cleanupPidFile, isServiceRunning } from "../utils/processCheck.js";

export async function stopServer() {
	console.log(pc.cyan("🛑 Stopping Claude Code Router...\n"));

	// Check if server is running
	if (!isServiceRunning()) {
		console.log(pc.yellow("⚠️  Server is not running"));
		console.log(pc.dim("Use 'ccr start' to start the server"));
		return;
	}

	const spinner = ora("Stopping server...").start();

	try {
		// Read PID file
		if (!existsSync(PID_FILE)) {
			spinner.fail("PID file not found");
			console.log(pc.yellow("Server may not be running or PID file was removed"));
			return;
		}

		const pidContent = readFileSync(PID_FILE, "utf-8").trim();
		const pid = Number.parseInt(pidContent);

		if (Number.isNaN(pid)) {
			spinner.fail("Invalid PID in file");
			cleanupPidFile();
			return;
		}

		spinner.text = `Terminating process ${pid}...`;

		// Try to terminate the process gracefully
		try {
			process.kill(pid, "SIGTERM");

			// Wait a moment for graceful shutdown
			await new Promise((resolve) => setTimeout(resolve, 2000));

			// Check if process is still running
			try {
				process.kill(pid, 0); // Signal 0 checks if process exists

				// If we reach here, process is still running, force kill
				spinner.text = "Force stopping server...";
				process.kill(pid, "SIGKILL");
				await new Promise((resolve) => setTimeout(resolve, 1000));
			} catch {
				// Process is gone, which is what we want
			}
		} catch (error) {
			if ((error as NodeJS.ErrnoException).code === "ESRCH") {
				// Process doesn't exist, just clean up files
				spinner.text = "Cleaning up stale files...";
			} else {
				throw error;
			}
		}

		// Clean up files
		cleanupPidFile();

		if (existsSync(REFERENCE_COUNT_FILE)) {
			try {
				unlinkSync(REFERENCE_COUNT_FILE);
			} catch {
				// Ignore cleanup errors
			}
		}

		spinner.succeed("Server stopped successfully");

		console.log(`
${pc.green("✅ Claude Code Router stopped")}

${pc.cyan("Next steps:")}
  ${pc.white("ccr start")} ${pc.dim("# Start the server again")}
  ${pc.white("ccr status")} ${pc.dim("# Check server status")}
`);
	} catch (error) {
		spinner.fail("Failed to stop server");

		if (error instanceof Error) {
			console.error(pc.red(`Error: ${error.message}`));

			// Provide helpful troubleshooting
			if ((error as NodeJS.ErrnoException).code === "EPERM") {
				console.log(
					pc.yellow(`
💡 Permission denied. Try:
  • Run with appropriate permissions
  • The process may be owned by another user
`)
				);
			} else if ((error as NodeJS.ErrnoException).code === "ESRCH") {
				console.log(
					pc.yellow(`
💡 Process not found:
  • Server may have already stopped
  • PID file may be stale
  • ${pc.white("ccr status")} (check current status)
`)
				);
			}
		}

		// Try to clean up anyway
		cleanupPidFile();
		process.exit(1);
	}
}
