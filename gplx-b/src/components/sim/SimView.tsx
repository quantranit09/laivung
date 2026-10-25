import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { Canvas } from "@react-three/fiber"
import {
  ArrowLeft,
  Camera,
  CircleParking,
  Keyboard,
  Pause,
  Play,
  RotateCcw,
  ShieldAlert,
  TriangleAlert,
  Trophy,
  XCircle,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Car } from "@/sim/car"
import { CityDrive } from "@/sim/city"
import { Input, KEY_HELP, type Command } from "@/sim/input"
import { unlockAudio } from "@/sim/audio"
import { PASS_SCORE, type Fault, type Instruction, type Scenario } from "@/sim/scenario"
import { YardExam } from "@/sim/yard"
import type { Shape } from "@/sim/geom"
import { cn } from "@/lib/utils"
import { CarMesh } from "./CarMesh"
import { CityMesh } from "./CityMesh"
import { YardMesh } from "./YardMesh"
import { CAMERA_LABEL, SimLoop, type CameraMode, type Hud } from "./World"

type Mode = "yard" | "city"

export default function SimView({ onExit }: { onExit: () => void }) {
  const [mode, setMode] = useState<Mode>()
  const [run, setRun] = useState(0)
  if (!mode) return <Menu onPick={setMode} onExit={onExit} />
  return <Drive key={`${mode}-${run}`} mode={mode} onRestart={() => setRun((r) => r + 1)} onMenu={() => setMode(undefined)} />
}

function Shell({ children }: { children: React.ReactNode }) {
  return <div className="fixed inset-0 z-50 flex flex-col bg-background">{children}</div>
}

function Menu({ onPick, onExit }: { onPick: (m: Mode) => void; onExit: () => void }) {
  return (
    <Shell>
      <div className="flex items-center gap-2 border-b px-4 py-3">
        <Button variant="ghost" size="sm" onClick={onExit}>
          <ArrowLeft /> Về app
        </Button>
        <span className="font-semibold">Luyện lái mô phỏng · Hạng B số tự động</span>
      </div>
      <div className="flex-1 overflow-y-auto">
        <div className="mx-auto grid max-w-4xl gap-5 p-4 sm:p-6">
          <div className="grid gap-4 md:grid-cols-2">
            <ModeCard
              icon={<CircleParking className="size-6" />}
              title="Sa hình — 11 bài liên hoàn"
              desc="Xuất phát · Người đi bộ · Dốc · Vệt bánh xe & góc vuông · Ngã tư đèn · Quanh co · Ghép dọc · Ghép ngang · Đường sắt · Tăng tốc · Kết thúc. Chấm 100 điểm, đạt từ 80, tối đa 18 phút, ≤ 24 km/h, tình huống nguy hiểm ngẫu nhiên."
              onClick={() => onPick("yard")}
            />
            <ModeCard
              icon={<ShieldAlert className="size-6" />}
              title="Đường trường — lái trong phố"
              desc="Giám khảo ra hiệu lệnh: rẽ trái/phải, quay đầu, chuyển làn, vượt xe, dừng khẩn cấp, ra đường chính ở biển STOP, đèn tín hiệu, nhường người đi bộ. Có xe khác và người đi bộ."
              onClick={() => onPick("city")}
            />
          </div>
          <Card className="gap-3">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <Keyboard className="size-4" /> Điều khiển
              </CardTitle>
              <CardDescription>Trên điện thoại/máy tính bảng sẽ có nút cảm ứng. Nên dùng bàn phím trên máy tính.</CardDescription>
            </CardHeader>
            <CardContent className="grid grid-cols-2 gap-x-6 gap-y-1.5 text-sm sm:grid-cols-3">
              {KEY_HELP.map(([k, d]) => (
                <div key={k} className="flex items-center gap-2">
                  <kbd className="min-w-14 rounded border bg-muted px-1.5 py-0.5 text-center text-xs font-semibold">{k}</kbd>
                  <span className="text-muted-foreground">{d}</span>
                </div>
              ))}
            </CardContent>
          </Card>
          <p className="text-xs text-muted-foreground">
            Luật chấm theo Phụ lục III, Thông tư 108/2026/TT-BCA (áp dụng sát hạch hạng B từ 01/03/2027; các bài sa hình giữ nguyên
            như hiện hành). Kích thước sân và tuyến đường là mô phỏng gần đúng — dùng để luyện thao tác và thứ tự, không thay
            được giờ lái xe thật.
          </p>
        </div>
      </div>
    </Shell>
  )
}

function ModeCard({ icon, title, desc, onClick }: { icon: React.ReactNode; title: string; desc: string; onClick: () => void }) {
  return (
    <button onClick={onClick} className="group rounded-2xl border-2 bg-card p-5 text-left transition hover:border-primary hover:shadow-lg">
      <div className="mb-3 flex size-11 items-center justify-center rounded-xl bg-primary/10 text-primary">{icon}</div>
      <div className="text-lg font-bold">{title}</div>
      <p className="mt-1.5 text-sm text-muted-foreground">{desc}</p>
      <div className="mt-4 text-sm font-semibold text-primary group-hover:underline">Bắt đầu lái →</div>
    </button>
  )
}

function Drive({ mode, onRestart, onMenu }: { mode: Mode; onRestart: () => void; onMenu: () => void }) {
  const scenario = useMemo<Scenario>(() => (mode === "yard" ? new YardExam() : new CityDrive()), [mode])
  const car = useMemo(() => {
    const c = new Car()
    c.reset(scenario.start.pos, scenario.start.heading)
    return c
  }, [scenario])
  const carRef = useRef(car)
  const scRef = useRef(scenario)
  const input = useMemo(() => new Input(), [])
  const camera = useRef<CameraMode>(mode === "yard" ? "third" : "first")
  const paused = useRef(false)
  const [hud, setHud] = useState<Hud>()
  const [instr, setInstr] = useState<Instruction>()
  const [faults, setFaults] = useState<Fault[]>([])
  const [toast, setToast] = useState<string>()
  const [isPaused, setPaused] = useState(false)

  // Móc gỡ lỗi khi phát triển: window.__sim.car / .scenario
  useEffect(() => {
    if (import.meta.env.DEV) (window as unknown as { __sim: object }).__sim = { car, scenario }
  }, [car, scenario])

  useEffect(() => {
    const down = (e: KeyboardEvent) => input.onKey(e, true)
    const up = (e: KeyboardEvent) => input.onKey(e, false)
    const blur = () => input.held.clear()
    window.addEventListener("keydown", down)
    window.addEventListener("keyup", up)
    window.addEventListener("blur", blur)
    unlockAudio()
    return () => {
      window.removeEventListener("keydown", down)
      window.removeEventListener("keyup", up)
      window.removeEventListener("blur", blur)
    }
  }, [input])

  const onHud = useCallback(
    (h: Hud) => {
      setHud(h)
      setInstr(scenario.instruction(car))
      setPaused(paused.current)
      if (scenario.faults.length !== faults.length) setFaults([...scenario.faults])
    },
    [scenario, car, faults.length],
  )
  const onToast = useCallback((t: string) => {
    setToast(t)
    setTimeout(() => setToast(undefined), 1800)
  }, [])
  const cmd = (c: Command) => {
    unlockAudio()
    input.push(c)
  }

  const recent = faults.slice(-4).reverse()
  const done = hud && (hud.status === "passed" || hud.status === "failed")

  return (
    <Shell>
      <div className="relative flex-1 overflow-hidden" onPointerDown={unlockAudio}>
        <Canvas dpr={[1, 1.75]} camera={{ fov: 60, near: 0.1, far: 900, position: [0, 5, -18] }}>
          <color attach="background" args={["#cfe3f5"]} />
          <fog attach="fog" args={["#cfe3f5", 140, 520]} />
          <hemisphereLight args={["#ffffff", "#5d6b4f", 1.1]} />
          <directionalLight position={[60, 120, 40]} intensity={1.6} />
          {mode === "yard" ? <YardMesh exam={scRef as React.RefObject<YardExam>} /> : <CityMesh city={scRef as React.RefObject<CityDrive>} />}
          <CarMesh car={carRef} interior={hud?.camera === "first"} />
          <SimLoop car={carRef} scenario={scRef} input={input} camera={camera} paused={paused} onHud={onHud} onToast={onToast} />
        </Canvas>

        {/* Thanh trên */}
        <div className="pointer-events-none absolute inset-x-0 top-0 flex items-start justify-between gap-2 p-2 sm:p-3">
          <div className="pointer-events-auto flex gap-1.5">
            <Button size="sm" variant="secondary" className="shadow" onClick={onMenu}>
              <ArrowLeft /> <span className="hidden sm:inline">Chọn bài</span>
            </Button>
            <Button size="sm" variant="secondary" className="shadow" onClick={() => cmd("camera")} title="Đổi góc nhìn (C)">
              <Camera /> <span className="hidden sm:inline">{hud ? CAMERA_LABEL[hud.camera] : ""}</span>
            </Button>
            <Button size="icon" variant="secondary" className="size-8 shadow" onClick={() => cmd("pause")} title="Tạm dừng (Esc)">
              {isPaused ? <Play /> : <Pause />}
            </Button>
          </div>
          <div className="flex items-start gap-2">
            {hud && (
              <div className="rounded-xl bg-black/65 px-3 py-1.5 text-right text-white backdrop-blur">
                <div className={cn("text-2xl font-extrabold tabular-nums", hud.score < PASS_SCORE ? "text-red-400" : "text-emerald-300")}>{hud.score}</div>
                <div className="text-[0.7rem] tabular-nums opacity-80">
                  {fmt(hud.time)} / {fmt(scenario.timeLimit)}
                </div>
              </div>
            )}
            <Minimap shapes={scenario.shapes} hud={hud} city={mode === "city" ? (scenario as CityDrive) : undefined} />
          </div>
        </div>

        {/* Hướng dẫn bài đang làm + lỗi gần nhất */}
        {instr && (
          <div className="pointer-events-none absolute top-14 left-2 w-[min(92vw,380px)] space-y-2 sm:left-3">
            <div className={cn("rounded-xl p-3 text-white shadow-lg backdrop-blur", hud && scenario.alarm ? "animate-pulse bg-red-600/90" : "bg-black/65")}>
              <div className="text-sm font-bold">{instr.title}</div>
              {instr.detail && <div className="mt-1 text-xs leading-relaxed opacity-90">{instr.detail}</div>}
              {instr.toLine !== undefined && instr.toLine > -2 && instr.toLine < 12 && <LineMeter d={instr.toLine} />}
            </div>
            {recent.map((f, i) => (
              <div key={f.t + f.text} className={cn("rounded-lg px-3 py-1.5 text-xs text-white shadow", f.fatal ? "bg-red-700/90" : "bg-amber-600/85", i > 0 && "opacity-70")}>
                <b>{f.fatal ? "Đình chỉ" : `−${f.points}`}</b> · {f.text}
              </div>
            ))}
          </div>
        )}

        {toast && (
          <div className="pointer-events-none absolute top-1/3 left-1/2 -translate-x-1/2 rounded-xl bg-black/75 px-4 py-2 text-sm text-white">{toast}</div>
        )}

        {hud && <Dash hud={hud} />}
        <TouchControls input={input} cmd={cmd} />

        {hud?.status === "ready" && (
          <div className="absolute inset-x-0 bottom-36 flex justify-center px-4 sm:bottom-28">
            <Button size="lg" className="h-12 px-6 text-base shadow-xl" onClick={() => cmd("begin")}>
              Nhận lệnh xuất phát <kbd className="ml-1 rounded bg-white/20 px-1.5 text-xs">Enter</kbd>
            </Button>
          </div>
        )}

        {isPaused && !done && (
          <div className="absolute inset-0 flex items-center justify-center bg-black/40">
            <Card className="w-72 text-center">
              <CardHeader>
                <CardTitle>Tạm dừng</CardTitle>
              </CardHeader>
              <CardContent className="grid gap-2">
                <Button onClick={() => cmd("pause")}>
                  <Play /> Tiếp tục
                </Button>
                <Button variant="outline" onClick={onRestart}>
                  <RotateCcw /> Làm lại từ đầu
                </Button>
                <Button variant="ghost" onClick={onMenu}>
                  Chọn bài khác
                </Button>
              </CardContent>
            </Card>
          </div>
        )}

        {done && <Result passed={hud.status === "passed"} score={hud.score} faults={scenario.faults} time={hud.time} onRestart={onRestart} onMenu={onMenu} />}
      </div>
    </Shell>
  )
}

const fmt = (s: number) => `${String(Math.floor(s / 60)).padStart(2, "0")}:${String(Math.floor(s % 60)).padStart(2, "0")}`

function LineMeter({ d }: { d: number }) {
  const ok = d >= 0 && d <= 0.5
  const pct = Math.max(0, Math.min(1, 1 - d / 6)) * 100
  return (
    <div className="mt-2">
      <div className="flex justify-between text-[0.7rem]">
        <span>Cản trước → vạch</span>
        <b className={cn("tabular-nums", ok ? "text-emerald-300" : d < 0 ? "text-red-300" : "")}>
          {d < 0 ? `quá ${(-d).toFixed(2)} m` : `${d.toFixed(2)} m`}
        </b>
      </div>
      <div className="relative mt-1 h-1.5 rounded-full bg-white/20">
        <div className={cn("absolute inset-y-0 left-0 rounded-full", ok ? "bg-emerald-400" : "bg-white")} style={{ width: `${pct}%` }} />
        <div className="absolute -inset-y-1 w-0.5 bg-emerald-300" style={{ left: `${(1 - 0.5 / 6) * 100}%` }} />
      </div>
    </div>
  )
}

function Dash({ hud }: { hud: Hud }) {
  const blink = Math.floor(Date.now() / 380) % 2 === 0
  const rpmPct = Math.min(1, hud.rpm / 6000)
  return (
    <div className="pointer-events-none absolute bottom-2 left-1/2 flex -translate-x-1/2 items-center gap-3 rounded-2xl bg-black/70 px-4 py-2 text-white shadow-xl backdrop-blur sm:bottom-3 sm:gap-5 sm:px-6">
      <span className={cn("text-2xl transition", (hud.signal === "left" || hud.hazard) && blink ? "text-emerald-400" : "text-white/20")}>◀</span>
      <div className="text-center">
        <div className={cn("text-4xl leading-none font-extrabold tabular-nums", hud.kmh > 24.5 && "text-amber-300")}>{Math.round(hud.kmh)}</div>
        <div className="text-[0.65rem] opacity-70">km/h</div>
      </div>
      <div className="flex flex-col items-center gap-1">
        <div className="flex gap-1 text-sm font-bold">
          {(["P", "R", "N", "D"] as const).map((g) => (
            <span key={g} className={cn("rounded px-1.5", hud.gear === g ? "bg-white text-black" : "text-white/40")}>
              {g}
            </span>
          ))}
        </div>
        <div className="h-1.5 w-24 overflow-hidden rounded-full bg-white/15">
          <div className={cn("h-full", hud.rpm > 4000 ? "bg-red-500" : "bg-sky-400")} style={{ width: `${rpmPct * 100}%` }} />
        </div>
        <div className="text-[0.6rem] tabular-nums opacity-70">{Math.round(hud.rpm)} v/ph</div>
      </div>
      <div className="flex flex-col gap-0.5 text-[0.65rem] font-semibold">
        <span className={hud.seatbelt ? "text-emerald-400" : "text-red-400"}>{hud.seatbelt ? "✓ Dây an toàn" : "✕ Dây an toàn"}</span>
        <span className={hud.handbrake ? "text-red-400" : "text-white/40"}>(P) Phanh tay</span>
        <span className={hud.hazard && blink ? "text-red-400" : "text-white/40"}>⚠ Khẩn cấp</span>
      </div>
      <span className={cn("text-2xl transition", (hud.signal === "right" || hud.hazard) && blink ? "text-emerald-400" : "text-white/20")}>▶</span>
    </div>
  )
}

function Minimap({ shapes, hud, city }: { shapes: Shape[]; hud?: Hud; city?: CityDrive }) {
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
    const pad = 8
    return { x0: x0 - pad, x1: x1 + pad, z0: z0 - pad, z1: z1 + pad }
  }, [shapes])
  useEffect(() => {
    const c = ref.current
    if (!c || !hud) return
    const g = c.getContext("2d")!
    const W = c.width, H = c.height
    const k = Math.min(W / (base.x1 - base.x0), H / (base.z1 - base.z0))
    // Bắc ở trên: x tăng → sang trái (vì bên trái là +x khi nhìn về +z)
    const px = (x: number) => W / 2 - (x - (base.x0 + base.x1) / 2) * k
    const pz = (z: number) => H / 2 - (z - (base.z0 + base.z1) / 2) * k
    g.clearRect(0, 0, W, H)
    g.fillStyle = "rgba(0,0,0,0.55)"
    g.fillRect(0, 0, W, H)
    g.fillStyle = "#9ca3af"
    g.strokeStyle = "#9ca3af"
    for (const s of shapes) {
      if (s.kind === "poly") {
        g.beginPath()
        s.pts.forEach((p, i) => (i ? g.lineTo(px(p.x), pz(p.z)) : g.moveTo(px(p.x), pz(p.z))))
        g.closePath()
        g.fill()
      } else {
        g.lineWidth = Math.max(1.5, s.width * k)
        g.lineCap = "round"
        g.beginPath()
        s.pts.forEach((p, i) => (i ? g.lineTo(px(p.x), pz(p.z)) : g.moveTo(px(p.x), pz(p.z))))
        g.stroke()
      }
    }
    if (city) {
      g.fillStyle = "#fbbf24"
      for (const n of city.npcs) g.fillRect(px(n.pos.x) - 1.5, pz(n.pos.z) - 1.5, 3, 3)
    }
    // Xe thí sinh
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
  return <canvas ref={ref} width={150} height={150} className="hidden rounded-xl shadow sm:block" />
}

function TouchControls({ input, cmd }: { input: Input; cmd: (c: Command) => void }) {
  const [coarse] = useState(() => typeof window !== "undefined" && window.matchMedia("(pointer: coarse)").matches)
  if (!coarse) return null
  const hold = (key: "throttle" | "brake" | "steerL" | "steerR") => ({
    onPointerDown: (e: React.PointerEvent) => {
      ;(e.target as HTMLElement).setPointerCapture(e.pointerId)
      if (key === "throttle") input.touch.throttle = 1
      else if (key === "brake") input.touch.brake = 1
      else input.touch.steer = key === "steerL" ? 1 : -1
    },
    onPointerUp: () => {
      if (key === "throttle") input.touch.throttle = 0
      else if (key === "brake") input.touch.brake = 0
      else input.touch.steer = 0
    },
    onPointerCancel: () => {
      input.touch = { throttle: 0, brake: 0, steer: 0 }
    },
  })
  const pad = "flex select-none items-center justify-center rounded-2xl bg-black/55 font-bold text-white active:bg-black/80 touch-none"
  return (
    <>
      <div className="absolute bottom-24 left-3 flex gap-2">
        <button className={cn(pad, "size-16 text-2xl")} {...hold("steerL")}>
          ◀
        </button>
        <button className={cn(pad, "size-16 text-2xl")} {...hold("steerR")}>
          ▶
        </button>
      </div>
      <div className="absolute right-3 bottom-24 flex items-end gap-2">
        <button className={cn(pad, "h-16 w-14 text-sm")} {...hold("brake")}>
          Phanh
        </button>
        <button className={cn(pad, "h-20 w-14 text-sm")} {...hold("throttle")}>
          Ga
        </button>
      </div>
      <div className="absolute top-14 right-2 flex flex-col gap-1.5">
        {(
          [
            ["P", "gearP"],
            ["R", "gearR"],
            ["N", "gearN"],
            ["D", "gearD"],
            ["◀", "signalLeft"],
            ["▶", "signalRight"],
            ["⚠", "hazard"],
            ["Dây", "seatbelt"],
            ["Tay", "handbrake"],
          ] as [string, Command][]
        ).map(([l, c]) => (
          <button key={c} className={cn(pad, "h-9 w-11 text-xs")} onClick={() => cmd(c)}>
            {l}
          </button>
        ))}
      </div>
    </>
  )
}

function Result({ passed, score, faults, time, onRestart, onMenu }: { passed: boolean; score: number; faults: Fault[]; time: number; onRestart: () => void; onMenu: () => void }) {
  return (
    <div className="absolute inset-0 flex items-center justify-center bg-black/45 p-4">
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
