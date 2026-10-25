/**
 * Nút bấm được cả khi ngón khác đang giữ màn hình (vd. giữ phanh rồi bấm khởi động / vào số).
 * Trình duyệt điện thoại không phát sự kiện click khi có từ hai điểm chạm, nên với cảm ứng
 * ta xử lý ngay lúc chạm xuống; chuột và bàn phím vẫn dùng click như thường.
 */
let touchedAt = 0

export function tap(fn: () => void) {
  return {
    onPointerDown: (e: React.PointerEvent) => {
      if (e.pointerType === "mouse") return
      touchedAt = performance.now()
      fn()
    },
    onClick: () => {
      // click giả lập sau một lần chạm — đã xử lý ở onPointerDown
      if (performance.now() - touchedAt < 700) return
      fn()
    },
  }
}
