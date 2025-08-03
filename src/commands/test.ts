import { existsSync } from "node:fs";
import OpenAI from "openai";
import pc from "picocolors";
import { CONFIG_FILE } from "../constants.js";
import type { Config } from "../types/config.js";
import { readConfigFile } from "../utils/index.js";
import { isServiceRunning } from "../utils/processCheck.js";

interface TestOptions {
	verbose?: boolean;
}

interface TestResult {
	name: string;
	status: "pass" | "fail" | "warn" | "skip";
	message: string;
	details?: string;
	duration?: number;
}

export async function testConnection(options: TestOptions) {
	console.log(pc.cyan("🧪 Testing Claude Code Router\n"));

	const results: TestResult[] = [];
	let overallSuccess = true;

	// Test 1: Configuration exists and is valid
	const configTest = await testConfig();
	results.push(configTest);
	if (configTest.status === "fail") overallSuccess = false;

	if (configTest.status === "fail") {
		displayResults(results, overallSuccess, options.verbose ?? false);
		return;
	}

	// Test 2: Server status
	const serverTest = await testServer();
	results.push(serverTest);

	// Test 3: API connectivity
	const apiTest = await testAPIConnectivity();
	results.push(apiTest);
	if (apiTest.status === "fail") overallSuccess = false;

	// Test 4: Model availability (if API is accessible)
	if (apiTest.status === "pass") {
		const modelTest = await testModelAvailability();
		results.push(modelTest);
		if (modelTest.status === "fail") overallSuccess = false;

		// Test 5: Simple request test
		const requestTest = await testSimpleRequest();
		results.push(requestTest);
		if (requestTest.status === "fail") overallSuccess = false;
	}

	displayResults(results, overallSuccess, options.verbose ?? false);
}

async function testConfig(): Promise<TestResult> {
	const startTime = Date.now();

	if (!existsSync(CONFIG_FILE)) {
		return {
			name: "Configuration File",
			status: "fail",
			message: "Configuration file not found",
			details: `Expected location: ${CONFIG_FILE}`,
			duration: Date.now() - startTime,
		};
	}

	try {
		await readConfigFile();
		return {
			name: "Configuration File",
			status: "pass",
			message: "Configuration is valid",
			duration: Date.now() - startTime,
		};
	} catch (error) {
		return {
			name: "Configuration File",
			status: "fail",
			message: "Configuration is invalid",
			details: error instanceof Error ? error.message : String(error),
			duration: Date.now() - startTime,
		};
	}
}

async function testServer(): Promise<TestResult> {
	const startTime = Date.now();
	const isRunning = isServiceRunning();

	return {
		name: "Router Service",
		status: isRunning ? "pass" : "warn",
		message: isRunning ? "Server is running" : "Server is not running",
		details: isRunning ? undefined : "This is not necessarily an error - the router can auto-start",
		duration: Date.now() - startTime,
	};
}

async function testAPIConnectivity(): Promise<TestResult> {
	const startTime = Date.now();

	try {
		const config: Config = await readConfigFile();

		// Test basic URL accessibility
		try {
			new URL(config.baseURL);
		} catch {
			return {
				name: "API Connectivity",
				status: "fail",
				message: "Invalid base URL format",
				details: `URL: ${config.baseURL}`,
				duration: Date.now() - startTime,
			};
		}

		// Try to list models or make a simple request
		try {
			// For most OpenAI-compatible APIs, /models endpoint should work
			const response = await fetch(`${config.baseURL}/models`, {
				headers: {
					Authorization: `Bearer ${config.api_key}`,
					"Content-Type": "application/json",
				},
				signal: AbortSignal.timeout(10000),
			});

			if (response.ok) {
				return {
					name: "API Connectivity",
					status: "pass",
					message: "API endpoint is accessible",
					details: `Connected to ${new URL(config.baseURL).hostname}`,
					duration: Date.now() - startTime,
				};
			} else {
				return {
					name: "API Connectivity",
					status: "fail",
					message: `API returned ${response.status}: ${response.statusText}`,
					details: await response.text().catch(() => "No response body"),
					duration: Date.now() - startTime,
				};
			}
		} catch (error) {
			if (error instanceof Error) {
				if (error.name === "TimeoutError" || error.message.includes("timeout")) {
					return {
						name: "API Connectivity",
						status: "fail",
						message: "Connection timeout",
						details: "The API endpoint is not responding within 10 seconds",
						duration: Date.now() - startTime,
					};
				}

				if (error.message.includes("ENOTFOUND") || error.message.includes("ECONNREFUSED")) {
					return {
						name: "API Connectivity",
						status: "fail",
						message: "Cannot reach API endpoint",
						details: `Check if ${new URL(config.baseURL).hostname} is accessible`,
						duration: Date.now() - startTime,
					};
				}
			}

			return {
				name: "API Connectivity",
				status: "fail",
				message: "Connection failed",
				details: error instanceof Error ? error.message : String(error),
				duration: Date.now() - startTime,
			};
		}
	} catch (error) {
		return {
			name: "API Connectivity",
			status: "fail",
			message: "Configuration error",
			details: error instanceof Error ? error.message : String(error),
			duration: Date.now() - startTime,
		};
	}
}

async function testModelAvailability(): Promise<TestResult> {
	const startTime = Date.now();

	const config: Config = await readConfigFile();

	const response = await fetch(`${config.baseURL}/models`, {
		headers: {
			Authorization: `Bearer ${config.api_key}`,
			"Content-Type": "application/json",
		},
		signal: AbortSignal.timeout(10000),
	});

	if (response.ok) {
		const data = await response.json();
		const modelCount = data.data?.length || 0;

		return {
			name: "Model Availability",
			status: modelCount > 0 ? "pass" : "warn",
			message: modelCount > 0 ? `${modelCount} models available` : "No models found",
			details:
				modelCount > 0
					? `Models: ${data.data
							?.slice(0, 3)
							.map((m: any) => m.id)
							.join(", ")}${modelCount > 3 ? "..." : ""}`
					: undefined,
			duration: Date.now() - startTime,
		};
	} else {
		return {
			name: "Model Availability",
			status: "warn",
			message: "Cannot list models",
			details: `API returned ${response.status} - this may be normal for some providers`,
			duration: Date.now() - startTime,
		};
	}
}

async function testSimpleRequest(): Promise<TestResult> {
	const startTime = Date.now();

	try {
		const config: Config = await readConfigFile();

		const client = new OpenAI({
			apiKey: config.api_key,
			baseURL: config.baseURL,
			timeout: 15000,
		});

		// Make a simple test request
		const response = await client.chat.completions.create({
			model: "gpt-3.5-turbo", // Default model - provider will handle mapping
			messages: [
				{
					role: "user",
					content: "Reply with exactly 'test successful' and nothing else.",
				},
			],
			max_tokens: 10,
			temperature: 0,
		});

		const content = response.choices[0]?.message?.content?.toLowerCase() || "";
		const isSuccessful = content.includes("test successful") || content.includes("successful");

		return {
			name: "Simple Request",
			status: isSuccessful ? "pass" : "warn",
			message: isSuccessful
				? "Test request completed successfully"
				: "Test request completed with unexpected response",
			details: `Response: "${response.choices[0]?.message?.content || "No content"}"`,
			duration: Date.now() - startTime,
		};
	} catch (error) {
		return {
			name: "Simple Request",
			status: "fail",
			message: "Test request failed",
			details: error instanceof Error ? error.message : String(error),
			duration: Date.now() - startTime,
		};
	}
}

function displayResults(results: TestResult[], overallSuccess: boolean, verbose: boolean) {
	console.log(pc.bold("📋 Test Results\n"));

	for (const result of results) {
		const icon = getStatusIcon(result.status);
		const color = getStatusColor(result.status);
		const duration = result.duration ? pc.dim(` (${result.duration}ms)`) : "";

		console.log(`${icon} ${pc.bold(result.name)}: ${color(result.message)}${duration}`);

		if (verbose && result.details) {
			console.log(`   ${pc.dim(result.details)}`);
		}
	}

	console.log();

	// Summary
	const passCount = results.filter((r) => r.status === "pass").length;
	const failCount = results.filter((r) => r.status === "fail").length;
	const warnCount = results.filter((r) => r.status === "warn").length;
	const skipCount = results.filter((r) => r.status === "skip").length;

	console.log(pc.bold("📊 Summary"));
	console.log(`  ${pc.green(`✓ ${passCount} passed`)}`);
	if (failCount > 0) console.log(`  ${pc.red(`✗ ${failCount} failed`)}`);
	if (warnCount > 0) console.log(`  ${pc.yellow(`! ${warnCount} warnings`)}`);
	if (skipCount > 0) console.log(`  ${pc.dim(`- ${skipCount} skipped`)}`);

	console.log();

	if (overallSuccess) {
		console.log(pc.green("🎉 All critical tests passed! Your router is ready to use."));
		console.log(`
${pc.cyan("Try it out:")}
  ${pc.white('ccr code "Hello, world!"')} ${pc.dim("# Send a test request")}
`);
	} else {
		console.log(pc.red("❌ Some tests failed. Please check the issues above."));
		console.log(`
${pc.cyan("Common fixes:")}
  ${pc.white("ccr config --validate")} ${pc.dim("# Check configuration")}
  ${pc.white("ccr init --force")} ${pc.dim("# Recreate configuration")}
  ${pc.white("ccr start")} ${pc.dim("# Start the server")}
`);
	}
}

function getStatusIcon(status: TestResult["status"]): string {
	switch (status) {
		case "pass":
			return pc.green("✓");
		case "fail":
			return pc.red("✗");
		case "warn":
			return pc.yellow("!");
		case "skip":
			return pc.dim("-");
		default:
			return "?";
	}
}

function getStatusColor(status: TestResult["status"]) {
	switch (status) {
		case "pass":
			return pc.green;
		case "fail":
			return pc.red;
		case "warn":
			return pc.yellow;
		case "skip":
			return pc.dim;
		default:
			return pc.white;
	}
}
