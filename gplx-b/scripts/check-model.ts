// Kiểm tra mô hình xe đã nhập: số bánh tìm được, kích thước sau khi căn, đầu xe hướng nào.
//   npx tsx scripts/check-model.ts public/sim/models/vf6.glb vf6
import { readFileSync } from "node:fs"
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js"
import { MeshoptDecoder } from "three/examples/jsm/libs/meshopt_decoder.module.js"
import * as THREE from "three"
import { CARS } from "../src/sim/car"

// GLTFLoader cần vài API trình duyệt cho ảnh texture — trong Node bỏ qua texture.
;(globalThis as any).self = globalThis
;(globalThis as any).createImageBitmap = async () => ({ width: 1, height: 1, close() {} })

const [file, slot = "vf6"] = process.argv.slice(2)
const { rig } = await import("../src/components/sim/GlbCar")
const buf = readFileSync(file)
const loader = new GLTFLoader().setMeshoptDecoder(MeshoptDecoder)
loader.parse(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength), "", (gltf) => {
  const spec = CARS[slot as "vf6" | "sedan"]
  const r = rig(gltf.scene, spec, false)
  const b = new THREE.Box3().setFromObject(r.root)
  const size = b.getSize(new THREE.Vector3())
  console.log("wheels:", r.spins.length, "front wheels:", r.front.length)
  console.log("size L×W×H:", size.z.toFixed(2), size.x.toFixed(2), size.y.toFixed(2), "| spec", spec.length, spec.width, spec.height)
  console.log("rear bumper z:", b.min.z.toFixed(2), "front z:", b.max.z.toFixed(2), "| spec", -spec.rearOverhang, spec.frontOverhang)
  r.spins.forEach((g, i) => {
    const p = g.parent!.position
    console.log(`  wheel ${i}: x=${p.x.toFixed(2)} y=${p.y.toFixed(2)} z=${p.z.toFixed(2)}`)
  })
}, (e) => console.error("parse error", e))
