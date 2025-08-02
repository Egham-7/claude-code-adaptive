import { log } from "./log";
import OpenAI from "openai";
import type {
  ChatCompletionCreateParams,
  ChatCompletion,
} from "openai/resources/chat/completions";
import type {
  MessageCreateParams,
  Message,
} from "@anthropic-ai/sdk/resources/messages";

/**
 * Transforms a Claude request into the OpenAI format.
 */
const transformClaudeToOpenAI = (
  claudeRequest: MessageCreateParams,
  config: Record<string, any>,
): ChatCompletionCreateParams => {
  console.log("Claude Request: ", claudeRequest);
  // Transform Claude's /v1/messages format to OpenAI's /v1/chat/completions format
  const {
    messages,
    system,
    tools,
    model,
    max_tokens,
    temperature,
    stream,
    tool_choice,
  } = claudeRequest;

  const openAIMessages = [];
  const toolResponsesQueue = new Map();

  // Add system message if present
  if (system) {
    if (typeof system === "string") {
      openAIMessages.push({ role: "system", content: system });
    } else if (Array.isArray(system)) {
      const systemContent = system.map((item) => item.text || "").join(" ");
      openAIMessages.push({ role: "system", content: systemContent });
    }
  }

  // First pass: collect tool responses
  if (Array.isArray(messages)) {
    messages.forEach((msg: any) => {
      if (msg && Array.isArray(msg.content)) {
        const toolParts = msg.content.filter(
          (c: any) => c && c.type === "tool_result" && c.tool_use_id,
        );
        toolParts.forEach((tool: any) => {
          if (!toolResponsesQueue.has(tool.tool_use_id)) {
            toolResponsesQueue.set(tool.tool_use_id, []);
          }
          toolResponsesQueue.get(tool.tool_use_id).push({
            role: "tool",
            content:
              typeof tool.content === "string"
                ? tool.content
                : JSON.stringify(tool.content),
            tool_call_id: tool.tool_use_id,
          });
        });
      }
    });
  }

  // Transform messages
  if (Array.isArray(messages)) {
    for (let i = 0; i < messages.length; i++) {
      const msg = messages[i];

      // Skip if message is null or undefined
      if (!msg) continue;

      if (typeof msg.content === "string") {
        openAIMessages.push({
          role: msg.role,
          content: msg.content,
        });
      } else if (Array.isArray(msg.content)) {
        if (msg.role === "user") {
          // Handle user messages with complex content
          const textAndMediaParts = (msg.content || []).filter(
            (c: any) =>
              c &&
              ((c.type === "text" && c.text) ||
                (c.type === "image" && c.source)),
          );

          if (textAndMediaParts.length > 0) {
            const content = textAndMediaParts.map((part: any) => {
              if (part.type === "image") {
                return {
                  type: "image_url",
                  image_url: {
                    url:
                      part.source?.type === "base64"
                        ? `data:${part.source.media_type};base64,${part.source.data}`
                        : part.source.url,
                  },
                };
              }
              return {
                type: "text",
                text: part.text,
              };
            });

            openAIMessages.push({
              role: "user",
              content:
                content.length === 1 && content[0].type === "text"
                  ? content[0].text
                  : content,
            });
          }
        } else if (msg.role === "assistant") {
          // Handle assistant messages with tool calls
          const message: any = {
            role: "assistant",
            content: null,
          };

          const textParts = (msg.content || []).filter(
            (c: any) => c && c.type === "text" && c.text,
          );
          if (textParts.length > 0) {
            message.content = textParts
              .map((text: any) => text.text)
              .join("\n");
          }

          const toolCallParts = (msg.content || []).filter(
            (c: any) => c && c.type === "tool_use" && c.id,
          );
          if (toolCallParts.length > 0) {
            message.tool_calls = toolCallParts.map((tool: any) => ({
              id: tool.id,
              type: "function",
              function: {
                name: tool.name,
                arguments: JSON.stringify(tool.input || {}),
              },
            }));
            if (!message.content) {
              message.content = null;
            }
          }

          openAIMessages.push(message);

          // Add corresponding tool responses
          if (toolCallParts.length > 0) {
            toolCallParts.forEach((toolCall: any) => {
              if (toolResponsesQueue.has(toolCall.id)) {
                const responses = toolResponsesQueue.get(toolCall.id);
                responses.forEach((response: any) => {
                  openAIMessages.push(response);
                });
                toolResponsesQueue.delete(toolCall.id);
              }
            });
          }
        }
      }
    }
  }

  // Add any remaining tool responses
  for (const [_, responses] of toolResponsesQueue.entries()) {
    responses.forEach((response: any) => {
      openAIMessages.push(response);
    });
  }

  // Base request structure
  const openAIRequest: any = {
    messages: openAIMessages,
    model,
    max_tokens,
    temperature,
    stream: stream || false, // Use stream option from request
  };

  // Handle tools
  if (tools && tools.length > 0) {
    openAIRequest.tools = tools.map((tool: any) => ({
      type: "function",
      function: {
        name: tool.name,
        description: tool.description,
        parameters: tool.input_schema,
      },
    }));

    if (tool_choice) {
      if (tool_choice.type === "auto") {
        openAIRequest.tool_choice = "auto";
      } else if (tool_choice.type === "tool") {
        openAIRequest.tool_choice = {
          type: "function",
          function: { name: tool_choice.name },
        };
      }
    }
  }

  // Add global custom parameters
  if (config.protocol_manager_config) {
    openAIRequest.protocol_manager_config = config.protocol_manager_config;
  }

  if (config.semantic_cache) {
    openAIRequest.semantic_cache = config.semantic_cache;
  }

  if (config.fallback_mode) {
    openAIRequest.fallback_mode = config.fallback_mode;
  }

  return openAIRequest;
};

/**
 * Transforms an OpenAI response back to the Claude format.
 */
const transformOpenAIToClaude = (openAIResponse: ChatCompletion): Message => {
  console.log("OpenAI Response: ", openAIResponse);
  // Transform OpenAI response back to Claude format
  const { choices, usage } = openAIResponse;

  if (!choices || choices.length === 0) {
    throw new Error("No choices in OpenAI response");
  }

  const choice = choices[0];
  const message = choice.message;
  const content: any[] = [];

  // Handle text content
  if (message.content) {
    content.push({
      type: "text",
      text: message.content,
    });
  }

  // Handle tool calls
  if (message.tool_calls && message.tool_calls.length > 0) {
    message.tool_calls.forEach((toolCall: any) => {
      let parsedInput = {};
      try {
        const argumentsStr = toolCall.function.arguments || "{}";
        if (typeof argumentsStr === "object") {
          parsedInput = argumentsStr;
        } else if (typeof argumentsStr === "string") {
          parsedInput = JSON.parse(argumentsStr);
        }
      } catch (parseError) {
        parsedInput = { text: toolCall.function.arguments || "" };
      }

      content.push({
        type: "tool_use",
        id: toolCall.id,
        name: toolCall.function.name,
        input: parsedInput,
      });
    });
  }

  // Handle annotations (web search results)
  if (message.annotations) {
    const id = `srvtoolu_${Date.now()}`;
    content.push({
      type: "server_tool_use",
      id,
      name: "web_search",
      input: { query: "" },
    });
    content.push({
      type: "web_search_tool_result",
      tool_use_id: id,
      content: message.annotations.map((item: any) => ({
        type: "web_search_result",
        url: item.url_citation?.url,
        title: item.url_citation?.title,
      })),
    });
  }

  const stopReasonMapping: Record<
    string,
    "end_turn" | "max_tokens" | "tool_use" | "stop_sequence"
  > = {
    stop: "end_turn",
    length: "max_tokens",
    tool_calls: "tool_use",
    content_filter: "stop_sequence",
  };

  console.log("Usage: ", usage);

  return {
    id: openAIResponse.id || `msg_${Date.now()}`,
    type: "message",
    role: "assistant",
    content: content.length > 0 ? content : [{ type: "text", text: "" }],
    model: openAIResponse.model,
    stop_reason: (stopReasonMapping[
      choice.finish_reason as keyof typeof stopReasonMapping
    ] || "end_turn") as
      | "end_turn"
      | "max_tokens"
      | "tool_use"
      | "stop_sequence",
    stop_sequence: null,
    usage: usage
      ? {
          input_tokens: usage.prompt_tokens,
          output_tokens: usage.completion_tokens,
          cache_creation_input_tokens: null,
          cache_read_input_tokens: null,
          server_tool_use: null,
          service_tier: null,
        }
      : {
          input_tokens: 0,
          output_tokens: 0,
          cache_creation_input_tokens: null,
          cache_read_input_tokens: null,
          server_tool_use: null,
          service_tier: null,
        },
  };
};

import { convertOpenAIStreamToAnthropic } from "./streamConverter";

interface AutoRouterConfig {
  enabled: boolean;
  apiKey: string;
  baseURL: string;
  timeout?: number;
  global?: Record<string, any>;
}

interface RouterConfig {
  AutoRouter: AutoRouterConfig;
}

/**
 * Forwards a request to the OpenAI API and sends the response back to the client.
 */
const forwardToOpenAI = async (req: any, reply: any, config: RouterConfig) => {
  try {
    const autoRouterConfig = config.AutoRouter;
    if (!autoRouterConfig || !autoRouterConfig.enabled) {
      throw new Error("AutoRouter not configured or disabled");
    }

    // Use global configuration
    const globalConfig = autoRouterConfig.global || {};

    // Transform Claude request to OpenAI format with global config
    const claudeRequest = req.body as MessageCreateParams;
    const openAIRequest = transformClaudeToOpenAI(claudeRequest, globalConfig);

    log("Forwarding request to OpenAI API:", autoRouterConfig.baseURL);

    // Initialize OpenAI client
    const openai = new OpenAI({
      apiKey: autoRouterConfig.apiKey,
      baseURL: autoRouterConfig.baseURL,
      defaultHeaders: {
        Authorization: `Bearer ${autoRouterConfig.apiKey}`,
        "X-API-Key": autoRouterConfig.apiKey,
        "api-key": autoRouterConfig.apiKey,
        "X-Stainless-API-Key": autoRouterConfig.apiKey,
      },
    });

    // Call OpenAI-compatible API using SDK
    log(
      "Sending request to OpenAI API:",
      JSON.stringify(openAIRequest, null, 2),
    );

    if (openAIRequest.stream) {
      // Handle streaming response
      const stream = await openai.chat.completions.create(openAIRequest);

      // Convert the OpenAI stream to a web-compatible ReadableStream
      const webStream = new ReadableStream({
        async start(controller) {
          const encoder = new TextEncoder();
          try {
            for await (const chunk of stream) {
              const chunkStr = `data: ${JSON.stringify(chunk)}\n\n`;
              controller.enqueue(encoder.encode(chunkStr));
            }
            controller.enqueue(encoder.encode("data: [DONE]\n\n"));
          } catch (error) {
            controller.error(error);
          } finally {
            controller.close();
          }
        },
      });

      const convertedStream = await convertOpenAIStreamToAnthropic(webStream);

      reply.raw.writeHead(200, {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
        Connection: "keep-alive",
      });

      const reader = convertedStream.getReader();
      try {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          reply.raw.write(value);
        }
      } finally {
        reader.releaseLock();
        reply.raw.end();
      }
    } else {
      // Handle non-streaming response
      const result = await openai.chat.completions.create(openAIRequest);

      log("OpenAI API raw response:", JSON.stringify(result, null, 2));

      // Transform OpenAI response to Claude format
      const claudeResponse = transformOpenAIToClaude(result);

      log(
        "Transformed Claude response:",
        JSON.stringify(claudeResponse, null, 2),
      );

      reply.send(claudeResponse);
    }

    log("Successfully forwarded request to OpenAI API");
  } catch (error: any) {
    log("Error forwarding to OpenAI API:", error.message);

    reply.code(500).send({
      type: "error",
      error: {
        type: "api_error",
        message: `Router error: ${error.message}`,
      },
    });
  }
};

export const router = async (req: any, reply: any, config: RouterConfig) => {
  await forwardToOpenAI(req, reply, config);
};
