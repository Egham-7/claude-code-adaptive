import { existsSync, readFileSync, statSync } from "node:fs";
import pc from "picocolors";
import { CONFIG_FILE, HOME_DIR, PID_FILE } from "../constants.js";
import type { Config } from "../types/config.js";
import { readConfigFile } from "../utils/index.js";
import { getServiceInfo, isServiceRunning } from "../utils/processCheck.js";

interface StatusOptions {
	json?: boolean;
}

interface StatusInfo {
	server: {
		running: boolean;
		pid?: number;
		uptime?: string;
		memory?: string;
		url?: string;
	};
	config: {
		exists: boolean;
		valid: boolean;
		path: string;
		provider?: string;
		port?: number;
		host?: string;
	};
	files: {
		configPath: string;
		configSize?: string;
		configModified?: string;
		pidFile?: string;
		homeDir: string;
	};
	health: {
		status: "healthy" | "unhealthy" | "unknown";
		issues: string[];
	};
}

export async function showStatus(options: StatusOptions) {
	const status: StatusInfo = {
		server: {
			running: false,
		},
		config: {
			exists: false,
			valid: false,
			path: CONFIG_FILE,
		},
		files: {
			configPath: CONFIG_FILE,
			homeDir: HOME_DIR,
		},
		health: {
			status: "unknown",
			issues: [],
		},
	};

	// Check server status
	const isRunning = isServiceRunning();
	status.server.running = isRunning;

	if (isRunning) {
		try {
			const serviceInfo = await getServiceInfo();
			status.server.url = serviceInfo.baseURL;

			if (existsSync(PID_FILE)) {
				const pidContent = readFileSync(PID_FILE, "utf-8").trim();
				const pid = Number.parseInt(pidContent);
				if (!Number.isNaN(pid)) {
					status.server.pid = pid;

					// Get process info if available
					try {
						const pidStat = statSync(`/proc/${pid}`);
						const uptimeMs = Date.now() - pidStat.birthtimeMs;
						status.server.uptime = formatUptime(uptimeMs);
					} catch {
						// /proc not available or permission denied
					}
				}
			}
		} catch (error) {
			status.health.issues.push(`Failed to get server info: ${error}`);
		}
	}

	// Check config status
	status.config.exists = existsSync(CONFIG_FILE);

	if (status.config.exists) {
		try {
			const stats = statSync(CONFIG_FILE);
			status.files.configSize = formatBytes(stats.size);
			status.files.configModified = stats.mtime.toISOString();

			const config: Config = await readConfigFile();
			status.config.valid = true;
			status.config.provider = new URL(config.baseURL).hostname;
			status.config.port = config.PORT;
			status.config.host = config.HOST;
		} catch (error) {
			status.config.valid = false;
			status.health.issues.push(`Invalid configuration: ${error}`);
		}
	} else {
		status.health.issues.push("Configuration file not found");
	}

	// PID file info
	if (existsSync(PID_FILE)) {
		status.files.pidFile = PID_FILE;
	}

	// Determine health status
	if (status.health.issues.length === 0) {
		status.health.status = "healthy";
	} else if (status.server.running || status.config.valid) {
		status.health.status = "unhealthy";
	} else {
		status.health.status = "unhealthy";
	}

	// Output in JSON format if requested
	if (options.json) {
		console.log(JSON.stringify(status, null, 2));
		return;
	}

	// Human-readable output
	console.log(pc.cyan("📊 Claude Code Router Status\n"));

	// Server Status
	console.log(pc.bold("🖥️  Server"));
	if (status.server.running) {
		console.log(`  Status: ${pc.green("● Running")}`);
		if (status.server.pid) {
			console.log(`  PID: ${pc.white(status.server.pid.toString())}`);
		}
		if (status.server.uptime) {
			console.log(`  Uptime: ${pc.white(status.server.uptime)}`);
		}
		if (status.server.url) {
			console.log(`  URL: ${pc.blue(status.server.url)}`);
		}
	} else {
		console.log(`  Status: ${pc.red("● Stopped")}`);
	}

	console.log();

	// Configuration Status
	console.log(pc.bold("⚙️  Configuration"));
	if (status.config.exists) {
		console.log(`  File: ${pc.green("● Found")}`);
		console.log(`  Valid: ${status.config.valid ? pc.green("● Yes") : pc.red("● No")}`);

		if (status.config.valid) {
			console.log(`  Provider: ${pc.white(status.config.provider || "Unknown")}`);
			console.log(`  Host: ${pc.white(status.config.host || "Unknown")}`);
			console.log(`  Port: ${pc.white(status.config.port?.toString() || "Unknown")}`);
		}
	} else {
		console.log(`  File: ${pc.red("● Missing")}`);
	}

	console.log();

	// File Information
	console.log(pc.bold("📁 Files"));
	console.log(`  Config: ${pc.dim(status.files.configPath)}`);
	if (status.files.configSize) {
		console.log(`  Size: ${pc.white(status.files.configSize)}`);
	}
	if (status.files.configModified) {
		console.log(`  Modified: ${pc.white(new Date(status.files.configModified).toLocaleString())}`);
	}
	if (status.files.pidFile) {
		console.log(`  PID File: ${pc.dim(status.files.pidFile)}`);
	}
	console.log(`  Home: ${pc.dim(status.files.homeDir)}`);

	console.log();

	// Health Status
	const healthIcon = status.health.status === "healthy" ? "✅" : "⚠️";
	const healthColor = status.health.status === "healthy" ? pc.green : pc.yellow;

	console.log(pc.bold("🏥 Health"));
	console.log(`  Status: ${healthColor(`${healthIcon} ${status.health.status.toUpperCase()}`)}`);

	if (status.health.issues.length > 0) {
		console.log(`  Issues:`);
		for (const issue of status.health.issues) {
			console.log(`    ${pc.red("•")} ${issue}`);
		}
	}

	console.log();

	// Quick Actions
	console.log(pc.bold("🔧 Quick Actions"));
	if (!status.server.running && status.config.valid) {
		console.log(`  ${pc.white("ccr start")} ${pc.dim("# Start the server")}`);
	}
	if (status.server.running) {
		console.log(`  ${pc.white("ccr stop")} ${pc.dim("# Stop the server")}`);
		console.log(`  ${pc.white("ccr restart")} ${pc.dim("# Restart the server")}`);
		console.log(`  ${pc.white("ccr test")} ${pc.dim("# Test connection")}`);
	}
	if (!status.config.exists || !status.config.valid) {
		console.log(`  ${pc.white("ccr init")} ${pc.dim("# Initialize configuration")}`);
	}
	if (status.config.exists) {
		console.log(`  ${pc.white("ccr config --show")} ${pc.dim("# Show configuration")}`);
		console.log(`  ${pc.white("ccr config --validate")} ${pc.dim("# Validate configuration")}`);
	}
}

function formatUptime(ms: number): string {
	const seconds = Math.floor(ms / 1000);
	const minutes = Math.floor(seconds / 60);
	const hours = Math.floor(minutes / 60);
	const days = Math.floor(hours / 24);

	if (days > 0) {
		return `${days}d ${hours % 24}h ${minutes % 60}m`;
	}
	if (hours > 0) {
		return `${hours}h ${minutes % 60}m`;
	}
	if (minutes > 0) {
		return `${minutes}m ${seconds % 60}s`;
	}
	return `${seconds}s`;
}

function formatBytes(bytes: number): string {
	if (bytes === 0) return "0 B";

	const k = 1024;
	const sizes = ["B", "KB", "MB", "GB"];
	const i = Math.floor(Math.log(bytes) / Math.log(k));

	return `${parseFloat((bytes / k ** i).toFixed(1))} ${sizes[i]}`;
}
