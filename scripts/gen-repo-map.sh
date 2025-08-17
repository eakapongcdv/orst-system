#!/usr/bin/env bash
set -euo pipefail

ROOT="${1:-.}"
OUT="repo-map.md"

# โฟลเดอร์ที่ควรข้าม
IGNORE_DIRS='(node_modules|\.next|dist|coverage|\.turbo|\.git)'

echo "# Repo Map" > "$OUT"
echo "" >> "$OUT"
echo "Generated: $(date -Iseconds)" >> "$OUT"
echo "" >> "$OUT"

# ---------------- Tree (top 3 levels) ----------------
echo "## Tree (top 10 levels)" >> "$OUT"
echo '```' >> "$OUT"
# ใช้ find + awk จำกัดความลึก ด้วยการนับจำนวน "/" ใน path
find "$ROOT" -print \
  | sed -E 's|^\./||' \
  | grep -Ev "^${IGNORE_DIRS}(/|$)" \
  | awk -F/ 'NF<=10' \
  | awk -F/ '{
      indent="";
      for(i=1;i<NF;i++) indent=indent "  ";
      print indent $NF
    }' >> "$OUT"
echo '```' >> "$OUT"
echo "" >> "$OUT"

# ---------------- API routes ----------------
echo "## API routes (app/api/**/route.ts)" >> "$OUT"
echo '```' >> "$OUT"
# ใช้ find แทน fd
if [ -d "${ROOT%/}/app/api" ]; then
  find "${ROOT%/}/app/api" -type f -name 'route.ts' -print | sort >> "$OUT"
fi
echo '```' >> "$OUT"
echo "" >> "$OUT"

# ---------------- Prisma models/enums ----------------
echo "## Prisma models/enums (prisma/schema.prisma)" >> "$OUT"
echo '```' >> "$OUT"
if [ -f "${ROOT%/}/prisma/schema.prisma" ]; then
  grep -nE '^\s*(model|enum)\s+[A-Za-z0-9_]+' "${ROOT%/}/prisma/schema.prisma" >> "$OUT" || true
fi
echo '```' >> "$OUT"
echo "" >> "$OUT"

# ---------------- Package scripts ----------------
echo "## package.json scripts" >> "$OUT"
echo '```' >> "$OUT"
if [ -f "${ROOT%/}/package.json" ]; then
  # ดึงเฉพาะส่วน scripts แบบง่าย ๆ (ถ้าอยากสวยกว่านี้ใช้ jq)
  awk '/"scripts"\s*:\s*{/{flag=1} flag{print} /}/{if(flag){exit}}' "${ROOT%/}/package.json" >> "$OUT" || true
fi
echo '```' >> "$OUT"
echo "" >> "$OUT"

echo "✔ Wrote $OUT"
