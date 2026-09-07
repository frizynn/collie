import { act, fireEvent, render, screen } from "@testing-library/react";
import { StatusArea } from "./status-area";
import { clearStatus, setStatus } from "@/lib/status";

describe("workbench notifications", () => {
  beforeEach(() => { vi.useFakeTimers(); clearStatus(); });
  afterEach(() => { clearStatus(); vi.useRealTimers(); });

  it("floats outside route layout and never takes focus from the composer", () => {
    const { container } = render(<><textarea aria-label="Reply" /><StatusArea /></>);
    const input = screen.getByRole("textbox");
    input.focus();
    act(() => setStatus("Codex finished", "success", undefined, { description: "comercio-saas · web" }));
    const notice = screen.getByRole("status");
    expect(container).not.toContainElement(notice);
    expect(document.activeElement).toBe(input);
    expect(screen.getByText("comercio-saas · web")).toBeVisible();
    expect(screen.getAllByRole("region", { name: "Notifications" })).toHaveLength(1);
  });

  it.each(["info", "success", "warn", "error"] as const)("offers a separate dismiss button for %s", (tone) => {
    render(<StatusArea />);
    act(() => setStatus("A complete, selectable message", tone, null));
    fireEvent.click(screen.getByText("A complete, selectable message"));
    expect(screen.getByText("A complete, selectable message")).toBeVisible();
    fireEvent.click(screen.getByRole("button", { name: "Dismiss notification" }));
    expect(screen.queryByText("A complete, selectable message")).not.toBeInTheDocument();
  });

  it("pauses while hovered or focused, resuming only after both leave", () => {
    render(<><textarea aria-label="Reply" /><StatusArea /></>);
    act(() => setStatus("Finished", "success"));
    const notice = screen.getByRole("status");
    fireEvent.mouseEnter(notice);
    act(() => screen.getByRole("button", { name: "Dismiss notification" }).focus());
    fireEvent.mouseLeave(notice);
    act(() => vi.advanceTimersByTime(10_000));
    expect(screen.getByText("Finished")).toBeVisible();
    act(() => screen.getByRole("textbox").focus());
    act(() => vi.advanceTimersByTime(2500));
    expect(screen.queryByText("Finished")).not.toBeInTheDocument();
  });

  it("does not expire a notification while the page is hidden", () => {
    render(<StatusArea />);
    const hidden = vi.spyOn(document, "hidden", "get");
    hidden.mockReturnValue(true);
    act(() => setStatus("Finished", "success"));
    act(() => vi.advanceTimersByTime(30_000));
    expect(screen.getByText("Finished")).toBeVisible();
    hidden.mockReturnValue(false);
    fireEvent(document, new Event("visibilitychange"));
    act(() => vi.advanceTimersByTime(2500));
    expect(screen.queryByText("Finished")).not.toBeInTheDocument();
    hidden.mockRestore();
  });
});
