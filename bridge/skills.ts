// A metadata-only inventory of installed, user-invocable skills. Pane cwd comes from Herdr;
// browsers never supply paths. Directory symlinks are intentional skill installations; each
// SKILL.md must stay inside its installation's canonical directory, even after resolving symlinks.
import { opendir, realpath, stat } from "node:fs/promises";
import { homedir } from "node:os";
import { basename, dirname, isAbsolute, join } from "node:path";
import { containedRealpath } from "./journal/files.ts";
import type { AgentView, PaneSkill, PaneSkillsResponse } from "./types.ts";

const MAX_SKILLS = 500;
const MAX_DIRECTORIES = 1500;
const MAX_HEADER_BYTES = 16 * 1024;
const NAME = /^[a-zA-Z0-9][a-zA-Z0-9._-]{0,127}$/;
const object = (value: unknown): Record<string, unknown> =>
  value !== null && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
const invocable = (data: Record<string, unknown>): boolean =>
  data["user-invocable"] !== false && data["user-invocable"] !== 0 &&
  !(typeof data["user-invocable"] === "string" && /^(false|no|off|0)$/i.test(data["user-invocable"].trim()));

export function skillMetadata(text: string, fallback: string, directoryName = false, namespace?: string, optionalFrontmatter = false): { name: string; description: string; invocable: boolean } | null {
  const header = /^\uFEFF?---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/.exec(text);
  if (!header) {
    if (!optionalFrontmatter || !NAME.test(fallback)) return null;
    const metadata = commandMetadata(text);
    return metadata ? { name: fallback, ...metadata } : null;
  }
  try {
    const data = object(Bun.YAML.parse(header[1]!));
    let name = !directoryName && typeof data.name === "string" ? data.name.trim() : fallback;
    if (namespace && name.startsWith(`${namespace}:`)) name = name.slice(namespace.length + 1);
    if (!NAME.test(name)) return null;
    const description = typeof data.description === "string" ? data.description.replace(/\s+/g, " ").trim().slice(0, 600) : optionalFrontmatter ? commandMetadata(text)?.description ?? "" : "";
    // disable-model-invocation prevents automatic use, not an explicit human invocation.
    return { name, description, invocable: invocable(data) };
  } catch { return null; }
}

/** Legacy Claude command files use the path-derived command name; frontmatter is optional and
 * never executes here. The first paragraph supplies a description when one was not declared.
 */
export function commandMetadata(text: string): { description: string; invocable: boolean } | null {
  let body = text, data: Record<string, unknown> = {};
  if (/^\uFEFF?---\r?\n/.test(text)) {
    const header = /^\uFEFF?---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/.exec(text);
    if (!header) return null;
    try { data = object(Bun.YAML.parse(header[1]!)); } catch { return null; }
    body = text.slice(header[0].length);
  }
  const description = typeof data.description === "string" ? data.description : body.trim().split(/\r?\n\s*\r?\n/, 1)[0] ?? "";
  return { description: description.replace(/\s+/g, " ").trim().slice(0, 600), invocable: invocable(data) };
}

interface Root { path: string; source: PaneSkill["source"]; namespace?: string }
interface Options { home?: string; codexHome?: string; claudeHome?: string }

async function metadataFile(path: string, root: string, bytes: number): Promise<string | null> {
  const contained = await containedRealpath(path, root);
  if (!contained) return null;
  const info = await stat(contained).catch(() => null);
  if (!info?.isFile()) return null;
  return Bun.file(contained).slice(0, bytes).text().catch(() => null);
}

async function jsonFile(path: string, root: string): Promise<Record<string, unknown>> {
  const text = await metadataFile(path, root, 256 * 1024);
  try { return object(JSON.parse(text ?? "{}")); } catch { return {}; }
}

async function directories(path: string, maximum: number): Promise<{ names: string[]; truncated: boolean }> {
  const names: string[] = [];
  const dir = await opendir(path).catch(() => null);
  if (!dir) return { names, truncated: false };
  let examined = 0;
  for await (const item of dir) {
    if (examined++ >= maximum) return { names, truncated: true };
    if (item.isDirectory() || item.isSymbolicLink()) names.push(item.name);
  }
  return { names: names.sort(), truncated: false };
}

/** Startup roots up to the nearest repository boundary. No subprocess or client-controlled glob. */
async function ancestors(cwd: string): Promise<string[]> {
  if (!isAbsolute(cwd)) return [];
  const real = await realpath(cwd).catch(() => null);
  if (!real) return [];
  const roots: string[] = [];
  for (let current = real; roots.length < 24; current = dirname(current)) {
    roots.push(current);
    if (await stat(join(current, ".git")).catch(() => null)) break;
    if (dirname(current) === current) break;
  }
  return roots;
}

async function claudeSettings(agentHome: string, project: string[]): Promise<Record<string, Record<string, unknown>>> {
  const settings: Record<string, Record<string, unknown>> = { enabledPlugins: {}, skillOverrides: {} };
  for (const root of [agentHome, ...project.slice().reverse().map((path) => join(path, ".claude"))]) {
    for (const filename of ["settings.json", "settings.local.json"]) {
      const data = await jsonFile(join(root, filename), root);
      for (const key of ["enabledPlugins", "skillOverrides"]) Object.assign(settings[key]!, object(data[key]));
    }
  }
  return settings;
}

async function disabledCodexSkills(agentHome: string, home: string, project: string[]): Promise<Set<string>> {
  const configured = new Map<string, boolean>();
  for (const root of [agentHome, ...project.slice().reverse().map((path) => join(path, ".codex"))]) {
    const text = await metadataFile(join(root, "config.toml"), root, 256 * 1024);
    let config: Record<string, unknown>;
    try { config = object(Bun.TOML.parse(text ?? "")); } catch { continue; }
    const entries = object(config.skills).config;
    if (!Array.isArray(entries)) continue;
    for (const value of entries.slice(0, 1000)) {
      const entry = object(value);
      if (typeof entry.path !== "string" || typeof entry.enabled !== "boolean") continue;
      const path = entry.path.startsWith("~/") ? join(home, entry.path.slice(2)) : entry.path;
      const absolute = isAbsolute(path) ? path : join(root, path);
      const canonical = await realpath(absolute).catch(() => null);
      if (canonical) configured.set(basename(canonical) === "SKILL.md" ? dirname(canonical) : canonical, entry.enabled);
    }
  }
  return new Set([...configured].filter(([, enabled]) => !enabled).map(([path]) => path));
}

async function pluginRoots(agent: string, agentHome: string, project: string[], settings: Record<string, Record<string, unknown>>): Promise<Root[]> {
  const roots: Root[] = [];
  if (agent === "codex") {
    const text = await metadataFile(join(agentHome, "config.toml"), agentHome, 256 * 1024);
    let config: Record<string, unknown> = {};
    try { config = object(Bun.TOML.parse(text ?? "")); } catch { return []; }
    for (const [id, value] of Object.entries(object(config.plugins)).slice(0, 100)) {
      if (object(value).enabled !== true) continue;
      const [name, marketplace, extra] = id.split("@");
      if (!name || !marketplace || extra || !NAME.test(name) || !NAME.test(marketplace)) continue;
      const base = join(agentHome, "plugins", "cache", marketplace, name);
      const versions = (await directories(base, 20)).names.sort((a, b) => b.localeCompare(a, undefined, { numeric: true }));
      if (versions[0]) roots.push({ path: join(base, versions[0], "skills"), source: "plugin", namespace: name });
    }
  } else {
    // Only enabled, installed plugins qualify. Merely cached marketplace content is not installed.
    const enabled = settings.enabledPlugins ?? {};
    const installed = object((await jsonFile(join(agentHome, "plugins", "installed_plugins.json"), agentHome)).plugins);
    for (const [id, versions] of Object.entries(installed).slice(0, 100)) {
      if (enabled[id] !== true || !Array.isArray(versions)) continue;
      const name = id.split("@")[0];
      if (!name || !NAME.test(name)) continue;
      for (const version of versions.slice(0, 20)) {
        const item = object(version);
        if (item.scope !== "user" && !(typeof item.projectPath === "string" && project.includes(item.projectPath))) continue;
        if (typeof item.installPath !== "string") continue;
        const path = await containedRealpath(item.installPath, join(agentHome, "plugins"));
        if (path) roots.push({ path: join(path, "skills"), source: "plugin", namespace: name });
      }
    }
  }
  return roots;
}

export async function discoverPaneSkills(pane: Pick<AgentView, "paneId" | "agent" | "cwd">, options: Options = {}): Promise<PaneSkillsResponse> {
  const { paneId, agent } = pane;
  const trigger = agent === "codex" ? "$" : agent === "claude" ? "/" : null;
  if (!trigger) return { paneId, available: false, trigger, skills: [], total: 0, truncated: false, reason: "unsupported-agent" };
  const home = options.home ?? homedir();
  const agentHome = agent === "codex" ? options.codexHome ?? process.env.CODEX_HOME ?? join(home, ".codex") : options.claudeHome ?? process.env.CLAUDE_CONFIG_DIR ?? join(home, ".claude");
  const project = await ancestors(pane.cwd);
  const projectRoots: Root[] = project.map((path) => ({ path: join(path, agent === "codex" ? ".agents" : ".claude", "skills"), source: "project" }));
  const userRoots: Root[] = agent === "codex"
    ? [{ path: join(home, ".agents", "skills"), source: "user" }, { path: join(agentHome, "skills"), source: "user" }]
    : [{ path: join(agentHome, "skills"), source: "user" }];
  const roots = agent === "claude" ? [...userRoots, ...projectRoots] : [...projectRoots, ...userRoots];
  const settings = agent === "claude" ? await claudeSettings(agentHome, project) : {};
  const plugins = await pluginRoots(agent, agentHome, project, settings);
  roots.push(...plugins);
  const disabled = agent === "codex" ? await disabledCodexSkills(agentHome, home, project) : new Set<string>();
  const skills = new Map<string, PaneSkill>();
  const visited = new Set<string>();
  const claimed = new Set<string>();
  let traversed = 0;
  let truncated = false;
  async function scan(root: Root, depth = 0): Promise<void> {
    if (depth > 4 || traversed >= MAX_DIRECTORIES || skills.size >= MAX_SKILLS) { truncated = true; return; }
    const canonical = await realpath(root.path).catch(() => null);
    if (!canonical || disabled.has(canonical) || visited.has(`${root.namespace ?? ""}\0${canonical}`)) return;
    visited.add(`${root.namespace ?? ""}\0${canonical}`);
    traversed++;
    const text = await metadataFile(join(canonical, "SKILL.md"), canonical, MAX_HEADER_BYTES);
    if (text !== null) {
      const metadata = skillMetadata(text, basename(root.path), agent === "claude" && !root.namespace, root.namespace, agent === "claude");
      if (metadata) {
        const name = root.namespace ? `${root.namespace}:${metadata.name}` : metadata.name;
        const hidden = agent === "claude" && settings.skillOverrides?.[name] === "off";
        if (!claimed.has(name) && !hidden && (agent !== "claude" || metadata.invocable)) {
          skills.set(name, { name, description: metadata.description, invocation: `${trigger}${name}`, source: root.source });
        }
        claimed.add(name);
      }
      return;
    }
    const children = await directories(canonical, MAX_DIRECTORIES - traversed);
    truncated ||= children.truncated;
    for (const name of children.names) {
      if (name.startsWith(".") && name !== ".system") continue;
      if (agent === "claude" && name.toLowerCase() === "synced") continue;
      await scan({ ...root, path: join(canonical, name), source: name === ".system" ? "system" : root.source }, depth + 1);
    }
  }
  for (const root of roots) await scan(root);
  // Skills claim names first, including hidden skills, so a legacy command cannot silently replace
  // a disabled/overriding skill. Within commands, personal precedes project; plugin names are scoped.
  async function scanCommands(root: Root, parts: string[] = [], anchor?: string): Promise<void> {
    if (parts.length > 4 || traversed >= MAX_DIRECTORIES || skills.size >= MAX_SKILLS) { truncated = true; return; }
    const canonical = await containedRealpath(root.path, anchor ?? root.path);
    const key = `commands\0${root.namespace ?? ""}\0${canonical}`;
    if (!canonical || visited.has(key)) return;
    visited.add(key);
    traversed++;
    const directory = await opendir(canonical).catch(() => null);
    if (!directory) return;
    const names: string[] = [];
    let examined = 0;
    for await (const entry of directory) {
      if (examined++ >= MAX_DIRECTORIES - traversed) { truncated = true; break; }
      names.push(entry.name);
    }
    for (const filename of names.sort()) {
      if (traversed >= MAX_DIRECTORIES || skills.size >= MAX_SKILLS) { truncated = true; break; }
      traversed++;
      if (filename.startsWith(".")) continue;
      const path = join(canonical, filename), info = await stat(path).catch(() => null);
      if (info?.isDirectory() && NAME.test(filename)) {
        await scanCommands({ ...root, path }, [...parts, filename], anchor ?? canonical);
      } else if (info?.isFile() && filename.endsWith(".md")) {
        const segments = /^skill\.md$/i.test(filename) ? parts : [...parts, filename.slice(0, -3)];
        if (!segments.length || !segments.every((segment) => NAME.test(segment))) continue;
        const name = [...(root.namespace ? [root.namespace] : []), ...segments].join(":");
        if (claimed.has(name)) continue;
        const text = await metadataFile(path, anchor ?? canonical, MAX_HEADER_BYTES);
        const metadata = text === null ? null : commandMetadata(text);
        if (!metadata) continue;
        claimed.add(name);
        if (metadata.invocable && settings.skillOverrides?.[name] !== "off") {
          skills.set(name, { name, description: metadata.description, invocation: `/${name}`, source: root.source });
        }
      }
    }
  }
  if (agent === "claude") {
    const commands: Root[] = [
      { path: join(agentHome, "commands"), source: "user" },
      ...project.map((path): Root => ({ path: join(path, ".claude", "commands"), source: "project" })),
      ...plugins.map((root) => ({ ...root, path: join(dirname(root.path), "commands") })),
    ];
    for (const root of commands) await scanCommands(root);
  }
  const catalog = [...skills.values()].sort((a, b) => a.name.localeCompare(b.name));
  return { paneId, available: true, trigger, skills: catalog, total: catalog.length, truncated };
}
