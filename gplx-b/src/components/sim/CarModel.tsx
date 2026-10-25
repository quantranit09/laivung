/**
 * Mẫu xe 3D dựng bằng hình học (không dùng file mô hình có bản quyền):
 * - "vf6": SUV điện cỡ B theo kích thước VinFast VF6, dải LED chữ V trước/sau, mui đen.
 * - "sedan": sedan hạng B phổ thông.
 * Gốc toạ độ ở tâm trục sau trên mặt đất, hướng đi +z, bên trái người lái là +x.
 */
import { useMemo, useRef } from "react"
import { useFrame } from "@react-three/fiber"
import * as THREE from "three"
import { ContactShadow } from "./ContactShadow"
import type { Car, CarSpec } from "@/sim/car"

export interface MirrorTextures {
  left: THREE.Texture
  right: THREE.Texture
  center: THREE.Texture
}

/** Biên dạng hông xe (u: dọc xe tính từ trục sau, y: chiều cao). */
function profiles(spec: CarSpec) {
  const r = -spec.rearOverhang
  const f = spec.frontOverhang
  const L = spec.wheelbase
  const ar = spec.wheelRadius + 0.08
  const wy = spec.wheelRadius
  if (spec.id === "vf6") {
    return {
      bottom: 0.4,
      belt: 1.04,
      lower: [
        [r + 0.02, 0.62],
        [r + 0.01, 0.95],
        [r + 0.1, 1.04],
        [1.9, 1.05],
        [2.25, 1.03],
        [f - 0.22, 0.9],
        [f - 0.03, 0.78],
        [f, 0.56],
        [f - 0.06, 0.4],
      ],
      cabin: [
        [r + 0.1, 1.04],
        [r + 0.2, 1.36],
        [r + 0.5, 1.55],
        [1.15, spec.height],
        [1.5, spec.height - 0.03],
        [2.1, 1.08],
        [2.12, 1.04],
      ],
      ar,
      wy,
      L,
      r,
      f,
    }
  }
  return {
    bottom: 0.33,
    belt: 0.92,
    lower: [
      [r + 0.02, 0.55],
      [r, 0.85],
      [r + 0.2, 0.93],
      [L + 0.05, 0.93],
      [f - 0.25, 0.8],
      [f - 0.03, 0.7],
      [f, 0.5],
      [f - 0.06, 0.33],
    ],
    cabin: [
      [r + 0.35, 0.93],
      [r + 0.75, 1.15],
      [0.25, spec.height],
      [1.25, spec.height],
      [2.05, 0.95],
      [2.1, 0.93],
    ],
    ar,
    wy,
    L,
    r,
    f,
  }
}

function sideShape(p: ReturnType<typeof profiles>) {
  const s = new THREE.Shape()
  s.moveTo(p.r, p.bottom)
  // Hốc bánh sau và bánh trước
  s.lineTo(-p.ar, p.bottom)
  s.absarc(0, p.wy, p.ar, Math.PI, 0, true)
  s.lineTo(p.L - p.ar, p.bottom)
  s.absarc(p.L, p.wy, p.ar, Math.PI, 0, true)
  for (let i = p.lower.length - 1; i >= 0; i--) {
    // biên dạng được khai báo từ sau ra trước; đi ngược lại để khép kín
  }
  const pts = [...p.lower].reverse()
  // lower[] khai báo sau → trước; ta đang ở đáy phía trước nên đi từ điểm cuối (trước-dưới) lên trên rồi về sau
  for (const [u, y] of pts) s.lineTo(u, y)
  s.closePath()
  return s
}

/** Bo thon thân xe: hẹp dần về phía nóc (tumblehome) và ở hai đầu xe, tránh dáng "hộp". */
function taper(g: THREE.BufferGeometry, p: { r: number; f: number }, top: number, base: number, amount: number, ends = 0.06) {
  const pos = g.getAttribute("position")
  for (let i = 0; i < pos.count; i++) {
    const y = pos.getY(i), z = pos.getZ(i)
    const t = Math.min(1, Math.max(0, (y - base) / (top - base)))
    const e = Math.max(0, 1 - Math.min(z - p.r, p.f - z) / 0.6)
    pos.setX(i, pos.getX(i) * (1 - amount * t * t - ends * e * e))
  }
  g.computeVertexNormals()
}

function extrude(shape: THREE.Shape, width: number, bevel = 0.05) {
  const g = new THREE.ExtrudeGeometry(shape, {
    depth: width - bevel * 2,
    bevelEnabled: true,
    bevelThickness: bevel,
    bevelSize: bevel,
    bevelSegments: 4,
    curveSegments: 24,
  })
  // (u, y, w) → (x = -w, y, z = u), rồi căn giữa bề ngang
  g.rotateY(-Math.PI / 2)
  g.translate((width - bevel * 2) / 2, 0, 0)
  g.computeVertexNormals()
  return g
}

/** Hộp nối giữa hai điểm (dùng cho trụ A, thanh vô lăng…). */
function Beam({ a, b, w = 0.06, d = 0.05, color }: { a: THREE.Vector3; b: THREE.Vector3; w?: number; d?: number; color: string }) {
  const { pos, quat, len } = useMemo(() => {
    const dirv = b.clone().sub(a)
    const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), dirv.clone().normalize())
    return { pos: a.clone().add(b).multiplyScalar(0.5), quat: q, len: dirv.length() }
  }, [a, b])
  return (
    <mesh position={pos} quaternion={quat}>
      <boxGeometry args={[w, len, d]} />
      <meshStandardMaterial color={color} roughness={0.7} />
    </mesh>
  )
}

function Wheel({ spec, x, z, front, car }: { spec: CarSpec; x: number; z: number; front?: boolean; car: React.RefObject<Car> }) {
  const g = useRef<THREE.Group>(null)
  const spin = useRef<THREE.Group>(null)
  useFrame(() => {
    const c = car.current
    if (g.current && front) g.current.rotation.y = c.steer
    if (spin.current) spin.current.rotation.x = c.wheelSpin
  })
  const R = spec.wheelRadius
  const out = x > 0 ? 1 : -1
  return (
    <group ref={g} position={[x, R, z]}>
      <group ref={spin}>
        <mesh rotation-z={Math.PI / 2} castShadow>
          <cylinderGeometry args={[R, R, 0.235, 28]} />
          <meshStandardMaterial color="#1b1c1e" roughness={0.95} />
        </mesh>
        <mesh rotation-z={Math.PI / 2} position-x={out * 0.105}>
          <cylinderGeometry args={[R * 0.68, R * 0.68, 0.03, 28]} />
          <meshStandardMaterial color="#9aa0a8" metalness={0.85} roughness={0.3} />
        </mesh>
        {Array.from({ length: 5 }, (_, i) => (
          <mesh key={i} position-x={out * 0.122} rotation-x={(i * Math.PI * 2) / 5}>
            <boxGeometry args={[0.02, R * 1.3, 0.05]} />
            <meshStandardMaterial color="#2a2d31" metalness={0.6} roughness={0.4} />
          </mesh>
        ))}
        <mesh rotation-z={Math.PI / 2} position-x={out * 0.125}>
          <cylinderGeometry args={[0.06, 0.06, 0.02, 16]} />
          <meshStandardMaterial color="#d1d5db" metalness={0.9} roughness={0.2} />
        </mesh>
      </group>
    </group>
  )
}

/** Màn hình trung tâm (VF6 không có cụm đồng hồ sau vô lăng — tốc độ hiện trên màn hình giữa). */
function CenterScreen({ car, position, rotation }: { car: React.RefObject<Car>; position: [number, number, number]; rotation: [number, number, number] }) {
  const { tex, ctx } = useMemo(() => {
    const c = document.createElement("canvas")
    c.width = 256
    c.height = 160
    const t = new THREE.CanvasTexture(c)
    t.colorSpace = THREE.SRGBColorSpace
    return { tex: t, ctx: c.getContext("2d")! }
  }, [])
  const last = useRef("")
  useFrame(() => {
    const c = car.current
    const key = `${Math.round(c.kmh)}${c.gear}${c.signal}`
    if (key === last.current) return
    last.current = key
    ctx.fillStyle = "#0b1220"
    ctx.fillRect(0, 0, 256, 160)
    ctx.fillStyle = "#e5e7eb"
    ctx.font = "bold 72px system-ui, sans-serif"
    ctx.textAlign = "center"
    ctx.fillText(String(Math.round(c.kmh)), 128, 92)
    ctx.font = "20px system-ui, sans-serif"
    ctx.fillStyle = "#94a3b8"
    ctx.fillText("km/h", 128, 120)
    ctx.font = "bold 26px system-ui, sans-serif"
    ;(["P", "R", "N", "D"] as const).forEach((g, i) => {
      ctx.fillStyle = c.gear === g ? "#38bdf8" : "#475569"
      ctx.fillText(g, 68 + i * 40, 150)
    })
    tex.needsUpdate = true
  })
  return (
    <mesh position={position} rotation={rotation}>
      <planeGeometry args={[0.26, 0.16]} />
      <meshBasicMaterial map={tex} toneMapped={false} />
    </mesh>
  )
}

const v3 = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z)

export function CarModel({
  car,
  color = "#e9ecef",
  interior = false,
  mirrors,
}: {
  car: React.RefObject<Car>
  color?: string
  interior?: boolean
  mirrors?: MirrorTextures
}) {
  const spec = car.current.spec
  const root = useRef<THREE.Group>(null)
  const body = useRef<THREE.Group>(null)
  const wheel = useRef<THREE.Group>(null)
  const brakeMats = useRef<THREE.MeshStandardMaterial[]>([])
  const reverseMat = useRef<THREE.MeshStandardMaterial>(null)
  const sig = useRef<{ l: THREE.MeshStandardMaterial[]; r: THREE.MeshStandardMaterial[] }>({ l: [], r: [] })

  const p = useMemo(() => profiles(spec), [spec])
  const geo = useMemo(() => {
    const lower = extrude(sideShape(p), spec.width, 0.06)
    taper(lower, p, p.belt + 0.06, 0.5, 0.05)
    const cab = new THREE.Shape()
    p.cabin.forEach(([u, y], i) => (i ? cab.lineTo(u, y) : cab.moveTo(u, y)))
    cab.closePath()
    const cabin = extrude(cab, spec.width - 0.16, 0.05)
    taper(cabin, p, spec.height, p.belt, 0.16, 0)
    // Ốp hốc bánh màu đen
    const arch = new THREE.Shape()
    arch.absarc(0, 0, p.ar + 0.07, Math.PI * 1.02, -0.02, true)
    arch.absarc(0, 0, p.ar, -0.02, Math.PI * 1.02, false)
    const archG = extrude(arch, spec.width + 0.02, 0.01)
    return { lower, cabin, archG }
  }, [p, spec])

  const paint = useMemo(() => new THREE.MeshPhysicalMaterial({ color, metalness: 0.2, roughness: 0.32, clearcoat: 1, clearcoatRoughness: 0.06 }), [color])
  const glass = useMemo(() => new THREE.MeshPhysicalMaterial({ color: "#0d1117", metalness: 0.2, roughness: 0.06, clearcoat: 1 }), [])
  const black = useMemo(() => new THREE.MeshStandardMaterial({ color: "#16181b", roughness: 0.55 }), [])

  useFrame(({ clock }) => {
    const c = car.current
    if (!root.current) return
    root.current.position.set(c.pos.x, c.y, c.pos.z)
    root.current.rotation.set(-c.pitch, c.heading, 0, "YXZ")
    if (body.current) {
      body.current.rotation.x = c.dive
      body.current.rotation.z = c.roll
    }
    if (wheel.current) wheel.current.rotation.z = -c.steer * 14
    const lit = c.braking || c.gear === "P"
    brakeMats.current.forEach((m) => (m.emissiveIntensity = lit ? 4 : 1.2))
    if (reverseMat.current) reverseMat.current.emissiveIntensity = c.gear === "R" ? 3 : 0
    const on = Math.floor(clock.elapsedTime * 2.6) % 2 === 0
    const l = on && (c.signal === "left" || c.hazard)
    const r = on && (c.signal === "right" || c.hazard)
    sig.current.l.forEach((m) => (m.emissiveIntensity = l ? 5 : 0))
    sig.current.r.forEach((m) => (m.emissiveIntensity = r ? 5 : 0))
  })

  const keep = (list: THREE.MeshStandardMaterial[]) => (m: THREE.MeshStandardMaterial | null) => {
    if (m && !list.includes(m)) list.push(m)
  }
  const W = spec.width / 2
  const isVF = spec.id === "vf6"
  const frontZ = p.f
  const rearZ = p.r
  const driverX = 0.36
  const wheelZ = spec.wheelbase - 1.05

  return (
    <group ref={root}>
      {!interior && <ContactShadow spec={spec} />}
      <group ref={body}>
        {/* Thân dưới sơn màu, cabin kính + mui đen */}
        <mesh geometry={geo.lower} material={paint} castShadow />
        {!interior && <mesh geometry={geo.cabin} material={glass} castShadow />}
        {interior && (
          <mesh position={[0, spec.height - 0.04, (p.cabin[3][0] + p.cabin[2][0]) / 2]}>
            <boxGeometry args={[spec.width - 0.3, 0.05, 1.6]} />
            <meshStandardMaterial color="#cfcac2" roughness={0.9} side={THREE.DoubleSide} />
          </mesh>
        )}
        <group position-y={spec.wheelRadius}>
          <mesh geometry={geo.archG} material={black} />
          <mesh geometry={geo.archG} material={black} position-z={spec.wheelbase} />
        </group>
        {/* Ốp gầm hai bên */}
        <mesh position={[0, 0.3, spec.wheelbase / 2]} material={black}>
          <boxGeometry args={[spec.width - 0.04, 0.18, spec.wheelbase - 2 * p.ar]} />
        </mesh>
        {/* Cản trước/sau đen */}
        <mesh position={[0, p.bottom + 0.04, frontZ - 0.02]} material={black}>
          <boxGeometry args={[spec.width - 0.1, 0.16, 0.22]} />
        </mesh>
        <mesh position={[0, p.bottom + 0.04, rearZ - 0.02]} material={black}>
          <boxGeometry args={[spec.width - 0.1, 0.16, 0.2]} />
        </mesh>
        {isVF && (
          <>
            {/* Thanh giá nóc */}
            {[1, -1].map((s) => (
              <mesh key={s} position={[s * (W - 0.2), spec.height + 0.03, 0.75]} material={black}>
                <boxGeometry args={[0.04, 0.04, 1.6]} />
              </mesh>
            ))}
          </>
        )}

        {/* Dải LED trước hình chữ V */}
        {[1, -1].map((s) => (
          <mesh key={s} position={[s * 0.4, isVF ? 0.83 : 0.72, frontZ + 0.05]} rotation-z={s * (isVF ? -0.09 : 0)}>
            <boxGeometry args={[0.78, 0.025, 0.04]} />
            <meshStandardMaterial color="#fff" emissive="#eaf4ff" emissiveIntensity={2.5} toneMapped={false} />
          </mesh>
        ))}
        {/* Cụm đèn chiếu sáng phía dưới */}
        {[1, -1].map((s) => (
          <mesh key={s} position={[s * (W - 0.3), isVF ? 0.62 : 0.64, frontZ + 0.06]}>
            <boxGeometry args={[0.3, 0.08, 0.05]} />
            <meshStandardMaterial color="#cbd5e1" emissive="#f8fafc" emissiveIntensity={0.8} />
          </mesh>
        ))}
        {/* Dải đèn hậu */}
        {[1, -1].map((s) => (
          <mesh key={s} position={[s * 0.42, isVF ? 0.97 : 0.82, rearZ - 0.06]} rotation-z={s * (isVF ? 0.08 : 0)}>
            <boxGeometry args={[0.82, 0.045, 0.04]} />
            <meshStandardMaterial ref={keep(brakeMats.current)} color="#5b0b0b" emissive="#ff1f1f" emissiveIntensity={1.2} toneMapped={false} />
          </mesh>
        ))}
        <mesh position={[0, p.bottom + 0.2, rearZ - 0.075]}>
          <boxGeometry args={[0.18, 0.05, 0.02]} />
          <meshStandardMaterial ref={reverseMat} color="#ddd" emissive="#ffffff" emissiveIntensity={0} toneMapped={false} />
        </mesh>
        {/* Xi nhan bốn góc */}
        {(
          [
            ["l", W - 0.16, frontZ + 0.02, isVF ? 0.78 : 0.7],
            ["r", -W + 0.16, frontZ + 0.02, isVF ? 0.78 : 0.7],
            ["l", W - 0.14, rearZ - 0.05, isVF ? 0.9 : 0.8],
            ["r", -W + 0.14, rearZ - 0.05, isVF ? 0.9 : 0.8],
          ] as const
        ).map(([s, x, z, y], i) => (
          <mesh key={i} position={[x, y, z]}>
            <boxGeometry args={[0.12, 0.05, 0.08]} />
            <meshStandardMaterial ref={keep(sig.current[s])} color="#7c4a03" emissive="#ffa21a" emissiveIntensity={0} toneMapped={false} />
          </mesh>
        ))}
        {/* Biển số */}
        {[frontZ + 0.075, rearZ - 0.085].map((z, i) => (
          <mesh key={i} position={[0, p.bottom + 0.12, z]} rotation-y={i ? Math.PI : 0}>
            <planeGeometry args={[0.52, 0.11]} />
            <meshStandardMaterial color="#f1f5f9" />
          </mesh>
        ))}
        {/* Gương chiếu hậu ngoài */}
        {[1, -1].map((s) => (
          <group key={s} position={[s * (W + 0.08), p.belt + 0.08, 2.0 - (isVF ? 0 : 0.1)]}>
            <mesh material={black} scale={[1, 1, 0.5]}>
              <sphereGeometry args={[0.11, 16, 10]} />
            </mesh>
            <mesh position-z={-0.062} rotation-y={Math.PI}>
              <circleGeometry args={[0.09, 24]} />
              {mirrors ? <meshBasicMaterial map={s > 0 ? mirrors.left : mirrors.right} toneMapped={false} /> : <meshStandardMaterial color="#8b9bb0" metalness={1} roughness={0.1} />}
            </mesh>
          </group>
        ))}

        {/* Nội thất: chỉ cần khi nhìn từ ghế lái */}
        {interior && (
          <group>
            {/* Ốp nội thất phủ lên mặt trên thân xe (không thấy tôn sơn trắng từ trong cabin) */}
            <mesh position={[0, p.belt + 0.075, (p.r + wheelZ + 0.3) / 2]}>
              <boxGeometry args={[spec.width - 0.12, 0.02, wheelZ + 0.3 - p.r]} />
              <meshStandardMaterial color="#2e2c2a" roughness={0.95} />
            </mesh>
            {/* Táp-lô: mặt trên cao hơn nắp capo một chút như nhìn từ ghế lái thật */}
            {/* dừng ở chân kính lái, phía trước là nắp capo */}
            <mesh position={[0, p.belt + 0.03, (wheelZ + 0.12 + p.cabin[p.cabin.length - 2][0]) / 2]} rotation-x={-0.08}>
              <boxGeometry args={[spec.width - 0.16, 0.16, p.cabin[p.cabin.length - 2][0] - wheelZ - 0.12]} />
              <meshStandardMaterial color="#232221" roughness={0.9} />
            </mesh>
            <mesh position={[0, p.belt + 0.05, wheelZ + 0.22]}>
              <boxGeometry args={[spec.width - 0.3, 0.02, 0.06]} />
              <meshStandardMaterial color="#a8a29e" roughness={0.5} metalness={0.4} />
            </mesh>
            <CenterScreen car={car} position={[0, p.belt + 0.17, wheelZ + 0.3]} rotation={[-0.35, Math.PI, 0]} />
            {/* Vô lăng hai chấu */}
            <group position={[driverX, p.belt + 0.06, wheelZ]} rotation={[-0.45, Math.PI, 0, "YXZ"]}>
              <group ref={wheel}>
                <mesh>
                  <torusGeometry args={[0.17, 0.017, 12, 40]} />
                  <meshStandardMaterial color="#141414" roughness={0.6} />
                </mesh>
                <mesh>
                  <boxGeometry args={[0.34, 0.035, 0.02]} />
                  <meshStandardMaterial color="#3f3f46" metalness={0.4} />
                </mesh>
                <mesh>
                  <cylinderGeometry args={[0.05, 0.05, 0.03, 20]} />
                  <meshStandardMaterial color="#27272a" />
                </mesh>
              </group>
            </group>
            {/* Trụ A bên trong (mảnh, đúng vị trí ở mép tầm nhìn) */}
            {[1, -1].map((s) => (
              <Beam key={s} a={v3(s * (W - 0.14), p.belt + 0.04, p.cabin[p.cabin.length - 2][0])} b={v3(s * (W - 0.24), spec.height - 0.06, p.cabin[p.cabin.length - 3][0])} w={0.035} d={0.04} color="#4a4744" />
            ))}
            {/* Ốp cửa hai bên */}
            {[1, -1].map((s) => (
              <mesh key={s} position={[s * (W - 0.1), p.belt - 0.08, 0.7]}>
                <boxGeometry args={[0.04, 0.14, 1.8]} />
                <meshStandardMaterial color="#3a3836" roughness={0.9} />
              </mesh>
            ))}
            {/* Gương chiếu hậu trong xe */}
            <group position={[0, spec.height - 0.11, wheelZ - 0.02]}>
              <mesh material={black}>
                <boxGeometry args={[0.26, 0.08, 0.03]} />
              </mesh>
              <mesh position-z={-0.017} rotation-y={Math.PI}>
                <planeGeometry args={[0.24, 0.065]} />
                {mirrors ? <meshBasicMaterial map={mirrors.center} toneMapped={false} /> : <meshStandardMaterial color="#8b9bb0" />}
              </mesh>
            </group>
          </group>
        )}
      </group>

      <Wheel spec={spec} car={car} x={spec.track / 2} z={spec.wheelbase} front />
      <Wheel spec={spec} car={car} x={-spec.track / 2} z={spec.wheelbase} front />
      <Wheel spec={spec} car={car} x={spec.track / 2} z={0} />
      <Wheel spec={spec} car={car} x={-spec.track / 2} z={0} />
    </group>
  )
}
