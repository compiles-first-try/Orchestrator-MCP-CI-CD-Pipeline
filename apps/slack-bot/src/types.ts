import type { UserWithRoles } from "@rpa-platform/shared";

export interface SlashCommandInput {
  readonly command: string;
  readonly text: string;
  readonly slackUserId: string;
  readonly slackChannelId: string;
}

export interface SlashCommandContext {
  readonly input: SlashCommandInput;
  readonly actor: UserWithRoles;
  readonly subcommand: string;
  readonly args: readonly string[];
  ack(): Promise<void>;
  respond(text: string): Promise<void>;
}

export type CommandHandler = (ctx: SlashCommandContext) => Promise<void>;

export interface UserResolver {
  bySlackUserId(slackUserId: string): Promise<UserWithRoles | undefined>;
}
