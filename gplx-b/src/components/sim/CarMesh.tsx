import { useRef } from "react"
import { useFrame } from "@react-three/fiber"
import * as THREE from "three"
import { CAR, type Car } from "@/sim/car"

const WHEEL_R = 0.32

function Wheel({ x, z, steerRef, spinRef, steer }: { x: number; z: number; steer?: boolean; steerRef: React.RefObject<number>; spinRef: React.RefObject<number> }) {
  const g = useRef<THREE.Group>(null)
  const w = useRef<THREE.Mesh>(null)
  useFrame(() => {
    if (g.current && steer) g.current.rotation.y = steerRef.current
    if (w.current) w.current.rotation.x = spinRef.current
  })
  return (
    <group ref={g} position={[x, WHEEL_R, z]}>
      <mesh ref={w} rotation-z={Math.PI / 2}>
        <cylinderGeometry args={[WHEEL_R, WHEEL_R, 0.22, 20]} />
        <meshStandardMaterial color="#1f2124" roughness={0.9} />
      </mesh>
      <mesh position-x={x > 0 ? 0.112 : -0.112} rotation-z={Math.PI / 2}>
        <cylinderGeometry args={[0.18, 0.18, 0.01, 16]} />
        <meshStandardMaterial color="#b9bec6" metalness={0.6} roughness={0.35} />
      </mesh>
    </group>
  )
}

/** Xe mô phỏng: gốc toạ độ ở tâm trục sau, mặt đất y = 0, hướng đi +z. */
export function CarMesh({
  car,
  color = "#f4f5f7",
  interior = false,
}: {
  car: React.RefObject<Car | null>
  color?: string
  interior?: boolean
}) {
  const root = useRef<THREE.Group>(null)
  const steer = useRef(0)
  const spin = useRef(0)
  const wheel = useRef<THREE.Group>(null)
  const brakeMat = useRef<THREE.MeshStandardMaterial>(null)
  const reverseMat = useRef<THREE.MeshStandardMaterial>(null)
  const sigL = useRef<THREE.MeshStandardMaterial[]>([])
  const sigR = useRef<THREE.MeshStandardMaterial[]>([])

  useFrame(({ clock }) => {
    const c = car.current
    if (!c || !root.current) return
    root.current.position.set(c.pos.x, c.y, c.pos.z)
    root.current.rotation.set(-c.pitch, c.heading, 0, "YXZ")
    steer.current = c.steer
    spin.current = c.wheelSpin
    if (wheel.current) wheel.current.rotation.z = -c.steer * 15
    if (brakeMat.current) brakeMat.current.emissiveIntensity = c.braking || c.gear === "P" ? 2.2 : 0.4
    if (reverseMat.current) reverseMat.current.emissiveIntensity = c.gear === "R" ? 2 : 0
    const on = Math.floor(clock.elapsedTime * 2.6) % 2 === 0
    const l = on && (c.signal === "left" || c.hazard)
    const r = on && (c.signal === "right" || c.hazard)
    sigL.current.forEach((m) => (m.emissiveIntensity = l ? 3 : 0))
    sigR.current.forEach((m) => (m.emissiveIntensity = r ? 3 : 0))
  })

  const front = CAR.frontOverhang
  const rear = -CAR.rearOverhang
  const mid = (front + rear) / 2
  const L = front - rear
  const amber = (side: "l" | "r") => (m: THREE.MeshStandardMaterial | null) => {
    if (!m) return
    const list = side === "l" ? sigL.current : sigR.current
    if (!list.includes(m)) list.push(m)
  }

  return (
    <group ref={root}>
      {/* Thân dưới */}
      <mesh position={[0, 0.6, mid]} castShadow>
        <boxGeometry args={[CAR.width, 0.6, L]} />
        <meshStandardMaterial color={color} roughness={0.35} metalness={0.2} />
      </mesh>
      {/* Nắp capo dốc nhẹ */}
      <mesh position={[0, 0.93, front - 0.6]} rotation-x={0.12}>
        <boxGeometry args={[CAR.width - 0.06, 0.08, 1.2]} />
        <meshStandardMaterial color={color} roughness={0.35} metalness={0.2} />
      </mesh>
      {/* Sọc xanh xe sát hạch */}
      {[1, -1].map((s) => (
        <mesh key={s} position={[(s * CAR.width) / 2 + s * 0.002, 0.62, mid]}>
          <boxGeometry args={[0.005, 0.12, L - 0.4]} />
          <meshStandardMaterial color="#1d4ed8" />
        </mesh>
      ))}
      {/* Mui + trụ */}
      <mesh position={[0, 1.5, 0.95]}>
        <boxGeometry args={[1.55, 0.06, 1.9]} />
        <meshStandardMaterial color={color} roughness={0.35} />
      </mesh>
      {/* Trụ xe — ẩn khi ngồi trong xe để không che tầm nhìn */}
      {!interior &&
        [
          [0.74, 1.9],
          [-0.74, 1.9],
          [0.74, 0],
          [-0.74, 0],
        ].map(([x, z], i) => (
          <mesh key={i} position={[x, 1.2, z]} rotation-x={i < 2 ? -0.5 : 0.35}>
            <boxGeometry args={[0.07, 0.68, 0.08]} />
            <meshStandardMaterial color={color} />
          </mesh>
        ))}
      {/* Kính (mờ để thấy được từ trong xe) */}
      {!interior && (
        <mesh position={[0, 1.2, 0.95]}>
          <boxGeometry args={[1.5, 0.55, 2.1]} />
          <meshStandardMaterial color="#1b2a3a" transparent opacity={0.55} roughness={0.1} />
        </mesh>
      )}
      {/* Nội thất: táp-lô + vô lăng (bên trái — xe Việt Nam lái thuận) */}
      <mesh position={[0, 0.9, 2.3]}>
        <boxGeometry args={[1.62, 0.16, 0.5]} />
        <meshStandardMaterial color="#26282c" roughness={0.8} />
      </mesh>
      <group position={[0.37, 0.93, 1.85]} rotation-x={-1.2}>
        <group ref={wheel}>
          <mesh>
            <torusGeometry args={[0.19, 0.022, 10, 32]} />
            <meshStandardMaterial color="#111" roughness={0.6} />
          </mesh>
          <mesh>
            <boxGeometry args={[0.36, 0.03, 0.02]} />
            <meshStandardMaterial color="#222" />
          </mesh>
          <mesh position-y={-0.08}>
            <boxGeometry args={[0.03, 0.16, 0.02]} />
            <meshStandardMaterial color="#222" />
          </mesh>
        </group>
      </group>
      {/* Đèn */}
      {[0.6, -0.6].map((x) => (
        <mesh key={x} position={[x, 0.7, front + 0.005]}>
          <boxGeometry args={[0.38, 0.12, 0.02]} />
          <meshStandardMaterial color="#fff" emissive="#fffbe6" emissiveIntensity={1.2} />
        </mesh>
      ))}
      {[0.62, -0.62].map((x) => (
        <mesh key={x} position={[x, 0.75, rear - 0.005]}>
          <boxGeometry args={[0.34, 0.14, 0.02]} />
          <meshStandardMaterial ref={x > 0 ? brakeMat : undefined} color="#7f1d1d" emissive="#ff1a1a" emissiveIntensity={0.4} />
        </mesh>
      ))}
      <mesh position={[0, 0.75, rear - 0.006]}>
        <boxGeometry args={[0.3, 0.08, 0.02]} />
        <meshStandardMaterial ref={reverseMat} color="#ddd" emissive="#ffffff" emissiveIntensity={0} />
      </mesh>
      {/* Xi nhan bốn góc */}
      {(
        [
          ["l", 0.86, front],
          ["r", -0.86, front],
          ["l", 0.86, rear],
          ["r", -0.86, rear],
        ] as const
      ).map(([s, x, z], i) => (
        <mesh key={i} position={[x, 0.68, z + (z > 0 ? 0.005 : -0.005)]}>
          <boxGeometry args={[0.12, 0.1, 0.03]} />
          <meshStandardMaterial ref={amber(s)} color="#a16207" emissive="#ffb020" emissiveIntensity={0} />
        </mesh>
      ))}
      <Wheel x={CAR.track / 2} z={CAR.wheelbase} steer steerRef={steer} spinRef={spin} />
      <Wheel x={-CAR.track / 2} z={CAR.wheelbase} steer steerRef={steer} spinRef={spin} />
      <Wheel x={CAR.track / 2} z={0} steerRef={steer} spinRef={spin} />
      <Wheel x={-CAR.track / 2} z={0} steerRef={steer} spinRef={spin} />
    </group>
  )
}
