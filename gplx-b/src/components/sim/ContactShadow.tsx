import { useMemo } from "react"
import * as THREE from "three"
import type { CarSpec } from "@/sim/car"

/** Bóng mờ dưới gầm: ảnh chuyển tối dần ra mép, vẽ một lần — thay cho bóng mềm tính theo thời gian thực. */
function shadowTexture() {
  const c = document.createElement("canvas")
  c.width = c.height = 128
  const g = c.getContext("2d")!
  const grad = g.createRadialGradient(64, 64, 8, 64, 64, 64)
  grad.addColorStop(0, "rgba(0,0,0,0.85)")
  grad.addColorStop(0.55, "rgba(0,0,0,0.55)")
  grad.addColorStop(1, "rgba(0,0,0,0)")
  g.fillStyle = grad
  g.fillRect(0, 0, 128, 128)
  return new THREE.CanvasTexture(c)
}

export function ContactShadow({ spec }: { spec: CarSpec }) {
  const map = useMemo(shadowTexture, [])
  const rear = -spec.rearOverhang
  const front = rear + spec.length
  return (
    <mesh rotation-x={-Math.PI / 2} position={[0, 0.012, (rear + front) / 2]} renderOrder={-1}>
      <planeGeometry args={[spec.width * 1.25, spec.length * 1.12]} />
      <meshBasicMaterial map={map} transparent depthWrite={false} opacity={0.7} toneMapped={false} />
    </mesh>
  )
}
