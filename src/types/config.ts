import { z } from "zod";

export const ModelCapabilitySchema = z.object({
	model_name: z.string(),
	description: z.string().optional(),
	provider: z.string().optional(),
	cost_per_1m_input_tokens: z.number().optional(),
	cost_per_1m_output_tokens: z.number().optional(),
	max_context_tokens: z.number().optional(),
	max_output_tokens: z.number().optional(),
	supports_function_calling: z.boolean().optional(),
	languages_supported: z.array(z.string()).optional(),
	model_size_params: z.string().optional(),
	latency_tier: z.string().optional(),
});

export const ProtocolManagerConfigSchema = z.object({
	models: z.array(ModelCapabilitySchema).optional(),
	cost_bias: z.number().min(0).max(1).optional(),
	complexity_threshold: z.number().min(0).max(1).optional(),
	token_threshold: z.number().positive().optional(),
});

export const CacheConfigSchema = z.object({
	enabled: z.boolean().optional(),
	ttl: z.number().positive().optional(),
	max_size: z.number().positive().optional(),
	similarity_threshold: z.number().min(0).max(1).optional(),
});

export const FallbackModeSchema = z.enum(["sequential", "parallel"]);

export const ConfigSchema = z.object({
	// Core router settings
	enabled: z.boolean(),
	baseURL: z.string().url("baseURL must be a valid URL"),
	endpoint: z.string().default("chat/completions"),
	api_key: z.string().min(1, "api_key is required"),
	timeout: z.number().positive(),

	// Server settings
	HOST: z.string().refine((val) => {
		return val === "0.0.0.0" || val === "127.0.0.1" || /^(\d{1,3}\.){3}\d{1,3}$/.test(val);
	}, "HOST must be a valid IP address"),
	PORT: z.number().int().min(1).max(65535),
	API_TIMEOUT_MS: z.number().positive(),

	// Optional logging
	LOG: z.boolean().optional(),

	// Advanced routing features
	protocol_manager_config: ProtocolManagerConfigSchema.optional(),
	semantic_cache: CacheConfigSchema.optional(),
	fallback_mode: FallbackModeSchema.optional(),
});

// Type inference from Zod schemas
export type ModelCapability = z.infer<typeof ModelCapabilitySchema>;
export type ProtocolManagerConfig = z.infer<typeof ProtocolManagerConfigSchema>;
export type CacheConfig = z.infer<typeof CacheConfigSchema>;
export type FallbackMode = z.infer<typeof FallbackModeSchema>;
export type Config = z.infer<typeof ConfigSchema>;
