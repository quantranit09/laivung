import { cn } from "@/lib/utils"

export function Kbd({ className, children }: { className?: string; children: React.ReactNode }) {
  return (
    <kbd
      className={cn(
        "hidden rounded border bg-muted px-1.5 py-px font-sans text-[0.7rem] font-semibold text-muted-foreground sm:inline-block",
        className,
      )}
    >
      {children}
    </kbd>
  )
}
