import * as React from "react";
import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "../../lib/utils";
const buttonVariants = cva("ui-button inline-flex items-center justify-center gap-2 text-sm font-semibold transition-colors disabled:pointer-events-none disabled:opacity-50", {
  variants: { variant: { default: "ui-primary", outline: "ui-outline", ghost: "ui-ghost" }, size: { default: "min-h-11 px-4 py-2", icon: "size-11 shrink-0" } },
  defaultVariants: { variant: "default", size: "default" },
});
export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement>, VariantProps<typeof buttonVariants> { asChild?: boolean }
export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(({ className, variant, size, asChild, type = "button", ...props }, ref) => {
  const Comp = asChild ? Slot : "button";
  return <Comp ref={ref} type={type} className={cn(buttonVariants({ variant, size }), className)} {...props} />;
});
Button.displayName = "Button";
