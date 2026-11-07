import fs from "node:fs";
import path from "node:path";

const BASE_URL = (process.env.BASE_URL || "").replace(/\/+$/, "");
const ROUND_ID = process.env.ROUND_ID || "";
const RUN_ID = process.env.RUN_ID || "sse";
const DURATION_SEC = Number(process.env.DURATION_SEC || "30");
const OUT_DIR = path.resolve(process.env.OUT_DIR || `output/load-test/${RUN_ID}`);
const EXPECTED_UPDATES = process.env.EXPECTED_UPDATES === undefined ? null : Number(process.env.EXPECTED_UPDATES);

if (!/^https?:\/\//.test(BASE_URL)) throw new Error("BASE_URL 必须是完整的 http(s) 地址");
if (!/^\d+$/.test(ROUND_ID)) throw new Error("ROUND_ID 必须是数字");
if (!Number.isSafeInteger(DURATION_SEC) || DURATION_SEC <= 0) throw new Error("DURATION_SEC 必须是正整数");
if (EXPECTED_UPDATES !== null && (!Number.isSafeInteger(EXPECTED_UPDATES) || EXPECTED_UPDATES < 0)) throw new Error("EXPECTED_UPDATES 必须是非负整数");

const report = {
  runId: RUN_ID,
  startedAt: new Date().toISOString(),
  endedAt: null,
  connections: 0,
  reconnects: 0,
  connectionErrors: 0,
  helloEvents: 0,
  updateEvents: 0,
  expectedUpdateEvents: EXPECTED_UPDATES,
  stateRequests: 0,
  stateErrors: 0,
  maxPendingStateRequests: 0,
  stateLatencyMs: { average: 0, p95: 0, p99: 0, max: 0 },
};
const latencies = [];
const pending = new Set();
let stopping = false;
let activeController = null;
let refreshTimer = null;
let stateInFlight = false;
let statePending = false;

function percentile(sorted, ratio) {
  if (sorted.length === 0) return 0;
  return sorted[Math.min(sorted.length - 1, Math.ceil(sorted.length * ratio) - 1)];
}

function fetchState() {
  const startedAt = Date.now();
  report.stateRequests += 1;
  report.maxPendingStateRequests = Math.max(report.maxPendingStateRequests, pending.size + 1);
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 10000);
  const request = fetch(`${BASE_URL}/api/screen/${ROUND_ID}/state`, { signal: controller.signal, headers: { "User-Agent": "HuodongLoadTest-Screen/1.0" } })
    .then(async (response) => {
      const payload = await response.json();
      if (!response.ok || payload?.ok !== true) throw new Error(`state 响应异常：${response.status}`);
    })
    .catch(() => { report.stateErrors += 1; })
    .finally(() => {
      clearTimeout(timeout);
      latencies.push(Date.now() - startedAt);
      pending.delete(request);
    });
  pending.add(request);
  return request;
}

async function flushState() {
  refreshTimer = null;
  if (stopping || stateInFlight || !statePending) return;
  statePending = false;
  stateInFlight = true;
  await fetchState();
  stateInFlight = false;
  if (statePending && !stopping) refreshTimer = setTimeout(flushState, 100);
}

function scheduleStateFetch() {
  statePending = true;
  if (refreshTimer || stateInFlight) return;
  refreshTimer = setTimeout(flushState, 100);
}

function consumeBlock(block) {
  const eventLine = block.split("\n").find((line) => line.startsWith("event:"));
  const event = eventLine?.slice(6).trim();
  if (event === "hello") report.helloEvents += 1;
  if (event === "update") {
    report.updateEvents += 1;
    scheduleStateFetch();
  }
}

async function consumeConnection() {
  report.connections += 1;
  activeController = new AbortController();
  const response = await fetch(`${BASE_URL}/api/screen/${ROUND_ID}/stream`, {
    signal: activeController.signal,
    headers: { Accept: "text/event-stream", "User-Agent": "HuodongLoadTest-Screen/1.0" },
  });
  if (!response.ok || !response.body) throw new Error(`SSE 连接失败：${response.status}`);
  fs.writeFileSync(path.join(OUT_DIR, "sse.ready"), `${new Date().toISOString()}\n`);
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  try {
    while (!stopping) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer = `${buffer}${decoder.decode(value, { stream: true })}`.replace(/\r\n/g, "\n");
      let boundary = buffer.indexOf("\n\n");
      while (boundary >= 0) {
        consumeBlock(buffer.slice(0, boundary));
        buffer = buffer.slice(boundary + 2);
        boundary = buffer.indexOf("\n\n");
      }
    }
  } finally {
    await reader.cancel().catch(() => {});
  }
}

async function main() {
  fs.mkdirSync(OUT_DIR, { recursive: true });
  const stopFile = path.join(OUT_DIR, "sse.stop");
  const stopPoll = setInterval(() => {
    if (!fs.existsSync(stopFile)) return;
    stopping = true;
    activeController?.abort();
  }, 250);
  const timer = setTimeout(() => {
    stopping = true;
    activeController?.abort();
  }, DURATION_SEC * 1000);
  while (!stopping) {
    try {
      await consumeConnection();
      if (!stopping) report.connectionErrors += 1;
    } catch {
      if (!stopping) report.connectionErrors += 1;
    }
    if (!stopping) {
      report.reconnects += 1;
      await new Promise((resolve) => setTimeout(resolve, 1000));
    }
  }
  clearTimeout(timer);
  clearInterval(stopPoll);
  if (refreshTimer) clearTimeout(refreshTimer);
  await Promise.allSettled([...pending]);
  const sorted = [...latencies].sort((a, b) => a - b);
  report.stateLatencyMs = {
    average: sorted.length ? Math.round(sorted.reduce((sum, value) => sum + value, 0) / sorted.length) : 0,
    p95: percentile(sorted, 0.95),
    p99: percentile(sorted, 0.99),
    max: sorted.at(-1) || 0,
  };
  report.endedAt = new Date().toISOString();
  const destination = path.join(OUT_DIR, "sse-summary.json");
  fs.writeFileSync(destination, `${JSON.stringify(report, null, 2)}\n`);
  console.log(JSON.stringify({ ...report, destination }, null, 2));
  if (report.connectionErrors > 0 || report.stateErrors > 0
    || (EXPECTED_UPDATES !== null && report.updateEvents !== EXPECTED_UPDATES)) process.exitCode = 1;
}

main().catch((error) => {
  console.error(`[SSE 压测] ${error.message}`);
  process.exitCode = 1;
});
