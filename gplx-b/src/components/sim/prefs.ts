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
  /** Phát tiếng động cơ/mô-tơ bám theo trạng thái xe. */
  engineSound: boolean
  /** Chất lượng hình ảnh: thấp = không hậu kỳ, không bóng; cao = bóng mềm + đổ bóng tiếp xúc */
  quality: "low" | "medium" | "high"
  /** Hiện thước khoảng cách tới vạch dừng (chế độ luyện tập) */
  assist: boolean
  /** Bộ nút trên màn hình: tự chọn theo thiết bị, chỉ dải trạng thái (bàn phím), hay đủ nút cảm ứng */
  controls: "auto" | "keyboard" | "touch"
  /** Dùng mô hình 3D tải về (public/sim/models/<xe>.glb) nếu có */
  useModel: boolean
  /** Xoay mô hình 180° nếu app đoán nhầm đầu/đuôi xe */
  flipModel: boolean
}

const DEFAULTS: SimPrefs = {
  car: "vf6",
  color: "#eef1f4",
  camera: "chase",
  sensitivity: "normal",
  mouseSteer: false,
  mirrors: true,
  engineSound: true,
  quality: "high",
  assist: true,
  controls: "auto",
  useModel: true,
  flipModel: false,
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
