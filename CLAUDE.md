# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

-   **Build the project**:
    ```bash
    npm run build
    ```
-   **Start the router server**:
    ```bash
    ccr start
    ```
-   **Stop the router server**:
    ```bash
    ccr stop
    ```
-   **Check the server status**:
    ```bash
    ccr status
    ```
-   **Run Claude Code through the router**:
    ```bash
    ccr code "<your prompt>"
    ```
-   **Release a new version**:
    ```bash
    npm run release
    ```

## Architecture

This project is a TypeScript-based router for Claude Code requests. It allows routing requests to different large language models (LLMs) from various providers based on custom rules.

-   **Entry Point**: The main command-line interface logic is in `src/cli.ts`. It handles parsing commands like `start`, `stop`, and `code`.
-   **Server**: The `ccr start` command launches a server that listens for requests from Claude Code. The server logic is initiated from `src/index.ts`.
-   **Configuration**: The router is configured via a JSON file located at `~/.claude-code-router/config.json`. This file defines API providers, routing rules, and custom transformers. An example can be found in `config.example.json`.
-   **Routing**: The core routing logic determines which LLM provider and model to use for a given request. It supports default routes for different scenarios (`default`, `background`, `think`, `longContext`, `webSearch`) and can be extended with a custom JavaScript router file. The router logic is likely in `src/utils/router.ts`.
-   **Providers and Transformers**: The application supports multiple LLM providers. Transformers adapt the request and response formats for different provider APIs.
-   **Claude Code Integration**: When a user runs `ccr code`, the command is forwarded to the running router service. The service then processes the request, applies routing rules, and sends it to the configured LLM. If the service isn't running, `ccr code` will attempt to start it automatically.
-   **Dependencies**: The project is built with `esbuild`. It has a key local dependency `@musistudio/llms`, which probably contains the core logic for interacting with different LLM APIs.
-   `@musistudio/llms` is implemented based on `fastify` and exposes `fastify`'s hook and middleware interfaces, allowing direct use of `server.addHook`.

## Core Files and Components

### **Entry Points**
- `src/cli.ts` - Main CLI interface handling `ccr` commands
- `src/index.ts` - Server initialization and startup logic
- `dist/cli.js` - Compiled CLI binary

### **Core Server Components**
- `src/server.ts` - Fastify-based HTTP server with static UI and API endpoints
- `src/middleware/auth.ts` - Authentication middleware (currently allows all requests)
- `src/utils/router.ts` - Core routing logic for AutoRouter mode
- `src/utils/streamConverter.ts` - **CRITICAL**: Stream processing and format conversion

### **Configuration System**
- `src/utils/index.ts` - Configuration management with JSON5 support
- `config.example.json` - Example configuration file
- `~/.claude-code-router/config.json` - User configuration location

### **Type Definitions**
- `src/types/stream.ts` - Stream converter and state management types
- `src/types/` - All TypeScript type definitions

### **Build and Packaging**
- `tsup.config.ts` - Build configuration using tsup (esbuild)
- `package.json` - Project dependencies and scripts
- `.changeset/` - Version management configuration

## Operating Modes

### **AutoRouter Mode (Recommended)**
Simplified mode that forwards all requests to a single OpenAI-compatible endpoint:
- Single provider configuration
- Direct request forwarding
- Minimal setup required
- Most common use case

### **Legacy Mode (Advanced)**
Complex multi-provider routing with custom rules:
- Multiple LLM providers
- Context-aware routing (default, background, think, longContext, webSearch)
- Custom JavaScript routing logic
- Provider-specific transformers

## Code Style Guidelines

-   **TypeScript**: Use strict TypeScript with proper type definitions
-   **ES Modules**: Use ES module syntax (`import`/`export`), not CommonJS (`require`)
-   **Destructuring**: Destructure imports when possible (`import { foo } from 'bar'`)
-   **Async/Await**: Prefer `async`/`await` over promise chains
-   **Error Handling**: Use proper error handling with try/catch blocks
-   **Type Safety**: Always use proper types, especially for stream processing
-   **Comments**: Add JSDoc comments for public functions and complex logic

## Development Workflow

### **Type Checking**
```bash
# Always run type check after making changes
npm run type-check
# OR
bun run type-check
```

### **Development Process**
1. **Make changes** to source files in `src/`
2. **Build the project** with `npm run build`
3. **Test locally** with `ccr start` and `ccr code "test prompt"`
4. **Run type check** to ensure no TypeScript errors
5. **Commit changes** with descriptive commit messages

### **Testing the Router**
```bash
# Start the router
ccr start

# Test with a simple prompt
ccr code "Hello, how are you?"

# Check status
ccr status

# Stop when done
ccr stop
```

## Stream Processing (CRITICAL COMPONENT)

The `src/utils/streamConverter.ts` file is one of the most complex and important parts of the system:

### **Key Functions**
- `convertOpenAIStreamToAnthropic()` - Main conversion function
- `handleTextContentWithReasoning()` - Processes content with XML tag extraction
- `extractReasoningFromContent()` - Extracts `<thinking>`, `<reasoning>`, `<thoughts>` tags
- `handleToolCalls()` - Manages tool call state and responses

### **Important Notes**
- **Stream State Management**: Complex state tracking across chunks
- **Reasoning Extraction**: Automatically extracts thinking content from XML tags
- **Tool Call Handling**: Sophisticated tool call index management
- **Error Recovery**: Robust error handling for malformed streams
- **Type Safety**: Uses extended interfaces to handle non-standard OpenAI properties

### **When Modifying Stream Converter**
- Always test with both streaming and non-streaming responses
- Verify tool calls work correctly
- Test reasoning extraction with `<thinking>` tags
- Run type check to ensure OpenAI/Anthropic type compatibility
- Test with real Claude Code sessions

## Configuration Management

### **Config File Location**
- `~/.claude-code-router/config.json` - Main configuration
- `~/.claude-code-router/plugins/` - Custom plugins
- `~/.claude-code-router/claude-code-router.log` - Logs

### **Setup Process**
```bash
# Initial setup (interactive)
ccr start

# Manual config editing
ccr ui  # Opens web interface
```

### **Environment Variables**
The router automatically sets these for Claude Code:
```bash
ANTHROPIC_BASE_URL=http://127.0.0.1:3456
ANTHROPIC_AUTH_TOKEN=test
```

## Build System and Dependencies

### **Build Process**
- **Bundler**: tsup (esbuild-based) for fast builds
- **Output**: Both CommonJS and ESM formats
- **External Dependencies**: AI SDKs and server dependencies preserved
- **Target**: Node.js 18+

### **Key Dependencies**
- `fastify` - HTTP server framework
- `openai` - OpenAI SDK for API interactions
- `@anthropic-ai/sdk` - Anthropic SDK for type definitions
- `uuid` - UUID generation for message IDs
- `tiktoken` - Token counting (currently unused but available)

### **Development Dependencies**
- `typescript` - TypeScript compiler
- `tsup` - Build tool
- `@changesets/cli` - Version management

## Claude Code Integration

### **How It Works**
1. Router intercepts Claude Code requests by setting `ANTHROPIC_BASE_URL`
2. Converts Anthropic API format to OpenAI-compatible format
3. Routes request to configured LLM provider
4. Converts response back to Anthropic format
5. Handles streaming with proper format conversion

### **Auto-start Behavior**
- `ccr code` automatically starts the service if not running
- Service tracks active Claude Code sessions with reference counting
- Automatically shuts down when no sessions are active

## Common Issues and Troubleshooting

### **Type Errors**
- **Problem**: TypeScript errors in `streamConverter.ts`
- **Solution**: Use only standard OpenAI API properties, extend types carefully
- **Never access**: `chunk.error`, `choice.delta.thinking`, `choice.delta.annotations` directly

### **Stream Processing Issues**
- **Problem**: Malformed streaming responses
- **Solution**: Check `extractReasoningFromContent()` and buffer management
- **Debug**: Use logging in stream converter functions

### **Configuration Issues**
- **Problem**: Router not starting or connecting
- **Solution**: Check `~/.claude-code-router/config.json` format
- **Reset**: Delete config file and run `ccr start` for fresh setup

### **Port Conflicts**
- **Problem**: Port 3456 already in use
- **Solution**: Change port in configuration or stop conflicting service

## Release Process

### **Version Management**
```bash
# Create a changeset for your changes
npx changeset

# Build and release
npm run release
```

### **Changesets Workflow**
1. Make your changes
2. Run `npx changeset` to document changes
3. Commit changeset files
4. Release process automatically generates changelog and bumps version

## Docker Support

### **Local Development**
```bash
# Build container
docker build -t claude-code-router .

# Run with config volume
docker run -p 3456:3456 -v ~/.claude-code-router:/app/.claude-code-router claude-code-router
```

## Important Security Notes

- **Authentication**: Currently disabled (auth middleware allows all requests)
- **Local Only**: Designed to run locally, not for production deployment
- **API Keys**: Keep provider API keys secure in configuration
- **Process Management**: Service automatically manages process lifecycle

## Package Manager Support

The project supports both npm and bun:
```bash
# Using npm
npm install
npm run build

# Using bun (faster)
bun install
bun run build
```

Always use consistent package manager within a session.

---

## Quick Reference

### **Essential Commands**
```bash
ccr start          # Start router service
ccr code "prompt"  # Run Claude Code through router  
ccr stop           # Stop service
npm run type-check # Verify TypeScript
npm run build      # Build project
```

### **Key Files to Know**
- `src/utils/streamConverter.ts` - Stream processing (most complex)
- `src/utils/router.ts` - Core routing logic
- `src/cli.ts` - CLI command handling
- `config.example.json` - Configuration reference
- `tsup.config.ts` - Build configuration

### **When Things Break**
1. Check TypeScript with `npm run type-check`
2. Verify configuration with `ccr status`
3. Check logs at `~/.claude-code-router/claude-code-router.log`
4. Reset config by deleting `~/.claude-code-router/config.json`
5. Test with simple `ccr code "hello"` after restart
