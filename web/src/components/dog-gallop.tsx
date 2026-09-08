import type { CSSProperties } from "react";

import { cn } from "@/lib/utils";

interface DogGallopProps {
  /** Play the lightweight Nenu activity motion. */
  running?: boolean;
  /** Any CSS length for the (square) render size. Defaults to 1.5rem — the header logo size. */
  size?: string;
  /** Accessible name. Omit to render the mascot as decorative (aria-hidden). */
  label?: string;
  className?: string;
}

// The generated Nenu mark doubles as the connection indicator. A transform-only CSS animation keeps
// it alive without a sprite download, JS timer or layout work; reduced-motion users see it at rest.
export function DogGallop({ running = false, size = "1.5rem", label, className }: DogGallopProps) {
  return (
    <img
      src="/nenu-mark.png"
      alt=""
      role={label ? "img" : undefined}
      aria-label={label}
      aria-hidden={label ? undefined : true}
      style={{ "--dog-size": size } as CSSProperties}
      className={cn("nenu-mark dog-gallop", running && "dog-gallop--running", className)}
    />
  );
}
