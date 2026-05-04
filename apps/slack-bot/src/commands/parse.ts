// Tokenises a Slack slash-command body into a verb + remaining args. The
// verb is the first whitespace-delimited token; the remainder is the rest
// of the string. Quoted args (single or double) are treated as a single token.
export interface ParsedCommand {
  readonly verb: string;
  readonly args: readonly string[];
  readonly raw: string;
}

export function parseCommandText(text: string): ParsedCommand {
  const trimmed = text.trim();
  if (trimmed === "") return { verb: "", args: [], raw: trimmed };
  const tokens: string[] = [];
  let i = 0;
  while (i < trimmed.length) {
    const ch = trimmed[i];
    if (ch === " " || ch === "\t") {
      i++;
      continue;
    }
    if (ch === '"' || ch === "'") {
      const quote = ch;
      let j = i + 1;
      while (j < trimmed.length && trimmed[j] !== quote) j++;
      tokens.push(trimmed.slice(i + 1, j));
      i = j + 1;
    } else {
      let j = i;
      while (j < trimmed.length && trimmed[j] !== " " && trimmed[j] !== "\t") j++;
      tokens.push(trimmed.slice(i, j));
      i = j;
    }
  }
  const [verb = "", ...args] = tokens;
  return { verb, args, raw: trimmed };
}
