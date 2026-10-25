/** Dựng hình học three.js từ dữ liệu 2D của bản đồ. */
import * as THREE from "three"
import { add, leftOf, mul, norm, sub, unionMargin, type Shape, type V2 } from "./geom"

type H = (p: V2) => number

function normals(pts: V2[]) {
  return pts.map((_, i) => {
    const a = pts[Math.max(0, i - 1)], b = pts[Math.min(pts.length - 1, i + 1)]
    return leftOf(norm(sub(b, a)))
  })
}

/** Dải mặt đường bám theo đường gấp khúc, có "váy" thẳng đứng xuống đất ở đoạn dốc. */
export function ribbonGeometry(pts: V2[], width: number, h: H, lift = 0.02) {
  const n = normals(pts)
  const pos: number[] = []
  const idx: number[] = []
  pts.forEach((p, i) => {
    const l = add(p, mul(n[i], width / 2)), r = add(p, mul(n[i], -width / 2))
    pos.push(l.x, h(l) + lift, l.z, r.x, h(r) + lift, r.z)
    if (i) {
      const a = (i - 1) * 2
      idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2)
    }
  })
  // Váy hai bên (chỉ có tác dụng ở đoạn cao hơn mặt đất).
  const base = pos.length / 3
  pts.forEach((p, i) => {
    for (const side of [1, -1]) {
      const q = add(p, mul(n[i], (side * width) / 2))
      pos.push(q.x, h(q) + lift, q.z, q.x, 0, q.z)
    }
    if (i) {
      const a = base + (i - 1) * 4, b = base + i * 4
      idx.push(a, a + 1, b, a + 1, b + 1, b, a + 2, b + 2, a + 3, a + 3, b + 2, b + 3)
    }
  })
  const g = new THREE.BufferGeometry()
  g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3))
  g.setIndex(idx)
  g.computeVertexNormals()
  return g
}

export function polyGeometry(pts: V2[], lift = 0.021) {
  const s = new THREE.Shape(pts.map((p) => new THREE.Vector2(p.x, -p.z)))
  const g = new THREE.ShapeGeometry(s)
  g.rotateX(-Math.PI / 2)
  g.translate(0, lift, 0)
  return g
}

/** Các vạch sơn dạng dải: mỗi dải là một đoạn [a, b] với bề rộng w. */
export function stripsGeometry(segs: { a: V2; b: V2; w: number }[], h: H, lift = 0.035) {
  const pos: number[] = []
  const idx: number[] = []
  for (const { a, b, w } of segs) {
    const n = mul(leftOf(norm(sub(b, a))), w / 2)
    const q = [add(a, n), sub(a, n), add(b, n), sub(b, n)]
    const k = pos.length / 3
    for (const p of q) pos.push(p.x, h(p) + lift, p.z)
    idx.push(k, k + 1, k + 2, k + 1, k + 3, k + 2)
  }
  const g = new THREE.BufferGeometry()
  g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3))
  g.setIndex(idx)
  g.computeVertexNormals()
  return g
}

/** Vạch giới hạn: mép của hợp các hình, bỏ đoạn nằm lọt trong hình khác (chỗ nối). */
export function boundarySegments(shapes: Shape[], w = 0.15, step = 0.5) {
  const out: { a: V2; b: V2; w: number }[] = []
  const pushEdge = (pts: V2[]) => {
    for (let i = 0; i < pts.length - 1; i++) {
      const a = pts[i], b = pts[i + 1]
      const L = Math.hypot(b.x - a.x, b.z - a.z)
      const n = Math.max(1, Math.ceil(L / step))
      for (let k = 0; k < n; k++) {
        const p = add(a, mul(sub(b, a), k / n)), q = add(a, mul(sub(b, a), (k + 1) / n))
        const mid = mul(add(p, q), 0.5)
        if (unionMargin(shapes, mid) < 0.05) out.push({ a: p, b: q, w })
      }
    }
  }
  for (const s of shapes) {
    if (s.kind === "poly") pushEdge([...s.pts, s.pts[0]])
    else {
      const n = normals(s.pts)
      pushEdge(s.pts.map((p, i) => add(p, mul(n[i], s.width / 2))))
      pushEdge(s.pts.map((p, i) => add(p, mul(n[i], -s.width / 2))))
    }
  }
  return out
}

/** Vạch ngang qua đường tại điểm `at`, vuông góc với hướng đi `heading`. */
export function crossLine(at: V2, heading: number, width: number, thick = 0.4) {
  const d = { x: Math.sin(heading), z: Math.cos(heading) }
  const l = leftOf(d)
  return { a: add(at, mul(l, width / 2)), b: add(at, mul(l, -width / 2)), w: thick }
}

/** Vạch đi bộ (zebra). */
export function zebra(at: V2, heading: number, width: number, depth = 4) {
  const d = { x: Math.sin(heading), z: Math.cos(heading) }
  const l = leftOf(d)
  const out: { a: V2; b: V2; w: number }[] = []
  for (let s = -width / 2 + 0.3; s < width / 2; s += 1) {
    const c = add(at, mul(l, s))
    out.push({ a: add(c, mul(d, -depth / 2)), b: add(c, mul(d, depth / 2)), w: 0.5 })
  }
  return out
}

const labelCache = new Map<string, THREE.CanvasTexture>()
/** Biển chữ (hỗ trợ tiếng Việt bằng font hệ thống). */
export function labelTexture(text: string, bg = "#1d4ed8", fg = "#fff") {
  const key = text + bg + fg
  const hit = labelCache.get(key)
  if (hit) return hit
  const c = document.createElement("canvas")
  c.width = 512
  c.height = 160
  const g = c.getContext("2d")!
  g.fillStyle = bg
  g.beginPath()
  g.roundRect(4, 4, 504, 152, 24)
  g.fill()
  g.strokeStyle = "#fff"
  g.lineWidth = 8
  g.stroke()
  g.fillStyle = fg
  g.font = "bold 64px 'Be Vietnam Pro', system-ui, sans-serif"
  g.textAlign = "center"
  g.textBaseline = "middle"
  g.fillText(text, 256, 84, 470)
  const t = new THREE.CanvasTexture(c)
  t.colorSpace = THREE.SRGBColorSpace
  t.anisotropy = 4
  labelCache.set(key, t)
  return t
}
