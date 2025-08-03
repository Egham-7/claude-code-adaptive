import { defineConfig } from "tsdown";

export default defineConfig({
	entry: {
		cli: "src/cli.ts",
		index: "src/index.ts",
	},
	format: ["cjs", "esm"],
	dts: true,
	sourcemap: true,
	clean: true,
	outDir: "dist",
	target: "node18",
	shims: true,
	minify: false,
	treeshake: true,
	external: [
		// External dependencies that should not be bundled
		"openai",
		"@anthropic-ai/sdk",
		"fastify",
		"@fastify/static",
		"dotenv",
		"json5",
		"openurl",
		"tiktoken",
		"uuid",
	],
});
