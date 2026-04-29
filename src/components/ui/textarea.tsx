import * as React from "react"

import { cn } from "@/lib/utils"

export interface TextareaProps
  extends React.TextareaHTMLAttributes<HTMLTextAreaElement> {}

const Textarea = React.forwardRef<HTMLTextAreaElement, TextareaProps>(
  ({ className, ...props }, ref) => {
    return (
      <textarea
        className={cn(
          "flex min-h-[96px] w-full rounded-xl border-2 border-transparent bg-secondary/50 px-3.5 py-2.5 text-sm font-medium ring-offset-background transition-colors",
          "placeholder:text-muted-foreground placeholder:font-normal",
          "hover:border-border",
          "focus-visible:outline-none focus-visible:bg-card focus-visible:border-primary focus-visible:ring-4 focus-visible:ring-secondary",
          "disabled:cursor-not-allowed disabled:opacity-50",
          "aria-[invalid=true]:border-destructive aria-[invalid=true]:focus-visible:ring-destructive/20",
          className
        )}
        ref={ref}
        {...props}
      />
    )
  }
)
Textarea.displayName = "Textarea"

export { Textarea }
