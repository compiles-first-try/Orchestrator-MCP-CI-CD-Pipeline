// Shared colour vocabulary for the 3D map. System kinds → building colour,
// pathway kinds → pipe colour. Exported so both the server-rendered legend and
// the in-browser scene read from one source of truth.

export const SYSTEM_COLORS: Readonly<Record<string, string>> = {
  browser: "#4fc3f7",
  "web-app": "#29b6f6",
  database: "#ffb74d",
  api: "#ba68c8",
  excel: "#66bb6a",
  email: "#f06292",
  "file-system": "#a1887f",
  pdf: "#ef5350",
  terminal: "#90a4ae",
  orchestrator: "#ffd54f",
  "credential-store": "#ff8a65",
  application: "#7986cb",
  unknown: "#b0bec5",
};

export const PATHWAY_COLORS: Readonly<Record<string, string>> = {
  "happy-path": "#00e5ff",
  "business-exception": "#ffb300",
  "system-exception": "#ff1744",
  retry: "#536dfe",
  branch: "#b388ff",
};

export const PATHWAY_LABELS: Readonly<Record<string, string>> = {
  "happy-path": "Happy path",
  "business-exception": "Business exception",
  "system-exception": "System exception",
  retry: "Retry",
  branch: "Decision branch",
};
