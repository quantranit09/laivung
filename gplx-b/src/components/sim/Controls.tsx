import { useRef, useState } from "react"
import { ArrowBigLeft, ArrowBigRight, Hand, ShieldCheck, TriangleAlert, Video } from "lucide-react"
import type { Command, Input } from "@/sim/input"
import { cn } from "@/lib/utils"
import { glass } from "./Hud"
import { CAMERA_LABEL, type Hud } from "./World"

const blinkOn = () => Math.floor(Date.now() / 380) % 2 === 0

function Wheel({ steer, size = 40 }: { steer: number; size?: number }) {
  return (
    <svg viewBox="0 0 56 56" style={{ width: size, height: size, transform: `rotate(${-steer * 450}deg)` }}>
      <circle cx="28" cy="28" r="24" fill="none" stroke="rgba(255,255,255,0.9)" strokeWidth="5" />
      <path d="M6 30 H50" stroke="rgba(255,255,255,0.75)" strokeWidth="4" strokeLinecap="round" />
      <circle cx="28" cy="30" r="6" fill="rgba(255,255,255,0.9)" />
      <rect x="26" y="2" width="4" height="7" rx="1" fill="#38bdf8" />
    </svg>
  )
}

/** Cột nhỏ cho biết đang đạp phanh/ga sâu bao nhiêu. */
function Level({ value, tone, label }: { value: number; tone: string; label: string }) {
  return (
    <div className="flex flex-col items-center gap-1" title={label}>
      <div className="relative h-9 w-1.5 overflow-hidden rounded-full bg-white/15">
        <div className={cn("absolute inset-x-0 bottom-0 rounded-full", tone)} style={{ height: `${value * 100}%` }} />
      </div>
      <span className="text-[0.55rem] font-bold text-white/50">{label}</span>
    </div>
  )
}

function Icon({ on, warn, title, onClick, children }: { on?: boolean; warn?: boolean; title: string; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      title={title}
      onClick={onClick}
      className={cn(
        "flex size-9 items-center justify-center rounded-xl transition hover:bg-white/10",
        warn ? "text-rose-300" : on ? "text-emerald-300" : "text-white/40",
      )}
    >
      {children}
    </button>
  )
}

/**
 * Máy tính: một dải trạng thái gọn ở đáy màn hình — điều khiển chính bằng bàn phím,
 * dải này cho biết trạng thái và bấm được khi cần.
 */
export function StatusStrip({ hud, cmd }: { hud: Hud; cmd: (c: Command) => void }) {
  const blink = blinkOn()
  return (
    <div className="pointer-events-none absolute inset-x-0 bottom-3 flex justify-center px-3">
      <div className={cn("pointer-events-auto flex items-center gap-1 rounded-2xl px-3 py-1.5", glass)}>
        <Level value={hud.brake} tone="bg-rose-400" label="S" />
        <div className="mx-2 flex gap-0.5" title="Cần số — đạp phanh (S) rồi bấm 1·2·3·4">
          {(["P", "R", "N", "D"] as const).map((g, i) => (
            <button
              key={g}
              onClick={() => cmd(`gear${g}` as Command)}
              className={cn("w-7 rounded-lg py-1 text-sm font-extrabold transition", hud.gear === g ? "bg-white text-zinc-900" : "text-white/35 hover:text-white/70")}
              title={`Số ${g} (phím ${i + 1})`}
            >
              {g}
            </button>
          ))}
        </div>
        <span className="h-7 w-px bg-white/10" />
        <Icon title="Xi nhan trái (Q)" on={(hud.signal === "left" || hud.hazard) && blink} onClick={() => cmd("signalLeft")}>
          <ArrowBigLeft className="size-5" />
        </Icon>
        <div className="px-1" title="Vô lăng (A / D)">
          <Wheel steer={hud.steer} />
        </div>
        <Icon title="Xi nhan phải (E)" on={(hud.signal === "right" || hud.hazard) && blink} onClick={() => cmd("signalRight")}>
          <ArrowBigRight className="size-5" />
        </Icon>
        <span className="h-7 w-px bg-white/10" />
        <Icon title="Dây an toàn (B)" on={hud.seatbelt} warn={!hud.seatbelt} onClick={() => cmd("seatbelt")}>
          <ShieldCheck className="size-4.5" />
        </Icon>
        <Icon title="Phanh tay (Space — nhả phải đạp phanh)" warn={hud.handbrake} onClick={() => cmd("handbrake")}>
          <span className="flex size-5 items-center justify-center rounded-full border-2 border-current text-[0.6rem] font-black">P</span>
        </Icon>
        <Icon title="Đèn cảnh báo nguy hiểm (H)" warn={hud.hazard && blink} onClick={() => cmd("hazard")}>
          <TriangleAlert className="size-4.5" />
        </Icon>
        <Icon title={`Góc nhìn: ${CAMERA_LABEL[hud.camera]} (C)`} on onClick={() => cmd("camera")}>
          <Video className="size-4.5" />
        </Icon>
        <Level value={hud.throttle} tone="bg-emerald-400" label="W" />
      </div>
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
function Pedal({ label, kind, input, tone, tall }: { label: string; kind: "throttle" | "brake"; input: Input; tone: string; tall?: boolean }) {
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
      className={cn("relative flex w-16 touch-none items-start justify-center overflow-hidden rounded-2xl pt-2 select-none", tall ? "h-36 short:h-28" : "h-28 short:h-22", glass)}
      onPointerDown={(e) => {
        ;(e.target as HTMLElement).setPointerCapture(e.pointerId)
        set(e.clientY)
      }}
      onPointerMove={(e) => e.buttons && set(e.clientY)}
      onPointerUp={release}
      onPointerCancel={release}
    >
      <div className={cn("absolute inset-x-0 bottom-0", tone)} style={{ height: `${v * 100}%` }} />
      <span className="relative text-xs font-bold">{label}</span>
    </div>
  )
}

/**
 * Màn hình cảm ứng: tay trái lái (vô lăng kéo được + xi nhan), tay phải đạp phanh/ga,
 * cần số dọc bên phải. Các công tắc phụ nằm trong một hàng nhỏ.
 */
export function TouchDock({ hud, input, cmd }: { hud: Hud; input: Input; cmd: (c: Command) => void }) {
  const blink = blinkOn()
  const drag = useRef<{ x: number; prev: number | null } | null>(null)
  return (
    <>
      <div className="pointer-events-none absolute inset-x-0 bottom-[max(0.75rem,env(safe-area-inset-bottom))] flex items-end justify-between pr-[max(0.75rem,env(safe-area-inset-right))] pl-[max(0.75rem,env(safe-area-inset-left))]">
        {/* Tay trái: vô lăng */}
        <div className={cn("pointer-events-auto flex items-center gap-1 rounded-3xl p-2", glass)}>
          <button className="flex size-11 items-center justify-center rounded-2xl bg-white/5 active:bg-white/15" {...holdKey(input, "left")}>
            ‹
          </button>
          <div
            className="touch-none"
            onPointerDown={(e) => {
              ;(e.target as HTMLElement).setPointerCapture(e.pointerId)
              drag.current = { x: e.clientX, prev: input.mouseSteer }
            }}
            onPointerMove={(e) => {
              if (drag.current) input.mouseSteer = Math.max(-1, Math.min(1, -(e.clientX - drag.current.x) / 120))
            }}
            onPointerUp={() => {
              input.mouseSteer = drag.current?.prev ?? null
              drag.current = null
            }}
            onDoubleClick={() => input.centerSteer()}
          >
            <Wheel steer={hud.steer} size={64} />
          </div>
          <button className="flex size-11 items-center justify-center rounded-2xl bg-white/5 active:bg-white/15" {...holdKey(input, "right")}>
            ›
          </button>
        </div>

        {/* Tay phải: bàn đạp */}
        <div className="pointer-events-auto flex items-end gap-2">
          <Pedal label="PHANH" kind="brake" input={input} tone="bg-rose-500/50" />
          <Pedal label="GA" kind="throttle" input={input} tone="bg-emerald-500/50" tall />
        </div>
      </div>

      {/* Công tắc phụ + cần số */}
      {/* Dọc: trên bàn đạp; ngang (màn thấp): cạnh bàn đạp */}
      <div className={cn("pointer-events-auto absolute right-3 bottom-44 flex flex-col gap-1 rounded-2xl p-1.5 short:right-[10.5rem] short:bottom-3", glass)}>
        {(["P", "R", "N", "D"] as const).map((g) => (
          <button key={g} onClick={() => cmd(`gear${g}` as Command)} className={cn("size-9 rounded-xl text-sm font-extrabold", hud.gear === g ? "bg-white text-zinc-900" : "text-white/40")}>
            {g}
          </button>
        ))}
      </div>
      {/* Dọc: trên vô lăng; ngang: cạnh vô lăng */}
      <div className={cn("pointer-events-auto absolute bottom-28 left-3 flex gap-0.5 rounded-2xl p-1 short:bottom-3 short:left-[12.75rem]", glass)}>
        <Icon title="Xi nhan trái" on={(hud.signal === "left" || hud.hazard) && blink} onClick={() => cmd("signalLeft")}>
          <ArrowBigLeft className="size-5" />
        </Icon>
        <Icon title="Cảnh báo nguy hiểm" warn={hud.hazard && blink} onClick={() => cmd("hazard")}>
          <TriangleAlert className="size-4.5" />
        </Icon>
        <Icon title="Xi nhan phải" on={(hud.signal === "right" || hud.hazard) && blink} onClick={() => cmd("signalRight")}>
          <ArrowBigRight className="size-5" />
        </Icon>
        <Icon title="Dây an toàn" on={hud.seatbelt} warn={!hud.seatbelt} onClick={() => cmd("seatbelt")}>
          <ShieldCheck className="size-4.5" />
        </Icon>
        <Icon title="Phanh tay" warn={hud.handbrake} onClick={() => cmd("handbrake")}>
          <Hand className="size-4.5" />
        </Icon>
        <Icon title="Góc nhìn" on onClick={() => cmd("camera")}>
          <Video className="size-4.5" />
        </Icon>
      </div>
    </>
  )
}
