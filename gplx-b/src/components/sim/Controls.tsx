import { useRef, useState } from "react"
import { ArrowBigLeft, ArrowBigRight, ChevronsLeft, ChevronsRight, Hand, ShieldCheck, TriangleAlert, Video } from "lucide-react"
import type { Command, Input } from "@/sim/input"
import { cn } from "@/lib/utils"
import { glass } from "./Hud"
import { CAMERA_LABEL, CAMERA_ORDER, type Hud } from "./World"

const btn = "flex select-none items-center justify-center rounded-xl text-white/85 transition active:scale-95 hover:bg-white/10 touch-none"

/** Vô lăng mini: hiển thị góc đánh lái, kéo ngang để lái, bấm "Giữa" để trả lái. */
function WheelWidget({ steer, input }: { steer: number; input: Input }) {
  const start = useRef<{ x: number; prev: number | null } | null>(null)
  return (
    <div className="flex flex-col items-center gap-0.5">
      <div
        className="relative size-14 cursor-grab touch-none active:cursor-grabbing"
        onPointerDown={(e) => {
          ;(e.target as HTMLElement).setPointerCapture(e.pointerId)
          start.current = { x: e.clientX, prev: input.mouseSteer }
        }}
        onPointerMove={(e) => {
          if (!start.current) return
          input.mouseSteer = Math.max(-1, Math.min(1, -(e.clientX - start.current.x) / 140))
        }}
        onPointerUp={() => {
          input.mouseSteer = start.current?.prev ?? null
          start.current = null
        }}
        title="Kéo ngang để đánh lái"
      >
        <svg viewBox="0 0 56 56" className="size-full" style={{ transform: `rotate(${-steer * 450}deg)` }}>
          <circle cx="28" cy="28" r="24" fill="none" stroke="rgba(255,255,255,0.85)" strokeWidth="5" />
          <path d="M6 30 H50" stroke="rgba(255,255,255,0.7)" strokeWidth="4" strokeLinecap="round" />
          <circle cx="28" cy="30" r="6" fill="rgba(255,255,255,0.85)" />
          <rect x="26" y="2" width="4" height="7" rx="1" fill="#38bdf8" />
        </svg>
      </div>
      <button className="rounded-md px-2 text-[0.65rem] font-semibold text-white/70 hover:bg-white/10" onClick={() => input.centerSteer()}>
        Giữa
      </button>
    </div>
  )
}

function holdKey(input: Input, action: "left" | "right") {
  return {
    onPointerDown: (e: React.PointerEvent) => {
      ;(e.target as HTMLElement).setPointerCapture(e.pointerId)
      input.held.add(action)
    },
    onPointerUp: () => input.held.delete(action),
    onPointerCancel: () => input.held.delete(action),
  }
}

/** Bàn đạp dạng thanh kéo: chạm/kéo theo chiều dọc để đạp nông–sâu, thả ra là nhả. */
function Pedal({ label, hint, kind, input, tone }: { label: string; hint: string; kind: "throttle" | "brake"; input: Input; tone: string }) {
  const [v, setV] = useState(0)
  const ref = useRef<HTMLDivElement>(null)
  const set = (clientY: number) => {
    const r = ref.current!.getBoundingClientRect()
    const x = Math.max(0.15, Math.min(1, 1 - (clientY - r.top) / r.height))
    input.touch[kind] = x
    setV(x)
  }
  const release = () => {
    input.touch[kind] = 0
    setV(0)
  }
  return (
    <div
      ref={ref}
      className={cn("relative flex h-28 w-14 cursor-pointer touch-none flex-col items-center justify-between overflow-hidden rounded-2xl py-2 select-none", glass)}
      onPointerDown={(e) => {
        ;(e.target as HTMLElement).setPointerCapture(e.pointerId)
        set(e.clientY)
      }}
      onPointerMove={(e) => e.buttons && set(e.clientY)}
      onPointerUp={release}
      onPointerCancel={release}
    >
      <div className={cn("absolute inset-x-0 bottom-0 transition-[height] duration-75", tone)} style={{ height: `${v * 100}%` }} />
      <span className="relative text-[0.7rem] font-bold tracking-wide">{label}</span>
      <div className="relative flex flex-col gap-1">
        {[0, 1, 2, 3].map((i) => (
          <span key={i} className="h-0.5 w-6 rounded bg-white/40" />
        ))}
      </div>
      <span className="relative hidden text-[0.6rem] text-white/60 sm:block">{hint}</span>
    </div>
  )
}

export function ControlDock({ hud, input, cmd }: { hud: Hud; input: Input; cmd: (c: Command) => void }) {
  const blink = Math.floor(Date.now() / 380) % 2 === 0
  const camIdx = CAMERA_ORDER.indexOf(hud.camera) + 1
  return (
    <div className="pointer-events-none absolute inset-x-0 bottom-3 flex items-end justify-between gap-2 px-3 sm:justify-center sm:gap-3">
      {/* Cần số */}
      <div className={cn("pointer-events-auto flex flex-col gap-1 rounded-2xl p-1.5", glass)}>
        {(["P", "R", "N", "D"] as const).map((g) => (
          <button
            key={g}
            onClick={() => cmd(`gear${g}` as Command)}
            className={cn(btn, "size-8 text-sm font-extrabold", hud.gear === g ? "bg-white text-zinc-900 hover:bg-white" : "text-white/50")}
          >
            {g}
          </button>
        ))}
      </div>

      {/* Xi nhan + vô lăng */}
      <div className={cn("pointer-events-auto rounded-3xl px-3 py-2", glass)}>
        <div className="flex items-center justify-center gap-2">
          <button className={cn(btn, "size-9", (hud.signal === "left" || hud.hazard) && blink && "bg-emerald-500/30 text-emerald-300")} onClick={() => cmd("signalLeft")} title="Xi nhan trái (Q)">
            <ArrowBigLeft className="size-5" />
          </button>
          <button className={cn(btn, "size-9", hud.hazard && blink && "bg-rose-500/40 text-rose-200")} onClick={() => cmd("hazard")} title="Đèn cảnh báo nguy hiểm (H)">
            <TriangleAlert className="size-5" />
          </button>
          <button className={cn(btn, "size-9", (hud.signal === "right" || hud.hazard) && blink && "bg-emerald-500/30 text-emerald-300")} onClick={() => cmd("signalRight")} title="Xi nhan phải (E)">
            <ArrowBigRight className="size-5" />
          </button>
        </div>
        <div className="mt-1 flex items-center gap-2">
          <button className={cn(btn, "h-12 w-12 bg-white/5")} {...holdKey(input, "left")} title="Giữ để đánh lái trái (A / ←)">
            <ChevronsLeft className="size-6" />
          </button>
          <WheelWidget steer={hud.steer} input={input} />
          <button className={cn(btn, "h-12 w-12 bg-white/5")} {...holdKey(input, "right")} title="Giữ để đánh lái phải (D / →)">
            <ChevronsRight className="size-6" />
          </button>
        </div>
        <div className="mt-1.5 flex justify-center gap-1.5">
          <button
            onClick={() => cmd("seatbelt")}
            className={cn("flex items-center gap-1 rounded-full px-2 py-0.5 text-[0.65rem] font-semibold", hud.seatbelt ? "bg-emerald-500/20 text-emerald-300" : "bg-rose-500/25 text-rose-200")}
          >
            <ShieldCheck className="size-3" /> Dây an toàn
          </button>
          <button
            onClick={() => cmd("handbrake")}
            className={cn("flex items-center gap-1 rounded-full px-2 py-0.5 text-[0.65rem] font-semibold", hud.handbrake ? "bg-rose-500/25 text-rose-200" : "bg-white/10 text-white/60")}
          >
            <Hand className="size-3" /> Phanh tay
          </button>
        </div>
      </div>

      {/* Camera + bàn đạp */}
      <div className="pointer-events-auto flex items-end gap-2">
        <button className={cn(btn, "flex-col gap-0.5 rounded-2xl px-2.5 py-2", glass)} onClick={() => cmd("camera")} title="Đổi góc nhìn (C)">
          <Video className="size-4" />
          <span className="text-xs font-bold tabular-nums">{camIdx}</span>
          <span className="hidden text-[0.6rem] text-white/60 lg:block">{CAMERA_LABEL[hud.camera]}</span>
        </button>
        <Pedal label="PHANH" hint="S / ↓" kind="brake" input={input} tone="bg-rose-500/45" />
        <Pedal label="GA" hint="W / ↑" kind="throttle" input={input} tone="bg-emerald-500/45" />
      </div>
    </div>
  )
}
