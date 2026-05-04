export * from "./primitives.js";
export * from "./settings.js";
export * from "./constants.js";
export * from "./assets.js";
export * from "./queues.js";
export * from "./buckets.js";
export * from "./credentials.js";
export * from "./overrides.js";
export * from "./parse.js";

export const CONFIG_FILE_NAMES = {
  settings: "settings.json",
  constants: "constants.json",
  assets: "assets.json",
  queues: "queues.json",
  buckets: "buckets.json",
  credentials: "credentials.json",
  overrides: "overrides.json",
} as const;

export type ConfigFileSlot = keyof typeof CONFIG_FILE_NAMES;
