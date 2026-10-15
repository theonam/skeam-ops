"use client";
// Origine : egm-app `src/components/ui/popover.tsx`.

import * as PopoverPrimitive from "@radix-ui/react-popover";
import type { ComponentProps } from "react";
import { cn } from "@/lib/cn";

export const Popover = PopoverPrimitive.Root;
export const PopoverTrigger = PopoverPrimitive.Trigger;

export function PopoverContent({ className, align = "start", sideOffset = 6, ...props }: ComponentProps<typeof PopoverPrimitive.Content>) {
  return (
    <PopoverPrimitive.Portal>
      <PopoverPrimitive.Content
        align={align}
        sideOffset={sideOffset}
        collisionPadding={8}
        className={cn("z-50 rounded-xl bg-white shadow-pop ring-1 ring-slate-100 focus:outline-none data-[state=open]:animate-pop-in", className)}
        {...props}
      />
    </PopoverPrimitive.Portal>
  );
}
