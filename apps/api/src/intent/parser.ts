// Pluggable intent parser used by the `/rpa new` flow. Default
// implementation is keyword-based ("NLP-lite") — it doesn't pull in an LLM
// SDK so the API has no extra runtime dependency. The interface is designed
// so an LLM-backed parser can be swapped in later without changing callers.
//
// Default rules:
//   /rpa new <project-name> "<description>" owners=<email>[,<email>...] [framework=<semver>]
// Anything in double quotes becomes the description. Tokens of the form
// `<key>=<value>` are extracted as named fields. Any email-shaped token is
// added to the owners list. The first remaining bare token becomes the
// project name.

export interface ProjectIntent {
  readonly name: string;
  readonly description: string;
  readonly owners: readonly string[];
  readonly frameworkVersion: string | undefined;
}

export interface IntentParser {
  parseProjectIntent(text: string): ProjectIntent;
}

export class IntentParseError extends Error {
  public readonly code = "intent.parse_failed";
}

const EMAIL_PATTERN = /^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$/u;
const NAME_PATTERN = /^[A-Za-z0-9_-][A-Za-z0-9_.-]{0,63}$/u;

export function createKeywordIntentParser(): IntentParser {
  return {
    parseProjectIntent(text) {
      const tokens = tokenise(text);
      let description = "";
      let name: string | undefined;
      let frameworkVersion: string | undefined;
      const owners = new Set<string>();

      for (const token of tokens) {
        if (token.kind === "quoted") {
          if (description === "") description = token.value;
          continue;
        }
        const value = token.value;
        const equalsAt = value.indexOf("=");
        if (equalsAt > 0) {
          const key = value.slice(0, equalsAt).toLowerCase();
          const val = value.slice(equalsAt + 1);
          if (key === "owners" || key === "owner") {
            for (const item of val.split(",")) {
              const trimmed = item.trim();
              if (EMAIL_PATTERN.test(trimmed)) owners.add(trimmed);
            }
            continue;
          }
          if (key === "framework" || key === "fw" || key === "framework-version") {
            frameworkVersion = val.trim();
            continue;
          }
          if (key === "name") {
            if (name === undefined && NAME_PATTERN.test(val)) name = val;
            continue;
          }
          if (key === "description") {
            if (description === "") description = val;
            continue;
          }
        }
        if (EMAIL_PATTERN.test(value)) {
          owners.add(value);
          continue;
        }
        if (name === undefined && NAME_PATTERN.test(value)) {
          name = value;
        } else if (description === "") {
          description = value;
        } else {
          description = `${description} ${value}`;
        }
      }

      if (name === undefined) {
        throw new IntentParseError(
          "Could not infer a project name. Try `/rpa new <project-name> \"description\" owners=<email>`.",
        );
      }
      return {
        name,
        description: description.trim(),
        owners: [...owners],
        frameworkVersion,
      };
    },
  };
}

interface Token {
  readonly kind: "bare" | "quoted";
  readonly value: string;
}

function tokenise(text: string): readonly Token[] {
  const tokens: Token[] = [];
  let i = 0;
  while (i < text.length) {
    const ch = text[i];
    if (ch === undefined) break;
    if (ch === " " || ch === "\t" || ch === "\n") {
      i++;
      continue;
    }
    if (ch === '"' || ch === "'") {
      const quote = ch;
      let j = i + 1;
      while (j < text.length && text[j] !== quote) j++;
      tokens.push({ kind: "quoted", value: text.slice(i + 1, j) });
      i = j + 1;
      continue;
    }
    let j = i;
    while (j < text.length && text[j] !== " " && text[j] !== "\t" && text[j] !== "\n") j++;
    tokens.push({ kind: "bare", value: text.slice(i, j) });
    i = j;
  }
  return tokens;
}
