import { useEffect, useId, useRef, useState } from "react";
import type { KeyboardEvent, RefObject } from "react";
import { fetchSkills } from "@/lib/api";
import { canonicalAgent } from "@/lib/operator-scope";
import { applySkillCompletion, detectSkillCompletion, filterSkills, skillCompletionKeyAction } from "@/lib/skill-completion";
import type { SkillOption } from "@/lib/skill-completion";
import type { PaneSkillsResponse } from "@/lib/types";

export function useSkillComposer({ paneId, session, agent, input, updateInput, inputRef, enabled }: {
  paneId: string; session?: string; agent?: string | null; input: string;
  updateInput: (value: string) => void; inputRef: RefObject<HTMLTextAreaElement | null>; enabled: boolean;
}) {
  const id = useId();
  const scope = JSON.stringify([paneId, session, agent]);
  const family = canonicalAgent(agent ?? "");
  const trigger = family === "codex" ? "$" : family === "claude" ? "/" : null;
  const [cursor, setCursor] = useState(input.length);
  const [focused, setFocused] = useState(false);
  const [dismissed, setDismissed] = useState<string | null>(null);
  const [activeIndex, setActiveIndex] = useState(0);
  const [catalog, setCatalog] = useState<{ scope: string; data: PaneSkillsResponse | null; error: boolean } | null>(null);
  const controllerRef = useRef<AbortController | null>(null);
  const completion = enabled && focused && trigger ? detectSkillCompletion(input, cursor, trigger) : null;
  const tokenKey = completion ? JSON.stringify([scope, completion.start, completion.query]) : null;
  const open = completion !== null && tokenKey !== dismissed;
  const current = catalog?.scope === scope ? catalog : null;
  const skills = filterSkills(current?.data?.skills ?? [], completion?.query ?? "");
  const selected = Math.min(activeIndex, Math.max(0, skills.length - 1));

  useEffect(() => {
    setCatalog(null);
    setDismissed(null);
    setActiveIndex(0);
    return () => { controllerRef.current?.abort(); controllerRef.current = null; };
  }, [scope]);

  useEffect(() => {
    if (!open || current || controllerRef.current) return;
    const controller = new AbortController();
    controllerRef.current = controller;
    void fetchSkills(paneId, session, controller.signal).then(
      (data) => { if (!controller.signal.aborted) setCatalog({ scope, data, error: false }); },
      () => { if (!controller.signal.aborted) setCatalog({ scope, data: null, error: true }); },
    ).finally(() => { if (controllerRef.current === controller) controllerRef.current = null; });
  }, [open, current, paneId, session, scope]);

  function select(skill: SkillOption) {
    if (!completion) return;
    const next = applySkillCompletion(input, completion, skill);
    updateInput(next.value);
    setCursor(next.cursor);
    setDismissed(tokenKey);
    // The native input keeps ownership of the keyboard on both touch and desktop selection.
    inputRef.current?.focus();
    requestAnimationFrame(() => inputRef.current?.setSelectionRange(next.cursor, next.cursor));
  }

  function onKeyDown(event: KeyboardEvent<HTMLTextAreaElement>): boolean {
    if (!open || event.nativeEvent.isComposing || event.metaKey || event.ctrlKey || event.altKey || event.shiftKey) return false;
    const action = skillCompletionKeyAction(event.key, selected, skills.length);
    if (action.type === "none") return false;
    event.preventDefault();
    event.stopPropagation();
    if (action.type === "move") setActiveIndex(action.index);
    if (action.type === "dismiss") setDismissed(tokenKey);
    if (action.type === "select" && skills[action.index]) select(skills[action.index]!);
    return true;
  }

  return {
    id, open, skills, total: current?.data?.total ?? 0, activeIndex: selected, select, onKeyDown,
    loading: open && !current, error: current?.error ?? false, truncated: current?.data?.truncated ?? false,
    retry: () => setCatalog(null),
    onChange: (value: string, position: number) => { updateInput(value); setCursor(position); setActiveIndex(0); setDismissed(null); },
    onSelect: (position: number) => setCursor(position),
    onFocus: () => { setFocused(true); setCursor(inputRef.current?.selectionStart ?? input.length); },
    onBlur: () => setFocused(false),
  };
}
