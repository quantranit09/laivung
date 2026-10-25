import { useEffect, useRef } from "react"
import { useFrame, useThree } from "@react-three/fiber"
import * as THREE from "three"
import type { Car, Controls } from "@/sim/car"
import { add, clamp, dir, leftOf, mul, wrapAngle } from "@/sim/geom"
import type { Input } from "@/sim/input"
import type { Scenario } from "@/sim/scenario"
import { play, stopEngineSound, tick, updateEngineSound } from "@/sim/audio"
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
  throttle: number
  brake: number
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
  sound: boolean
  onHud: (h: Hud) => void
  onToast: (text: string) => void
}

/** Vòng lặp mô phỏng: đọc điều khiển, chạy vật lý + luật chấm điểm, cập nhật camera và HUD. */
export function SimLoop({ car: carRef, scenario: scRef, input, camera: camRef, paused, sound, onHud, onToast }: SimHandles) {
  const { camera } = useThree()
  const hudAcc = useRef(0)
  const blinkAcc = useRef(0)
  const warnAcc = useRef(0)
  const look = useRef(0)
  const steerPeak = useRef(0)
  const chaseYaw = useRef<number | null>(null)
  const cam = camera as THREE.PerspectiveCamera

  useEffect(() => () => stopEngineSound(), [])

  useFrame((_, delta) => {
    const car = carRef.current
    const sc = scRef.current
    const spec = car.spec
    const dt = Math.min(delta, 1 / 20)

    let ctl: Controls = input.read(dt)
    // Thao tác như xe thật: chuyển số và khởi động phải đạp phanh.
    const brakeHeld = ctl.brake > 0.3
    for (const c of input.drain()) {
      switch (c) {
        case "gearP":
        case "gearR":
        case "gearN":
        case "gearD": {
          const g = c.slice(4) as Car["gear"]
          if (g === car.gear) break
          if (!car.engine && g !== "P" && g !== "N") onToast(spec.ev ? "Bật xe (READY) trước khi vào số" : "Khởi động máy trước khi vào số")
          else if (Math.abs(car.speed) > 0.3 && g !== "N") onToast("Dừng hẳn xe trước khi chuyển số")
          else if (!brakeHeld && g !== "N") onToast("Đạp phanh (giữ S) khi chuyển số")
          else car.shift(g)
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
          // Phanh tay điện tử: nhả phải đạp phanh chân; kéo thì lúc nào cũng được.
          if (car.handbrake && !brakeHeld) onToast("Đạp phanh (giữ S) để nhả phanh tay")
          else car.handbrake = !car.handbrake
          break
        case "engine":
          if (car.engine && Math.abs(car.speed) > 0.3) onToast("Dừng xe trước khi tắt máy")
          else if (car.engine && car.gear !== "P") onToast("Về số P trước khi tắt máy")
          else if (!car.engine && !brakeHeld) onToast(spec.ev ? "Đạp phanh (giữ S) rồi bấm nút để bật xe" : "Đạp phanh (giữ S) rồi khởi động máy")
          else if (!car.engine && car.gear !== "P" && car.gear !== "N") onToast("Về số P hoặc N để khởi động")
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
    if (paused.current) {
      updateEngineSound({ enabled: false, ev: spec.ev, rpm: car.rpm, throttle: 0, kmh: car.kmh })
      return
    }

    const pedals = { throttle: ctl.throttle, brake: ctl.brake }
    if (sc.status !== "running") ctl = { throttle: 0, brake: sc.status === "ready" ? 1 : 0.6, steer: ctl.steer }
    car.step(dt, ctl, (p) => sc.heightAt(p))
    updateEngineSound({ enabled: sound && car.engine, ev: spec.ev, rpm: car.rpm, throttle: pedals.throttle, kmh: car.kmh })
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
    // Cảnh báo như xe thật: đạp ga khi còn phanh tay, chạy khi chưa thắt dây an toàn.
    warnAcc.current += dt
    if (warnAcc.current > 2.5) {
      if (car.handbrake && ctl.throttle > 0.3 && (car.gear === "D" || car.gear === "R")) {
        warnAcc.current = 0
        onToast("Phanh tay đang kéo — nhả phanh tay (đạp phanh + Space)")
        play("beep")
      } else if (!car.seatbelt && car.kmh > 8) {
        warnAcc.current = 0
        play("beep")
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
      // Mắt người lái: ghế trái, sau trục trước ~1,6 m (tư thế ngồi SUV), cách vô lăng ~0,55 m
      const head = add(add(car.pos, mul(f, spec.wheelbase - 1.6)), mul(leftOf(f), 0.36))
      const y = car.y + spec.eye + Math.sin(car.pitch) * (spec.wheelbase - 1.6)
      cam.position.set(head.x, y, head.z)
      const ld = dir(car.heading + look.current)
      cam.lookAt(head.x + ld.x * 10, y - 0.6 + Math.tan(car.pitch) * 10, head.z + ld.z * 10)
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
        throttle: pedals.throttle,
        brake: pedals.brake,
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
/** Ô camera lùi ở góc phải: dưới thanh trên, tránh cần số/bàn đạp ở đáy màn hình. */
export function rearInset(w: number, h: number) {
  // Điện thoại dọc: thanh trên chiếm 2 hàng
  if (w < 640) {
    const width = Math.round(w * 0.42)
    return { width, height: Math.round((width * 9) / 16), top: 116, right: 8 }
  }
  // Điện thoại ngang: thấp, đặt sát thanh trên
  if (h < 500) {
    const width = Math.round(Math.min(240, w * 0.28))
    return { width, height: Math.round((width * 9) / 16), top: 64, right: 12 }
  }
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
  const targets = [mk(192, 120), mk(192, 120), mk(320, 96)]
  return { targets, textures: { left: targets[0].texture, right: targets[1].texture, center: targets[2].texture } }
}

/**
 * Tự dựng khung hình: vẽ 3 gương chiếu hậu (khi ngồi ghế lái), cảnh chính,
 * rồi ô camera lùi khi vào số R. Ánh nắng + bóng đổ bám theo xe.
 */
export function Renderer({
  car: carRef,
  camera: camRef,
  mirrors,
  post,
  shadowSize,
}: {
  car: React.RefObject<Car>
  camera: React.RefObject<CameraMode>
  mirrors: THREE.WebGLRenderTarget[] | null
  /** Có EffectComposer vẽ cảnh chính (ưu tiên 2) hay không */
  post: boolean
  shadowSize: number
}) {
  const sun = useRef<THREE.DirectionalLight>(null)
  const cams = useRef<THREE.PerspectiveCamera[]>([
    new THREE.PerspectiveCamera(30, 1.6, 0.2, 400),
    new THREE.PerspectiveCamera(30, 1.6, 0.2, 400),
    new THREE.PerspectiveCamera(40, 3.4, 0.2, 400),
    new THREE.PerspectiveCamera(80, 16 / 9, 0.05, 200),
  ])
  const frame = useRef(0)

  const place = (car: Car, along: number, side: number, y: number, lookBackYaw: number, pitch: number, cam: THREE.PerspectiveCamera) => {
    const f = dir(car.heading)
    const p = add(add(car.pos, mul(f, along)), mul(leftOf(f), side))
    cam.position.set(p.x, car.y + y, p.z)
    const back = dir(car.heading + Math.PI + lookBackYaw)
    cam.lookAt(p.x + back.x * 10, car.y + y + pitch * 10, p.z + back.z * 10)
  }

  const renderRear = (gl: THREE.WebGLRenderer, scene: THREE.Scene, size: { width: number; height: number }) => {
    const car = carRef.current
    if (car.gear !== "R") return
    const rear = cams.current[3]
    place(car, -car.spec.rearOverhang - 0.05, 0, 0.95, 0, -0.35, rear)
    const r = rearInset(size.width, size.height)
    rear.aspect = r.width / r.height
    rear.updateProjectionMatrix()
    const x = size.width - r.right - r.width
    const y = size.height - r.top - r.height
    gl.setScissorTest(true)
    gl.setScissor(x, y, r.width, r.height)
    gl.setViewport(x, y, r.width, r.height)
    gl.render(scene, rear)
    gl.setScissorTest(false)
    gl.setViewport(0, 0, size.width, size.height)
  }

  // Ưu tiên 1: nắng bám xe, vẽ gương; nếu không có hậu kỳ thì tự vẽ cảnh chính + camera lùi.
  useFrame(({ gl, scene, camera, size }) => {
    const car = carRef.current
    const spec = car.spec
    const f = dir(car.heading)
    if (sun.current) {
      const c = add(car.pos, mul(f, spec.wheelbase / 2))
      sun.current.position.set(c.x + 40, 70, c.z + 25)
      sun.current.target.position.set(c.x, 0, c.z)
      sun.current.target.updateMatrixWorld()
    }
    const [cl, cr, cc] = cams.current
    if (mirrors && camRef.current === "first" && frame.current++ % 2 === 0) {
      place(car, 2.0, spec.width / 2 + 0.12, 1.12, -0.18, -0.03, cl)
      place(car, 2.0, -spec.width / 2 - 0.12, 1.12, 0.18, -0.03, cr)
      place(car, -spec.rearOverhang + 0.3, 0, spec.height - 0.05, 0, -0.04, cc)
      ;[cl, cr, cc].forEach((c, i) => {
        gl.setRenderTarget(mirrors[i])
        gl.render(scene, c)
      })
      gl.setRenderTarget(null)
    }
    if (!post) {
      gl.render(scene, camera)
      renderRear(gl, scene, size)
    }
  }, 1)

  // Ưu tiên 3: sau khi EffectComposer vẽ xong (ưu tiên 2) thì chèn camera lùi.
  useFrame(({ gl, scene, size }) => {
    if (post) renderRear(gl, scene, size)
  }, 3)

  return (
    <directionalLight
      ref={sun}
      intensity={2.4}
      castShadow
      shadow-mapSize={[shadowSize, shadowSize]}
      shadow-camera-left={-12}
      shadow-camera-right={12}
      shadow-camera-top={12}
      shadow-camera-bottom={-12}
      shadow-camera-near={10}
      shadow-camera-far={160}
      shadow-bias={-0.0004}
    />
  )
}
