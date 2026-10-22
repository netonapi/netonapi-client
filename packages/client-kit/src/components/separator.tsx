import * as React from "react";
import { cn } from "../cn";

export function Separator({ orientation = "horizontal", className, ...props }: React.ComponentProps<"div"> & { orientation?: "horizontal" | "vertical" }) {
  return (
    <div
      role="separator"
      aria-orientation={orientation}
      data-slot="separator"
      className={cn("shrink-0 bg-[var(--border)]", orientation === "horizontal" ? "h-px w-full" : "h-full w-px", className)}
      {...props}
    />
  );
}
