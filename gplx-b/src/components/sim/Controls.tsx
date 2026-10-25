import { useRef, useState } from "react"
import { ArrowBigLeft, ArrowBigRight, Hand, ShieldCheck, TriangleAlert, Video } from "lucide-react"
import type { Command, Input } from "@/sim/input"
import { cn } from "@/lib/utils"
import { glass } from "./Hud"
import { tap } from "./tap"
import { CAMERA_LABEL, type Hud } from "./World"

const blinkOn = () => Math.floor(Date.now() / 380) % 2 === 0

function Wheel({ steer, className = "size-10" }: { steer: number; className?: string }) {
  return (
    <svg viewBox="0 0 56 56" className={cn("pointer-events-none", className)} style={{ transform: `rotate(${-steer * 450}deg)` }}>
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
      {...tap(onClick)}
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
              {...tap(() => cmd(`gear${g}` as Command))}
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

/** Giữ ngón tay này cho phần tử kể cả khi trượt ra ngoài (bỏ qua nếu ngón đã nhấc lên). */
function capture(e: React.PointerEvent) {
  try {
    e.currentTarget.setPointerCapture(e.pointerId)
  } catch {
    /* con trỏ không còn hoạt động */
  }
}

function holdKey(input: Input, action: "left" | "right") {
  return {
    onPointerDown: (e: React.PointerEvent) => {
      capture(e)
      input.held.add(action)
    },
    onPointerUp: () => input.held.delete(action),
    onPointerCancel: () => input.held.delete(action),
  }
}

/** Bàn đạp dạng thanh kéo: chạm/kéo theo chiều dọc để đạp nông–sâu, thả ra là nhả. */
function Pedal({ label, kind, input, tone, className }: { label: string; kind: "throttle" | "brake"; input: Input; tone: string; className: string }) {
  const [v, setV] = useState(0)
  const ref = useRef<HTMLDivElement>(null)
  const set = (clientY: number) => {
    const r = ref.current!.getBoundingClientRect()
    // Phanh: chạm ở đâu cũng đủ sâu để giữ xe và cho vào số (cần > 0.3); ga nhẹ từ 15% để bò chậm
    const x = Math.max(kind === "brake" ? 0.45 : 0.15, Math.min(1, 1 - (clientY - r.top) / r.height))
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
      className={cn("relative flex touch-none items-start justify-center overflow-hidden rounded-2xl pt-2 select-none", className, glass)}
      onPointerDown={(e) => {
        capture(e)
        set(e.clientY)
      }}
      onPointerMove={(e) => e.currentTarget.hasPointerCapture(e.pointerId) && set(e.clientY)}
      onPointerUp={release}
      onPointerCancel={release}
      onLostPointerCapture={release}
    >
      <div className={cn("absolute inset-x-0 bottom-0", tone)} style={{ height: `${v * 100}%` }} />
      <span className="pointer-events-none relative text-xs font-bold">{label}</span>
    </div>
  )
}

/** Vô lăng ảo: đặt ngón cái lên và kéo ngang để đánh lái, thả ra là vô lăng tự trả về. */
function SteerPad({ hud, input }: { hud: Hud; input: Input }) {
  const drag = useRef<{ x: number; prev: number | null; id: number } | null>(null)
  const end = (e: React.PointerEvent) => {
    if (drag.current?.id !== e.pointerId) return
    input.mouseSteer = drag.current.prev
    drag.current = null
  }
  return (
    <div
      className="flex touch-none items-center justify-center rounded-full p-1"
      onPointerDown={(e) => {
        capture(e)
        drag.current = { x: e.clientX, prev: input.mouseSteer, id: e.pointerId }
      }}
      onPointerMove={(e) => {
        // vô lăng to hơn khi nằm ngang → quãng kéo dài hơn một chút cho mịn tay
        if (drag.current?.id === e.pointerId) input.mouseSteer = Math.max(-1, Math.min(1, -(e.clientX - drag.current.x) / (innerHeight < 500 ? 110 : 120)))
      }}
      onPointerUp={end}
      onPointerCancel={end}
    >
      <Wheel steer={hud.steer} className="size-16 short:size-28" />
    </div>
  )
}

/**
 * Màn hình cảm ứng: tay trái lái (vô lăng kéo được), tay phải đạp phanh/ga, cần số cạnh bàn đạp.
 * Điện thoại dọc: công tắc phụ trên vô lăng. Nằm ngang (màn thấp): vô lăng to, công tắc ở giữa đáy,
 * cần số dọc sát bàn đạp — hai ngón cái với tới mọi thứ.
 */
export function TouchDock({ hud, input, cmd }: { hud: Hud; input: Input; cmd: (c: Command) => void }) {
  const blink = blinkOn()
  const side = "pr-[max(0.75rem,env(safe-area-inset-right))] pl-[max(0.75rem,env(safe-area-inset-left))]"
  return (
    <>
      <div className={cn("pointer-events-none absolute inset-x-0 bottom-[max(0.75rem,env(safe-area-inset-bottom))] flex items-end justify-between", side)}>
        {/* Tay trái: vô lăng (dọc thêm 2 nút giữ để lái từng nấc) */}
        <div className={cn("pointer-events-auto flex items-center gap-1 rounded-3xl p-2 short:rounded-full short:p-1.5", glass)}>
          <button className="flex size-11 items-center justify-center rounded-2xl bg-white/5 active:bg-white/15 short:hidden" {...holdKey(input, "left")}>
            ‹
          </button>
          <SteerPad hud={hud} input={input} />
          <button className="flex size-11 items-center justify-center rounded-2xl bg-white/5 active:bg-white/15 short:hidden" {...holdKey(input, "right")}>
            ›
          </button>
        </div>

        {/* Tay phải: cần số (chỉ khi nằm ngang) + bàn đạp */}
        <div className="pointer-events-auto flex items-end gap-2">
          <div className="hidden short:block">
            <Gears hud={hud} cmd={cmd} />
          </div>
          <Pedal label="PHANH" kind="brake" input={input} tone="bg-rose-500/50" className="h-28 w-16 short:h-30 short:w-20" />
          <Pedal label="GA" kind="throttle" input={input} tone="bg-emerald-500/50" className="h-36 w-16 short:h-40 short:w-18" />
        </div>
      </div>

      {/* Điện thoại dọc: cần số phía trên bàn đạp */}
      <div className={cn("pointer-events-auto absolute right-3 bottom-44 short:hidden")}>
        <Gears hud={hud} cmd={cmd} />
      </div>
      <div
        className={cn(
          "pointer-events-auto absolute bottom-28 left-3 flex gap-0.5 rounded-2xl p-1",
          "short:bottom-[max(0.75rem,env(safe-area-inset-bottom))] short:left-[max(10rem,calc(env(safe-area-inset-left)+9.25rem))]",
          glass,
        )}
      >
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

function Gears({ hud, cmd }: { hud: Hud; cmd: (c: Command) => void }) {
  return (
    <div className={cn("flex flex-col gap-1 rounded-2xl p-1.5", glass)}>
      {(["P", "R", "N", "D"] as const).map((g) => (
        <button
          key={g}
          {...tap(() => cmd(`gear${g}` as Command))}
          className={cn("size-9 rounded-xl text-sm font-extrabold short:size-8", hud.gear === g ? "bg-white text-zinc-900" : "text-white/40")}
        >
          {g}
        </button>
      ))}
    </div>
  )
}
