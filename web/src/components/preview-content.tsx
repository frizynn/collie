import { MarkdownText } from "@/components/markdown-text";

/** Remove only the preview widget's complete outer frame; authored diagrams remain content. */
export function previewBody(lines: string[]): string {
  const rows = lines.map((line) => line.trimEnd());
  const first = rows[0]?.trim();
  const last = rows.at(-1)?.trim();
  if (first && /^┌─+┐$/.test(first) && last && /^└─+┘$/.test(last)
    && rows.slice(1, -1).every((line) => /^│.*│$/.test(line.trim()))) {
    return rows.slice(1, -1).map((line) => line.trim().slice(1, -1).replace(/^ /, "").trimEnd()).join("\n");
  }
  return rows.join("\n");
}

export function PreviewContent({ lines }: { lines: string[] }) {
  const body = previewBody(lines);
  // A preview may itself be an authored diagram. Keep that artifact's spacing in a normal code
  // snippet; prose and Markdown render like the conversation, without a terminal viewport.
  const diagram = /[┌┐└┘├┤┬┴┼│─]|^\s*\+[-=]{3,}\+/m.test(body);
  return diagram ? (
    <div className="overflow-x-auto rounded-md bg-muted/40 px-3 py-2">
      <code className="block whitespace-pre font-mono text-xs leading-relaxed">{body}</code>
    </div>
  ) : <MarkdownText text={body} />;
}
