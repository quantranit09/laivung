import { Car as CarIcon, Eye, Keyboard, MonitorCog, MousePointer2, RotateCcw, Settings2, SlidersHorizontal, Volume2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet"
import { Switch } from "@/components/ui/switch"
import { CARS } from "@/sim/car"
import { KEY_HELP, type Sensitivity } from "@/sim/input"
import { cn } from "@/lib/utils"
import { glass } from "./Hud"
import { PAINTS, type SimPrefs } from "./prefs"
import type { ModelCredit } from "./useCarModel"
import { CAMERA_LABEL, CAMERA_ORDER } from "./World"

function Section({ icon: Icon, title, children }: { icon: React.ComponentType<{ className?: string }>; title: string; children: React.ReactNode }) {
  return (
    <section className="space-y-2.5">
      <h3 className="flex items-center gap-2 text-xs font-semibold tracking-wide text-muted-foreground uppercase">
        <Icon className="size-3.5" /> {title}
      </h3>
      {children}
    </section>
  )
}

function Segmented<T extends string>({ value, options, onChange }: { value: T; options: { value: T; label: string }[]; onChange: (v: T) => void }) {
  return (
    <div className="grid gap-1 rounded-xl bg-muted p-1" style={{ gridTemplateColumns: `repeat(${options.length}, minmax(0, 1fr))` }}>
      {options.map((o) => (
        <button
          key={o.value}
          onClick={() => onChange(o.value)}
          className={cn("rounded-lg px-2 py-1.5 text-xs font-medium transition", value === o.value ? "bg-background shadow-sm" : "text-muted-foreground hover:text-foreground")}
        >
          {o.label}
        </button>
      ))}
    </div>
  )
}

function Toggle({ label, hint, checked, onChange }: { label: string; hint?: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <label className="flex items-start justify-between gap-3">
      <span>
        <span className="block text-sm font-medium">{label}</span>
        {hint && <span className="block text-xs text-muted-foreground">{hint}</span>}
      </span>
      <Switch checked={checked} onCheckedChange={onChange} />
    </label>
  )
}

export function SimSettings({
  prefs,
  set,
  onRestart,
  onMenu,
  model,
}: {
  prefs: SimPrefs
  set: (p: Partial<SimPrefs>) => void
  onRestart: () => void
  onMenu: () => void
  model: { url?: string; credit?: ModelCredit }
}) {
  return (
    <Sheet>
      <SheetTrigger asChild>
        <button className={cn("flex h-11 min-w-11 items-center justify-center gap-2 rounded-2xl px-3.5 text-xs font-bold tracking-wide", glass)}>
          <Settings2 className="size-4 text-sky-300" /> <span className="hidden lg:inline">CÀI ĐẶT & GÓC NHÌN</span>
        </button>
      </SheetTrigger>
      <SheetContent className="z-[60] overflow-y-auto">
        <SheetHeader>
          <SheetTitle>Cài đặt mô phỏng</SheetTitle>
          <SheetDescription>Lưu trên trình duyệt này.</SheetDescription>
        </SheetHeader>
        <div className="space-y-6 px-4 pb-6">
          <Section icon={Eye} title="Góc nhìn (phím C)">
            <div className="grid grid-cols-2 gap-2">
              {CAMERA_ORDER.map((c, i) => (
                <button
                  key={c}
                  onClick={() => set({ camera: c })}
                  className={cn("rounded-xl border p-2.5 text-left text-sm transition", prefs.camera === c ? "border-primary bg-primary/8 ring-2 ring-primary/20" : "hover:bg-accent")}
                >
                  <span className="text-xs text-muted-foreground">{i + 1}</span>
                  <div className="font-medium">{CAMERA_LABEL[c]}</div>
                </button>
              ))}
            </div>
          </Section>

          <Section icon={CarIcon} title="Xe">
            <div className="grid gap-2">
              {Object.values(CARS).map((c) => (
                <button
                  key={c.id}
                  onClick={() => set({ car: c.id })}
                  className={cn("rounded-xl border p-3 text-left transition", prefs.car === c.id ? "border-primary bg-primary/8 ring-2 ring-primary/20" : "hover:bg-accent")}
                >
                  <div className="text-sm font-semibold">{c.name}</div>
                  <div className="mt-0.5 text-xs text-muted-foreground">
                    {c.length.toFixed(2)} × {c.width.toFixed(2)} m · cơ sở {c.wheelbase.toFixed(2)} m · {c.ev ? "mô-tơ điện" : "hộp số tự động"}
                  </div>
                </button>
              ))}
            </div>
            {model.url ? (
              <div className="space-y-2 rounded-xl border p-3">
                <Toggle label="Dùng mô hình 3D thật" hint="Ở góc ghế lái vẫn dùng nội thất tự dựng." checked={prefs.useModel} onChange={(v) => set({ useModel: v })} />
                <Toggle label="Xoay mô hình 180°" hint="Bật nếu xe chạy lùi so với mô hình." checked={prefs.flipModel} onChange={(v) => set({ flipModel: v })} />
                {model.credit && (
                  <p className="text-xs text-muted-foreground">
                    Mô hình “{model.credit.title}” của {model.credit.author} ·{" "}
                    <a className="underline" href={model.credit.url} target="_blank" rel="noreferrer">
                      {model.credit.license}
                    </a>
                  </p>
                )}
              </div>
            ) : (
              <p className="rounded-xl bg-muted p-3 text-xs text-muted-foreground">
                Chưa có mô hình 3D thật cho xe này — đang dùng xe tự dựng. Thêm file <code>public/sim/models/{prefs.car}.glb</code> để thay.
              </p>
            )}
            <div className="flex gap-2">
              {PAINTS.map((p) => (
                <button
                  key={p.value}
                  title={p.name}
                  onClick={() => set({ color: p.value })}
                  className={cn("size-7 rounded-full ring-2 ring-offset-2 ring-offset-background transition", prefs.color === p.value ? "ring-primary" : "ring-transparent")}
                  style={{ background: p.value }}
                />
              ))}
            </div>
          </Section>

          <Section icon={SlidersHorizontal} title="Lái">
            <div>
              <div className="mb-1.5 text-sm font-medium">Độ nhạy vô lăng (bàn phím)</div>
              <Segmented<Sensitivity>
                value={prefs.sensitivity}
                onChange={(v) => set({ sensitivity: v })}
                options={[
                  { value: "low", label: "Chậm" },
                  { value: "normal", label: "Vừa" },
                  { value: "high", label: "Nhanh" },
                ]}
              />
            </div>
            <div>
              <div className="mb-1.5 text-sm font-medium">Nút điều khiển trên màn hình</div>
              <Segmented<SimPrefs["controls"]>
                value={prefs.controls}
                onChange={(v) => set({ controls: v })}
                options={[
                  { value: "auto", label: "Tự động" },
                  { value: "keyboard", label: "Gọn (bàn phím)" },
                  { value: "touch", label: "Cảm ứng" },
                ]}
              />
            </div>
            <Toggle
              label="Lái bằng chuột"
              hint="Rê chuột sang trái/phải giữa màn hình để xoay vô lăng — chính xác hơn bàn phím khi ghép xe."
              checked={prefs.mouseSteer}
              onChange={(v) => set({ mouseSteer: v })}
            />
          </Section>

          <Section icon={MonitorCog} title="Hiển thị">
            <Toggle label="Gương chiếu hậu thật" hint="Ảnh phản chiếu trong 3 gương khi ngồi ghế lái." checked={prefs.mirrors} onChange={(v) => set({ mirrors: v })} />
            <div>
              <div className="mb-1.5 text-sm font-medium">Chất lượng hình ảnh</div>
              <Segmented<SimPrefs["quality"]>
                value={prefs.quality}
                onChange={(v) => set({ quality: v })}
                options={[
                  { value: "low", label: "Thấp" },
                  { value: "medium", label: "Vừa" },
                  { value: "high", label: "Cao" },
                ]}
              />
              <p className="mt-1.5 text-xs text-muted-foreground">Ưu tiên vẻ đẹp của xe (phản chiếu trời thật, bóng đổ, đèn phát sáng); môi trường được giữ nhẹ. Giảm xuống nếu máy chạy giật.</p>
            </div>
            <Toggle label="Thước khoảng cách tới vạch" hint="Chế độ luyện tập — tắt để thi như thật." checked={prefs.assist} onChange={(v) => set({ assist: v })} />
          </Section>

          <Section icon={Volume2} title="Âm thanh">
            <Toggle
              label="Âm thanh động cơ"
              hint="Thay đổi theo ga, vòng tua và tốc độ; xe điện dùng tiếng mô-tơ riêng."
              checked={prefs.engineSound}
              onChange={(v) => set({ engineSound: v })}
            />
          </Section>

          <Section icon={Keyboard} title="Phím tắt">
            <div className="grid grid-cols-2 gap-x-3 gap-y-1.5 text-xs">
              {KEY_HELP.map(([k, d]) => (
                <div key={k} className="flex items-center gap-2">
                  <kbd className="min-w-12 rounded border bg-muted px-1 py-0.5 text-center font-semibold">{k}</kbd>
                  <span className="text-muted-foreground">{d}</span>
                </div>
              ))}
              <div className="col-span-2 flex items-center gap-2 text-muted-foreground">
                <MousePointer2 className="size-3.5" /> Ở ghế lái: kéo chuột trên màn hình để quay đầu nhìn.
              </div>
            </div>
          </Section>

          <div className="grid grid-cols-2 gap-2">
            <Button variant="outline" onClick={onRestart}>
              <RotateCcw /> Làm lại
            </Button>
            <Button variant="ghost" onClick={onMenu}>
              Chọn bài khác
            </Button>
          </div>
        </div>
      </SheetContent>
    </Sheet>
  )
}
