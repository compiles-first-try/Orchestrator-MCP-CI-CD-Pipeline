import { describe, expect, it } from "vitest";
import { XamlParseError, parseXaml } from "../src/index.js";

const SAMPLE_XAML = `<?xml version="1.0" encoding="utf-8"?>
<Activity mc:Ignorable="sap sap2010"
          xmlns="http://schemas.microsoft.com/netfx/2009/xaml/activities"
          xmlns:mc="http://schemas.openxmlformats.org/markup-compatibility/2006"
          xmlns:sap2010="http://schemas.microsoft.com/netfx/2010/xaml/activities/presentation"
          xmlns:ui="http://schemas.uipath.com/workflow/activities"
          xmlns:x="http://schemas.microsoft.com/winfx/2006/xaml"
          sap2010:Annotation.AnnotationText="Top-level workflow notes."
          DisplayName="Main">
  <x:Members>
    <x:Property Name="in_OrderId" Type="InArgument(x:String)" sap2010:Annotation.AnnotationText="Incoming order id." />
    <x:Property Name="out_Status" Type="OutArgument(x:String)" />
  </x:Members>
  <Sequence DisplayName="Process Order" sap2010:Annotation.AnnotationText="Outer sequence">
    <Sequence.Variables>
      <Variable x:TypeArguments="x:String" Name="customerName" Default="Anonymous" />
      <Variable x:TypeArguments="x:Int32" Name="retryCount" />
    </Sequence.Variables>
    <ui:LogMessage DisplayName="Log start" Message="Starting" />
    <Sequence DisplayName="Inner">
      <ui:LogMessage DisplayName="Log inner" Message="Inner" />
    </Sequence>
  </Sequence>
</Activity>`;

describe("parseXaml", () => {
  it("extracts root annotation", () => {
    const result = parseXaml(SAMPLE_XAML);
    expect(result.rootAnnotation).toBe("Top-level workflow notes.");
  });

  it("extracts arguments with direction and annotation", () => {
    const { arguments: args } = parseXaml(SAMPLE_XAML);
    expect(args).toHaveLength(2);
    const inArg = args.find((a) => a.name === "in_OrderId");
    expect(inArg?.direction).toBe("In");
    expect(inArg?.type).toBe("x:String");
    expect(inArg?.annotation).toBe("Incoming order id.");
    const outArg = args.find((a) => a.name === "out_Status");
    expect(outArg?.direction).toBe("Out");
  });

  it("extracts variables with their type and default value", () => {
    const { variables } = parseXaml(SAMPLE_XAML);
    const names = variables.map((v) => v.name);
    expect(names).toContain("customerName");
    expect(names).toContain("retryCount");
    const customer = variables.find((v) => v.name === "customerName");
    expect(customer?.type).toBe("x:String");
    expect(customer?.defaultValue).toBe("Anonymous");
    expect(customer?.scope).toBe("Process Order");
  });

  it("extracts the activity tree with displayName and annotation", () => {
    const { activities } = parseXaml(SAMPLE_XAML);
    expect(activities).toHaveLength(1);
    const top = activities[0];
    expect(top?.type).toBe("Sequence");
    expect(top?.displayName).toBe("Process Order");
    expect(top?.annotation).toBe("Outer sequence");
    expect((top?.children ?? []).length).toBeGreaterThanOrEqual(2);
  });

  it("captures scalar activity attributes but not DisplayName or annotation", () => {
    const { activities } = parseXaml(SAMPLE_XAML);
    const top = activities[0];
    const logStart = (top?.children ?? []).find((c) => c.displayName === "Log start");
    expect(logStart?.attributes["Message"]).toBe("Starting");
    expect(logStart?.attributes).not.toHaveProperty("DisplayName");
    const annotationKeys = Object.keys(top?.attributes ?? {}).filter((k) =>
      k.endsWith("Annotation.AnnotationText"),
    );
    expect(annotationKeys).toEqual([]);
  });

  it("rejects malformed XML", () => {
    expect(() => parseXaml("<not really xaml")).toThrow(XamlParseError);
  });

  it("returns empty arrays for an empty Activity", () => {
    const xml = `<?xml version="1.0"?><Activity xmlns="http://schemas.microsoft.com/netfx/2009/xaml/activities" />`;
    const result = parseXaml(xml);
    expect(result.arguments).toEqual([]);
    expect(result.variables).toEqual([]);
    expect(result.activities).toEqual([]);
  });
});
