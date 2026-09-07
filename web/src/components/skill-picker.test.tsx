import { fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { SkillPicker } from "./skill-picker";

const skill = { name: "Review", description: "Review the current changes", invocation: "$review" };

it("exposes an input-owned listbox without taking focus and selects on click", async () => {
  const onSelect = vi.fn();
  const { rerender } = render(<textarea aria-label="Message" />);
  const input = screen.getByRole("textbox");
  input.focus();
  rerender(<><textarea aria-label="Message" /><SkillPicker id="skills" skills={[skill]} total={4} activeIndex={0} onSelect={onSelect} /></>);
  expect(input).toHaveFocus();
  expect(screen.getByRole("listbox", { name: "Skills" })).toHaveAttribute("id", "skills");
  const option = screen.getByRole("option");
  expect(option).toHaveAttribute("id", "skills-option-0");
  expect(option).toHaveAttribute("aria-selected", "true");
  expect(screen.getByText("Skills · 1 / 4")).toBeInTheDocument();
  await userEvent.click(option);
  expect(input).toHaveFocus();
  expect(onSelect).toHaveBeenCalledExactlyOnceWith(skill);
});

it("allows touch-style click selection without a mousedown and labels an empty result", () => {
  const onSelect = vi.fn();
  const { rerender } = render(<SkillPicker id="skills" skills={[skill]} total={1} activeIndex={0} onSelect={onSelect} />);
  fireEvent.click(screen.getByRole("option"));
  expect(onSelect).toHaveBeenCalledExactlyOnceWith(skill);
  rerender(<SkillPicker id="skills" skills={[]} total={1} activeIndex={0} onSelect={onSelect} />);
  expect(screen.getByRole("status")).toHaveTextContent("No matching skills");
});
