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

/** Dải mặt đường bám theo đường gấp khúc; UV theo toạ độ thế giới để vân mặt đường liền mạch. */
export function ribbonGeometry(pts: V2[], width: number, h: H, lift = 0.02) {
  const n = normals(pts)
  const pos: number[] = []
  const uv: number[] = []
  const idx: number[] = []
  pts.forEach((p, i) => {
    const l = add(p, mul(n[i], width / 2)), r = add(p, mul(n[i], -width / 2))
    pos.push(l.x, h(l) + lift, l.z, r.x, h(r) + lift, r.z)
    uv.push(l.x / 4, l.z / 4, r.x / 4, r.z / 4)
    if (i) {
      const a = (i - 1) * 2
      idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2)
    }
  })
  const g = new THREE.BufferGeometry()
  g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3))
  g.setAttribute("uv", new THREE.Float32BufferAttribute(uv, 2))
  g.setIndex(idx)
  g.computeVertexNormals()
  return g
}

export function polyGeometry(pts: V2[], lift = 0.021) {
  const s = new THREE.Shape(pts.map((p) => new THREE.Vector2(p.x, -p.z)))
  const g = new THREE.ShapeGeometry(s)
  g.rotateX(-Math.PI / 2)
  g.translate(0, lift, 0)
  // UV theo toạ độ thế giới (cùng tỉ lệ với dải đường)
  const pos = g.getAttribute("position")
  const uv = new Float32Array(pos.count * 2)
  for (let i = 0; i < pos.count; i++) {
    uv[i * 2] = pos.getX(i) / 4
    uv[i * 2 + 1] = pos.getZ(i) / 4
  }
  g.setAttribute("uv", new THREE.BufferAttribute(uv, 2))
  return g
}

/** Vân nhiễu cho mặt đường / bãi cỏ (vẽ bằng canvas, không cần tải ảnh). */
export function noiseTexture(kind: "asphalt" | "grass" | "concrete") {
  const c = document.createElement("canvas")
  c.width = c.height = 256
  const g = c.getContext("2d")!
  const base = { asphalt: [74, 78, 84], grass: [88, 140, 64], concrete: [176, 176, 168] }[kind]
  const img = g.createImageData(256, 256)
  let seed = kind.length * 977
  const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647)
  for (let i = 0; i < 256 * 256; i++) {
    const n = (rnd() - 0.5) * (kind === "grass" ? 46 : 26)
    const blade = kind === "grass" && rnd() < 0.08 ? 22 : 0
    img.data[i * 4] = base[0] + n - blade * 0.3
    img.data[i * 4 + 1] = base[1] + n + blade
    img.data[i * 4 + 2] = base[2] + n - blade * 0.3
    img.data[i * 4 + 3] = 255
  }
  g.putImageData(img, 0, 0)
  const t = new THREE.CanvasTexture(c)
  t.wrapS = t.wrapT = THREE.RepeatWrapping
  t.colorSpace = THREE.SRGBColorSpace
  t.anisotropy = 8
  return t
}

/**
 * Vỉa đường sơn sọc đỏ–trắng chạy ngoài mép vạch giới hạn, có chiều cao thật.
 * `segs` lấy từ boundarySegments; phía ngoài được xác định bằng cách thử hai bên mép.
 */
export function curbGeometry(shapes: Shape[], segs: { a: V2; b: V2 }[], h: H, offset = 0.42, width = 0.3, height = 0.16) {
  const pos: number[] = []
  const col: number[] = []
  const idx: number[] = []
  const red = new THREE.Color("#c81e1e"), white = new THREE.Color("#f3f4f6")
  let run = 0
  for (const { a, b } of segs) {
    const d = norm(sub(b, a))
    let n = leftOf(d)
    const m = mul(add(a, b), 0.5)
    if (unionMargin(shapes, add(m, mul(n, 0.3))) > unionMargin(shapes, add(m, mul(n, -0.3)))) n = mul(n, -1)
    const segLen = Math.hypot(b.x - a.x, b.z - a.z)
    const c = Math.floor(run / 1) % 2 ? red : white
    run += segLen
    const inA = add(a, mul(n, offset - width / 2)), outA = add(a, mul(n, offset + width / 2))
    const inB = add(b, mul(n, offset - width / 2)), outB = add(b, mul(n, offset + width / 2))
    const ya = h(a), yb = h(b)
    const k = pos.length / 3
    // đỉnh trên (4) + mép trong (2 xuống đất)
    pos.push(inA.x, ya + height, inA.z, outA.x, ya + height, outA.z, inB.x, yb + height, inB.z, outB.x, yb + height, outB.z)
    pos.push(inA.x, ya, inA.z, inB.x, yb, inB.z)
    for (let i = 0; i < 6; i++) col.push(c.r, c.g, c.b)
    idx.push(k, k + 2, k + 1, k + 1, k + 2, k + 3, k + 4, k + 5, k, k, k + 5, k + 2)
  }
  const g = new THREE.BufferGeometry()
  g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3))
  g.setAttribute("color", new THREE.Float32BufferAttribute(col, 3))
  g.setIndex(idx)
  g.computeVertexNormals()
  return g
}

/** Ụ dốc: khối bê tông hình thang dưới đoạn đường dốc, mái taluy thoải ra hai bên. */
export function moundGeometry(x: number, z0: number, z1: number, topHalf: number, h: H, slope = 1.6, step = 0.5) {
  const pos: number[] = []
  const idx: number[] = []
  let rows = 0
  for (let z = z0; z <= z1 + 1e-6; z += step) {
    const y = h({ x, z })
    const spread = topHalf + y * slope
    pos.push(x + spread, 0, z, x + topHalf, y, z, x - topHalf, y, z, x - spread, 0, z)
    if (rows) {
      const a = (rows - 1) * 4, b = rows * 4
      for (let k = 0; k < 3; k++) idx.push(a + k, b + k, a + k + 1, a + k + 1, b + k, b + k + 1)
    }
    rows++
  }
  const g = new THREE.BufferGeometry()
  g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3))
  g.setIndex(idx)
  g.computeVertexNormals()
  return g
}

/** Chữ sơn trên mặt đường (XUẤT PHÁT, DỪNG, mũi tên…). */
export function roadTextTexture(text: string, color = "#ffffff") {
  const c = document.createElement("canvas")
  c.width = 512
  c.height = 128
  const g = c.getContext("2d")!
  g.fillStyle = color
  g.font = "bold 92px 'Be Vietnam Pro', system-ui, sans-serif"
  g.textAlign = "center"
  g.textBaseline = "middle"
  g.fillText(text, 256, 70, 500)
  const t = new THREE.CanvasTexture(c)
  t.colorSpace = THREE.SRGBColorSpace
  t.anisotropy = 8
  return t
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
