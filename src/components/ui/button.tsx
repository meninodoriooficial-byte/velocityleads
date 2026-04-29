import * as React from "react"
import { Slot } from "@radix-ui/react-slot"
import { cva, type VariantProps } from "class-variance-authority"

import { cn } from "@/lib/utils"

const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-xl text-sm font-semibold ring-offset-background transition-all duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 active:scale-[0.98] [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0",
  {
    variants: {
      variant: {
        default:
          "bg-primary text-primary-foreground hover:bg-primary/90 shadow-[0_2px_10px_-4px_hsl(240_6%_6%/0.3)]",
        volt:
          "bg-accent text-accent-foreground font-bold shadow-[0_4px_14px_0_hsl(70_100%_50%/0.39)] hover:brightness-105 hover:shadow-[0_6px_20px_hsl(70_100%_50%/0.4)]",
        destructive:
          "bg-destructive text-destructive-foreground hover:bg-destructive/90 shadow-[0_2px_10px_-4px_hsl(0_84%_60%/0.4)]",
        success:
          "bg-success text-success-foreground hover:bg-success/90 shadow-[0_2px_10px_-4px_hsl(142_71%_45%/0.4)]",
        warning:
          "bg-warning text-warning-foreground hover:bg-warning/90 shadow-[0_2px_10px_-4px_hsl(38_92%_50%/0.4)]",
        outline:
          "border border-input bg-background hover:bg-secondary hover:border-border text-foreground",
        secondary:
          "bg-secondary text-secondary-foreground hover:bg-secondary/70 border border-transparent hover:border-border/60",
        ghost:
          "hover:bg-secondary hover:text-foreground text-muted-foreground hover:text-foreground",
        link: "text-primary underline-offset-4 hover:underline shadow-none active:scale-100",
      },
      size: {
        default: "h-10 px-4 py-2",
        sm: "h-9 px-3 text-xs",
        lg: "h-11 px-6",
        xl: "h-14 px-8 text-base rounded-2xl [&_svg]:size-5",
        icon: "h-10 w-10",
        "icon-sm": "h-8 w-8 rounded-lg",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  }
)

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  asChild?: boolean
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, asChild = false, ...props }, ref) => {
    const Comp = asChild ? Slot : "button"
    return (
      <Comp
        className={cn(buttonVariants({ variant, size, className }))}
        ref={ref}
        {...props}
      />
    )
  }
)
Button.displayName = "Button"

export { Button, buttonVariants }
