# Claude Code Router

> A Claude Code router powered by Adaptive.

![](blog/images/claude-code.png)

## ✨ Features

- **Adaptive Model Selection**: Intelligent model routing using adaptive model selection technology
- **Simple Configuration**: Easy setup with OpenAI-compatible API endpoints
- **Stream Processing**: Seamless request/response format conversion
- **Auto-Start**: Automatically starts when running Claude Code commands
- **Development Tools**: Built-in formatting, linting, and type checking with Biome

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

### 2. Configuration

Create and configure your `~/.claude-code-router/config.json` file:

```json
{
  "enabled": true,
  "endpoint": "https://api.openai.com/v1/chat/completions",
  "api_key": "your-api-key",
  "timeout": 30000,
  "HOST": "127.0.0.1",
  "PORT": 3456,
  "API_TIMEOUT_MS": 600000,
  "LOG": true
}
```

Configuration options:

- **`enabled`**: Whether the router is enabled
- **`endpoint`**: The OpenAI-compatible API endpoint
- **`api_key`**: Your API key for the service
- **`timeout`**: Request timeout in milliseconds
- **`HOST`**: Server host address (default: 127.0.0.1)
- **`PORT`**: Server port (default: 3456)
- **`API_TIMEOUT_MS`**: API timeout in milliseconds
- **`LOG`** (optional): Enable logging to `~/.claude-code-router/claude-code-router.log`

### 3. Running Claude Code with the Router

Start Claude Code using the router:

```shell
ccr code
```

> **Note**: After modifying the configuration file, you need to restart the service for the changes to take effect:
>
> ```shell
> ccr restart
> ```

## 🛠️ Development

This project uses modern development tools for code quality and consistency:

- **Build**: TypeScript compilation with `tsdown`
- **Format**: Code formatting with Biome (`bun run format`)
- **Lint**: Code linting with Biome (`bun run lint`)
- **Type Check**: TypeScript type checking (`bun run type-check`)

Available scripts:

```shell
bun run build       # Build the project
bun run format      # Format code with Biome
bun run lint        # Lint code with Biome
bun run type-check  # Run TypeScript type checking
```
