import { log } from "./log";
import { v4 as uuidv4 } from "uuid";
import type {
  OpenAIStreamChunk,
  AnthropicStreamEvent,
  StreamConverterState,
  StreamController,
  StreamConverter,
  StreamTransformOptions,
  ToolCallInfo,
} from "../types/stream";

class TypeSafeStreamController implements StreamController<Uint8Array> {
  private controller: ReadableStreamDefaultController<Uint8Array>;
  private encoder = new TextEncoder();
  private isClosed = false;

  constructor(controller: ReadableStreamDefaultController<Uint8Array>) {
    this.controller = controller;
  }

  enqueue(chunk: Uint8Array): void {
    if (!this.isClosed) {
      try {
        this.controller.enqueue(chunk);
        if (log) {
          const dataStr = new TextDecoder().decode(chunk);
          log("send data:", dataStr.trim());
        }
      } catch (error) {
        if (
          error instanceof TypeError &&
          error.message.includes("Controller is already closed")
        ) {
          this.isClosed = true;
        } else {
          throw error;
        }
      }
    }
  }

  enqueueEvent(eventType: string, data: object): void {
    const eventData = `event: ${eventType}\ndata: ${JSON.stringify(data)}\n\n`;
    this.enqueue(this.encoder.encode(eventData));
  }

  close(): void {
    if (!this.isClosed) {
      try {
        this.controller.close();
        this.isClosed = true;
      } catch (error) {
        if (
          error instanceof TypeError &&
          error.message.includes("Controller is already closed")
        ) {
          this.isClosed = true;
        } else {
          throw error;
        }
      }
    }
  }

  error(error: Error): void {
    if (!this.isClosed) {
      try {
        this.controller.error(error);
      } catch (controllerError) {
        console.error("Controller error:", controllerError);
      }
    }
  }

  get closed(): boolean {
    return this.isClosed;
  }
}

class StreamState implements StreamConverterState {
  readonly messageId: string;
  readonly model: string;
  hasStarted = false;
  hasTextContentStarted = false;
  hasFinished = false;
  isThinkingStarted = false;
  contentIndex = 0;
  totalChunks = 0;
  contentChunks = 0;
  toolCallChunks = 0;
  isClosed = false;
  readonly toolCalls = new Map<number, ToolCallInfo>();
  readonly toolCallIndexToContentBlockIndex = new Map<number, number>();

  constructor(messageId?: string, model = "unknown") {
    this.messageId = messageId || `msg_${Date.now()}`;
    this.model = model;
  }
}

export const convertOpenAIStreamToAnthropic = async (
  openaiStream: ReadableStream<any>
): Promise<ReadableStream<Uint8Array>> => {
  return new ReadableStream({
    async start(controller) {
      const streamController = new TypeSafeStreamController(controller);
      const state = new StreamState();
      
      let reader: ReadableStreamDefaultReader<Uint8Array> | null = null;

      try {
        reader = openaiStream.getReader() as ReadableStreamDefaultReader<Uint8Array>;
        const decoder = new TextDecoder();
        let buffer = "";

        while (true) {
          if (streamController.closed) {
            break;
          }

          const { done, value } = await reader.read();
          if (done) break;

          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split("\n");
          buffer = lines.pop() || "";

          for (const line of lines) {
            if (streamController.closed || state.hasFinished) break;

            if (!line.startsWith("data: ")) continue;
            const data = line.slice(6);
            if (data === "[DONE]") continue;

            try {
              const chunk: OpenAIStreamChunk = JSON.parse(data);
              await processOpenAIChunk(chunk, state, streamController);
            } catch (parseError: any) {
              log(
                `Parse error: ${parseError.name} message: ${parseError.message} data: ${data}`
              );
            }
          }
        }
        streamController.close();
      } catch (error) {
        streamController.error(error as Error);
      } finally {
        if (reader) {
          try {
            reader.releaseLock();
          } catch (releaseError) {
            console.error("Reader release error:", releaseError);
          }
        }
      }
    },
    cancel(reason) {
      log("Stream cancelled:", reason);
    },
  });
};

async function processOpenAIChunk(
  chunk: OpenAIStreamChunk,
  state: StreamState,
  controller: TypeSafeStreamController
): Promise<void> {
  state.totalChunks++;
  log("Processing chunk:", JSON.stringify(chunk, null, 2));

  if (chunk.error) {
    controller.enqueueEvent("error", {
      type: "error",
      message: {
        type: "api_error",
        message: JSON.stringify(chunk.error),
      },
    });
    return;
  }

  // Update model from chunk
  if (chunk.model) {
    (state as any).model = chunk.model;
  }

  // Send message_start if this is the first chunk
  if (!state.hasStarted && !controller.closed && !state.hasFinished) {
    state.hasStarted = true;
    controller.enqueueEvent("message_start", {
      type: "message_start",
      message: {
        id: state.messageId,
        type: "message",
        role: "assistant",
        content: [],
        model: state.model,
        stop_reason: null,
        stop_sequence: null,
        usage: { input_tokens: 1, output_tokens: 1 },
      },
    });
  }

  const choice = chunk.choices?.[0];
  if (!choice) return;

  // Handle thinking content
  if (choice.delta?.thinking && !controller.closed && !state.hasFinished) {
    await handleThinkingContent(choice.delta.thinking, state, controller);
  }

  // Handle regular content
  if (choice.delta?.content && !controller.closed && !state.hasFinished) {
    await handleTextContent(choice.delta.content, state, controller);
  }

  // Handle annotations (web search results)
  if (choice.delta?.annotations?.length && !controller.closed && !state.hasFinished) {
    await handleAnnotations(choice.delta.annotations, state, controller);
  }

  // Handle tool calls
  if (choice.delta?.tool_calls && !controller.closed && !state.hasFinished) {
    await handleToolCalls(choice.delta.tool_calls, state, controller);
  }

  // Handle finish reason
  if (choice.finish_reason && !controller.closed && !state.hasFinished) {
    await handleFinishReason(choice.finish_reason, chunk.usage, state, controller);
  }
}

async function handleThinkingContent(
  thinking: any,
  state: StreamState,
  controller: TypeSafeStreamController
): Promise<void> {
  if (!state.isThinkingStarted) {
    controller.enqueueEvent("content_block_start", {
      type: "content_block_start",
      index: state.contentIndex,
      content_block: { type: "thinking", thinking: "" },
    });
    state.isThinkingStarted = true;
  }

  if (thinking.signature) {
    controller.enqueueEvent("content_block_delta", {
      type: "content_block_delta",
      index: state.contentIndex,
      delta: {
        type: "signature_delta",
        signature: thinking.signature,
      },
    });
    
    controller.enqueueEvent("content_block_stop", {
      type: "content_block_stop",
      index: state.contentIndex,
    });
    state.contentIndex++;
  } else if (thinking.content) {
    controller.enqueueEvent("content_block_delta", {
      type: "content_block_delta",
      index: state.contentIndex,
      delta: {
        type: "thinking_delta",
        thinking: thinking.content || "",
      },
    });
  }
}

async function handleTextContent(
  content: string,
  state: StreamState,
  controller: TypeSafeStreamController
): Promise<void> {
  state.contentChunks++;

  if (!state.hasTextContentStarted && !state.hasFinished) {
    state.hasTextContentStarted = true;
    controller.enqueueEvent("content_block_start", {
      type: "content_block_start",
      index: state.contentIndex,
      content_block: {
        type: "text",
        text: "",
      },
    });
  }

  if (!controller.closed && !state.hasFinished) {
    controller.enqueueEvent("content_block_delta", {
      type: "content_block_delta",
      index: state.contentIndex,
      delta: {
        type: "text_delta",
        text: content,
      },
    });
  }
}

async function handleAnnotations(
  annotations: any[],
  state: StreamState,
  controller: TypeSafeStreamController
): Promise<void> {
  controller.enqueueEvent("content_block_stop", {
    type: "content_block_stop",
    index: state.contentIndex,
  });
  state.hasTextContentStarted = false;

  annotations.forEach((annotation) => {
    state.contentIndex++;
    controller.enqueueEvent("content_block_start", {
      type: "content_block_start",
      index: state.contentIndex,
      content_block: {
        type: "web_search_tool_result",
        tool_use_id: `srvtoolu_${uuidv4()}`,
        content: [
          {
            type: "web_search_result",
            title: annotation.url_citation?.title || "",
            url: annotation.url_citation?.url || "",
          },
        ],
      },
    });

    controller.enqueueEvent("content_block_stop", {
      type: "content_block_stop",
      index: state.contentIndex,
    });
  });
}

async function handleToolCalls(
  toolCalls: any[],
  state: StreamState,
  controller: TypeSafeStreamController
): Promise<void> {
  state.toolCallChunks++;
  const processedInThisChunk = new Set<number>();

  for (const toolCall of toolCalls) {
    if (controller.closed) break;
    
    const toolCallIndex = toolCall.index ?? 0;
    if (processedInThisChunk.has(toolCallIndex)) continue;
    processedInThisChunk.add(toolCallIndex);

    const isUnknownIndex = !state.toolCallIndexToContentBlockIndex.has(toolCallIndex);

    if (isUnknownIndex) {
      const newContentBlockIndex = state.hasTextContentStarted
        ? state.toolCallIndexToContentBlockIndex.size + 1
        : state.toolCallIndexToContentBlockIndex.size;
      
      if (newContentBlockIndex !== 0) {
        controller.enqueueEvent("content_block_stop", {
          type: "content_block_stop",
          index: state.contentIndex,
        });
        state.contentIndex++;
      }

      state.toolCallIndexToContentBlockIndex.set(toolCallIndex, newContentBlockIndex);
      
      const toolCallId = toolCall.id || `call_${Date.now()}_${toolCallIndex}`;
      const toolCallName = toolCall.function?.name || `tool_${toolCallIndex}`;
      
      controller.enqueueEvent("content_block_start", {
        type: "content_block_start",
        index: state.contentIndex,
        content_block: {
          type: "tool_use",
          id: toolCallId,
          name: toolCallName,
          input: {},
        },
      });

      const toolCallInfo: ToolCallInfo = {
        id: toolCallId,
        name: toolCallName,
        arguments: "",
        contentBlockIndex: newContentBlockIndex,
      };
      state.toolCalls.set(toolCallIndex, toolCallInfo);
    } else if (toolCall.id && toolCall.function?.name) {
      const existingToolCall = state.toolCalls.get(toolCallIndex)!;
      const wasTemporary = existingToolCall.id.startsWith("call_") && 
                          existingToolCall.name.startsWith("tool_");

      if (wasTemporary) {
        existingToolCall.id = toolCall.id;
        existingToolCall.name = toolCall.function.name;
      }
    }

    if (toolCall.function?.arguments && !controller.closed && !state.hasFinished) {
      const currentToolCall = state.toolCalls.get(toolCallIndex);
      if (currentToolCall) {
        currentToolCall.arguments += toolCall.function.arguments;
      }

      try {
        controller.enqueueEvent("content_block_delta", {
          type: "content_block_delta",
          index: state.contentIndex,
          delta: {
            type: "input_json_delta",
            partial_json: toolCall.function.arguments,
          },
        });
      } catch (error: any) {
        // Fallback for malformed JSON
        const fixedArgument = toolCall.function.arguments
          .replace(/[\x00-\x1F\x7F-\x9F]/g, "")
          .replace(/\\/g, "\\\\")
          .replace(/"/g, '\\"');

        controller.enqueueEvent("content_block_delta", {
          type: "content_block_delta",
          index: state.contentIndex,
          delta: {
            type: "input_json_delta",
            partial_json: fixedArgument,
          },
        });
      }
    }
  }
}

async function handleFinishReason(
  finishReason: string,
  usage: any,
  state: StreamState,
  controller: TypeSafeStreamController
): Promise<void> {
  state.hasFinished = true;
  
  if (state.contentChunks === 0 && state.toolCallChunks === 0) {
    console.error("Warning: No content in the stream response!");
  }

  if ((state.hasTextContentStarted || state.toolCallChunks > 0) && !controller.closed) {
    controller.enqueueEvent("content_block_stop", {
      type: "content_block_stop",
      index: state.contentIndex,
    });
  }

  if (!controller.closed) {
    const stopReasonMapping: Record<string, string> = {
      stop: "end_turn",
      length: "max_tokens",
      tool_calls: "tool_use",
      content_filter: "stop_sequence",
    };

    const anthropicStopReason = stopReasonMapping[finishReason] || "end_turn";

    controller.enqueueEvent("message_delta", {
      type: "message_delta",
      delta: {
        stop_reason: anthropicStopReason,
        stop_sequence: null,
      },
      usage: {
        input_tokens: usage?.prompt_tokens || 0,
        output_tokens: usage?.completion_tokens || 0,
      },
    });

    controller.enqueueEvent("message_stop", {
      type: "message_stop",
    });
  }
}

export const createStreamConverter = (
  options: StreamTransformOptions = {}
) => {
  return convertOpenAIStreamToAnthropic;
};