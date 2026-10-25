/**
 * Vân vật liệu thật cho môi trường (CC0, Poly Haven — xem public/sim/CREDITS.txt).
 * Môi trường chỉ dùng ảnh màu (không normal/roughness map) để nhẹ máy — phần đẹp dồn cho chiếc xe.
 * UV của mặt đường tính theo toạ độ thế giới (1 đơn vị UV = 4 m), nên chỉ cần lặp ảnh.
 */
import { useMemo } from "react"
import { useLoader } from "@react-three/fiber"
import * as THREE from "three"

const url = (f: string) => `${import.meta.env.BASE_URL}sim/${f}`

function prep(t: THREE.Texture, repeat: number, color = false) {
  t.wrapS = t.wrapT = THREE.RepeatWrapping
  t.repeat.set(repeat, repeat)
  t.anisotropy = 4
  if (color) t.colorSpace = THREE.SRGBColorSpace
  t.needsUpdate = true
  return t
}

type Kind = "asphalt" | "concrete" | "grass"
const FILES: Record<Kind, string> = {
  asphalt: "asphalt_02_diff.jpg",
  concrete: "brushed_concrete_diff.jpg",
  grass: "leafy_grass_diff.jpg",
}

/** Ảnh vân của một vật liệu, nhân bản để mỗi chỗ dùng có số lần lặp riêng. */
export function usePbrMaps(kind: Kind, repeat: number) {
  const src = useLoader(THREE.TextureLoader, url(FILES[kind]))
  return useMemo(() => ({ map: prep(src.clone(), repeat, true) }), [src, repeat])
}

export function useAsphaltMaterial() {
  const m = usePbrMaps("asphalt", 1)
  return useMemo(
    () =>
      new THREE.MeshStandardMaterial({
        ...m,
        color: "#c9c9c9",
        roughness: 0.95,
        side: THREE.DoubleSide,
      }),
    [m],
  )
}

export function useConcreteMaterial(repeat = 1, color = "#ffffff") {
  const m = usePbrMaps("concrete", repeat)
  return useMemo(() => new THREE.MeshStandardMaterial({ ...m, color, roughness: 1, side: THREE.DoubleSide }), [m, color])
}

export const SKY_HDR = url("sky_1k.hdr")
