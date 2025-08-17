#!/usr/bin/env bash
# scripts/make-bundle.sh
# Bundle source code into a ZIP for Chat analysis.
# Usage:
#   bash scripts/make-bundle.sh                # -> bundle-YYYYmmdd-HHMM.zip
#   bash scripts/make-bundle.sh my-bundle.zip  # -> custom name

set -euo pipefail

# Go to repo root (works both inside/outside git)
if git rev-parse --show-toplevel >/dev/null 2>&1; then
  cd "$(git rev-parse --show-toplevel)"
fi

# Output filename
STAMP="$(date +%Y%m%d-%H%M)"
OUT="${1:-bundle-$STAMP.zip}"

# Sanity: zip available?
if ! command -v zip >/dev/null 2>&1; then
  echo "zip not found. Install it (macOS: 'brew install zip', Ubuntu: 'sudo apt-get install zip')." >&2
  exit 1
fi

# Let user know what we’ll do
echo "==> Creating bundle: $OUT"
echo "==> Repo root: $(pwd)"

# -------------------------------
# INCLUDE sets: update as needed
# -------------------------------
INCLUDE_DIRS=(
  app
  public
  src
  lib
  prisma
  styles
  scripts
)

# Common top-level files (configs/metadata)
INCLUDE_FILES=(
  repo-map.md
  package.json
  package-lock.json
  yarn.lock
  pnpm-lock.yaml
  next.config.js
  next.config.mjs
  next.config.ts
  tsconfig.json
  tailwind.config.js
  tailwind.config.cjs
  postcss.config.js
  postcss.config.cjs
  middleware.ts
  README*
  LICENSE*
  .env.example
)

# -------------------------------
# EXCLUDES: build caches, secrets
# -------------------------------
EXCLUDES=(
  "node_modules/*"
  ".next/*"
  "out/*"
  "dist/*"
  "build/*"
  ".git/*"
  ".turbo/*"
  ".vercel/*"
  "coverage/*"
  "*.log"
  "*.tmp"
  ".DS_Store"
  ".env"              # real secrets
  ".env.local"
  ".vscode/*"
  ".idea/*"
)

# If repo-map.md exists, include it (already in INCLUDE_FILES)
if [[ -f "repo-map.md" ]]; then
  echo "==> Found repo-map.md, will include."
else
  echo "==> repo-map.md not found (ok)."
fi

# Build the zip command
# zip -r OUT <INCLUDES...> -x <EXCLUDES...>
CMD=(zip -r "$OUT")

# Append includes that exist
for p in "${INCLUDE_DIRS[@]}"; do
  [[ -e "$p" ]] && CMD+=("$p")
done
for f in "${INCLUDE_FILES[@]}"; do
  # expand possible globs like README*
  for g in $f; do
    [[ -e "$g" ]] && CMD+=("$g")
  done
done

# If nothing matched, exit with message
if [[ "${#CMD[@]}" -le 3 ]]; then
  echo "No include targets found. Adjust INCLUDE_DIRS/INCLUDE_FILES." >&2
  exit 1
fi

# Append excludes
CMD+=(-x)
for ex in "${EXCLUDES[@]}"; do
  CMD+=("$ex")
done

# Show and run
echo "==> Running: ${CMD[*]}"
"${CMD[@]}"

echo "==> Done."
echo "==> Output: $OUT"