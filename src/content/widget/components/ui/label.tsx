import { forwardRef, type LabelHTMLAttributes } from 'react';
import { cn } from '@/shared/utils/cn';

export interface LabelProps extends LabelHTMLAttributes<HTMLLabelElement> {}

const Label = forwardRef<HTMLLabelElement, LabelProps>(
  ({ className, ...props }, ref) => {
    return (
      <label
        ref={ref}
        className={cn(
          'block text-xs font-medium text-gray-600 mb-1.5',
          className
        )}
        {...props}
      />
    );
  }
);
Label.displayName = 'Label';

export { Label };
