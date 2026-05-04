export type ArgumentDirection = "In" | "Out" | "InOut" | "Property";

export interface ArgumentInfo {
  readonly name: string;
  readonly direction: ArgumentDirection;
  readonly type: string;
  readonly defaultValue: string | undefined;
  readonly annotation: string | undefined;
}

export interface VariableInfo {
  readonly name: string;
  readonly type: string;
  readonly defaultValue: string | undefined;
  readonly scope: string | undefined;
}

export interface ActivityInfo {
  readonly type: string;
  readonly displayName: string | undefined;
  readonly annotation: string | undefined;
  readonly children: readonly ActivityInfo[];
}

export interface ParsedXaml {
  readonly arguments: readonly ArgumentInfo[];
  readonly variables: readonly VariableInfo[];
  readonly activities: readonly ActivityInfo[];
  readonly rootAnnotation: string | undefined;
}
