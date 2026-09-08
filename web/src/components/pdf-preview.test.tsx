import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { vi } from "vitest";
import PdfPreview from "./pdf-preview";

const mocks = vi.hoisted(() => ({ getDocument: vi.fn() }));
vi.mock("pdfjs-dist/legacy/build/pdf.mjs", () => ({ GlobalWorkerOptions: {}, getDocument: mocks.getDocument }));
vi.mock("pdfjs-dist/legacy/build/pdf.worker.min.mjs?url", () => ({ default: "/worker.mjs" }));
beforeEach(() => vi.stubGlobal("ResizeObserver", class { observe() {} disconnect() {} }));
afterEach(() => vi.unstubAllGlobals());

it("cancels and releases an unfinished page before drawing another and destroys the worker on close", async () => {
  let rejectRender: (error: Error) => void = () => {};
  const pending = new Promise<void>((_resolve, reject) => { rejectRender = reject; });
  const cancel = vi.fn(() => rejectRender(new Error("Rendering cancelled")));
  const viewport = ({ scale }: { scale: number }) => ({ width: 100 * scale, height: 120 * scale });
  const first = { getViewport: viewport, cleanup: vi.fn(), render: vi.fn(() => ({ promise: pending, cancel })) };
  const second = { getViewport: viewport, cleanup: vi.fn(), render: vi.fn(() => ({ promise: Promise.resolve(), cancel: vi.fn() })) };
  const pdf = { numPages: 2, getPage: vi.fn((page: number) => Promise.resolve(page === 1 ? first : second)) };
  const destroy = vi.fn(() => Promise.resolve());
  mocks.getDocument.mockReturnValue({ promise: Promise.resolve(pdf), destroy });
  const { unmount } = render(<PdfPreview bytes={new ArrayBuffer(8)} />);
  await waitFor(() => expect(first.render).toHaveBeenCalledOnce());
  fireEvent.click(screen.getByRole("button", { name: "Next page" }));
  await waitFor(() => expect(second.render).toHaveBeenCalledOnce());
  expect(cancel).toHaveBeenCalled();
  expect(first.cleanup).toHaveBeenCalledOnce();
  expect(second.cleanup).toHaveBeenCalledOnce();
  expect(screen.queryByRole("alert")).toBeNull();
  unmount();
  expect(destroy).toHaveBeenCalledOnce();
});
