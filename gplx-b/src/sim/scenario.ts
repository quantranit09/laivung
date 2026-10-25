import type { Car, Controls } from "./car"
import type { Shape, V2 } from "./geom"

export interface Fault {
  t: number
  points: number
  text: string
  /** Lỗi bị đình chỉ sát hạch */
  fatal?: boolean
}

export type ExamStatus = "ready" | "running" | "passed" | "failed"

export interface Instruction {
  title: string
  detail: string
  /** Khoảng cách (m) từ cản trước tới vạch dừng, để luyện căn vạch */
  toLine?: number
}

/** Âm báo của xe sát hạch */
export type Sound = "start" | "fault" | "fatal" | "done" | "alarm" | "beep"

/** Kịch bản lái (sa hình hoặc đường trường): bản đồ, luật chấm điểm, hướng dẫn. */
export interface Scenario {
  readonly name: string
  readonly shapes: Shape[]
  readonly start: { pos: V2; heading: number }
  readonly timeLimit: number
  readonly speedLimit: number
  status: ExamStatus
  time: number
  readonly faults: Fault[]
  readonly score: number
  /** Đèn đỏ báo tình huống nguy hiểm trên xe */
  alarm: boolean
  heightAt(p: V2): number
  begin(car: Car): void
  update(dt: number, car: Car, c: Controls): void
  instruction(car: Car): Instruction
  drainSounds(): Sound[]
}

export const PASS_SCORE = 80

/** Bộ chấm điểm dùng chung: trừ điểm, đình chỉ, tổng kết. */
export class Scorer {
  faults: Fault[] = []
  sounds: Sound[] = []
  fatal = false
  private now: () => number
  constructor(now: () => number) {
    this.now = now
  }

  get score() {
    return Math.max(0, 100 - this.faults.reduce((s, f) => s + f.points, 0))
  }

  deduct(points: number, text: string) {
    this.faults.push({ t: this.now(), points, text })
    this.sounds.push("fault")
  }

  disqualify(text: string) {
    if (this.fatal) return
    this.fatal = true
    this.faults.push({ t: this.now(), points: 0, text, fatal: true })
    this.sounds.push("fatal")
  }
}

/** Đếm thời gian một điều kiện kéo dài, gọi `each` mỗi `period` giây (vd. quá tốc độ cứ 3 giây trừ 1 điểm). */
export class Repeater {
  private acc = 0
  private active = false
  private period: number
  private each: () => void
  private onStart?: () => void
  constructor(period: number, each: () => void, onStart?: () => void) {
    this.period = period
    this.each = each
    this.onStart = onStart
  }
  tick(dt: number, on: boolean) {
    if (!on) {
      this.active = false
      this.acc = 0
      return
    }
    if (!this.active) {
      this.active = true
      this.onStart?.()
    }
    this.acc += dt
    while (this.acc >= this.period) {
      this.acc -= this.period
      this.each()
    }
  }
}

/** Phát hiện xe đã dừng hẳn (đứng yên liên tục một khoảng thời gian). */
export class StopDetector {
  private still = 0
  private held = 0
  /** `holding`: đang đạp phanh / kéo phanh tay — xe chỉ "dừng" khi người lái chủ động giữ xe. */
  tick(dt: number, speed: number, holding = true) {
    const zero = Math.abs(speed) < 0.06
    this.still = zero ? this.still + dt : 0
    this.held = zero && holding ? this.held + dt : 0
    return this.still
  }
  get stopped() {
    return this.held >= 0.4
  }
}
