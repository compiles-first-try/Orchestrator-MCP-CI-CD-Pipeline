import { XMLParser } from "fast-xml-parser";
import { XamlParseError } from "./errors.js";
import type {
  ArgumentDirection,
  XamlActivity,
  XamlAnnotation,
  XamlArgument,
  XamlMetadata,
  XamlVariable,
} from "./types.js";

const ATTR_PREFIX = "@_";
const TEXT_NODE_NAME = "#text";
const ANNOTATION_ATTR = "sap2010:Annotation.AnnotationText";
const DISPLAY_NAME_ATTR = "DisplayName";

const ARGUMENT_DIRECTION_PATTERN =
  /^(InArgument|OutArgument|InOutArgument)\s*\(\s*([^)]+?)\s*\)\s*$/;

interface XmlNode {
  readonly [key: string]: unknown;
}

export function parseXaml(xml: string): XamlMetadata {
  if (typeof xml !== "string" || xml.length === 0) {
    throw new XamlParseError("input is empty");
  }
  const parser = new XMLParser({
    ignoreAttributes: false,
    attributeNamePrefix: ATTR_PREFIX,
    preserveOrder: false,
    parseAttributeValue: false,
    parseTagValue: false,
    trimValues: true,
    allowBooleanAttributes: true,
    removeNSPrefix: false,
  });
  let parsed: XmlNode;
  try {
    parsed = parser.parse(xml) as XmlNode;
  } catch (cause) {
    throw new XamlParseError("XML is malformed", { cause });
  }
  const rootEntry = findActivityRoot(parsed);
  if (rootEntry === undefined) {
    return {
      arguments: [],
      variables: [],
      annotations: [],
      root: undefined,
    };
  }
  const argumentList = extractArguments(rootEntry.node);
  const annotations: XamlAnnotation[] = [];
  const variables: XamlVariable[] = [];
  const root = walk(rootEntry.tag, rootEntry.node, [], variables, annotations);
  return {
    arguments: argumentList,
    variables,
    annotations,
    root,
  };
}

function findActivityRoot(doc: XmlNode): { tag: string; node: XmlNode } | undefined {
  for (const [key, value] of Object.entries(doc)) {
    if (key.startsWith("?") || key === ATTR_PREFIX) continue;
    if (isXmlNode(value)) return { tag: key, node: value };
    // Self-closing or empty roots parse as "" — surface them as an empty node.
    if (typeof value === "string") return { tag: key, node: {} };
  }
  return undefined;
}

function extractArguments(activity: XmlNode): readonly XamlArgument[] {
  const members = pickChild(activity, ["x:Members", "Members"]);
  if (members === undefined) return [];
  const properties = collectChildren(members, ["x:Property", "Property"]);
  const result: XamlArgument[] = [];
  for (const property of properties) {
    const name = stringAttr(property, "Name");
    const typeRaw = stringAttr(property, "Type");
    if (name === undefined || typeRaw === undefined) continue;
    const direction = directionFromTypeWrapper(typeRaw);
    const innerType = innerTypeFromWrapper(typeRaw);
    result.push({
      name,
      type: innerType,
      direction,
      defaultValue: undefined,
    });
  }
  return result;
}

function directionFromTypeWrapper(raw: string): ArgumentDirection {
  const match = ARGUMENT_DIRECTION_PATTERN.exec(raw);
  if (match === null) return "in";
  switch (match[1]) {
    case "OutArgument":
      return "out";
    case "InOutArgument":
      return "inout";
    default:
      return "in";
  }
}

function innerTypeFromWrapper(raw: string): string {
  const match = ARGUMENT_DIRECTION_PATTERN.exec(raw);
  if (match === null) return raw;
  return match[2] ?? raw;
}

function walk(
  tag: string,
  node: XmlNode,
  pathSoFar: readonly string[],
  variables: XamlVariable[],
  annotations: XamlAnnotation[],
): XamlActivity {
  const attributes = collectAttributes(node);
  const annotationText = attributes[ANNOTATION_ATTR];
  const displayName = attributes[DISPLAY_NAME_ATTR];
  const path: readonly string[] = [...pathSoFar, tag];

  if (annotationText !== undefined && annotationText.length > 0) {
    annotations.push({
      activityTag: tag,
      displayName,
      text: annotationText,
      path,
    });
  }

  collectVariables(node, path, variables);

  const children: XamlActivity[] = [];
  for (const [childTag, childValue] of Object.entries(node)) {
    if (childTag.startsWith(ATTR_PREFIX)) continue;
    if (childTag === TEXT_NODE_NAME) continue;
    if (isVariablesContainer(childTag)) continue;
    if (childTag === "x:Members" || childTag === "Members") continue;
    if (Array.isArray(childValue)) {
      for (const item of childValue) {
        if (isXmlNode(item)) children.push(walk(childTag, item, path, variables, annotations));
      }
    } else if (isXmlNode(childValue)) {
      children.push(walk(childTag, childValue, path, variables, annotations));
    }
  }

  return {
    tag,
    displayName,
    annotation: annotationText,
    attributes,
    children,
  };
}

function collectVariables(node: XmlNode, scopePath: readonly string[], out: XamlVariable[]): void {
  for (const [childTag, childValue] of Object.entries(node)) {
    if (isVariablesContainer(childTag) === false) continue;
    if (isXmlNode(childValue) === false) continue;
    const variableNodes = collectChildren(childValue as XmlNode, ["Variable"]);
    for (const v of variableNodes) {
      const name = stringAttr(v, "Name");
      if (name === undefined) continue;
      out.push({
        name,
        type: stringAttr(v, "x:TypeArguments") ?? stringAttr(v, "TypeArguments") ?? "Object",
        defaultValue: stringAttr(v, "Default"),
        scopePath,
      });
    }
  }
}

function isVariablesContainer(tag: string): boolean {
  return tag.endsWith(".Variables");
}

function collectChildren(node: XmlNode, candidateTags: readonly string[]): readonly XmlNode[] {
  const out: XmlNode[] = [];
  for (const tag of candidateTags) {
    const value = node[tag];
    if (value === undefined) continue;
    if (Array.isArray(value)) {
      for (const item of value) {
        if (isXmlNode(item)) out.push(item);
      }
    } else if (isXmlNode(value)) {
      out.push(value);
    }
  }
  return out;
}

function pickChild(node: XmlNode, candidateTags: readonly string[]): XmlNode | undefined {
  for (const tag of candidateTags) {
    const value = node[tag];
    if (isXmlNode(value)) return value;
  }
  return undefined;
}

function collectAttributes(node: XmlNode): Readonly<Record<string, string>> {
  const out: Record<string, string> = {};
  for (const [key, value] of Object.entries(node)) {
    if (key.startsWith(ATTR_PREFIX) === false) continue;
    if (typeof value !== "string" && typeof value !== "number" && typeof value !== "boolean") {
      continue;
    }
    out[key.slice(ATTR_PREFIX.length)] = String(value);
  }
  return out;
}

function stringAttr(node: XmlNode, name: string): string | undefined {
  const direct = node[ATTR_PREFIX + name];
  if (typeof direct === "string") return direct;
  if (typeof direct === "number" || typeof direct === "boolean") return String(direct);
  return undefined;
}

function isXmlNode(value: unknown): value is XmlNode {
  return value !== null && typeof value === "object" && Array.isArray(value) === false;
}
