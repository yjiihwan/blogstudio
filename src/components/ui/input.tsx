import * as React from "react";
import { cn } from "@/lib/utils";

export const Input = React.forwardRef<
  HTMLInputElement,
  React.InputHTMLAttributes<HTMLInputElement>
>(function Input({ className, type = "text", ...props }, ref) {
  return (
    <input
      ref={ref}
      type={type}
      className={cn(
        "flex h-10 w-full rounded-lg border border-paper-300 bg-paper-50 px-3 text-sm text-ink-900 placeholder:text-ink-400",
        "focus:border-ink-700 focus:ring-2 focus:ring-ink-700/10 outline-none transition",
        "disabled:opacity-50 disabled:cursor-not-allowed",
        className
      )}
      {...props}
    />
  );
});

export const Textarea = React.forwardRef<
  HTMLTextAreaElement,
  React.TextareaHTMLAttributes<HTMLTextAreaElement>
>(function Textarea({ className, ...props }, ref) {
  return (
    <textarea
      ref={ref}
      className={cn(
        "flex w-full rounded-lg border border-paper-300 bg-paper-50 px-3 py-2 text-sm leading-relaxed text-ink-900 placeholder:text-ink-400",
        "focus:border-ink-700 focus:ring-2 focus:ring-ink-700/10 outline-none transition",
        "disabled:opacity-50 disabled:cursor-not-allowed resize-y",
        className
      )}
      {...props}
    />
  );
});
