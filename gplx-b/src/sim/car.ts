/**
 * Xe số tự động (hạng B): mô hình xe đạp động học + hộp số tự động đơn giản.
 * Có "xe tự bò" (creep) khi nhả phanh ở D/R, trôi dốc khi lực bò không thắng
 * được dốc — đúng cảm giác bài khởi hành ngang dốc với xe số tự động.
 */
import { add, clamp, dir, leftOf, mul, type V2 } from "./geom"

export type Gear = "P" | "R" | "N" | "D"

export interface Controls {
  /** 0..1 */
  throttle: number
  /** 0..1 */
  brake: number
  /** -1 (phải) .. 1 (trái) */
  steer: number
}

export const CAR = {
  length: 4.4,
  width: 1.8,
  wheelbase: 2.6,
  track: 1.55,
  /** Từ trục sau tới cản trước / cản sau */
  frontOverhang: 0.9 + 2.6,
  rearOverhang: 0.9,
  maxSteer: (35 * Math.PI) / 180,
}

const G = 9.81
const CREEP_SPEED = 1.7 // ~6 km/h
const MAX_REVERSE = 3.2

export class Car {
  /** Vị trí trục sau */
  pos: V2 = { x: 0, z: 0 }
  heading = 0
  /** m/s, âm khi lùi */
  speed = 0
  steer = 0
  y = 0
  pitch = 0
  gear: Gear = "P"
  handbrake = true
  seatbelt = false
  signal: "none" | "left" | "right" = "none"
  hazard = false
  rpm = 750
  wheelSpin = 0
  /** Quãng đường đã đi (m) */
  odo = 0
  /** Đang đạp phanh (để sáng đèn phanh) */
  braking = false

  reset(pos: V2, heading: number) {
    this.pos = { ...pos }
    this.heading = heading
    this.speed = 0
    this.steer = 0
    this.gear = "P"
    this.handbrake = true
    this.seatbelt = false
    this.signal = "none"
    this.hazard = false
    this.odo = 0
  }

  get kmh() {
    return Math.abs(this.speed) * 3.6
  }

  /** Các điểm quan trọng của thân xe trên mặt đất. */
  points() {
    const f = dir(this.heading)
    const l = leftOf(f)
    const at = (along: number, side: number) => add(add(this.pos, mul(f, along)), mul(l, side))
    const hw = CAR.width / 2, ht = CAR.track / 2
    return {
      frontCenter: at(CAR.frontOverhang, 0),
      rearCenter: at(-CAR.rearOverhang, 0),
      center: at(CAR.wheelbase / 2, 0),
      corners: [at(CAR.frontOverhang, hw), at(CAR.frontOverhang, -hw), at(-CAR.rearOverhang, -hw), at(-CAR.rearOverhang, hw)],
      wheels: {
        fl: at(CAR.wheelbase, ht),
        fr: at(CAR.wheelbase, -ht),
        rl: at(0, ht),
        rr: at(0, -ht),
      },
    }
  }

  /** Thử chuyển số: chỉ được khi xe gần như đứng yên. */
  shift(g: Gear): boolean {
    if (g === this.gear) return true
    if (Math.abs(this.speed) > 0.4) return false
    this.gear = g
    return true
  }

  step(dt: number, c: Controls, heightAt: (p: V2) => number) {
    // Lái: vô lăng xoay dần như thật, không giật tức thời.
    const target = c.steer * CAR.maxSteer
    const rate = 2.2 * dt
    this.steer += clamp(target - this.steer, -rate, rate)

    // Độ dốc theo hướng xe (dương = đầu xe hướng lên dốc).
    const f = dir(this.heading)
    const front = add(this.pos, mul(f, CAR.wheelbase))
    const hF = heightAt(front), hR = heightAt(this.pos)
    this.pitch = Math.atan2(hF - hR, CAR.wheelbase)
    this.y = (hF + hR) / 2

    let accel = -G * Math.sin(this.pitch)
    const s = this.speed
    if (this.gear === "D" || this.gear === "R") {
      const sign = this.gear === "D" ? 1 : -1
      const along = s * sign
      let drive = c.throttle * (this.gear === "D" ? 3.2 * clamp(1 - along / 25, 0, 1) : 1.6)
      // Xe tự bò khi nhả phanh, lực yếu dần khi đạt tốc độ bò.
      if (c.brake < 0.05) drive += 1.3 * clamp(1 - along / CREEP_SPEED, 0, 1)
      if (this.gear === "R" && along > MAX_REVERSE) drive = Math.min(drive, 0)
      accel += sign * drive
    }
    // Lực cản lăn + gió
    accel -= Math.sign(s) * (0.12 + 0.0018 * s * s)

    // Phanh: lực ma sát, đủ mạnh thì giữ xe đứng yên trên dốc.
    const brakeDecel = c.brake * 7.5 + (this.handbrake ? 5 : 0) + (this.gear === "P" ? 10 : 0)
    this.braking = c.brake > 0.05
    let next = s + accel * dt
    if (brakeDecel > 0) {
      if (Math.abs(next) <= brakeDecel * dt) next = 0
      else next -= Math.sign(next) * brakeDecel * dt
    }
    this.speed = next

    const ds = this.speed * dt
    this.heading += (ds / CAR.wheelbase) * Math.tan(this.steer)
    this.pos = add(this.pos, mul(f, ds))
    this.odo += Math.abs(ds)
    this.wheelSpin += ds / 0.32

    // Vòng tua máy giả lập hộp số 5 cấp tự động.
    const kmh = this.kmh
    if (this.gear === "D") {
      const bands = [0, 18, 32, 48, 65, 90]
      const g = bands.findIndex((b, i) => kmh < (bands[i + 1] ?? 999) && kmh >= b)
      const span = (bands[g + 1] ?? 120) - bands[g]
      // Hộp số tự động sang số sớm: chỉ đạp hết ga ở cuối mỗi cấp số mới vượt 4000 v/ph.
      const target = 800 + ((kmh - bands[g]) / span) * 1700 + c.throttle * c.throttle * 1700
      this.rpm += (target - this.rpm) * clamp(dt * 6, 0, 1)
    } else {
      const target = 750 + c.throttle * (this.gear === "R" ? 2000 : 3800)
      this.rpm += (target - this.rpm) * clamp(dt * 6, 0, 1)
    }
  }
}
