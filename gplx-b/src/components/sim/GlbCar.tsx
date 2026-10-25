/**
 * Xe từ mô hình 3D thật (file .glb trong public/sim/models/). Mô hình nào cũng được:
 * tự xoay cho chiều dài nằm dọc trục z, tự nhận đầu/đuôi xe theo vị trí bánh, tự co
 * giãn để chiều dài cơ sở khớp với thông số vật lý, rồi tách 4 bánh ra để quay và đánh lái.
 */
import { useMemo, useRef } from "react"
import { useFrame } from "@react-three/fiber"
import { useGLTF } from "@react-three/drei"
import * as THREE from "three"
import { ContactShadow } from "./ContactShadow"
import type { Car, CarSpec } from "@/sim/car"

/** Tên bộ phận bánh xe — so khớp theo từng từ ("rim" không khớp nhầm "trim"). */
const WHEEL_WORD = /(^|[^a-z])(wheels?|tires?|tyres?|rims?|caliper|whl|banh|lop)([^a-z]|$)/
const WHEEL_NAME = { test: (name: string) => WHEEL_WORD.test(name.replace(/([a-z])([A-Z])/g, "$1_$2").toLowerCase()) }
const BRAKE_NAME = /(tail|brake|stop|rear).*(light|lamp)|taillight|brakelight|backlight|rear_?lamp/i

interface Rig {
  root: THREE.Group
  front: THREE.Group[]
  spins: THREE.Group[]
  brakeMats: THREE.MeshStandardMaterial[]
  /** Lớp phủ đúng hình cụm đèn hậu/xi nhan (dò từ màu ảnh vân của mô hình) */
  lamps: Lamps | null
  /** Toạ độ (trong khung xe) để gắn đèn phanh/xi nhan phụ khi mô hình không có vật liệu đèn rõ ràng */
  rearZ: number
  frontZ: number
  halfWidth: number
  height: number
}

/** max/min không dùng spread — mô hình có hàng chục nghìn đỉnh sẽ tràn ngăn xếp. */
const maxOf = (xs: number[], d = -Infinity) => xs.reduce((m, x) => (x > m ? x : m), d)
const minOf = (xs: number[], d = Infinity) => xs.reduce((m, x) => (x < m ? x : m), d)

function bbox(o: THREE.Object3D) {
  o.updateMatrixWorld(true)
  return new THREE.Box3().setFromObject(o)
}

/** Bộ phận trong cabin trùng tên "wheel" (vô lăng…) — không phải bánh xe. */
const NOT_WHEEL = /steer|spare|dashboard|interior|vo_?lang/i

function isWheel(o: THREE.Object3D) {
  for (let p: THREE.Object3D | null = o; p; p = p.parent) {
    if (NOT_WHEEL.test(p.name)) return false
    if (WHEEL_NAME.test(p.name)) return true
  }
  return false
}

/**
 * Mô hình gộp bánh xe chung một khối với thân xe (không có tên riêng): tìm 4 bánh theo hình học
 * — điểm chạm đất ở 4 góc, dò bán kính lốp bằng cách tìm vòng tròn khớp nhiều đỉnh nhất —
 * rồi cắt các tam giác nằm trong hình trụ bánh ra thành khối riêng.
 * Toạ độ đã ở khung xe (root đặt tại gốc), nên chỉ cần ma trận thế giới của từng mesh.
 */
function worldPoints(root: THREE.Object3D) {
  root.updateMatrixWorld(true)
  const meshes: THREE.Mesh[] = []
  root.traverse((o) => (o as THREE.Mesh).isMesh && meshes.push(o as THREE.Mesh))
  const pts: THREE.Vector3[] = []
  const per = meshes.map((m) => {
    const pos = m.geometry.getAttribute("position")
    const arr: THREE.Vector3[] = []
    for (let i = 0; i < pos.count; i++) arr.push(new THREE.Vector3().fromBufferAttribute(pos, i).applyMatrix4(m.matrixWorld))
    pts.push(...arr)
    return arr
  })
  return { meshes, pts, per }
}

interface Lamps {
  brake: THREE.BufferGeometry
  /** Xi nhan: tách theo bên trái/phải (đầu xe: mảng màu hổ phách; đuôi xe: nửa dưới cụm đèn hậu) */
  left: THREE.BufferGeometry
  right: THREE.BufferGeometry
}

/** Đọc điểm ảnh của ảnh vân (ImageBitmap/HTMLImage) — chỉ chạy trong trình duyệt. */
function pixelReader(tex: THREE.Texture | null | undefined) {
  const img = tex?.image as (CanvasImageSource & { width: number; height: number }) | undefined
  if (!img || typeof document === "undefined" || !img.width) return null
  const w = Math.min(512, img.width), h = Math.min(512, img.height)
  const c = document.createElement("canvas")
  c.width = w
  c.height = h
  const g = c.getContext("2d", { willReadFrequently: true })
  if (!g) return null
  g.drawImage(img, 0, 0, w, h)
  const data = g.getImageData(0, 0, w, h).data
  const flip = tex!.flipY
  return (u: number, v: number) => {
    const x = Math.min(w - 1, Math.max(0, Math.floor((((u % 1) + 1) % 1) * w)))
    const yy = (((v % 1) + 1) % 1) * h
    const y = Math.min(h - 1, Math.max(0, Math.floor(flip ? h - 1 - yy : yy)))
    const i = (y * w + x) * 4
    return [data[i] / 255, data[i + 1] / 255, data[i + 2] / 255] as const
  }
}

/**
 * Dò các tam giác thuộc cụm đèn: ở đuôi xe, độ cao cụm đèn, phía ngoài, có màu đỏ trong ảnh vân.
 * Trả về hình học phủ sát (đẩy ra ngoài 1,5 cm, qua lớp kính đèn) để làm sáng đúng hình chiếc đèn khi phanh.
 */
const PUSH = 0.015

function detectLamps(root: THREE.Group, rearZ: number, frontZ: number, H: number, bodyHalf: number): Lamps | null {
  root.updateMatrixWorld(true)
  const brake: number[] = [], left: number[] = [], right: number[] = []
  const a = new THREE.Vector3(), b = new THREE.Vector3(), c = new THREE.Vector3()
  const n = new THREE.Vector3(), mid = new THREE.Vector3()
  let found = false
  root.traverse((o) => {
    const m = o as THREE.Mesh
    if (!m.isMesh) return
    const mat = (Array.isArray(m.material) ? m.material[0] : m.material) as THREE.MeshStandardMaterial
    const read = pixelReader(mat?.map)
    const uv = m.geometry.getAttribute("uv")
    if (!read || !uv) return
    const pos = m.geometry.getAttribute("position")
    const idx = m.geometry.index
    const count = idx ? idx.count : pos.count
    for (let t = 0; t < count; t += 3) {
      const i0 = idx ? idx.getX(t) : t, i1 = idx ? idx.getX(t + 1) : t + 1, i2 = idx ? idx.getX(t + 2) : t + 2
      a.fromBufferAttribute(pos, i0).applyMatrix4(m.matrixWorld)
      b.fromBufferAttribute(pos, i1).applyMatrix4(m.matrixWorld)
      c.fromBufferAttribute(pos, i2).applyMatrix4(m.matrixWorld)
      mid.copy(a).add(b).add(c).multiplyScalar(1 / 3)
      const rear = mid.z < rearZ + 0.45
      const front = mid.z > frontZ - 0.45
      if ((!rear && !front) || mid.y < 0.38 * H || mid.y > 0.85 * H || Math.abs(mid.x) < 0.3 * bodyHalf) continue
      const u = (uv.getX(i0) + uv.getX(i1) + uv.getX(i2)) / 3
      const v = (uv.getY(i0) + uv.getY(i1) + uv.getY(i2)) / 3
      const [r, g, bl] = read(u, v)
      const red = r > 0.35 && r > g * 1.7 && r > bl * 1.7
      const amber = r > 0.55 && g > 0.25 && g < r * 0.8 && bl < g * 0.6
      if (!(rear && red) && !(front && amber)) continue
      // đẩy ra ngoài theo pháp tuyến mặt (hướng ra xa tâm xe) để nằm trên lớp kính đèn trong suốt phía trước
      n.subVectors(b, a).cross(c.clone().sub(a)).normalize()
      if (n.dot(mid.clone().sub(new THREE.Vector3(0, H / 2, (rearZ + frontZ) / 2))) < 0) n.negate()
      const push = (arr: number[]) => [a, b, c].forEach((p) => arr.push(p.x + n.x * PUSH, p.y + n.y * PUSH, p.z + n.z * PUSH))
      if (rear) push(brake)
      // xi nhan: đầu xe là mảng hổ phách, đuôi xe dùng nửa dưới cụm đèn hậu
      if (front || mid.y < 0.6 * H) push(mid.x > 0 ? left : right)
      found = true
    }
  })
  if (!found || brake.length < 9 * 4) return null
  const geo = (arr: number[]) => {
    const g = new THREE.BufferGeometry()
    g.setAttribute("position", new THREE.Float32BufferAttribute(arr, 3))
    return g
  }
  return { brake: geo(brake), left: geo(left), right: geo(right) }
}

/** Tìm 4 bánh theo hình học (không cần tên). Trả về tâm bánh trong hệ toạ độ của `obj`. */
function detectWheels(pts: THREE.Vector3[]) {
  const box = new THREE.Box3().setFromPoints(pts)
  const cz = (box.min.z + box.max.z) / 2
  const wheels: { x: number; z: number; r: number; side: 1 | -1 }[] = []
  for (const sx of [1, -1] as const)
    for (const sz of [1, -1]) {
      const ground = pts.filter((p) => p.y < box.min.y + 0.03 && Math.sign(p.x) === sx && Math.sign(p.z - cz) === sz)
      if (ground.length < 3) return null
      const z = ground.reduce((a, p) => a + p.z, 0) / ground.length
      const xOuter = maxOf(ground.map((p) => Math.abs(p.x)))
      const near = pts.filter((p) => Math.sign(p.x) === sx && Math.abs(p.x) > xOuter - 0.3 && Math.abs(p.z - z) < 0.7 && p.y < box.min.y + 1)
      // Lốp tiếp đất nên tâm ở độ cao r. Đếm đỉnh nằm trên từng vòng tròn bán kính r: mâm + lốp
      // cho nhiều đỉnh, khe hở giữa lốp và vòm bánh cho rất ít, rồi vòm bánh lại nhiều.
      // Mép lốp = ngay trước chỗ trũng nhất (tỉ lệ theo chiều dài xe: lốp ~7–9% chiều dài).
      const scale = box.max.z - box.min.z
      let minN = Infinity, minR = 0.08 * scale
      for (let r = 0.07 * scale; r <= 0.092 * scale; r += 0.0015 * scale) {
        let n = 0
        for (const p of near) if (Math.abs(Math.hypot(p.y - box.min.y - r, p.z - z) - r) < 0.002 * scale) n++
        if (n < minN) {
          minN = n
          minR = r
        }
      }
      const r = minR - 0.003 * scale
      wheels.push({ x: sx * (xOuter - 0.03 * scale), z, r, side: sx })
    }
  // Bốn bánh cùng cỡ: dùng trung vị để một bánh dò lệch không làm méo
  const rs = wheels.map((w) => w.r).sort((p, q) => p - q)
  const rMed = (rs[1] + rs[2]) / 2
  wheels.forEach((w) => (w.r = rMed))
  return { wheels, groundY: box.min.y, scale: box.max.z - box.min.z }
}

function splitWheels(root: THREE.Group) {
  const { meshes, pts, per } = worldPoints(root)
  const det = detectWheels(pts)
  if (!det) return null
  const { wheels } = det
  const box = { min: { y: det.groundY } }
  const inWheel = (p: THREE.Vector3) =>
    wheels.findIndex((w) => Math.sign(p.x) === w.side && Math.abs(p.x) > Math.abs(w.x) - 0.075 * det.scale && Math.hypot(p.y - box.min.y - w.r, p.z - w.z) < w.r * 1.04)
  const groups: THREE.Mesh[][] = wheels.map(() => [])
  meshes.forEach((m, mi) => {
    const g = m.geometry
    const index = g.index ? Array.from(g.index.array) : Array.from({ length: g.getAttribute("position").count }, (_, i) => i)
    const keep: number[] = []
    const parts: number[][] = wheels.map(() => [])
    for (let t = 0; t < index.length; t += 3) {
      const ids = [index[t], index[t + 1], index[t + 2]]
      const w = inWheel(per[mi][ids[0]])
      if (w >= 0 && ids.every((i) => inWheel(per[mi][i]) === w)) parts[w].push(...ids)
      else keep.push(...ids)
    }
    if (parts.every((p) => !p.length)) return
    const sub = (idx: number[]) => {
      const ng = new THREE.BufferGeometry()
      for (const [k, v] of Object.entries(g.attributes)) ng.setAttribute(k, v)
      ng.setIndex(idx)
      return ng
    }
    const world = m.matrixWorld.clone()
    parts.forEach((idx, w) => {
      if (!idx.length) return
      const wm = new THREE.Mesh(sub(idx), m.material)
      wm.matrixAutoUpdate = true
      world.decompose(wm.position, wm.quaternion, wm.scale)
      groups[w].push(wm)
    })
    m.geometry = sub(keep)
  })
  if (groups.some((g) => !g.length)) return null
  return wheels.map((w, i) => ({ center: new THREE.Vector3(w.x, box.min.y + w.r, w.z), meshes: groups[i] }))
}

/** Chuẩn hoá mô hình về khung xe: trục sau ở gốc, mặt đất y = 0, đầu xe hướng +z, bên trái +x. */
export function rig(source: THREE.Object3D, spec: CarSpec, flip: boolean): Rig {
  const model = source.clone(true)
  const inner = new THREE.Group()
  inner.add(model)
  // 1) Chiều dài nằm theo z
  let b = bbox(inner)
  let size = b.getSize(new THREE.Vector3())
  if (size.x > size.z) {
    inner.rotation.y = Math.PI / 2
    b = bbox(inner)
    size = b.getSize(new THREE.Vector3())
  }
  const holder = new THREE.Group()
  holder.add(inner)

  // 2) Tìm bánh xe theo tên, gom theo 4 góc
  const center = b.getCenter(new THREE.Vector3())
  const quads: Record<string, THREE.Mesh[]> = {}
  inner.traverse((o) => {
    if (!(o as THREE.Mesh).isMesh || !isWheel(o)) return
    const c = new THREE.Box3().setFromObject(o).getCenter(new THREE.Vector3())
    const key = `${c.x > center.x ? "L" : "R"}${c.z > center.z ? "F" : "B"}`
    ;(quads[key] ??= []).push(o as THREE.Mesh)
  })
  const quadCenter = (k: string) => {
    const box = new THREE.Box3()
    quads[k]?.forEach((m) => box.union(new THREE.Box3().setFromObject(m)))
    return box
  }
  const hasWheels = ["LF", "RF", "LB", "RB"].every((k) => quads[k]?.length)
  let wheelbase = 0
  let frontIsPlusZ = true
  const geo = hasWheels ? null : detectWheels(worldPoints(inner).pts)
  if (geo) {
    const zs = geo.wheels.map((w) => w.z).sort((p, q) => p - q)
    const zB = (zs[0] + zs[1]) / 2, zF = (zs[2] + zs[3]) / 2
    wheelbase = zF - zB
    frontIsPlusZ = b.max.z - zF >= zB - b.min.z
  }
  if (hasWheels) {
    const zF = (quadCenter("LF").getCenter(new THREE.Vector3()).z + quadCenter("RF").getCenter(new THREE.Vector3()).z) / 2
    const zB = (quadCenter("LB").getCenter(new THREE.Vector3()).z + quadCenter("RB").getCenter(new THREE.Vector3()).z) / 2
    wheelbase = Math.abs(zF - zB)
    // Phần nhô phía trước (đầu xe → trục trước) thường dài hơn phía sau ở xe du lịch
    const overF = b.max.z - zF, overB = zB - b.min.z
    frontIsPlusZ = overF >= overB
  }
  if (!frontIsPlusZ !== flip) inner.rotation.y += Math.PI

  // 3) Co giãn: ưu tiên khớp chiều dài cơ sở, nếu không tìm được bánh thì khớp chiều dài xe
  const s = wheelbase > 0 ? spec.wheelbase / wheelbase : spec.length / size.z
  holder.scale.setScalar(s)
  b = bbox(holder)
  // 4) Đặt trục sau ở gốc
  let rearAxleZ = b.min.z + spec.rearOverhang
  if (geo) {
    const after = detectWheels(worldPoints(holder).pts)
    if (after) {
      const zs = after.wheels.map((w) => w.z).sort((p, q) => p - q)
      rearAxleZ = (zs[0] + zs[1]) / 2
    }
  }
  if (hasWheels) {
    // Sau khi xoay/co giãn, hai cụm bánh có z nhỏ nhất là bánh sau
    const zs = ["LB", "RB", "LF", "RF"].map((k) => quadCenter(k).getCenter(new THREE.Vector3()).z).sort((p, q) => p - q)
    rearAxleZ = (zs[0] + zs[1]) / 2
  }
  holder.position.set(-(b.min.x + b.max.x) / 2, -b.min.y, -rearAxleZ)
  const root = new THREE.Group()
  root.add(holder)
  root.updateMatrixWorld(true)
  b = bbox(root)

  // 5) Tách bánh vào trục quay riêng (giữ nguyên vị trí thế giới)
  const front: THREE.Group[] = []
  const spins: THREE.Group[] = []
  const split = hasWheels ? null : splitWheels(root)
  if (split) {
    for (const w of split) {
      const steer = new THREE.Group()
      steer.position.copy(w.center)
      const spin = new THREE.Group()
      steer.add(spin)
      root.add(steer)
      root.updateMatrixWorld(true)
      // Khối bánh đang ở toạ độ khung xe → đặt vào trục quay mà không đổi vị trí
      w.meshes.forEach((m) => {
        root.add(m)
        root.updateMatrixWorld(true)
        spin.attach(m)
      })
      spins.push(spin)
      if (w.center.z > spec.wheelbase / 2) front.push(steer)
    }
  }
  if (hasWheels) {
    for (const k of ["LF", "RF", "LB", "RB"]) {
      const box = quadCenter(k)
      const c = box.getCenter(new THREE.Vector3())
      const steer = new THREE.Group()
      steer.position.copy(c)
      const spin = new THREE.Group()
      steer.add(spin)
      root.add(steer)
      root.updateMatrixWorld(true)
      quads[k].forEach((m) => spin.attach(m))
      spins.push(spin)
      if (c.z > spec.wheelbase / 2) front.push(steer)
    }
  }

  const brakeMats: THREE.MeshStandardMaterial[] = []
  root.traverse((o) => {
    const m = o as THREE.Mesh
    if (!m.isMesh) return
    m.castShadow = true
    m.receiveShadow = false
    const mats = Array.isArray(m.material) ? m.material : [m.material]
    mats.forEach((mat) => {
      if (BRAKE_NAME.test(mat.name) || BRAKE_NAME.test(m.name)) {
        const std = mat as THREE.MeshStandardMaterial
        if (std.emissive) {
          std.emissive = new THREE.Color("#ff2020")
          brakeMats.push(std)
        }
      }
    })
  })
  // Đo bề mặt thật của đuôi/đầu xe ở độ cao cụm đèn, và bề rộng thân (dưới gương chiếu hậu)
  const pts = worldPoints(root).pts
  const H = b.max.y
  const bodyHalf = maxOf(pts.filter((p) => p.y < 0.45 * H && p.y > 0.2 * H).map((p) => Math.abs(p.x)))
  const at = (y: number) => pts.filter((p) => Math.abs(p.y - y) < 0.04 * H && Math.abs(p.x) > 0.55 * bodyHalf)
  const rearBand = at(0.66 * H), frontBand = at(0.55 * H)
  const rearZ = rearBand.length ? minOf(rearBand.map((p) => p.z)) : b.min.z
  const frontZ = frontBand.length ? maxOf(frontBand.map((p) => p.z)) : b.max.z
  return {
    root,
    front,
    spins,
    brakeMats,
    lamps: brakeMats.length ? null : detectLamps(root, b.min.z, b.max.z, H, bodyHalf),
    rearZ,
    frontZ,
    halfWidth: bodyHalf,
    height: H,
  }
}

/** Ảnh quầng sáng tròn mờ dần — dùng cho đèn phanh/xi nhan trên mô hình tải về. */
function glowTexture() {
  const c = document.createElement("canvas")
  c.width = c.height = 64
  const g = c.getContext("2d")!
  const grad = g.createRadialGradient(32, 32, 0, 32, 32, 32)
  grad.addColorStop(0, "rgba(255,255,255,1)")
  grad.addColorStop(0.25, "rgba(255,255,255,0.75)")
  grad.addColorStop(1, "rgba(255,255,255,0)")
  g.fillStyle = grad
  g.fillRect(0, 0, 64, 64)
  return new THREE.CanvasTexture(c)
}

export function GlbCar({ url, car, flip = false }: { url: string; car: React.RefObject<Car>; flip?: boolean }) {
  const gltf = useGLTF(url, false, true)
  const spec = car.current.spec
  const r = useMemo(() => rig(gltf.scene, spec, flip), [gltf, spec, flip])
  const root = useRef<THREE.Group>(null)
  const body = useRef<THREE.Group>(null)
  const brake = useRef<THREE.Object3D[]>([])
  const sig = useRef<{ l: THREE.Object3D[]; r: THREE.Object3D[] }>({ l: [], r: [] })
  const glow = useMemo(glowTexture, [])

  useFrame(({ clock }) => {
    const c = car.current
    if (!root.current) return
    root.current.position.set(c.pos.x, c.y, c.pos.z)
    root.current.rotation.set(-c.pitch, c.heading, 0, "YXZ")
    if (body.current) {
      body.current.rotation.x = c.dive
      body.current.rotation.z = c.roll
    }
    r.front.forEach((g) => (g.rotation.y = c.steer))
    r.spins.forEach((g) => (g.rotation.x = c.wheelSpin))
    const lit = c.braking || c.gear === "P"
    r.brakeMats.forEach((m) => (m.emissiveIntensity = lit ? 3 : 0.4))
    // Đèn phụ chỉ hiện khi đang sáng, để không lộ miếng phẳng trên thân xe
    brake.current.forEach((m) => (m.visible = c.braking))
    const on = Math.floor(clock.elapsedTime * 2.6) % 2 === 0
    sig.current.l.forEach((m) => (m.visible = on && (c.signal === "left" || c.hazard)))
    sig.current.r.forEach((m) => (m.visible = on && (c.signal === "right" || c.hazard)))
  })

  const keep = (list: THREE.Object3D[]) => (m: THREE.Object3D | null) => {
    if (m && !list.includes(m)) list.push(m)
  }
  const y = r.height * 0.66
  const W = r.halfWidth * 0.74
  return (
    <group ref={root}>
      <ContactShadow spec={spec} />
      <group ref={body}>
        <primitive object={r.root} />
        {/* Đèn sáng đúng hình cụm đèn của mô hình */}
        {r.lamps && (
          <>
            <mesh ref={keep(brake.current)} geometry={r.lamps.brake} visible={false}>
              <meshBasicMaterial color={[2.6, 0.05, 0.03]} toneMapped={false} transparent opacity={0.92} polygonOffset polygonOffsetFactor={-4} side={THREE.DoubleSide} />
            </mesh>
            <mesh ref={keep(sig.current.l)} geometry={r.lamps.left} visible={false}>
              <meshBasicMaterial color={[3, 1.05, 0.04]} toneMapped={false} polygonOffset polygonOffsetFactor={-4} side={THREE.DoubleSide} />
            </mesh>
            <mesh ref={keep(sig.current.r)} geometry={r.lamps.right} visible={false}>
              <meshBasicMaterial color={[3, 1.05, 0.04]} toneMapped={false} polygonOffset polygonOffsetFactor={-4} side={THREE.DoubleSide} />
            </mesh>
          </>
        )}
        {/* Không dò được đèn: quầng sáng nhỏ dự phòng */}
        {!r.lamps &&
          r.brakeMats.length === 0 &&
          [1, -1].map((s) => (
            <sprite key={s} ref={keep(brake.current)} visible={false} position={[s * W, y, r.rearZ - 0.05]} scale={0.2}>
              <spriteMaterial map={glow} color={[2.6, 0.18, 0.12]} blending={THREE.AdditiveBlending} depthWrite={false} toneMapped={false} transparent />
            </sprite>
          ))}
        {!r.lamps &&
          (
          [
            ["l", W, r.frontZ + 0.05, y - 0.1],
            ["r", -W, r.frontZ + 0.05, y - 0.1],
            ["l", W + 0.04, r.rearZ - 0.05, y],
            ["r", -W - 0.04, r.rearZ - 0.05, y],
          ] as const
        ).map(([s, x, z, yy], i) => (
          <sprite key={i} ref={keep(sig.current[s])} visible={false} position={[x, yy, z]} scale={0.16}>
            <spriteMaterial map={glow} color={[2.8, 1.3, 0.15]} blending={THREE.AdditiveBlending} depthWrite={false} toneMapped={false} transparent />
          </sprite>
        ))}
      </group>
    </group>
  )
}
