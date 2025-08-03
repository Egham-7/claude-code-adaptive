import { existsSync } from "node:fs";
import { confirm, input, password, select } from "@inquirer/prompts";
import ora from "ora";
import pc from "picocolors";
import { CONFIG_FILE } from "../constants.js";
import type { Config } from "../types/config.js";
import { initDir, writeConfigFile } from "../utils/index.js";

interface InitOptions {
	force?: boolean;
}

export async function initConfig(options: InitOptions) {
	console.log(`
${pc.cyan("🚀 Claude Code Router Setup")}
${pc.dim("Let's configure your router for optimal performance")}
`);

	// Check if config already exists
	if (existsSync(CONFIG_FILE) && !options.force) {
		const overwrite = await confirm({
			message: "Configuration already exists. Do you want to overwrite it?",
			default: false,
		});

		if (!overwrite) {
			console.log(pc.yellow("Setup cancelled. Use --force to overwrite existing config."));
			return;
		}
	}

	let spinner = ora("Initializing directories...").start();
	try {
		await initDir();
		spinner.succeed("Directories initialized");
	} catch (error) {
		spinner.fail(`Failed to initialize directories: ${error}`);
		return;
	}

	console.log(pc.cyan("\n📡 API Configuration"));

	// API Provider selection
	const provider = await select({
		message: "Select your LLM provider:",
		choices: [
			{
				name: "LLM Adaptive (Recommended)",
				value: "llmadaptive",
				description: "Adaptive model routing with multiple providers",
			},
			{
				name: "OpenAI Compatible",
				value: "openai",
				description: "Any OpenAI-compatible API endpoint",
			},
			{
				name: "Custom",
				value: "custom",
				description: "Custom API endpoint configuration",
			},
		],
		default: "llmadaptive",
	});

	let baseURL: string;
	let api_key: string;

	if (provider === "llmadaptive") {
		baseURL = "https://llmadaptive.uk/api/v1";
		console.log(pc.green(`✓ Using LLM Adaptive: ${baseURL}`));

		api_key = await password({
			message: "Enter your LLM Adaptive API key:",
			mask: "*",
			validate: (value) => {
				if (!value.trim()) return "API key is required";
				if (value.length < 10) return "API key seems too short";
				return true;
			},
		});
	} else if (provider === "openai") {
		const service = await select({
			message: "Select OpenAI-compatible service:",
			choices: [
				{ name: "OpenAI", value: "https://api.openai.com/v1" },
				{ name: "Azure OpenAI", value: "azure" },
				{ name: "Anthropic", value: "https://api.anthropic.com/v1" },
				{ name: "Other", value: "other" },
			],
		});

		if (service === "azure") {
			const resourceName = await input({
				message: "Enter your Azure resource name:",
				validate: (value) => (value.trim() ? true : "Resource name is required"),
			});
			const deploymentName = await input({
				message: "Enter your deployment name:",
				validate: (value) => (value.trim() ? true : "Deployment name is required"),
			});
			baseURL = `https://${resourceName}.openai.azure.com/openai/deployments/${deploymentName}`;
		} else if (service === "other") {
			baseURL = await input({
				message: "Enter your API base URL:",
				validate: (value) => {
					try {
						new URL(value);
						return true;
					} catch {
						return "Please enter a valid URL";
					}
				},
			});
		} else {
			baseURL = service;
		}

		api_key = await password({
			message: "Enter your API key:",
			mask: "*",
			validate: (value) => (value.trim() ? true : "API key is required"),
		});
	} else {
		baseURL = await input({
			message: "Enter your custom API base URL:",
			validate: (value) => {
				try {
					new URL(value);
					return true;
				} catch {
					return "Please enter a valid URL";
				}
			},
		});

		api_key = await password({
			message: "Enter your API key:",
			mask: "*",
			validate: (value) => (value.trim() ? true : "API key is required"),
		});
	}

	console.log(pc.cyan("\n⚙ Server Configuration"));

	const port = await input({
		message: "Server port:",
		default: "3456",
		validate: (value) => {
			const num = Number.parseInt(value);
			if (Number.isNaN(num) || num < 1024 || num > 65535) {
				return "Port must be between 1024 and 65535";
			}
			return true;
		},
	});

	const host = await input({
		message: "Server host:",
		default: "127.0.0.1",
		validate: (value) => {
			if (!/^(\d{1,3}\.){3}\d{1,3}$/.test(value) && value !== "0.0.0.0") {
				return "Please enter a valid IP address";
			}
			return true;
		},
	});

	console.log(pc.cyan("\n🔧 Advanced Configuration"));

	const enableLogging = await confirm({
		message: "Enable detailed logging?",
		default: true,
	});

	const timeout = await input({
		message: "Request timeout (seconds):",
		default: "30",
		validate: (value) => {
			const num = Number.parseInt(value);
			if (Number.isNaN(num) || num < 1 || num > 300) {
				return "Timeout must be between 1 and 300 seconds";
			}
			return true;
		},
	});

	// Advanced features
	const enableAdvanced = await confirm({
		message: "Configure advanced features? (semantic cache, fallback modes)",
		default: false,
	});

	const config: Config = {
		enabled: true,
		baseURL,
		endpoint: "chat/completions",
		api_key,
		timeout: Number.parseInt(timeout) * 1000,
		HOST: host,
		PORT: Number.parseInt(port),
		API_TIMEOUT_MS: 600000,
		LOG: enableLogging,
	};

	if (enableAdvanced) {
		const enableCache = await confirm({
			message: "Enable semantic cache?",
			default: true,
		});

		if (enableCache) {
			const cacheSize = await input({
				message: "Cache size (number of entries):",
				default: "1000",
				validate: (value) => {
					const num = Number.parseInt(value);
					return !Number.isNaN(num) && num > 0 ? true : "Must be a positive number";
				},
			});

			const cacheTtl = await input({
				message: "Cache TTL (hours):",
				default: "24",
				validate: (value) => {
					const num = Number.parseInt(value);
					return !Number.isNaN(num) && num > 0 ? true : "Must be a positive number";
				},
			});

			config.semantic_cache = {
				enabled: true,
				max_size: Number.parseInt(cacheSize),
				ttl: Number.parseInt(cacheTtl) * 3600,
				similarity_threshold: 0.8,
			};
		}

		const fallbackMode = await select({
			message: "Fallback mode:",
			choices: [
				{ name: "Sequential (recommended)", value: "sequential" },
				{ name: "Parallel", value: "parallel" },
			],
			default: "sequential",
		});

		config.fallback_mode = fallbackMode as "sequential" | "parallel";
	}

	// Save configuration
	spinner = ora("Saving configuration...").start();
	try {
		await writeConfigFile(config);
		spinner.succeed("Configuration saved successfully");
	} catch (error) {
		spinner.fail(`Failed to save configuration: ${error}`);
		return;
	}

	// Success message
	console.log(`
${pc.green("✅ Setup Complete!")}

Your Claude Code Router is ready to use:

${pc.cyan("Next steps:")}
  1. ${pc.white("ccr start")} - Start the router server
  2. ${pc.white("ccr test")} - Test your configuration
  3. ${pc.white('ccr code "Hello world"')} - Send your first request

${pc.cyan("Configuration saved to:")}
  ${pc.dim(CONFIG_FILE)}

${pc.cyan("Need help?")}
  ${pc.white("ccr --help")} - Show all available commands
  ${pc.white("ccr status")} - Check server status
`);
}
