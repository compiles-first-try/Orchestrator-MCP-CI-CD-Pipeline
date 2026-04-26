import { z } from "zod";
import { descriptionSchema, nameSchema } from "../common.js";

export const queueSchema = z.object({
  name: nameSchema,
  description: descriptionSchema,
  acceptAutoRetry: z.boolean().default(false),
  maxRetries: z.number().int().min(0).max(10).default(1),
  slaMinutes: z.number().int().positive().optional(),
  enforceUniqueReferences: z.boolean().default(true),
});

export type Queue = z.infer<typeof queueSchema>;

export const queuesSchema = z.array(queueSchema).superRefine((items, ctx) => {
  const seen = new Set<string>();
  for (let i = 0; i < items.length; i += 1) {
    const item = items[i];
    if (item === undefined) continue;
    if (seen.has(item.name)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: [i, "name"],
        message: `duplicate queue name: '${item.name}'`,
      });
    }
    seen.add(item.name);
  }
});

export type Queues = z.infer<typeof queuesSchema>;
