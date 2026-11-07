#!/usr/bin/env bash
set -euo pipefail

APP_DIR="$(cd "$(dirname "$0")/../.." && pwd)"
cd "$APP_DIR"

RUN_ID="${RUN_ID:-run-$(date +%Y%m%d-%H%M%S)}"
USERS="${USERS:-50}"
DURATION="${DURATION:-10s}"
BASE_URL="${BASE_URL:-http://localhost:3000}"
NODE_BIN="${NODE_BIN:-node}"
FIXTURE_FILE="${FIXTURE_FILE:-output/load-test/fixture.json}"
OUT_DIR="${OUT_DIR:-output/load-test/$RUN_ID}"
SSE_PID=""

if ! command -v k6 >/dev/null 2>&1; then echo "错误：未安装 k6" >&2; exit 1; fi
if [[ ! "$RUN_ID" =~ ^[a-zA-Z0-9_-]+$ ]]; then echo "错误：RUN_ID 只能包含字母、数字、下划线和连字符" >&2; exit 1; fi
if [[ ! "$USERS" =~ ^[0-9]+$ ]] || (( USERS <= 0 )); then echo "错误：USERS 必须是正整数" >&2; exit 1; fi
if [[ ! -f "$FIXTURE_FILE" ]]; then echo "错误：请先创建专用压测活动（$FIXTURE_FILE）" >&2; exit 1; fi
if [[ -e "$OUT_DIR" ]]; then echo "错误：输出目录已存在，请更换 RUN_ID：$OUT_DIR" >&2; exit 1; fi

NODE_MAJOR="$($NODE_BIN -p 'Number(process.versions.node.split(".")[0])' 2>/dev/null || echo 0)"
if (( NODE_MAJOR < 20 )); then echo "错误：SSE 监视器需要 Node.js 20+，请通过 NODE_BIN 指定" >&2; exit 1; fi

case "$DURATION" in
  *s) DURATION_SEC="${DURATION%s}" ;;
  *m) DURATION_SEC=$(( ${DURATION%m} * 60 )) ;;
  *) echo "错误：DURATION 仅支持 10s、1m 这类格式" >&2; exit 1 ;;
esac
if [[ ! "$DURATION_SEC" =~ ^[0-9]+$ ]] || (( DURATION_SEC <= 0 )); then echo "错误：DURATION 必须大于 0" >&2; exit 1; fi

VOTE_CODE="$($NODE_BIN -e 'const fs=require("fs");const f=JSON.parse(fs.readFileSync(process.argv[1],"utf8"));if(!f.code)process.exit(1);process.stdout.write(f.code)' "$FIXTURE_FILE")"
ROUND_ID="$($NODE_BIN -e 'const fs=require("fs");const f=JSON.parse(fs.readFileSync(process.argv[1],"utf8"));if(!f.roundId)process.exit(1);process.stdout.write(f.roundId)' "$FIXTURE_FILE")"
EXPECTED_VOTES=$(( USERS * 3 ))
mkdir -p "$OUT_DIR"

cleanup() {
  if [[ -n "$SSE_PID" ]] && kill -0 "$SSE_PID" 2>/dev/null; then
    kill -TERM "$SSE_PID" 2>/dev/null || true
    wait "$SSE_PID" 2>/dev/null || true
  fi
}
trap cleanup EXIT INT TERM

export BASE_URL VOTE_CODE ROUND_ID RUN_ID USERS DURATION OUT_DIR FIXTURE_FILE
export SUMMARY_DIR="$OUT_DIR"
export DURATION_SEC=$(( DURATION_SEC + 90 ))
export EXPECTED_UPDATES="$EXPECTED_VOTES"

"$NODE_BIN" scripts/load-test/sse-watch.mjs > "$OUT_DIR/sse.log" 2>&1 &
SSE_PID=$!
for ((attempt=0; attempt<100; attempt++)); do
  [[ -f "$OUT_DIR/sse.ready" ]] && break
  if ! kill -0 "$SSE_PID" 2>/dev/null; then
    wait "$SSE_PID" || true
    SSE_PID=""
    echo "错误：大屏 SSE 监视器启动失败，详见 $OUT_DIR/sse.log" >&2
    exit 1
  fi
  sleep 0.1
done
if [[ ! -f "$OUT_DIR/sse.ready" ]]; then
  echo "错误：等待大屏 SSE 就绪超时" >&2
  exit 1
fi

set +e
k6 run scripts/load-test/vote.js 2> "$OUT_DIR/k6-errors.log" | tee "$OUT_DIR/k6.log"
K6_STATUS=${PIPESTATUS[0]}
sleep 2
: > "$OUT_DIR/sse.stop"
wait "$SSE_PID"
SSE_STATUS=$?
set -e
SSE_PID=""

set +e
"$NODE_BIN" scripts/load-test/fixture.js verify --expected-voters "$USERS" --expected-votes "$EXPECTED_VOTES" | tee "$OUT_DIR/verify.json"
VERIFY_STATUS=${PIPESTATUS[0]}
set -e

"$NODE_BIN" - "$OUT_DIR" "$RUN_ID" "$USERS" "$EXPECTED_VOTES" "$K6_STATUS" "$SSE_STATUS" "$VERIFY_STATUS" <<'NODE'
const fs = require("fs");
const path = require("path");
const [outDir, runId, users, expectedVotes, k6, sse, verify] = process.argv.slice(2);
fs.writeFileSync(path.join(outDir, "run.json"), `${JSON.stringify({ runId, users: Number(users), expectedVotes: Number(expectedVotes), exitStatus: { k6: Number(k6), sse: Number(sse), verify: Number(verify) }, finishedAt: new Date().toISOString() }, null, 2)}\n`);
NODE

echo "压测产物：$OUT_DIR"
if (( K6_STATUS != 0 || SSE_STATUS != 0 || VERIFY_STATUS != 0 )); then
  echo "压测未通过：k6=$K6_STATUS sse=$SSE_STATUS verify=$VERIFY_STATUS" >&2
  exit 1
fi
