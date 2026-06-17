"use client";

import * as React from "react";
import { Info } from "lucide-react";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "./tooltip";

// Radix Tooltip mismatches during SSR hydration in this React/Next setup, which
// forces React to regenerate the whole settings subtree and momentarily drops
// click handlers on the forms. Render a plain button on the server/first paint
// (so SSR and client HTML match) and upgrade to the real tooltip after mount.
export function InfoTooltip({
  children,
  label,
}: {
  children: React.ReactNode;
  label?: string;
}) {
  const [mounted, setMounted] = React.useState(false);
  React.useEffect(() => setMounted(true), []);

  const trigger = (
    <button
      type="button"
      className="text-ink-400 hover:text-ink-700 transition-colors rounded-full focus:outline-none focus-visible:ring-2 focus-visible:ring-accent-600"
      aria-label={label}
    >
      <Info className="size-3.5" />
    </button>
  );

  if (!mounted) return trigger;

  return (
    <TooltipProvider delayDuration={200}>
      <Tooltip>
        <TooltipTrigger asChild>{trigger}</TooltipTrigger>
        <TooltipContent
          side="bottom"
          align="end"
          className="max-w-[240px] text-xs leading-relaxed"
        >
          {children}
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}
