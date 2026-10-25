import { useMemo, useState } from "react"
import { ChevronLeft, ChevronRight, Search } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { QuestionView } from "@/components/QuestionView"
import { CHAPTERS, QUESTIONS } from "@/lib/questions"
import { daysUntil, isMastered, retrievability, type CardState } from "@/lib/srs"
import { cn } from "@/lib/utils"
import { useStore } from "@/store"

const norm = (s: string) => s.normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/đ/gi, "d").toLowerCase()
const INDEX = QUESTIONS.map((q) => norm(`${q.n} ${q.q} ${q.o.join(" ")} ${q.t}`))

function tone(s?: CardState) {
  if (!s) return "bg-card text-muted-foreground"
  if (s.wb) return "bg-destructive/85 text-white border-transparent"
  if (isMastered(s)) return "bg-success text-success-foreground border-transparent"
  return "bg-primary/25 text-foreground border-transparent"
}

export function BrowseView() {
  const progress = useStore((s) => s.progress)
  const [chapter, setChapter] = useState("all")
  const [state, setState] = useState("all")
  const [text, setText] = useState("")
  const [open, setOpen] = useState<number>()

  const list = useMemo(() => {
    const t = norm(text.trim())
    return QUESTIONS.filter((q, i) => {
      if (chapter === "crit" ? !q.k : chapter !== "all" && q.c !== Number(chapter)) return false
      const s = progress[q.n]
      if (state === "new" && s) return false
      if (state === "learning" && (!s || s.wb || isMastered(s))) return false
      if (state === "mastered" && !isMastered(s)) return false
      if (state === "wrong" && !s?.wb) return false
      return !t || INDEX[i].includes(t)
    })
  }, [chapter, state, text, progress])

  const idx = open === undefined ? -1 : list.findIndex((q) => q.n === open)
  const q = idx >= 0 ? list[idx] : undefined
  const s = q ? progress[q.n] : undefined

  return (
    <div className="space-y-4">
      <div className="grid gap-2 sm:grid-cols-[1fr_200px_170px]">
        <label className="relative">
          <Search className="absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
          <input
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder="Tìm theo số câu hoặc từ khoá (gõ không dấu cũng được)…"
            className="h-9 w-full rounded-md border bg-card pr-3 pl-9 text-sm outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50"
          />
        </label>
        <Select value={chapter} onValueChange={setChapter}>
          <SelectTrigger className="w-full bg-card">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Tất cả chương</SelectItem>
            <SelectItem value="crit">Câu điểm liệt</SelectItem>
            {CHAPTERS.map((c) => (
              <SelectItem key={c.id} value={String(c.id)}>
                C{c.id}: {c.short}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={state} onValueChange={setState}>
          <SelectTrigger className="w-full bg-card">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Mọi trạng thái</SelectItem>
            <SelectItem value="new">Chưa học</SelectItem>
            <SelectItem value="learning">Đang học</SelectItem>
            <SelectItem value="mastered">Đã thuộc</SelectItem>
            <SelectItem value="wrong">Trong Sổ câu sai</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
        <span>{list.length} câu</span>
        <Legend className="border bg-card" label="Chưa học" />
        <Legend className="bg-primary/25" label="Đang học" />
        <Legend className="bg-success" label="Đã thuộc" />
        <Legend className="bg-destructive/85" label="Sổ câu sai" />
        <span className="flex items-center gap-1">
          <span className="size-1.5 rounded-full bg-destructive" /> điểm liệt
        </span>
      </div>

      <Card>
        <CardContent className="grid grid-cols-[repeat(auto-fill,minmax(2.6rem,1fr))] gap-1.5">
          {list.map((q) => (
            <button
              key={q.n}
              onClick={() => setOpen(q.n)}
              className={cn(
                "relative aspect-square rounded-md border text-xs font-semibold tabular-nums transition hover:scale-110 hover:shadow",
                tone(progress[q.n]),
              )}
            >
              {q.n}
              {q.k && <span className="absolute top-0.5 right-0.5 size-1.5 rounded-full bg-destructive ring-1 ring-white" />}
            </button>
          ))}
        </CardContent>
      </Card>

      <Dialog open={!!q} onOpenChange={(o) => !o && setOpen(undefined)}>
        <DialogContent className="max-h-[92vh] overflow-y-auto sm:max-w-2xl">
          <DialogTitle className="sr-only">Câu {q?.n}</DialogTitle>
          {q && (
            <div className="space-y-4">
              <QuestionView q={q} reveal />
              <div className="flex flex-wrap items-center justify-between gap-2 border-t pt-3 text-xs text-muted-foreground">
                <span>
                  {s
                    ? `Đã làm ${s.seen} lần · đúng ${s.right} · sai ${s.wrong} · khả năng nhớ ${Math.round(retrievability(q.n, s) * 100)}% · độ bền ${s.f.stability.toFixed(1)} ngày · ôn lại ${daysUntil(s.f.due) ? `sau ${daysUntil(s.f.due)} ngày` : "hôm nay"}`
                    : "Chưa học câu này"}
                </span>
                <span className="flex gap-1">
                  <Button size="icon" variant="outline" disabled={idx <= 0} onClick={() => setOpen(list[idx - 1].n)}>
                    <ChevronLeft />
                  </Button>
                  <Button size="icon" variant="outline" disabled={idx >= list.length - 1} onClick={() => setOpen(list[idx + 1].n)}>
                    <ChevronRight />
                  </Button>
                </span>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  )
}

function Legend({ className, label }: { className: string; label: string }) {
  return (
    <span className="flex items-center gap-1">
      <span className={cn("size-3 rounded-sm", className)} /> {label}
    </span>
  )
}
