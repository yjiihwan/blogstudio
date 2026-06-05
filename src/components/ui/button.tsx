import * as React from "react";
import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-button font-semibold transition outline-none focus-visible:ring-2 focus-visible:ring-accent-500/40 disabled:opacity-50 disabled:cursor-not-allowed [&_svg]:size-4 [&_svg]:shrink-0 select-none touch-manipulation cursor-pointer",
  {
    variants: {
      variant: {
        primary:
          "bg-ink-800 text-paper-100 hover:bg-ink-900 active:scale-[0.98] shadow-sm",
        accent:
          "bg-accent-500 text-white hover:bg-accent-600 active:scale-[0.98] shadow-sm",
        secondary:
          "bg-paper-200 text-ink-800 hover:bg-paper-300 active:scale-[0.98]",
        outline:
          "border border-paper-300 bg-paper-100 text-ink-800 hover:bg-paper-200 active:scale-[0.98]",
        ghost: "text-ink-700 hover:bg-paper-200 active:scale-[0.98]",
        danger:
          "bg-red-600 text-white hover:bg-red-700 active:scale-[0.98]",
        link: "text-ink-800 underline-offset-4 hover:underline p-0 h-auto",
      },
      size: {
        sm: "h-9 px-3 text-sm",
        md: "h-10 px-4 text-sm",
        lg: "h-11 px-5 text-sm",
        xl: "h-12 px-6 text-base",
        icon: "h-10 w-10",
      },
    },
    defaultVariants: { variant: "primary", size: "md" },
  }
);

type ButtonProps = React.ButtonHTMLAttributes<HTMLButtonElement> &
  VariantProps<typeof buttonVariants> & { asChild?: boolean };

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  function Button({ className, variant, size, asChild, ...props }, ref) {
    const Comp = asChild ? Slot : "button";
    return (
      <Comp
        className={cn(buttonVariants({ variant, size }), className)}
        ref={ref as React.Ref<HTMLButtonElement>}
        {...props}
      />
    );
  }
);
