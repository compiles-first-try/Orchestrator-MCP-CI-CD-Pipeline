import { describe, expect, it } from "vitest";
import { z } from "zod";
import { eqFilter, odataList } from "../src/odata.js";

describe("odataList", () => {
  it("validates the OData collection envelope and items", () => {
    const Item = z.object({ Id: z.number(), Name: z.string() });
    const Listed = odataList(Item);
    const parsed = Listed.parse({
      "@odata.context": "https://...",
      value: [
        { Id: 1, Name: "a" },
        { Id: 2, Name: "b" },
      ],
    });
    expect(parsed.value).toHaveLength(2);
  });

  it("rejects an item that doesn't match", () => {
    const Item = z.object({ Id: z.number() });
    const Listed = odataList(Item);
    expect(() => Listed.parse({ value: [{ Id: "not-a-number" }] })).toThrow();
  });
});

describe("eqFilter", () => {
  it("builds an OData $filter eq clause", () => {
    expect(eqFilter("Name", "Foo")).toBe("Name eq 'Foo'");
  });

  it("escapes single quotes by doubling them", () => {
    expect(eqFilter("Name", "O'Reilly")).toBe("Name eq 'O''Reilly'");
  });
});
