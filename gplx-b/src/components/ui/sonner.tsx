import { Toaster as Sonner, type ToasterProps } from "sonner"
import { useStore } from "@/store"

const Toaster = ({ ...props }: ToasterProps) => {
  const theme = useStore((s) => s.settings.theme)
  return (
    <Sonner
      theme={theme as ToasterProps["theme"]}
      className="toaster group"
      style={
        {
          "--normal-bg": "var(--popover)",
          "--normal-text": "var(--popover-foreground)",
          "--normal-border": "var(--border)",
        } as React.CSSProperties
      }
      {...props}
    />
  )
}

export { Toaster }
