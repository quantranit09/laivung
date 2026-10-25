import { useEffect, useMemo, useState } from "react"
import confetti from "canvas-confetti"
import { ArrowLeft, ArrowRight, CheckCircle2, ClipboardCheck, Flag, History, Siren, Timer, XCircle } from "lucide-react"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Switch } from "@/components/ui/switch"
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group"
import { QuestionMeta, QuestionView } from "@/components/QuestionView"
import { Stat } from "@/components/StudyView"
import { BY_N, EXAM_FORMATS, type ExamFormat } from "@/lib/questions"
import { buildExam } from "@/lib/srs"
import { cn } from "@/lib/utils"
import { useStore, type ExamResult } from "@/store"

export function ExamView() {
  const exam = useStore((s) => s.exam)
  const [result, setResult] = useState<ExamResult>()
  if (exam) return <Runner onDone={setResult} />
  if (result) return <ResultView result={result} onBack={() => setResult(undefined)} />
  return <Setup onOpen={setResult} />
}

function Setup({ onOpen }: { onOpen: (r: ExamResult) => void }) {
  const settings = useStore((s) => s.settings)
  const setSettings = useStore((s) => s.setSettings)
  const progress = useStore((s) => s.progress)
  const history = useStore((s) => s.history)
  const startExam = useStore((s) => s.startExam)
  const [weak, setWeak] = useState(false)
  const f = EXAM_FORMATS[settings.format]

  return (
    <div className="mx-auto max-w-2xl space-y-5">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-xl">
            <ClipboardCheck className="size-5 text-primary" /> Thi thử như thật
          </CardTitle>
          <CardDescription>
            Đề ngẫu nhiên có đúng 1 câu điểm liệt, các câu còn lại chia theo tỷ lệ từng chương. Không hiện đáp án cho tới
            khi nộp bài.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-5">
          <ToggleGroup
            type="single"
            variant="outline"
            value={settings.format}
            onValueChange={(v) => v && setSettings({ format: v as ExamFormat })}
            className="grid w-full grid-cols-2"
          >
            {(Object.keys(EXAM_FORMATS) as ExamFormat[]).map((k) => (
              <ToggleGroupItem key={k} value={k} className="h-auto flex-col items-start gap-0.5 px-3 py-2.5 text-left">
                <span className="text-sm font-semibold">{EXAM_FORMATS[k].label}</span>
                <span className="text-xs text-muted-foreground">
                  {EXAM_FORMATS[k].total} câu · {EXAM_FORMATS[k].minutes} phút · đạt {EXAM_FORMATS[k].pass}
                </span>
              </ToggleGroupItem>
            ))}
          </ToggleGroup>

          <label className="flex items-center justify-between gap-4 rounded-xl border p-3.5">
            <span>
              <span className="block text-sm font-medium">Ưu tiên câu yếu</span>
              <span className="block text-xs text-muted-foreground">
                Bốc đề nghiêng về những câu bạn chưa thuộc — luyện tập hiệu quả hơn, nhưng khó hơn đề thật.
              </span>
            </span>
            <Switch checked={weak} onCheckedChange={setWeak} />
          </label>

          <Button size="lg" className="w-full" onClick={() => startExam(settings.format, buildExam(settings.format, progress, weak))}>
            Bắt đầu thi · {f.minutes} phút <ArrowRight />
          </Button>
          {settings.format === "2027" && (
            <p className="text-xs text-muted-foreground">
              Thể thức 2027 (TT 108/2026/TT-BCA) sẽ có câu hỏi dạng mới (đúng/sai, nối, xem clip) chưa được công bố. Đề ở
              đây dùng bộ 600 câu hiện hành với số câu & thời gian mới.
            </p>
          )}
        </CardContent>
      </Card>

      {history.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <History className="size-4" /> Lịch sử thi thử
            </CardTitle>
          </CardHeader>
          <CardContent>
            <ul className="divide-y">
              {history.slice(0, 15).map((r) => (
                <li key={r.id}>
                  <button
                    className="flex w-full items-center gap-3 py-2.5 text-left text-sm hover:text-primary"
                    onClick={() => onOpen(r)}
                  >
                    {r.passed ? (
                      <CheckCircle2 className="size-4 text-success" />
                    ) : (
                      <XCircle className="size-4 text-destructive" />
                    )}
                    <span className="flex-1 text-muted-foreground">
                      {new Date(r.at).toLocaleString("vi-VN", { dateStyle: "short", timeStyle: "short" })}
                    </span>
                    {!r.criticalOk && <Siren className="size-4 text-destructive" />}
                    <span className="font-semibold tabular-nums">
                      {r.score}/{r.questions.length}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      )}
    </div>
  )
}

function useCountdown(endsAt: number) {
  const [now, setNow] = useState(Date.now())
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 500)
    return () => clearInterval(id)
  }, [])
  return Math.max(0, Math.round((endsAt - now) / 1000))
}

function Runner({ onDone }: { onDone: (r: ExamResult) => void }) {
  const exam = useStore((s) => s.exam)!
  const answerExam = useStore((s) => s.answerExam)
  const toggleFlag = useStore((s) => s.toggleFlag)
  const gotoExam = useStore((s) => s.gotoExam)
  const submitExam = useStore((s) => s.submitExam)
  const abandonExam = useStore((s) => s.abandonExam)
  const [confirm, setConfirm] = useState(false)
  const left = useCountdown(exam.endsAt)
  const n = exam.questions[exam.current]
  const q = BY_N.get(n)!
  const answeredCount = Object.keys(exam.answers).length
  const total = exam.questions.length

  const submit = () => {
    const r = submitExam()
    if (r) onDone(r)
  }

  useEffect(() => {
    if (left === 0) submit()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [left])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey) return
      const i = Number(e.key)
      if (i >= 1 && i <= q.o.length) answerExam(n, i)
      else if (e.key === "ArrowRight") gotoExam(exam.current + 1)
      else if (e.key === "ArrowLeft") gotoExam(exam.current - 1)
      else if (e.key === "f" || e.key === "F") toggleFlag(n)
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [n, q, exam.current, answerExam, gotoExam, toggleFlag])

  const mm = String(Math.floor(left / 60)).padStart(2, "0")
  const ss = String(left % 60).padStart(2, "0")

  return (
    <div className="grid gap-4 lg:grid-cols-[1fr_300px]">
      <div className="space-y-4">
        <Card>
          <CardContent className="pt-1">
            <QuestionView
              q={q}
              choice={exam.answers[n]}
              onChoose={(i) => answerExam(n, i)}
              meta={
                <div className="flex items-center justify-between gap-2">
                  <span className="text-sm font-semibold">
                    Câu {exam.current + 1}/{total}
                  </span>
                  <Button
                    variant={exam.flagged.includes(n) ? "secondary" : "ghost"}
                    size="sm"
                    onClick={() => toggleFlag(n)}
                  >
                    <Flag className={cn(exam.flagged.includes(n) && "fill-warning text-warning")} /> Đánh dấu
                  </Button>
                </div>
              }
            />
          </CardContent>
        </Card>
        <div className="flex gap-2">
          <Button variant="outline" disabled={exam.current === 0} onClick={() => gotoExam(exam.current - 1)}>
            <ArrowLeft /> Trước
          </Button>
          <Button className="flex-1" variant="secondary" disabled={exam.current === total - 1} onClick={() => gotoExam(exam.current + 1)}>
            Câu tiếp <ArrowRight />
          </Button>
        </div>
      </div>

      <div className="space-y-3 lg:sticky lg:top-20 lg:self-start">
        <Card className="gap-3 py-4">
          <CardContent className="space-y-4 px-4">
            <div className="flex items-center justify-between">
              <span
                className={cn(
                  "flex items-center gap-2 text-2xl font-bold tabular-nums",
                  left < 120 && "animate-pulse text-destructive",
                )}
              >
                <Timer className="size-5" /> {mm}:{ss}
              </span>
              <span className="text-sm text-muted-foreground tabular-nums">
                {answeredCount}/{total} đã làm
              </span>
            </div>
            <div className="grid grid-cols-10 gap-1.5 lg:grid-cols-6">
              {exam.questions.map((qn, i) => (
                <button
                  key={qn}
                  onClick={() => gotoExam(i)}
                  className={cn(
                    "relative aspect-square rounded-md border text-xs font-semibold tabular-nums transition",
                    exam.answers[qn] ? "border-primary bg-primary text-primary-foreground" : "bg-card hover:bg-accent",
                    i === exam.current && "ring-2 ring-ring ring-offset-2 ring-offset-background",
                  )}
                >
                  {i + 1}
                  {exam.flagged.includes(qn) && (
                    <span className="absolute -top-1 -right-1 size-2.5 rounded-full border-2 border-background bg-warning" />
                  )}
                </button>
              ))}
            </div>
            <Button className="w-full" onClick={() => setConfirm(true)}>
              Nộp bài
            </Button>
            <Button variant="ghost" size="sm" className="w-full text-muted-foreground" onClick={abandonExam}>
              Huỷ bài thi
            </Button>
          </CardContent>
        </Card>
        <p className="hidden text-xs text-muted-foreground lg:block">
          Phím tắt: 1–4 chọn đáp án · ←/→ chuyển câu · F đánh dấu
        </p>
      </div>

      <AlertDialog open={confirm} onOpenChange={setConfirm}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Nộp bài?</AlertDialogTitle>
            <AlertDialogDescription>
              {answeredCount < total
                ? `Bạn còn ${total - answeredCount} câu chưa làm — câu bỏ trống tính là sai.`
                : "Bạn đã làm hết các câu."}
              {exam.flagged.length > 0 && ` Có ${exam.flagged.length} câu đang đánh dấu cần xem lại.`}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Làm tiếp</AlertDialogCancel>
            <AlertDialogAction onClick={submit}>Nộp bài</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}

function ResultView({ result, onBack }: { result: ExamResult; onBack: () => void }) {
  const f = EXAM_FORMATS[result.format]
  const [filter, setFilter] = useState<"wrong" | "all">("wrong")
  const list = useMemo(
    () => result.questions.filter((n) => filter === "all" || result.answers[n] !== BY_N.get(n)!.a),
    [result, filter],
  )
  useEffect(() => {
    if (result.passed && Date.now() - result.at < 5000) confetti({ particleCount: 160, spread: 90, origin: { y: 0.5 } })
  }, [result])

  return (
    <div className="mx-auto max-w-2xl space-y-5">
      <Card className={cn("border-2 text-center", result.passed ? "border-success/60" : "border-destructive/60")}>
        <CardHeader>
          <div
            className={cn(
              "mx-auto mb-1 flex size-16 items-center justify-center rounded-full",
              result.passed ? "bg-success/15 text-success" : "bg-destructive/12 text-destructive",
            )}
          >
            {result.passed ? <CheckCircle2 className="size-9" /> : <XCircle className="size-9" />}
          </div>
          <CardTitle className="text-2xl">{result.passed ? "ĐẠT" : "KHÔNG ĐẠT"}</CardTitle>
          <CardDescription>
            {!result.criticalOk
              ? "Sai câu điểm liệt — trượt dù đủ điểm. Hãy ôn ngay 60 câu điểm liệt."
              : result.passed
                ? "Giữ phong độ này qua nhiều đề liên tiếp là bạn đã sẵn sàng."
                : `Cần đúng tối thiểu ${f.pass}/${f.total} câu.`}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-3 gap-3">
            <Stat label="Điểm" value={`${result.score}/${result.questions.length}`} tone={result.passed ? "text-success" : "text-destructive"} />
            <Stat label="Câu điểm liệt" value={result.criticalOk ? "Đúng" : "Sai"} tone={result.criticalOk ? "text-success" : "text-destructive"} />
            <Stat label="Thời gian" value={`${Math.floor(result.durationSec / 60)}′${String(result.durationSec % 60).padStart(2, "0")}″`} />
          </div>
          <p className="text-xs text-muted-foreground">Các câu sai đã được đưa vào Sổ câu sai và lịch ôn tập.</p>
          <Button variant="outline" className="w-full" onClick={onBack}>
            <ArrowLeft /> Về trang thi thử
          </Button>
        </CardContent>
      </Card>

      <div className="flex items-center justify-between">
        <h3 className="font-semibold">Xem lại bài</h3>
        <ToggleGroup type="single" size="sm" variant="outline" value={filter} onValueChange={(v) => v && setFilter(v as "wrong" | "all")}>
          <ToggleGroupItem value="wrong" className="px-3">Câu sai</ToggleGroupItem>
          <ToggleGroupItem value="all" className="px-3">Tất cả</ToggleGroupItem>
        </ToggleGroup>
      </div>
      {list.length === 0 && <p className="text-center text-sm text-muted-foreground">Không có câu sai nào. Xuất sắc!</p>}
      {list.map((n) => {
        const q = BY_N.get(n)!
        const ans = result.answers[n]
        return (
          <Card key={n}>
            <CardContent className="pt-1">
              <QuestionView
                q={q}
                choice={ans}
                reveal
                meta={<QuestionMeta q={q} extra={ans === undefined && <Badge variant="outline">Bỏ trống</Badge>} />}
              />
            </CardContent>
          </Card>
        )
      })}
    </div>
  )
}
