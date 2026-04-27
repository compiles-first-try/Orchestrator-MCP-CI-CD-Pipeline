import type { FastifyReply, FastifyRequest, preHandlerHookHandler } from "fastify";
import {
  can,
  PermissionDeniedError,
  type PermissionContext,
  type PermissionKey,
} from "@rpa-platform/shared";
import type { Authenticator } from "./auth.js";

export type ContextResolver = (request: FastifyRequest) => PermissionContext | undefined;

export function requireAuth(authenticator: Authenticator): preHandlerHookHandler {
  return async (request, reply) => {
    if (request.actor !== undefined) return;
    const actor = await authenticator.authenticate(request);
    if (actor === undefined) {
      reply.code(401).send({ code: "auth.unauthorized", message: "Authentication required." });
      return;
    }
    request.actor = actor;
  };
}

export function requirePermission(
  permission: PermissionKey,
  resolveContext?: ContextResolver,
): preHandlerHookHandler {
  return async (request, reply) => {
    await checkPermission(request, reply, permission, resolveContext);
  };
}

export type PermissionResolver = (request: FastifyRequest) => PermissionKey | undefined;

export function requireDynamicPermission(
  resolvePermission: PermissionResolver,
  resolveContext?: ContextResolver,
): preHandlerHookHandler {
  return async (request, reply) => {
    const permission = resolvePermission(request);
    if (permission === undefined) {
      reply
        .code(400)
        .send({ code: "request.invalid", message: "Could not resolve required permission." });
      return;
    }
    await checkPermission(request, reply, permission, resolveContext);
  };
}

async function checkPermission(
  request: FastifyRequest,
  reply: FastifyReply,
  permission: PermissionKey,
  resolveContext: ContextResolver | undefined,
): Promise<void> {
  const actor = request.actor;
  if (actor === undefined) {
    reply.code(401).send({ code: "auth.unauthorized", message: "Authentication required." });
    return;
  }
  const context = resolveContext?.(request);
  if (can(actor, permission, context) === false) {
    const err = new PermissionDeniedError(permission);
    reply.code(403).send({ code: err.code, message: err.message });
  }
}

export function unauthorized(reply: FastifyReply): void {
  reply.code(401).send({ code: "auth.unauthorized", message: "Authentication required." });
}
