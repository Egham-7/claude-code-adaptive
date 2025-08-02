import type { MessageStreamEvent } from "@anthropic-ai/sdk/resources/messages";
import type { ChatCompletionChunk } from "openai/resources/chat/completions";

export type OpenAIStreamChunk = ChatCompletionChunk;
export type AnthropicStreamEvent = MessageStreamEvent;

export interface StreamConverterState {
	readonly messageId: string;
	readonly model: string;
	hasStarted: boolean;
	hasTextContentStarted: boolean;
	hasFinished: boolean;
	isThinkingStarted: boolean;
	contentIndex: number;
	totalChunks: number;
	contentChunks: number;
	toolCallChunks: number;
	isClosed: boolean;
	readonly toolCalls: Map<number, ToolCallInfo>;
	readonly toolCallIndexToContentBlockIndex: Map<number, number>;

	// For reasoning extraction
	contentBuffer: string;
	thinkingBuffer: string;
	isInsideThinking: boolean;
	hasThinkingContent: boolean;
}

export interface ToolCallInfo {
	id: string;
	name: string;
	arguments: string;
	contentBlockIndex: number;
}

export interface StreamController<T> {
	enqueue(chunk: T): void;
	close(): void;
	error(error: Error): void;
}

export type StreamConverter<TInput, TOutput> = (
	inputStream: ReadableStream<TInput>
) => Promise<ReadableStream<TOutput>>;

export type StreamEventHandler<TEvent> = (
	event: TEvent,
	state: StreamConverterState,
	controller: StreamController<Uint8Array>
) => Promise<void> | void;

export interface StreamParserOptions {
	bufferSize?: number;
	timeout?: number;
	errorHandler?: (error: Error) => void;
}

export interface StreamTransformOptions extends StreamParserOptions {
	messageId?: string;
	enableLogging?: boolean;
}

export type StreamTransformer<TInput, TOutput> = {
	transform: StreamConverter<TInput, TOutput>;
	name: string;
	version: string;
};
