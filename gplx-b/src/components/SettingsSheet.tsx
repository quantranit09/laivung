import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet"
import { Switch } from "@/components/ui/switch"
import { EXAM_FORMATS, type ExamFormat } from "@/lib/questions"
import { autoDailyNew, dayKey } from "@/lib/srs"
import { useStore } from "@/store"

export function SettingsSheet() {
  const open = useStore((s) => s.settingsOpen)
  const setOpen = useStore((s) => s.setSettingsOpen)
  const settings = useStore((s) => s.settings)
  const progress = useStore((s) => s.progress)
  const set = useStore((s) => s.setSettings)
  const auto = autoDailyNew(progress, settings.examDate, settings.dailyNew)

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetContent className="overflow-y-auto">
        <SheetHeader>
          <SheetTitle>Cài đặt học</SheetTitle>
          <SheetDescription>Đồng bộ theo tên đăng nhập trên mọi thiết bị.</SheetDescription>
        </SheetHeader>
        <div className="space-y-6 px-4 pb-6">
          <Field label="Ngày thi lý thuyết" hint="App tự chia số câu mới mỗi ngày để học xong trước kỳ thi 3 ngày, dành 3 ngày cuối để thi thử và ôn câu sai.">
            <input
              type="date"
              min={dayKey()}
              value={settings.examDate ?? ""}
              onChange={(e) => set({ examDate: e.target.value || undefined })}
              className="h-9 w-full rounded-md border bg-card px-3 text-sm outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50"
            />
          </Field>

          {settings.examDate ? (
            <p className="rounded-lg bg-muted p-3 text-sm">
              Mục tiêu tự động: <b className="tabular-nums">{auto}</b> câu mới/ngày.
            </p>
          ) : (
            <Field label="Số câu mới mỗi ngày">
              <Select value={String(settings.dailyNew)} onValueChange={(v) => set({ dailyNew: Number(v) })}>
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {[10, 20, 30, 50, 80].map((n) => (
                    <SelectItem key={n} value={String(n)}>
                      {n} câu · xong 600 câu trong ~{Math.ceil(600 / n)} ngày
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
          )}

          <Field label="Độ dài một phiên">
            <Select value={String(settings.sessionSize)} onValueChange={(v) => set({ sessionSize: Number(v) })}>
              <SelectTrigger className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {[10, 20, 30, 40].map((n) => (
                  <SelectItem key={n} value={String(n)}>
                    {n} câu{n === 20 ? " (khuyến nghị, ~10–15 phút)" : ""}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>

          <Field label="Thể thức thi">
            <Select value={settings.format} onValueChange={(v) => set({ format: v as ExamFormat })}>
              <SelectTrigger className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {(Object.keys(EXAM_FORMATS) as ExamFormat[]).map((k) => (
                  <SelectItem key={k} value={k}>
                    {EXAM_FORMATS[k].label} · {EXAM_FORMATS[k].total} câu
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>

          <Toggle
            label="Xáo thứ tự đáp án khi học"
            hint="Buộc bạn hiểu nội dung thay vì nhớ “câu này chọn 2”. Thi thử luôn giữ thứ tự như đề thật."
            checked={settings.shuffle}
            onChange={(shuffle) => set({ shuffle })}
          />
          <Toggle
            label="Tự chuyển câu khi trả lời đúng"
            hint="Chạm vào câu hỏi để dừng lại đọc mẹo."
            checked={settings.autoAdvance}
            onChange={(autoAdvance) => set({ autoAdvance })}
          />
        </div>
      </SheetContent>
    </Sheet>
  )
}

function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <label className="block space-y-1.5">
      <span className="text-sm font-medium">{label}</span>
      {children}
      {hint && <span className="block text-xs text-muted-foreground">{hint}</span>}
    </label>
  )
}

function Toggle({ label, hint, checked, onChange }: { label: string; hint: string; checked: boolean; onChange: (b: boolean) => void }) {
  return (
    <label className="flex items-start justify-between gap-4">
      <span>
        <span className="block text-sm font-medium">{label}</span>
        <span className="block text-xs text-muted-foreground">{hint}</span>
      </span>
      <Switch checked={checked} onCheckedChange={onChange} />
    </label>
  )
}
