import { lazy, Suspense, useEffect, useMemo, useRef, useState } from "react"
import { toast } from "sonner"
import {
  Brain,
  CarFront,
  ClipboardCheck,
  Cloud,
  CloudAlert,
  CloudOff,
  Download,
  Grid3x3,
  LayoutDashboard,
  LoaderCircle,
  LogOut,
  Moon,
  NotebookPen,
  RotateCcw,
  SlidersHorizontal,
  Sun,
  Upload,
} from "lucide-react"
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
import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { Toaster } from "@/components/ui/sonner"
import { Logo } from "@/components/Logo"
import { Dashboard } from "@/components/Dashboard"
import { StudyView } from "@/components/StudyView"
import { ExamView } from "@/components/ExamView"
import { BrowseView } from "@/components/BrowseView"
import { Login } from "@/components/Login"
import { SettingsSheet } from "@/components/SettingsSheet"
import { stats } from "@/lib/srs"
import { syncEnabled } from "@/lib/sync"
import { syncNow, useCloudSync } from "@/lib/useCloudSync"
import { cn } from "@/lib/utils"
import { exportData, useStore, type View } from "@/store"

const NAV: { id: View; label: string; icon: React.ComponentType<{ className?: string }> }[] = [
  { id: "home", label: "Tổng quan", icon: LayoutDashboard },
  { id: "study", label: "Học", icon: Brain },
  { id: "exam", label: "Thi thử", icon: ClipboardCheck },
  { id: "wrong", label: "Câu sai", icon: NotebookPen },
  { id: "browse", label: "600 câu", icon: Grid3x3 },
  { id: "sim", label: "Lái xe", icon: CarFront },
]

// Trình mô phỏng 3D nặng (three.js) — chỉ tải khi mở.
const SimView = lazy(() => import("@/components/sim/SimView"))
const VIEWS = new Set<View>(NAV.map((n) => n.id))
const viewFromUrl = () => {
  const value = window.location.hash.slice(1) as View
  return VIEWS.has(value) ? value : undefined
}

export default function App() {
  const user = useStore((s) => s.user)
  const theme = useStore((s) => s.settings.theme)
  useEffect(() => {
    document.documentElement.classList.toggle("dark", theme === "dark")
  }, [theme])
  useCloudSync()
  if (!user) return <Login />
  return <Shell />
}

function Shell() {
  const view = useStore((s) => s.view)
  const setView = useStore((s) => s.setView)
  const theme = useStore((s) => s.settings.theme)
  const setSettings = useStore((s) => s.setSettings)
  const progress = useStore((s) => s.progress)
  const exam = useStore((s) => s.exam)
  const st = useMemo(() => stats(progress), [progress])

  useEffect(() => {
    const initial = viewFromUrl()
    if (initial && initial !== useStore.getState().view) useStore.setState({ view: initial })
    else if (!initial) history.replaceState(null, "", `#${useStore.getState().view}`)

    let fromHistory = false
    const unsubscribe = useStore.subscribe((state, previous) => {
      if (fromHistory || state.view === previous.view) return
      history.pushState(null, "", `#${state.view}`)
    })
    const onPopState = () => {
      const next = viewFromUrl() ?? "home"
      const state = useStore.getState()
      if (state.exam && next !== "exam") {
        toast.warning("Đang trong giờ thi — hãy nộp bài hoặc huỷ bài trước.")
        history.pushState(null, "", "#exam")
        return
      }
      fromHistory = true
      useStore.setState({ view: next })
      fromHistory = false
    }
    window.addEventListener("popstate", onPopState)
    return () => {
      unsubscribe()
      window.removeEventListener("popstate", onPopState)
    }
  }, [])

  // Đang thi thì khoá điều hướng sang mục khác để không lỡ tay rời phòng thi.
  const go = (v: View) => {
    if (exam && v !== "exam") {
      toast.warning("Đang trong giờ thi — hãy nộp bài hoặc huỷ bài trước.")
      setView("exam")
      return
    }
    setView(v)
  }
  const badge = (id: View) => (id === "study" ? st.due : id === "wrong" ? st.wb : 0)

  return (
    <div className="min-h-svh pb-24 md:pb-10">
      <header className="sticky top-0 z-30 border-b bg-background/80 backdrop-blur-lg">
        <div className="mx-auto flex h-16 max-w-6xl items-center gap-3 px-3 sm:px-4">
          <button onClick={() => go("home")} aria-label="Trang chủ">
            <Logo className="[&>div]:hidden min-[350px]:[&>div]:block" />
          </button>
          <nav className="ml-1 hidden flex-1 items-center gap-1 md:flex lg:ml-4">
            {NAV.map((n) => (
              <button
                key={n.id}
                onClick={() => go(n.id)}
                title={n.label}
                aria-label={n.label}
                className={cn(
                  "relative flex items-center gap-2 rounded-lg px-2.5 py-2 text-sm font-medium whitespace-nowrap text-muted-foreground transition hover:bg-accent hover:text-foreground lg:px-3",
                  view === n.id && "bg-accent text-foreground",
                )}
              >
                <n.icon className="size-4" />
                <span className="hidden lg:inline">{n.label}</span>
                {badge(n.id) > 0 && (
                  <span className="rounded-full bg-primary px-1.5 text-[0.65rem] leading-4 font-bold text-primary-foreground tabular-nums">
                    {badge(n.id)}
                  </span>
                )}
              </button>
            ))}
          </nav>
          <div className="ml-auto flex items-center gap-1">
            <Button
              variant="ghost"
              size="icon"
              aria-label="Đổi giao diện sáng/tối"
              onClick={() => setSettings({ theme: theme === "dark" ? "light" : "dark" })}
            >
              {theme === "dark" ? <Sun /> : <Moon />}
            </Button>
            <SyncBadge />
            <DataMenu />
          </div>
        </div>
      </header>

      <main
        className={cn(
          "mx-auto max-w-6xl px-3 py-4 sm:px-4 sm:py-6",
          view !== "sim" && "[--card-gap:1rem] [--card-pad:1rem] sm:[--card-gap:1.5rem] sm:[--card-pad:1.5rem]",
        )}
      >
        {view === "home" && <Dashboard />}
        {view === "study" && <StudyView kind="study" />}
        {view === "wrong" && <StudyView kind="wrong" />}
        {view === "exam" && <ExamView />}
        {view === "browse" && <BrowseView />}
        {view === "sim" && (
          <Suspense fallback={<p className="py-20 text-center text-muted-foreground">Đang tải trình mô phỏng 3D…</p>}>
            <SimView onExit={() => setView("home")} />
          </Suspense>
        )}
      </main>

      <nav className="fixed inset-x-0 bottom-0 z-30 grid grid-cols-6 border-t bg-background/95 pb-[env(safe-area-inset-bottom)] shadow-[0_-4px_18px_rgba(0,0,0,0.06)] backdrop-blur-lg md:hidden">
        {NAV.map((n) => (
          <button
            key={n.id}
            onClick={() => go(n.id)}
            className={cn(
              "relative flex min-w-0 flex-col items-center gap-0.5 py-2.5 text-[0.6rem] font-medium whitespace-nowrap text-muted-foreground min-[360px]:text-[0.65rem]",
              view === n.id && "text-primary",
            )}
          >
            <n.icon className="size-5" />
            {n.label}
            {badge(n.id) > 0 && (
              <span className="absolute top-1.5 left-1/2 ml-2 rounded-full bg-primary px-1 text-[0.6rem] leading-3.5 font-bold text-primary-foreground tabular-nums">
                {badge(n.id)}
              </span>
            )}
          </button>
        ))}
      </nav>
      <SettingsSheet />
      <Toaster position="top-center" richColors />
    </div>
  )
}

function SyncBadge() {
  const status = useStore((s) => s.sync)
  const lastSynced = useStore((s) => s.lastSynced)
  if (!syncEnabled) return null
  const map = {
    off: { icon: CloudOff, text: "Chưa đồng bộ", tone: "text-muted-foreground" },
    idle: { icon: Cloud, text: "Đã đồng bộ", tone: "text-success" },
    syncing: { icon: LoaderCircle, text: "Đang đồng bộ…", tone: "text-muted-foreground [&>svg]:animate-spin" },
    error: { icon: CloudAlert, text: "Lỗi đồng bộ — bấm để thử lại", tone: "text-destructive" },
    offline: { icon: CloudOff, text: "Mất mạng — sẽ đồng bộ khi có mạng", tone: "text-warning" },
  }[status]
  return (
    <Button
      variant="ghost"
      size="icon"
      className={map.tone}
      title={map.text + (lastSynced ? ` (lần cuối ${new Date(lastSynced).toLocaleTimeString("vi-VN")})` : "")}
      aria-label={map.text}
      onClick={() => syncNow()}
    >
      <map.icon />
    </Button>
  )
}

function DataMenu() {
  const user = useStore((s) => s.user)
  const setUser = useStore((s) => s.setUser)
  const setSettingsOpen = useStore((s) => s.setSettingsOpen)
  const importData = useStore((s) => s.importData)
  const reset = useStore((s) => s.reset)
  const fileRef = useRef<HTMLInputElement>(null)
  const [confirmReset, setConfirmReset] = useState(false)

  const download = () => {
    const blob = new Blob([JSON.stringify(exportData())], { type: "application/json" })
    const a = document.createElement("a")
    a.href = URL.createObjectURL(blob)
    a.download = `laivung-saoluu-${new Date().toISOString().slice(0, 10)}.json`
    a.click()
    URL.revokeObjectURL(a.href)
    toast.success("Đã tải file sao lưu")
  }
  const onFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    e.target.value = ""
    if (!file) return
    try {
      importData(JSON.parse(await file.text()))
      toast.success("Đã khôi phục tiến độ học")
    } catch (err) {
      toast.error((err as Error).message || "Không đọc được file")
    }
  }

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" className="gap-2 px-2" aria-label="Tài khoản & cài đặt">
            <span className="flex size-7 items-center justify-center rounded-full bg-primary text-xs font-bold text-primary-foreground uppercase">
              {user?.[0]}
            </span>
            <span className="hidden max-w-28 truncate text-sm md:inline">{user}</span>
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-64">
          <DropdownMenuLabel>
            <div className="truncate">{user}</div>
            <div className="text-xs font-normal text-muted-foreground">
              {syncEnabled ? "Tiến độ đồng bộ theo tên đăng nhập này." : "Tiến độ chỉ lưu trên trình duyệt này."}
            </div>
          </DropdownMenuLabel>
          <DropdownMenuSeparator />
          <DropdownMenuItem onClick={() => setSettingsOpen(true)}>
            <SlidersHorizontal /> Cài đặt học & ngày thi
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem onClick={download}>
            <Download /> Sao lưu ra file
          </DropdownMenuItem>
          <DropdownMenuItem onClick={() => fileRef.current?.click()}>
            <Upload /> Khôi phục từ file
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem variant="destructive" onClick={() => setConfirmReset(true)}>
            <RotateCcw /> Xoá toàn bộ tiến độ
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem
            onClick={async () => {
              await syncNow()
              setUser(undefined)
            }}
          >
            <LogOut /> Đăng xuất
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
      <input ref={fileRef} type="file" accept="application/json,.json" hidden onChange={onFile} />
      <AlertDialog open={confirmReset} onOpenChange={setConfirmReset}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Xoá toàn bộ tiến độ?</AlertDialogTitle>
            <AlertDialogDescription>
              Lịch ôn, Sổ câu sai và lịch sử thi sẽ mất trên mọi thiết bị dùng tên này. Nên sao lưu ra file trước.
              Không thể hoàn tác.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Huỷ</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-white hover:bg-destructive/90"
              onClick={() => {
                reset()
                toast.success("Đã xoá tiến độ")
              }}
            >
              Xoá
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  )
}
