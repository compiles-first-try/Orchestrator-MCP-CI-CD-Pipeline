import { z } from "zod";
import { descriptionSchema, nameSchema } from "../common.js";

export const BUCKET_PROVIDERS = ["orchestrator", "s3", "azure-blob"] as const;
export type BucketProvider = (typeof BUCKET_PROVIDERS)[number];

export const bucketSchema = z.object({
  name: nameSchema,
  description: descriptionSchema,
  storageProvider: z.enum(BUCKET_PROVIDERS).default("orchestrator"),
  storageContainerPath: z.string().min(1).max(512).optional(),
});

export type Bucket = z.infer<typeof bucketSchema>;

export const bucketsSchema = z.array(bucketSchema).superRefine((items, ctx) => {
  const seen = new Set<string>();
  for (let i = 0; i < items.length; i += 1) {
    const item = items[i];
    if (item === undefined) continue;
    if (seen.has(item.name)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: [i, "name"],
        message: `duplicate bucket name: '${item.name}'`,
      });
    }
    seen.add(item.name);
  }
});

export type Buckets = z.infer<typeof bucketsSchema>;
