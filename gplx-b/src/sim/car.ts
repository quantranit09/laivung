/**
 * Xe số tự động (hạng B): mô hình xe đạp động học + hộp số tự động / mô-tơ điện.
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

export interface CarSpec {
  id: "vf6" | "sedan"
  name: string
  length: number
  width: number
  height: number
  wheelbase: number
  track: number
  /** Từ trục sau tới cản trước */
  frontOverhang: number
  /** Từ trục sau tới cản sau */
  rearOverhang: number
  wheelRadius: number
  maxSteer: number
  /** Xe điện: không có vòng tua máy */
  ev: boolean
  /** Gia tốc tối đa khi đạp hết ga (m/s²) */
  accel: number
  /** Chiều cao mắt người lái */
  eye: number
}

/** SUV điện cỡ B — kích thước theo VinFast VF6 (D×R×C 4.238×1.820×1.594 m, chiều dài cơ sở 2.730 m). */
export const VF6: CarSpec = {
  id: "vf6",
  name: "SUV điện cỡ B (kích thước VF6)",
  length: 4.238,
  width: 1.82,
  height: 1.594,
  wheelbase: 2.73,
  track: 1.57,
  frontOverhang: 2.73 + 0.83,
  rearOverhang: 0.678,
  wheelRadius: 0.37,
  maxSteer: (33 * Math.PI) / 180,
  ev: true,
  accel: 3.3,
  eye: 1.3,
}

/** Sedan hạng B số tự động (máy xăng) — kích thước tương tự các mẫu phổ biến dùng để sát hạch. */
export const SEDAN: CarSpec = {
  id: "sedan",
  name: "Sedan số tự động (máy xăng)",
  length: 4.425,
  width: 1.73,
  height: 1.475,
  wheelbase: 2.55,
  track: 1.48,
  frontOverhang: 2.55 + 0.955,
  rearOverhang: 0.92,
  wheelRadius: 0.31,
  maxSteer: (35 * Math.PI) / 180,
  ev: false,
  accel: 2.8,
  eye: 1.13,
}

export const CARS = { vf6: VF6, sedan: SEDAN }

const G = 9.81
const CREEP_SPEED = 1.7 // ~6 km/h
const MAX_REVERSE = 3.2
/** Tốc độ quay vô lăng tối đa (quy về góc bánh xe, rad/s) — người lái thật mất ~1 giây đánh hết lái. */
const STEER_RATE = 0.75

export class Car {
  spec: CarSpec
  /** Vị trí trục sau */
  pos: V2 = { x: 0, z: 0 }
  heading = 0
  /** m/s, âm khi lùi */
  speed = 0
  steer = 0
  y = 0
  pitch = 0
  /** Nghiêng thân xe khi vào cua / phanh (chỉ để hiển thị) */
  roll = 0
  dive = 0
  gear: Gear = "P"
  handbrake = true
  seatbelt = false
  /** Đã khởi động (xe điện: trạng thái READY) */
  engine = false
  signal: "none" | "left" | "right" = "none"
  hazard = false
  rpm = 750
  /** Công suất mô-tơ đang dùng, 0..1 (xe điện) */
  power = 0
  wheelSpin = 0
  /** Quãng đường đã đi (m) */
  odo = 0
  /** Đang đạp phanh (để sáng đèn phanh) */
  braking = false
  private prevSpeed = 0

  constructor(spec: CarSpec = VF6) {
    this.spec = spec
  }

  reset(pos: V2, heading: number) {
    this.pos = { ...pos }
    this.heading = heading
    this.speed = 0
    this.steer = 0
    this.gear = "P"
    this.handbrake = true
    this.seatbelt = false
    this.engine = false
    this.signal = "none"
    this.hazard = false
    this.odo = 0
  }

  get kmh() {
    return Math.abs(this.speed) * 3.6
  }

  /** Các điểm quan trọng của thân xe trên mặt đất. */
  points() {
    const s = this.spec
    const f = dir(this.heading)
    const l = leftOf(f)
    const at = (along: number, side: number) => add(add(this.pos, mul(f, along)), mul(l, side))
    const hw = s.width / 2, ht = s.track / 2
    return {
      frontCenter: at(s.frontOverhang, 0),
      rearCenter: at(-s.rearOverhang, 0),
      center: at(s.wheelbase / 2, 0),
      corners: [at(s.frontOverhang, hw), at(s.frontOverhang, -hw), at(-s.rearOverhang, -hw), at(-s.rearOverhang, hw)],
      wheels: {
        fl: at(s.wheelbase, ht),
        fr: at(s.wheelbase, -ht),
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
    const s = this.spec
    // Lái: bánh xe quay theo vô lăng với tốc độ giới hạn; càng chạy nhanh trợ lực càng
    // "nặng" — góc lái tối đa giảm dần, giống cảm giác lái thật và khó lạng lách.
    const lock = s.maxSteer * (1 - clamp((this.kmh - 12) / 70, 0, 0.55))
    const target = c.steer * lock
    const rate = STEER_RATE * dt
    this.steer += clamp(target - this.steer, -rate, rate)

    // Độ dốc theo hướng xe (dương = đầu xe hướng lên dốc).
    const f = dir(this.heading)
    const front = add(this.pos, mul(f, s.wheelbase))
    const hF = heightAt(front), hR = heightAt(this.pos)
    this.pitch = Math.atan2(hF - hR, s.wheelbase)
    this.y = (hF + hR) / 2

    let accel = -G * Math.sin(this.pitch)
    const v0 = this.speed
    let drive = 0
    if (this.engine && (this.gear === "D" || this.gear === "R")) {
      const sign = this.gear === "D" ? 1 : -1
      const along = v0 * sign
      // Ga có đáp ứng mềm (bình phương) để dễ giữ tốc độ thấp trong sa hình.
      const pedal = c.throttle * c.throttle
      drive = pedal * (this.gear === "D" ? s.accel * clamp(1 - along / 33, 0, 1) : 1.6)
      // Xe tự bò khi nhả phanh, lực yếu dần khi đạt tốc độ bò.
      if (c.brake < 0.05) drive += 1.3 * clamp(1 - along / CREEP_SPEED, 0, 1)
      if (this.gear === "R" && along > MAX_REVERSE) drive = Math.min(drive, 0)
      // Xe điện: nhả ga ở tốc độ cao thì phanh tái sinh nhẹ.
      if (s.ev && c.throttle < 0.05 && along > CREEP_SPEED + 1) drive -= 0.6
      accel += sign * drive
    }
    // Lực cản lăn + gió
    accel -= Math.sign(v0) * (0.12 + 0.0018 * v0 * v0)

    // Phanh: lực ma sát, đủ mạnh thì giữ xe đứng yên trên dốc.
    const brakeDecel = c.brake * 7.5 + (this.handbrake ? 5 : 0) + (this.gear === "P" ? 10 : 0)
    this.braking = c.brake > 0.05
    let next = v0 + accel * dt
    if (brakeDecel > 0) {
      if (Math.abs(next) <= brakeDecel * dt) next = 0
      else next -= Math.sign(next) * brakeDecel * dt
    }
    this.speed = next

    const ds = this.speed * dt
    const yawRate = (this.speed / s.wheelbase) * Math.tan(this.steer)
    this.heading += yawRate * dt
    this.pos = add(this.pos, mul(f, ds))
    this.odo += Math.abs(ds)
    this.wheelSpin += ds / s.wheelRadius

    // Thân xe nghiêng nhẹ theo lực ngang và chúi khi phanh (chỉ hiệu ứng hình ảnh).
    const lat = this.speed * yawRate
    const lon = dt > 0 ? (this.speed - this.prevSpeed) / dt : 0
    this.prevSpeed = this.speed
    this.roll += (clamp(-lat * 0.012, -0.05, 0.05) - this.roll) * clamp(dt * 5, 0, 1)
    this.dive += (clamp(-lon * 0.006, -0.03, 0.03) - this.dive) * clamp(dt * 5, 0, 1)

    if (!this.engine) {
      this.rpm += (0 - this.rpm) * clamp(dt * 4, 0, 1)
      this.power = 0
      return
    }
    if (s.ev) {
      this.power += (Math.max(0, drive) / s.accel - this.power) * clamp(dt * 8, 0, 1)
      this.rpm = 0
      return
    }
    // Vòng tua máy giả lập hộp số tự động.
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
