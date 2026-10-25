import { Car } from "../src/sim/car.ts"
import { CityDrive, laneLine } from "../src/sim/city.ts"
import { Pilot, line, arc } from "../src/sim/pilot.ts"
import { len, sub, v } from "../src/sim/geom.ts"

const sc = new CityDrive()
const car = new Car()
car.reset(sc.start.pos, sc.start.heading)
// 1) Thế giới tự chạy 5 phút khi thí sinh đứng yên
const dt = 1 / 30
const p0 = sc.npcs.map((n) => ({ ...n.pos }))
let stuckMax = 0
const still = sc.npcs.map(() => 0)
for (let i = 0; i < 30 * 300; i++) {
  car.step(dt, { throttle: 0, brake: 1, steer: 0 }, () => 0)
  sc.update(dt, car, { throttle: 0, brake: 1, steer: 0 })
  sc.npcs.forEach((n, k) => {
    if (Number.isNaN(n.pos.x)) throw new Error("NaN npc")
    still[k] = n.speed < 0.1 ? still[k] + dt : 0
    stuckMax = Math.max(stuckMax, still[k])
  })
}
const moved = sc.npcs.filter((n, k) => len(sub(n.pos, p0[k])) > 30).length
console.log(`npcs=${sc.npcs.length} moved=${moved} longestStop=${stuckMax.toFixed(1)}s peds active=${sc.peds.filter((p) => p.active).length}`)
// Xe khác có chồng lên nhau không?
let overlaps = 0
for (let a = 0; a < sc.npcs.length; a++) for (let b = a + 1; b < sc.npcs.length; b++) if (len(sub(sc.npcs[a].pos, sc.npcs[b].pos)) < 3) overlaps++
console.log("overlapping npc pairs", overlaps)

// 2) Thí sinh: xuất phát đúng, đi thẳng làn ngoài 100 m rồi dừng
const sc2 = new CityDrive()
car.reset(sc2.start.pos, sc2.start.heading)
car.seatbelt = true
car.handbrake = false
car.engine = true
car.signal = "left"
sc2.begin(car)
const [a] = laneLine("0,1", "0,2", 1)
const pilot = new Pilot([{ path: line(a, v(a.x, a.z + 100)), way: 1, speed: 9 }])
for (let i = 0; i < 30 * 60 && !pilot.done; i++) {
  if (car.odo > 6) car.signal = "none"
  const c = pilot.control(car, dt)
  car.step(dt, c, () => 0)
  sc2.update(dt, car, c)
}
console.log("status", sc2.status, "score", sc2.score, "faults", sc2.faults.map((f) => f.text), "instr:", sc2.instruction(car).title)
void arc
