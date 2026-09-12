import { render } from "@testing-library/react";

import { StatusDot } from "./status-badge";

describe("StatusDot", () => {
  it("renders working state as one static coloured node", () => {
    const { container } = render(<StatusDot status="working" />);
    const dot = container.firstElementChild;

    expect(dot).toHaveClass("bg-status-working");
    expect(dot?.children).toHaveLength(0);
    expect(container.querySelector(".animate-ping, .animate-pulse")).toBeNull();
  });

  it("keeps resting states as static hollow rings", () => {
    const { container } = render(<StatusDot status="idle" />);

    expect(container.firstElementChild).toHaveClass("border-status-idle/60");
    expect(container.querySelector(".animate-ping, .animate-pulse")).toBeNull();
  });
});
