import { useEffect, useState } from "react"
import type { Sensitivity } from "@/sim/input"
import type { CameraMode } from "./World"

export interface SimPrefs {
  car: "vf6" | "sedan"
  color: string
  camera: CameraMode
  sensitivity: Sensitivity
  mouseSteer: boolean
  mirrors: boolean
  shadows: boolean
  /** Hiện thước khoảng cách tới vạch dừng (chế độ luyện tập) */
  assist: boolean
}

const DEFAULTS: SimPrefs = {
  car: "vf6",
  color: "#eef1f4",
  camera: "chase",
  sensitivity: "normal",
  mouseSteer: false,
  mirrors: true,
  shadows: true,
  assist: true,
}
const KEY = "laivung-sim-prefs"

function load(): SimPrefs {
  try {
    return { ...DEFAULTS, ...JSON.parse(localStorage.getItem(KEY) ?? "{}") }
  } catch {
    return DEFAULTS
  }
}

/** Tuỳ chọn mô phỏng lưu trên trình duyệt (chỉ là sở thích hiển thị, không cần đồng bộ). */
export function useSimPrefs() {
  const [prefs, setPrefs] = useState<SimPrefs>(load)
  useEffect(() => {
    try {
      localStorage.setItem(KEY, JSON.stringify(prefs))
    } catch {
      /* chế độ riêng tư: bỏ qua */
    }
  }, [prefs])
  return [prefs, (p: Partial<SimPrefs>) => setPrefs((s) => ({ ...s, ...p }))] as const
}

export const PAINTS = [
  { name: "Trắng", value: "#eef1f4" },
  { name: "Xám", value: "#7b828c" },
  { name: "Đỏ", value: "#b3192b" },
  { name: "Xanh", value: "#1e4fa3" },
  { name: "Đen", value: "#1b1d21" },
]
