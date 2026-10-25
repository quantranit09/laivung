/**
 * Sát hạch lái xe trên đường (mô phỏng): khu phố lưới 3×3 nút, đường 2 làn mỗi chiều,
 * đèn tín hiệu ở ngã tư trung tâm, biển STOP ở ngã ba (đường nhánh ra đường chính),
 * người đi bộ qua vạch, xe khác tự chạy. Giám khảo ra lệnh theo 12 bài của PL III – TT 108/2026.
 */
import type { Car } from "./car"
import {
  add,
  dir,
  dot,
  headingOf,
  leftOf,
  len,
  mul,
  norm,
  pointAt,
  polylineLength,
  rect,
  sub,
  unionMargin,
  v,
  type Shape,
  type V2,
} from "./geom"
import { PASS_SCORE, Repeater, Scorer, StopDetector, type ExamStatus, type Instruction, type Scenario, type Sound } from "./scenario"

export const GRID = [-160, 0, 160]
export const HALF = 7 // nửa bề rộng mặt đường (2 làn × 3,5 m)
export const LANE = 3.5
const BOX = HALF + 0.5 // nửa cạnh vùng giao lộ

export type NodeId = `${number},${number}`
const nid = (i: number, j: number): NodeId => `${i},${j}`
export const nodePos = (id: NodeId) => {
  const [i, j] = id.split(",").map(Number)
  return v(GRID[i], GRID[j])
}
const neighbors = (id: NodeId): NodeId[] => {
  const [i, j] = id.split(",").map(Number)
  return (
    [
      [i + 1, j],
      [i - 1, j],
      [i, j + 1],
      [i, j - 1],
    ] as const
  )
    .filter(([a, b]) => a >= 0 && a < 3 && b >= 0 && b < 3)
    .map(([a, b]) => nid(a, b))
}
export const NODES: NodeId[] = GRID.flatMap((_, i) => GRID.map((__, j) => nid(i, j)))
export const LIGHT_NODE: NodeId = "1,1"
/** Ngã ba: đường từ trong ra là đường nhánh, phải dừng ở biển STOP. */
const isT = (id: NodeId) => neighbors(id).length === 3

export const CITY_SHAPES: Shape[] = [
  ...GRID.map((z) => rect(GRID[0] - HALF, z - HALF, GRID[2] + HALF, z + HALF)),
  ...GRID.map((x) => rect(x - HALF, GRID[0] - HALF, x + HALF, GRID[2] + HALF)),
]

/** Vạch qua đường giữa mỗi đoạn — nơi người đi bộ sang đường. */
export const CROSSWALKS: { at: V2; along: V2 }[] = []
for (const a of NODES)
  for (const b of neighbors(a))
    if (a < b) {
      const pa = nodePos(a), pb = nodePos(b)
      CROSSWALKS.push({ at: mul(add(pa, pb), 0.5), along: norm(sub(pb, pa)) })
    }

/** Làn xe từ nút a tới nút b, làn k (0 = làn trong sát tim đường, 1 = làn ngoài). */
export function laneLine(a: NodeId, b: NodeId, k: 0 | 1): [V2, V2] {
  const pa = nodePos(a), pb = nodePos(b)
  const d = norm(sub(pb, pa))
  const right = mul(leftOf(d), -1)
  const off = mul(right, LANE / 2 + LANE * k)
  return [add(add(pa, mul(d, BOX)), off), add(sub(pb, mul(d, BOX)), off)]
}

function bezier(a: V2, c: V2, b: V2, n = 12) {
  const out: V2[] = []
  for (let k = 0; k <= n; k++) {
    const u = k / n
    out.push(add(add(mul(a, (1 - u) * (1 - u)), mul(c, 2 * u * (1 - u))), mul(b, u * u)))
  }
  return out
}

/** Đường nối qua giao lộ từ làn (a→n) sang làn (n→b). */
function connector(a: NodeId, n: NodeId, b: NodeId, k: 0 | 1, k2: 0 | 1) {
  const [, p0] = laneLine(a, n, k)
  const [p1] = laneLine(n, b, k2)
  const d0 = norm(sub(nodePos(n), nodePos(a)))
  const d1 = norm(sub(nodePos(b), nodePos(n)))
  if (Math.abs(dot(d0, d1)) > 0.9) return [p0, p1]
  // Giao điểm hai đường làn làm điểm điều khiển
  const c = Math.abs(d0.x) > 0.5 ? v(p1.x, p0.z) : v(p0.x, p1.z)
  return bezier(p0, c, p1)
}

export type Light = "green" | "yellow" | "red"
/** Đèn ở ngã tư trung tâm: hai pha Bắc–Nam / Đông–Tây. */
export function lightFor(t: number, approach: V2): Light {
  const cycle = 34
  const ph = t % cycle
  const ns = Math.abs(approach.z) > 0.5
  const local = ns ? ph : (ph + 17) % cycle
  if (local < 12) return "green"
  if (local < 15) return "yellow"
  return "red"
}

const turnOf = (d0: V2, d1: V2) => {
  const c = d0.x * d1.z - d0.z * d1.x // >0: rẽ phải (theo quy ước bên trái là +x khi nhìn +z)
  const dd = dot(d0, d1)
  if (dd > 0.7) return "straight" as const
  if (dd < -0.7) return "uturn" as const
  return c < 0 ? ("left" as const) : ("right" as const)
}

// ---------- Xe khác ----------
interface Npc {
  path: V2[]
  s: number
  length: number
  speed: number
  cruise: number
  from: NodeId
  to: NodeId
  k: 0 | 1
  onLane: boolean
  pos: V2
  heading: number
  color: string
  wait: number
}

const COLORS = ["#dc2626", "#2563eb", "#16a34a", "#f59e0b", "#111827", "#9ca3af", "#7c3aed", "#0891b2", "#e5e7eb"]

// ---------- Người đi bộ ----------
interface Ped {
  cw: number
  /** Vị trí ngang qua đường, từ -10 đến 10 */
  u: number
  dirSign: 1 | -1
  wait: number
  active: boolean
  pos: V2
  yielded: boolean
}

type Task =
  | { kind: "move"; move: "straight" | "left" | "right" | "uturn"; node?: NodeId }
  | { kind: "lane"; to: 0 | 1 }
  | { kind: "overtake" }
  | { kind: "emergency" }
  | { kind: "finish" }

const MOVE_TEXT = { straight: "Đi thẳng", left: "Rẽ trái", right: "Rẽ phải", uturn: "Quay đầu xe" }

export class CityDrive implements Scenario {
  readonly name = "Đường trường"
  readonly shapes = CITY_SHAPES
  readonly start = { pos: laneLine("0,1", "0,2", 1)[0], heading: 0 }
  readonly timeLimit = 25 * 60
  readonly speedLimit = 50
  status: ExamStatus = "ready"
  time = 0
  /** Đồng hồ thế giới (đèn, xe khác) — chạy cả khi chưa xuất phát */
  clock = 0
  alarm = false
  npcs: Npc[] = []
  peds: Ped[] = []
  private sc = new Scorer(() => this.time)
  private stop = new StopDetector()
  private speeding = new Repeater(5, () => this.sc.deduct(5, "Lái xe quá tốc độ quy định (50 km/h)"))
  private rpmHigh = false
  private tasks: Task[] = []
  private task = 0
  private taskShownAt = 0
  /** Trạng thái quan sát người lái */
  private ob = {
    node: undefined as NodeId | undefined,
    enterHeading: 0,
    enterSignal: "none" as Car["signal"],
    lastSignal: "none" as Car["signal"],
    lastSignalAt: -99,
    wrongSide: false,
    laneSide: 1 as 0 | 1,
    approachLight: undefined as Light | undefined,
    stopSignStopped: false,
    stopSignNode: undefined as NodeId | undefined,
    startPassed: false,
    emergencyAt: 0,
    emergencyStopped: false,
    overtakeId: -1,
    /** Vừa ra khỏi giao lộ: đồng bộ lại làn, không tính là chuyển làn */
    resyncLane: true,
  }

  constructor() {
    const plan: Task[] = [
      { kind: "move", move: "straight" },
      { kind: "lane", to: 0 },
      { kind: "lane", to: 1 },
      { kind: "move", move: "right" },
      { kind: "move", move: "left" },
      { kind: "overtake" },
      { kind: "move", move: "straight" },
      { kind: "emergency" },
      { kind: "move", move: "left" },
      { kind: "move", move: "uturn" },
      { kind: "move", move: "right" },
      { kind: "finish" },
    ]
    this.tasks = plan
    this.spawnTraffic()
    this.peds = CROSSWALKS.map((_, i) => ({ cw: i, u: -10, dirSign: 1, wait: 4 + Math.random() * 15, active: false, pos: v(0, 0), yielded: false }))
  }

  get faults() {
    return this.sc.faults
  }
  get score() {
    return this.sc.score
  }
  heightAt() {
    return 0
  }

  drainSounds(): Sound[] {
    const s = this.sc.sounds
    this.sc.sounds = []
    return s
  }

  begin(car: Car) {
    this.status = "running"
    this.time = 0
    this.sc.sounds.push("start")
    this.ob.lastSignal = car.signal
  }

  // ---------- Xe khác ----------
  private spawnTraffic() {
    const lanes: [NodeId, NodeId][] = []
    for (const a of NODES) for (const b of neighbors(a)) lanes.push([a, b])
    for (let i = 0; i < 16; i++) {
      const [a, b] = lanes[(i * 7 + 3) % lanes.length]
      const k = (i % 3 === 0 ? 0 : 1) as 0 | 1
      // Không đặt xe ngay chỗ xuất phát của thí sinh
      if (a === "0,1" && b === "0,2") continue
      const path = laneLine(a, b, k)
      const n: Npc = {
        path,
        s: 20 + ((i * 37) % 100),
        length: polylineLength(path),
        speed: 8,
        cruise: k === 0 ? 12.5 : 10,
        from: a,
        to: b,
        k,
        onLane: true,
        pos: path[0],
        heading: 0,
        color: COLORS[i % COLORS.length],
        wait: 0,
      }
      this.npcs.push(n)
    }
  }

  private routeNpc(n: Npc) {
    if (n.onLane) {
      // Tới giao lộ: chọn hướng hợp với làn đang đi
      // Chưa xuất phát: không cho xe khác rẽ vào làn thí sinh đang đỗ chờ.
      const options = neighbors(n.to).filter((b) => b !== n.from && !(this.status === "ready" && n.to === "0,1" && b === "0,2"))
      const d0 = norm(sub(nodePos(n.to), nodePos(n.from)))
      const ok = options.filter((b) => {
        const t = turnOf(d0, norm(sub(nodePos(b), nodePos(n.to))))
        return t === "straight" || (n.k === 1 ? t === "right" : t === "left")
      })
      const pick = (ok.length ? ok : options)[Math.floor(Math.random() * (ok.length ? ok.length : options.length))]
      const t = turnOf(d0, norm(sub(nodePos(pick), nodePos(n.to))))
      const k2: 0 | 1 = t === "left" ? 0 : t === "right" ? 1 : n.k
      n.path = connector(n.from, n.to, pick, n.k, k2)
      n.length = polylineLength(n.path)
      n.s = 0
      n.onLane = false
      n.from = n.to
      n.to = pick
      n.k = k2
    } else {
      n.path = laneLine(n.from, n.to, n.k)
      n.length = polylineLength(n.path)
      n.s = 0
      n.onLane = true
    }
  }

  private updateNpcs(dt: number, car: Car) {
    const cp = car.points()
    const all = [...this.npcs.map((n) => ({ p: n.pos, h: n.heading, player: false })), { p: cp.center, h: car.heading, player: true }]
    for (const n of this.npcs) {
      let target = n.cruise
      const f = dir(n.heading)
      // Giữ khoảng cách xe phía trước (cả xe thí sinh)
      for (const o of all) {
        if (o.p === n.pos) continue
        // Chỉ bám theo xe cùng chiều (tránh hai xe cắt ngang chờ nhau mãi); xe thí sinh thì luôn nhường.
        if (!o.player && dot(dir(o.h), f) < 0.3) continue
        const rel = sub(o.p, n.pos)
        const ahead = dot(rel, f)
        const lat = Math.abs(dot(rel, leftOf(f)))
        if (ahead > 0 && ahead < 22 && lat < 2.2) target = Math.min(target, Math.max(0, (ahead - 7) * 0.8))
      }
      // Dừng đèn đỏ / biển STOP trước giao lộ
      if (n.onLane) {
        const remain = n.length - n.s
        const appr = norm(sub(nodePos(n.to), nodePos(n.from)))
        if (n.to === LIGHT_NODE && lightFor(this.clock, appr) !== "green" && remain < 25) target = Math.min(target, Math.max(0, (remain - 1.5) * 0.7))
        if (isT(n.to) && this.isMinorApproach(n.from, n.to) && remain < 20) {
          if (remain < 3 && n.wait < 1.5) {
            target = 0
            if (n.speed < 0.3) n.wait += dt
          } else if (n.wait < 1.5) target = Math.min(target, Math.max(0.8, (remain - 1.5) * 0.7))
        }
        // Nhường người đi bộ
        for (const p of this.peds) {
          if (!p.active) continue
          const rel = sub(p.pos, n.pos)
          const ahead = dot(rel, f)
          if (ahead > 0 && ahead < 18 && Math.abs(dot(rel, leftOf(f))) < 7) target = Math.min(target, Math.max(0, (ahead - 5) * 0.6))
        }
      }
      n.speed += Math.max(-6 * dt, Math.min(2 * dt, target - n.speed))
      n.s += n.speed * dt
      while (n.s >= n.length) {
        const over = n.s - n.length
        if (!n.onLane) n.wait = 0
        this.routeNpc(n)
        n.s = over
      }
      const { p, d } = pointAt(n.path, n.s)
      n.pos = p
      n.heading = headingOf(d)
    }
  }

  /** Đi từ a tới ngã ba b theo đường nhánh (vuông góc với đường chính). */
  private isMinorApproach(a: NodeId, b: NodeId) {
    const [i, j] = b.split(",").map(Number)
    const d = sub(nodePos(b), nodePos(a))
    // Ngã ba ở cạnh trái/phải (i = 0 hoặc 2): đường chính chạy dọc trục z
    if (i === 0 || i === 2) return Math.abs(d.x) > 0.5
    if (j === 0 || j === 2) return Math.abs(d.z) > 0.5
    return false
  }

  private updatePeds(dt: number) {
    this.peds.forEach((p) => {
      const cw = CROSSWALKS[p.cw]
      if (!p.active) {
        p.wait -= dt
        if (p.wait <= 0) {
          p.active = true
          p.dirSign = Math.random() < 0.5 ? 1 : -1
          p.u = -10 * p.dirSign
          p.yielded = false
        }
      } else {
        p.u += p.dirSign * 1.3 * dt
        if (Math.abs(p.u) > 10) {
          p.active = false
          p.wait = 10 + Math.random() * 25
        }
      }
      p.pos = add(cw.at, mul(leftOf(cw.along), p.u))
    })
  }

  // ---------- Luật cho thí sinh ----------
  private where(car: Car): { node?: NodeId; lateral?: number; axis?: V2 } {
    const c = car.points().center
    const node = NODES.find((n) => {
      const p = nodePos(n)
      return Math.abs(c.x - p.x) < BOX && Math.abs(c.z - p.z) < BOX
    })
    if (node) return { node }
    // Trên đoạn đường nào, đi theo chiều nào (ưu tiên trục trùng với hướng xe)
    const f = dir(car.heading)
    const horizontal = () => {
      for (const z of GRID)
        if (Math.abs(c.z - z) < HALF + 1) {
          const sgn = f.x >= 0 ? 1 : -1
          return { axis: v(sgn, 0), lateral: (c.z - z) * sgn } // dương = bên phải theo chiều đi
        }
    }
    const vertical = () => {
      for (const x of GRID)
        if (Math.abs(c.x - x) < HALF + 1) {
          const sgn = f.z >= 0 ? 1 : -1
          return { axis: v(0, sgn), lateral: (x - c.x) * sgn }
        }
    }
    const r = Math.abs(f.x) > Math.abs(f.z) ? (horizontal() ?? vertical()) : (vertical() ?? horizontal())
    if (r) return r
    return {}
  }

  private currentTask() {
    return this.tasks[this.task]
  }
  private advanceTask() {
    this.task++
    this.taskShownAt = this.time
    this.sc.sounds.push("beep")
    const t = this.currentTask()
    if (t?.kind === "emergency") {
      this.alarm = true
      this.ob.emergencyAt = this.time
      this.ob.emergencyStopped = false
      this.sc.sounds.push("alarm")
    }
    if (t?.kind === "overtake") this.ob.overtakeId = -1
  }

  update(dt: number, car: Car) {
    this.clock += dt
    this.updatePeds(dt)
    this.updateNpcs(dt, car)
    if (this.status !== "running") return
    this.time += dt
    const P = car.points()
    const still = this.stop.tick(dt, car.speed, car.braking || car.handbrake || car.gear === "P")
    const ob = this.ob
    if (car.signal !== ob.lastSignal) {
      ob.lastSignal = car.signal
      if (car.signal !== "none") ob.lastSignalAt = this.time
    }
    const signalRecent = (side: "left" | "right") => car.signal === side || (ob.lastSignalAt > this.time - 6 && ob.lastSignal === side)

    // Bài 1: xuất phát
    if (!ob.startPassed && car.odo > 3) {
      ob.startPassed = true
      if (!car.seatbelt) this.sc.deduct(10, "Không thắt dây an toàn")
      if (car.signal !== "left" && ob.lastSignalAt < 0) this.sc.deduct(10, "Không bật đèn xi nhan trái khi xuất phát")
      if (this.time > 30) this.sc.disqualify("Quá 30 giây kể từ lệnh xuất phát chưa khởi hành")
    }
    if (!ob.startPassed && this.time > 30) this.sc.disqualify("Quá 30 giây kể từ lệnh xuất phát chưa khởi hành")

    // Lỗi chung
    const margins = Object.values(P.wheels).map((w) => unionMargin(this.shapes, w))
    if (margins.some((m) => m < -0.4)) this.sc.disqualify("Lái xe lên vỉa hè")
    this.speeding.tick(dt, car.kmh > this.speedLimit + 2)
    const high = car.rpm > 4000
    if (high && !this.rpmHigh) this.sc.deduct(5, "Để tốc độ động cơ quá 4000 vòng/phút")
    this.rpmHigh = high

    // Va chạm
    for (const n of this.npcs) {
      if (len(sub(n.pos, P.center)) < 4) {
        const rel = sub(n.pos, P.center)
        const f = dir(car.heading)
        if (Math.abs(dot(rel, f)) < 3.6 && Math.abs(dot(rel, leftOf(f))) < 1.7) this.sc.disqualify("Gây va chạm với xe khác")
      }
    }
    for (const p of this.peds) {
      if (!p.active) continue
      const rel = sub(p.pos, P.center)
      const f = dir(car.heading)
      if (Math.abs(dot(rel, f)) < 2.6 && Math.abs(dot(rel, leftOf(f))) < 1.2) this.sc.disqualify("Gây tai nạn cho người đi bộ")
      // Nhường đường: người đang ở lòng đường, xe đi qua vạch
      const cw = CROSSWALKS[p.cw]
      const along = Math.abs(dot(sub(P.frontCenter, cw.at), cw.along))
      if (!p.yielded && Math.abs(p.u) < HALF && along < 1.5 && Math.abs(car.speed) > 1 && Math.abs(dot(sub(P.center, cw.at), leftOf(cw.along))) < HALF) {
        p.yielded = true
        this.sc.deduct(10, "Không nhường đường cho người đi bộ qua đường")
      }
    }

    const w = this.where(car)
    // Lấn làn ngược chiều / đổi làn không xi nhan
    if (w.lateral !== undefined && !w.node) {
      const wrong = w.lateral < -0.3 && Math.abs(car.speed) > 0.5
      if (wrong && !ob.wrongSide) this.sc.deduct(10, "Đè vạch tim đường, đi vào phần đường ngược chiều")
      ob.wrongSide = wrong
      const lane: 0 | 1 = w.lateral < LANE ? 0 : 1
      if (ob.resyncLane) {
        ob.resyncLane = false
        ob.laneSide = lane
      } else if (lane !== ob.laneSide && w.lateral > 0.4 && Math.abs(w.lateral - LANE) > 0.6) {
        const side = lane === 0 ? "left" : "right"
        if (!signalRecent(side)) this.sc.deduct(5, "Chuyển làn không bật đèn xi nhan")
        ob.laneSide = lane
        const t = this.currentTask()
        if (t?.kind === "lane" && t.to === lane) this.advanceTask()
      }
    }

    // Giao lộ: rẽ, đèn, STOP
    if (w.node && w.node !== ob.node) {
      ob.node = w.node
      ob.enterHeading = car.heading
      ob.enterSignal = car.signal !== "none" ? car.signal : ob.lastSignalAt > this.time - 6 ? ob.lastSignal : "none"
      const appr = dir(car.heading)
      if (w.node === LIGHT_NODE && lightFor(this.clock, appr) === "red") this.sc.deduct(10, "Vi phạm tín hiệu đèn giao thông (vượt đèn đỏ)")
      if (isT(w.node) && ob.stopSignNode === w.node && !ob.stopSignStopped) this.sc.deduct(10, "Không dừng xe tại biển STOP khi từ đường nhánh ra đường chính")
    }
    if (!w.node && ob.node) {
      const t = turnOf(dir(ob.enterHeading), dir(car.heading))
      ob.node = undefined
      ob.resyncLane = true
      if ((t === "left" || t === "uturn") && ob.enterSignal !== "left") this.sc.deduct(10, "Không bật đèn xi nhan khi chuyển hướng")
      if (t === "right" && ob.enterSignal !== "right") this.sc.deduct(10, "Không bật đèn xi nhan khi chuyển hướng")
      const task = this.currentTask()
      if (task?.kind === "move") {
        if (task.move !== t) this.sc.deduct(5, `Không thực hiện đúng hiệu lệnh (${MOVE_TEXT[task.move].toLowerCase()})`)
        this.advanceTask()
      }
    }
    // Biển STOP: phát hiện tiếp cận ngã ba từ đường nhánh
    if (!w.node) {
      const ahead = this.upcomingNode(car)
      if (ahead && isT(ahead.node) && ahead.minor) {
        if (ob.stopSignNode !== ahead.node) {
          ob.stopSignNode = ahead.node
          ob.stopSignStopped = false
        }
        if (ahead.dist < 9 && still > 0.5) ob.stopSignStopped = true
      }
    }

    this.assignMove(car)
    this.taskRules(car, still)
    if (this.sc.fatal) this.finish(false)
  }

  /** Gắn hiệu lệnh rẽ với giao lộ sắp tới, đổi sang hướng đi được nếu giao lộ không cho phép. */
  private assignMove(car: Car) {
    const t = this.currentTask()
    if (t?.kind !== "move" || t.node || this.ob.node) return
    const up = this.upcomingNode(car)
    if (!up || up.dist > 70 || !up.from) return
    const d0 = norm(sub(nodePos(up.node), nodePos(up.from)))
    const allowed = new Set(neighbors(up.node).filter((b) => b !== up.from).map((b) => turnOf(d0, norm(sub(nodePos(b), nodePos(up.node))))))
    if (neighbors(up.node).length >= 3) allowed.add("uturn")
    if (!allowed.has(t.move)) {
      const pref = (["straight", "right", "left"] as const).find((m) => allowed.has(m))
      t.move = pref ?? "straight"
    }
    t.node = up.node
  }

  /** Nút giao phía trước xe trên đoạn đường đang đi. */
  private upcomingNode(car: Car) {
    const c = car.points().center
    const f = dir(car.heading)
    let best: { node: NodeId; dist: number; minor: boolean; from?: NodeId } | undefined
    for (const n of NODES) {
      const rel = sub(nodePos(n), c)
      const ahead = dot(rel, f) - BOX
      if (ahead < 0 || ahead > 90 || Math.abs(dot(rel, leftOf(f))) > HALF + 2) continue
      if (!best || ahead < best.dist) {
        const from = NODES.find((m) => m !== n && neighbors(n).includes(m) && dot(sub(nodePos(n), nodePos(m)), f) > 0.5 * len(sub(nodePos(n), nodePos(m))))
        best = { node: n, dist: ahead, minor: from ? this.isMinorApproach(from, n) : false, from }
      }
    }
    return best
  }

  private taskRules(car: Car, still: number) {
    const t = this.currentTask()
    const ob = this.ob
    if (!t) return
    if (t.kind === "emergency") {
      const since = this.time - ob.emergencyAt
      if (!ob.emergencyStopped && still > 0.3) {
        ob.emergencyStopped = true
        const w = this.where(car)
        if (w.lateral !== undefined && w.lateral < LANE + 0.5) this.sc.deduct(5, "Dừng xe không sát lề đường bên phải")
        if (!car.hazard) this.sc.deduct(5, "Không bật đèn cảnh báo nguy hiểm khi dừng khẩn cấp")
      }
      if (!ob.emergencyStopped && since > 8) {
        ob.emergencyStopped = true
        this.sc.deduct(10, "Không dừng xe khi gặp tình huống nguy hiểm")
      }
      if (ob.emergencyStopped && since > 3 && this.alarm) {
        this.alarm = false
      }
      if (ob.emergencyStopped && !this.alarm && Math.abs(car.speed) > 1) {
        if (car.hazard) this.sc.deduct(5, "Không tắt đèn cảnh báo nguy hiểm trước khi đi tiếp")
        this.advanceTask()
      }
    }
    if (t.kind === "overtake") {
      // Chọn xe chạy chậm phía trước cùng chiều để vượt
      const c = car.points().center
      const f = dir(car.heading)
      if (ob.overtakeId < 0) {
        const idx = this.npcs.findIndex((n) => n.onLane && dot(dir(n.heading), f) > 0.9 && dot(sub(n.pos, c), f) > 15 && dot(sub(n.pos, c), f) < 80 && Math.abs(dot(sub(n.pos, c), leftOf(f))) < 6)
        if (idx >= 0) {
          ob.overtakeId = idx
          this.npcs[idx].cruise = 5
        } else if (this.time - this.taskShownAt > 60) this.advanceTask()
      } else {
        const n = this.npcs[ob.overtakeId]
        if (dot(sub(c, n.pos), f) > 8) {
          n.cruise = 10
          this.advanceTask()
        } else if (this.time - this.taskShownAt > 90) {
          n.cruise = 10
          this.advanceTask()
        }
      }
    }
    if (t.kind === "lane" && this.time - this.taskShownAt > 45) {
      this.sc.deduct(5, "Không thực hiện đúng hiệu lệnh chuyển làn")
      this.advanceTask()
    }
    if (t.kind === "finish" && still > 1) {
      const w = this.where(car)
      if (w.lateral !== undefined && w.lateral < LANE + 0.5) this.sc.deduct(5, "Dừng xe không sát lề đường bên phải")
      if (car.signal !== "right" && this.ob.lastSignal !== "right") this.sc.deduct(5, "Không bật xi nhan phải khi tấp vào lề")
      this.finish(this.sc.score >= PASS_SCORE)
    }
  }

  private finish(passed: boolean) {
    if (this.status !== "running") return
    this.status = passed ? "passed" : "failed"
    this.alarm = false
    this.sc.sounds.push(passed ? "done" : "fatal")
  }

  instruction(car: Car): Instruction {
    if (this.status === "ready")
      return {
        title: "Bài 1 · Kiểm tra an toàn và xuất phát",
        detail: "Thắt dây an toàn (B), nhả phanh tay (Space), về số D (4), bật xi nhan trái (Q). Bấm “Nhận lệnh xuất phát”.",
      }
    if (this.status !== "running") return { title: "Kết thúc bài thi", detail: "" }
    const t = this.currentTask()
    if (!t) return { title: "Kết thúc", detail: "" }
    const ahead = this.upcomingNode(car)
    const stop = ahead && isT(ahead.node) && ahead.minor ? " Ngã ba phía trước có biển STOP: dừng hẳn trước vạch." : ""
    switch (t.kind) {
      case "move":
        return {
          title: `Hiệu lệnh: ${MOVE_TEXT[t.move]} ở giao lộ tiếp theo`,
          detail:
            (t.move === "straight" ? "Giữ làn, chấp hành đèn tín hiệu." : t.move === "uturn" ? "Bật xi nhan trái, giảm tốc, quay đầu trong giao lộ, nhường xe ngược chiều." : `Bật xi nhan ${t.move === "left" ? "trái, vào làn trong" : "phải, đi làn ngoài"}, giảm tốc, nhường người đi bộ.`) + stop,
          toLine: ahead?.dist,
        }
      case "lane":
        return { title: `Hiệu lệnh: Chuyển sang làn ${t.to === 0 ? "trái (làn trong)" : "phải (làn ngoài)"}`, detail: `Quan sát gương, bật xi nhan ${t.to === 0 ? "trái" : "phải"} rồi mới chuyển làn, không đè vạch tim đường.` }
      case "overtake":
        return { title: "Bài 2 · Tăng tốc vượt xe", detail: "Bật xi nhan trái, chuyển sang làn trái, tăng tốc vượt xe chạy chậm phía trước, rồi xi nhan phải về làn cũ." }
      case "emergency":
        return { title: "⚠ Bài 9 · Dừng xe khi gặp tình huống nguy hiểm", detail: "Bật xi nhan phải, giảm tốc, dừng sát lề phải, bật đèn cảnh báo nguy hiểm (H). Hết báo động: tắt đèn rồi đi tiếp." }
      case "finish":
        return { title: "Bài 12 · Kết thúc", detail: "Bật xi nhan phải, tấp sát lề phải và dừng xe." }
    }
  }
}
