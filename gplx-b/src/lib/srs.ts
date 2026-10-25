/**
 * Lịch ôn dựa trên FSRS (Free Spaced Repetition Scheduler) — thuật toán dùng trong Anki,
 * dự đoán xác suất còn nhớ từng câu và hẹn ôn đúng lúc sắp quên.
 *
 * Kết hợp với "successive relearning" (Rawson & Dunlosky): trong một buổi, câu mới phải
 * được nhớ ra đúng nhiều lần (câu điểm liệt 3 lần) mới được thả; qua các ngày FSRS lo
 * phần giãn cách. Chỉ lần làm ĐẦU TIÊN của mỗi câu trong buổi mới được chấm vào FSRS —
 * đó mới là phép thử trí nhớ thật, các lần sau là luyện cho thuộc.
 */
import { createEmptyCard, fsrs, generatorParameters, Rating, State, type Card, type Grade as FsrsGrade } from "ts-fsrs"
import { BY_N, EXAM_FORMATS, QUESTIONS, type ExamFormat, type Question } from "./questions"

export type Grade = "wrong" | "guess" | "good" | "easy"

interface StoredCard {
  due: number
  stability: number
  difficulty: number
  elapsed_days: number
  scheduled_days: number
  learning_steps: number
  reps: number
  lapses: number
  state: State
  last_review?: number
}

export interface CardState {
  f: StoredCard
  seen: number
  right: number
  wrong: number
  /** Số lần đúng liên tiếp */
  streak: number
  /** Đang nằm trong Sổ câu sai */
  wb: boolean
  /** Lần cập nhật cuối (ms) — dùng để gộp dữ liệu giữa các trình duyệt */
  last: number
  /** Lần đầu gặp câu này (ms) — để đếm câu mới đã học trong ngày */
  first: number
}

export type Progress = Record<number, CardState>

const DAY = 86_400_000
/** Ngưỡng "đã thuộc": độ bền trí nhớ ≥ 7 ngày */
export const MASTERED_STABILITY = 7
/** Phải đúng liên tiếp chừng này lần mới ra khỏi Sổ câu sai */
export const WB_CLEAR_STREAK = 2

// Đề thi đòi ~90% đúng và không được sai câu điểm liệt, nên đặt mục tiêu nhớ cao hơn mặc định.
const params = { enable_fuzz: true, enable_short_term: false, maximum_interval: 180 }
const normalScheduler = fsrs(generatorParameters({ ...params, request_retention: 0.92 }))
const criticalScheduler = fsrs(generatorParameters({ ...params, request_retention: 0.97 }))
const schedulerFor = (n: number) => (BY_N.get(n)?.k ? criticalScheduler : normalScheduler)

const toCard = (c: StoredCard): Card => ({
  ...c,
  due: new Date(c.due),
  last_review: c.last_review ? new Date(c.last_review) : undefined,
})
const fromCard = (c: Card): StoredCard => ({
  due: c.due.getTime(),
  stability: c.stability,
  difficulty: c.difficulty,
  elapsed_days: c.elapsed_days,
  scheduled_days: c.scheduled_days,
  learning_steps: c.learning_steps,
  reps: c.reps,
  lapses: c.lapses,
  state: c.state,
  last_review: c.last_review?.getTime(),
})

const RATING: Record<Grade, FsrsGrade> = {
  wrong: Rating.Again,
  guess: Rating.Hard,
  good: Rating.Good,
  easy: Rating.Easy,
}

export const startOfDay = (t = Date.now()) => {
  const d = new Date(t)
  d.setHours(0, 0, 0, 0)
  return d.getTime()
}
export const dayKey = (t = Date.now()) => {
  const d = new Date(t)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`
}

/** Chấm một lần làm câu vào FSRS. */
export function schedule(n: number, prev: CardState | undefined, grade: Grade, now = Date.now()): CardState {
  const card = prev ? toCard(prev.f) : createEmptyCard(new Date(now))
  const next = schedulerFor(n).next(card, new Date(now), RATING[grade]).card
  const s: CardState = prev ? { ...prev } : { f: fromCard(next), seen: 0, right: 0, wrong: 0, streak: 0, wb: false, last: now, first: now }
  s.f = fromCard(next)
  s.seen++
  s.last = now
  if (grade === "wrong") {
    s.wrong++
    s.streak = 0
    s.wb = true
  } else {
    s.right++
    s.streak++
    if (s.wb && grade !== "guess" && s.streak >= WB_CLEAR_STREAK) s.wb = false
  }
  return s
}

/** Kết quả thi thử: sai thì chấm như quên; đúng chỉ ghi thống kê, không đẩy lịch xa thêm. */
export function recordExam(n: number, prev: CardState | undefined, correct: boolean, now = Date.now()): CardState {
  if (!correct) return schedule(n, prev, "wrong", now)
  if (!prev) return schedule(n, prev, "guess", now)
  return { ...prev, seen: prev.seen + 1, right: prev.right + 1, streak: prev.streak + 1, last: now }
}

/** Xác suất còn nhớ (theo FSRS) tại thời điểm `now`. */
export function retrievability(n: number, s: CardState | undefined, now = Date.now()) {
  if (!s || s.f.state === State.New) return 0
  return schedulerFor(n).get_retrievability(toCard(s.f), new Date(now), false)
}

/** Xác suất trả lời đúng nếu câu này ra trong đề: nhớ được, hoặc quên nhưng đoán trúng. */
export function recallProbability(q: Question, s: CardState | undefined, now = Date.now()): number {
  const chance = 1 / q.o.length
  const r = retrievability(q.n, s, now)
  return r + (1 - r) * chance
}

export const isMastered = (s?: CardState) => !!s && s.f.stability >= MASTERED_STABILITY && s.f.state === State.Review
export const isDue = (s: CardState | undefined, now = Date.now()) => !!s && s.f.due <= now

export function stats(progress: Progress, now = Date.now()) {
  let seen = 0, mastered = 0, due = 0, wb = 0, critMastered = 0
  for (const q of QUESTIONS) {
    const s = progress[q.n]
    if (!s) continue
    seen++
    if (isMastered(s)) {
      mastered++
      if (q.k) critMastered++
    }
    if (isDue(s, now)) due++
    if (s.wb) wb++
  }
  return { seen, mastered, due, wb, critMastered }
}

function binomAtLeast(n: number, p: number, k: number) {
  // P(X >= k) với X ~ Bin(n, p)
  let total = 0
  let coef = 1
  for (let i = 0; i <= n; i++) {
    if (i > 0) coef = (coef * (n - i + 1)) / i
    if (i >= k) total += coef * Math.pow(p, i) * Math.pow(1 - p, n - i)
  }
  return total
}

/**
 * Xác suất đậu ước tính: đề có 1 câu điểm liệt (phải đúng) và (total-1) câu
 * thường cần đúng ít nhất (pass-1). Giả định độc lập — đây là chỉ báo, không phải lời hứa.
 */
export function passProbability(progress: Progress, format: ExamFormat, now = Date.now()) {
  const f = EXAM_FORMATS[format]
  let pc = 0, nc = 0, pn = 0, nn = 0
  for (const q of QUESTIONS) {
    const p = recallProbability(q, progress[q.n], now)
    if (q.k) { pc += p; nc++ } else { pn += p; nn++ }
  }
  const critical = pc / nc
  const normal = pn / nn
  return { critical, normal, pass: critical * binomAtLeast(f.total - 1, normal, f.pass - 1) }
}

export function chapterMastery(progress: Progress) {
  const out: Record<number, { total: number; seen: number; mastered: number }> = {}
  for (const q of QUESTIONS) {
    const c = (out[q.c] ??= { total: 0, seen: 0, mastered: 0 })
    const s = progress[q.n]
    c.total++
    if (s) {
      c.seen++
      if (isMastered(s)) c.mastered++
    }
  }
  return out
}

/** Số ngày (làm tròn) tới lần ôn kế tiếp — để hiển thị. */
export const daysUntil = (t: number, now = Date.now()) => Math.max(0, Math.round((startOfDay(t) - startOfDay(now)) / DAY))

export const shuffle = <T,>(arr: T[]) => {
  const a = [...arr]
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[a[i], a[j]] = [a[j], a[i]]
  }
  return a
}

/** Trộn xen kẽ các nhóm (interleaving) thay vì học dồn từng chương. */
function interleave(groups: number[][]) {
  const out: number[] = []
  const gs = groups.map((g) => [...g]).filter((g) => g.length)
  while (gs.length) {
    for (let i = 0; i < gs.length; i++) {
      out.push(gs[i].shift()!)
      if (!gs[i].length) gs.splice(i--, 1)
    }
  }
  return out
}

export type StudyFocus = "all" | "critical" | `ch${number}`

const matchFocus = (focus: StudyFocus) => (q: Question) =>
  focus === "all" ? true : focus === "critical" ? q.k : q.c === Number(focus.slice(2))

/** Toàn bộ việc còn lại hôm nay: câu đến hạn (yếu nhất trước) và câu mới (điểm liệt trước). */
export function todayPlan(progress: Progress, focus: StudyFocus, newLeft: number, now = Date.now()) {
  const pool = QUESTIONS.filter(matchFocus(focus))
  const due = pool
    .filter((q) => isDue(progress[q.n], now))
    .sort((x, y) => Number(y.k) - Number(x.k) || retrievability(x.n, progress[x.n], now) - retrievability(y.n, progress[y.n], now))
    .map((q) => q.n)
  const fresh = pool.filter((q) => !progress[q.n])
  const freshCrit = fresh.filter((q) => q.k).map((q) => q.n)
  const byChapter = [1, 2, 3, 4, 5, 6].map((c) => fresh.filter((q) => !q.k && q.c === c).map((q) => q.n))
  const newOnes = [...freshCrit, ...interleave(byChapter)].slice(0, Math.max(0, newLeft))
  return { due, fresh: newOnes }
}

/**
 * Một phiên ngắn (~10–15 phút): tối đa `size` câu khác nhau, trộn câu ôn và câu mới.
 * Phiên ngắn giữ sự tập trung; học nhiều phiên rải trong ngày tốt hơn một phiên dài.
 */
export function buildSession(plan: { due: number[]; fresh: number[] }, size: number) {
  const reviews = plan.due.slice(0, size)
  // Câu mới phải nhớ đúng 2–3 lần trong phiên, nên mỗi câu mới chiếm chỗ 2 câu ôn.
  const fresh = plan.fresh.slice(0, Math.floor(Math.max(0, size - reviews.length) / 2))
  return interleave([reviews, fresh])
}

export const sessionMinutes = (due: number, fresh: number) => Math.max(1, Math.round((due * 12 + fresh * 30) / 60))

export function buildWrongQueue(progress: Progress) {
  return shuffle(QUESTIONS.filter((q) => progress[q.n]?.wb).map((q) => q.n))
}

/** Đề thi: đúng 1 câu điểm liệt, câu còn lại chia theo tỷ lệ số câu mỗi chương. */
export function buildExam(format: ExamFormat, progress?: Progress, weakBias = false) {
  const total = EXAM_FORMATS[format].total
  const crit = QUESTIONS.filter((q) => q.k)
  const normal = QUESTIONS.filter((q) => !q.k)
  const weight = (q: Question) => (weakBias && progress ? 1.15 - recallProbability(q, progress[q.n]) : 1)
  const pick = (arr: Question[], k: number) =>
    // Lấy mẫu có trọng số không hoàn lại (Efraimidis–Spirakis)
    arr
      .map((q) => ({ q, key: Math.pow(Math.random(), 1 / weight(q)) }))
      .sort((a, b) => b.key - a.key)
      .slice(0, k)
      .map((x) => x.q)
  const slots = total - 1
  const quotas = [1, 2, 3, 4, 5, 6].map((c) => {
    const exact = (normal.filter((q) => q.c === c).length / normal.length) * slots
    return { c, n: Math.floor(exact), rem: exact % 1 }
  })
  let left = slots - quotas.reduce((s, x) => s + x.n, 0)
  for (const x of [...quotas].sort((a, b) => b.rem - a.rem)) if (left-- > 0) x.n++
  const picked = [...pick(crit, 1), ...quotas.flatMap((x) => pick(normal.filter((q) => q.c === x.c), x.n))]
  return picked.sort((a, b) => a.c - b.c || a.n - b.n).map((q) => q.n)
}

const POSITIONAL = /(ý\s*\d|cả hai|cả ba|tất cả|các ý|đáp án|ý trên)/i
/**
 * Xáo thứ tự đáp án khi học để không thuộc theo vị trí ("câu này chọn 2").
 * Bỏ qua câu có phương án tham chiếu vị trí ("Cả hai ý trên", "Ý 1 và ý 2"…).
 */
export function optionOrder(q: Question, enabled: boolean) {
  const base = q.o.map((_, i) => i + 1)
  if (!enabled || q.o.some((o) => POSITIONAL.test(o)) || POSITIONAL.test(q.t)) return base
  return shuffle(base)
}

/** Số câu mới nên học mỗi ngày để kịp ngày thi (chừa 3 ngày cuối để ôn tổng). */
export function autoDailyNew(progress: Progress, examDate: string | undefined, fallback: number, now = Date.now()) {
  if (!examDate) return fallback
  const unseen = QUESTIONS.filter((q) => !progress[q.n]).length
  if (!unseen) return 0
  const daysLeft = Math.round((startOfDay(new Date(examDate + "T00:00").getTime()) - startOfDay(now)) / DAY)
  const learningDays = Math.max(1, daysLeft - 3)
  return Math.min(150, Math.max(10, Math.ceil(unseen / learningDays)))
}

export const newLearnedToday = (progress: Progress, now = Date.now()) => {
  const start = startOfDay(now)
  return Object.values(progress).filter((s) => s.first >= start).length
}

export const daysToExam = (examDate?: string, now = Date.now()) =>
  examDate ? Math.round((startOfDay(new Date(examDate + "T00:00").getTime()) - startOfDay(now)) / DAY) : undefined

export { State }
export const isCorrect = (n: number, choice: number | undefined) => choice === BY_N.get(n)!.a

/** Chuyển dữ liệu lịch Leitner cũ (v1) sang thẻ FSRS gần tương đương. */
export function migrateLeitner(old: Record<number, { level: number; due: number; seen: number; right: number; wrong: number; streak: number; wb: boolean; last: number }>): Progress {
  const INTERVALS = [0, 1, 3, 7, 14, 30, 60]
  const out: Progress = {}
  for (const [n, s] of Object.entries(old)) {
    out[Number(n)] = {
      f: {
        due: s.due,
        stability: Math.max(0.5, INTERVALS[s.level] ?? 1),
        difficulty: 5,
        elapsed_days: 0,
        scheduled_days: INTERVALS[s.level] ?? 0,
        learning_steps: 0,
        reps: s.seen,
        lapses: s.wrong,
        state: State.Review,
        last_review: s.last,
      },
      seen: s.seen,
      right: s.right,
      wrong: s.wrong,
      streak: s.streak,
      wb: s.wb,
      last: s.last,
      first: s.last,
    }
  }
  return out
}
