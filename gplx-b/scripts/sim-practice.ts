// Kiểm thử luyện lại từng bài: xe đặt đúng trên đường trước mỗi bài, và chế độ "luyện riêng" chấm ngay khi xong bài.
import { Car, VF6 } from "../src/sim/car.ts"
import { EX_COUNT, Y, YardExam } from "../src/sim/yard.ts"
import { unionMargin } from "../src/sim/geom.ts"

let bad = 0
const fail = (msg: string) => {
  bad++
  console.log("FAIL", msg)
}

for (let ex = 0; ex < EX_COUNT; ex++) {
  const sc = new YardExam({ from: ex, only: true })
  const car = new Car(VF6)
  car.reset(sc.start.pos, sc.start.heading)
  const P = car.points()
  const worst = Math.min(...[...Object.values(P.wheels), ...P.corners].map((p) => unionMargin(sc.shapes, p)))
  if (worst < 0) fail(`bài ${ex + 1}: xe đặt ngoài đường (lề ${worst.toFixed(2)} m)`)
  if (sc.ex !== ex || sc.progress().total !== 1) fail(`bài ${ex + 1}: sai bài bắt đầu`)
  console.log(`bài ${ex + 1}: lề nhỏ nhất ${worst.toFixed(2)} m`)
}

// Luyện riêng bài 2 (dừng người đi bộ) nhưng không dừng: bị trừ 5 điểm và kết thúc ngay sau bài, không chạy tiếp lên dốc.
{
  const sc = new YardExam({ from: 1, only: true })
  const car = new Car(VF6)
  car.reset(sc.start.pos, sc.start.heading)
  car.engine = true
  car.seatbelt = true
  car.handbrake = false
  car.gear = "D"
  sc.begin(car)
  for (let i = 0; i < 60 * 40 && sc.status === "running"; i++) {
    const c = { throttle: car.kmh < 12 ? 0.4 : 0, brake: 0, steer: 0 }
    car.step(1 / 60, c, (p) => sc.heightAt(p))
    sc.update(1 / 60, car, c)
  }
  const front = car.points().frontCenter.z
  console.log("luyện bài 2:", sc.status, sc.score, sc.faults.map((f) => `[bài ${(f.ex ?? -1) + 1}] ${f.text}`))
  if (sc.status !== "passed" || sc.score !== 95) fail("luyện riêng bài 2 phải kết thúc ĐẠT 95 điểm")
  if (front > Y.hill.up0) fail("luyện riêng bài 2 lẽ ra dừng chấm trước dốc")
  if (sc.faults[0]?.ex !== 1) fail("lỗi phải gắn với bài 2")
}

if (bad) process.exit(1)
console.log("practice ok")
