import type { CommandHandler, SlashCommandContext } from "./types.js";

export class CommandRouter {
  private readonly handlers = new Map<string, CommandHandler>();
  private fallback: CommandHandler = async (ctx) => {
    await ctx.respond(`Unknown subcommand \`${ctx.subcommand}\`. Try \`/rpa help\` for the list.`);
  };

  register(name: string, handler: CommandHandler): void {
    this.handlers.set(name, handler);
  }

  setFallback(handler: CommandHandler): void {
    this.fallback = handler;
  }

  async dispatch(ctx: SlashCommandContext): Promise<void> {
    const handler = this.handlers.get(ctx.subcommand) ?? this.fallback;
    await handler(ctx);
  }
}
