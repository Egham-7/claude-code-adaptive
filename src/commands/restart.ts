import ora from "ora";
import pc from "picocolors";
import { isServiceRunning } from "../utils/processCheck.js";
import { startServer } from "./start.js";
import { stopServer } from "./stop.js";

export async function restartServer() {
	console.log(pc.cyan("🔄 Restarting Claude Code Router...\n"));

	const wasRunning = isServiceRunning();

	if (wasRunning) {
		console.log(pc.dim("Stopping current server..."));
		await stopServer();

		// Wait a moment between stop and start
		const spinner = ora("Waiting for clean shutdown...").start();
		await new Promise((resolve) => setTimeout(resolve, 2000));
		spinner.succeed("Clean shutdown completed");
		console.log();
	} else {
		console.log(pc.yellow("⚠️  Server was not running"));
		console.log();
	}

	console.log(pc.dim("Starting server..."));
	await startServer({});

	console.log(`
${pc.green("✅ Claude Code Router restarted successfully")}

${pc.cyan("Server is ready to handle requests:")}
  ${pc.white("ccr status")} ${pc.dim("# Check server status")}
  ${pc.white('ccr code "test prompt"')} ${pc.dim("# Test the server")}
`);
}
