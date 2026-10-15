#!/usr/bin/env bash
# Запуск релиза: deploy.sh <тег> | previous
# Бэкап базы → pull образа → перезапуск → ожидание healthcheck → при провале возврат на прежний тег.
set -euo pipefail
cd "$(dirname "$0")"

HEALTH_TIMEOUT=${HEALTH_TIMEOUT:-120}

fail() {
  echo "$1" >&2
  exit 1
}

env_value() {
  grep -E "^$1=" .env 2>/dev/null | tail -n 1 | cut -d= -f2- || true
}

set_tag() {
  if grep -qE '^IMAGE_TAG=' .env; then
    sed -i "s/^IMAGE_TAG=.*/IMAGE_TAG=$1/" .env
  else
    echo "IMAGE_TAG=$1" >>.env
  fi
}

# Предыдущий успешно запущенный релиз — по порядку записей releases.log, а не по номеру:
# схемы тегов менялись (v11 → v2.0.N), и сравнение версий их путает.
previous_tag() {
  local current
  current=$(env_value IMAGE_TAG)
  [ -f releases.log ] && [ -n "$current" ] || return 0
  awk -v current="$current" '$2 == current { found = last } $2 != current { last = $2 } END { print found }' releases.log
}

# Оставляем образы текущего и предыдущего релиза; более старые при откате скачаются заново.
remove_old_images() {
  local keep_previous tag
  keep_previous=$(previous_tag)
  docker image ls "$repo" --format '{{.Tag}}' | while read -r tag; do
    if [ "$tag" = "$target" ] || [ "$tag" = "$keep_previous" ] || [ "$tag" = "<none>" ]; then continue; fi
    docker image rm "$repo:$tag" >/dev/null || echo "Образ $repo:$tag не удалён" >&2
  done
}

wait_healthy() {
  local id status
  for _ in $(seq 1 "$HEALTH_TIMEOUT"); do
    id=$(docker compose ps -q erp)
    status=$(docker inspect -f '{{.State.Health.Status}}' "$id" 2>/dev/null || echo starting)
    [ "$status" = healthy ] && return 0
    [ "$status" = unhealthy ] && return 1
    sleep 1
  done
  return 1
}

target=${1:-}
[ -n "$target" ] || fail "Использование: deploy.sh <тег> | previous"
if [ "$target" = previous ]; then
  target=$(previous_tag)
  [ -n "$target" ] || fail "Предыдущий релиз не найден в releases.log"
fi
[[ "$target" =~ ^[A-Za-z0-9._-]+$ ]] || fail "Некорректный тег: $target"

touch .env releases.log
[ -f erp.env ] || fail "Нет erp.env — скопируйте erp.env.example и заполните"
repo=$(env_value IMAGE_REPO)
[ -n "$repo" ] || fail "В .env не задан IMAGE_REPO"
current=$(env_value IMAGE_TAG)

echo "Релиз $target (сейчас: ${current:-нет})"
docker pull "$repo:$target"

if [ -n "$(docker compose ps -q --status running erp 2>/dev/null)" ]; then
  docker compose exec -T erp node dist/server/src/backup-cli.js "pre-$target"
fi

set_tag "$target"
docker compose up -d --remove-orphans

if wait_healthy; then
  echo "$(date -Iseconds) $target" >>releases.log
  remove_old_images
  docker image prune -f >/dev/null
  echo "Релиз $target запущен"
  exit 0
fi

echo "Релиз $target не прошёл проверку здоровья" >&2
docker compose logs --tail 100 erp >&2 || true
if [ -n "$current" ] && [ "$current" != "$target" ]; then
  echo "Возврат на $current" >&2
  set_tag "$current"
  docker compose up -d --remove-orphans
  wait_healthy || echo "Версия $current тоже не поднялась — нужна ручная проверка" >&2
fi
exit 1
