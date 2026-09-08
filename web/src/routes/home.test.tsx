import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { createMemoryRouter, Outlet, RouterProvider } from "react-router";
import { HomeRoute } from "./home";
import { ROOT_ROUTE_ID, type HomeData } from "@/lib/loaders";

vi.mock("@/components/update-banner", () => ({ UpdateBanner: () => null }));
const newSpace = vi.fn();
vi.mock("@/hooks/use-spaces", () => ({ useSpaceActions: () => ({ newSpace }) }));
const data: HomeData = {
  bridge: "connected", device: undefined, session: "work", sessions: [], error: false, authError: false,
  snoozedUntil: null, update: undefined, tabs: [], shellPanes: [],
  workspaces: [{ workspaceId: "w1", number: 1, label: "Nenu", focused: true, activeTabId: "t1", tabCount: 1, paneCount: 2 }],
  agents: [
    { paneId: "w1:p1", workspaceId: "w1", workspaceLabel: "Nenu", workspaceNumber: 1, tabId: "t1", agent: "codex", status: "idle", cwd: "/dev/collie", focused: false, paneLabel: "Earlier thread" },
    { paneId: "w1:p2", workspaceId: "w1", workspaceLabel: "Nenu", workspaceNumber: 1, tabId: "t1", agent: "claude", status: "blocked", cwd: "/dev/collie", focused: true, paneLabel: "Review changes" },
  ],
};

async function setup(value = data) {
  const router = createMemoryRouter([{ id: ROOT_ROUTE_ID, loader: () => value, element: <Outlet />, children: [
    { path: "/", element: <HomeRoute /> },
    { path: "/space/:spaceId", element: <p>Project opened</p> },
  ] }], { initialEntries: ["/?s=work"] });
  render(<RouterProvider router={router} />);
  await screen.findByRole("heading", { name: "What should we work on?" });
  return { router, user: userEvent.setup() };
}

it("offers compact contextual threads in attention order with scoped navigation", async () => {
  const { user, router } = await setup();
  const links = within(screen.getByRole("region", { name: "Threads" })).getAllByRole("link");
  expect(links[0]).toHaveTextContent("Review changes");
  expect(links[0]).toHaveAttribute("href", "/pane/w1%3Ap2?s=work");
  expect(screen.queryByText("Nothing needs you")).not.toBeInTheDocument();
  await user.selectOptions(screen.getByRole("combobox", { name: "Open project" }), "w1");
  expect(router.state.location.pathname).toBe("/space/w1");
  expect(router.state.location.search).toBe("?s=work");
});

it("keeps workspace creation on its explicit existing shell flow", async () => {
  const { user } = await setup({ ...data, agents: [], workspaces: [] });
  expect(screen.getByText("Create a workspace to start your first thread.")).toBeInTheDocument();
  await user.click(screen.getByRole("button", { name: "New workspace" }));
  expect(screen.getByRole("dialog", { name: "New space" })).toBeInTheDocument();
  expect(screen.getByRole("button", { name: "Create space & open shell" })).toBeInTheDocument();
  expect(newSpace).not.toHaveBeenCalled();
});

it("does not claim an empty live herd or allow creation from stale disconnected data", async () => {
  await setup({ ...data, error: true, agents: [], workspaces: [] });
  expect(screen.getByText(/Showing your last workspace snapshot/)).toBeInTheDocument();
  expect(screen.getByRole("button", { name: "New workspace" })).toBeDisabled();
  expect(screen.queryByText("Create a workspace to start your first thread.")).not.toBeInTheDocument();
});

it("keeps existing threads navigable while workspace creation is read-only", async () => {
  await setup({ ...data, device: { enforced: true, device: "phone", authorized: false } });
  expect(screen.getByRole("button", { name: "New workspace" })).toBeDisabled();
  expect(screen.getByRole("status")).toHaveTextContent("Read-only");
  expect(within(screen.getByRole("region", { name: "Threads" })).getAllByRole("link")).toHaveLength(2);
});

it("bounds the initial list while allowing every thread to be opened", async () => {
  const agents = Array.from({ length: 11 }, (_, index) => ({ ...data.agents[0]!, paneId: `pane${index}`, paneLabel: `Thread ${index}` }));
  const { user } = await setup({ ...data, agents });
  const threads = within(screen.getByRole("region", { name: "Threads" }));
  expect(threads.getAllByRole("link")).toHaveLength(8);
  await user.click(threads.getByRole("button", { name: "Show all 11 threads" }));
  expect(threads.getAllByRole("link")).toHaveLength(11);
});
