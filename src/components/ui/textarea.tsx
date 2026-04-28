import * as React from "react";

import { cn } from "@/lib/utils";

export interface TextareaProps extends React.TextareaHTMLAttributes<HTMLTextAreaElement> {}

const Textarea = React.forwardRef<HTMLTextAreaElement, TextareaProps>(({ className, ...props }, ref) => {
  return (
    <textarea
      className={cn(
        // Matches Input contrast: subtle bg, slightly darker border, primary focus ring.
        "flex min-h-[80px] w-full rounded-md border border-input bg-background/60 px-3 py-2 text-sm ring-offset-background transition-colors",
        "placeholder:text-muted-foreground/70",
        "hover:border-foreground/30 hover:bg-background",
        "focus-visible:outline-none focus-visible:border-primary focus-visible:bg-background focus-visible:ring-2 focus-visible:ring-primary/20 focus-visible:ring-offset-0",
        "disabled:cursor-not-allowed disabled:opacity-50",
        className,
      )}
      ref={ref}
      {...props}
    />
  );
});
Textarea.displayName = "Textarea";

export { Textarea };
