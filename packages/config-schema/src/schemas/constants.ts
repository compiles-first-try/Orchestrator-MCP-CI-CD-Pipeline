import type { z } from "zod";
import { settingsSchema } from "./settings.js";

export const constantsSchema = settingsSchema;

export type Constants = z.infer<typeof constantsSchema>;
