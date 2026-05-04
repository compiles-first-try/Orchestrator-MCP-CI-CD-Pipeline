// UiPath REST endpoints that live inside a folder require one of these
// scoping headers per request. We accept whichever variant the caller has
// most readily available.
export type FolderContext =
  | { readonly folderId: string | number }
  | { readonly folderKey: string }
  | { readonly folderPath: string };

export function folderHeaders(folder: FolderContext | undefined): Record<string, string> {
  if (folder === undefined) return {};
  if ("folderId" in folder) {
    return { "X-UIPATH-OrganizationUnitId": String(folder.folderId) };
  }
  if ("folderKey" in folder) {
    return { "X-UIPATH-FolderKey": folder.folderKey };
  }
  // folderPath
  return { "X-UIPATH-FolderPath-Encoded": encodeURIComponent(folder.folderPath) };
}
