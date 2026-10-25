import { useState } from "react"
import { ArrowRight, Cloud, CloudOff, MonitorSmartphone } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { LogoMark } from "@/components/Logo"
import { normalizeUsername, syncEnabled, USERNAME_RE } from "@/lib/sync"
import { useStore } from "@/store"

export function Login() {
  const setUser = useStore((s) => s.setUser)
  const [raw, setRaw] = useState("")
  const name = normalizeUsername(raw)
  const valid = USERNAME_RE.test(name)

  return (
    <div className="flex min-h-svh items-center justify-center bg-[radial-gradient(ellipse_at_top,var(--color-accent),transparent_60%)] p-4">
      <Card className="w-full max-w-sm">
        <CardHeader className="items-center text-center">
          <LogoMark className="mx-auto mb-2 size-16" />
          <CardTitle className="text-2xl font-extrabold tracking-tight">
            Lái<span className="text-primary">Vững</span>
          </CardTitle>
          <CardDescription>Ôn thi GPLX hạng B — học ít, nhớ lâu, không sót câu điểm liệt.</CardDescription>
        </CardHeader>
        <CardContent>
          <form
            className="space-y-4"
            onSubmit={(e) => {
              e.preventDefault()
              if (valid) setUser(name)
            }}
          >
            <label className="block space-y-1.5">
              <span className="text-sm font-medium">Tên đăng nhập</span>
              <input
                autoFocus
                value={raw}
                onChange={(e) => setRaw(e.target.value)}
                placeholder="vd: quan.tran"
                autoCapitalize="none"
                autoCorrect="off"
                spellCheck={false}
                className="h-11 w-full rounded-lg border bg-card px-3 text-base outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50"
              />
              <span className="block min-h-4 text-xs text-muted-foreground">
                {raw && !valid
                  ? "3–32 ký tự: chữ không dấu, số, dấu chấm, gạch ngang, gạch dưới."
                  : raw && name !== raw
                    ? `Sẽ dùng: ${name}`
                    : ""}
              </span>
            </label>
            <Button type="submit" size="lg" className="w-full" disabled={!valid}>
              Vào học <ArrowRight />
            </Button>
          </form>
          <div className="mt-5 space-y-2 rounded-lg bg-muted/70 p-3 text-xs text-muted-foreground">
            {syncEnabled ? (
              <>
                <p className="flex gap-2">
                  <MonitorSmartphone className="size-4 shrink-0" />
                  Nhập đúng tên này trên điện thoại hay máy khác để học tiếp — tiến độ tự đồng bộ.
                </p>
                <p className="flex gap-2">
                  <Cloud className="size-4 shrink-0" />
                  Không cần mật khẩu, nên hãy chọn tên khó đoán nếu không muốn người khác dùng chung.
                </p>
              </>
            ) : (
              <p className="flex gap-2">
                <CloudOff className="size-4 shrink-0" />
                Chưa cấu hình đồng bộ đám mây — tiến độ chỉ lưu trên trình duyệt này.
              </p>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
