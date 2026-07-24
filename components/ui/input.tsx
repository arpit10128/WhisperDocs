"use client"

import * as React from "react"
import { cn } from "@/lib/utils"

function Input({ className, ...props }: React.ComponentProps<'input'>) {
  return (
    <input
      data-slot="input"
      className={cn(
        "w-full rounded-md border border-[var(--border-subtle)] px-3 py-2 text-sm bg-white text-[var(--text-primary)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)]/30",
        className,
      )}
      {...props}
    />
  )
}

export { Input }
