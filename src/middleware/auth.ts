import type { FastifyReply, FastifyRequest } from "fastify";

export const apiKeyAuth =
	(_config: any) => (_req: FastifyRequest, _reply: FastifyReply, done: () => void) => {
		// Skip authentication - allow all requests
		done();
	};
