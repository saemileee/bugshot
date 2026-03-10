import * as React from "react";
import { cn } from "@/shared/utils/cn";

export interface InputProps
  extends React.InputHTMLAttributes<HTMLInputElement> {}

/**
 * Prevent keyboard events from propagating to the host page.
 * This stops sites like GitHub from intercepting keystrokes
 * (e.g., "/" focusing their search input) while user types in our widget.
 */
const stopKeyboardPropagation = (e: React.KeyboardEvent) => {
  e.stopPropagation();
};

const Input = React.forwardRef<HTMLInputElement, InputProps>(
  ({ className, type, onKeyDown, onKeyUp, onKeyPress, ...props }, ref) => {
    return (
      <input
        type={type}
        className={cn(
          "flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background file:border-0 file:bg-transparent file:text-sm file:font-medium file:text-foreground placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50",
          className
        )}
        ref={ref}
        onKeyDown={(e) => {
          stopKeyboardPropagation(e);
          onKeyDown?.(e);
        }}
        onKeyUp={(e) => {
          stopKeyboardPropagation(e);
          onKeyUp?.(e);
        }}
        onKeyPress={(e) => {
          stopKeyboardPropagation(e);
          onKeyPress?.(e);
        }}
        {...props}
      />
    );
  }
);
Input.displayName = "Input";

export { Input };
