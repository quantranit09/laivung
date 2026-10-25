import raw from "@/data/questions.json"

export interface Question {
  /** Số thứ tự trong bộ 600 câu chính thức */
  n: number
  /** Chương 1–6 */
  c: number
  q: string
  o: string[]
  /** Đáp án đúng, đánh số từ 1 */
  a: number
  /** Câu điểm liệt */
  k: boolean
  /** Có hình minh hoạ (public/q/{n}.webp) */
  i: boolean
  /** Mẹo ghi nhớ */
  t: string
}

export const QUESTIONS = raw as Question[]
export const BY_N = new Map(QUESTIONS.map((q) => [q.n, q]))

export const CHAPTERS = [
  { id: 1, short: "Quy tắc", name: "Quy định chung và quy tắc giao thông" },
  { id: 2, short: "Văn hoá", name: "Văn hoá giao thông, đạo đức, kỹ năng PCCC & cứu hộ" },
  { id: 3, short: "Kỹ thuật lái", name: "Kỹ thuật lái xe" },
  { id: 4, short: "Cấu tạo", name: "Cấu tạo và sửa chữa" },
  { id: 5, short: "Biển báo", name: "Hệ thống biển báo hiệu đường bộ" },
  { id: 6, short: "Sa hình", name: "Giải các thế sa hình và kỹ năng xử lý tình huống" },
] as const

export const imageUrl = (n: number) => `${import.meta.env.BASE_URL}q/${n}.webp`

export const EXAM_FORMATS = {
  "2025": { label: "Hiện hành (đến 28/02/2027)", total: 30, minutes: 20, pass: 27 },
  "2027": { label: "Từ 01/03/2027", total: 50, minutes: 33, pass: 45 },
} as const
export type ExamFormat = keyof typeof EXAM_FORMATS
