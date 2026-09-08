import { afterEach, describe, expect, it } from "bun:test";
import { mkdirSync, mkdtempSync, rmSync, statSync, utimesSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createBridgeStampReader } from "./bridge-stamp.ts";

const roots: string[] = [];
afterEach(() => { for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true }); });

function fixture() {
  const root = mkdtempSync(join(tmpdir(), "bridge-stamp-"));
  roots.push(root);
  const bridge = join(root, "bridge");
  mkdirSync(join(bridge, "journal"), { recursive: true });
  const source = join(bridge, "index.ts");
  writeFileSync(source, "export const value = 1;\n");
  writeFileSync(join(root, "package.json"), '{"version":"0.36.0"}');
  writeFileSync(join(root, "bun.lock"), "dependencies");
  return { root, bridge, source, read: createBridgeStampReader(bridge, root) };
}

describe("bridge content stamp", () => {
  it("ignores timestamp-only touches and identical-content checkout replacements", () => {
    const { source, read } = fixture();
    const startup = read();
    utimesSync(source, new Date(), new Date(Date.now() + 60_000));
    expect(read()).toBe(startup);
    rmSync(source);
    writeFileSync(source, "export const value = 1;\n");
    expect(read()).toBe(startup);
  });

  it("detects equal-size edits even when the previous mtime is restored", () => {
    const { source, read } = fixture();
    const startup = read();
    const previous = statSync(source);
    writeFileSync(source, "export const value = 2;\n");
    utimesSync(source, previous.atime, previous.mtime);
    expect(read()).not.toBe(startup);
    writeFileSync(source, "export const value = 1;\n");
    expect(read()).toBe(startup);
  });

  it("tracks nested runtime additions, edits and deletions", () => {
    const { bridge, read } = fixture();
    const startup = read();
    const nested = join(bridge, "journal", "reader.ts");
    writeFileSync(nested, "export const reader = 1;");
    const added = read();
    expect(added).not.toBe(startup);
    writeFileSync(nested, "export const reader = 2;");
    expect(read()).not.toBe(added);
    rmSync(nested);
    expect(read()).toBe(startup);
  });

  it("excludes tests, declarations and frontend files", () => {
    const { root, bridge, read } = fixture();
    const startup = read();
    writeFileSync(join(bridge, "journal", "reader.test.ts"), "test");
    writeFileSync(join(bridge, "reader.spec.ts"), "test");
    writeFileSync(join(bridge, "types.d.ts"), "types");
    mkdirSync(join(root, "web"));
    writeFileSync(join(root, "web", "index.ts"), "frontend");
    expect(read()).toBe(startup);
  });

  it("detects dependency changes and removal", () => {
    const { root, read } = fixture();
    const startup = read();
    writeFileSync(join(root, "bun.lock"), "new dependencies");
    expect(read()).not.toBe(startup);
    writeFileSync(join(root, "bun.lock"), "dependencies");
    expect(read()).toBe(startup);
    rmSync(join(root, "package.json"));
    expect(read()).not.toBe(startup);
  });
});
