import { useEffect, useMemo, useRef, useState } from "react"
import confetti from "canvas-confetti"
import {
  ArrowRight,
  BookOpenCheck,
  Brain,
  CalendarClock,
  CircleHelp,
  Flame,
  NotebookPen,
  Pause,
  Siren,
  TriangleAlert,
  Trophy,
} from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Progress } from "@/components/ui/progress"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Kbd } from "@/components/Kbd"
import { QuestionMeta, QuestionView } from "@/components/QuestionView"
import { BY_N, CHAPTERS } from "@/lib/questions"
import {
  autoDailyNew,
  buildSession,
  buildWrongQueue,
  daysToExam,
  isDue,
  MASTERED_STABILITY,
  newLearnedToday,
  sessionMinutes,
  todayPlan,
  WB_CLEAR_STREAK,
  type Grade,
  type StudyFocus,
} from "@/lib/srs"
import { cn } from "@/lib/utils"
import { useStore } from "@/store"

/** Thời gian (ms) tự chuyển câu sau khi trả lời đúng */
const AUTO_MS = 1600

export function StudyView({ kind }: { kind: "study" | "wrong" }) {
  const study = useStore((s) => s.study)
  if (study && study.kind === kind) {
    return study.pos >= study.queue.length ? <Summary /> : <Runner />
  }
  return kind === "study" ? <StudySetup /> : <WrongSetup />
}

/** Kế hoạch hôm nay — dùng chung cho trang Học và Tổng quan. */
export function useTodayPlan(focus: StudyFocus = "all") {
  const progress = useStore((s) => s.progress)
  const settings = useStore((s) => s.settings)
  return useMemo(() => {
    const dailyNew = autoDailyNew(progress, settings.examDate, settings.dailyNew)
    const doneNew = newLearnedToday(progress)
    const plan = todayPlan(progress, focus, dailyNew - doneNew)
    const session = buildSession(plan, settings.sessionSize)
    return { ...plan, dailyNew, doneNew, session, minutes: sessionMinutes(plan.due.length, plan.fresh.length) }
  }, [progress, settings, focus])
}

function StudySetup() {
  const startStudy = useStore((s) => s.startStudy)
  const examDate = useStore((s) => s.settings.examDate)
  const other = useStore((s) => s.study)
  const [focus, setFocus] = useState<StudyFocus>("all")
  const plan = useTodayPlan(focus)
  const days = daysToExam(examDate)
  const sessionDue = plan.session.filter((n) => plan.due.includes(n)).length
  const sessionNew = plan.session.length - sessionDue

  return (
    <div className="mx-auto max-w-2xl space-y-5">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-xl">
            <Brain className="size-5 text-primary" /> Phiên học tiếp theo
          </CardTitle>
          <CardDescription>
            Phiên ngắn ~{sessionMinutes(sessionDue, sessionNew)} phút. Học vài phiên rải trong ngày giúp nhớ tốt hơn một
            phiên dài.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-5">
          <div className="grid grid-cols-3 gap-3 text-center">
            <Stat label="Câu ôn" value={sessionDue} tone="text-primary" />
            <Stat label="Câu mới" value={sessionNew} tone="text-success" />
            <Stat label="Còn lại hôm nay" value={plan.due.length + plan.fresh.length} />
          </div>

          {other && (
            <p className="rounded-lg bg-muted p-3 text-sm text-muted-foreground">
              Bạn đang có một buổi ôn Sổ câu sai dở dang — bắt đầu phiên mới sẽ thay thế nó.
            </p>
          )}

          <Button
            size="lg"
            className="h-12 w-full text-base"
            disabled={!plan.session.length}
            onClick={() => startStudy("study", focus, plan.session)}
          >
            {plan.session.length ? (
              <>
                Bắt đầu phiên <ArrowRight />
              </>
            ) : (
              "Xong việc hôm nay — mai quay lại nhé"
            )}
          </Button>

          <div className="flex flex-wrap items-center justify-between gap-3 border-t pt-4 text-sm">
            <span className="text-muted-foreground">
              Câu mới hôm nay: <b className="text-foreground tabular-nums">{plan.doneNew}</b>/{plan.dailyNew}
              {days !== undefined && days >= 0 && <> · còn {days} ngày tới kỳ thi</>}
            </span>
            <Select value={focus} onValueChange={(v) => setFocus(v as StudyFocus)}>
              <SelectTrigger size="sm" className="w-auto min-w-44">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Tất cả chương (khuyến nghị)</SelectItem>
                <SelectItem value="critical">Chỉ câu điểm liệt</SelectItem>
                {CHAPTERS.map((c) => (
                  <SelectItem key={c.id} value={`ch${c.id}`}>
                    Chương {c.id}: {c.short}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>
      <HowItWorks />
    </div>
  )
}

function WrongSetup() {
  const progress = useStore((s) => s.progress)
  const startStudy = useStore((s) => s.startStudy)
  const items = useMemo(
    () =>
      Object.entries(progress)
        .filter(([, s]) => s.wb)
        .map(([n, s]) => ({ q: BY_N.get(Number(n))!, s }))
        .sort((a, b) => Number(b.q.k) - Number(a.q.k) || b.s.wrong - a.s.wrong),
    [progress],
  )
  return (
    <div className="mx-auto max-w-2xl space-y-5">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-xl">
            <NotebookPen className="size-5 text-destructive" /> Sổ câu sai
          </CardTitle>
          <CardDescription>
            Mọi câu từng làm sai đều nằm ở đây. Câu chỉ được gạch khỏi sổ khi bạn nhớ đúng ở {WB_CLEAR_STREAK} lần ôn
            liên tiếp (ở các buổi khác nhau) — đúng ngay sau khi vừa xem đáp án chưa tính là thuộc.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <Button
            size="lg"
            className="w-full"
            disabled={!items.length}
            onClick={() => startStudy("wrong", "all", buildWrongQueue(progress).slice(0, 30))}
          >
            {items.length ? (
              <>
                Ôn {Math.min(30, items.length)} câu sai <ArrowRight />
              </>
            ) : (
              "Sổ trống — tuyệt vời!"
            )}
          </Button>
          {items.length > 0 && (
            <ul className="divide-y rounded-xl border">
              {items.map(({ q, s }) => (
                <li key={q.n} className="flex items-start gap-3 p-3 text-sm">
                  <span className="w-10 shrink-0 font-semibold tabular-nums">#{q.n}</span>
                  <span className="line-clamp-2 flex-1">{q.q}</span>
                  <span className="flex shrink-0 items-center gap-1.5">
                    {q.k && <Siren className="size-4 text-destructive" />}
                    <Badge variant="outline" className="tabular-nums">
                      sai {s.wrong}
                    </Badge>
                  </span>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  )
}

function Runner() {
  const study = useStore((s) => s.study)!
  const progress = useStore((s) => s.progress)
  const autoAdvance = useStore((s) => s.settings.autoAdvance)
  const choose = useStore((s) => s.choose)
  const advance = useStore((s) => s.advance)
  const endStudy = useStore((s) => s.endStudy)
  const n = study.queue[study.pos]
  const q = BY_N.get(n)!
  const s = progress[n]
  const answered = study.choice !== undefined
  const correct = study.choice === q.a
  const first = !study.graded.includes(n)
  const isNew = first && !s
  // Câu từng thuộc chắc mà nay sai: lỗi tự tin cao — đáng dừng lại đọc kỹ nhất.
  const trap = answered && !correct && first && !!s && s.f.stability >= MASTERED_STABILITY

  const shownAt = useRef(Date.now())
  const [elapsed, setElapsed] = useState(Infinity)
  const [paused, setPaused] = useState(false)
  useEffect(() => {
    shownAt.current = Date.now()
    setPaused(false)
    window.scrollTo({ top: 0, behavior: "smooth" })
  }, [study.pos])

  const pick = (i: number) => {
    setElapsed(Date.now() - shownAt.current)
    choose(i)
  }
  // Trả lời đúng nhanh ở câu ôn → "dễ", lịch giãn xa hơn. Ngưỡng tính theo độ dài câu hỏi.
  const fast = elapsed < 2500 + q.q.length * 30
  const gradeIfRight: Grade = first && s && fast ? "easy" : "good"
  const next = (g: Grade) => advance(g)

  const auto = answered && correct && autoAdvance && !paused
  useEffect(() => {
    if (!auto) return
    const t = setTimeout(() => advance(gradeIfRight), AUTO_MS)
    return () => clearTimeout(t)
  }, [auto, advance, gradeIfRight])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.metaKey || e.ctrlKey) return
      if (!answered) {
        const i = Number(e.key)
        if (i >= 1 && i <= q.o.length) pick(study.order[i - 1] ?? i)
      } else if (e.key === "Enter" || e.key === " ") {
        e.preventDefault()
        next(correct ? gradeIfRight : "wrong")
      } else if ((e.key === "g" || e.key === "G") && correct) {
        next("guess")
      }
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  })

  const unique = Object.keys(study.need).length
  const done = Object.values(study.need).filter((x) => x <= 0).length

  return (
    <div className="mx-auto max-w-2xl space-y-4">
      <div className="flex items-center gap-3">
        <Progress value={(done / unique) * 100} className="h-2 flex-1" />
        <span className="text-sm text-muted-foreground tabular-nums">
          {done}/{unique} câu
        </span>
        <Button variant="ghost" size="sm" onClick={endStudy}>
          Dừng
        </Button>
      </div>

      <Card className="relative overflow-hidden" onClick={() => auto && setPaused(true)}>
        {auto && (
          <div
            key={study.pos}
            className="absolute inset-x-0 top-0 h-1 origin-left bg-success"
            style={{ animation: `lv-shrink ${AUTO_MS}ms linear forwards` }}
          />
        )}
        <CardContent className="pt-1">
          <QuestionView
            q={q}
            order={study.order}
            choice={study.choice}
            reveal={answered}
            onChoose={answered ? undefined : pick}
            meta={
              <QuestionMeta
                q={q}
                extra={
                  isNew ? (
                    <Badge className="border-transparent bg-success/15 text-success">Mới</Badge>
                  ) : first ? (
                    <Badge variant="outline">Ôn tập</Badge>
                  ) : (
                    <Badge className="border-transparent bg-warning/20 text-warning-foreground dark:text-warning">
                      Nhắc lại · cần đúng thêm {Math.max(1, study.need[n])} lần
                    </Badge>
                  )
                }
              />
            }
          >
            {trap && (
              <div className="flex gap-3 rounded-xl border border-destructive/40 bg-destructive/8 p-3.5 text-sm">
                <TriangleAlert className="mt-0.5 size-4 shrink-0 text-destructive" />
                <div>
                  <b>Câu bẫy!</b> Bạn từng thuộc câu này mà vẫn chọn sai — đọc kỹ từ khoá trong câu hỏi và mẹo bên dưới.
                </div>
              </div>
            )}
            {isNew && answered && !correct && (
              <p className="text-sm text-muted-foreground">
                Câu mới làm sai là bình thường — việc thử trước rồi xem đáp án giúp nhớ lâu hơn chỉ đọc. Câu này sẽ quay
                lại sau vài câu.
              </p>
            )}
          </QuestionView>
        </CardContent>
      </Card>

      {!answered ? (
        <p className="text-center text-sm text-muted-foreground">
          Tự trả lời trong đầu trước, rồi mới chọn
          <span className="hidden sm:inline">
            {" "}— hoặc nhấn phím <Kbd>1</Kbd>–<Kbd>{q.o.length}</Kbd>
          </span>
        </p>
      ) : (
        <div className="sticky bottom-20 z-10 sm:bottom-4">
          {correct ? (
            <div className="grid gap-2 rounded-xl border bg-card/95 p-2 shadow-lg backdrop-blur sm:grid-cols-[1fr_auto]">
              <Button
                size="lg"
                className="bg-success text-success-foreground hover:bg-success/90"
                onClick={() => next(gradeIfRight)}
              >
                {auto ? "Đúng rồi — đang chuyển câu…" : "Đúng rồi — tiếp tục"}
                <Kbd className="ml-1 border-white/30 bg-white/15 text-inherit">Enter</Kbd>
              </Button>
              <div className="grid grid-cols-[1fr_auto] gap-2 sm:flex">
                <Button size="lg" variant="outline" onClick={() => next("guess")}>
                  <CircleHelp /> Mình đoán <Kbd className="ml-1">G</Kbd>
                </Button>
                {auto && (
                  <Button size="lg" variant="ghost" aria-label="Tạm dừng để đọc mẹo" onClick={() => setPaused(true)}>
                    <Pause />
                  </Button>
                )}
              </div>
            </div>
          ) : (
            <div className="rounded-xl border bg-card/95 p-2 shadow-lg backdrop-blur">
              <Button size="lg" variant="destructive" className="w-full" onClick={() => next("wrong")}>
                Đã hiểu <Kbd className="ml-1 border-white/30 bg-white/15 text-inherit">Enter</Kbd>
              </Button>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

function Summary() {
  const study = useStore((s) => s.study)!
  const progress = useStore((s) => s.progress)
  const endStudy = useStore((s) => s.endStudy)
  const startStudy = useStore((s) => s.startStudy)
  const setView = useStore((s) => s.setView)
  const plan = useTodayPlan()
  const unique = study.graded.length
  const acc = unique ? Math.round((study.firstCorrect / unique) * 100) : 0
  const minutes = Math.max(1, Math.round((Date.now() - study.startedAt) / 60000))
  const tomorrow = Date.now() + 86_400_000
  const dueTomorrow = study.graded.filter((n) => isDue(progress[n], tomorrow)).length

  useEffect(() => {
    confetti({ particleCount: acc >= 80 ? 140 : 60, spread: 75, origin: { y: 0.6 } })
  }, [acc])

  return (
    <Card className="mx-auto max-w-lg text-center">
      <CardHeader>
        <div className="mx-auto mb-2 flex size-14 items-center justify-center rounded-2xl bg-primary/10">
          <Trophy className="size-7 text-primary" />
        </div>
        <CardTitle className="text-2xl">Xong phiên!</CardTitle>
        <CardDescription>Mọi câu trong phiên đều đã được nhớ ra đúng đủ số lần.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-5">
        <div className="grid grid-cols-3 gap-3">
          <Stat label="Số câu" value={unique} />
          <Stat label="Đúng lần đầu" value={`${acc}%`} tone="text-success" />
          <Stat label="Thời gian" value={`${minutes}′`} />
        </div>
        <p className="flex items-center justify-center gap-2 text-sm text-muted-foreground">
          <CalendarClock className="size-4 text-primary" /> {dueTomorrow} câu trong phiên sẽ quay lại vào ngày mai, số
          còn lại giãn xa hơn.
        </p>
        <div className="grid gap-2 sm:grid-cols-2">
          {plan.session.length > 0 && study.kind === "study" ? (
            <Button onClick={() => startStudy("study", study.focus, plan.session)}>
              <BookOpenCheck /> Phiên tiếp ({plan.session.length} câu)
            </Button>
          ) : (
            <Button variant="outline" disabled>
              <Flame /> Xong việc hôm nay
            </Button>
          )}
          <Button
            variant="outline"
            onClick={() => {
              endStudy()
              setView("home")
            }}
          >
            Về tổng quan
          </Button>
        </div>
      </CardContent>
    </Card>
  )
}

export function Stat({ label, value, tone }: { label: string; value: React.ReactNode; tone?: string }) {
  return (
    <div className="rounded-xl bg-muted/70 px-2 py-3">
      <div className={cn("text-2xl font-bold tabular-nums", tone)}>{value}</div>
      <div className="mt-0.5 text-xs text-muted-foreground">{label}</div>
    </div>
  )
}

function HowItWorks() {
  const items = [
    ["Thử trước, xem sau", "Tự trả lời trước khi xem đáp án — kể cả câu mới. Đoán sai rồi được sửa vẫn nhớ tốt hơn chỉ đọc."],
    ["Nhắc lại tới khi thuộc", "Trong phiên, câu mới phải nhớ ra đúng 2 lần (điểm liệt 3 lần), cách nhau vài câu."],
    ["Lịch ôn FSRS", "Thuật toán của Anki dự đoán lúc bạn sắp quên từng câu để hẹn ôn đúng lúc — ít lần ôn mà vẫn nhớ."],
    ["Thành thật khi đoán", "Đoán trúng thì bấm “Mình đoán”: câu sẽ được ôn sớm hơn thay vì bị coi là đã thuộc."],
  ]
  return (
    <div className="grid gap-3 sm:grid-cols-2">
      {items.map(([t, d]) => (
        <div key={t} className="rounded-xl border bg-card p-3.5">
          <div className="text-sm font-semibold">{t}</div>
          <div className="mt-1 text-sm text-muted-foreground">{d}</div>
        </div>
      ))}
    </div>
  )
}
