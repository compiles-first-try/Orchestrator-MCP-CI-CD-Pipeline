import { XMLParser } from "fast-xml-parser";
import { XamlParseError } from "./errors.js";
import type {
  ActivityInfo,
  ArgumentDirection,
  ArgumentInfo,
  ParsedXaml,
  VariableInfo,
} from "./types.js";

const ATTR_PREFIX = "@_";
const TEXT_KEY = "#text";

// fast-xml-parser preserves namespace prefixes in tag/attribute names. We
// keep that behaviour so we can pattern-match on `sap2010:Annotation.AnnotationText`
// (the UiPath annotation attribute) without ambiguity.
const xmlParser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: ATTR_PREFIX,
  textNodeName: TEXT_KEY,
  preserveOrder: false,
  parseAttributeValue: false,
  trimValues: false,
});

const ARGUMENT_DIRECTIONS: readonly ArgumentDirection[] = ["In", "Out", "InOut", "Property"];

export function parseXaml(xml: string): ParsedXaml {
  let parsed: unknown;
  try {
    parsed = xmlParser.parse(xml);
  } catch (cause) {
    throw new XamlParseError("Failed to parse XAML as XML.", { cause });
  }
  if (typeof parsed !== "object" || parsed === null) {
    throw new XamlParseError("XAML root is not an object.");
  }
  const root = findActivityRoot(parsed as Record<string, unknown>);
  if (root === undefined) {
    throw new XamlParseError("Could not locate an Activity root element in the XAML document.");
  }
  return {
    arguments: extractArguments(root),
    variables: extractVariables(root),
    activities: extractActivities(root),
    rootAnnotation: extractAnnotation(root),
  };
}

// The top-level wrapper in UiPath XAML is `<Activity>` or `<x:Activity>`.
// We scan the keys to find it without hard-coding the namespace prefix.
function findActivityRoot(parsed: Record<string, unknown>): Record<string, unknown> | undefined {
  for (const [key, value] of Object.entries(parsed)) {
    if (key.startsWith(ATTR_PREFIX)) continue;
    if (key === "?xml") continue;
    if (typeof value === "object" && value !== null) {
      // The first non-attribute element is the document root.
      return value as Record<string, unknown>;
    }
    if (typeof value === "string") {
      return { [TEXT_KEY]: value };
    }
  }
  return undefined;
}

function extractArguments(root: Record<string, unknown>): readonly ArgumentInfo[] {
  // x:Members holds <x:Property>; some UiPath emitters use Members directly
  // without the `x:` prefix when the default namespace happens to be xaml.
  const members = (root["x:Members"] ?? root["Members"]) as Record<string, unknown> | undefined;
  if (members === undefined) return [];
  const properties = collect(members, ["x:Property", "Property"]);
  return properties.map((prop) => {
    const name = stringAttr(prop, "Name") ?? "";
    const rawType = stringAttr(prop, "Type") ?? "";
    const direction = directionFromType(rawType);
    return {
      name,
      direction,
      type: stripDirectionWrapper(rawType),
      defaultValue: stringAttr(prop, "DefaultValue"),
      annotation: extractAnnotation(prop),
    };
  });
}

function extractVariables(root: Record<string, unknown>): readonly VariableInfo[] {
  const out: VariableInfo[] = [];
  walk(root, (node, parentDisplayName) => {
    const variableContainer = node["Sequence.Variables"] ?? node["StateMachine.Variables"];
    if (variableContainer !== undefined && typeof variableContainer === "object") {
      const list = collect(variableContainer as Record<string, unknown>, ["Variable"]);
      // Variables belong to the activity that declared them.
      const scope = stringAttr(node, "DisplayName") ?? parentDisplayName;
      for (const v of list) {
        out.push({
          name: stringAttr(v, "Name") ?? "",
          type: stringAttr(v, "x:TypeArguments") ?? stringAttr(v, "TypeArguments") ?? "",
          defaultValue: stringAttr(v, "Default"),
          scope,
        });
      }
    }
  });
  return out;
}

function extractActivities(root: Record<string, unknown>): readonly ActivityInfo[] {
  const out: ActivityInfo[] = [];
  for (const [tag, value] of Object.entries(root)) {
    if (tag.startsWith(ATTR_PREFIX)) continue;
    if (tag === "x:Members" || tag === "Members") continue;
    if (typeof value !== "object" || value === null) continue;
    const activity = toActivityInfo(tag, value as Record<string, unknown>);
    if (activity !== undefined) {
      out.push(activity);
    }
  }
  return out;
}

function toActivityInfo(type: string, node: Record<string, unknown>): ActivityInfo | undefined {
  // Skip wrapper elements that are containers for Variables/Imports etc.
  if (type.endsWith(".Variables") || type.endsWith(".Imports") || type === "TextExpression.NamespacesForImplementation") {
    return undefined;
  }
  const children: ActivityInfo[] = [];
  for (const [childTag, childValue] of Object.entries(node)) {
    if (childTag.startsWith(ATTR_PREFIX)) continue;
    if (childTag === TEXT_KEY) continue;
    if (childTag.endsWith(".Variables") || childTag.endsWith(".Imports")) continue;
    if (typeof childValue !== "object" || childValue === null) continue;
    if (Array.isArray(childValue)) {
      for (const item of childValue) {
        if (typeof item === "object" && item !== null) {
          const child = toActivityInfo(childTag, item as Record<string, unknown>);
          if (child !== undefined) children.push(child);
        }
      }
    } else {
      const child = toActivityInfo(childTag, childValue as Record<string, unknown>);
      if (child !== undefined) children.push(child);
    }
  }
  return {
    type,
    displayName: stringAttr(node, "DisplayName"),
    annotation: extractAnnotation(node),
    children,
  };
}

// Walks through every activity-shaped object in the tree, calling the visitor
// with each node and its parent's DisplayName (used as a friendly variable
// scope label).
function walk(
  node: Record<string, unknown>,
  visit: (node: Record<string, unknown>, parentDisplayName: string | undefined) => void,
  parentDisplayName: string | undefined = undefined,
): void {
  visit(node, parentDisplayName);
  const display = stringAttr(node, "DisplayName") ?? parentDisplayName;
  for (const [key, value] of Object.entries(node)) {
    if (key.startsWith(ATTR_PREFIX)) continue;
    if (key === TEXT_KEY) continue;
    if (Array.isArray(value)) {
      for (const item of value) {
        if (typeof item === "object" && item !== null) {
          walk(item as Record<string, unknown>, visit, display);
        }
      }
    } else if (typeof value === "object" && value !== null) {
      walk(value as Record<string, unknown>, visit, display);
    }
  }
}

function collect(container: Record<string, unknown>, keys: readonly string[]): Record<string, unknown>[] {
  const out: Record<string, unknown>[] = [];
  for (const key of keys) {
    const value = container[key];
    if (value === undefined) continue;
    if (Array.isArray(value)) {
      for (const item of value) {
        if (typeof item === "object" && item !== null) {
          out.push(item as Record<string, unknown>);
        }
      }
    } else if (typeof value === "object" && value !== null) {
      out.push(value as Record<string, unknown>);
    }
  }
  return out;
}

function stringAttr(node: Record<string, unknown>, name: string): string | undefined {
  const candidates = [
    node[`${ATTR_PREFIX}${name}`],
    node[`${ATTR_PREFIX}x:${name}`],
    node[name],
  ];
  for (const candidate of candidates) {
    if (typeof candidate === "string") return candidate;
    if (typeof candidate === "number" || typeof candidate === "boolean") return String(candidate);
  }
  return undefined;
}

function extractAnnotation(node: Record<string, unknown>): string | undefined {
  for (const key of Object.keys(node)) {
    if (key.startsWith(ATTR_PREFIX) && key.endsWith("Annotation.AnnotationText")) {
      const value = node[key];
      if (typeof value === "string") return value;
    }
  }
  return undefined;
}

// XAML argument types are wrapped: `InArgument(x:String)`, `OutArgument(x:Int32)`, etc.
function directionFromType(rawType: string): ArgumentDirection {
  for (const direction of ARGUMENT_DIRECTIONS) {
    if (rawType.startsWith(`${direction}Argument(`) || rawType.startsWith(`${direction}Argument`)) {
      return direction;
    }
  }
  return "Property";
}

function stripDirectionWrapper(rawType: string): string {
  const match = /^(?:In|Out|InOut)Argument\((.*)\)$/u.exec(rawType);
  return match?.[1] ?? rawType;
}
