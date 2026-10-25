/** Hình học 2D trên mặt đất: toạ độ (x, z) theo mét, trục y của three.js là chiều cao. */
export type V2 = { x: number; z: number }

export const v = (x: number, z: number): V2 => ({ x, z })
export const add = (a: V2, b: V2): V2 => ({ x: a.x + b.x, z: a.z + b.z })
export const sub = (a: V2, b: V2): V2 => ({ x: a.x - b.x, z: a.z - b.z })
export const mul = (a: V2, k: number): V2 => ({ x: a.x * k, z: a.z * k })
export const dot = (a: V2, b: V2) => a.x * b.x + a.z * b.z
export const len = (a: V2) => Math.hypot(a.x, a.z)
export const norm = (a: V2): V2 => {
  const l = len(a) || 1
  return { x: a.x / l, z: a.z / l }
}
/** Vector vuông góc phía bên trái của hướng a (với quy ước hướng = (sinθ, cosθ), bên trái là +x khi nhìn về +z). */
export const leftOf = (a: V2): V2 => ({ x: a.z, z: -a.x })
export const lerp = (a: number, b: number, t: number) => a + (b - a) * t
export const clamp = (x: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, x))
export const dir = (heading: number): V2 => ({ x: Math.sin(heading), z: Math.cos(heading) })
export const headingOf = (d: V2) => Math.atan2(d.x, d.z)
export const wrapAngle = (a: number) => Math.atan2(Math.sin(a), Math.cos(a))

/** Khoảng cách từ điểm p tới đoạn ab, kèm tham số t ∈ [0,1]. */
export function segDist(p: V2, a: V2, b: V2) {
  const ab = sub(b, a)
  const l2 = dot(ab, ab) || 1e-9
  const t = clamp(dot(sub(p, a), ab) / l2, 0, 1)
  const q = add(a, mul(ab, t))
  return { d: len(sub(p, q)), t, q }
}

/** Đường gấp khúc có bề rộng (một làn/đoạn đường). */
export interface Ribbon {
  kind: "ribbon"
  pts: V2[]
  width: number
}
/** Đa giác lồi/lõm bất kỳ (bãi đỗ, vùng mở rộng, ngã tư). */
export interface Poly {
  kind: "poly"
  pts: V2[]
}
export type Shape = Ribbon | Poly

export const rect = (x0: number, z0: number, x1: number, z1: number): Poly => ({
  kind: "poly",
  pts: [v(x0, z0), v(x1, z0), v(x1, z1), v(x0, z1)],
})

function polyContains(pts: V2[], p: V2) {
  let inside = false
  for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
    const a = pts[i], b = pts[j]
    if (a.z > p.z !== b.z > p.z && p.x < ((b.x - a.x) * (p.z - a.z)) / (b.z - a.z) + a.x) inside = !inside
  }
  return inside
}

/**
 * Khoảng cách có dấu tới mép hình: dương = nằm trong (cách mép bao nhiêu mét),
 * âm = nằm ngoài. Dùng để phát hiện bánh xe đè vạch / lên vỉa hè.
 */
export function shapeMargin(s: Shape, p: V2): number {
  if (s.kind === "ribbon") {
    let best = Infinity
    for (let i = 0; i < s.pts.length - 1; i++) best = Math.min(best, segDist(p, s.pts[i], s.pts[i + 1]).d)
    return s.width / 2 - best
  }
  let edge = Infinity
  for (let i = 0; i < s.pts.length; i++) edge = Math.min(edge, segDist(p, s.pts[i], s.pts[(i + 1) % s.pts.length]).d)
  return polyContains(s.pts, p) ? edge : -edge
}

export const unionMargin = (shapes: Shape[], p: V2) => shapes.reduce((m, s) => Math.max(m, shapeMargin(s, p)), -Infinity)

/**
 * Đường đi qua các điểm góc, bo tròn mỗi góc với bán kính r, lấy mẫu dày để vẽ và đo.
 */
export function roundedPath(corners: V2[], r: number, step = 1): V2[] {
  const out: V2[] = [corners[0]]
  for (let i = 1; i < corners.length - 1; i++) {
    const p0 = corners[i - 1], p1 = corners[i], p2 = corners[i + 1]
    const d0 = norm(sub(p1, p0)), d1 = norm(sub(p2, p1))
    const turn = Math.acos(clamp(dot(d0, d1), -1, 1))
    if (turn < 1e-3) {
      out.push(p1)
      continue
    }
    const t = Math.min(r * Math.tan(turn / 2), len(sub(p1, p0)) / 2, len(sub(p2, p1)) / 2)
    const a = sub(p1, mul(d0, t)), b = add(p1, mul(d1, t))
    const n = Math.max(4, Math.ceil((turn * r) / step))
    for (let k = 0; k <= n; k++) {
      const u = k / n
      // Bezier bậc hai qua góc: gần cung tròn, đủ mượt để lái.
      const q = add(add(mul(a, (1 - u) * (1 - u)), mul(p1, 2 * u * (1 - u))), mul(b, u * u))
      out.push(q)
    }
  }
  out.push(corners[corners.length - 1])
  return densify(out, step)
}

export function densify(pts: V2[], step: number): V2[] {
  const out: V2[] = [pts[0]]
  for (let i = 1; i < pts.length; i++) {
    const a = pts[i - 1], b = pts[i]
    const n = Math.max(1, Math.ceil(len(sub(b, a)) / step))
    for (let k = 1; k <= n; k++) out.push(add(a, mul(sub(b, a), k / n)))
  }
  return out
}

export function polylineLength(pts: V2[]) {
  let s = 0
  for (let i = 1; i < pts.length; i++) s += len(sub(pts[i], pts[i - 1]))
  return s
}

/** Điểm và hướng tại khoảng cách s dọc theo đường gấp khúc. */
export function pointAt(pts: V2[], s: number): { p: V2; d: V2 } {
  let acc = 0
  for (let i = 1; i < pts.length; i++) {
    const seg = len(sub(pts[i], pts[i - 1]))
    if (acc + seg >= s || i === pts.length - 1) {
      const t = seg ? clamp((s - acc) / seg, 0, 1) : 0
      const d = norm(sub(pts[i], pts[i - 1]))
      return { p: add(pts[i - 1], mul(sub(pts[i], pts[i - 1]), t)), d }
    }
    acc += seg
  }
  return { p: pts[0], d: v(0, 1) }
}
