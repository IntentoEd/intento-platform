#!/usr/bin/env bash
# Ativa os git hooks versionados em scripts/git-hooks/.
# Roda uma vez por máquina (depois de clonar o repo).

set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

git config core.hooksPath scripts/git-hooks
chmod +x scripts/git-hooks/*

echo "✓ Hooks ativados (scripts/git-hooks/)"
echo "  Pre-push: roda 'npm run build' antes de push pra main."
echo "  Bypass de emergência: SKIP_BUILD_CHECK=1 git push ..."
