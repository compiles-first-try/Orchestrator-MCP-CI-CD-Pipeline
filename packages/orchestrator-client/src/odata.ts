import { z, type ZodTypeAny, type infer as zinfer } from "zod";

// OData collection responses look like: { "@odata.context": "...", "value": [...] }.
// Some endpoints additionally return "@odata.count" when $count=true is requested.
export function odataList<S extends ZodTypeAny>(itemSchema: S): z.ZodObject<{
  "@odata.context": z.ZodOptional<z.ZodString>;
  "@odata.count": z.ZodOptional<z.ZodNumber>;
  value: z.ZodArray<S>;
}> {
  return z.object({
    "@odata.context": z.string().optional(),
    "@odata.count": z.number().optional(),
    value: z.array(itemSchema),
  });
}

export type ODataList<S extends ZodTypeAny> = zinfer<ReturnType<typeof odataList<S>>>;

// Build a $filter clause for an exact-string match on a single field.
// Caller is responsible for picking field names UiPath actually exposes
// for filtering on the relevant entity.
export function eqFilter(field: string, value: string): string {
  // Single quote escape per OData spec: ' → ''
  const escaped = value.replace(/'/gu, "''");
  return `${field} eq '${escaped}'`;
}
