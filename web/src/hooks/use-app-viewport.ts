import { useEffect } from "react";

/** Safari leaves the layout viewport behind the keyboard. Size the app to its visible viewport,
 * without React renders during keyboard animation or resizing the layout when the user pinch-zooms. */
export function useAppViewport() {
  useEffect(() => {
    const viewport = window.visualViewport;
    if (!viewport) return;
    const style = document.documentElement.style;
    let frame = 0;
    const update = () => {
      frame = 0;
      if (viewport.scale !== 1) return;
      style.setProperty("--app-viewport-height", `${viewport.height}px`);
      style.setProperty("--app-viewport-top", `${viewport.offsetTop}px`);
    };
    const schedule = () => { if (!frame) frame = requestAnimationFrame(update); };
    update();
    viewport.addEventListener("resize", schedule);
    viewport.addEventListener("scroll", schedule);
    return () => {
      cancelAnimationFrame(frame);
      viewport.removeEventListener("resize", schedule);
      viewport.removeEventListener("scroll", schedule);
      style.removeProperty("--app-viewport-height");
      style.removeProperty("--app-viewport-top");
    };
  }, []);
}
