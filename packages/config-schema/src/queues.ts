import { z } from "zod";
import { DescriptionString, NameString, SchemaVersionField, TagList } from "./primitives.js";

// Queue Definition fields we expose for source-of-truth declaration.
// ASSUMPTION: This subset matches Orchestrator QueueDefinition — Name,
// Description, AcceptAutomaticallyRetry, MaxNumberOfRetries,
// EnforceUniqueReference, Encrypted, plus optional JSON schemas for
// SpecificData / OutputData / AnalyticsData. Risk SLA / SLA / AutoFreeze
// are deferred — they're more operational than declarative and v1 doesn't
// claim to manage them.
export const Queue = z.object({
  name: NameString,
  description: DescriptionString.optional(),

  // Maps to Orchestrator's AcceptAutomaticallyRetry.
  autoRetry: z.boolean().default(false),

  // 0 disables retries. Cap mirrors Orchestrator (signed 32-bit, but no
  // sane caller goes anywhere near it; clamp to keep sanity).
  maxRetries: z.number().int().min(0).max(1000).default(3),

  // Maps to Orchestrator's EnforceUniqueReference.
  uniqueReference: z.boolean().default(false),

  // Maps to Orchestrator's `Encrypted` flag (queue payload encryption).
  encrypted: z.boolean().default(false),

  // Optional JSON Schemas for queue items, exactly as accepted by
  // Orchestrator's matching fields. Pass-through; we don't validate the
  // schemas themselves at this layer.
  specificDataJsonSchema: z.record(z.string(), z.unknown()).optional(),
  outputDataJsonSchema: z.record(z.string(), z.unknown()).optional(),
  analyticsDataJsonSchema: z.record(z.string(), z.unknown()).optional(),

  tags: TagList.optional(),
});

export type Queue = z.infer<typeof Queue>;

export const QueuesFile = z
  .object({
    schemaVersion: SchemaVersionField,
    queues: z.array(Queue).max(2048),
  })
  .superRefine((file, ctx) => {
    const seen = new Set<string>();
    for (let i = 0; i < file.queues.length; i++) {
      const queue = file.queues[i];
      if (queue === undefined) continue;
      if (seen.has(queue.name)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["queues", i, "name"],
          message: `duplicate queue name '${queue.name}'`,
        });
      }
      seen.add(queue.name);
    }
  });

export type QueuesFile = z.infer<typeof QueuesFile>;
