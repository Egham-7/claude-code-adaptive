import fs from "node:fs/promises";
import path from "node:path";
import readline from "node:readline";
import JSON5 from "json5";
import { CONFIG_FILE, HOME_DIR, PLUGINS_DIR } from "../constants";
import type { Config } from "../types/config";

const ensureDir = async (dir_path: string) => {
	try {
		await fs.access(dir_path);
	} catch {
		await fs.mkdir(dir_path, { recursive: true });
	}
};

export const initDir = async () => {
	await ensureDir(HOME_DIR);
	await ensureDir(PLUGINS_DIR);
};

const createReadline = () => {
	return readline.createInterface({
		input: process.stdin,
		output: process.stdout,
	});
};

const question = (query: string): Promise<string> => {
	return new Promise((resolve) => {
		const rl = createReadline();
		rl.question(query, (answer) => {
			rl.close();
			resolve(answer);
		});
	});
};

const _confirm = async (query: string): Promise<boolean> => {
	const answer = await question(query);
	return answer.toLowerCase() !== "n";
};

export const readConfigFile = async (): Promise<Config> => {
	try {
		const configData = await fs.readFile(CONFIG_FILE, "utf-8");
		try {
			return JSON5.parse(configData) as Config;
		} catch (parseError) {
			console.error(`Failed to parse config file at ${CONFIG_FILE}`);
			console.error("Error details:", (parseError as Error).message);
			console.error("Please check your config file syntax.");
			process.exit(1);
		}
	} catch (readError: any) {
		if (readError.code === "ENOENT") {
			// Config file doesn't exist, prompt user for initial setup
			console.log("\n🚀 Welcome to Claude Code Router! Let's set up your configuration.");

			const endpoint = await question("Enter OpenAI-compatible API endpoint: ");
			const apiKey = await question("Enter API key: ");

			const config: Config = {
				enabled: true,
				endpoint: endpoint,
				api_key: apiKey,
				timeout: 30000,
				HOST: "0.0.0.0",
				PORT: 3456,
				API_TIMEOUT_MS: 600000,
			};

			await writeConfigFile(config);
			console.log("\n✅ Configuration saved!");
			return config;
		} else {
			console.error(`Failed to read config file at ${CONFIG_FILE}`);
			console.error("Error details:", readError.message);
			process.exit(1);
		}
	}
};

export const backupConfigFile = async () => {
	try {
		if (
			await fs
				.access(CONFIG_FILE)
				.then(() => true)
				.catch(() => false)
		) {
			const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
			const backupPath = `${CONFIG_FILE}.${timestamp}.bak`;
			await fs.copyFile(CONFIG_FILE, backupPath);

			// Clean up old backups, keeping only the 3 most recent
			try {
				const configDir = path.dirname(CONFIG_FILE);
				const configFileName = path.basename(CONFIG_FILE);
				const files = await fs.readdir(configDir);

				// Find all backup files for this config
				const backupFiles = files
					.filter((file) => file.startsWith(configFileName) && file.endsWith(".bak"))
					.sort()
					.reverse(); // Sort in descending order (newest first)

				// Delete all but the 3 most recent backups
				if (backupFiles.length > 3) {
					for (let i = 3; i < backupFiles.length; i++) {
						const oldBackupPath = path.join(configDir, backupFiles[i]);
						await fs.unlink(oldBackupPath);
					}
				}
			} catch (cleanupError) {
				console.warn("Failed to clean up old backups:", cleanupError);
			}

			return backupPath;
		}
	} catch (error) {
		console.error("Failed to backup config file:", error);
	}
	return null;
};

export const writeConfigFile = async (config: Config) => {
	await ensureDir(HOME_DIR);
	const configJson = JSON.stringify(config, null, 2);
	await fs.writeFile(CONFIG_FILE, configJson);
};

const validateConfig = (config: Config) => {
	if (config.enabled && !config.endpoint) {
		return { valid: false, error: "endpoint is required when enabled" };
	}

	if (config.enabled && !config.api_key) {
		return { valid: false, error: "api_key is required when enabled" };
	}

	if (config.enabled && config.endpoint && !config.endpoint.startsWith("http")) {
		return { valid: false, error: "endpoint must be a valid HTTP(S) URL" };
	}

	return { valid: true };
};

export const initConfig = async (): Promise<Config> => {
	const config = await readConfigFile();

	const validation = validateConfig(config);
	if (!validation.valid) {
		console.error(`❌ Configuration error: ${validation.error}`);
		console.error("Please check your configuration file at:", CONFIG_FILE);
		process.exit(1);
	}

	Object.assign(process.env, config);
	return config;
};
