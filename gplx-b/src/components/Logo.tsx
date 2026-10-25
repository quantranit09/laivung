import { cn } from "@/lib/utils"

/** Biểu tượng: tấm khiên (an toàn) chứa con đường hướng về đích, vạch giữa màu hổ phách. */
export function LogoMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 48 48" className={cn("size-9", className)} aria-hidden="true">
      <defs>
        <linearGradient id="lv-bg" x1="8" y1="2" x2="40" y2="46" gradientUnits="userSpaceOnUse">
          <stop offset="0" stopColor="#2f6bff" />
          <stop offset="1" stopColor="#1a2fa8" />
        </linearGradient>
        <clipPath id="lv-shield">
          <path d="M24 2.5 42.5 8.6v14.6c0 11.2-7.6 18.9-18.5 22.3C13.1 42.1 5.5 34.4 5.5 23.2V8.6Z" />
        </clipPath>
      </defs>
      <path d="M24 2.5 42.5 8.6v14.6c0 11.2-7.6 18.9-18.5 22.3C13.1 42.1 5.5 34.4 5.5 23.2V8.6Z" fill="url(#lv-bg)" />
      <g clipPath="url(#lv-shield)">
        <path d="M11.5 48 23 22.5h2L36.5 48Z" fill="#fff" />
        <path d="M24 25.5v2.4M24 31v3.6M24 38.5v4" stroke="#ffb020" strokeWidth="2.2" strokeLinecap="round" />
      </g>
      <path d="m17.6 13.2 4.3 4.1 8.5-8.5" fill="none" stroke="#fff" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

export function Logo({ className, compact }: { className?: string; compact?: boolean }) {
  return (
    <div className={cn("flex items-center gap-2.5", className)}>
      <LogoMark />
      {!compact && (
        <div className="text-left leading-none">
          <div className="text-[1.15rem] font-extrabold tracking-tight">
            Lái<span className="text-primary">Vững</span>
          </div>
          <div className="mt-1 text-[0.68rem] font-medium uppercase tracking-[0.14em] text-muted-foreground">
            Ôn thi GPLX hạng B
          </div>
        </div>
      )}
    </div>
  )
}
