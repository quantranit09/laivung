import { useMemo, useRef } from "react"
import { useFrame } from "@react-three/fiber"
import * as THREE from "three"
import { CROSSWALKS, GRID, HALF, LIGHT_NODE, NODES, nodePos, lightFor, type CityDrive } from "@/sim/city"
import { add, headingOf, leftOf, mul, norm, sub, v, type V2 } from "@/sim/geom"
import { crossLine, polyGeometry, stripsGeometry, zebra } from "@/sim/meshes"
import { Ground, Sign, TrafficLight } from "./YardMesh"

const flat = () => 0
const BOX = HALF + 0.5

/** Các đoạn đường giữa hai nút kề nhau. */
function segments() {
  const out: { a: V2; b: V2 }[] = []
  for (const x of GRID) for (let j = 0; j < 2; j++) out.push({ a: v(x, GRID[j]), b: v(x, GRID[j + 1]) })
  for (const z of GRID) for (let i = 0; i < 2; i++) out.push({ a: v(GRID[i], z), b: v(GRID[i + 1], z) })
  return out
}

function dashed(a: V2, b: V2, w: number, on = 3, off = 6) {
  const d = norm(sub(b, a))
  const L = Math.hypot(b.x - a.x, b.z - a.z)
  const out: { a: V2; b: V2; w: number }[] = []
  for (let s = 0; s + on <= L; s += on + off) out.push({ a: add(a, mul(d, s)), b: add(a, mul(d, s + on)), w })
  return out
}

export function CityMesh({ city }: { city: React.RefObject<CityDrive> }) {
  const geo = useMemo(() => {
    const roadParts = [
      ...GRID.map((z) => polyGeometry([v(GRID[0] - HALF, z - HALF), v(GRID[2] + HALF, z - HALF), v(GRID[2] + HALF, z + HALF), v(GRID[0] - HALF, z + HALF)])),
      ...GRID.map((x) => polyGeometry([v(x - HALF, GRID[0] - HALF), v(x + HALF, GRID[0] - HALF), v(x + HALF, GRID[2] + HALF), v(x - HALF, GRID[2] + HALF)])),
    ]
    const white: { a: V2; b: V2; w: number }[] = []
    const yellow: { a: V2; b: V2; w: number }[] = []
    for (const { a, b } of segments()) {
      const d = norm(sub(b, a))
      const l = leftOf(d)
      const a1 = add(a, mul(d, BOX)), b1 = sub(b, mul(d, BOX))
      // Vạch tim đường: 2 vạch vàng liền
      for (const o of [0.15, -0.15]) yellow.push({ a: add(a1, mul(l, o)), b: add(b1, mul(l, o)), w: 0.12 })
      // Vạch phân làn trắng nét đứt và vạch mép
      for (const o of [3.5, -3.5]) white.push(...dashed(add(a1, mul(l, o)), add(b1, mul(l, o)), 0.13))
      for (const o of [6.75, -6.75]) white.push({ a: add(a, mul(l, o)), b: add(b, mul(l, o)), w: 0.15 })
    }
    // Vạch dừng ở các hướng vào nút có đèn hoặc biển STOP
    for (const n of NODES) {
      const p = nodePos(n)
      for (const d of [v(1, 0), v(-1, 0), v(0, 1), v(0, -1)]) {
        const from = sub(p, mul(d, 160))
        const exists = Math.abs(from.x) <= 160 && Math.abs(from.z) <= 160
        if (!exists) continue
        const right = mul(leftOf(d), -1)
        const at = add(sub(p, mul(d, BOX + 0.6)), mul(right, HALF / 2))
        white.push(crossLine(at, headingOf(d), HALF - 0.4, 0.45))
      }
    }
    for (const cw of CROSSWALKS) white.push(...zebra(cw.at, headingOf(cw.along), HALF * 2 - 0.6, 3.5))
    return { roadParts, white: stripsGeometry(white, flat), yellow: stripsGeometry(yellow, flat, 0.04) }
  }, [])

  const blocks = useMemo(() => {
    const spans = [
      [GRID[0] + HALF, GRID[1] - HALF],
      [GRID[1] + HALF, GRID[2] - HALF],
    ]
    const out: { x0: number; x1: number; z0: number; z1: number; buildings: { x: number; z: number; w: number; d: number; h: number; c: string }[] }[] = []
    let seed = 11
    const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647)
    const colors = ["#e7e5e4", "#fde68a", "#bfdbfe", "#fecaca", "#d9f99d", "#e9d5ff", "#f5f5f4", "#fed7aa"]
    for (const [x0, x1] of spans)
      for (const [z0, z1] of spans) {
        const buildings = []
        for (let x = x0 + 8; x < x1 - 14; x += 18)
          for (const edge of [z0 + 8, z1 - 22]) buildings.push({ x: x + 6, z: edge + 7, w: 12 + rnd() * 3, d: 12, h: 6 + rnd() * 22, c: colors[Math.floor(rnd() * colors.length)] })
        for (let z = z0 + 26; z < z1 - 30; z += 18)
          for (const edge of [x0 + 8, x1 - 22]) buildings.push({ x: edge + 7, z: z + 6, w: 12, d: 12 + rnd() * 3, h: 6 + rnd() * 18, c: colors[Math.floor(rnd() * colors.length)] })
        out.push({ x0, x1, z0, z1, buildings })
      }
    return out
  }, [])

  const asphalt = useMemo(() => new THREE.MeshStandardMaterial({ color: "#4a4e54", roughness: 0.95, side: THREE.DoubleSide }), [])
  const time = () => city.current?.clock ?? 0

  return (
    <group>
      <Ground color="#8aa070" />
      {geo.roadParts.map((g, i) => (
        <mesh key={i} geometry={g} material={asphalt} />
      ))}
      <mesh geometry={geo.white}>
        <meshStandardMaterial color="#f8fafc" side={THREE.DoubleSide} />
      </mesh>
      <mesh geometry={geo.yellow}>
        <meshStandardMaterial color="#facc15" side={THREE.DoubleSide} />
      </mesh>
      {blocks.map((b, i) => (
        <group key={i}>
          <mesh position={[(b.x0 + b.x1) / 2, 0.08, (b.z0 + b.z1) / 2]}>
            <boxGeometry args={[b.x1 - b.x0, 0.16, b.z1 - b.z0]} />
            <meshStandardMaterial color="#b8b5ad" roughness={0.95} />
          </mesh>
          <mesh position={[(b.x0 + b.x1) / 2, 0.17, (b.z0 + b.z1) / 2]}>
            <boxGeometry args={[b.x1 - b.x0 - 6, 0.02, b.z1 - b.z0 - 6]} />
            <meshStandardMaterial color="#7fa05f" roughness={1} />
          </mesh>
          {b.buildings.map((h, k) => (
            <mesh key={k} position={[h.x, h.h / 2, h.z]}>
              <boxGeometry args={[h.w, h.h, h.d]} />
              <meshStandardMaterial color={h.c} roughness={0.85} />
            </mesh>
          ))}
        </group>
      ))}
      {/* Đèn tín hiệu ở ngã tư trung tâm: mỗi hướng một cột bên phải */}
      {[v(1, 0), v(-1, 0), v(0, 1), v(0, -1)].map((d) => {
        const p = nodePos(LIGHT_NODE)
        const right = mul(leftOf(d), -1)
        const at = add(sub(p, mul(d, BOX + 1.5)), mul(right, HALF + 1))
        return <TrafficLight key={`${d.x},${d.z}`} pos={at} facing={headingOf(d) + Math.PI} state={() => lightFor(time(), d)} />
      })}
      {/* Biển STOP ở hướng từ đường nhánh ra đường chính */}
      {[
        { n: v(0, -160), d: v(0, -1) },
        { n: v(0, 160), d: v(0, 1) },
        { n: v(-160, 0), d: v(-1, 0) },
        { n: v(160, 0), d: v(1, 0) },
      ].map(({ n, d }) => {
        const right = mul(leftOf(d), -1)
        return <Sign key={`${n.x},${n.z}`} at={add(sub(n, mul(d, BOX + 2)), mul(right, HALF + 1.2))} text="STOP" bg="#dc2626" height={2} />
      })}
      <Npcs city={city} />
      <Peds city={city} />
    </group>
  )
}

function Npcs({ city }: { city: React.RefObject<CityDrive> }) {
  const refs = useRef<(THREE.Group | null)[]>([])
  const count = city.current?.npcs.length ?? 0
  useFrame(() => {
    city.current?.npcs.forEach((n, i) => {
      const g = refs.current[i]
      if (!g) return
      // Mốc đặt xe: tâm trục sau như xe thí sinh → lùi về từ vị trí tâm đường đi
      const back = sub(n.pos, mul({ x: Math.sin(n.heading), z: Math.cos(n.heading) }, 1.3))
      g.position.set(back.x, 0, back.z)
      g.rotation.y = n.heading
    })
  })
  return (
    <>
      {Array.from({ length: count }, (_, i) => (
        <group key={i} ref={(g) => (refs.current[i] = g)}>
          <mesh position={[0, 0.6, 1.3]}>
            <boxGeometry args={[1.8, 0.65, 4.3]} />
            <meshStandardMaterial color={city.current?.npcs[i].color} roughness={0.4} metalness={0.2} />
          </mesh>
          <mesh position={[0, 1.2, 1.0]}>
            <boxGeometry args={[1.55, 0.55, 2.1]} />
            <meshStandardMaterial color="#1f2937" roughness={0.2} />
          </mesh>
          {[
            [0.78, 0],
            [-0.78, 0],
            [0.78, 2.6],
            [-0.78, 2.6],
          ].map(([x, z], k) => (
            <mesh key={k} position={[x, 0.32, z]} rotation-z={Math.PI / 2}>
              <cylinderGeometry args={[0.32, 0.32, 0.22, 12]} />
              <meshStandardMaterial color="#111" />
            </mesh>
          ))}
        </group>
      ))}
    </>
  )
}

function Peds({ city }: { city: React.RefObject<CityDrive> }) {
  const refs = useRef<(THREE.Group | null)[]>([])
  const count = city.current?.peds.length ?? 0
  useFrame(({ clock }) => {
    city.current?.peds.forEach((p, i) => {
      const g = refs.current[i]
      if (!g) return
      g.visible = p.active
      const cw = CROSSWALKS[p.cw]
      g.position.set(p.pos.x, Math.abs(Math.sin(clock.elapsedTime * 6 + i)) * 0.05, p.pos.z)
      g.rotation.y = headingOf(mul(leftOf(cw.along), p.dirSign))
    })
  })
  return (
    <>
      {Array.from({ length: count }, (_, i) => (
        <group key={i} ref={(g) => (refs.current[i] = g)} visible={false}>
          <mesh position-y={0.95}>
            <capsuleGeometry args={[0.22, 0.9, 4, 8]} />
            <meshStandardMaterial color={["#ef4444", "#3b82f6", "#22c55e", "#f59e0b"][i % 4]} />
          </mesh>
          <mesh position-y={1.75}>
            <sphereGeometry args={[0.17, 12, 12]} />
            <meshStandardMaterial color="#f1c27d" />
          </mesh>
        </group>
      ))}
    </>
  )
}
