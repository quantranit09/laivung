import { useMemo, useRef } from "react"
import { useFrame } from "@react-three/fiber"
import * as THREE from "three"
import { v } from "@/sim/geom"
import { boundarySegments, crossLine, labelTexture, polyGeometry, ribbonGeometry, stripsGeometry, zebra } from "@/sim/meshes"
import { GARAGE_BAY, PARALLEL_BAY, Y, YARD_MARKS, YARD_SHAPES, yardHeight, type YardExam } from "@/sim/yard"

export function Ground({ color = "#7f9a63" }: { color?: string }) {
  return (
    <mesh rotation-x={-Math.PI / 2} position-y={-0.01} receiveShadow>
      <planeGeometry args={[1200, 1200]} />
      <meshStandardMaterial color={color} roughness={1} />
    </mesh>
  )
}

export function Sign({ at, text, height = 2.2, bg }: { at: { x: number; z: number }; text: string; height?: number; bg?: string }) {
  const tex = useMemo(() => labelTexture(text, bg), [text, bg])
  return (
    <group position={[at.x, 0, at.z]}>
      <mesh position-y={height / 2}>
        <cylinderGeometry args={[0.05, 0.05, height, 8]} />
        <meshStandardMaterial color="#9ca3af" metalness={0.5} />
      </mesh>
      <sprite position-y={height + 0.45} scale={[3.2, 1, 1]}>
        <spriteMaterial map={tex} />
      </sprite>
    </group>
  )
}

export function TrafficLight({
  pos,
  facing,
  state,
}: {
  pos: { x: number; z: number }
  facing: number
  state: () => "red" | "yellow" | "green"
}) {
  const mats = useRef<(THREE.MeshStandardMaterial | null)[]>([])
  useFrame(() => {
    const s = state()
    ;(["red", "yellow", "green"] as const).forEach((c, i) => {
      const m = mats.current[i]
      if (m) m.emissiveIntensity = s === c ? 3 : 0.05
    })
  })
  return (
    <group position={[pos.x, 0, pos.z]} rotation-y={facing}>
      <mesh position-y={1.9}>
        <cylinderGeometry args={[0.08, 0.08, 3.8, 10]} />
        <meshStandardMaterial color="#374151" />
      </mesh>
      <mesh position={[0, 4.2, 0]}>
        <boxGeometry args={[0.45, 1.3, 0.35]} />
        <meshStandardMaterial color="#111827" />
      </mesh>
      {(["#ef4444", "#f59e0b", "#22c55e"] as const).map((c, i) => (
        <mesh key={c} position={[0, 4.6 - i * 0.4, 0.18]} rotation-x={Math.PI / 2}>
          <cylinderGeometry args={[0.14, 0.14, 0.03, 16]} />
          <meshStandardMaterial ref={(m) => (mats.current[i] = m)} color={c} emissive={c} emissiveIntensity={0.05} />
        </mesh>
      ))}
    </group>
  )
}

function Bay({ bay }: { bay: typeof GARAGE_BAY }) {
  // Cọc vàng ở 4 góc ô đỗ để dễ ước lượng khi lùi.
  return (
    <>
      {bay.pts.map((p, i) => (
        <mesh key={i} position={[p.x, 0.5, p.z]}>
          <cylinderGeometry args={[0.06, 0.06, 1, 8]} />
          <meshStandardMaterial color={i % 2 ? "#facc15" : "#111"} />
        </mesh>
      ))}
    </>
  )
}

export function YardMesh({ exam }: { exam: React.RefObject<YardExam | null> }) {
  const geo = useMemo(() => {
    const roads = YARD_SHAPES.map((s) => (s.kind === "ribbon" ? ribbonGeometry(s.pts, s.width, yardHeight) : polyGeometry(s.pts)))
    const white = [
      ...boundarySegments(YARD_SHAPES),
      ...YARD_MARKS.lines.map((l) => crossLine(l.at, l.dir, l.w, l.kind === "stop" ? 0.4 : 0.6)),
      ...YARD_MARKS.zebra.flatMap((z) => zebra(z.at, z.dir, z.w)),
    ]
    const yellow = [
      { a: v(Y.strip.x, Y.strip.z0), b: v(Y.strip.x, Y.strip.z1), w: Y.strip.w },
      // Vạch đánh dấu vùng tăng tốc
      ...[Y.speed.z0, Y.speed.zMid, Y.speed.z1].map((z) => crossLine(v(-124, z), Math.PI, 6, 0.25)),
    ]
    return {
      roads,
      white: stripsGeometry(white, yardHeight),
      yellow: stripsGeometry(yellow, yardHeight, 0.04),
    }
  }, [])

  const asphalt = useMemo(() => new THREE.MeshStandardMaterial({ color: "#4b4f55", roughness: 0.95, side: THREE.DoubleSide }), [])

  return (
    <group>
      <Ground />
      {geo.roads.map((g, i) => (
        <mesh key={i} geometry={g} material={asphalt} receiveShadow />
      ))}
      <mesh geometry={geo.white}>
        <meshStandardMaterial color="#f8fafc" roughness={0.6} side={THREE.DoubleSide} />
      </mesh>
      <mesh geometry={geo.yellow}>
        <meshStandardMaterial color="#facc15" roughness={0.6} side={THREE.DoubleSide} />
      </mesh>
      {/* Đường sắt */}
      {[-0.72, 0.72].map((dz) => (
        <mesh key={dz} position={[-124, 0.08, Y.rail + dz]}>
          <boxGeometry args={[14, 0.12, 0.08]} />
          <meshStandardMaterial color="#6b7280" metalness={0.7} roughness={0.4} />
        </mesh>
      ))}
      {Array.from({ length: 12 }, (_, i) => (
        <mesh key={i} position={[-130 + i * 1.1, 0.04, Y.rail]}>
          <boxGeometry args={[0.25, 0.06, 2.4]} />
          <meshStandardMaterial color="#78350f" />
        </mesh>
      ))}
      <Sign at={v(-131, Y.rail + 4)} text="✕ Đường sắt" bg="#b91c1c" />
      <TrafficLight pos={YARD_MARKS.light.pos} facing={YARD_MARKS.light.facing} state={() => exam.current?.light ?? "green"} />
      <Bay bay={GARAGE_BAY} />
      <Bay bay={PARALLEL_BAY} />
      {YARD_MARKS.signs.map((s) => (
        <Sign key={s.text} at={s.at} text={s.text} />
      ))}
      <Trees />
    </group>
  )
}

/** Cây xanh quanh sân cho có chiều sâu không gian. */
const YARD_AREA: [number, number, number, number] = [-190, -70, 60, 230]
const yardAvoid = (x: number, z: number) => x < 8 && x > -136 && z > -40 && z < 175

export function Trees({
  count = 70,
  area = YARD_AREA,
  avoid = yardAvoid,
}: {
  count?: number
  area?: [number, number, number, number]
  avoid?: (x: number, z: number) => boolean
}) {
  const items = useMemo(() => {
    const out: [number, number, number][] = []
    let seed = 7
    const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647)
    while (out.length < count) {
      const x = area[0] + rnd() * (area[2] - area[0])
      const z = area[1] + rnd() * (area[3] - area[1])
      if (!avoid(x, z)) out.push([x, z, 0.8 + rnd() * 0.7])
    }
    return out
  }, [count, area, avoid])
  return (
    <>
      {items.map(([x, z, s], i) => (
        <group key={i} position={[x, 0, z]} scale={s}>
          <mesh position-y={1.2}>
            <cylinderGeometry args={[0.15, 0.2, 2.4, 6]} />
            <meshStandardMaterial color="#6b4f2a" />
          </mesh>
          <mesh position-y={3.4}>
            <coneGeometry args={[1.6, 3.6, 8]} />
            <meshStandardMaterial color="#3f7d3a" roughness={0.9} />
          </mesh>
        </group>
      ))}
    </>
  )
}
