# LáiVững — Ôn thi GPLX hạng B

Web app ôn 600 câu lý thuyết (bộ đề áp dụng từ 01/06/2025), đồng bộ tiến độ giữa các trình duyệt theo tên đăng nhập.

## Chạy ở máy

```bash
cp .env.example .env   # điền Supabase (bỏ qua nếu chỉ cần lưu trên trình duyệt)
npm install
npm run dev
```

## Bật đồng bộ (Supabase, miễn phí)

1. Tạo project tại supabase.com.
2. SQL Editor → chạy [`supabase/schema.sql`](supabase/schema.sql).
3. Project Settings → API: lấy **Project URL** và khoá **anon public**.
4. Ở máy: điền vào `.env`. Trên GitHub: Settings → Secrets and variables → Actions → **Variables** →
   tạo `VITE_SUPABASE_URL` và `VITE_SUPABASE_ANON_KEY`, rồi chạy lại workflow deploy.

Đăng nhập chỉ cần tên (không mật khẩu): ai biết tên đều xem/sửa được tiến độ đó.
Dự án Supabase miễn phí tự tạm dừng sau 7 ngày không có truy cập — mở lại trong dashboard là chạy tiếp.

## Phương pháp học

- **Thử trước, xem sau** (retrieval practice + pretesting): luôn tự trả lời trước khi thấy đáp án, kể cả câu mới.
- **Nhắc lại tới khi thuộc** (successive relearning): trong phiên, câu mới phải nhớ đúng 2 lần, câu điểm liệt 3 lần, cách nhau vài câu.
- **Lịch ôn FSRS** (ts-fsrs): dự đoán lúc sắp quên từng câu; mục tiêu nhớ 92% cho câu thường, 97% cho câu điểm liệt. Chỉ lần làm đầu tiên trong phiên được chấm.
- **Chấm tự động**: sai = Again, "Mình đoán" = Hard, đúng = Good, đúng nhanh ở câu ôn = Easy.
- **Xáo đáp án khi học** (trừ câu kiểu "Cả hai ý trên"), **trộn chương**, **phiên ngắn** ~10–15 phút.
- **Ngày thi**: tự chia số câu mới/ngày để học xong trước 3 ngày, dành 3 ngày cuối thi thử và ôn câu sai.

## Dữ liệu

`src/data/questions.json` được ghép từ 3 bộ dữ liệu công khai trên GitHub
(rinaheart/tdytools-gplx, minhbui2003/GPLX_600, kienmai160598/On-thi-GPLX), đáp án lấy theo đa số
(chỉ 3/600 câu có nguồn lệch: 29, 302, 311). Hình ở `public/q/`.
