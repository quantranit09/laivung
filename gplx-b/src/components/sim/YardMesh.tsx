import { useMemo, useRef } from "react"
import { useFrame } from "@react-three/fiber"
import * as THREE from "three"
import { v, type V2 } from "@/sim/geom"
import {
  boundarySegments,
  crossLine,
  curbGeometry,
  labelTexture,
  moundGeometry,
  polyGeometry,
  ribbonGeometry,
  roadTextTexture,
  stripsGeometry,
  zebra,
} from "@/sim/meshes"
import { useAsphaltMaterial, useConcreteMaterial, usePbrMaps } from "./pbr"
import { GARAGE_BAY, PARALLEL_BAY, Y, YARD_MARKS, YARD_SHAPES, yardHeight, type YardExam } from "@/sim/yard"

export function Ground({ color = "#9ccc78" }: { color?: string }) {
  const maps = usePbrMaps("grass", 260)
  return (
    <mesh rotation-x={-Math.PI / 2} position-y={-0.01} receiveShadow>
      <planeGeometry args={[1200, 1200]} />
      <meshStandardMaterial {...maps} color={color} roughness={1} />
    </mesh>
  )
}

/** Nhựa đường PBR dùng chung cho sân và phố. */
export const useAsphalt = useAsphaltMaterial

/** Chữ sơn nằm trên mặt đường, đọc được khi xe chạy theo hướng `heading`. */
export function RoadText({ at, heading, text, w = 4, y = 0.04, color }: { at: V2; heading: number; text: string; w?: number; y?: number; color?: string }) {
  const tex = useMemo(() => roadTextTexture(text, color), [text, color])
  return (
    <mesh position={[at.x, y, at.z]} rotation={[-Math.PI / 2, heading + Math.PI, 0, "YXZ"]}>
      <planeGeometry args={[w, w / 4]} />
      <meshStandardMaterial map={tex} transparent depthWrite={false} roughness={0.7} />
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
      <sprite position-y={height + 0.32} scale={[2.1, 0.66, 1]}>
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
    const roads = YARD_SHAPES.map((sh) => (sh.kind === "ribbon" ? ribbonGeometry(sh.pts, sh.width, yardHeight) : polyGeometry(sh.pts)))
    const edges = boundarySegments(YARD_SHAPES)
    const white = [
      ...edges,
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
      curbs: curbGeometry(YARD_SHAPES, edges, yardHeight),
      mound: moundGeometry(0, Y.hill.up0 - 0.5, Y.hill.down1 + 0.5, 3.4, yardHeight),
    }
  }, [])
  const asphalt = useAsphalt()
  const concrete = useConcreteMaterial(1, "#e7e3dc")
  const curbConcrete = useConcreteMaterial(1)
  const curbMat = useMemo(() => {
    const m = curbConcrete.clone()
    m.vertexColors = true
    return m
  }, [curbConcrete])

  // Lan can hai bên đỉnh dốc
  const rails = useMemo(() => {
    const out: { x: number; z: number; y: number }[] = []
    for (let z = Y.hill.up0 + 4; z <= Y.hill.down1 - 4; z += 2) for (const x of [3.25, -3.25]) out.push({ x, z, y: yardHeight({ x: 0, z }) })
    return out
  }, [])

  return (
    <group>
      <Ground />
      <mesh geometry={geo.mound} material={concrete} receiveShadow />
      {geo.roads.map((g, i) => (
        <mesh key={i} geometry={g} material={asphalt} receiveShadow />
      ))}
      <mesh geometry={geo.white}>
        <meshStandardMaterial color="#f8fafc" roughness={0.6} side={THREE.DoubleSide} />
      </mesh>
      <mesh geometry={geo.yellow}>
        <meshStandardMaterial color="#facc15" roughness={0.6} side={THREE.DoubleSide} />
      </mesh>
      <mesh geometry={geo.curbs} material={curbMat} receiveShadow />
      {rails.map((r, i) => (
        <group key={i} position={[r.x, r.y, r.z]}>
          <mesh position-y={0.45}>
            <cylinderGeometry args={[0.04, 0.04, 0.9, 6]} />
            <meshStandardMaterial color="#9ca3af" metalness={0.6} roughness={0.4} />
          </mesh>
          <mesh position-y={0.85}>
            <boxGeometry args={[0.06, 0.08, 2.05]} />
            <meshStandardMaterial color="#e5e7eb" metalness={0.5} roughness={0.3} />
          </mesh>
        </group>
      ))}

      {/* Chữ & mũi tên sơn trên mặt đường */}
      <RoadText at={v(0, Y.startLine + 2.4)} heading={0} text="XUẤT PHÁT" />
      <RoadText at={v(0, Y.crosswalkStop - 2)} heading={0} text="DỪNG" w={3} />
      <RoadText at={v(0, Y.hill.stop - 2)} heading={0} text="DỪNG" w={3} y={yardHeight(v(0, Y.hill.stop - 2)) + 0.04} />
      <RoadText at={v(Y.lightStop + 2, 164)} heading={-Math.PI / 2} text="DỪNG" w={3} />
      <RoadText at={v(-124, Y.railStop + 2)} heading={Math.PI} text="DỪNG" w={3} />
      <RoadText at={v(Y.endLine - 2.6, -30)} heading={Math.PI / 2} text="KẾT THÚC" />
      {[v(0, -20), v(0, 6), v(0, 90), v(-30, 164), v(-124, 140), v(-124, 0), v(-60, -30)].map((p, i) => (
        <RoadText key={i} at={p} heading={[0, 0, 0, -Math.PI / 2, Math.PI, Math.PI, Math.PI / 2][i]} text="↑" w={2.4} />
      ))}

      {/* Đường sắt: ray + tà vẹt + biển + barie */}
      {[-0.72, 0.72].map((dz) => (
        <mesh key={dz} position={[-124, 0.06, Y.rail + dz]}>
          <boxGeometry args={[14, 0.1, 0.08]} />
          <meshStandardMaterial color="#6b7280" metalness={0.7} roughness={0.4} />
        </mesh>
      ))}
      {Array.from({ length: 13 }, (_, i) => (
        <mesh key={i} position={[-130.5 + i * 1.08, 0.025, Y.rail]}>
          <boxGeometry args={[0.24, 0.05, 2.4]} />
          <meshStandardMaterial color="#6b4423" />
        </mesh>
      ))}
      <Sign at={v(-119.8, Y.rail + 4)} text="✕ Đường sắt" bg="#b91c1c" />
      <group position={[-119.6, 0, Y.rail + 2.2]}>
        <mesh position-y={0.6}>
          <boxGeometry args={[0.3, 1.2, 0.3]} />
          <meshStandardMaterial color="#e5e7eb" />
        </mesh>
        {/* Cần barie dựng đứng (đang mở) sọc đỏ trắng */}
        {Array.from({ length: 6 }, (_, i) => (
          <mesh key={i} position={[0, 1.4 + i * 0.5, 0]}>
            <boxGeometry args={[0.1, 0.5, 0.1]} />
            <meshStandardMaterial color={i % 2 ? "#ef4444" : "#f8fafc"} />
          </mesh>
        ))}
      </group>
      <TrafficLight pos={YARD_MARKS.light.pos} facing={YARD_MARKS.light.facing} state={() => exam.current?.light ?? "green"} />
      <Bay bay={GARAGE_BAY} />
      <Bay bay={PARALLEL_BAY} />
      {YARD_MARKS.signs.map((sg) => (
        <Sign key={sg.text} at={sg.at} text={sg.text} />
      ))}
      <Trees />
    </group>
  )
}

/** Cây xanh quanh sân cho có chiều sâu không gian. */
const YARD_AREA: [number, number, number, number] = [-190, -70, 60, 230]
const yardAvoid = (x: number, z: number) => x < 8 && x > -136 && z > -40 && z < 175

export function Trees({
  count = 45,
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
      {items.map(([x, z, s], i) =>
        i % 3 === 0 ? (
          <Palm key={i} x={x} z={z} s={s} lean={(i % 7) * 0.05} />
        ) : (
          <group key={i} position={[x, 0, z]} scale={s}>
            <mesh position-y={1.1}>
              <cylinderGeometry args={[0.16, 0.22, 2.2, 8]} />
              <meshStandardMaterial color="#5b3e1f" roughness={1} />
            </mesh>
            <mesh position-y={3.3}>
              <icosahedronGeometry args={[1.9, 3]} />
              <meshStandardMaterial color={i % 2 ? "#3f6f2a" : "#4d7d31"} roughness={1} />
            </mesh>
            <mesh position={[0.9, 2.7, 0.4]}>
              <icosahedronGeometry args={[1.1, 3]} />
              <meshStandardMaterial color="#456f2c" roughness={1} />
            </mesh>
          </group>
        ),
      )}
    </>
  )
}

/** Cây cọ: thân cong nhiều đốt + tàu lá toả tròn. */
function Palm({ x, z, s, lean }: { x: number; z: number; s: number; lean: number }) {
  const segs = 7
  return (
    <group position={[x, 0, z]} scale={s}>
      {Array.from({ length: segs }, (_, i) => (
        <mesh key={i} position={[lean * i * i * 0.12, 0.45 + i * 0.85, 0]} rotation-z={-lean * i * 0.25}>
          <cylinderGeometry args={[0.14 - i * 0.008, 0.17 - i * 0.008, 0.9, 7]} />
          <meshStandardMaterial color={i % 2 ? "#7a5a36" : "#6b4c2c"} roughness={1} />
        </mesh>
      ))}
      <group position={[lean * segs * segs * 0.12, 0.45 + segs * 0.85, 0]}>
        {Array.from({ length: 8 }, (_, k) => (
          <mesh key={k} rotation={[0.9, (k * Math.PI) / 4, 0, "YXZ"]} position-y={-0.1}>
            <boxGeometry args={[0.5, 0.04, 2.6]} />
            <meshStandardMaterial color="#2e8b3a" roughness={0.9} />
          </mesh>
        ))}
      </group>
    </group>
  )
}

