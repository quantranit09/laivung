import { useRef } from "react"
import { useFrame, useThree } from "@react-three/fiber"
import * as THREE from "three"
import { CAR, type Car, type Controls } from "@/sim/car"
import { add, dir, leftOf, mul, wrapAngle } from "@/sim/geom"
import type { Input } from "@/sim/input"
import type { Scenario } from "@/sim/scenario"
import { play, tick } from "@/sim/audio"

export type CameraMode = "first" | "third" | "top"
export const CAMERA_LABEL: Record<CameraMode, string> = { first: "Góc nhìn người lái", third: "Góc nhìn phía sau", top: "Nhìn từ trên cao" }
const NEXT_CAMERA: Record<CameraMode, CameraMode> = { first: "third", third: "top", top: "first" }

export interface Hud {
  kmh: number
  rpm: number
  gear: Car["gear"]
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
  const cam = camera as THREE.PerspectiveCamera

  useFrame((_, delta) => {
    const car = carRef.current
    const sc = scRef.current
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
        case "camera":
          camRef.current = NEXT_CAMERA[camRef.current]
          break
        case "begin":
          if (sc.status === "ready") sc.begin(car)
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
      const s = (car.steer / CAR.maxSteer) * want
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
    look.current += (input.look * 1.25 - look.current) * Math.min(1, dt * 6)
    if (mode === "first") {
      cam.up.set(0, 1, 0)
      const head = add(add(car.pos, mul(f, 1.15)), mul(leftOf(f), 0.37))
      const y = car.y + 1.25 + Math.sin(car.pitch) * 1.15
      cam.position.set(head.x, y, head.z)
      const ld = dir(car.heading + look.current)
      cam.lookAt(head.x + ld.x * 10, y - 0.9 + Math.tan(car.pitch) * 10, head.z + ld.z * 10)
      if (cam.fov !== 72) {
        cam.fov = 72
        cam.updateProjectionMatrix()
      }
    } else if (mode === "third") {
      cam.up.set(0, 1, 0)
      const ld = dir(car.heading + look.current * 2)
      const center = add(car.pos, mul(f, CAR.wheelbase / 2))
      const want = new THREE.Vector3(center.x - ld.x * 8, car.y + 3.4, center.z - ld.z * 8)
      cam.position.lerp(want, 1 - Math.exp(-dt * 5))
      cam.lookAt(center.x + f.x * 2, car.y + 1, center.z + f.z * 2)
      if (cam.fov !== 60) {
        cam.fov = 60
        cam.updateProjectionMatrix()
      }
    } else {
      const center = add(car.pos, mul(f, CAR.wheelbase / 2))
      cam.position.set(center.x, car.y + 24, center.z)
      cam.up.set(f.x, 0, f.z)
      cam.lookAt(center.x, car.y, center.z)
      if (cam.fov !== 50) {
        cam.fov = 50
        cam.updateProjectionMatrix()
      }
    }

    hudAcc.current += dt
    if (hudAcc.current > 0.1) {
      hudAcc.current = 0
      onHud({
        kmh: car.kmh,
        rpm: car.rpm,
        gear: car.gear,
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
