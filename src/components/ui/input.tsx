import * as React from "react";

import { cn } from "@/lib/utils";

const Input = React.forwardRef<HTMLInputElement, React.ComponentProps<"input">>(
  ({ className, type, ...props }, ref) => {
    return (
      <input
        type={type}
        className={cn(
          // Subtle gray fill differentiates the field from white card surfaces;
          // border uses the (now darker) --input token; focus shows a soft primary ring.
          "flex h-10 w-full rounded-md border border-input bg-background/60 px-3 py-2 text-base ring-offset-background transition-colors",
          "placeholder:text-muted-foreground/70",
          "hover:border-foreground/30 hover:bg-background",
          "focus-visible:outline-none focus-visible:border-primary focus-visible:bg-background focus-visible:ring-2 focus-visible:ring-primary/20 focus-visible:ring-offset-0",
          "file:border-0 file:bg-transparent file:text-sm file:font-medium file:text-foreground",
          "disabled:cursor-not-allowed disabled:opacity-50 md:text-sm",
          className,
        )}
        ref={ref}
        {...props}
      />
    );
  },
);
Input.displayName = "Input";

export { Input };
