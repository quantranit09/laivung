/**
 * Bộ lái bám đường (pure pursuit) dùng cho kiểm thử tự động: chứng minh sân lái được
 * với bán kính quay thật của xe và kiểm tra luật chấm điểm.
 */
import { CAR, type Car, type Controls } from "./car"
import { add, clamp, dir, dot, len, mul, norm, sub, wrapAngle, type V2 } from "./geom"

export interface Leg {
  path: V2[]
  /** 1 = tiến, -1 = lùi */
  way: 1 | -1
  speed: number
  /** Dừng khi khoảng cách (m) do hàm trả về < 0.25 */
  stopWhen?: () => number
  /** Đứng yên bao lâu sau khi dừng */
  hold?: number
  before?: (car: Car) => void
  after?: (car: Car) => void
}

export class Pilot {
  i = 0
  holdLeft = -1
  private legs: Leg[]
  constructor(legs: Leg[]) {
    this.legs = legs
  }
  get done() {
    return this.i >= this.legs.length
  }

  control(car: Car, dt: number): Controls {
    const leg = this.legs[this.i]
    if (!leg) return { throttle: 0, brake: 1, steer: 0 }
    const want = leg.way === 1 ? "D" : "R"
    if (car.gear !== want) {
      if (Math.abs(car.speed) < 0.05) {
        leg.before?.(car)
        car.shift(want)
      }
      return { throttle: 0, brake: 1, steer: 0 }
    }
    if (this.holdLeft >= 0) {
      this.holdLeft -= dt
      if (this.holdLeft < 0) {
        leg.after?.(car)
        this.i++
      }
      return { throttle: 0, brake: 1, steer: 0 }
    }
    // Điểm tham chiếu: trục sau. Tìm điểm nhìn trước trên đường.
    const ref = car.pos
    const fwd = mul(dir(car.heading), leg.way)
    const pts = leg.path
    let best = 0, bd = Infinity
    for (let k = 0; k < pts.length; k++) {
      const d = len(sub(pts[k], ref))
      if (d < bd) {
        bd = d
        best = k
      }
    }
    const look = leg.way === 1 ? 3.2 : 1.6
    let target = pts[pts.length - 1]
    for (let k = best; k < pts.length; k++)
      if (len(sub(pts[k], ref)) >= look) {
        target = pts[k]
        break
      }
    const to = sub(target, ref)
    const alpha = wrapAngle(Math.atan2(to.x, to.z) - Math.atan2(fwd.x, fwd.z))
    let steer = Math.atan((2 * CAR.wheelbase * Math.sin(alpha)) / Math.max(1, len(to)))
    if (leg.way === -1) steer = -steer
    const endDist = len(sub(pts[pts.length - 1], ref))
    const atEnd = best >= pts.length - 2 && (endDist < 0.6 || best === pts.length - 1)
    const stopDist = leg.stopWhen?.()
    const mustStop = atEnd || (stopDist !== undefined && stopDist < 0.25)
    if (mustStop) {
      if (Math.abs(car.speed) < 0.03) this.holdLeft = leg.hold ?? 0.6
      return { throttle: 0, brake: 1, steer: steer / CAR.maxSteer }
    }
    // Chậm lại khi gần điểm dừng
    let v = leg.speed
    const brakeZone = Math.max(8, (leg.speed * leg.speed) / 2.5)
    const near = Math.min(stopDist ?? Infinity, best >= pts.length - brakeZone * 2 ? endDist : Infinity)
    if (near < brakeZone) v = Math.min(v, Math.max(0.5, Math.sqrt(2 * 1.2 * near)))
    const sp = Math.abs(car.speed)
    const err = v - sp
    return {
      throttle: err > 0 ? clamp(err * 0.6, 0, 0.7) : 0,
      brake: err < -0.2 ? clamp(-err * 0.8, 0, 1) : 0,
      steer: clamp(steer / CAR.maxSteer, -1, 1),
    }
  }
}

/** Đường thẳng lấy mẫu dày giữa các điểm. */
export function line(...pts: V2[]): V2[] {
  const out: V2[] = []
  for (let i = 0; i < pts.length - 1; i++) {
    const a = pts[i], b = pts[i + 1]
    const n = Math.max(1, Math.ceil(len(sub(b, a)) / 0.5))
    for (let k = 0; k < n; k++) out.push(add(a, mul(sub(b, a), k / n)))
  }
  out.push(pts[pts.length - 1])
  return out
}

/** Cung tròn từ điểm p, hướng chuyển động d, rẽ trái (+1) hoặc phải (-1) một góc `turn` (rad), bán kính r. */
export function arc(p: V2, d: V2, side: 1 | -1, turn: number, r: number): V2[] {
  const n0 = norm(d)
  const left = { x: n0.z, z: -n0.x }
  const c = add(p, mul(left, side * r))
  const start = sub(p, c)
  const out: V2[] = []
  const steps = Math.ceil((turn * r) / 0.3)
  for (let k = 0; k <= steps; k++) {
    const a = (-side * turn * k) / steps
    out.push(add(c, { x: start.x * Math.cos(a) - start.z * Math.sin(a), z: start.x * Math.sin(a) + start.z * Math.cos(a) }))
  }
  void dot
  return out
}
