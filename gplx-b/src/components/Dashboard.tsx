import { useMemo } from "react"
import { ArrowRight, Brain, CalendarCheck, CalendarDays, ClipboardCheck, Flame, NotebookPen, Siren, Target } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Progress } from "@/components/ui/progress"
import { CHAPTERS, EXAM_FORMATS, QUESTIONS } from "@/lib/questions"
import { chapterMastery, dayKey, daysToExam, lessonRange, lessonTitle, passProbability, stats } from "@/lib/srs"
import { useStudyPlan } from "@/components/StudyView"
import { cn } from "@/lib/utils"
import { useStore } from "@/store"

const CRIT_TOTAL = QUESTIONS.filter((q) => q.k).length

function streakDays(log: Record<string, number>) {
  let streak = 0
  const d = new Date()
  if (!log[dayKey(d.getTime())]) d.setDate(d.getDate() - 1) // hôm nay chưa học thì chưa mất chuỗi
  while (log[dayKey(d.getTime())]) {
    streak++
    d.setDate(d.getDate() - 1)
  }
  return streak
}

export function Dashboard() {
  const progress = useStore((s) => s.progress)
  const format = useStore((s) => s.settings.format)
  const log = useStore((s) => s.log)
  const history = useStore((s) => s.history)
  const study = useStore((s) => s.study)
  const exam = useStore((s) => s.exam)
  const setView = useStore((s) => s.setView)
  const setSettingsOpen = useStore((s) => s.setSettingsOpen)
  const examDate = useStore((s) => s.settings.examDate)
  const plan = useStudyPlan()
  const days = daysToExam(examDate)

  const st = useMemo(() => stats(progress), [progress])
  const pp = useMemo(() => passProbability(progress, format), [progress, format])
  const chapters = useMemo(() => chapterMastery(progress), [progress])
  const streak = streakDays(log)
  const recent = history.slice(0, 5)
  const passPct = Math.round(pp.pass * 100)
  const f = EXAM_FORMATS[format]
  const resume = exam ? "exam" : study ? (study.kind === "wrong" ? "wrong" : "study") : undefined

  const finalStretch = days !== undefined && days <= 3
  const lessonDesc = (l: NonNullable<typeof plan.next>) =>
    `${l.chapter ? CHAPTERS[l.chapter - 1].name : "Câu điểm liệt"} · ${lessonRange(l)}`
  const next =
    finalStretch && st.wb > 0
      ? { title: `Xử lý ${st.wb} câu trong Sổ câu sai`, desc: "Giai đoạn nước rút: dọn sạch lỗi sai trước.", go: () => setView("wrong") }
      : finalStretch
        ? { title: "Thi thử một đề", desc: "Giai đoạn nước rút: thi thử để quen áp lực thời gian.", go: () => setView("exam") }
        : plan.review.length
          ? {
              title: `Ôn ${plan.review.length} câu đến hạn`,
              desc: `Trộn các chương · khoảng ${Math.max(1, Math.round((plan.review.length * 12) / 60))} phút`,
              go: plan.startReview,
            }
          : plan.next && plan.doneNew < plan.dailyNew
            ? { title: `Học ${lessonTitle(plan.next)}`, desc: lessonDesc(plan.next), go: () => plan.startLesson(plan.next!) }
            : st.wb > 0
              ? { title: `Xử lý ${st.wb} câu trong Sổ câu sai`, desc: "Biến lỗi sai thành câu chắc chắn.", go: () => setView("wrong") }
              : plan.next
                ? { title: "Đã đủ chỉ tiêu hôm nay 🎉", desc: `Còn sức thì học thêm ${lessonTitle(plan.next)}.`, go: () => plan.startLesson(plan.next!) }
                : { title: "Thi thử một đề", desc: "Đã học hết 600 câu — kiểm tra độ sẵn sàng.", go: () => setView("exam") }

  return (
    <div className="space-y-5">
      {resume && (
        <button
          onClick={() => setView(resume)}
          className="flex w-full items-center gap-3 rounded-xl border-2 border-primary/40 bg-primary/6 p-3.5 text-left"
        >
          <span className="relative flex size-2.5">
            <span className="absolute inline-flex size-full animate-ping rounded-full bg-primary opacity-60" />
            <span className="relative inline-flex size-2.5 rounded-full bg-primary" />
          </span>
          <span className="flex-1 text-sm">
            <span className="font-semibold">
              {resume === "exam" ? "Bài thi thử đang dở" : "Buổi học đang dở"}
            </span>{" "}
            — tiếp tục đúng chỗ bạn dừng lại.
          </span>
          <ArrowRight className="size-4 text-primary" />
        </button>
      )}

      <div className="grid gap-5 lg:grid-cols-[1.35fr_1fr]">
        <Card className="overflow-hidden bg-gradient-to-br from-primary to-[oklch(0.38_0.18_268)] text-primary-foreground dark:text-white">
          <CardContent className="flex h-full flex-col justify-between gap-6">
            <div>
              <div className="text-sm font-medium opacity-80">Việc nên làm tiếp</div>
              <div className="mt-1 text-2xl font-bold tracking-tight">{next.title}</div>
              <div className="mt-1 text-sm opacity-85">{next.desc}</div>
              <button
                onClick={() => setSettingsOpen(true)}
                className="mt-4 inline-flex items-center gap-1.5 rounded-full bg-white/15 px-3 py-1 text-xs font-medium hover:bg-white/25"
              >
                <CalendarDays className="size-3.5" />
                {days === undefined
                  ? "Đặt ngày thi để app tự chia lịch"
                  : days >= 0
                    ? `Còn ${days} ngày tới kỳ thi · ${plan.dailyNew} câu mới/ngày`
                    : "Ngày thi đã qua — cập nhật ngày thi"}
              </button>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button size="lg" variant="secondary" onClick={next.go}>
                Bắt đầu <ArrowRight />
              </Button>
              <Button
                size="lg"
                variant="ghost"
                className="text-inherit hover:bg-white/15 hover:text-inherit"
                onClick={() => setView("exam")}
              >
                <ClipboardCheck /> Thi thử
              </Button>
              <Button
                size="lg"
                variant="ghost"
                className="text-inherit hover:bg-white/15 hover:text-inherit"
                onClick={() => setView("study")}
              >
                <Brain /> Lộ trình
              </Button>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardDescription className="flex items-center gap-1.5">
              <Target className="size-4" /> Khả năng đậu ước tính · đề {f.total} câu
            </CardDescription>
            <CardTitle className="flex items-end gap-2">
              <span
                className={cn(
                  "text-5xl font-extrabold tabular-nums",
                  passPct >= 90 ? "text-success" : passPct >= 60 ? "text-warning" : "text-destructive",
                )}
              >
                {passPct}%
              </span>
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 text-sm">
            <Meter label="Câu điểm liệt (phải đúng)" value={pp.critical} />
            <Meter label={`Câu thường (cần ≥ ${f.pass - 1}/${f.total - 1})`} value={pp.normal} />
            <p className="text-xs text-muted-foreground">
              Tính từ mức thuộc của từng câu trong 600 câu. Mục tiêu: ≥ 95% và đậu 5 đề thi thử liên tiếp.
            </p>
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Tile icon={Brain} label="Đã thuộc" value={`${st.mastered}/600`} sub={`${st.seen} câu đã gặp`} />
        <Tile icon={Siren} label="Điểm liệt đã thuộc" value={`${st.critMastered}/${CRIT_TOTAL}`} tone="text-destructive" />
        <Tile icon={CalendarCheck} label="Đến hạn ôn" value={st.due} tone="text-primary" />
        <Tile icon={Flame} label="Chuỗi ngày học" value={`${streak} ngày`} tone="text-warning" />
      </div>

      <div className="grid gap-5 lg:grid-cols-[1.35fr_1fr]">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Mức thuộc theo chương</CardTitle>
            <CardDescription>Thanh đậm = đã thuộc (trí nhớ bền ≥ 7 ngày) · nhạt = đã gặp</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {CHAPTERS.map((c) => {
              const m = chapters[c.id]
              return (
                <div key={c.id} className="space-y-1.5">
                  <div className="flex justify-between gap-2 text-sm">
                    <span className="truncate">
                      <span className="font-medium">C{c.id}.</span> {c.name}
                    </span>
                    <span className="shrink-0 text-muted-foreground tabular-nums">
                      {m.mastered}/{m.total}
                    </span>
                  </div>
                  <div className="relative h-2 overflow-hidden rounded-full bg-muted">
                    <div className="absolute inset-y-0 left-0 bg-primary/25" style={{ width: `${(m.seen / m.total) * 100}%` }} />
                    <div className="absolute inset-y-0 left-0 rounded-full bg-primary" style={{ width: `${(m.mastered / m.total) * 100}%` }} />
                  </div>
                </div>
              )
            })}
          </CardContent>
        </Card>

        <div className="space-y-5">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">14 ngày gần đây</CardTitle>
            </CardHeader>
            <CardContent>
              <Activity log={log} />
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center justify-between text-base">
                Thi thử gần đây
                {st.wb > 0 && (
                  <Button variant="ghost" size="sm" onClick={() => setView("wrong")}>
                    <NotebookPen /> {st.wb} câu sai
                  </Button>
                )}
              </CardTitle>
            </CardHeader>
            <CardContent>
              {recent.length ? (
                <div className="flex gap-2">
                  {recent.map((r) => (
                    <div
                      key={r.id}
                      className={cn(
                        "flex-1 rounded-lg py-2 text-center text-sm font-bold tabular-nums",
                        r.passed ? "bg-success/15 text-success" : "bg-destructive/10 text-destructive",
                      )}
                    >
                      {r.score}/{r.questions.length}
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-sm text-muted-foreground">Chưa có bài thi nào.</p>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  )
}

function Meter({ label, value }: { label: string; value: number }) {
  return (
    <div className="space-y-1">
      <div className="flex justify-between">
        <span>{label}</span>
        <span className="font-semibold tabular-nums">{Math.round(value * 100)}%</span>
      </div>
      <Progress value={value * 100} className="h-1.5" />
    </div>
  )
}

function Tile({
  icon: Icon,
  label,
  value,
  sub,
  tone,
}: {
  icon: React.ComponentType<{ className?: string }>
  label: string
  value: React.ReactNode
  sub?: string
  tone?: string
}) {
  return (
    <Card className="gap-2 py-4">
      <CardContent className="px-4">
        <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
          <Icon className={cn("size-3.5", tone)} /> {label}
        </div>
        <div className="mt-1 text-2xl font-bold tabular-nums">{value}</div>
        {sub && <div className="text-xs text-muted-foreground">{sub}</div>}
      </CardContent>
    </Card>
  )
}

function Activity({ log }: { log: Record<string, number> }) {
  const days = Array.from({ length: 14 }, (_, i) => {
    const d = new Date()
    d.setDate(d.getDate() - (13 - i))
    return { d, v: log[dayKey(d.getTime())] ?? 0 }
  })
  const max = Math.max(30, ...days.map((x) => x.v))
  return (
    <div className="flex h-24 items-end gap-1.5">
      {days.map(({ d, v }) => (
        <div key={d.toISOString()} className="flex flex-1 flex-col items-center gap-1" title={`${d.toLocaleDateString("vi-VN")}: ${v} câu`}>
          <div className="flex w-full flex-1 items-end">
            <div
              className={cn("w-full rounded-sm", v ? "bg-primary" : "bg-muted")}
              style={{ height: v ? `${Math.max(8, (v / max) * 100)}%` : "4px" }}
            />
          </div>
          <span className="text-[0.6rem] text-muted-foreground tabular-nums">{d.getDate()}</span>
        </div>
      ))}
    </div>
  )
}
