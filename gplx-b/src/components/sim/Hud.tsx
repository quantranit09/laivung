import { useEffect, useMemo, useRef } from "react"
import { Gauge, Power, RotateCcw, ShieldCheck, Timer, TriangleAlert, Trophy, XCircle, Zap } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import type { CityDrive } from "@/sim/city"
import type { Shape } from "@/sim/geom"
import { PASS_SCORE, type Fault, type Instruction } from "@/sim/scenario"
import { cn } from "@/lib/utils"
import { tap } from "./tap"
import { rearInset, type Hud } from "./World"

/** Kính mờ tối — nền chung của mọi bảng điều khiển trên màn mô phỏng. */
export const glass = "bg-zinc-950/55 text-white ring-1 ring-white/10 shadow-[0_8px_32px_rgba(0,0,0,0.35)] backdrop-blur-xl"

export const fmt = (s: number) => `${String(Math.floor(s / 60)).padStart(2, "0")}:${String(Math.floor(s % 60)).padStart(2, "0")}`

function Seg({ children, className }: { children: React.ReactNode; className?: string }) {
  return <div className={cn("flex items-center gap-1.5 px-2 py-2 sm:gap-2 sm:px-4", className)}>{children}</div>
}

function Ring({ value, total }: { value: number; total: number }) {
  const r = 9
  const c = 2 * Math.PI * r
  return (
    <svg viewBox="0 0 24 24" className="size-6 -rotate-90">
      <circle cx="12" cy="12" r={r} fill="none" stroke="rgba(255,255,255,0.15)" strokeWidth="3" />
      <circle cx="12" cy="12" r={r} fill="none" stroke="#38bdf8" strokeWidth="3" strokeLinecap="round" strokeDasharray={c} strokeDashoffset={c * (1 - value / Math.max(1, total))} />
    </svg>
  )
}

/** Thanh trạng thái phía trên: điểm · thời gian · tiến độ · tốc độ · công suất/vòng tua · nút khởi động. */
export function TopBar({
  hud,
  timeLimit,
  speedLimit,
  title,
  progress,
  onEngine,
}: {
  hud: Hud
  timeLimit: number
  speedLimit: number
  title: string
  progress?: { done: number; total: number }
  onEngine: () => void
}) {
  const over = hud.kmh > speedLimit + 0.5
  return (
    <div className={cn("flex w-full items-stretch divide-x divide-white/10 overflow-x-auto rounded-2xl text-sm [scrollbar-width:none] sm:w-fit sm:max-w-full max-sm:*:flex-1 max-sm:*:justify-center", glass)}>
      <Seg>
        <ShieldCheck className={cn("size-5", hud.score >= PASS_SCORE ? "text-emerald-400" : "text-rose-400")} />
        <span className="text-xl font-extrabold tabular-nums">{hud.score}</span>
      </Seg>
      <Seg>
        <Timer className="hidden size-4 text-sky-300 min-[400px]:block" />
        <span className="font-mono text-base font-semibold tabular-nums">{fmt(hud.time)}</span>
        <span className="hidden font-mono text-xs text-white/50 tabular-nums sm:inline short:hidden">/ {fmt(timeLimit)}</span>
      </Seg>
      {progress && (
        <Seg className="min-w-0">
          <Ring value={progress.done} total={progress.total} />
          <span className="shrink-0 text-xs font-semibold text-sky-300 tabular-nums">
            {progress.done}/{progress.total}
          </span>
          <span className="hidden max-w-56 truncate font-semibold lg:inline">{title}</span>
        </Seg>
      )}
      <Seg>
        <span className={cn("text-2xl leading-none font-extrabold tabular-nums", over && "text-amber-300")}>{Math.round(hud.kmh)}</span>
        <span className="text-[0.65rem] leading-tight text-white/60">
          km/h
          <br />≤{speedLimit}
        </span>
      </Seg>
      <Seg className="hidden md:flex short:hidden">
        {hud.ev ? <Zap className="size-4 text-amber-300" /> : <Gauge className={cn("size-4", hud.rpm > 4000 ? "text-rose-400" : "text-amber-300")} />}
        <div className="w-16">
          <div className="h-1.5 overflow-hidden rounded-full bg-white/15">
            <div
              className={cn("h-full rounded-full transition-[width] duration-100", hud.ev ? "bg-amber-300" : hud.rpm > 4000 ? "bg-rose-400" : "bg-amber-300")}
              style={{ width: `${(hud.ev ? hud.power : hud.rpm / 6000) * 100}%` }}
            />
          </div>
          <div className="mt-0.5 text-[0.65rem] text-white/60 tabular-nums">{hud.ev ? `${Math.round(hud.power * 130)} kW` : `${Math.round(hud.rpm)} v/ph`}</div>
        </div>
      </Seg>
      <Seg className="px-1.5 sm:px-2">
        <button
          {...tap(onEngine)}
          className={cn(
            "flex items-center gap-1.5 rounded-xl px-2.5 py-1.5 text-xs font-bold tracking-wide whitespace-nowrap transition sm:px-3",
            hud.engine ? "bg-emerald-500/20 text-emerald-300 ring-1 ring-emerald-400/40" : "animate-pulse bg-rose-500/20 text-rose-200 ring-1 ring-rose-400/60",
          )}
          title="Khởi động / tắt xe (K)"
        >
          <Power className="size-3.5" />
          {hud.engine ? (hud.ev ? "READY" : "NỔ MÁY") : hud.ev ? "BẬT XE" : "KHỞI ĐỘNG"}
        </button>
      </Seg>
    </div>
  )
}

export function InstructionPanel({ instr, alarm, assist, faults, narrow }: { instr: Instruction; alarm: boolean; assist: boolean; faults: Fault[]; narrow?: boolean }) {
  const recent = faults.slice(-3).reverse()
  return (
    <div className={cn("pointer-events-none w-[min(92vw,360px)] space-y-2 short:w-[min(44vw,320px)]", narrow && "max-sm:w-[calc(58vw-1.25rem)]")}>
      <div className={cn("rounded-2xl p-3.5", glass, alarm && "animate-pulse bg-rose-600/80 ring-rose-300/40")}>
        <div className="text-sm font-bold">{instr.title}</div>
        {instr.detail && <div className="mt-1 text-xs leading-relaxed text-white/80 short:line-clamp-2">{instr.detail}</div>}
        {assist && instr.toLine !== undefined && instr.toLine > -2 && instr.toLine < 12 && <LineMeter d={instr.toLine} />}
      </div>
      {recent.slice(0, 2).map((f, i) => (
        <div
          key={f.t + f.text}
          className={cn(
            "flex items-start gap-2 rounded-xl px-3 py-2 text-xs text-white shadow-lg backdrop-blur-xl",
            f.fatal ? "bg-rose-700/85" : "bg-amber-600/80",
            i > 0 && "opacity-60 short:hidden",
          )}
        >
          <b className="shrink-0 tabular-nums">{f.fatal ? "Đình chỉ" : `−${f.points}`}</b>
          <span>{f.text}</span>
        </div>
      ))}
    </div>
  )
}

function LineMeter({ d }: { d: number }) {
  const ok = d >= 0 && d <= 0.5
  const pct = Math.max(0, Math.min(1, 1 - d / 6)) * 100
  return (
    <div className="mt-2.5">
      <div className="flex justify-between text-[0.7rem] text-white/70">
        <span>Cản trước → vạch dừng</span>
        <b className={cn("tabular-nums", ok ? "text-emerald-300" : d < 0 ? "text-rose-300" : "text-white")}>{d < 0 ? `quá ${(-d).toFixed(2)} m` : `${d.toFixed(2)} m`}</b>
      </div>
      <div className="relative mt-1.5 h-1.5 rounded-full bg-white/15">
        <div className={cn("absolute inset-y-0 left-0 rounded-full", ok ? "bg-emerald-400" : "bg-sky-300")} style={{ width: `${pct}%` }} />
        <div className="absolute -inset-y-1 w-0.5 rounded bg-emerald-300" style={{ left: `${(1 - 0.5 / 6) * 100}%` }} />
      </div>
    </div>
  )
}

/** Khung + vạch dẫn hướng của camera lùi (ảnh được vẽ thẳng bằng WebGL vào cùng vị trí). */
export function RearCamFrame({ width, height, steer }: { width: number; height: number; steer: number }) {
  const r = rearInset(width, height)
  // Vạch dẫn cong theo góc lái (lùi: đánh lái trái → đuôi xe sang phải trên màn hình gương)
  const bend = -steer * 60
  return (
    <div className="pointer-events-none absolute overflow-hidden rounded-xl ring-2 ring-white/70" style={{ top: r.top, right: r.right, width: r.width, height: r.height }}>
      <svg viewBox="0 0 320 180" className="size-full" preserveAspectRatio="none">
        <path d={`M70 180 Q ${100 + bend} 110 ${125 + bend} 60`} stroke="#facc15" strokeWidth="3" fill="none" />
        <path d={`M250 180 Q ${220 + bend} 110 ${195 + bend} 60`} stroke="#facc15" strokeWidth="3" fill="none" />
        <line x1="82" y1="150" x2="238" y2="150" stroke="#ef4444" strokeWidth="3" />
        <line x1="104" y1="110" x2="216" y2="110" stroke="#facc15" strokeWidth="2" />
        <line x1="120" y1="75" x2="200" y2="75" stroke="#22c55e" strokeWidth="2" />
      </svg>
      <span className="absolute top-1.5 left-2 rounded bg-black/60 px-1.5 text-[0.65rem] font-semibold text-white">CAMERA LÙI</span>
    </div>
  )
}

export function Minimap({ shapes, hud, city }: { shapes: Shape[]; hud?: Hud; city?: CityDrive }) {
  const ref = useRef<HTMLCanvasElement>(null)
  const base = useMemo(() => {
    let x0 = Infinity, x1 = -Infinity, z0 = Infinity, z1 = -Infinity
    for (const s of shapes)
      for (const p of s.pts) {
        x0 = Math.min(x0, p.x)
        x1 = Math.max(x1, p.x)
        z0 = Math.min(z0, p.z)
        z1 = Math.max(z1, p.z)
      }
    return { x0: x0 - 8, x1: x1 + 8, z0: z0 - 8, z1: z1 + 8 }
  }, [shapes])
  useEffect(() => {
    const c = ref.current
    if (!c || !hud) return
    const g = c.getContext("2d")!
    const W = c.width, H = c.height
    const k = Math.min(W / (base.x1 - base.x0), H / (base.z1 - base.z0))
    // Bắc ở trên; +x là bên trái khi nhìn về +z nên x tăng → sang trái màn hình
    const px = (x: number) => W / 2 - (x - (base.x0 + base.x1) / 2) * k
    const pz = (z: number) => H / 2 - (z - (base.z0 + base.z1) / 2) * k
    g.clearRect(0, 0, W, H)
    g.fillStyle = "#94a3b8"
    g.strokeStyle = "#94a3b8"
    for (const s of shapes) {
      g.beginPath()
      s.pts.forEach((p, i) => (i ? g.lineTo(px(p.x), pz(p.z)) : g.moveTo(px(p.x), pz(p.z))))
      if (s.kind === "poly") {
        g.closePath()
        g.fill()
      } else {
        g.lineWidth = Math.max(1.5, s.width * k)
        g.lineCap = "round"
        g.stroke()
      }
    }
    if (city) {
      g.fillStyle = "#fbbf24"
      for (const n of city.npcs) g.fillRect(px(n.pos.x) - 1.5, pz(n.pos.z) - 1.5, 3, 3)
    }
    g.save()
    g.translate(px(hud.x), pz(hud.z))
    g.rotate(-hud.heading)
    g.fillStyle = "#38bdf8"
    g.beginPath()
    g.moveTo(0, -7)
    g.lineTo(5, 6)
    g.lineTo(-5, 6)
    g.closePath()
    g.fill()
    g.restore()
  }, [hud, shapes, base, city])
  return <canvas ref={ref} width={150} height={150} className={cn("hidden rounded-2xl p-1 sm:block short:hidden", glass)} />
}

export function Result({ passed, score, faults, time, onRestart, onMenu }: { passed: boolean; score: number; faults: Fault[]; time: number; onRestart: () => void; onMenu: () => void }) {
  return (
    <div className="absolute inset-0 z-30 flex items-center justify-center bg-black/45 p-4 backdrop-blur-sm">
      <Card className="max-h-[90%] w-full max-w-md overflow-y-auto">
        <CardHeader className="text-center">
          <div className={cn("mx-auto mb-1 flex size-14 items-center justify-center rounded-full", passed ? "bg-success/15 text-success" : "bg-destructive/12 text-destructive")}>
            {passed ? <Trophy className="size-7" /> : <XCircle className="size-7" />}
          </div>
          <CardTitle className="text-2xl">{passed ? "ĐẠT" : "KHÔNG ĐẠT"}</CardTitle>
          <CardDescription>
            {score} điểm · cần từ {PASS_SCORE} · thời gian {fmt(time)}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {faults.length ? (
            <ul className="divide-y rounded-lg border text-sm">
              {faults.map((f, i) => (
                <li key={i} className="flex items-start gap-2 p-2">
                  {f.fatal ? <TriangleAlert className="mt-0.5 size-4 shrink-0 text-destructive" /> : <Badge variant="outline" className="shrink-0 tabular-nums">−{f.points}</Badge>}
                  <span className="flex-1">{f.text}</span>
                  <span className="text-xs text-muted-foreground tabular-nums">{fmt(f.t)}</span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-center text-sm text-muted-foreground">Không mắc lỗi nào. Xuất sắc!</p>
          )}
          <div className="grid grid-cols-2 gap-2">
            <Button onClick={onRestart}>
              <RotateCcw /> Thi lại
            </Button>
            <Button variant="outline" onClick={onMenu}>
              Chọn bài khác
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}

/** Các bước xuất phát như trên xe thật — tích dần khi làm đúng. */
export function StartChecklist({ hud, touch, narrow, onBegin }: { hud: Hud; touch: boolean; narrow?: boolean; onBegin: () => void }) {
  // Cảm ứng: chỉ tên nút trên màn hình; bàn phím: kèm phím tắt
  const steps: [string, string, boolean][] = [
    [touch ? "Giữ bàn đạp PHANH" : "Đạp giữ phanh", "S", hud.brake > 0.3 || hud.engine],
    [hud.ev ? "Bật xe — READY" : "Khởi động máy", "K", hud.engine],
    ["Thắt dây an toàn", "B", hud.seatbelt],
    ["Vào số D khi đang đạp phanh", "4", hud.gear === "D"],
    ["Nhả phanh tay khi đang đạp phanh", "Space", !hud.handbrake],
    ["Nhận lệnh xuất phát", "Enter", false],
  ]
  const next = steps.findIndex(([, , ok]) => !ok)
  return (
    <div className={cn("pointer-events-none w-[min(92vw,360px)] rounded-2xl p-3.5 short:w-[min(44vw,320px)] short:p-2.5 short:text-[0.7rem]", narrow && "max-sm:w-[calc(58vw-1.25rem)]", glass)}>
      <div className="text-sm font-bold">
        Chuẩn bị xuất phát <span className="hidden font-semibold text-sky-300 tabular-nums short:inline">· {next + 1}/{steps.length}</span>
      </div>
      <ol className="mt-2 space-y-1.5 text-xs short:space-y-1">
        {steps.map(([t, key, ok], i) => (
          <li key={t} className={cn("flex items-center gap-2", ok ? "text-emerald-300" : i === next ? "font-semibold text-white" : "text-white/60", i !== next && "short:hidden")}>
            <span className={cn("flex size-4.5 shrink-0 items-center justify-center rounded-full text-[0.6rem] font-bold", ok ? "bg-emerald-400 text-zinc-900" : "bg-white/15")}>
              {ok ? "✓" : i + 1}
            </span>
            {t}
            {!touch && <span className="text-white/40">({key})</span>}
          </li>
        ))}
      </ol>
      <p className="mt-2 text-[0.7rem] text-white/60 short:hidden">
        Sau khi nhận lệnh: bật xi nhan trái{touch ? "" : " (Q)"}, nhả phanh cho xe tự bò qua vạch trong 20 giây.
      </p>
      <button
        {...tap(onBegin)}
        className={cn("pointer-events-auto mt-2.5 w-full rounded-xl bg-sky-500 py-2.5 text-sm font-bold short:mt-1.5 short:py-1.5 text-white transition active:bg-sky-400", !touch && "sm:hidden")}
      >
        Nhận lệnh xuất phát
      </button>
    </div>
  )
}
