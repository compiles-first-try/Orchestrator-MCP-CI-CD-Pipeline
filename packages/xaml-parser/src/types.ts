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
  // Scalar XAML attributes on this activity element, keyed by their local name
  // with the fast-xml-parser `@_` prefix stripped (e.g. `Url`, `Message`,
  // `Selector`, `TableName`, `WorkflowFileName`). Downstream consumers
  // (process-graph) mine these to work out which system/surface an activity
  // touches. Annotation and DisplayName are surfaced separately above and are
  // omitted here to avoid duplication.
  readonly attributes: Readonly<Record<string, string>>;
  readonly children: readonly ActivityInfo[];
}

export interface ParsedXaml {
  readonly arguments: readonly ArgumentInfo[];
  readonly variables: readonly VariableInfo[];
  readonly activities: readonly ActivityInfo[];
  readonly rootAnnotation: string | undefined;
}
