// Kiểm thử mô phỏng: bộ lái tự động chạy trọn 11 bài (BAD=1: cố tình mắc lỗi để kiểm tra trừ điểm).
// Chạy trọn 11 bài sa hình bằng bộ lái tự động với bước thời gian cố định.
import { Car } from "../src/sim/car.ts"
import { YardExam, Y, GARAGE_BAY, PARALLEL_BAY } from "../src/sim/yard.ts"
import { Pilot, line, arc, type Leg } from "../src/sim/pilot.ts"
import { v, dir, add, mul, len, sub, shapeMargin } from "../src/sim/geom.ts"

const sc = new YardExam()
const car = new Car()
car.reset(sc.start.pos, sc.start.heading)
car.seatbelt = !process.env.BAD
car.handbrake = false
car.signal = "left"
const front = () => car.points().frontCenter
const cat = (...ps: { x: number; z: number }[][]) => ps.flat()
const th = Math.acos(1 - 4.9 / 8)
const Z0 = 68.8 - 8 * Math.sin(th)
const legs: Leg[] = [
  { path: line(v(0, -9.5), v(0, 30)), way: 1, speed: 4, stopWhen: () => Y.crosswalkStop - front().z, hold: 1 },
  { path: line(v(0, 10), v(0, 60)), way: 1, speed: 4, stopWhen: () => Y.hill.stop - front().z, hold: 2 },
  {
    path: cat(line(v(0, 40), v(0, 128), v(0.8, 131), v(0.8, 133.8)), arc(v(0.8, 133.8), v(0, 1), -1, Math.PI / 2, 4.2), line(v(-3.4, 138), v(-9.8, 138)), arc(v(-9.8, 138), v(-1, 0), 1, Math.PI / 2, 4.2), line(v(-14, 142.2), v(-14, 158)), arc(v(-14, 158), v(0, 1), -1, Math.PI / 2, 6), line(v(-20, 164), v(-70, 164))),
    way: 1,
    speed: 3,
    stopWhen: () => front().x - Y.lightStop,
    hold: 0.5,
  },
  {
    path: cat(line(v(-50, 164), v(-80, 164)), (() => { const s = []; for (let u = 0; u <= 32; u += 0.5) s.push(v(-80 - u, 164 + 5 * Math.sin((Math.PI * u) / 16))); return s })(), line(v(-112, 164), v(-118, 164)), arc(v(-118, 164), v(-1, 0), -1, Math.PI / 2, 6), line(v(-124, 158), v(-124, 120), v(-123, 107))),
    way: 1,
    speed: 3,
  },
  { path: cat(arc(v(-123, 107), v(0, 1), 1, Math.PI / 2, 5), line(v(-118, 112), v(-113.4, 112))), way: -1, speed: 1.2, hold: 1.5 },
  { path: cat(line(v(-113.4, 112), v(-118, 112)), arc(v(-118, 112), v(-1, 0), -1, Math.PI / 2, 5), line(v(-123, 107), v(-124, 95), v(-121.5, 80), v(-121.5, Z0))), way: 1, speed: 2.5 },
  { path: cat(arc(v(-121.5, Z0), v(0, 1), 1, th, 4), arc(v(-121.5 + 4 * (1 - Math.cos(th)), Z0 + 4 * Math.sin(th)), v(Math.sin(th), Math.cos(th)), -1, th, 4), line(v(-116.6, 68.8), v(-116.6, 70))), way: -1, speed: 0.8, hold: 1.5 },
  { path: cat(arc(v(-116.6, Z0 + 8 * Math.sin(th)), v(0, -1), 1, th, 4), arc(v(-116.6 - 4 * (1 - Math.cos(th)), Z0 + 8 * Math.sin(th) - 4 * Math.sin(th)), v(-Math.sin(th), -Math.cos(th)), -1, th, 4), line(v(-121.5, Z0), v(-124, 52), v(-124, 30))), way: 1, speed: 3, stopWhen: () => front().z - Y.railStop, hold: 1 },
  { path: line(v(-124, 47), v(-124, 2)), way: 1, speed: process.env.BAD ? 5 : 8 },
  { path: cat(line(v(-124, 2), v(-124, -24)), arc(v(-124, -24), v(0, -1), -1, Math.PI / 2, 6), line(v(-118, -30), v(-10, -30))), way: 1, speed: 4 },
]
const pilot = new Pilot(legs)
const dt = 1 / 60
let started = false
let hazardDone = false
const corners = [v(-14, 164), v(-124, 164), v(-124, -30)]
let lastI = -1
for (let step = 0; step < 60 * 60 * 20; step++) {
  if (!started && step > 30) {
    sc.begin(car)
    started = true
  }
  if (pilot.i !== lastI) {
    lastI = pilot.i
  }
  let c = started ? pilot.control(car, dt) : { throttle: 0, brake: 1, steer: 0 }
  if (pilot.i === 3 && sc.ex === 4 && sc.light !== 'green' && front().x > Y.lightStop - 0.3) c = { throttle: 0, brake: 1, steer: 0 }
  if (car.signal === "left" && front().z > Y.startLine + 1.5 && front().z < 10) car.signal = "none"
  for (const k of corners) {
    const d = len(sub(car.points().center, k))
    if (d < 22 && d > 6 && !process.env.BAD) car.signal = "right"
    if (d < 4 && car.signal === "right") car.signal = "none"
  }
  if (sc.ex === 10 && front().x > -40 && !process.env.BAD) car.signal = "right"
  if (sc.alarm) {
    c = { throttle: 0, brake: 1, steer: c.steer }
    car.hazard = true
  } else if (car.hazard && !hazardDone) {
    car.hazard = false
    hazardDone = true
  }
  car.step(dt, c, (p) => sc.heightAt(p))
  sc.update(dt, car, c)
  if ((sc.ex === 6 || sc.ex === 7) && (pilot.i === 4 || pilot.i === 6) && pilot.holdLeft > 0 && pilot.holdLeft < 0.02) {
    const bay = sc.ex === 6 ? GARAGE_BAY : PARALLEL_BAY
  }
  if (sc.status === "passed" || sc.status === "failed") break
  if (pilot.done) break
}
console.log("status", sc.status, "score", sc.score, "time", sc.time.toFixed(1), "ex", sc.ex, "leg", pilot.i, "pos", car.pos.x.toFixed(2), car.pos.z.toFixed(2), "heading", ((car.heading * 180) / Math.PI).toFixed(0))
for (const f of sc.faults) console.log(`  ${f.t.toFixed(1)}s ${f.fatal ? "FATAL" : "-" + f.points} ${f.text}`)
void dir; void add; void mul
