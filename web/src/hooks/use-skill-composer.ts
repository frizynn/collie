import { useEffect, useId, useRef, useState } from "react";
import type { KeyboardEvent, RefObject } from "react";
import { fetchSkills } from "@/lib/api";
import { canonicalAgent } from "@/lib/operator-scope";
import { applySkillCompletion, filterSkills, skillCompletionKeyAction } from "@/lib/skill-completion";
import { composerSuggestions, detectComposerCompletion } from "@/lib/composer-suggestions";
import type { SkillOption } from "@/lib/skill-completion";
import type { OperatorCommand, PaneSkillsResponse } from "@/lib/types";

export function useSkillComposer({ paneId, session, agent, input, updateInput, inputRef, enabled, mine }: {
  paneId: string; session?: string; agent?: string | null; input: string;
  updateInput: (value: string) => void; inputRef: RefObject<HTMLTextAreaElement | null>; enabled: boolean;
  mine?: readonly OperatorCommand[];
}) {
  const id = useId();
  const scope = JSON.stringify([paneId, session, agent]);
  const family = canonicalAgent(agent?.trim().toLowerCase() ?? "");
  const [cursor, setCursor] = useState(input.length);
  const [focused, setFocused] = useState(false);
  const [dismissed, setDismissed] = useState<string | null>(null);
  const [activeIndex, setActiveIndex] = useState(0);
  const [catalog, setCatalog] = useState<{ scope: string; data: PaneSkillsResponse | null; error: boolean } | null>(null);
  const controllerRef = useRef<AbortController | null>(null);
  const completion = enabled && focused ? detectComposerCompletion(input, cursor, agent) : null;
  const trigger = completion?.trigger;
  const needsSkills = trigger === "$" || (trigger === "/" && family === "claude");
  const tokenKey = completion ? JSON.stringify([scope, completion.start, trigger, completion.query]) : null;
  const open = completion !== null && tokenKey !== dismissed;
  const current = catalog?.scope === scope ? catalog : null;
  const installed = current?.data?.available && current.data.trigger === trigger ? current.data.skills : [];
  const all = trigger ? composerSuggestions(agent, trigger, installed, mine) : [];
  const skills = filterSkills(all, completion?.query ?? "");
  const selected = Math.min(activeIndex, Math.max(0, skills.length - 1));

  useEffect(() => {
    setCatalog(null);
    setDismissed(null);
    setActiveIndex(0);
    return () => { controllerRef.current?.abort(); controllerRef.current = null; };
  }, [scope]);

  useEffect(() => {
    if (!open || !needsSkills || current || controllerRef.current) return;
    const controller = new AbortController();
    controllerRef.current = controller;
    void fetchSkills(paneId, session, controller.signal).then(
      (data) => { if (!controller.signal.aborted) setCatalog({ scope, data, error: false }); },
      () => { if (!controller.signal.aborted) setCatalog({ scope, data: null, error: true }); },
    ).finally(() => { if (controllerRef.current === controller) controllerRef.current = null; });
  }, [open, needsSkills, current, paneId, session, scope]);

  function select(skill: SkillOption) {
    if (!completion) return;
    const next = applySkillCompletion(input, completion, skill);
    updateInput(next.value);
    setCursor(next.cursor);
    setDismissed(tokenKey);
    // The native input keeps ownership of the keyboard on both touch and desktop selection.
    inputRef.current?.focus({ preventScroll: true });
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
    id, open, skills, total: all.length, activeIndex: selected, select, onKeyDown,
    label: trigger === "$" ? "Skills" : family === "claude" ? "Commands and skills" : "Commands",
    loading: open && needsSkills && !current, error: needsSkills && (current?.error ?? false), truncated: needsSkills && (current?.data?.truncated ?? false),
    retry: () => setCatalog(null),
    onChange: (value: string, position: number) => { updateInput(value); setCursor(position); setActiveIndex(0); setDismissed(null); },
    onSelect: (position: number) => setCursor(position),
    onFocus: () => { setFocused(true); setCursor(inputRef.current?.selectionStart ?? input.length); },
    onBlur: () => setFocused(false),
  };
}
