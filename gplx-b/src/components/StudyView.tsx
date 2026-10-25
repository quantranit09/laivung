import { useEffect, useMemo, useRef, useState } from "react"
import confetti from "canvas-confetti"
import {
  ArrowRight,
  BookOpenCheck,
  Brain,
  CalendarClock,
  CircleCheck,
  CircleHelp,
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
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion"
import { Kbd } from "@/components/Kbd"
import { QuestionMeta, QuestionView } from "@/components/QuestionView"
import { BY_N, CHAPTERS } from "@/lib/questions"
import {
  autoDailyNew,
  buildLessonSession,
  buildReviewSession,
  buildWrongQueue,
  CHAPTER_LESSONS,
  CRITICAL_LESSONS,
  daysToExam,
  isDue,
  LESSON_BY_ID,
  lessonRange,
  lessonStatus,
  lessonTitle,
  MASTERED_STABILITY,
  newLearnedToday,
  nextLesson,
  todayPlan,
  WB_CLEAR_STREAK,
  type Grade,
  type Lesson,
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

/** Kế hoạch hôm nay và các phiên có thể bắt đầu — dùng chung cho trang Học, Tổng quan, tóm tắt phiên. */
export function useStudyPlan() {
  const progress = useStore((s) => s.progress)
  const settings = useStore((s) => s.settings)
  const startStudy = useStore((s) => s.startStudy)
  const plan = useMemo(() => {
    const dailyNew = autoDailyNew(progress, settings.examDate, settings.dailyNew)
    const doneNew = newLearnedToday(progress)
    const { due } = todayPlan(progress, "all", 0)
    return { due, dailyNew, doneNew, review: buildReviewSession(due, settings.sessionSize), next: nextLesson(progress) }
  }, [progress, settings])
  const startReview = () => startStudy("study", plan.review, { label: "Ôn tập hỗn hợp" })
  const startLesson = (l: Lesson) => {
    const queue = buildLessonSession(progress, l)
    // Bài đã học hết và chưa tới hạn: cho ôn lại cả bài (FSRS vẫn tính được lần ôn sớm).
    startStudy("study", queue.length ? queue : l.ns, { label: lessonTitle(l), lesson: l.id })
  }
  return { ...plan, startReview, startLesson }
}

function StudySetup() {
  const progress = useStore((s) => s.progress)
  const other = useStore((s) => s.study)
  const examDate = useStore((s) => s.settings.examDate)
  const openChapter = useStore((s) => s.openChapter)
  const plan = useStudyPlan()
  const days = daysToExam(examDate)
  const [open, setOpen] = useState(() => openChapter ?? String(plan.next?.chapter ?? 0))
  useEffect(() => {
    if (!openChapter) return
    setOpen(openChapter)
    document.getElementById(`chapter-${openChapter}`)?.scrollIntoView({ behavior: "smooth", block: "start" })
    useStore.setState({ openChapter: undefined })
  }, [openChapter])
  const pickChapter = (key: string) => {
    setOpen(key)
    // Đợi accordion mở rồi mới cuộn tới.
    setTimeout(() => document.getElementById(`chapter-${key}`)?.scrollIntoView({ behavior: "smooth", block: "start" }), 50)
  }
  const reachedDaily = plan.doneNew >= plan.dailyNew
  const groups = [
    { key: "0", title: "60 câu điểm liệt", sub: "Ưu tiên học trước — sai 1 câu là trượt", lessons: CRITICAL_LESSONS },
    ...CHAPTERS.map((c) => ({ key: String(c.id), title: `Chương ${c.id}. ${c.name}`, sub: "", lessons: CHAPTER_LESSONS[c.id] })),
  ]

  return (
    <div className="mx-auto max-w-3xl space-y-5">
      {other && (
        <p className="rounded-lg bg-muted p-3 text-sm text-muted-foreground">
          Bạn đang có một buổi ôn Sổ câu sai dở dang — bắt đầu phiên mới sẽ thay thế nó.
        </p>
      )}

      <div className="grid gap-4 sm:grid-cols-2">
        <Card className="gap-4">
          <CardHeader>
            <CardDescription className="flex items-center gap-1.5">
              <Brain className="size-4 text-primary" /> Học bài tiếp theo
            </CardDescription>
            <CardTitle className="text-lg">{plan.next ? lessonTitle(plan.next) : "Đã học hết 600 câu 🎉"}</CardTitle>
            {plan.next && (
              <p className="text-sm text-muted-foreground">
                {plan.next.chapter ? CHAPTERS[plan.next.chapter - 1].name : "Câu điểm liệt"} · {lessonRange(plan.next)}
              </p>
            )}
          </CardHeader>
          <CardContent className="mt-auto space-y-2">
            <Button className="w-full" disabled={!plan.next} onClick={() => plan.next && plan.startLesson(plan.next)}>
              Học bài này <ArrowRight />
            </Button>
            <p className="text-xs text-muted-foreground">
              Câu mới hôm nay <b className="text-foreground tabular-nums">{plan.doneNew}</b>/{plan.dailyNew}
              {days !== undefined && days >= 0 && <> · còn {days} ngày tới kỳ thi</>}
              {reachedDaily && " · đã đủ chỉ tiêu, học thêm sẽ làm tăng lượng ôn ngày mai"}
            </p>
          </CardContent>
        </Card>

        <Card className="gap-4">
          <CardHeader>
            <CardDescription className="flex items-center gap-1.5">
              <CalendarClock className="size-4 text-primary" /> Ôn tập đến hạn
            </CardDescription>
            <CardTitle className="text-lg">{plan.due.length ? `${plan.due.length} câu cần ôn` : "Không có câu đến hạn"}</CardTitle>
            <p className="text-sm text-muted-foreground">Trộn mọi chương để luyện phân biệt các câu dễ nhầm.</p>
          </CardHeader>
          <CardContent className="mt-auto">
            <Button variant="secondary" className="w-full" disabled={!plan.review.length} onClick={plan.startReview}>
              {plan.review.length ? `Ôn ${plan.review.length} câu` : "Đã ôn xong hôm nay"}
            </Button>
          </CardContent>
        </Card>
      </div>

      <Card className="gap-2 py-4">
        <CardHeader className="px-4">
          <CardTitle className="text-base">Học theo chương</CardTitle>
          <CardDescription>Chọn chương, rồi chọn bài (~15 câu liên tiếp theo thứ tự trong bộ đề) để học hoặc ôn lại.</CardDescription>
          <div className="-mx-1 flex gap-1.5 overflow-x-auto px-1 pt-2 pb-1">
            {groups.map((g) => (
              <button
                key={g.key}
                onClick={() => pickChapter(g.key)}
                className={cn(
                  "shrink-0 rounded-full border px-3 py-1 text-xs font-medium whitespace-nowrap transition hover:bg-accent",
                  open === g.key && "border-primary bg-primary text-primary-foreground hover:bg-primary/90",
                )}
              >
                {g.key === "0" ? "Điểm liệt" : `C${g.key}. ${CHAPTERS[Number(g.key) - 1].short}`}
              </button>
            ))}
          </div>
        </CardHeader>
        <CardContent className="px-2 sm:px-4">
          <Accordion type="single" collapsible value={open} onValueChange={setOpen}>
            {groups.map((g) => {
              const st = g.lessons.map((l) => lessonStatus(progress, l))
              const total = st.reduce((a, x) => a + x.total, 0)
              const seen = st.reduce((a, x) => a + x.seen, 0)
              const mastered = st.reduce((a, x) => a + x.mastered, 0)
              const due = st.reduce((a, x) => a + x.due, 0)
              return (
                <AccordionItem key={g.key} value={g.key} id={`chapter-${g.key}`} className="scroll-mt-20">
                  <AccordionTrigger className="px-2 hover:no-underline">
                    <div className="flex min-w-0 flex-1 items-center gap-3">
                      <span
                        className={cn(
                          "flex size-9 shrink-0 items-center justify-center rounded-lg text-sm font-bold",
                          g.key === "0" ? "bg-destructive/12 text-destructive" : "bg-primary/10 text-primary",
                        )}
                      >
                        {g.key === "0" ? <Siren className="size-4" /> : g.key}
                      </span>
                      <div className="min-w-0 flex-1 space-y-1.5">
                        <div className="truncate font-medium">{g.title}</div>
                        <Bar seen={seen / total} mastered={mastered / total} />
                        <div className="text-xs font-normal text-muted-foreground">
                          {seen}/{total} đã học · {mastered} đã thuộc{due > 0 && ` · ${due} đến hạn`}
                          {g.sub && ` · ${g.sub}`}
                        </div>
                      </div>
                    </div>
                  </AccordionTrigger>
                  <AccordionContent className="space-y-3 px-2">
                    <ChapterActions lessons={g.lessons} onLesson={plan.startLesson} />
                    <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                      {g.lessons.map((l, i) => (
                        <LessonTile key={l.id} lesson={l} status={st[i]} isNext={plan.next?.id === l.id} onStart={() => plan.startLesson(l)} />
                      ))}
                    </div>
                  </AccordionContent>
                </AccordionItem>
              )
            })}
          </Accordion>
        </CardContent>
      </Card>
      <HowItWorks />
    </div>
  )
}

/** Nút nhanh trong mỗi chương: học tiếp bài chưa xong của chương, hoặc ôn các câu đến hạn của chương. */
function ChapterActions({ lessons, onLesson }: { lessons: Lesson[]; onLesson: (l: Lesson) => void }) {
  const progress = useStore((s) => s.progress)
  const startStudy = useStore((s) => s.startStudy)
  const sessionSize = useStore((s) => s.settings.sessionSize)
  const nextInChapter = lessons.find((l) => l.ns.some((n) => !progress[n]))
  const due = lessons.flatMap((l) => l.ns).filter((n) => isDue(progress[n]))
  const name = lessons[0].chapter ? `chương ${lessons[0].chapter}` : "câu điểm liệt"
  return (
    <div className="flex flex-wrap gap-2">
      {nextInChapter && (
        <Button size="sm" onClick={() => onLesson(nextInChapter)}>
          Học tiếp {name} · Bài {nextInChapter.index} <ArrowRight />
        </Button>
      )}
      {due.length > 0 && (
        <Button
          size="sm"
          variant="secondary"
          onClick={() => startStudy("study", buildReviewSession(due, sessionSize), { label: `Ôn ${name}` })}
        >
          Ôn {Math.min(due.length, sessionSize)} câu đến hạn của {name}
        </Button>
      )}
    </div>
  )
}

function Bar({ seen, mastered }: { seen: number; mastered: number }) {
  return (
    <div className="relative h-1.5 overflow-hidden rounded-full bg-muted">
      <div className="absolute inset-y-0 left-0 bg-primary/25" style={{ width: `${seen * 100}%` }} />
      <div className="absolute inset-y-0 left-0 rounded-full bg-primary" style={{ width: `${mastered * 100}%` }} />
    </div>
  )
}

function LessonTile({
  lesson,
  status: st,
  isNext,
  onStart,
}: {
  lesson: Lesson
  status: ReturnType<typeof lessonStatus>
  isNext: boolean
  onStart: () => void
}) {
  const allMastered = st.mastered === st.total
  return (
    <button
      onClick={onStart}
      className={cn(
        "relative flex flex-col gap-1.5 rounded-xl border bg-card p-3 text-left transition hover:border-primary/50 hover:bg-accent/50",
        isNext && "border-primary ring-2 ring-primary/20",
      )}
    >
      <div className="flex items-center justify-between gap-2">
        <span className="text-sm font-semibold">Bài {lesson.index}</span>
        {allMastered ? (
          <CircleCheck className="size-4 text-success" />
        ) : isNext ? (
          <Badge className="h-5 px-1.5 text-[0.65rem]">Tiếp theo</Badge>
        ) : st.due > 0 ? (
          <Badge variant="outline" className="h-5 px-1.5 text-[0.65rem] tabular-nums">
            {st.due} đến hạn
          </Badge>
        ) : null}
      </div>
      <span className="text-xs text-muted-foreground">{lessonRange(lesson)}</span>
      <Bar seen={st.seen / st.total} mastered={st.mastered / st.total} />
      <span className="text-[0.7rem] text-muted-foreground tabular-nums">
        {st.seen === 0 ? "Chưa học" : allMastered ? "Đã thuộc" : st.done ? `Đã học · ${st.mastered}/${st.total} thuộc` : `Đang học ${st.seen}/${st.total}`}
      </span>
    </button>
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
            onClick={() => startStudy("wrong", buildWrongQueue(progress).slice(0, 30), { label: "Sổ câu sai" })}
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
      <div className="text-sm font-semibold text-muted-foreground">{study.label}</div>
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
  const setView = useStore((s) => s.setView)
  const plan = useStudyPlan()
  const unique = study.graded.length
  const acc = unique ? Math.round((study.firstCorrect / unique) * 100) : 0
  const minutes = Math.max(1, Math.round((Date.now() - study.startedAt) / 60000))
  const tomorrow = Date.now() + 86_400_000
  const dueTomorrow = study.graded.filter((n) => isDue(progress[n], tomorrow)).length
  const thisLesson = study.lesson ? LESSON_BY_ID.get(study.lesson) : undefined

  useEffect(() => {
    confetti({ particleCount: acc >= 80 ? 140 : 60, spread: 75, origin: { y: 0.6 } })
  }, [acc])

  return (
    <Card className="mx-auto max-w-lg text-center">
      <CardHeader>
        <div className="mx-auto mb-2 flex size-14 items-center justify-center rounded-2xl bg-primary/10">
          <Trophy className="size-7 text-primary" />
        </div>
        <CardTitle className="text-2xl">{thisLesson ? `Xong ${lessonTitle(thisLesson)}!` : "Xong phiên!"}</CardTitle>
        <CardDescription>Mọi câu trong phiên đều đã được nhớ ra đúng đủ số lần.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-5">
        <div className="grid grid-cols-3 gap-3">
          <Stat label="Số câu" value={unique} />
          <Stat label="Đúng lần đầu" value={`${acc}%`} tone="text-success" />
          <Stat label="Thời gian" value={`${minutes}′`} />
        </div>
        <p className="flex items-center justify-center gap-2 text-sm text-muted-foreground">
          <CalendarClock className="size-4 shrink-0 text-primary" /> {dueTomorrow} câu trong phiên sẽ quay lại vào ngày
          mai, số còn lại giãn xa hơn.
        </p>
        <div className="grid gap-2">
          {study.kind === "study" && plan.review.length > 0 && (
            <Button onClick={plan.startReview}>
              <CalendarClock /> Ôn {plan.review.length} câu đến hạn
            </Button>
          )}
          {study.kind === "study" && plan.next && (
            <Button variant={plan.review.length ? "outline" : "default"} onClick={() => plan.startLesson(plan.next!)}>
              <BookOpenCheck /> Học tiếp {lessonTitle(plan.next)}
            </Button>
          )}
          <Button
            variant="ghost"
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
