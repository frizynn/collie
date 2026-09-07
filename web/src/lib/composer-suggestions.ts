import { commandsFor } from "./agent-commands";
import { canonicalAgent } from "./operator-scope";
import { detectSkillCompletion, type SkillCompletion, type SkillOption } from "./skill-completion";
import type { OperatorCommand } from "./types";

export interface ComposerCompletion extends SkillCompletion { trigger: "$" | "/" }

/** Slash commands start a prompt; Codex skills can also be mentioned within ordinary prose. */
export function detectComposerCompletion(draft: string, cursor: number, agent?: string | null): ComposerCompletion | null {
  const family = canonicalAgent(agent?.trim().toLowerCase() ?? "");
  if (family !== "codex" && family !== "claude") return null;
  const skill = family === "codex" ? detectSkillCompletion(draft, cursor, "$") : null;
  if (skill) return { ...skill, trigger: "$" };
  const command = detectSkillCompletion(draft, cursor, "/");
  return command && draft.slice(0, command.start).trim() === "" ? { ...command, trigger: "/" } : null;
}

/** Commands retain provider/operator scope and win exact invocation collisions. Suggestions only
 * insert text; execution and confirmation belong to the existing composer/command action paths.
 */
export function composerSuggestions(agent: string | null | undefined, trigger: "$" | "/", skills: readonly SkillOption[], mine: readonly OperatorCommand[] = []): SkillOption[] {
  const family = canonicalAgent(agent?.trim().toLowerCase() ?? "");
  if (family !== "codex" && family !== "claude") return [];
  if (trigger === "$" && family !== "codex") return [];
  const suggestions = new Map<string, SkillOption>();
  if (trigger === "/") {
    for (const command of commandsFor(agent, mine)) suggestions.set(command.command, {
      name: command.command, invocation: command.command, description: command.description, kind: "command",
    });
  }
  if (trigger === "$" || family === "claude") {
    for (const skill of skills) {
      if (!skill.invocation.startsWith(trigger) || !/^[\p{L}\p{N}_.:-]+$/u.test(skill.invocation.slice(1)) || suggestions.has(skill.invocation)) continue;
      suggestions.set(skill.invocation, { ...skill, kind: "skill" });
    }
  }
  return [...suggestions.values()];
}
