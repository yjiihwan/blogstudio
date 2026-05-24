import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

const badgeVariants = cva(
  "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-semibold whitespace-nowrap",
  {
    variants: {
      tone: {
        neutral: "bg-paper-200 text-ink-700",
        accent: "bg-accent-100 text-accent-700",
        leaf: "bg-leaf-100 text-leaf-500",
        amber: "bg-amber-100 text-amber-500",
        sky: "bg-sky-100 text-sky-500",
        dark: "bg-ink-800 text-paper-100",
        outline: "border border-paper-300 text-ink-600 bg-transparent",
      },
    },
    defaultVariants: { tone: "neutral" },
  }
);

export function Badge({
  className,
  tone,
  ...props
}: React.HTMLAttributes<HTMLSpanElement> & VariantProps<typeof badgeVariants>) {
  return (
    <span className={cn(badgeVariants({ tone }), className)} {...props} />
  );
}
