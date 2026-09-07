/** The browser only needs a skill's display text and literal invocation. */
export interface SkillOption {
  name: string;
  description: string;
  invocation: string;
}

export interface SkillCompletion {
  /** Entire token bounds, including a suffix to the right of the caret. */
  start: number;
  end: number;
  query: string;
}

/** Match a skill token at the caret without treating punctuation inside a word as a trigger. */
export function detectSkillCompletion(
  draft: string,
  cursor: number,
  trigger: "$" | "/",
): SkillCompletion | null {
  if (!Number.isInteger(cursor) || cursor < 0 || cursor > draft.length) return null;
  const prefix = draft.slice(0, cursor);
  const token = prefix.match(/(?:^|\s)([^\s]*)$/);
  if (!token || !token[1]?.startsWith(trigger)) return null;
  const query = token[1].slice(1);
  // Skill names are single identifiers; slash paths and shell substitutions are not skills.
  if (!/^[\p{L}\p{N}_.:-]*$/u.test(query)) return null;
  const start = cursor - token[1].length;
  const suffix = draft.slice(cursor).match(/^[\p{L}\p{N}_.:-]*/u)?.[0] ?? "";
  return { start, end: cursor + suffix.length, query };
}

/** Name matches precede description matches; source order stays stable within each rank. */
export function filterSkills<T extends SkillOption>(skills: readonly T[], query: string): T[] {
  const needle = query.trim().toLocaleLowerCase();
  if (!needle) return [...skills];
  const ranked = skills.map((skill, index) => {
    const name = skill.name.toLocaleLowerCase();
    const invocation = skill.invocation.replace(/^[$/]/, "").toLocaleLowerCase();
    const rank = name.startsWith(needle) || invocation.startsWith(needle) ? 0
      : name.includes(needle) || invocation.includes(needle) ? 1
        : skill.description.toLocaleLowerCase().includes(needle) ? 2 : -1;
    return { skill, rank, index };
  });
  return ranked.filter(({ rank }) => rank >= 0)
    .sort((a, b) => a.rank - b.rank || a.index - b.index)
    .map(({ skill }) => skill);
}

/** Insert text only. Preserve the surrounding draft and place the caret after the invocation. */
export function applySkillCompletion(
  draft: string,
  completion: SkillCompletion,
  skill: SkillOption,
): { value: string; cursor: number } {
  const before = draft.slice(0, completion.start);
  const after = draft.slice(completion.end);
  const separator = after.length === 0 ? " " : "";
  const inserted = skill.invocation + separator;
  // Existing whitespace remains byte-for-byte intact, but the caret moves beyond it so the next
  // typed word cannot join the skill invocation when completing in the middle of a draft.
  const existingSeparator = after.match(/^\s+/)?.[0].length ?? 0;
  return { value: before + inserted + after, cursor: before.length + inserted.length + existingSeparator };
}

export type SkillCompletionKeyAction =
  | { type: "move" | "select"; index: number }
  | { type: "dismiss" | "none" };

/** Parent invokes this only while the popup is open and prevents default for handled actions. */
export function skillCompletionKeyAction(
  key: string,
  activeIndex: number,
  count: number,
): SkillCompletionKeyAction {
  if (key === "Escape") return { type: "dismiss" };
  if (count <= 0) return { type: "none" };
  const active = Math.max(0, Math.min(count - 1, activeIndex));
  if (key === "ArrowDown") return { type: "move", index: (active + 1) % count };
  if (key === "ArrowUp") return { type: "move", index: (active + count - 1) % count };
  if (key === "Enter" || key === "Tab") return { type: "select", index: active };
  return { type: "none" };
}
