import * as React from "react";
import { cn } from "@/shared/utils/cn";

export interface TextareaProps
  extends React.TextareaHTMLAttributes<HTMLTextAreaElement> {}

/**
 * Prevent keyboard events from propagating to the host page.
 * This stops sites like GitHub from intercepting keystrokes
 * (e.g., "/" focusing their search input) while user types in our widget.
 */
const stopKeyboardPropagation = (e: React.KeyboardEvent) => {
  e.stopPropagation();
};

const Textarea = React.forwardRef<HTMLTextAreaElement, TextareaProps>(
  ({ className, onKeyDown, onKeyUp, onKeyPress, ...props }, ref) => {
    return (
      <textarea
        className={cn(
          "flex min-h-[80px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50",
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
Textarea.displayName = "Textarea";

export { Textarea };
