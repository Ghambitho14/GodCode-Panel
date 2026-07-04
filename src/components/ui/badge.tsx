import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

const badgeVariants = cva(
  "inline-flex items-center justify-center rounded-full border px-2.5 py-0.5 text-xs font-semibold transition-colors focus:outline-none focus:ring-2 focus:ring-[#e8483e] focus:ring-offset-2",
  {
    variants: {
      variant: {
        default:
          "border-transparent bg-[#e8483e] text-white hover:bg-[#d63f36]",
        secondary:
          "border-transparent bg-[#f5f5f7] text-[#1a1a1a] hover:bg-[#ececf0]",
        outline:
          "border-[#e5e5ea] bg-white text-[#1a1a1a] hover:bg-[#f5f5f7]",
        success:
          "border-transparent bg-[#dcfce7] text-[#16a34a] hover:bg-[#bbf7d0]",
        danger:
          "border-transparent bg-[#fee2e2] text-[#dc2626] hover:bg-[#fecaca]",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  },
);

export interface BadgeProps
  extends React.HTMLAttributes<HTMLDivElement>,
    VariantProps<typeof badgeVariants> {}

function Badge({ className, variant, ...props }: BadgeProps) {
  return (
    <div className={cn(badgeVariants({ variant }), className)} {...props} />
  );
}

export { Badge, badgeVariants };
