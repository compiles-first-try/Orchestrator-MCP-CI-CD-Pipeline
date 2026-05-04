import { parseCommandText } from "./parse.js";

export interface CommandContext {
  readonly userId: string;
  readonly userEmail: string | undefined;
  readonly channelId: string;
  readonly text: string;
}

// Result of dispatching a slash command. Either:
//   - reply with chat text (default), OR
//   - open a modal (used for any flow capturing secrets — memory:
//     no_secrets_in_chat).
// The dispatcher in apps/slack-bot/src/index.ts inspects the discriminator
// and either responds with text or calls views.open.
export type CommandResult =
  | { readonly kind: "reply"; readonly text: string; readonly responseType?: "in_channel" | "ephemeral" }
  | { readonly kind: "open_modal"; readonly modal: ModalSpec };

export interface ModalSpec {
  readonly callbackId: string;
  readonly title: string;
  readonly submitText?: string;
  readonly fields: readonly ModalField[];
  // Opaque blob round-tripped through `view.private_metadata`. Use it to
  // carry caller identity / context to the view_submission handler so the
  // handler doesn't need to re-derive what the slash command already knew.
  readonly privateMetadata?: string;
}

export interface ModalField {
  readonly key: string;
  readonly label: string;
  readonly hint?: string;
  readonly required?: boolean;
  readonly placeholder?: string;
  readonly initialValue?: string;
}

// Convenience constructors for handler ergonomics.
export function reply(text: string, responseType: "in_channel" | "ephemeral" = "in_channel"): CommandResult {
  return { kind: "reply", text, responseType };
}

export function openModal(modal: ModalSpec): CommandResult {
  return { kind: "open_modal", modal };
}

export type CommandHandler = (context: CommandContext, args: readonly string[]) => Promise<CommandResult>;

// Single-level verb dispatcher for /rpa <verb> ...args.
export class CommandRouter {
  readonly #handlers = new Map<string, CommandHandler>();

  register(verb: string, handler: CommandHandler): void {
    this.#handlers.set(verb, handler);
  }

  async dispatch(context: CommandContext): Promise<CommandResult> {
    const parsed = parseCommandText(context.text);
    if (parsed.verb === "") {
      return reply(helpText(this.#handlers.keys()), "ephemeral");
    }
    const handler = this.#handlers.get(parsed.verb);
    if (handler === undefined) {
      return reply(`Unknown command: \`${parsed.verb}\`. Try \`/rpa help\`.`, "ephemeral");
    }
    try {
      return await handler(context, parsed.args);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unexpected error.";
      return reply(`:warning: ${message}`, "ephemeral");
    }
  }
}

function helpText(verbs: Iterable<string>): string {
  const list = [...verbs].sort();
  if (list.length === 0) return "No commands registered.";
  return `Available verbs: ${list.map((v) => `\`${v}\``).join(", ")}`;
}
