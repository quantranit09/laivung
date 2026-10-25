/**
 * Gộp bàn phím và nút cảm ứng thành bộ điều khiển analog.
 * Bàn phím: ga/phanh tăng giảm dần như đạp chân thật, vô lăng tự trả về giữa khi buông.
 */
import { clamp } from "./geom"
import type { Controls } from "./car"

export type Action =
  | "throttle"
  | "brake"
  | "left"
  | "right"
  | "lookLeft"
  | "lookRight"

export type Command =
  | "gearP"
  | "gearR"
  | "gearN"
  | "gearD"
  | "signalLeft"
  | "signalRight"
  | "hazard"
  | "seatbelt"
  | "handbrake"
  | "camera"
  | "engine"
  | "begin"
  | "pause"

const KEYS: Record<string, Action> = {
  KeyW: "throttle",
  ArrowUp: "throttle",
  KeyS: "brake",
  ArrowDown: "brake",
  KeyA: "left",
  ArrowLeft: "left",
  KeyD: "right",
  ArrowRight: "right",
  Comma: "lookLeft",
  Period: "lookRight",
}

const COMMANDS: Record<string, Command> = {
  Digit1: "gearP",
  Digit2: "gearR",
  Digit3: "gearN",
  Digit4: "gearD",
  KeyQ: "signalLeft",
  KeyE: "signalRight",
  KeyH: "hazard",
  KeyB: "seatbelt",
  Space: "handbrake",
  KeyC: "camera",
  KeyK: "engine",
  Enter: "begin",
  Escape: "pause",
}

export const KEY_HELP: [string, string][] = [
  ["W / ↑", "Ga"],
  ["S / ↓", "Phanh"],
  ["A D / ← →", "Đánh lái"],
  ["1 2 3 4", "Số P · R · N · D"],
  ["Space", "Phanh tay"],
  ["Q / E", "Xi nhan trái / phải"],
  ["H", "Đèn cảnh báo nguy hiểm"],
  ["B", "Dây an toàn"],
  ["K", "Khởi động / tắt xe"],
  ["C", "Đổi góc nhìn"],
  [", / .", "Nhìn trái / phải"],
  ["Enter", "Nhận lệnh xuất phát"],
]

export type Sensitivity = "low" | "normal" | "high"
const SENS = { low: 0.6, normal: 1, high: 1.45 }

export class Input {
  held = new Set<Action>()
  /** Nút cảm ứng: giá trị analog trực tiếp, ưu tiên hơn bàn phím khi khác 0 */
  touch = { throttle: 0, brake: 0, steer: 0 }
  /** Lái bằng chuột: vị trí ngang của chuột (-1..1) điều khiển vô lăng; null = tắt */
  mouseSteer: number | null = null
  sensitivity: Sensitivity = "normal"
  /** Kéo chuột để quay đầu nhìn (radian, cộng thêm vào phím , .) */
  lookDrag = 0
  private throttle = 0
  private brake = 0
  private steer = 0
  private queue: Command[] = []

  onKey = (e: KeyboardEvent, down: boolean) => {
    if (e.target instanceof HTMLInputElement || e.metaKey || e.ctrlKey) return
    const a = KEYS[e.code]
    if (a) {
      e.preventDefault()
      if (down) this.held.add(a)
      else this.held.delete(a)
      return
    }
    const c = COMMANDS[e.code]
    if (c && down && !e.repeat) {
      e.preventDefault()
      this.queue.push(c)
    }
  }

  push(c: Command) {
    this.queue.push(c)
  }

  drain(): Command[] {
    const q = this.queue
    this.queue = []
    return q
  }

  get look() {
    return (this.held.has("lookLeft") ? 1 : 0) - (this.held.has("lookRight") ? 1 : 0) + this.lookDrag
  }

  /** Trả vô lăng về giữa ngay (nút "Giữa"). */
  centerSteer() {
    this.steer = 0
  }

  read(dt: number): Controls {
    const approach = (cur: number, target: number, up: number, down: number) =>
      target > cur ? Math.min(target, cur + up * dt) : Math.max(target, cur - down * dt)
    this.throttle = approach(this.throttle, this.held.has("throttle") ? 1 : 0, 1.6, 4)
    this.brake = approach(this.brake, this.held.has("brake") ? 1 : 0, 3, 6)
    const steerTarget = (this.held.has("left") ? 1 : 0) - (this.held.has("right") ? 1 : 0)
    // Giữ phím thì vô lăng xoay dần (~1,2 giây hết lái); buông phím thì vô lăng tự hồi về
    // giữa (~0,9 giây), giống lực hồi lái của xe thật.
    const k = SENS[this.sensitivity]
    this.steer = approach(this.steer, steerTarget, steerTarget ? 0.85 * k : 1.1 * k, steerTarget ? 0.85 * k : 1.1 * k)
    // Đường cong đáp ứng: chạm nhẹ chỉ đánh lái ít, giữ lâu mới đánh mạnh.
    const curved = Math.sign(this.steer) * Math.pow(Math.abs(this.steer), 1.6)
    const mouse = this.mouseSteer === null ? 0 : Math.sign(this.mouseSteer) * Math.pow(Math.abs(this.mouseSteer), 1.3)
    return {
      throttle: clamp(this.touch.throttle || this.throttle, 0, 1),
      brake: clamp(this.touch.brake || this.brake, 0, 1),
      steer: clamp(this.touch.steer || (this.mouseSteer !== null && !steerTarget ? mouse : curved), -1, 1),
    }
  }
}
