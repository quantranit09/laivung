import { useEffect, useState } from "react"

export interface ModelCredit {
  title: string
  author: string
  url: string
  license: string
}

/**
 * Tìm file mô hình xe `public/sim/models/<id>.glb` và thông tin tác giả trong `credits.json`.
 * Máy chủ tĩnh trả về index.html cho file không tồn tại, nên phải kiểm tra loại nội dung.
 */
export function useCarModelFile(id: string) {
  const [state, setState] = useState<{ url?: string; credit?: ModelCredit }>({})
  useEffect(() => {
    let alive = true
    const base = `${import.meta.env.BASE_URL}sim/models/`
    const url = `${base}${id}.glb`
    Promise.all([
      fetch(url, { method: "HEAD" }).then((r) => r.ok && !(r.headers.get("content-type") ?? "").includes("text/html")),
      fetch(`${base}credits.json`)
        .then((r) => (r.ok ? r.json() : {}))
        .catch(() => ({})),
    ])
      .then(([exists, credits]) => {
        if (alive) setState(exists ? { url, credit: (credits as Record<string, ModelCredit>)[id] } : {})
      })
      .catch(() => alive && setState({}))
    return () => {
      alive = false
    }
  }, [id])
  return state
}
