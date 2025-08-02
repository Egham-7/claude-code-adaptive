import { FastifyRequest, FastifyReply } from "fastify";

export const apiKeyAuth =
  (config: any) =>
  (req: FastifyRequest, reply: FastifyReply, done: () => void) => {
    // Skip authentication - allow all requests
    done();
  };
