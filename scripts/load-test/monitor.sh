#!/usr/bin/env bash
set -euo pipefail

APP_DIR="$(cd "$(dirname "$0")/../.." && pwd)"
DURATION_SEC="${DURATION_SEC:-60}"
INTERVAL_SEC="${INTERVAL_SEC:-2}"
OUT_DIR="${OUT_DIR:-$APP_DIR/output/load-test/monitor-$(date +%Y%m%d-%H%M%S)}"
PM2_APP_NAME="${PM2_APP_NAME:-huodongpeitai}"
NODE_BIN="${NODE_BIN:-node}"

if [[ ! "$DURATION_SEC" =~ ^[0-9]+$ ]] || (( DURATION_SEC <= 0 )); then echo "错误：DURATION_SEC 必须是正整数" >&2; exit 1; fi
if [[ ! "$INTERVAL_SEC" =~ ^[0-9]+$ ]] || (( INTERVAL_SEC <= 0 )); then echo "错误：INTERVAL_SEC 必须是正整数" >&2; exit 1; fi
mkdir -p "$OUT_DIR"
REPORT="$OUT_DIR/resources.csv"
echo "timestamp,load1,memory_available_mb,swap_used_mb,node_cpu_percent,node_rss_mb,pm2_restarts" > "$REPORT"

metrics() {
  local load1 memory swap cpu rss restarts
  if [[ "$(uname -s)" == "Linux" ]]; then
    load1="$(awk '{print $1}' /proc/loadavg)"
    memory="$(free -m | awk '/^Mem:/ {print $7}')"
    swap="$(free -m | awk '/^Swap:/ {print $3}')"
  else
    load1="$(sysctl -n vm.loadavg | awk '{print $2}')"
    memory="$(vm_stat | awk -v page="$(sysctl -n vm.pagesize)" '/Pages free/ {free=$3} /Pages inactive/ {inactive=$3} END {gsub(/\./,"",free);gsub(/\./,"",inactive);printf "%.0f",(free+inactive)*page/1048576}')"
    swap="$(sysctl -n vm.swapusage | sed -E 's/.*used = ([0-9.]+)M.*/\1/' | awk '{printf "%.0f",$1}')"
  fi

  cpu=0; rss=0; restarts=0
  if command -v pm2 >/dev/null 2>&1; then
    local pm2_metrics
    pm2_metrics="$(pm2 jlist 2>/dev/null | "$NODE_BIN" -e 'let input="";process.stdin.on("data",c=>input+=c).on("end",()=>{try{const apps=JSON.parse(input).filter(app=>app.name===process.argv[1]);console.log([apps.reduce((s,a)=>s+(a.monit?.cpu||0),0),apps.reduce((s,a)=>s+Math.round((a.monit?.memory||0)/1048576),0),apps.reduce((s,a)=>s+(a.pm2_env?.restart_time||0),0)].join(" "))}catch{console.log("0 0 0")}})' "$PM2_APP_NAME")"
    read -r cpu rss restarts <<< "$pm2_metrics"
  else
    local ps_metrics
    ps_metrics="$(ps -axo pid=,pcpu=,rss=,comm=,args= | awk -v app="$APP_DIR" 'index($0,app) || $0 ~ /next-server/ {cpu+=$2;rss+=$3} END {printf "%.1f %.0f",cpu,rss/1024}')"
    read -r cpu rss <<< "$ps_metrics"
  fi
  echo "$(date -u +%Y-%m-%dT%H:%M:%SZ),$load1,$memory,$swap,$cpu,$rss,$restarts" >> "$REPORT"
}

echo "资源监控：$REPORT"
for ((elapsed=0; elapsed<DURATION_SEC; elapsed+=INTERVAL_SEC)); do
  metrics
  sleep "$INTERVAL_SEC"
done
metrics
