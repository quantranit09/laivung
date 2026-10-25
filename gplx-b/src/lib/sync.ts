/**
 * Đồng bộ tiến độ qua Supabase (REST, không cần SDK). Mỗi tên đăng nhập là một dòng
 * trong bảng `progress`. Không có mật khẩu: ai biết tên đăng nhập đều xem/sửa được —
 * chấp nhận được với app học cá nhân.
 */
import type { CardState, Progress } from "./srs"

const URL_ = import.meta.env.VITE_SUPABASE_URL as string | undefined
const KEY = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined
export const syncEnabled = !!(URL_ && KEY)

export const USERNAME_RE = /^[a-z0-9._-]{3,32}$/
export const normalizeUsername = (s: string) =>
  s
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/đ/g, "d")
    .replace(/\s+/g, ".")

export interface SyncData {
  progress: Progress
  history: { id: string }[]
  log: Record<string, number>
  settings: object
  settingsAt: number
  study: object | null
  studyAt: number
  exam: object | null
  examAt: number
  resetAt: number
}

// Khoá anon kiểu cũ là JWT, gửi kèm Authorization; khoá publishable mới (sb_publishable_…) chỉ cần apikey.
const headers = (): Record<string, string> => ({
  apikey: KEY!,
  ...(KEY!.startsWith("eyJ") ? { Authorization: `Bearer ${KEY}` } : {}),
  "Content-Type": "application/json",
})

export async function pull(username: string): Promise<SyncData | null> {
  const res = await fetch(`${URL_}/rest/v1/progress?username=eq.${encodeURIComponent(username)}&select=data`, {
    headers: headers(),
  })
  if (!res.ok) throw new Error(`Đồng bộ lỗi ${res.status}`)
  const rows = (await res.json()) as { data: SyncData }[]
  return rows[0]?.data ?? null
}

export async function push(username: string, data: SyncData) {
  const res = await fetch(`${URL_}/rest/v1/progress`, {
    method: "POST",
    headers: { ...headers(), Prefer: "resolution=merge-duplicates,return=minimal" },
    body: JSON.stringify({ username, data, updated_at: new Date().toISOString() }),
  })
  if (!res.ok) throw new Error(`Đồng bộ lỗi ${res.status}`)
}

const maxPerKey = (a: Record<string, number> = {}, b: Record<string, number> = {}) => {
  const out = { ...a }
  for (const [k, v] of Object.entries(b)) out[k] = Math.max(out[k] ?? 0, v)
  return out
}

/**
 * Gộp hai bản dữ liệu: từng câu lấy bản có lần làm mới nhất, lịch sử thi gộp theo id,
 * nhật ký theo ngày lấy số lớn hơn, còn cài đặt và phiên đang dở lấy bản sửa sau cùng.
 */
export function merge(a: SyncData, b: SyncData | null): SyncData {
  if (!b) return a
  // Bên nào bấm "xoá tiến độ" sau cùng thì mọi dữ liệu cũ hơn mốc đó bị bỏ.
  const resetAt = Math.max(a.resetAt ?? 0, b.resetAt ?? 0)
  const progress: Progress = {}
  for (const side of [a.progress, b.progress ?? {}])
    for (const [n, s] of Object.entries(side) as [string, CardState][]) {
      const mine = progress[Number(n)]
      if (s.last > resetAt && (!mine || s.last > mine.last)) progress[Number(n)] = s
    }
  const seen = new Set<string>()
  const history = [...(a.history ?? []), ...(b.history ?? [])]
    .filter((h) => Number(h.id) > resetAt && !seen.has(h.id) && seen.add(h.id))
    .sort((x, y) => Number(y.id) - Number(x.id))
    .slice(0, 100)
  const newer = <K extends "settings" | "study" | "exam">(k: K, at: "settingsAt" | "studyAt" | "examAt") =>
    (b[at] ?? 0) > (a[at] ?? 0) ? { [k]: b[k], [at]: b[at] } : { [k]: a[k], [at]: a[at] }
  return {
    progress,
    history,
    log: (a.resetAt ?? 0) === (b.resetAt ?? 0) ? maxPerKey(a.log, b.log) : (a.resetAt ?? 0) > (b.resetAt ?? 0) ? a.log : b.log,
    resetAt,
    ...newer("settings", "settingsAt"),
    ...newer("study", "studyAt"),
    ...newer("exam", "examAt"),
  } as SyncData
}
