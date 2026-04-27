export interface ParsedCommand {
  readonly subcommand: string;
  readonly args: readonly string[];
}

export function parseCommandText(text: string): ParsedCommand {
  const trimmed = text.trim();
  if (trimmed.length === 0) return { subcommand: "help", args: [] };
  const tokens = trimmed.split(/\s+/);
  const [head, ...rest] = tokens;
  return {
    subcommand: (head ?? "help").toLowerCase(),
    args: rest,
  };
}
