export type ArgumentDirection = "in" | "out" | "inout";

export interface XamlArgument {
  readonly name: string;
  readonly type: string;
  readonly direction: ArgumentDirection;
  readonly defaultValue: string | undefined;
}

export interface XamlVariable {
  readonly name: string;
  readonly type: string;
  readonly defaultValue: string | undefined;
  readonly scopePath: readonly string[];
}

export interface XamlAnnotation {
  readonly activityTag: string;
  readonly displayName: string | undefined;
  readonly text: string;
  readonly path: readonly string[];
}

export interface XamlActivity {
  readonly tag: string;
  readonly displayName: string | undefined;
  readonly annotation: string | undefined;
  readonly attributes: Readonly<Record<string, string>>;
  readonly children: readonly XamlActivity[];
}

export interface XamlMetadata {
  readonly arguments: readonly XamlArgument[];
  readonly variables: readonly XamlVariable[];
  readonly annotations: readonly XamlAnnotation[];
  readonly root: XamlActivity | undefined;
}
