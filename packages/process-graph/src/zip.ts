import { inflateRawSync } from "node:zlib";

// ---------------------------------------------------------------------------
// A tiny, dependency-free ZIP reader — just enough to pull XAML text out of a
// UiPath `.nupkg` (which is an OPC/ZIP archive). We deliberately avoid adding a
// zip dependency: the platform's dependency list is fixed by the spec, and the
// only thing we need is to enumerate entries and inflate their bytes. Supports
// the two compression methods UiPath packages use: stored (0) and deflate (8).
// ---------------------------------------------------------------------------

const EOCD_SIGNATURE = 0x06054b50;
const CENTRAL_DIR_SIGNATURE = 0x02014b50;
const LOCAL_HEADER_SIGNATURE = 0x04034b50;

export interface ZipEntry {
  readonly fileName: string;
  readonly data: Buffer;
}

/** Reads every file entry from an in-memory ZIP archive. */
export function readZipEntries(archive: Buffer): ZipEntry[] {
  const eocdOffset = findEndOfCentralDirectory(archive);
  if (eocdOffset < 0)
    throw new Error("Not a ZIP archive: end-of-central-directory record not found.");

  const entryCount = archive.readUInt16LE(eocdOffset + 10);
  let cursor = archive.readUInt32LE(eocdOffset + 16);
  const entries: ZipEntry[] = [];

  for (let i = 0; i < entryCount; i++) {
    if (archive.readUInt32LE(cursor) !== CENTRAL_DIR_SIGNATURE) {
      throw new Error(`Corrupt ZIP: expected central-directory header at offset ${cursor}.`);
    }
    const method = archive.readUInt16LE(cursor + 10);
    const compressedSize = archive.readUInt32LE(cursor + 20);
    const fileNameLength = archive.readUInt16LE(cursor + 28);
    const extraLength = archive.readUInt16LE(cursor + 30);
    const commentLength = archive.readUInt16LE(cursor + 32);
    const localHeaderOffset = archive.readUInt32LE(cursor + 42);
    const fileName = archive.toString("utf8", cursor + 46, cursor + 46 + fileNameLength);

    if (!fileName.endsWith("/")) {
      entries.push({
        fileName,
        data: extractLocalEntry(archive, localHeaderOffset, method, compressedSize),
      });
    }
    cursor += 46 + fileNameLength + extraLength + commentLength;
  }
  return entries;
}

function extractLocalEntry(
  archive: Buffer,
  offset: number,
  method: number,
  compressedSize: number,
): Buffer {
  if (archive.readUInt32LE(offset) !== LOCAL_HEADER_SIGNATURE) {
    throw new Error(`Corrupt ZIP: expected local file header at offset ${offset}.`);
  }
  const fileNameLength = archive.readUInt16LE(offset + 26);
  const extraLength = archive.readUInt16LE(offset + 28);
  const dataStart = offset + 30 + fileNameLength + extraLength;
  const raw = archive.subarray(dataStart, dataStart + compressedSize);

  if (method === 0) return Buffer.from(raw);
  if (method === 8) return inflateRawSync(raw);
  throw new Error(`Unsupported ZIP compression method ${method} for entry.`);
}

/** Scans backwards for the EOCD signature (the record may carry a comment). */
function findEndOfCentralDirectory(archive: Buffer): number {
  const minOffset = Math.max(0, archive.length - 22 - 0xffff);
  for (let i = archive.length - 22; i >= minOffset; i--) {
    if (archive.readUInt32LE(i) === EOCD_SIGNATURE) return i;
  }
  return -1;
}
