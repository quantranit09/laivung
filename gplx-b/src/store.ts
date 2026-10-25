import { create } from "zustand"
import { persist } from "zustand/middleware"
import { BY_N, EXAM_FORMATS, type ExamFormat } from "@/lib/questions"
import {
  dayKey,
  migrateLeitner,
  optionOrder,
  recordExam,
  schedule,
  type Grade,
  type Progress,
} from "@/lib/srs"
import type { SyncData } from "@/lib/sync"

export type View = "home" | "study" | "exam" | "wrong" | "browse" | "sim"

export interface StudySession {
  kind: "study" | "wrong"
  /** Bài trên lộ trình (nếu là phiên học bài), để gợi ý bài tiếp theo */
  lesson?: string
  /** Tiêu đề hiển thị, vd. "Chương 5 · Bài 3" hoặc "Ôn tập hỗn hợp" */
  label: string
  queue: number[]
  pos: number
  /** Số lần còn phải nhớ ra đúng trong phiên, theo câu */
  need: Record<number, number>
  /** Những câu đã được chấm FSRS ở lần làm đầu tiên trong phiên */
  graded: number[]
  /** Thứ tự hiển thị đáp án của câu hiện tại (đã xáo) */
  order: number[]
  /** Câu đã chọn cho thẻ hiện tại (để F5 vẫn giữ trạng thái đã trả lời) */
  choice?: number
  startedAt: number
  firstCorrect: number
}

export interface ExamSession {
  format: ExamFormat
  questions: number[]
  answers: Record<number, number>
  flagged: number[]
  current: number
  startedAt: number
  endsAt: number
}

export interface ExamResult {
  id: string
  format: ExamFormat
  at: number
  durationSec: number
  questions: number[]
  answers: Record<number, number>
  score: number
  criticalOk: boolean
  passed: boolean
}

export interface Settings {
  theme: "light" | "dark"
  format: ExamFormat
  /** Số câu mới/ngày khi chưa đặt ngày thi */
  dailyNew: number
  /** yyyy-mm-dd */
  examDate?: string
  /** Số câu khác nhau mỗi phiên */
  sessionSize: number
  /** Trả lời đúng thì tự chuyển câu */
  autoAdvance: boolean
  /** Xáo thứ tự đáp án khi học */
  shuffle: boolean
}

export type SyncStatus = "off" | "idle" | "syncing" | "error" | "offline"

interface Data {
  progress: Progress
  settings: Settings
  settingsAt: number
  study?: StudySession
  studyAt: number
  exam?: ExamSession
  examAt: number
  history: ExamResult[]
  /** Số câu đã làm theo ngày (yyyy-mm-dd) */
  log: Record<string, number>
  /** Lần xoá tiến độ gần nhất — dữ liệu cũ hơn mốc này bị bỏ khi đồng bộ */
  resetAt: number
}

interface State extends Data {
  user?: string
  view: View
  sync: SyncStatus
  lastSynced?: number
  settingsOpen: boolean
  /** Chương cần mở sẵn khi vào trang Học ("0" = điểm liệt) */
  openChapter?: string

  setSettingsOpen: (b: boolean) => void
  openStudyChapter: (chapter: string) => void
  setView: (v: View) => void
  setSettings: (s: Partial<Settings>) => void
  startStudy: (kind: StudySession["kind"], queue: number[], opts: { label: string; lesson?: string }) => void
  choose: (choice: number) => void
  advance: (g: Grade) => void
  endStudy: () => void
  startExam: (format: ExamFormat, questions: number[]) => void
  answerExam: (n: number, choice: number) => void
  toggleFlag: (n: number) => void
  gotoExam: (i: number) => void
  submitExam: () => ExamResult | undefined
  abandonExam: () => void
  setUser: (u?: string) => void
  applySync: (d: SyncData) => void
  importData: (data: unknown) => void
  reset: () => void
}

const DEFAULT_SETTINGS: Settings = {
  theme: "light",
  format: "2025",
  dailyNew: 30,
  sessionSize: 20,
  autoAdvance: true,
  shuffle: true,
}

const emptyData = (): Data => ({
  progress: {},
  settings: DEFAULT_SETTINGS,
  settingsAt: 0,
  study: undefined,
  studyAt: 0,
  exam: undefined,
  examAt: 0,
  history: [],
  log: {},
  resetAt: 0,
})

/** Câu mới: phải nhớ ra đúng 2 lần trong phiên (điểm liệt 3 lần); câu ôn: 1 lần. */
const initialNeed = (n: number, isNew: boolean) => (isNew ? (BY_N.get(n)!.k ? 3 : 2) : 1)
/** Câu sai quay lại sau 3 câu; câu đúng nhưng chưa đủ số lần thì giãn xa hơn (5 câu). */
const GAP_WRONG = 3
const GAP_RIGHT = 5

export const useStore = create<State>()(
  persist(
    (set, get) => {
      const setStudy = (study: StudySession | undefined, extra: Partial<State> = {}) =>
        set({ study, studyAt: Date.now(), ...extra })
      const setExam = (exam: ExamSession | undefined, extra: Partial<State> = {}) =>
        set({ exam, examAt: Date.now(), ...extra })
      const orderFor = (n: number | undefined) =>
        n === undefined ? [] : optionOrder(BY_N.get(n)!, get().settings.shuffle)

      return {
        ...emptyData(),
        view: "home",
        sync: "off",
        settingsOpen: false,

        setSettingsOpen: (settingsOpen) => set({ settingsOpen }),
        openStudyChapter: (openChapter) => set({ openChapter, view: "study" }),

        setView: (view) => set({ view }),
        setSettings: (s) => set({ settings: { ...get().settings, ...s }, settingsAt: Date.now() }),

        startStudy: (kind, queue, { label, lesson }) => {
          const { progress } = get()
          const need: Record<number, number> = {}
          for (const n of queue) need[n] = kind === "wrong" ? 2 : initialNeed(n, !progress[n])
          set({ view: kind === "wrong" ? "wrong" : "study" })
          setStudy({
            kind,
            label,
            lesson,
            queue,
            pos: 0,
            need,
            graded: [],
            order: orderFor(queue[0]),
            startedAt: Date.now(),
            firstCorrect: 0,
          })
        },

        choose: (choice) => {
          const st = get().study
          if (!st || st.choice !== undefined) return
          setStudy({ ...st, choice })
        },

        advance: (g) => {
          const { study: st, progress, log } = get()
          if (!st) return
          const n = st.queue[st.pos]
          const now = Date.now()
          const first = !st.graded.includes(n)
          const queue = [...st.queue]
          const need = { ...st.need }
          let left = need[n] ?? 1
          if (g === "wrong") left = Math.max(left, 2)
          else if (g !== "guess") left--
          need[n] = left
          if (left > 0) queue.splice(Math.min(st.pos + 1 + (g === "wrong" ? GAP_WRONG : GAP_RIGHT), queue.length), 0, n)
          const today = dayKey(now)
          setStudy(
            {
              ...st,
              queue,
              need,
              pos: st.pos + 1,
              choice: undefined,
              order: orderFor(queue[st.pos + 1]),
              graded: first ? [...st.graded, n] : st.graded,
              firstCorrect: st.firstCorrect + (first && g !== "wrong" ? 1 : 0),
            },
            {
              // Chỉ lần làm đầu tiên trong phiên được chấm vào FSRS.
              progress: first ? { ...progress, [n]: schedule(n, progress[n], g, now) } : progress,
              log: { ...log, [today]: (log[today] ?? 0) + 1 },
            },
          )
        },

        endStudy: () => setStudy(undefined),

        startExam: (format, questions) => {
          const now = Date.now()
          set({ view: "exam" })
          setExam({
            format,
            questions,
            answers: {},
            flagged: [],
            current: 0,
            startedAt: now,
            endsAt: now + EXAM_FORMATS[format].minutes * 60_000,
          })
        },
        answerExam: (n, choice) => {
          const ex = get().exam
          if (ex) setExam({ ...ex, answers: { ...ex.answers, [n]: choice } })
        },
        toggleFlag: (n) => {
          const ex = get().exam
          if (!ex) return
          const flagged = ex.flagged.includes(n) ? ex.flagged.filter((x) => x !== n) : [...ex.flagged, n]
          setExam({ ...ex, flagged })
        },
        gotoExam: (current) => {
          const ex = get().exam
          if (ex) setExam({ ...ex, current: Math.max(0, Math.min(current, ex.questions.length - 1)) })
        },
        submitExam: () => {
          const { exam: ex, progress, history, log } = get()
          if (!ex) return
          const now = Date.now()
          const f = EXAM_FORMATS[ex.format]
          let score = 0
          let criticalOk = true
          const next = { ...progress }
          for (const n of ex.questions) {
            const q = BY_N.get(n)!
            const ok = ex.answers[n] === q.a
            if (ok) score++
            else if (q.k) criticalOk = false
            next[n] = recordExam(n, next[n], ok, now)
          }
          const result: ExamResult = {
            id: String(now),
            format: ex.format,
            at: now,
            durationSec: Math.round((Math.min(now, ex.endsAt) - ex.startedAt) / 1000),
            questions: ex.questions,
            answers: ex.answers,
            score,
            criticalOk,
            passed: criticalOk && score >= f.pass,
          }
          const today = dayKey()
          setExam(undefined, {
            progress: next,
            history: [result, ...history].slice(0, 100),
            log: { ...log, [today]: (log[today] ?? 0) + ex.questions.length },
          })
          return result
        },
        abandonExam: () => setExam(undefined),

        setUser: (user) => set(user ? { user } : { ...emptyData(), user: undefined, view: "home", sync: "off" }),

        applySync: (d) =>
          set({
            progress: d.progress,
            history: d.history as ExamResult[],
            log: d.log,
            settings: { ...DEFAULT_SETTINGS, ...(d.settings as Partial<Settings>) },
            settingsAt: d.settingsAt,
            study: (d.study ?? undefined) as StudySession | undefined,
            studyAt: d.studyAt,
            exam: (d.exam ?? undefined) as ExamSession | undefined,
            examAt: d.examAt,
            resetAt: d.resetAt,
          }),

        importData: (data) => {
          const d = data as Partial<Data> & { app?: string; version?: number }
          if (d?.app !== "laivung" || typeof d.progress !== "object") throw new Error("File không đúng định dạng sao lưu của LáiVững")
          const progress = d.version === 1 ? migrateLeitner(d.progress as never) : d.progress!
          const now = Date.now()
          // Đóng dấu thời gian mới để bản khôi phục thắng khi đồng bộ.
          for (const s of Object.values(progress)) s.last = Math.max(s.last, now)
          set({
            progress,
            history: d.history ?? [],
            log: d.log ?? {},
            settings: { ...get().settings, ...(d.settings ?? {}) },
            settingsAt: now,
          })
          setStudy(undefined)
          setExam(undefined)
        },
        reset: () => {
          const now = Date.now()
          // Giữ mốc thời gian mới để việc xoá cũng được đồng bộ sang trình duyệt khác.
          set({ ...emptyData(), settings: get().settings, settingsAt: now, studyAt: now, examAt: now, resetAt: now })
        },
      }
    },
    {
      name: "laivung-v1",
      version: 2,
      partialize: ({ user, progress, settings, settingsAt, view, study, studyAt, exam, examAt, history, log, resetAt }) => ({
        user, progress, settings, settingsAt, view, study, studyAt, exam, examAt, history, log, resetAt,
      }),
      migrate: (persisted, version) => {
        const p = persisted as Record<string, unknown>
        if (version < 2) {
          return {
            ...p,
            progress: migrateLeitner((p.progress ?? {}) as never),
            settings: { ...DEFAULT_SETTINGS, ...(p.settings as object) },
            settingsAt: 0,
            study: undefined, // định dạng phiên cũ không tương thích
            studyAt: 0,
            examAt: 0,
            resetAt: 0,
          }
        }
        return p
      },
      merge: (persisted, current) => {
        const p = persisted as Partial<State>
        return { ...current, ...p, settings: { ...DEFAULT_SETTINGS, ...p?.settings } }
      },
    },
  ),
)

export function syncSnapshot(): SyncData {
  const { progress, history, log, settings, settingsAt, study, studyAt, exam, examAt, resetAt } = useStore.getState()
  return { progress, history, log, settings, settingsAt, study: study ?? null, studyAt, exam: exam ?? null, examAt, resetAt }
}

export function exportData() {
  const { progress, settings, history, log } = useStore.getState()
  return { app: "laivung", version: 2, exportedAt: new Date().toISOString(), progress, settings, history, log }
}
