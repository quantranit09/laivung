import { useRef } from "react"
import { useFrame, useThree } from "@react-three/fiber"
import * as THREE from "three"
import type { Car, Controls } from "@/sim/car"
import { add, clamp, dir, leftOf, mul, wrapAngle } from "@/sim/geom"
import type { Input } from "@/sim/input"
import type { Scenario } from "@/sim/scenario"
import { play, tick } from "@/sim/audio"
import type { MirrorTextures } from "./CarModel"

export type CameraMode = "first" | "chase" | "high" | "top"
export const CAMERA_LABEL: Record<CameraMode, string> = {
  first: "Ghế lái",
  chase: "Sau xe",
  high: "Trên cao",
  top: "Từ trên xuống",
}
export const CAMERA_ORDER: CameraMode[] = ["first", "chase", "high", "top"]

export interface Hud {
  kmh: number
  rpm: number
  power: number
  ev: boolean
  engine: boolean
  gear: Car["gear"]
  steer: number
  signal: Car["signal"]
  hazard: boolean
  seatbelt: boolean
  handbrake: boolean
  braking: boolean
  status: Scenario["status"]
  time: number
  score: number
  faultCount: number
  camera: CameraMode
  x: number
  z: number
  heading: number
}

export interface SimHandles {
  car: React.RefObject<Car>
  scenario: React.RefObject<Scenario>
  input: Input
  camera: React.RefObject<CameraMode>
  paused: React.RefObject<boolean>
  onHud: (h: Hud) => void
  onToast: (text: string) => void
}

/** Vòng lặp mô phỏng: đọc điều khiển, chạy vật lý + luật chấm điểm, cập nhật camera và HUD. */
export function SimLoop({ car: carRef, scenario: scRef, input, camera: camRef, paused, onHud, onToast }: SimHandles) {
  const { camera } = useThree()
  const hudAcc = useRef(0)
  const blinkAcc = useRef(0)
  const look = useRef(0)
  const steerPeak = useRef(0)
  const chaseYaw = useRef<number | null>(null)
  const cam = camera as THREE.PerspectiveCamera

  useFrame((_, delta) => {
    const car = carRef.current
    const sc = scRef.current
    const spec = car.spec
    const dt = Math.min(delta, 1 / 20)

    for (const c of input.drain()) {
      switch (c) {
        case "gearP":
        case "gearR":
        case "gearN":
        case "gearD": {
          const g = c.slice(4) as Car["gear"]
          if (!car.shift(g)) onToast("Dừng hẳn xe trước khi chuyển số")
          break
        }
        case "signalLeft":
          car.signal = car.signal === "left" ? "none" : "left"
          steerPeak.current = 0
          break
        case "signalRight":
          car.signal = car.signal === "right" ? "none" : "right"
          steerPeak.current = 0
          break
        case "hazard":
          car.hazard = !car.hazard
          break
        case "seatbelt":
          car.seatbelt = !car.seatbelt
          break
        case "handbrake":
          car.handbrake = !car.handbrake
          break
        case "engine":
          if (car.engine && Math.abs(car.speed) > 0.3) onToast("Dừng xe trước khi tắt máy")
          else car.engine = !car.engine
          break
        case "camera": {
          const i = CAMERA_ORDER.indexOf(camRef.current)
          camRef.current = CAMERA_ORDER[(i + 1) % CAMERA_ORDER.length]
          break
        }
        case "begin":
          if (sc.status !== "ready") break
          if (!car.engine) onToast(spec.ev ? "Bật xe (READY) trước khi nhận lệnh" : "Khởi động động cơ trước khi nhận lệnh")
          else sc.begin(car)
          break
        case "pause":
          paused.current = !paused.current
          break
      }
    }
    if (paused.current) return

    let ctl: Controls = input.read(dt)
    if (sc.status !== "running") ctl = { throttle: 0, brake: sc.status === "ready" ? 1 : 0.6, steer: ctl.steer }
    car.step(dt, ctl, (p) => sc.heightAt(p))
    sc.update(dt, car, ctl)
    for (const s of sc.drainSounds()) play(s)

    // Xi nhan tự tắt sau khi đánh lái về như xe thật.
    if (car.signal !== "none") {
      const want = car.signal === "left" ? 1 : -1
      const s = (car.steer / spec.maxSteer) * want
      steerPeak.current = Math.max(steerPeak.current, s)
      if (steerPeak.current > 0.45 && s < 0.08) {
        car.signal = "none"
        steerPeak.current = 0
      }
    }
    if (car.signal !== "none" || car.hazard) {
      blinkAcc.current += dt
      if (blinkAcc.current > 0.38) {
        blinkAcc.current = 0
        tick()
      }
    }

    // ---- Camera ----
    const mode = camRef.current
    const f = dir(car.heading)
    look.current += (input.look * 1.3 - look.current) * Math.min(1, dt * 6)
    const center = add(car.pos, mul(f, spec.wheelbase / 2))
    const setFov = (fov: number) => {
      if (cam.fov !== fov) {
        cam.fov = fov
        cam.updateProjectionMatrix()
      }
    }
    // Hướng camera bám theo xe có độ trễ — khi vào cua thấy thân xe xoay như camera quay thật.
    if (chaseYaw.current === null) chaseYaw.current = car.heading
    chaseYaw.current += wrapAngle(car.heading - chaseYaw.current) * clamp(dt * 3.2, 0, 1)
    if (mode === "first") {
      cam.up.set(0, 1, 0)
      // Mắt người lái: ghế trái, sau trục trước ~1,45 m, cách vô lăng ~0,57 m
      const head = add(add(car.pos, mul(f, spec.wheelbase - 1.45)), mul(leftOf(f), 0.36))
      const y = car.y + spec.eye + Math.sin(car.pitch) * (spec.wheelbase - 1.45)
      cam.position.set(head.x, y, head.z)
      const ld = dir(car.heading + look.current)
      cam.lookAt(head.x + ld.x * 10, y - 0.75 + Math.tan(car.pitch) * 10, head.z + ld.z * 10)
      setFov(66)
      chaseYaw.current = car.heading
    } else if (mode === "chase" || mode === "high") {
      cam.up.set(0, 1, 0)
      const ld = dir(chaseYaw.current + look.current * 2)
      const [back, up, ahead] = mode === "chase" ? [6.4, 2.3, 3] : [11, 9, 6]
      const want = new THREE.Vector3(center.x - ld.x * back, car.y + up, center.z - ld.z * back)
      cam.position.lerp(want, 1 - Math.exp(-dt * 6))
      cam.position.y = Math.max(cam.position.y, sc.heightAt({ x: cam.position.x, z: cam.position.z }) + 0.6)
      const fl = dir(chaseYaw.current)
      cam.lookAt(center.x + fl.x * ahead, car.y + (mode === "chase" ? 1.1 : 0), center.z + fl.z * ahead)
      setFov(mode === "chase" ? 58 : 50)
    } else {
      cam.position.set(center.x, car.y + 24, center.z)
      cam.up.set(f.x, 0, f.z)
      cam.lookAt(center.x, car.y, center.z)
      setFov(50)
    }

    hudAcc.current += dt
    if (hudAcc.current > 0.1) {
      hudAcc.current = 0
      onHud({
        kmh: car.kmh,
        rpm: car.rpm,
        power: car.power,
        ev: spec.ev,
        engine: car.engine,
        gear: car.gear,
        steer: car.steer / spec.maxSteer,
        signal: car.signal,
        hazard: car.hazard,
        seatbelt: car.seatbelt,
        handbrake: car.handbrake,
        braking: car.braking,
        status: sc.status,
        time: sc.time,
        score: sc.score,
        faultCount: sc.faults.length,
        camera: mode,
        x: car.pos.x,
        z: car.pos.z,
        heading: wrapAngle(car.heading),
      })
    }
  })
  return null
}

/** Ô camera lùi (góc trên bên phải, dưới bản đồ nhỏ) — dùng chung cho WebGL và lớp vạch dẫn HTML. */
export function rearInset(w: number) {
  const width = Math.round(Math.min(340, w * 0.32))
  return { width, height: Math.round((width * 9) / 16), top: 236, right: 12 }
}

export function makeMirrors(): { targets: THREE.WebGLRenderTarget[]; textures: MirrorTextures } {
  const mk = (w: number, h: number) => {
    const t = new THREE.WebGLRenderTarget(w, h, { colorSpace: THREE.SRGBColorSpace })
    // Gương: lật ngang ảnh
    t.texture.wrapS = THREE.RepeatWrapping
    t.texture.repeat.x = -1
    t.texture.offset.x = 1
    return t
  }
  const targets = [mk(256, 160), mk(256, 160), mk(384, 112)]
  return { targets, textures: { left: targets[0].texture, right: targets[1].texture, center: targets[2].texture } }
}

/**
 * Tự dựng khung hình: vẽ 3 gương chiếu hậu (khi ngồi ghế lái), cảnh chính,
 * rồi ô camera lùi khi vào số R. Ánh nắng + bóng đổ bám theo xe.
 */
export function Renderer({ car: carRef, camera: camRef, mirrors }: { car: React.RefObject<Car>; camera: React.RefObject<CameraMode>; mirrors: THREE.WebGLRenderTarget[] }) {
  const sun = useRef<THREE.DirectionalLight>(null)
  const cams = useRef<THREE.PerspectiveCamera[]>([
    new THREE.PerspectiveCamera(30, 1.6, 0.2, 400),
    new THREE.PerspectiveCamera(30, 1.6, 0.2, 400),
    new THREE.PerspectiveCamera(40, 3.4, 0.2, 400),
    new THREE.PerspectiveCamera(80, 16 / 9, 0.05, 200),
  ])
  const frame = useRef(0)

  useFrame(({ gl, scene, camera, size }) => {
    const car = carRef.current
    const spec = car.spec
    const f = dir(car.heading)
    const l = leftOf(f)
    const at = (along: number, side: number, y: number, lookBackYaw: number, pitch: number, cam: THREE.PerspectiveCamera) => {
      const p = add(add(car.pos, mul(f, along)), mul(l, side))
      cam.position.set(p.x, car.y + y, p.z)
      const back = dir(car.heading + Math.PI + lookBackYaw)
      cam.lookAt(p.x + back.x * 10, car.y + y + pitch * 10, p.z + back.z * 10)
    }
    if (sun.current) {
      const c = add(car.pos, mul(f, spec.wheelbase / 2))
      sun.current.position.set(c.x + 40, 70, c.z + 25)
      sun.current.target.position.set(c.x, 0, c.z)
      sun.current.target.updateMatrixWorld()
    }

    const [cl, cr, cc, rear] = cams.current
    const first = camRef.current === "first"
    if (first && frame.current++ % 2 === 0) {
      at(2.0, spec.width / 2 + 0.12, 1.12, -0.18, -0.03, cl)
      at(2.0, -spec.width / 2 - 0.12, 1.12, 0.18, -0.03, cr)
      at(-spec.rearOverhang + 0.3, 0, spec.height - 0.05, 0, -0.04, cc)
      ;[cl, cr, cc].forEach((c, i) => {
        gl.setRenderTarget(mirrors[i])
        gl.render(scene, c)
      })
      gl.setRenderTarget(null)
    }

    gl.render(scene, camera)

    if (car.gear === "R") {
      at(-spec.rearOverhang - 0.05, 0, 0.95, 0, -0.35, rear)
      const r = rearInset(size.width)
      const dpr = gl.getPixelRatio()
      const x = (size.width - r.right - r.width) * dpr
      const y = (size.height - r.top - r.height) * dpr
      rear.aspect = r.width / r.height
      rear.updateProjectionMatrix()
      gl.setScissorTest(true)
      gl.setScissor(x / dpr, y / dpr, r.width, r.height)
      gl.setViewport(x / dpr, y / dpr, r.width, r.height)
      gl.render(scene, rear)
      gl.setScissorTest(false)
      gl.setViewport(0, 0, size.width, size.height)
    }
  }, 1)

  return (
    <directionalLight
      ref={sun}
      intensity={2.4}
      castShadow
      shadow-mapSize={[2048, 2048]}
      shadow-camera-left={-28}
      shadow-camera-right={28}
      shadow-camera-top={28}
      shadow-camera-bottom={-28}
      shadow-camera-near={10}
      shadow-camera-far={160}
      shadow-bias={-0.0004}
    />
  )
}
