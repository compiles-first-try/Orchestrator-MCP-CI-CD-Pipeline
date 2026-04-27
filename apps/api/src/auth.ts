import type { FastifyRequest } from "fastify";
import type { UserWithRoles } from "@rpa-platform/shared";

export interface Authenticator {
  authenticate(request: FastifyRequest): Promise<UserWithRoles | undefined>;
}

export interface AuthContext {
  readonly actor: UserWithRoles;
}

declare module "fastify" {
  interface FastifyRequest {
    actor?: UserWithRoles;
  }
}

export class TestAuthenticator implements Authenticator {
  constructor(private readonly users: ReadonlyMap<string, UserWithRoles>) {}
  async authenticate(request: FastifyRequest): Promise<UserWithRoles | undefined> {
    const header = request.headers["x-test-actor"];
    const id = typeof header === "string" ? header : undefined;
    if (id === undefined) return undefined;
    return this.users.get(id);
  }
}
