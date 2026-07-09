import type { SurfaceKind, SystemKind } from "./types.js";

// ---------------------------------------------------------------------------
// Maps a UiPath activity (its type + scalar attributes) onto the *system* it
// touches and the *surface* (area) within that system. This is the knowledge
// base behind the "buildings" metaphor: an OpenBrowser is a Web Browser
// building; the Url it opens is a Login page or an app page door on that
// building; an ExecuteQuery is a Database building with an Orders-table door.
//
// Activities come in three roles:
//   - "container": opens a scope that descendant activities run inside
//     (OpenBrowser, Excel Application Scope, Database Connect, ...). It sets the
//     *ambient system* for its subtree.
//   - "leaf": a self-contained system touch (Send Mail, HTTP Request, Execute
//     Query, Read PDF Text, file ops, Orchestrator asset/queue).
//   - "ui": a generic UI interaction (Click, Type Into, Get Text). It has no
//     system of its own — it inherits the ambient container's system.
// Everything else is "none" (structural, logging, control flow) and is handled
// by the builder's own decision/transaction/invoke detection.
// ---------------------------------------------------------------------------

export type ActivityRole = "container" | "leaf" | "ui" | "none";

export interface SurfaceDraft {
  readonly kind: SurfaceKind;
  readonly label: string;
  readonly detail: string | undefined;
}

export interface SystemDraft {
  readonly kind: SystemKind;
  readonly name: string;
}

export interface ActivityClassification {
  readonly role: ActivityRole;
  readonly system: SystemDraft | undefined;
  readonly surface: SurfaceDraft | undefined;
}

const NONE: ActivityClassification = { role: "none", system: undefined, surface: undefined };

/** The fallback system for UI interactions that run outside any known scope. */
export const GENERIC_UI_SYSTEM: SystemDraft = { kind: "application", name: "Desktop / UI" };

type Attrs = Readonly<Record<string, string>>;

/** Strips a namespace prefix (`ui:OpenBrowser` -> `openbrowser`). */
function localName(type: string): string {
  const colon = type.lastIndexOf(":");
  const bare = colon >= 0 ? type.slice(colon + 1) : type;
  return bare.toLowerCase();
}

/** Reads the first present attribute by local name, ignoring namespace/case. */
function attr(attrs: Attrs, ...names: readonly string[]): string | undefined {
  const wanted = new Set(names.map((n) => n.toLowerCase()));
  for (const [key, value] of Object.entries(attrs)) {
    const local = key.includes(":") ? key.slice(key.lastIndexOf(":") + 1) : key;
    if (wanted.has(local.toLowerCase()) && value.trim() !== "") return value;
  }
  return undefined;
}

const CONTAINER_TYPES = new Set([
  "openbrowser",
  "openbrowseruse",
  "attachbrowser",
  "useapplicationbrowser",
]);

const APP_CONTAINER_TYPES = new Set([
  "napplicationcard",
  "useapplication",
  "openapplication",
  "nopenapplication",
  "attachwindow",
]);

const UI_TYPES = new Set([
  "click",
  "nclick",
  "typeinto",
  "ntypeinto",
  "gettext",
  "ngettext",
  "getfulltext",
  "getvisibletext",
  "getattribute",
  "ngetattribute",
  "setattribute",
  "checkstate",
  "check",
  "selectitem",
  "nselectitem",
  "hover",
  "nhover",
  "sendhotkey",
  "typesecuretext",
  "elementexists",
  "nelementexists",
  "findelement",
  "findchildren",
  "extractdata",
  "tabledata",
  "highlight",
  "takescreenshot",
  "getpassword",
]);

export function classifyActivity(type: string, attrs: Attrs): ActivityClassification {
  const name = localName(type);

  const container = classifyContainer(name, attrs);
  if (container !== undefined) return container;

  const leaf = classifyLeaf(name, attrs);
  if (leaf !== undefined) return leaf;

  // In-scope browser navigation reveals a new page/login surface on whichever
  // browser building is already open — treated as a UI interaction so it
  // inherits that ambient system.
  if (
    name === "navigatebrowser" ||
    name === "gohome" ||
    name === "goback" ||
    name === "goforward"
  ) {
    return { role: "ui", system: undefined, surface: urlSurface(attrs) };
  }

  if (UI_TYPES.has(name)) {
    return { role: "ui", system: undefined, surface: uiSurface(attrs) };
  }
  return NONE;
}

function classifyContainer(name: string, attrs: Attrs): ActivityClassification | undefined {
  if (CONTAINER_TYPES.has(name)) {
    return {
      role: "container",
      system: { kind: "browser", name: "Web Browser" },
      surface: urlSurface(attrs),
    };
  }
  if (name === "excelapplicationscope" || name === "excelprocessscope" || name === "useexcelfile") {
    return {
      role: "container",
      system: { kind: "excel", name: "Excel" },
      surface: fileSurface(attrs, "worksheet"),
    };
  }
  if (name === "databaseconnect" || name === "connectionscope") {
    return {
      role: "container",
      system: { kind: "database", name: "SQL Database" },
      surface: undefined,
    };
  }
  if (name === "outlookapplicationscope") {
    return {
      role: "container",
      system: { kind: "email", name: "Outlook" },
      surface: mailboxSurface(attrs),
    };
  }
  if (name === "terminalsession" || name === "terminalconnect") {
    return {
      role: "container",
      system: { kind: "terminal", name: "Terminal" },
      surface: undefined,
    };
  }
  if (APP_CONTAINER_TYPES.has(name)) {
    return { role: "container", system: appSystem(attrs), surface: screenSurface(attrs) };
  }
  return undefined;
}

function classifyLeaf(name: string, attrs: Attrs): ActivityClassification | undefined {
  if (EMAIL_TYPES.has(name)) {
    return leaf({ kind: "email", name: emailProductName(name) }, mailboxSurface(attrs));
  }
  if (name === "httpclient" || name === "orchestratorhttprequest") {
    return leaf({ kind: "api", name: "HTTP / API" }, endpointSurface(attrs));
  }
  if (DB_LEAF_TYPES.has(name)) {
    return leaf({ kind: "database", name: "SQL Database" }, tableSurface(attrs));
  }
  if (EXCEL_LEAF_TYPES.has(name)) {
    return leaf({ kind: "excel", name: "Excel" }, worksheetSurface(attrs));
  }
  if (PDF_TYPES.has(name)) {
    return leaf({ kind: "pdf", name: "PDF Document" }, fileSurface(attrs, "file"));
  }
  if (FILE_TYPES.has(name)) {
    return leaf({ kind: "file-system", name: "File System" }, fileSurface(attrs, "file"));
  }
  const orchestrator = classifyOrchestrator(name, attrs);
  if (orchestrator !== undefined) return orchestrator;
  return undefined;
}

function classifyOrchestrator(name: string, attrs: Attrs): ActivityClassification | undefined {
  if (name === "getcredential") {
    return leaf(
      { kind: "credential-store", name: "Orchestrator Credentials" },
      assetSurface(attrs, "credential"),
    );
  }
  if (name === "getasset" || name === "setasset") {
    return leaf({ kind: "orchestrator", name: "Orchestrator" }, assetSurface(attrs, "asset"));
  }
  if (QUEUE_TYPES.has(name)) {
    return leaf({ kind: "orchestrator", name: "Orchestrator" }, queueSurface(attrs));
  }
  return undefined;
}

function leaf(system: SystemDraft, surface: SurfaceDraft | undefined): ActivityClassification {
  return { role: "leaf", system, surface };
}

const EMAIL_TYPES = new Set([
  "sendmail",
  "smtpsendmail",
  "sendoutlookmail",
  "sendexchangemail",
  "sendsmtpmailmessage",
  "getoutlookmailmessages",
  "getimapmailmessages",
  "getpop3mailmessages",
  "getexchangemailmessages",
  "moveoutlookmail",
  "saveoutlookattachments",
]);

const DB_LEAF_TYPES = new Set([
  "executequery",
  "executenonquery",
  "insert",
  "deleteactivity",
  "bulkupdate",
  "runstoredprocedure",
]);

const EXCEL_LEAF_TYPES = new Set([
  "excelreadrange",
  "excelwriterange",
  "excelreadcell",
  "excelwritecell",
  "readrange",
  "writerange",
  "appendrange",
  "readcolumn",
  "readrow",
  "readcell",
  "writecell",
]);

const PDF_TYPES = new Set(["readpdftext", "readpdfwithocr", "extractpdfpagerange", "joinpdffiles"]);

const FILE_TYPES = new Set([
  "readtextfile",
  "writetextfile",
  "appendline",
  "movefile",
  "copyfile",
  "deletefile",
  "delete",
  "createfile",
  "pathexists",
  "waitfordownload",
  "readcsvfile",
  "writecsvfile",
  "appendcsvfile",
]);

const QUEUE_TYPES = new Set([
  "addqueueitem",
  "addtransactionitem",
  "bulkaddqueueitems",
  "getqueueitem",
  "gettransactionitem",
  "settransactionstatus",
  "settransactionprogress",
  "deletequeueitems",
  "getqueueitems",
  "postponetransactionitem",
]);

function emailProductName(name: string): string {
  if (name.includes("outlook")) return "Outlook";
  if (name.includes("exchange")) return "Exchange";
  if (name.includes("imap")) return "IMAP Mail";
  if (name.includes("pop3")) return "POP3 Mail";
  return "SMTP Mail";
}

function appSystem(attrs: Attrs): SystemDraft {
  const path = attr(attrs, "FileName", "ApplicationPath", "Path");
  const name = path !== undefined ? basename(path) : "Application";
  return { kind: "application", name };
}

// ---- Surface builders ----------------------------------------------------

function urlSurface(attrs: Attrs): SurfaceDraft | undefined {
  const url = attr(attrs, "Url", "Uri", "Endpoint");
  if (url === undefined) return undefined;
  const login = /log[io]n|sign[\s-]?in|logon|auth|sso/iu.test(url);
  return {
    kind: login ? "login" : "page",
    label: login ? "Login page" : pageLabel(url),
    detail: url,
  };
}

function pageLabel(url: string): string {
  try {
    const parsed = new URL(url);
    const path = parsed.pathname === "/" ? "" : parsed.pathname;
    return `${parsed.host}${path}`;
  } catch {
    return url.length > 48 ? `${url.slice(0, 45)}...` : url;
  }
}

function endpointSurface(attrs: Attrs): SurfaceDraft | undefined {
  const endpoint = attr(attrs, "EndPoint", "Endpoint", "Url", "Uri", "RelativeEndpoint");
  if (endpoint === undefined) return undefined;
  const method = attr(attrs, "Method", "HttpMethod") ?? "GET";
  return {
    kind: "endpoint",
    label: `${method.toUpperCase()} ${pageLabel(endpoint)}`,
    detail: endpoint,
  };
}

function tableSurface(attrs: Attrs): SurfaceDraft | undefined {
  const explicit = attr(attrs, "TableName", "Table");
  if (explicit !== undefined)
    return { kind: "table", label: `${explicit} table`, detail: explicit };
  const sql = attr(attrs, "Sql", "Query", "CommandText");
  if (sql === undefined) return undefined;
  const table = extractTableFromSql(sql);
  return { kind: "table", label: table !== undefined ? `${table} table` : "Query", detail: sql };
}

function extractTableFromSql(sql: string): string | undefined {
  const match = /\b(?:from|into|update|join)\s+([A-Za-z0-9_.[\]"`]+)/iu.exec(sql);
  return match?.[1]?.replace(/["`[\]]/gu, "");
}

function worksheetSurface(attrs: Attrs): SurfaceDraft | undefined {
  const sheet = attr(attrs, "SheetName", "Sheet");
  const range = attr(attrs, "Range");
  const workbook = attr(attrs, "WorkbookPath", "FilePath", "Path");
  if (sheet !== undefined) {
    const label = range !== undefined ? `${sheet}!${range}` : `${sheet} sheet`;
    return { kind: "worksheet", label, detail: workbook };
  }
  if (workbook !== undefined) return { kind: "file", label: basename(workbook), detail: workbook };
  return undefined;
}

function fileSurface(attrs: Attrs, fallbackKind: SurfaceKind): SurfaceDraft | undefined {
  const path = attr(attrs, "FileName", "WorkbookPath", "FilePath", "Path", "File");
  if (path === undefined) return undefined;
  return { kind: fallbackKind, label: basename(path), detail: path };
}

function mailboxSurface(attrs: Attrs): SurfaceDraft | undefined {
  const box = attr(attrs, "Account", "MailFolder", "Folder", "MailboxName");
  if (box === undefined) return undefined;
  return { kind: "mailbox", label: box, detail: box };
}

function screenSurface(attrs: Attrs): SurfaceDraft | undefined {
  const selector = attr(attrs, "Selector", "Title", "WindowTitle");
  if (selector === undefined) return undefined;
  const title = titleFromSelector(selector);
  return { kind: "screen", label: title ?? "Window", detail: selector };
}

function uiSurface(attrs: Attrs): SurfaceDraft | undefined {
  const selector = attr(attrs, "Selector", "Target");
  if (selector === undefined) return undefined;
  const title = titleFromSelector(selector);
  if (title === undefined) return undefined;
  return { kind: "screen", label: title, detail: selector };
}

function assetSurface(attrs: Attrs, kind: SurfaceKind): SurfaceDraft | undefined {
  const name = attr(attrs, "AssetName", "Name", "CredentialName");
  if (name === undefined) return undefined;
  return { kind, label: name, detail: name };
}

function queueSurface(attrs: Attrs): SurfaceDraft | undefined {
  const name = attr(attrs, "QueueName", "Queue");
  if (name === undefined) return undefined;
  return { kind: "queue", label: `${name} queue`, detail: name };
}

/** Pulls a window/page title out of a UiPath selector string, if present. */
function titleFromSelector(selector: string): string | undefined {
  const match = /(?:title|aaname|app|name)=['"]([^'"]+)['"]/iu.exec(selector);
  return match?.[1];
}

function basename(path: string): string {
  const cleaned = path.replace(/[\\/]+$/u, "");
  const slash = Math.max(cleaned.lastIndexOf("/"), cleaned.lastIndexOf("\\"));
  return slash >= 0 ? cleaned.slice(slash + 1) : cleaned;
}
