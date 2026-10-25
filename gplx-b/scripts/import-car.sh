#!/usr/bin/env bash
# Nhập mô hình xe 3D (tải từ Sketchfab: .glb hoặc .zip glTF) vào app, tối ưu cho web.
#
#   scripts/import-car.sh <file .glb|.zip> <vf6|sedan> "<Tên mô hình>" "<Tác giả>" "<link trang mô hình>"
#
# - Giảm số đa giác còn ~50%, ảnh texture tối đa 1024 px dạng WebP, nén hình học meshopt.
# - Kiểm tra sau khi nhập: npx tsx scripts/check-model.ts public/sim/models/<loại>.glb <loại>
# - Ghi thông tin tác giả vào public/sim/models/credits.json (giấy phép CC BY yêu cầu ghi công).
set -euo pipefail

SRC=${1:?Thiếu đường dẫn file mô hình}
SLOT=${2:?Thiếu loại xe: vf6 hoặc sedan}
TITLE=${3:-Mô hình xe}
AUTHOR=${4:-Không rõ}
LINK=${5:-}
case "$SLOT" in vf6 | sedan) ;; *) echo "Loại xe phải là vf6 hoặc sedan" && exit 1 ;; esac

ROOT=$(cd "$(dirname "$0")/.." && pwd)
OUT="$ROOT/public/sim/models/$SLOT.glb"
WORK=$(mktemp -d)
trap 'rm -rf "$WORK"' EXIT

INPUT="$SRC"
if [[ "$SRC" == *.zip ]]; then
  unzip -q "$SRC" -d "$WORK/src"
  INPUT=$(find "$WORK/src" -name "*.gltf" -o -name "*.glb" | head -1)
  [[ -n "$INPUT" ]] || { echo "Không thấy file .gltf/.glb trong zip"; exit 1; }
fi

mkdir -p "$(dirname "$OUT")"
# Giữ nguyên cây đối tượng và tên (không gộp/instancing) để app còn tìm được 4 bánh xe.
npx -y @gltf-transform/cli@4.1.1 optimize "$INPUT" "$OUT" \
  --compress meshopt \
  --flatten false --join false --instance false --palette false \
  --simplify true --simplify-ratio 0.5 --simplify-error 0.001 \
  --texture-compress webp --texture-size 1024

node -e '
const fs = require("fs"); const [file, slot, title, author, url] = process.argv.slice(1);
const data = fs.existsSync(file) ? JSON.parse(fs.readFileSync(file, "utf8")) : {};
data[slot] = { title, author, url, license: "CC BY 4.0" };
fs.writeFileSync(file, JSON.stringify(data, null, 2) + "\n");
' "$ROOT/public/sim/models/credits.json" "$SLOT" "$TITLE" "$AUTHOR" "$LINK"

ls -lh "$OUT"
echo "Xong. Mở mục Lái xe → Cài đặt để bật “Dùng mô hình 3D thật”."
