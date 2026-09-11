import * as React from "react";
import { cn } from "../../lib/utils";
export const Input = React.forwardRef<HTMLInputElement, React.InputHTMLAttributes<HTMLInputElement>>(({ className, ...props }, ref) => <input ref={ref} className={cn("ui-input h-11 w-full px-3 text-base", className)} {...props} />);
Input.displayName = "Input";
