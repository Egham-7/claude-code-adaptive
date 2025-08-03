import { execSync } from "node:child_process";
import { existsSync, readFileSync, statSync, unlinkSync } from "node:fs";
import { confirm } from "@inquirer/prompts";
import ora from "ora";
import pc from "picocolors";
import { CONFIG_FILE } from "../constants.js";
import { ConfigSchema } from "../types/config.js";
import { backupConfigFile, readConfigFile } from "../utils/index.js";

interface ConfigOptions {
	show?: boolean;
	edit?: boolean;
	validate?: boolean;
	reset?: boolean;
}

export async function configCommand(options: ConfigOptions) {
	// If no options provided, show help
	if (!options.show && !options.edit && !options.validate && !options.reset) {
		console.log(pc.cyan("⚙  Configuration Management\n"));

		console.log(`${pc.bold("Available options:")}
  ${pc.white("--show")}      Show current configuration
  ${pc.white("--edit")}      Edit configuration file
  ${pc.white("--validate")}  Validate configuration
  ${pc.white("--reset")}     Reset to default configuration

${pc.cyan("Examples:")}
  ${pc.gray("ccr config --show")}
  ${pc.gray("ccr config --validate")}
  ${pc.gray("ccr config --edit")}
`);
		return;
	}

	// Show configuration
	if (options.show) {
		await showConfig();
	}

	// Validate configuration
	if (options.validate) {
		await validateConfig();
	}

	// Edit configuration
	if (options.edit) {
		await editConfig();
	}

	// Reset configuration
	if (options.reset) {
		await resetConfig();
	}
}

async function showConfig() {
	console.log(pc.cyan("📄 Current Configuration\n"));

	if (!existsSync(CONFIG_FILE)) {
		console.log(pc.red("❌ Configuration file not found"));
		console.log(pc.dim(`Expected location: ${CONFIG_FILE}`));
		console.log(pc.yellow(`\n💡 Run 'ccr init' to create a configuration`));
		return;
	}

	try {
		const config = await readConfigFile();

		// Mask sensitive information
		const displayConfig = {
			...config,
			api_key: config.api_key
				? `${config.api_key.slice(0, 8)}${"*".repeat(Math.max(0, config.api_key.length - 8))}`
				: undefined,
		};

		console.log(pc.bold("🔧 Server Settings"));
		console.log(`  Host: ${pc.white(config.HOST)}`);
		console.log(`  Port: ${pc.white(config.PORT.toString())}`);
		console.log(`  Enabled: ${config.enabled ? pc.green("Yes") : pc.red("No")}`);
		console.log(`  Logging: ${config.LOG ? pc.green("Enabled") : pc.yellow("Disabled")}`);

		console.log(`\n${pc.bold("🌐 API Settings")}`);
		console.log(`  Base URL: ${pc.blue(config.baseURL)}`);
		console.log(`  Endpoint: ${pc.white(config.endpoint)}`);
		console.log(`  API Key: ${pc.dim(displayConfig.api_key)}`);
		console.log(`  Timeout: ${pc.white((config.timeout / 1000).toString())}s`);
		console.log(`  API Timeout: ${pc.white((config.API_TIMEOUT_MS / 1000).toString())}s`);

		if (config.semantic_cache) {
			console.log(`\n${pc.bold("💾 Semantic Cache")}`);
			console.log(`  Enabled: ${config.semantic_cache.enabled ? pc.green("Yes") : pc.red("No")}`);
			console.log(`  Max Size: ${pc.white(config.semantic_cache.max_size?.toString() || "N/A")}`);
			console.log(`  TTL: ${pc.white(((config.semantic_cache.ttl || 0) / 3600).toString())}h`);
			console.log(
				`  Similarity: ${pc.white((config.semantic_cache.similarity_threshold || 0).toString())}`
			);
		}

		if (config.fallback_mode) {
			console.log(`\n${pc.bold("🔄 Fallback Mode")}`);
			console.log(`  Mode: ${pc.white(config.fallback_mode)}`);
		}

		if (config.protocol_manager_config) {
			console.log(`\n${pc.bold("🧠 Protocol Manager")}`);
			console.log(
				`  Cost Bias: ${pc.white((config.protocol_manager_config.cost_bias || 0).toString())}`
			);
			console.log(
				`  Complexity Threshold: ${pc.white(
					(config.protocol_manager_config.complexity_threshold || 0).toString()
				)}`
			);
			console.log(
				`  Token Threshold: ${pc.white(
					(config.protocol_manager_config.token_threshold || 0).toString()
				)}`
			);
		}

		console.log(`\n${pc.bold("📁 File Info")}`);
		console.log(`  Location: ${pc.dim(CONFIG_FILE)}`);

		const stats = statSync(CONFIG_FILE);
		console.log(`  Size: ${pc.white((stats.size / 1024).toFixed(1))} KB`);
		console.log(`  Modified: ${pc.white(stats.mtime.toLocaleString())}`);
	} catch (error) {
		console.error(pc.red(`❌ Failed to read configuration: ${error}`));
	}
}

async function validateConfig() {
	console.log(pc.cyan("✅ Validating Configuration\n"));

	const spinner = ora("Reading configuration...").start();

	if (!existsSync(CONFIG_FILE)) {
		spinner.fail("Configuration file not found");
		console.log(pc.red(`Expected location: ${CONFIG_FILE}`));
		return;
	}

	try {
		spinner.text = "Parsing configuration...";
		const rawConfig = JSON.parse(readFileSync(CONFIG_FILE, "utf-8"));

		spinner.text = "Validating schema...";
		const result = ConfigSchema.safeParse(rawConfig);

		if (result.success) {
			spinner.succeed("Configuration is valid");

			console.log(pc.green("✅ All checks passed"));
			console.log(`\n${pc.bold("Validated settings:")}`);
			console.log(`  ${pc.green("•")} Schema validation: ${pc.green("PASS")}`);
			console.log(`  ${pc.green("•")} Required fields: ${pc.green("PRESENT")}`);
			console.log(`  ${pc.green("•")} Data types: ${pc.green("CORRECT")}`);
			console.log(`  ${pc.green("•")} URL format: ${pc.green("VALID")}`);
			console.log(`  ${pc.green("•")} Port range: ${pc.green("VALID")}`);

			// Additional validation checks
			spinner.start("Running additional checks...");

			const config = result.data;
			const issues: string[] = [];

			// Check URL accessibility (basic format check)
			try {
				new URL(config.baseURL);
			} catch {
				issues.push("Base URL format is invalid");
			}

			// Check port conflicts
			if (config.PORT < 1024) {
				issues.push("Port number is below 1024 (may require elevated privileges)");
			}

			// Check API key format (basic length check)
			if (config.api_key.length < 10) {
				issues.push("API key seems too short");
			}

			if (issues.length > 0) {
				spinner.warn("Configuration has potential issues");
				console.log(`\n${pc.yellow("!  Potential issues:")}`);
				for (const issue of issues) {
					console.log(`  ${pc.yellow("•")} ${issue}`);
				}
			} else {
				spinner.succeed("All additional checks passed");
			}
		} else {
			spinner.fail("Configuration is invalid");

			console.log(pc.red("\n❌ Validation errors:"));
			for (const error of result.error.issues) {
				const path = error.path.join(".");
				console.log(`  ${pc.red("•")} ${path || "root"}: ${error.message}`);
			}

			console.log(pc.yellow(`\n💡 To fix these issues:`));
			console.log(`  ${pc.white("ccr config --edit")} ${pc.dim("# Edit configuration manually")}`);
			console.log(`  ${pc.white("ccr init --force")} ${pc.dim("# Recreate configuration")}`);
		}
	} catch (error) {
		spinner.fail("Failed to validate configuration");

		if (error instanceof SyntaxError) {
			console.error(pc.red("❌ Invalid JSON syntax in configuration file"));
			console.log(pc.yellow(`\n💡 Fix the JSON syntax or run:`));
			console.log(`  ${pc.white("ccr init --force")} ${pc.dim("# Recreate configuration")}`);
		} else {
			console.error(pc.red(`❌ Validation error: ${error}`));
		}
	}
}

async function editConfig() {
	console.log(pc.cyan("✏  Edit Configuration\n"));

	if (!existsSync(CONFIG_FILE)) {
		console.log(pc.red("❌ Configuration file not found"));
		console.log(pc.yellow(`💡 Run 'ccr init' to create a configuration first`));
		return;
	}

	// Create backup
	const spinner = ora("Creating backup...").start();
	try {
		const backupPath = await backupConfigFile();
		if (backupPath) {
			spinner.succeed(`Backup created: ${backupPath}`);
		} else {
			spinner.succeed("Backup handling completed");
		}
	} catch (error) {
		spinner.warn(`Backup failed: ${error}`);
	}

	// Determine editor
	const editor = process.env.EDITOR || process.env.VISUAL || "nano";

	console.log(pc.dim(`Opening ${CONFIG_FILE} with ${editor}...`));
	console.log(pc.yellow("💡 Save and exit the editor when done"));

	try {
		// Open editor synchronously
		execSync(`${editor} "${CONFIG_FILE}"`, {
			stdio: "inherit",
		});

		console.log(pc.green("\n✅ Editor closed"));

		// Validate the edited configuration
		const validate = await confirm({
			message: "Validate the edited configuration?",
			default: true,
		});

		if (validate) {
			await validateConfig();
		}
	} catch (error) {
		console.error(pc.red(`❌ Failed to open editor: ${error}`));
		console.log(pc.yellow(`\n💡 Try setting your editor:`));
		console.log(`  ${pc.white("export EDITOR=nano")} ${pc.dim("# or vim, code, etc.")}`);
	}
}

async function resetConfig() {
	console.log(pc.cyan("🔄 Reset Configuration\n"));

	if (!existsSync(CONFIG_FILE)) {
		console.log(pc.yellow("!  No configuration file found"));
		console.log(pc.dim("Nothing to reset"));
		return;
	}

	const confirmed = await confirm({
		message: `This will delete your current configuration. Are you sure?`,
		default: false,
	});

	if (!confirmed) {
		console.log(pc.yellow("Reset cancelled"));
		return;
	}

	const spinner = ora("Creating backup...").start();
	try {
		const backupPath = await backupConfigFile();
		if (backupPath) {
			spinner.succeed(`Backup created: ${backupPath}`);
		} else {
			spinner.succeed("Backup completed");
		}
	} catch (error) {
		spinner.fail(`Backup failed: ${error}`);
		return;
	}

	// Delete current config
	try {
		unlinkSync(CONFIG_FILE);
		console.log(pc.green("✅ Configuration file deleted"));
	} catch (error) {
		console.error(pc.red(`❌ Failed to delete configuration: ${error}`));
		return;
	}

	console.log(`
${pc.green("✅ Configuration reset successfully")}

${pc.cyan("Next steps:")}
  ${pc.white("ccr init")} ${pc.dim("# Create new configuration")}
`);
}
