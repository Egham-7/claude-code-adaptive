export interface ModelCapability {
	model_name: string;
	description?: string;
	provider?: string;
	cost_per_1m_input_tokens?: number;
	cost_per_1m_output_tokens?: number;
	max_context_tokens?: number;
	max_output_tokens?: number;
	supports_function_calling?: boolean;
	languages_supported?: string[];
	model_size_params?: string;
	latency_tier?: string;
}

export interface ProtocolManagerConfig {
	models?: ModelCapability[];
	cost_bias?: number;
	complexity_threshold?: number;
	token_threshold?: number;
}

export interface CacheConfig {
	enabled?: boolean;
	ttl?: number;
	max_size?: number;
	similarity_threshold?: number;
}

export type FallbackMode = "sequential" | "parallel";

export interface Config {
	// Core router settings
	enabled: boolean;
	endpoint: string;
	api_key: string;
	timeout: number;

	// Server settings
	HOST: string;
	PORT: number;
	API_TIMEOUT_MS: number;

	// Optional logging
	LOG?: boolean;

	// Advanced routing features
	protocol_manager_config?: ProtocolManagerConfig;
	semantic_cache?: CacheConfig;
	fallback_mode?: FallbackMode;
}
