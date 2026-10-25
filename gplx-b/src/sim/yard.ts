/**
 * Sân sát hạch hạng B (số tự động) — 11 bài liên hoàn theo Phụ lục III, Thông tư 108/2026/TT-BCA.
 * Kích thước sân là mô phỏng gần đúng; luật trừ điểm bám theo văn bản.
 */
import type { Car } from "./car"
import { len, rect, roundedPath, sub, unionMargin, shapeMargin, v, type Poly, type Shape, type V2 } from "./geom"
import { PASS_SCORE, Repeater, Scorer, StopDetector, type ExamStatus, type Instruction, type Scenario, type Sound } from "./scenario"

// ---- Bố cục sân (mét). Đi theo chiều kim đồng hồ: Bắc → Đông → Nam → Tây. ----
export const Y = {
  startLine: -4,
  crosswalkStop: 18,
  hill: { up0: 36, up1: 51, down0: 59, down1: 74, h: 1.8, stop: 44 },
  strip: { x: -0.78, w: 0.5, z0: 108, z1: 128 },
  // Từ bài 4 trở đi xe đi về phía -x (bên phải khi nhìn về +z là -x)
  lightStop: -55,
  lightEnd: -64.5,
  sX0: -80,
  sX1: -112,
  railStop: 43.5,
  rail: 38,
  speed: { z0: 28, zMid: 3, z1: -22 },
  endLine: -24,
}

const S_AMP = 5
const sCurve: V2[] = []
for (let u = 0; u <= 32; u += 0.5) sCurve.push(v(Y.sX0 - u, 164 + S_AMP * Math.sin((Math.PI * u) / 16)))

/** Ô ghép xe nằm bên phải chiều đi (đi về -z thì bên phải là +x). */
export const GARAGE_BAY: Poly = rect(-118, 110.6, -111.5, 113.4)
export const PARALLEL_BAY: Poly = rect(-118, 63.5, -115.2, 71.5)
const LEG3 = -124

export const YARD_SHAPES: Shape[] = [
  // Bài 1–3: đường thẳng hướng Bắc (có dốc)
  { kind: "ribbon", pts: [v(0, -30), v(0, 104)], width: 5 },
  // Bài 4: vệt bánh xe + đường vòng vuông góc (hành lang rộng 4,5 m)
  rect(-2.25, 103, 2.25, 140.5),
  rect(-16.5, 136, 2.25, 140.5),
  rect(-16.5, 136, -12, 156),
  // Nối ra đường vòng phía Bắc
  { kind: "ribbon", pts: roundedPath([v(-14.25, 152), v(-14.25, 164), v(Y.sX0, 164)], 6), width: 6 },
  // Bài 5: đường cắt ngang ở ngã tư
  { kind: "ribbon", pts: [v(-60, 146), v(-60, 184)], width: 7 },
  // Bài 6: đường vòng quanh co (rộng 4 m)
  { kind: "ribbon", pts: sCurve, width: 4 },
  // Đường phía Đông → Nam → Tây → về điểm xuất phát
  { kind: "ribbon", pts: roundedPath([v(Y.sX1, 164), v(LEG3, 164), v(LEG3, -30), v(0, -30), v(0, -12)], 6), width: 6 },
  // Bài 7 & 8: khu vực mở rộng để ghép xe
  rect(-130, 100, -118, 125),
  GARAGE_BAY,
  rect(-130, 55, -118, 85),
  PARALLEL_BAY,
]

/** Các điểm rẽ ngoài khu vực bài sát hạch — phải bật xi nhan phải. */
const CORNERS = [v(-14, 164), v(LEG3, 164), v(LEG3, -30)]

export function yardHeight(p: V2) {
  if (Math.abs(p.x) > 6 || p.z < Y.hill.up0 || p.z > Y.hill.down1) return 0
  const { up0, up1, down0, down1, h } = Y.hill
  if (p.z < up1) return ((p.z - up0) / (up1 - up0)) * h
  if (p.z < down0) return h
  return (1 - (p.z - down0) / (down1 - down0)) * h
}

/** Đồ hoạ: các vạch, biển, đèn — dùng chung cho cảnh 3D và bản đồ nhỏ. */
export const YARD_MARKS = {
  /** Vạch ngang qua đường: [tâm, hướng đi, bề rộng, nhãn] */
  lines: [
    { at: v(0, Y.startLine), dir: 0, w: 5, kind: "start" as const },
    { at: v(0, Y.crosswalkStop), dir: 0, w: 5, kind: "stop" as const },
    { at: v(0, Y.hill.stop), dir: 0, w: 5, kind: "stop" as const },
    { at: v(Y.lightStop, 164), dir: -Math.PI / 2, w: 6, kind: "stop" as const },
    { at: v(LEG3, Y.railStop), dir: Math.PI, w: 6, kind: "stop" as const },
    { at: v(Y.endLine, -30), dir: Math.PI / 2, w: 6, kind: "end" as const },
  ],
  zebra: [{ at: v(0, Y.crosswalkStop + 2.5), dir: 0, w: 5 }],
  rail: { z: Y.rail, x0: -130, x1: -118 },
  light: { pos: v(-54.6, 159.8), facing: Math.PI / 2 },
  signs: [
    { at: v(-4, -8), text: "1 · Xuất phát" },
    { at: v(-4, 12), text: "2 · Người đi bộ" },
    { at: v(-4.5, 38), text: "3 · Dốc" },
    { at: v(-4, 100), text: "4 · Vệt bánh xe" },
    { at: v(-48, 158.5), text: "5 · Ngã tư" },
    { at: v(-78, 158.5), text: "6 · Quanh co" },
    { at: v(-132, 128), text: "7 · Ghép dọc" },
    { at: v(-132, 88), text: "8 · Ghép ngang" },
    { at: v(-130, 50), text: "9 · Đường sắt" },
    { at: v(-130, 30), text: "10 · Tăng tốc" },
    { at: v(-28, -24.5), text: "11 · Kết thúc" },
  ],
  speedZone: { z0: Y.speed.z0, zMid: Y.speed.zMid, z1: Y.speed.z1 },
}

const EX_NAMES = [
  "Xuất phát",
  "Dừng xe nhường đường cho người đi bộ",
  "Dừng và khởi hành xe ngang dốc",
  "Qua vệt bánh xe và đường vòng vuông góc",
  "Qua ngã tư có tín hiệu điều khiển giao thông",
  "Qua đường vòng quanh co",
  "Ghép xe dọc vào nơi đỗ",
  "Ghép xe ngang vào nơi đỗ",
  "Tạm dừng ở chỗ có đường sắt chạy qua",
  "Thay đổi số trên đường bằng (xe số tự động: thay đổi tốc độ)",
  "Kết thúc",
]

type Light = "red" | "yellow" | "green"

export class YardExam implements Scenario {
  readonly name = "Sa hình hạng B"
  readonly shapes = YARD_SHAPES
  readonly start = { pos: v(0, -9.5), heading: 0 }
  readonly timeLimit = 18 * 60
  readonly speedLimit = 24
  status: ExamStatus = "ready"
  time = 0
  alarm = false
  light: Light = "green"
  /** Số thứ tự bài đang thực hiện (0-based) */
  ex = 0
  private sc = new Scorer(() => this.time)
  private stop = new StopDetector()
  private speeding = new Repeater(3, () => this.sc.deduct(1, "Lái xe quá tốc độ quy định (cứ 3 giây)"))
  private overtime = new Repeater(3, () => this.sc.deduct(1, "Tổng thời gian quá quy định (cứ 3 giây)"))
  private onLine = new Repeater(5, () => this.sc.deduct(5, "Bánh xe đè vạch giới hạn quá 5 giây"), () =>
    this.sc.deduct(5, "Bánh xe đè vào vạch giới hạn hình sát hạch"),
  )
  private rpmHigh = false
  private engineWasOn = true
  private exStart = 0
  private exOver = 0
  /** Trạng thái riêng của bài đang làm */
  private st: Record<string, number | boolean> = {}
  private cornerOk = CORNERS.map(() => ({ watching: false, ok: false, done: false }))
  private hazard = { at: 0, phase: "idle" as "idle" | "armed" | "on" | "after", t0: 0, stoppedAt: 0, x: 0, endPos: v(0, 0), checked: 0 }
  private freeStop = { counted: false }
  private lightTimer = 0

  get faults() {
    return this.sc.faults
  }
  get score() {
    return this.sc.score
  }

  heightAt = yardHeight

  begin(car: Car) {
    this.status = "running"
    this.time = 0
    this.engineWasOn = car.engine
    this.sc.sounds.push("start")
    this.hazard.x = -100 + Math.random() * 45
    this.hazard.phase = "armed"
  }

  drainSounds(): Sound[] {
    const s = this.sc.sounds
    this.sc.sounds = []
    return s
  }

  private next(ex: number) {
    if (ex <= this.ex) return
    this.ex = ex
    this.exStart = this.time
    this.exOver = 0
    this.st = {}
  }

  /** Bài có vạch giới hạn hình (đè vạch bị trừ điểm). */
  private get bounded() {
    return this.ex === 3 || this.ex === 5 || this.ex === 6 || this.ex === 7
  }
  /** Đang ở trong khu vực một bài sát hạch (không tính đoạn nối). */
  private inExercise(car: Car) {
    const c = car.points().center
    const leg1 = Math.abs(c.x) < 5
    const leg3 = Math.abs(c.x - LEG3) < 8
    return (
      (leg1 && c.z < Y.startLine + 6) ||
      (leg1 && c.z > Y.crosswalkStop - 10 && c.z < Y.crosswalkStop + 4) ||
      (leg1 && c.z > Y.hill.up0 && c.z < Y.hill.down1) ||
      (c.z > 100 && c.x > -17 && c.z < 160) ||
      (Math.abs(c.z - 164) < 8 && c.x < -44 && c.x > Y.sX1 - 2) ||
      (leg3 && c.z > 50 && c.z < 130) ||
      (leg3 && c.z > Y.speed.z1 - 2 && c.z < Y.railStop + 8)
    )
  }

  update(dt: number, car: Car) {
    if (this.status !== "running") return
    this.time += dt
    const P = car.points()
    const front = P.frontCenter
    const center = P.center
    const still = this.stop.tick(dt, car.speed, car.braking || car.handbrake || car.gear === "P")
    const stopped = this.stop.stopped
    this.updateLight(dt)

    // ---- Lỗi chung ----
    const wheelMargins = Object.values(P.wheels).map((w) => unionMargin(this.shapes, w))
    if (wheelMargins.some((m) => m < -0.45)) this.sc.disqualify("Lái xe lên vỉa hè")
    this.onLine.tick(dt, this.bounded && wheelMargins.some((m) => m < 0))
    const inSpeedZone = Math.abs(center.x - LEG3) < 6 && front.z < Y.speed.z0 && front.z > Y.speed.z1
    this.speeding.tick(dt, car.kmh > this.speedLimit && !inSpeedZone)
    this.overtime.tick(dt, this.time > this.timeLimit)
    const high = car.rpm > 4000
    if (high && !this.rpmHigh) this.sc.deduct(5, "Để tốc độ động cơ quá 4000 vòng/phút")
    this.rpmHigh = high
    if (!car.engine && this.engineWasOn) this.sc.deduct(5, "Xe bị chết máy / tắt máy giữa chừng")
    this.engineWasOn = car.engine
    // Thời gian mỗi bài có giới hạn 2 phút (bài 4, 6, 7, 8, 10): cứ quá 2 phút trừ 5 điểm.
    if ([3, 5, 6, 7, 9].includes(this.ex) && this.time - this.exStart > 120 * (this.exOver + 1)) {
      this.exOver++
      this.sc.deduct(5, `Thời gian thực hiện bài ${this.ex + 1} quá 2 phút`)
    }

    // Dừng xe sai vị trí (ngoài các bài sát hạch, không phải do tình huống nguy hiểm)
    const free = !this.inExercise(car) && this.hazard.phase !== "on" && this.hazard.phase !== "after"
    if (free && still > 2.5 && !this.freeStop.counted) {
      this.freeStop.counted = true
      this.sc.deduct(5, "Dừng xe tại vị trí không đúng quy định")
    }
    if (!stopped) this.freeStop.counted = false

    this.corners(car, center)
    this.hazardRule(dt, car, center, free)
    this.exercise(dt, car, front, center, stopped)

    if (this.sc.fatal) this.finish(false)
  }

  private updateLight(dt: number) {
    if (this.ex !== 4) return
    this.lightTimer -= dt
    if (this.lightTimer > 0) return
    if (this.light === "red") {
      this.light = "green"
      this.lightTimer = 14
      this.st.greenAt = this.time
    } else if (this.light === "green") {
      this.light = "yellow"
      this.lightTimer = 3
    } else {
      this.light = "red"
      this.lightTimer = 8
      // Đèn chuyển đỏ khi chưa qua: tính lại 20/30 giây từ lần xanh tiếp theo.
      this.st.greenAt = -1
    }
  }

  private corners(car: Car, center: V2) {
    CORNERS.forEach((pt, i) => {
      const k = this.cornerOk[i]
      if (k.done) return
      const d = len(sub(center, pt))
      if (d < 25) k.watching = true
      if (k.watching && (car.signal === "right" || car.hazard)) k.ok = true
      if (k.watching && d < 4.5) {
        k.done = true
        if (!k.ok) this.sc.deduct(5, "Không bật đèn xi nhan khi rẽ phải")
      }
    })
  }

  private hazardRule(dt: number, car: Car, center: V2, free: boolean) {
    const h = this.hazard
    if (h.phase === "armed" && free && Math.abs(center.z + 30) < 4 && center.x > h.x && this.ex >= 9) {
      h.phase = "on"
      h.t0 = this.time
      h.checked = 0
      this.alarm = true
      this.sc.sounds.push("alarm")
    }
    if (h.phase === "on") {
      const since = this.time - h.t0
      if (Math.abs(car.speed) < 0.08 && !h.stoppedAt) h.stoppedAt = this.time
      if (since > 3 && !(h.checked & 1)) {
        h.checked |= 1
        if (!h.stoppedAt) this.sc.deduct(10, "Không phanh dừng xe trong 3 giây khi gặp tình huống nguy hiểm")
      }
      if (since > 5 && !(h.checked & 2)) {
        h.checked |= 2
        if (!car.hazard) this.sc.deduct(10, "Không bật đèn cảnh báo nguy hiểm trong 5 giây")
      }
      if ((h.stoppedAt && this.time - h.stoppedAt > 3 && since > 5) || since > 10) {
        h.phase = "after"
        h.endPos = { ...center }
        this.alarm = false
        this.sc.sounds.push("beep")
      }
    } else if (h.phase === "after") {
      if (!car.hazard) h.phase = "idle"
      else if (len(sub(center, h.endPos)) > 1) {
        h.phase = "idle"
        this.sc.deduct(10, "Không tắt đèn cảnh báo nguy hiểm trước khi đi tiếp")
      }
    }
    void dt
  }

  /** Dừng trước vạch: cản trước cách vạch ≤ 0,5 m, không vượt vạch. `ahead` = khoảng cách còn lại tới vạch. */
  private judgeStop(ahead: number, tooFar = 0.5) {
    if (ahead < 0) return "over" as const
    if (ahead > tooFar) return "short" as const
    return "ok" as const
  }

  private exercise(dt: number, car: Car, front: V2, center: V2, stopped: boolean) {
    const st = this.st
    switch (this.ex) {
      case 0: {
        // Bài 1: xuất phát
        if (!st.crossed && front.z > Y.startLine) {
          st.crossed = true
          if (!car.seatbelt) this.sc.deduct(5, "Không thắt dây an toàn")
          if (car.signal !== "left") this.sc.deduct(5, "Không bật đèn xi nhan trái khi xuất phát")
          if (this.time > 20) this.sc.deduct(5, "Quá 20 giây kể từ lệnh xuất phát không đi qua vạch xuất phát")
        }
        if (!st.crossed && this.time > 30) this.sc.disqualify("Quá 30 giây không đi qua vạch xuất phát")
        if (st.crossed && front.z > Y.startLine + 5) {
          if (car.signal === "left") this.sc.deduct(5, "Không tắt đèn xi nhan trái sau vạch xuất phát 5 m")
          this.next(1)
        }
        break
      }
      case 1: {
        // Bài 2: dừng nhường đường người đi bộ
        const ahead = Y.crosswalkStop - front.z
        if (!st.done && stopped && ahead < 6) {
          st.done = true
          const j = this.judgeStop(ahead)
          if (j === "over") this.sc.deduct(5, "Dừng xe quá vạch dừng quy định")
          if (j === "short") this.sc.deduct(5, "Dừng xe chưa đến vạch dừng quy định")
          if (j === "ok") this.sc.sounds.push("done")
        }
        if (front.z > Y.crosswalkStop + 3) {
          if (!st.done) this.sc.deduct(5, "Không dừng xe ở vạch dừng quy định")
          this.next(2)
        }
        break
      }
      case 2: {
        // Bài 3: dừng và khởi hành ngang dốc
        const ahead = Y.hill.stop - front.z
        if (!st.stopped && stopped && ahead < 6) {
          st.stopped = true
          st.stopZ = front.z
          st.stopAt = this.time
          const j = this.judgeStop(ahead)
          if (j === "over") this.sc.disqualify("Dừng xe quá vạch dừng trên dốc")
          if (j === "short") this.sc.deduct(5, "Dừng xe chưa đến vạch dừng quy định")
          if (j === "ok") this.sc.sounds.push("done")
        }
        if (st.stopped && !st.passed) {
          if ((st.stopZ as number) - front.z > 0.5) this.sc.disqualify("Xe bị tụt dốc quá 500 mm")
          if (this.time - (st.stopAt as number) > 30) this.sc.disqualify("Quá 30 giây không khởi hành qua vị trí dừng")
          if (front.z > Y.hill.stop + 0.5) st.passed = true
        }
        if (!st.stopped && front.z > Y.hill.stop + 0.5) this.sc.disqualify("Không dừng xe ở vạch dừng trên dốc")
        if (front.z > Y.hill.down1) this.next(3)
        break
      }
      case 3: {
        // Bài 4: vệt bánh xe — bánh trước & sau bên phụ (bên phải) phải đi trong vệt
        const P = car.points()
        for (const w of [P.wheels.fr, P.wheels.rr]) {
          if (w.z > Y.strip.z0 && w.z < Y.strip.z1 && Math.abs(w.x - Y.strip.x) > Y.strip.w / 2)
            this.sc.disqualify("Bánh xe bên phụ không qua vùng giới hạn của hình vệt bánh xe")
        }
        if (center.z > 151 && center.x < -11) this.next(4)
        break
      }
      case 4: {
        // Bài 5: ngã tư có đèn
        if (!st.init) {
          st.init = true
          this.light = Math.random() < 0.6 ? "red" : "green"
          this.lightTimer = this.light === "red" ? 4 + Math.random() * 5 : 10
          st.greenAt = this.light === "green" ? this.time : -1
        }
        const ahead = front.x - Y.lightStop
        const atBox = Math.abs(center.z - 164) < 6
        if (atBox && !st.crossed && ahead < 0) {
          st.crossed = true
          if (this.light === "red") this.sc.deduct(10, "Vi phạm tín hiệu đèn điều khiển giao thông (vượt đèn đỏ)")
        }
        if (atBox && !st.stopJudged && stopped && this.light !== "green" && ahead < 6) {
          st.stopJudged = true
          const j = this.judgeStop(ahead, 1)
          if (j === "over") this.sc.deduct(5, "Dừng xe quá vạch dừng quy định")
          if (j === "short") this.sc.deduct(5, "Dừng xe chưa đến vạch dừng quy định")
        }
        const g = st.greenAt as number
        if (g >= 0 && front.x > Y.lightEnd) {
          if (this.time - g > 20 && !st.late) {
            st.late = true
            this.sc.deduct(5, "Quá 20 giây từ khi đèn xanh không qua vạch kết thúc ngã tư")
          }
          if (this.time - g > 30) this.sc.disqualify("Quá 30 giây từ khi đèn xanh không qua ngã tư")
        }
        if (front.x < Y.lightEnd && atBox) {
          this.light = "green"
          this.next(5)
        }
        break
      }
      case 5: {
        // Bài 6: đường vòng quanh co
        if (front.x < Y.sX1 - 1) this.next(6)
        break
      }
      case 6:
      case 7: {
        // Bài 7 & 8: ghép xe dọc / ngang
        const bay = this.ex === 6 ? GARAGE_BAY : PARALLEL_BAY
        const corners = car.points().corners
        const inside = corners.every((p) => shapeMargin(bay, p) > -0.02)
        if (inside && stopped && !st.parked) {
          st.parked = true
          this.sc.sounds.push("done")
        }
        const leaveZ = this.ex === 6 ? 99 : 53
        if (center.z < leaveZ) {
          if (!st.parked) this.sc.disqualify("Chưa ghép được xe vào nơi đỗ")
          this.next(this.ex + 1)
        }
        break
      }
      case 8: {
        // Bài 9: tạm dừng ở chỗ có đường sắt
        const ahead = front.z - Y.railStop
        if (!st.done && stopped && ahead < 6) {
          st.done = true
          const j = this.judgeStop(ahead)
          if (j === "over") this.sc.deduct(5, "Dừng xe quá vạch dừng quy định")
          if (j === "short") this.sc.deduct(5, "Dừng xe chưa đến vạch dừng quy định")
          if (j === "ok") this.sc.sounds.push("done")
        }
        if (front.z < Y.rail - 3) {
          if (!st.done) this.sc.deduct(5, "Không dừng xe ở vạch dừng quy định")
          this.next(9)
        }
        break
      }
      case 9: {
        // Bài 10: 25 m đầu tăng lên trên 24 km/h, 25 m sau giảm lại
        if (front.z < Y.speed.z0 && front.z > Y.speed.zMid && car.kmh > 24) st.up = true
        if (front.z < Y.speed.zMid && st.up && car.kmh < 24) st.down = true
        if (front.z < Y.speed.z1) {
          if (!st.up) this.sc.deduct(5, "Không tăng tốc độ trên 24 km/h trong 25 m đầu")
          else if (!st.down) this.sc.deduct(5, "Không giảm tốc độ trong 25 m còn lại")
          this.next(10)
        }
        break
      }
      case 10: {
        // Bài 11: kết thúc
        if (Math.abs(center.z + 30) < 5 && front.x > Y.endLine) {
          if (car.signal !== "right") this.sc.deduct(5, "Không bật đèn xi nhan phải khi qua vạch kết thúc")
          this.finish(this.sc.score >= PASS_SCORE)
        }
        break
      }
    }
    void dt
  }

  private finish(passed: boolean) {
    if (this.status !== "running") return
    this.status = passed ? "passed" : "failed"
    this.alarm = false
    this.sc.sounds.push(passed ? "done" : "fatal")
  }

  progress() {
    return { done: this.status === "passed" ? 11 : this.ex, total: 11 }
  }

  instruction(car: Car): Instruction {
    if (this.status === "ready")
      return {
        title: "Chuẩn bị xuất phát",
        detail: "Thắt dây an toàn (B), nhả phanh tay (Space), về số D (phím 4). Bấm “Nhận lệnh xuất phát”, bật xi nhan trái (Q) rồi đi trong 20 giây.",
      }
    if (this.status !== "running") return { title: "Kết thúc bài thi", detail: "" }
    if (this.alarm) return { title: "⚠ Tình huống nguy hiểm!", detail: "Phanh dừng xe trong 3 giây, bật đèn khẩn cấp (H) trong 5 giây. Hết báo động thì tắt đèn khẩn cấp rồi mới đi tiếp." }
    const front = car.points().frontCenter
    const title = `Bài ${this.ex + 1} · ${EX_NAMES[this.ex]}`
    switch (this.ex) {
      case 0:
        return { title, detail: "Bật xi nhan trái, qua vạch xuất phát; tắt xi nhan trong 5 m sau vạch.", toLine: Y.startLine - front.z }
      case 1:
        return { title, detail: "Dừng sao cho cản trước cách vạch dừng không quá 50 cm, không vượt vạch.", toLine: Y.crosswalkStop - front.z }
      case 2:
        return { title, detail: "Dừng trên dốc cách vạch ≤ 50 cm. Xe số tự động sẽ tụt dốc nếu nhả phanh — giữ phanh rồi chuyển sang ga, đi qua vạch trong 30 giây, không tụt quá 50 cm.", toLine: Y.hill.stop - front.z }
      case 3:
        return { title, detail: "Đi chậm, để bánh trước và sau bên phải đi trong vệt; qua hai góc vuông không đè vạch, trong 2 phút." }
      case 4:
        return { title, detail: `Đèn ${this.light === "red" ? "ĐỎ — dừng trước vạch (≤ 1 m)" : this.light === "yellow" ? "VÀNG" : "XANH — đi qua ngã tư trong 20 giây"}.`, toLine: front.x - Y.lightStop }
      case 5:
        return { title, detail: "Đi theo hình chữ S, không đè vạch, hoàn thành trong 2 phút." }
      case 6:
        return { title, detail: "Tiến quá ô đỗ bên phải, về số R (phím 2), lùi xe vào ô sao cho cả thân xe nằm trong ô và dừng lại; rồi về D tiến ra." }
      case 7:
        return { title, detail: "Dừng song song phía trước ô, về số R, lùi chéo vào ô bên phải rồi trả lái để xe nằm gọn trong ô; dừng lại rồi tiến ra." }
      case 8:
        return { title, detail: "Dừng trước vạch, cách vạch không quá 50 cm, rồi đi qua đường sắt.", toLine: front.z - Y.railStop }
      case 9:
        return { title, detail: "25 m đầu: tăng tốc trên 24 km/h. 25 m sau: giảm xuống dưới 24 km/h." }
      default:
        return { title, detail: "Bật xi nhan phải, đi qua vạch kết thúc.", toLine: Y.endLine - front.x }
    }
  }
}
