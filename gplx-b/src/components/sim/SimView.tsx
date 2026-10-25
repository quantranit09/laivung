import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { Canvas } from "@react-three/fiber"
import { Environment, Lightformer, Sky } from "@react-three/drei"
import * as THREE from "three"
import { ArrowLeft, CircleParking, Keyboard, Pause, Play, RotateCcw, ShieldAlert } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Car, CARS } from "@/sim/car"
import { CityDrive } from "@/sim/city"
import { Input, KEY_HELP, type Command } from "@/sim/input"
import { unlockAudio } from "@/sim/audio"
import type { Fault, Instruction, Scenario } from "@/sim/scenario"
import { YardExam } from "@/sim/yard"
import { cn } from "@/lib/utils"
import { CarModel } from "./CarModel"
import { CityMesh } from "./CityMesh"
import { ControlDock } from "./Controls"
import { glass, InstructionPanel, Minimap, RearCamFrame, Result, TopBar } from "./Hud"
import { useSimPrefs } from "./prefs"
import { SimSettings } from "./SimSettings"
import { YardMesh } from "./YardMesh"
import { makeMirrors, Renderer, SimLoop, type CameraMode, type Hud } from "./World"

type Mode = "yard" | "city"

export default function SimView({ onExit }: { onExit: () => void }) {
  const [mode, setMode] = useState<Mode>()
  const [run, setRun] = useState(0)
  const [prefs, setPrefs] = useSimPrefs()
  if (!mode) return <Menu onPick={setMode} onExit={onExit} />
  return (
    <Drive
      key={`${mode}-${run}-${prefs.car}`}
      mode={mode}
      prefs={prefs}
      setPrefs={setPrefs}
      onRestart={() => setRun((r) => r + 1)}
      onMenu={() => setMode(undefined)}
    />
  )
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

export function ModeCard({ icon, title, desc, onClick }: { icon: React.ReactNode; title: string; desc: string; onClick: () => void }) {
  return (
    <button onClick={onClick} className="group rounded-2xl border-2 bg-card p-5 text-left transition hover:border-primary hover:shadow-lg">
      <div className="mb-3 flex size-11 items-center justify-center rounded-xl bg-primary/10 text-primary">{icon}</div>
      <div className="text-lg font-bold">{title}</div>
      <p className="mt-1.5 text-sm text-muted-foreground">{desc}</p>
      <div className="mt-4 text-sm font-semibold text-primary group-hover:underline">Bắt đầu lái →</div>
    </button>
  )
}

function Drive({
  mode,
  prefs,
  setPrefs,
  onRestart,
  onMenu,
}: {
  mode: Mode
  prefs: ReturnType<typeof useSimPrefs>[0]
  setPrefs: ReturnType<typeof useSimPrefs>[1]
  onRestart: () => void
  onMenu: () => void
}) {
  const scenario = useMemo<Scenario>(() => (mode === "yard" ? new YardExam() : new CityDrive()), [mode])
  const car = useMemo(() => {
    const c = new Car(CARS[prefs.car])
    c.reset(scenario.start.pos, scenario.start.heading)
    return c
    // Đổi xe sẽ dựng lại cả màn (key ở trên), không cần phụ thuộc vào prefs.car ở đây
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scenario])
  const carRef = useRef(car)
  const scRef = useRef(scenario)
  const input = useMemo(() => new Input(), [])
  const camera = useRef<CameraMode>(prefs.camera)
  const paused = useRef(false)
  const mirrors = useMemo(() => makeMirrors(), [])
  const box = useRef<HTMLDivElement>(null)
  const drag = useRef<number | null>(null)
  const [hud, setHud] = useState<Hud>()
  const [instr, setInstr] = useState<Instruction>()
  const [faults, setFaults] = useState<Fault[]>([])
  const [toast, setToast] = useState<string>()
  const [isPaused, setPaused] = useState(false)
  const [width, setWidth] = useState(() => window.innerWidth)

  useEffect(() => () => mirrors.targets.forEach((t) => t.dispose()), [mirrors])
  useEffect(() => {
    input.sensitivity = prefs.sensitivity
    input.mouseSteer = prefs.mouseSteer ? 0 : null
  }, [input, prefs.sensitivity, prefs.mouseSteer])
  useEffect(() => {
    camera.current = prefs.camera
  }, [prefs.camera])

  // Móc gỡ lỗi khi phát triển: window.__sim.car / .scenario
  useEffect(() => {
    if (import.meta.env.DEV) (window as unknown as { __sim: object }).__sim = { car, scenario }
  }, [car, scenario])

  useEffect(() => {
    const down = (e: KeyboardEvent) => input.onKey(e, true)
    const up = (e: KeyboardEvent) => input.onKey(e, false)
    const blur = () => input.held.clear()
    const resize = () => setWidth(window.innerWidth)
    window.addEventListener("keydown", down)
    window.addEventListener("keyup", up)
    window.addEventListener("blur", blur)
    window.addEventListener("resize", resize)
    unlockAudio()
    return () => {
      window.removeEventListener("keydown", down)
      window.removeEventListener("keyup", up)
      window.removeEventListener("blur", blur)
      window.removeEventListener("resize", resize)
    }
  }, [input])

  const onHud = useCallback(
    (h: Hud) => {
      setHud(h)
      setInstr(scenario.instruction(car))
      setPaused(paused.current)
      // Góc nhìn đổi bằng phím C → lưu lại lựa chọn
      if (h.camera !== prefs.camera) setPrefs({ camera: h.camera })
      if (scenario.faults.length !== faults.length) setFaults([...scenario.faults])
    },
    [scenario, car, faults.length, prefs.camera, setPrefs],
  )
  const onToast = useCallback((t: string) => {
    setToast(t)
    setTimeout(() => setToast(undefined), 1800)
  }, [])
  const cmd = (c: Command) => {
    unlockAudio()
    input.push(c)
  }

  // Chuột trên vùng lái: lái bằng chuột (nếu bật) hoặc kéo để quay đầu nhìn khi ngồi ghế lái
  const onMove = (e: React.PointerEvent) => {
    const r = box.current!.getBoundingClientRect()
    if (prefs.mouseSteer && e.pointerType === "mouse") input.mouseSteer = Math.max(-1, Math.min(1, -(e.clientX - r.left - r.width / 2) / (r.width * 0.32)))
    if (drag.current !== null) input.lookDrag = Math.max(-1.3, Math.min(1.3, -(e.clientX - drag.current) / 260))
  }

  const done = hud && (hud.status === "passed" || hud.status === "failed")
  const shadows = prefs.shadows

  return (
    <Shell>
      <div
        ref={box}
        className="relative flex-1 overflow-hidden select-none"
        onPointerMove={onMove}
        onPointerDown={(e) => {
          unlockAudio()
          if (e.target instanceof HTMLCanvasElement && camera.current === "first") drag.current = e.clientX
        }}
        onPointerUp={() => {
          drag.current = null
          input.lookDrag = 0
        }}
      >
        <Canvas
          shadows={shadows ? "soft" : false}
          dpr={[1, 1.75]}
          gl={{ antialias: true, toneMapping: THREE.ACESFilmicToneMapping, toneMappingExposure: 1.05 }}
          camera={{ fov: 58, near: 0.08, far: 1200, position: [0, 5, -18] }}
        >
          <Sky distance={4500} sunPosition={[120, 60, 80]} turbidity={5} rayleigh={1.1} mieCoefficient={0.004} />
          <fog attach="fog" args={["#dfe9f3", 160, 650]} />
          <hemisphereLight args={["#eef6ff", "#5b6b4c", 0.7]} />
          <Environment resolution={128} frames={1}>
            <Lightformer intensity={2} position={[0, 6, 0]} rotation-x={Math.PI / 2} scale={[20, 20, 1]} />
            <Lightformer intensity={1} position={[-8, 2, 4]} rotation-y={Math.PI / 2} scale={[10, 3, 1]} color="#dbeafe" />
            <Lightformer intensity={1} position={[8, 2, -4]} rotation-y={-Math.PI / 2} scale={[10, 3, 1]} color="#fff7ed" />
          </Environment>
          {mode === "yard" ? <YardMesh exam={scRef as React.RefObject<YardExam>} /> : <CityMesh city={scRef as React.RefObject<CityDrive>} />}
          <CarModel car={carRef} color={prefs.color} interior={hud?.camera === "first"} mirrors={prefs.mirrors ? mirrors.textures : undefined} />
          <SimLoop car={carRef} scenario={scRef} input={input} camera={camera} paused={paused} onHud={onHud} onToast={onToast} />
          <Renderer car={carRef} camera={camera} mirrors={mirrors.targets} />
        </Canvas>

        {/* Thanh trên */}
        <div className="pointer-events-none absolute inset-x-0 top-0 flex items-start justify-between gap-2 p-2 sm:p-3">
          <div className="pointer-events-auto flex min-w-0 items-start gap-2">
            <button className={cn("flex size-11 shrink-0 items-center justify-center rounded-2xl", glass)} onClick={onMenu} title="Chọn bài khác">
              <ArrowLeft className="size-5" />
            </button>
            {hud && (
              <TopBar
                hud={hud}
                timeLimit={scenario.timeLimit}
                speedLimit={scenario.speedLimit}
                title={instr?.title ?? ""}
                progress={scenario.progress()}
                onEngine={() => cmd("engine")}
              />
            )}
          </div>
          <div className="pointer-events-auto flex flex-col items-end gap-2">
            <div className="flex gap-2">
              <button className={cn("flex size-11 items-center justify-center rounded-2xl", glass)} onClick={() => cmd("pause")} title="Tạm dừng (Esc)">
                {isPaused ? <Play className="size-4" /> : <Pause className="size-4" />}
              </button>
              <SimSettings prefs={prefs} set={setPrefs} onRestart={onRestart} onMenu={onMenu} />
            </div>
            <Minimap shapes={scenario.shapes} hud={hud} city={mode === "city" ? (scenario as CityDrive) : undefined} />
          </div>
        </div>

        {instr && (
          <div className="absolute top-16 left-2 sm:top-[4.5rem] sm:left-3">
            <InstructionPanel instr={instr} alarm={scenario.alarm} assist={prefs.assist} faults={faults} />
          </div>
        )}

        {hud?.gear === "R" && <RearCamFrame width={width} steer={hud.steer} />}

        {toast && <div className={cn("pointer-events-none absolute top-1/3 left-1/2 -translate-x-1/2 rounded-2xl px-4 py-2 text-sm", glass)}>{toast}</div>}

        {hud && !done && <ControlDock hud={hud} input={input} cmd={cmd} />}

        {hud?.status === "ready" && (
          <div className="pointer-events-none absolute inset-x-0 top-20 flex justify-center px-4 sm:top-24">
            <button
              className="pointer-events-auto flex items-center gap-2 rounded-2xl bg-sky-500 px-6 py-3 text-base font-bold text-white shadow-2xl shadow-sky-500/30 transition hover:bg-sky-400"
              onClick={() => {
                if (!hud.engine) cmd("engine")
                cmd("begin")
              }}
            >
              Nhận lệnh xuất phát <kbd className="rounded bg-white/20 px-1.5 text-xs">Enter</kbd>
            </button>
          </div>
        )}

        {isPaused && !done && (
          <div className="absolute inset-0 z-20 flex items-center justify-center bg-black/40 backdrop-blur-sm">
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
