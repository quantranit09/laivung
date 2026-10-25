import { useEffect } from "react"
import { merge, pull, push, syncEnabled } from "@/lib/sync"
import { syncSnapshot, useStore } from "@/store"

let applyingRemote = false
let running: Promise<void> | null = null
let again = false

/** Kéo bản trên mây về, gộp với bản máy này, ghi kết quả lên mây và vào máy. */
export function syncNow(): Promise<void> {
  const user = useStore.getState().user
  if (!syncEnabled || !user) return Promise.resolve()
  if (running) {
    again = true
    return running
  }
  running = (async () => {
    useStore.setState({ sync: navigator.onLine ? "syncing" : "offline" })
    try {
      do {
        again = false
        const merged = merge(syncSnapshot(), await pull(user))
        // Người dùng có thể đã đổi tài khoản trong lúc chờ mạng.
        if (useStore.getState().user !== user) return
        applyingRemote = true
        useStore.getState().applySync(merge(syncSnapshot(), merged))
        applyingRemote = false
        await push(user, syncSnapshot())
      } while (again)
      useStore.setState({ sync: "idle", lastSynced: Date.now() })
    } catch {
      useStore.setState({ sync: navigator.onLine ? "error" : "offline" })
    } finally {
      applyingRemote = false
      running = null
    }
  })()
  return running
}

/** Tự đồng bộ: 1,5 giây sau mỗi thay đổi, khi quay lại tab, khi có mạng lại và mỗi 30 giây. */
export function useCloudSync() {
  const user = useStore((s) => s.user)
  useEffect(() => {
    if (!syncEnabled || !user) return
    let timer: ReturnType<typeof setTimeout> | undefined
    const unsub = useStore.subscribe((s, prev) => {
      if (applyingRemote) return
      const changed =
        s.progress !== prev.progress ||
        s.history !== prev.history ||
        s.settings !== prev.settings ||
        s.study !== prev.study ||
        s.exam !== prev.exam ||
        s.resetAt !== prev.resetAt
      if (!changed) return
      clearTimeout(timer)
      timer = setTimeout(syncNow, 1500)
    })
    const onFocus = () => document.visibilityState === "visible" && syncNow()
    const interval = setInterval(onFocus, 30_000)
    window.addEventListener("focus", onFocus)
    window.addEventListener("online", onFocus)
    document.addEventListener("visibilitychange", onFocus)
    // Đóng tab khi còn thay đổi chưa đẩy lên: gửi nốt.
    const onHide = () => {
      if (timer) syncNow()
    }
    window.addEventListener("pagehide", onHide)
    syncNow()
    return () => {
      unsub()
      clearTimeout(timer)
      clearInterval(interval)
      window.removeEventListener("focus", onFocus)
      window.removeEventListener("online", onFocus)
      document.removeEventListener("visibilitychange", onFocus)
      window.removeEventListener("pagehide", onHide)
    }
  }, [user])
}
