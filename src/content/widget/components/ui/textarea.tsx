import { forwardRef, type TextareaHTMLAttributes } from 'react';
import { cn } from '@/shared/utils/cn';

export interface TextareaProps extends TextareaHTMLAttributes<HTMLTextAreaElement> {}

const Textarea = forwardRef<HTMLTextAreaElement, TextareaProps>(
  ({ className, ...props }, ref) => {
    return (
      <textarea
        className={cn(
          'flex min-h-[72px] w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-xs shadow-sm transition-colors resize-y',
          'placeholder:text-gray-400',
          'focus:outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100',
          'disabled:cursor-not-allowed disabled:opacity-50',
          className
        )}
        ref={ref}
        {...props}
      />
    );
  }
);
Textarea.displayName = 'Textarea';

export { Textarea };
