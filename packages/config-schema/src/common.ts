import { z } from "zod";

export const NAME_PATTERN = /^[A-Za-z][A-Za-z0-9_-]{0,63}$/;

export const nameSchema = z
  .string()
  .regex(
    NAME_PATTERN,
    "must start with a letter and use only letters, digits, '-', or '_' (max 64 chars)",
  );

export const descriptionSchema = z.string().max(1024).optional();

export function uniqueByName<T extends { name: string }>(
  items: readonly T[],
): { duplicates: string[] } {
  const seen = new Set<string>();
  const duplicates = new Set<string>();
  for (const item of items) {
    if (seen.has(item.name)) duplicates.add(item.name);
    else seen.add(item.name);
  }
  return { duplicates: Array.from(duplicates) };
}
