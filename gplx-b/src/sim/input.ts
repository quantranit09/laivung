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
  ["C", "Đổi góc nhìn"],
  [", / .", "Nhìn trái / phải"],
  ["Enter", "Nhận lệnh xuất phát"],
]

export class Input {
  held = new Set<Action>()
  /** Nút cảm ứng: giá trị analog trực tiếp, ưu tiên hơn bàn phím khi khác 0 */
  touch = { throttle: 0, brake: 0, steer: 0 }
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
    return (this.held.has("lookLeft") ? 1 : 0) - (this.held.has("lookRight") ? 1 : 0)
  }

  read(dt: number): Controls {
    const approach = (cur: number, target: number, up: number, down: number) =>
      target > cur ? Math.min(target, cur + up * dt) : Math.max(target, cur - down * dt)
    this.throttle = approach(this.throttle, this.held.has("throttle") ? 1 : 0, 1.6, 4)
    this.brake = approach(this.brake, this.held.has("brake") ? 1 : 0, 3, 6)
    const steerTarget = (this.held.has("left") ? 1 : 0) - (this.held.has("right") ? 1 : 0)
    // Đánh lái chậm ở giữa để dễ chỉnh, trả lái nhanh hơn khi buông phím.
    this.steer = approach(this.steer, steerTarget, steerTarget ? 1.4 : 2.5, steerTarget ? 1.4 : 2.5)
    return {
      throttle: clamp(this.touch.throttle || this.throttle, 0, 1),
      brake: clamp(this.touch.brake || this.brake, 0, 1),
      steer: clamp(this.touch.steer || this.steer, -1, 1),
    }
  }
}
