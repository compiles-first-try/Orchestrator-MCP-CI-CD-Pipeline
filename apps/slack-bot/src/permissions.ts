import { can, type PermissionContext, type PermissionKey } from "@rpa-platform/shared";
import type { CommandHandler } from "./types.js";

export function withPermission(
  permission: PermissionKey,
  handler: CommandHandler,
  resolveContext?: (ctx: Parameters<CommandHandler>[0]) => PermissionContext | undefined,
): CommandHandler {
  return async (ctx) => {
    const context = resolveContext?.(ctx);
    if (can(ctx.actor, permission, context) === false) {
      await ctx.respond(
        `:no_entry_sign: You don't have permission \`${permission}\`${
          context?.tenant !== undefined ? ` on tenant \`${context.tenant}\`` : ""
        }.`,
      );
      return;
    }
    await handler(ctx);
  };
}
