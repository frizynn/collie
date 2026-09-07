import { afterEach, describe, expect, test } from "bun:test";
import { mkdtemp, mkdir, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { commandMetadata, discoverPaneSkills, skillMetadata } from "./skills.ts";

const cleanup: string[] = [];
afterEach(async () => { for (const path of cleanup.splice(0)) await rm(path, { recursive: true, force: true }); });
async function setup() {
  const root = await mkdtemp(join(tmpdir(), "collie-skills-")); cleanup.push(root);
  const home = join(root, "home"), project = join(root, "repo"), cwd = join(project, "nested");
  await mkdir(cwd, { recursive: true }); await mkdir(join(project, ".git")); await mkdir(home);
  const options = { home, codexHome: join(home, ".codex"), claudeHome: join(home, ".claude") };
  return { root, home, project, cwd, options };
}
async function skill(path: string, name: string, extra = "", description = "An installed skill") {
  await mkdir(path, { recursive: true });
  await writeFile(join(path, "SKILL.md"), `---\nname: ${name}\ndescription: ${description}\n${extra}---\nSecret skill body never sent to browser`);
}
async function command(path: string, text: string) {
  await mkdir(join(path, ".."), { recursive: true });
  await writeFile(path, text);
}

describe("skill metadata", () => {
  test("legacy command metadata permits no frontmatter and never runs dynamic content", () => {
    expect(commandMetadata("First paragraph\ncontinues.\n\n!`echo never-run`")).toEqual({ description: "First paragraph continues.", invocable: true });
    expect(commandMetadata("---\ndescription: Metadata only\nname: ignored\ndisable-model-invocation: true\n---\nSecret body")).toEqual({ description: "Metadata only", invocable: true });
    expect(commandMetadata("---\ninvalid: [\n---\nBody")).toBeNull();
    expect(commandMetadata("---\ndescription: incomplete")).toBeNull();
    for (const flag of ["false", "no", "off", "0", "FALSE"]) expect(commandMetadata(`---\nuser-invocable: ${flag}\n---\nPrivate`)?.invocable).toBe(false);
  });
  test("reads folded YAML metadata only and keeps explicit human-only skills", () => {
    expect(skillMetadata("---\nname: release\ndescription: >-\n  First line\n  second line\ndisable-model-invocation: true\n---\nbody", "fallback")).toEqual({ name: "release", description: "First line second line", invocable: true });
    expect(skillMetadata("---\nuser-invocable: false\n---\nbody", "hidden")?.invocable).toBe(false);
  });
  test("rejects malformed metadata and invocation injection", () => {
    expect(skillMetadata("---\nname: ../escape\n---\n", "fallback")).toBeNull();
    expect(skillMetadata("---\nname: 'two words'\n---\n", "fallback")).toBeNull();
    expect(skillMetadata("---\nname: [bad\n---", "fallback")).toBeNull();
    expect(skillMetadata("no frontmatter", "fallback")).toBeNull();
  });
});

describe("pane skills discovery", () => {
  test("Claude skills permit optional frontmatter while Codex still requires it", async () => {
    const x = await setup();
    const body = "Use this workflow for a release.\n\n!`echo do-not-execute`";
    await command(join(x.options.claudeHome, "skills", "release", "SKILL.md"), body);
    await command(join(x.options.claudeHome, "skills", "brief", "SKILL.md"), "---\nname: Display label\n---\nSummarize the current work.");
    await command(join(x.options.claudeHome, "skills", "invalid", "SKILL.md"), "---\nname: incomplete");
    await command(join(x.options.codexHome, "skills", "release", "SKILL.md"), body);
    const pane = { paneId: "one", cwd: x.cwd };
    const claude = await discoverPaneSkills({ ...pane, agent: "claude" }, x.options);
    expect(claude.skills.map((row) => [row.invocation, row.description])).toEqual([
      ["/brief", "Summarize the current work."], ["/release", "Use this workflow for a release."],
    ]);
    expect((await discoverPaneSkills({ ...pane, agent: "codex" }, x.options)).total).toBe(0);
  });
  test("Claude legacy names come from nested paths, skill.md directories and filenames, not display name", async () => {
    const x = await setup();
    const root = join(x.options.claudeHome, "commands");
    await command(join(root, "frontend", "review.md"), "---\nname: Wrong display name\ndescription: Review UI\n---\nBody");
    await command(join(root, "deploy", "SKILL.md"), "Deploy this project");
    await command(join(root, "SKILL.md"), "No root command name");
    await command(join(root, "readme.txt"), "Not a command");
    await command(join(root, ".hidden.md"), "Hidden");
    const result = await discoverPaneSkills({ paneId: "one", agent: "claude", cwd: x.cwd }, x.options);
    expect(result.skills.map((row) => row.invocation)).toEqual(["/deploy", "/frontend:review"]);
    expect(result.skills[1]?.description).toBe("Review UI");
    expect(result.total).toBe(2);
  });
  test("skills override legacy commands, personal commands override project, and hidden winners do not fall back", async () => {
    const x = await setup(), personal = join(x.options.claudeHome, "commands"), project = join(x.project, ".claude", "commands");
    await command(join(personal, "deploy.md"), "Personal deploy");
    await command(join(project, "deploy.md"), "Project deploy");
    await command(join(personal, "review.md"), "Personal legacy review");
    await skill(join(x.project, ".claude", "skills", "review"), "display", "", "Project skill wins");
    await command(join(personal, "hidden.md"), "---\nuser-invocable: false\n---\nHidden");
    await command(join(project, "hidden.md"), "Must not leak through");
    await command(join(project, "off.md"), "Hidden by override");
    await writeFile(join(x.options.claudeHome, "settings.json"), JSON.stringify({ skillOverrides: { off: "off" } }));
    const result = await discoverPaneSkills({ paneId: "one", agent: "claude", cwd: x.cwd }, x.options);
    expect(result.skills.map((row) => [row.name, row.description, row.source])).toEqual([["deploy", "Personal deploy", "user"], ["review", "Project skill wins", "project"]]);
  });
  test("legacy plugin commands require enabled installations and keep the plugin namespace", async () => {
    const x = await setup(), install = join(x.options.claudeHome, "plugins", "cache", "market", "editor", "1");
    await command(join(install, "commands", "frontend", "check.md"), "Check the frontend");
    await command(join(install, "commands", "hidden.md"), "Hidden plugin command");
    await writeFile(join(x.options.claudeHome, "plugins", "installed_plugins.json"), JSON.stringify({ plugins: { "editor@market": [{ scope: "user", installPath: install }] } }));
    expect((await discoverPaneSkills({ paneId: "one", agent: "claude", cwd: x.cwd }, x.options)).skills).toEqual([]);
    await writeFile(join(x.options.claudeHome, "settings.json"), JSON.stringify({ enabledPlugins: { "editor@market": true }, skillOverrides: { "editor:hidden": "off" } }));
    const result = await discoverPaneSkills({ paneId: "one", agent: "claude", cwd: x.cwd }, x.options);
    expect(result.skills.map((row) => row.invocation)).toEqual(["/editor:frontend:check"]);
  });
  test("legacy command files and nested directories cannot escape their canonical root", async () => {
    const x = await setup(), root = join(x.options.claudeHome, "commands"), outside = join(x.root, "outside");
    await command(join(root, "valid.md"), "Valid");
    await command(join(outside, "secret.md"), "Private file content");
    await symlink(join(outside, "secret.md"), join(root, "leak.md"));
    await symlink(outside, join(root, "escape"));
    const result = await discoverPaneSkills({ paneId: "one", agent: "claude", cwd: x.cwd }, x.options);
    expect(result.skills.map((row) => row.name)).toEqual(["valid"]);
  });
  test("legacy inventories share the finite catalog cap and do not appear under Codex's skill trigger", async () => {
    const x = await setup(), root = join(x.options.claudeHome, "commands");
    await mkdir(root, { recursive: true });
    await Promise.all(Array.from({ length: 505 }, (_, index) => writeFile(join(root, `item-${index}.md`), "Command metadata")));
    const pane = { paneId: "one", cwd: x.cwd };
    const claude = await discoverPaneSkills({ ...pane, agent: "claude" }, x.options);
    expect(claude.total).toBe(500);
    expect(claude.truncated).toBe(true);
    expect((await discoverPaneSkills({ ...pane, agent: "codex" }, x.options)).total).toBe(0);
  });
  test("uses pane cwd, nearest project overrides user, and stops at the git root", async () => {
    const x = await setup();
    await skill(join(x.home, ".agents/skills/shared"), "shared", "", "user");
    await skill(join(x.project, ".agents/skills/shared"), "shared", "", "project");
    await skill(join(x.cwd, ".agents/skills/closest"), "closest");
    await skill(join(x.root, ".agents/skills/outside"), "outside");
    await skill(join(x.options.codexHome, "skills/.system/builtin"), "builtin");
    const result = await discoverPaneSkills({ paneId: "one", agent: "codex", cwd: x.cwd }, x.options);
    expect(result.total).toBe(3); expect(result.trigger).toBe("$");
    expect(result.skills.find((s) => s.name === "shared")).toEqual({ name: "shared", description: "project", invocation: "$shared", source: "project" });
    expect(result.skills.find((s) => s.name === "builtin")?.source).toBe("system");
    expect(JSON.stringify(result)).not.toContain(x.root);
    expect(JSON.stringify(result)).not.toContain("Secret skill body");
  });

  test("follows registered directory symlinks, rejects escaping SKILL.md links, and breaks cycles", async () => {
    const x = await setup(); const installed = join(x.root, "installed");
    await skill(installed, "linked");
    const root = join(x.home, ".agents/skills"); await mkdir(root, { recursive: true });
    await symlink(installed, join(root, "linked"));
    await symlink(root, join(root, "cycle"));
    await mkdir(join(root, "bad"));
    await symlink(join(installed, "SKILL.md"), join(root, "bad/SKILL.md"));
    const result = await discoverPaneSkills({ paneId: "one", agent: "codex", cwd: x.cwd }, x.options);
    expect(result.skills.map((s) => s.name)).toEqual(["linked"]);
    expect(result.truncated).toBe(false);
  });

  test("Claude hides non-user skills, keeps manual-only skills, and honors personal precedence", async () => {
    const x = await setup();
    await skill(join(x.options.claudeHome, "skills/shared"), "shared", "user-invocable: false\n");
    await skill(join(x.project, ".claude/skills/shared"), "shared");
    await skill(join(x.options.claudeHome, "skills/manual"), "manual", "disable-model-invocation: true\n");
    const result = await discoverPaneSkills({ paneId: "one", agent: "claude", cwd: x.cwd }, x.options);
    expect(result.skills.map((s) => s.invocation)).toEqual(["/manual"]);
  });

  test("Claude uses the directory command name and honors settings skillOverrides off", async () => {
    const x = await setup();
    await skill(join(x.options.claudeHome, "skills/actual-command"), "Pretty display label");
    await skill(join(x.options.claudeHome, "skills/disabled"), "disabled");
    await writeFile(join(x.options.claudeHome, "settings.json"), JSON.stringify({ skillOverrides: { disabled: "off" } }));
    const result = await discoverPaneSkills({ paneId: "one", agent: "claude", cwd: x.cwd }, x.options);
    expect(result.skills.map((s) => s.invocation)).toEqual(["/actual-command"]);
  });

  test("Codex includes only enabled installed plugin skills with namespaced invocation", async () => {
    const x = await setup();
    await skill(join(x.options.codexHome, "plugins/cache/market/editor/1.0.0/skills/review"), "review");
    await skill(join(x.options.codexHome, "plugins/cache/market/disabled/1.0.0/skills/other"), "other");
    await writeFile(join(x.options.codexHome, "config.toml"), '[plugins."editor@market"]\nenabled = true\n[plugins."disabled@market"]\nenabled = false\n');
    const result = await discoverPaneSkills({ paneId: "one", agent: "codex", cwd: x.cwd }, x.options);
    expect(result.skills.map((s) => s.invocation)).toEqual(["$editor:review"]);
    expect(result.skills[0]?.source).toBe("plugin");
  });

  test("Codex excludes disabled skills by canonical config path including symlink aliases", async () => {
    const x = await setup();
    const installed = join(x.root, "installed");
    await skill(installed, "disabled");
    await mkdir(join(x.options.codexHome, "skills"), { recursive: true });
    await symlink(installed, join(x.options.codexHome, "skills/alias"));
    await writeFile(join(x.options.codexHome, "config.toml"), `[[skills.config]]\npath = "${join(installed, "SKILL.md")}"\nenabled = false\n`);
    const result = await discoverPaneSkills({ paneId: "one", agent: "codex", cwd: x.cwd }, x.options);
    expect(result.total).toBe(0);
  });

  test("Claude requires both enablement and an installed plugin confined to its plugin root", async () => {
    const x = await setup();
    const install = join(x.options.claudeHome, "plugins/cache/market/editor/1.0.0");
    await skill(join(install, "skills/review"), "review");
    await writeFile(join(x.options.claudeHome, "settings.json"), JSON.stringify({ enabledPlugins: { "editor@market": true } }));
    await writeFile(join(x.options.claudeHome, "plugins/installed_plugins.json"), JSON.stringify({ plugins: { "editor@market": [{ scope: "user", installPath: install }] } }));
    const result = await discoverPaneSkills({ paneId: "one", agent: "claude", cwd: x.cwd }, x.options);
    expect(result.skills.map((s) => s.invocation)).toEqual(["/editor:review"]);
  });

  test("unsupported agents have no invented catalog", async () => {
    const result = await discoverPaneSkills({ paneId: "shell", agent: "shell", cwd: "/" });
    expect(result).toEqual({ paneId: "shell", available: false, trigger: null, total: 0, skills: [], truncated: false, reason: "unsupported-agent" });
  });
});
