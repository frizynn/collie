import { act, renderHook } from "@testing-library/react";
import { useAppViewport } from "./use-app-viewport";

describe("useAppViewport", () => {
  afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks(); });

  it("tracks the keyboard and browser pan in one frame, ignores pinch zoom, and cleans up", () => {
    const viewport = Object.assign(new EventTarget(), { height: 844, offsetTop: 0, scale: 1 });
    vi.stubGlobal("visualViewport", viewport);
    let pending: FrameRequestCallback | undefined;
    const request = vi.spyOn(window, "requestAnimationFrame").mockImplementation((callback) => { pending = callback; return 1; });
    const cancel = vi.spyOn(window, "cancelAnimationFrame").mockImplementation(() => {});
    const { unmount } = renderHook(useAppViewport);
    const style = document.documentElement.style;
    expect(style.getPropertyValue("--app-viewport-height")).toBe("844px");

    act(() => {
      viewport.height = 480;
      viewport.offsetTop = 40;
      viewport.dispatchEvent(new Event("resize"));
      viewport.dispatchEvent(new Event("scroll"));
    });
    expect(request).toHaveBeenCalledTimes(1);
    act(() => pending?.(0));
    expect(style.getPropertyValue("--app-viewport-height")).toBe("480px");
    expect(style.getPropertyValue("--app-viewport-top")).toBe("40px");

    act(() => {
      viewport.scale = 2;
      viewport.height = 240;
      viewport.dispatchEvent(new Event("resize"));
      pending?.(0);
    });
    expect(style.getPropertyValue("--app-viewport-height")).toBe("480px");
    act(() => {
      viewport.scale = 1;
      viewport.height = 844;
      viewport.offsetTop = 0;
      viewport.dispatchEvent(new Event("resize"));
      pending?.(0);
    });
    expect(style.getPropertyValue("--app-viewport-height")).toBe("844px");
    viewport.dispatchEvent(new Event("scroll"));
    unmount();
    expect(cancel).toHaveBeenCalledWith(1);
    expect(style.getPropertyValue("--app-viewport-height")).toBe("");
    request.mockClear();
    viewport.dispatchEvent(new Event("resize"));
    expect(request).not.toHaveBeenCalled();
  });

  it("keeps the CSS viewport fallback when VisualViewport is unavailable", () => {
    vi.stubGlobal("visualViewport", undefined);
    const { unmount } = renderHook(useAppViewport);
    expect(document.documentElement.style.getPropertyValue("--app-viewport-height")).toBe("");
    unmount();
  });
});
