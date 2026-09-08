import { fireEvent, render, screen } from "@testing-library/react";
import { vi } from "vitest";
import { UpdateAvailableBanner } from "./update-available-banner";
import { checkForUpdate } from "@/lib/pwa";

const state = vi.hoisted(() => ({ show: true, build: "build-1" }));
vi.mock("@/lib/self-update", () => ({ useSelfUpdate: () => state.show }));
vi.mock("@/lib/server-build", () => ({ useServerBuild: () => state.build }));
vi.mock("@/lib/pwa", () => ({ checkForUpdate: vi.fn() }));

beforeEach(() => { state.show = true; state.build = "build-1"; vi.clearAllMocks(); });

it("renders outside the layout and dismisses only the current interface update", () => {
  const { container, rerender } = render(<UpdateAvailableBanner />);
  expect(container).toBeEmptyDOMElement();
  expect(screen.getByRole("status")).toHaveTextContent("Interface updated");
  fireEvent.click(screen.getByRole("button", { name: "Dismiss update notice" }));
  expect(screen.queryByRole("status")).toBeNull();
  rerender(<UpdateAvailableBanner />);
  expect(screen.queryByRole("status")).toBeNull();
  state.build = "build-2";
  rerender(<UpdateAvailableBanner />);
  expect(screen.getByRole("status")).toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "Reload" }));
  expect(checkForUpdate).toHaveBeenCalledExactlyOnceWith();
});

it("stays quiet when the interface is current", () => {
  state.show = false;
  render(<UpdateAvailableBanner />);
  expect(screen.queryByRole("status")).toBeNull();
});
