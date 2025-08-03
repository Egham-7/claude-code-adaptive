# Claude Code Router

> A Claude Code router powered by Adaptive.

## ✨ Features

- **Adaptive Model Selection**: Intelligent model routing using adaptive model selection technology
- **Multiple LLM Providers**: Support for OpenAI, Anthropic, Google, and more through Adaptive
- **Simple Configuration**: Easy setup with OpenAI-compatible API endpoints
- **Stream Processing**: Seamless request/response format conversion
- **Auto-Start**: Automatically starts when running Claude Code commands
- **Cost Optimization**: Built-in cost optimization through smart model selection
- **Semantic Caching**: Reduce costs with intelligent response caching

## 🚀 Getting Started

### 1. Installation

First, ensure you have [Claude Code](https://docs.anthropic.com/en/docs/claude-code/quickstart) installed:

```shell
npm install -g @anthropic-ai/claude-code
```

Then, install Claude Code Router:

```shell
npm install -g @adaptive-llm/claude-code-router
```

### 2. Get Your Adaptive API Key

Before setting up the router, you'll need an API key from Adaptive:

1. Visit [llmadaptive.uk](https://llmadaptive.uk)
2. Sign up for an account on the API platform
3. Navigate to your dashboard and create a new API key
4. Copy your API key - you'll need it for configuration

### 3. Configuration

#### Interactive Setup (Recommended)

Run the interactive configuration wizard:

```shell
ccr init
```

#### Manual Configuration

Create your `~/.claude-code-router/config.json` file:

```json
{
  "enabled": true,
  "baseURL": "https://llmadaptive.uk/api/v1",
  "api_key": "your-adaptive-api-key-here",
  "timeout": 30000,
  "HOST": "127.0.0.1",
  "PORT": 3456,
  "API_TIMEOUT_MS": 600000,
  "LOG": true,
  "protocol_manager_config": {
    "cost_bias": 0.5,
    "complexity_threshold": 0.7,
    "token_threshold": 4000
  },
  "semantic_cache": {
    "enabled": true,
    "ttl": 3600,
    "max_size": 1000,
    "similarity_threshold": 0.8
  },
  "fallback_mode": "sequential"
}
```

**Key Settings:**
- **`baseURL`**: Always `https://llmadaptive.uk/api/v1` for Adaptive
- **`api_key`**: Your API key from [llmadaptive.uk](https://llmadaptive.uk)
- **`protocol_manager_config`**: Configure intelligent model selection
- **`semantic_cache`**: Enable response caching for cost savings

### 4. Running Claude Code with the Router

Start the router and run Claude Code:

```shell
ccr start
ccr code
```

Or simply run `ccr code` directly - the router will auto-start if not running.

## 📋 CLI Commands

```shell
ccr init          # Interactive configuration setup
ccr start         # Start the router server
ccr stop          # Stop the router server
ccr restart       # Restart the router server
ccr status        # Show server status
ccr code          # Run Claude Code through the router
ccr test          # Test API connection
ccr logs          # View server logs
```

## 🛠️ Development

This project uses modern development tools for code quality and consistency:

- **Build**: TypeScript compilation with `tsdown` (esbuild-based)
- **Format**: Code formatting with Biome (`bun run format`)
- **Lint**: Code linting with Biome (`bun run lint`)
- **Type Check**: TypeScript type checking (`bun run type-check`)

Available scripts:

```shell
bun run build         # Build the project
bun run build:watch   # Build with watch mode
bun run dev           # Development mode (build:watch)
bun run format        # Format code with Biome
bun run format:check  # Check code formatting
bun run lint          # Lint code with Biome
bun run lint:fix      # Fix linting issues automatically
bun run check         # Run both format and lint checks
bun run check:fix     # Fix both format and lint issues
bun run type-check    # Run TypeScript type checking
```

### Code Quality Tools

The project uses **Biome** for unified formatting and linting, providing:
- Fast TypeScript/JavaScript formatting
- ESLint-compatible linting rules
- Node.js protocol imports enforcement
- Consistent code style across the project

### Build System

Built with **tsdown** (esbuild-based) for:
- Fast TypeScript compilation
- ESM and CommonJS output formats
- Optimized bundling for CLI distribution
