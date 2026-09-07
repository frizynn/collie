import { Profiler } from "react";
import { act, cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { resetIdleLock, setLocked } from "@/lib/idle";
import { WorkActivityLabel } from "./work-activity-label";

let hidden = false;
beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-09-08T12:00:05Z"));
  hidden = false;
  vi.spyOn(document, "hidden", "get").mockImplementation(() => hidden);
  resetIdleLock();
});
afterEach(() => { cleanup(); resetIdleLock(); vi.restoreAllMocks(); vi.useRealTimers(); });
const startedAt = "2026-09-08T12:00:00Z";
function visibility(value: boolean) {
  act(() => { hidden = value; document.dispatchEvent(new Event("visibilitychange")); });
}

describe("WorkActivityLabel", () => {
  it("updates only the elapsed text without causing React commits for the surrounding transcript", () => {
    const committed = vi.fn();
    render(<Profiler id="transcript" onRender={committed}><WorkActivityLabel startedAt={startedAt} /></Profiler>);
    expect(screen.getByText("Working for 5s")).toBeVisible();
    const initialCommits = committed.mock.calls.length;
    act(() => { vi.advanceTimersByTime(3000); });
    expect(screen.getByText("Working for 8s")).toBeVisible();
    expect(committed).toHaveBeenCalledTimes(initialCommits);
  });

  it("pauses while hidden and catches up on visibility without creating duplicate timers", () => {
    render(<WorkActivityLabel startedAt={startedAt} thinking />);
    expect(vi.getTimerCount()).toBe(1);
    visibility(true);
    expect(vi.getTimerCount()).toBe(0);
    act(() => { vi.advanceTimersByTime(10_000); });
    expect(screen.getByText("Thinking for 5s")).toBeInTheDocument();
    visibility(false);
    expect(screen.getByText("Thinking for 15s")).toBeInTheDocument();
    visibility(false);
    expect(vi.getTimerCount()).toBe(1);
    act(() => { vi.advanceTimersByTime(1000); });
    expect(screen.getByText("Thinking for 16s")).toBeInTheDocument();
  });

  it("does not start a timer in a hidden tab", () => {
    hidden = true;
    render(<WorkActivityLabel startedAt={startedAt} />);
    expect(vi.getTimerCount()).toBe(0);
    visibility(false);
    expect(vi.getTimerCount()).toBe(1);
  });

  it("pauses under the idle lock and catches up when the user unlocks", () => {
    render(<WorkActivityLabel startedAt={startedAt} />);
    act(() => setLocked(true));
    expect(vi.getTimerCount()).toBe(0);
    act(() => { vi.advanceTimersByTime(5000); });
    expect(screen.getByText("Working for 5s")).toBeInTheDocument();
    act(() => setLocked(false));
    expect(screen.getByText("Working for 10s")).toBeInTheDocument();
    expect(vi.getTimerCount()).toBe(1);
  });

  it("cleans up intervals and visibility listeners on unmount", () => {
    const { unmount } = render(<WorkActivityLabel startedAt={startedAt} />);
    expect(vi.getTimerCount()).toBe(1);
    unmount();
    expect(vi.getTimerCount()).toBe(0);
    visibility(false);
    expect(vi.getTimerCount()).toBe(0);
    act(() => { vi.advanceTimersByTime(10_000); });
    expect(screen.queryByText(/^Working/)).not.toBeInTheDocument();
  });

  it.each([undefined, "", "not-a-date"])("avoids a fake duration and timer for missing/invalid start %s", (start) => {
    render(<WorkActivityLabel startedAt={start} />);
    expect(screen.getByText("Working…")).toBeInTheDocument();
    expect(vi.getTimerCount()).toBe(0);
  });

  it("replaces the old interval when the next activity starts or its label changes", () => {
    const { rerender } = render(<WorkActivityLabel startedAt={startedAt} />);
    rerender(<WorkActivityLabel startedAt="2026-09-08T12:00:04Z" thinking />);
    expect(screen.getByText("Thinking for 1s")).toBeInTheDocument();
    expect(vi.getTimerCount()).toBe(1);
    act(() => { vi.advanceTimersByTime(1000); });
    expect(screen.getByText("Thinking for 2s")).toBeInTheDocument();
  });
});
