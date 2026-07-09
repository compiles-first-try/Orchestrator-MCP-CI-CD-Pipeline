import { deflateRawSync } from "node:zlib";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, describe, expect, it } from "vitest";
import { ingestNupkg, readZipEntries } from "../src/index.js";

// A minimal ZIP writer used only by the tests, exercising both the "stored" and
// "deflate" paths of the reader. CRC fields are left zero — the reader does not
// validate them.
interface FileEntry {
  readonly name: string;
  readonly content: string;
  readonly deflate: boolean;
}

function makeZip(files: readonly FileEntry[]): Buffer {
  const locals: Buffer[] = [];
  const centrals: Buffer[] = [];
  let offset = 0;

  for (const file of files) {
    const nameBuf = Buffer.from(file.name, "utf8");
    const rawData = Buffer.from(file.content, "utf8");
    const stored = file.deflate ? deflateRawSync(rawData) : rawData;
    const method = file.deflate ? 8 : 0;

    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(method, 8);
    local.writeUInt32LE(0, 14); // crc
    local.writeUInt32LE(stored.length, 18);
    local.writeUInt32LE(rawData.length, 22);
    local.writeUInt16LE(nameBuf.length, 26);
    locals.push(local, nameBuf, stored);

    const central = Buffer.alloc(46);
    central.writeUInt32LE(0x02014b50, 0);
    central.writeUInt16LE(method, 10);
    central.writeUInt32LE(0, 16); // crc
    central.writeUInt32LE(stored.length, 20);
    central.writeUInt32LE(rawData.length, 24);
    central.writeUInt16LE(nameBuf.length, 28);
    central.writeUInt32LE(offset, 42);
    centrals.push(central, nameBuf);

    offset += local.length + nameBuf.length + stored.length;
  }

  const centralDir = Buffer.concat(centrals);
  const localSection = Buffer.concat(locals);
  const eocd = Buffer.alloc(22);
  eocd.writeUInt32LE(0x06054b50, 0);
  eocd.writeUInt16LE(files.length, 8);
  eocd.writeUInt16LE(files.length, 10);
  eocd.writeUInt32LE(centralDir.length, 12);
  eocd.writeUInt32LE(localSection.length, 16);
  return Buffer.concat([localSection, centralDir, eocd]);
}

const MIN_XAML = `<?xml version="1.0"?><Activity xmlns="http://schemas.microsoft.com/netfx/2009/xaml/activities"
  xmlns:ui="http://schemas.uipath.com/workflow/activities" DisplayName="Main">
  <Sequence DisplayName="Root">
    <ui:SendMail DisplayName="Notify" Account="ops@contoso.com" />
  </Sequence>
</Activity>`;

const tmpDirs: string[] = [];

afterAll(async () => {
  await Promise.all(tmpDirs.map((d) => rm(d, { recursive: true, force: true })));
});

describe("readZipEntries", () => {
  it("reads stored and deflated entries and skips directories", () => {
    const zip = makeZip([
      { name: "content/", content: "", deflate: false },
      { name: "content/Main.xaml", content: MIN_XAML, deflate: false },
      { name: "project.json", content: '{"name":"Zip Bot","main":"Main.xaml"}', deflate: true },
    ]);
    const entries = readZipEntries(zip);
    const names = entries.map((e) => e.fileName).sort();
    expect(names).toEqual(["content/Main.xaml", "project.json"]);
    expect(entries.find((e) => e.fileName === "project.json")?.data.toString("utf8")).toContain(
      "Zip Bot",
    );
  });

  it("throws on non-zip input", () => {
    expect(() => readZipEntries(Buffer.from("not a zip"))).toThrow();
  });
});

describe("ingestNupkg", () => {
  it("ingests XAML and project.json out of a .nupkg", async () => {
    const dir = await mkdtemp(join(tmpdir(), "pg-nupkg-"));
    tmpDirs.push(dir);
    const pkgPath = join(dir, "bot.nupkg");
    await writeFile(
      pkgPath,
      makeZip([
        { name: "content/Main.xaml", content: MIN_XAML, deflate: true },
        { name: "project.json", content: '{"name":"Zip Bot","main":"Main.xaml"}', deflate: false },
      ]),
    );

    const result = await ingestNupkg(pkgPath);
    expect(result.name).toBe("Zip Bot");
    expect(result.entryPoint).toBe("Main.xaml");
    expect(result.sources.map((s) => s.name)).toEqual(["Main.xaml"]);
  });
});
