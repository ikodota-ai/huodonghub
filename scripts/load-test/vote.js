import http from "k6/http";
import { check, sleep } from "k6";
import { Counter, Trend } from "k6/metrics";
import { parseHTML } from "k6/html";

const BASE_URL = (__ENV.BASE_URL || "").replace(/\/+$/, "");
const VOTE_CODE = __ENV.VOTE_CODE || "";
const RUN_ID = __ENV.RUN_ID || "";
const USERS = Number(__ENV.USERS || "50");
const SUMMARY_DIR = __ENV.SUMMARY_DIR || "output/load-test/current";
const API_ONLY = __ENV.API_ONLY === "1";
const SKIP_STATIC = API_ONLY || __ENV.SKIP_STATIC === "1";
const ARRIVAL_MODE = __ENV.LOAD_MODE === "arrival";
const MAX_VUS = Number(__ENV.MAX_VUS || Math.min(500, USERS));

if (!BASE_URL || !/^https?:\/\//.test(BASE_URL)) throw new Error("BASE_URL 必须是完整的 http(s) 地址");
if (!VOTE_CODE) throw new Error("VOTE_CODE 不能为空");
if (!RUN_ID || !/^[a-zA-Z0-9_-]+$/.test(RUN_ID)) throw new Error("RUN_ID 只能包含字母、数字、下划线和连字符");
if (!Number.isSafeInteger(USERS) || USERS <= 0) throw new Error("USERS 必须是正整数");

function durationSeconds(value) {
  const match = /^(\d+)(s|m)$/.exec(value || "10s");
  if (!match) throw new Error("DURATION 仅支持 10s、1m 这类秒/分钟格式");
  return Number(match[1]) * (match[2] === "m" ? 60 : 1);
}

const DURATION = __ENV.DURATION || "10s";
const SECONDS = durationSeconds(DURATION);
if (SECONDS <= 0) throw new Error("DURATION 必须大于 0");
if (!Number.isSafeInteger(MAX_VUS) || MAX_VUS <= 0 || MAX_VUS > USERS) throw new Error("MAX_VUS 必须是 1 到 USERS 之间的正整数");
if (ARRIVAL_MODE && USERS % SECONDS !== 0) throw new Error("到达模式要求 USERS 能被 DURATION 秒数整除");

const audienceScenario = ARRIVAL_MODE ? {
  executor: "constant-arrival-rate",
  rate: USERS / SECONDS,
  timeUnit: "1s",
  duration: DURATION,
  preAllocatedVUs: MAX_VUS,
  maxVUs: MAX_VUS,
  gracefulStop: "15s",
} : {
  executor: "per-vu-iterations",
  vus: USERS,
  iterations: 1,
  maxDuration: `${SECONDS + 60}s`,
  gracefulStop: "15s",
};

const thresholds = {
  checks: ["rate==1"],
  http_req_failed: ["rate==0"],
  vote_post_duration: ["p(95)<1000", "p(99)<2000"],
  audience_get_duration: ["p(95)<1000", "p(99)<2000"],
};
if (ARRIVAL_MODE) {
  thresholds.dropped_iterations = ["count==0"];
  thresholds.iterations = [`count==${USERS}`];
}

export const options = {
  scenarios: {
    audience: audienceScenario,
  },
  thresholds,
  tags: { run_id: RUN_ID },
};

const HEADERS = { "User-Agent": "HuodongLoadTest/1.0", Accept: "*/*" };
const businessFailures = new Counter("business_failures");
const staticBytes = new Counter("static_resource_bytes");
const votePostDuration = new Trend("vote_post_duration", true);
const audienceGetDuration = new Trend("audience_get_duration", true);
const htmlDuration = new Trend("html_duration", true);
const staticResourceDuration = new Trend("static_resource_duration", true);
const audienceDuration = new Trend("audience_total_duration", true);

function payloadOf(response) {
  try { return response.json(); } catch { return null; }
}

function absoluteAsset(url) {
  if (/^https?:\/\//.test(url)) return url;
  return `${BASE_URL}/${url.replace(/^\/+/, "")}`;
}

function shouldLoadAsset(url) {
  if (url.startsWith("/")) return true;
  return /^https?:\/\//.test(url) && url.includes("/_next/static/");
}

function logFailure(stage, response, fingerprint) {
  console.error(JSON.stringify({ stage, status: response.status, fingerprint, response: (response.body || "").slice(0, 500) }));
}

export default function () {
  if (!ARRIVAL_MODE) sleep((__VU - 1) * SECONDS / USERS);
  const startedAt = Date.now();
  const fingerprint = `${RUN_ID}-${__VU}-${__ITER}`;
  if (!API_ONLY) {
    const htmlStartedAt = Date.now();
    const htmlResponse = http.get(`${BASE_URL}/vote/${VOTE_CODE}`, { headers: HEADERS, tags: { kind: "html" } });
    htmlDuration.add(Date.now() - htmlStartedAt);
    if (!check(htmlResponse, { "投票 HTML 返回 200": (response) => response.status === 200 })) {
      logFailure("html", htmlResponse, fingerprint);
      businessFailures.add(1);
      return;
    }

    const document = parseHTML(htmlResponse.body);
    const assetUrls = new Set();
    document.find("script[src]").toArray().forEach((element) => {
      const src = element.attr("src");
      if (src && shouldLoadAsset(src)) assetUrls.add(absoluteAsset(src));
    });
    document.find('link[rel="stylesheet"][href]').toArray().forEach((element) => {
      const href = element.attr("href");
      if (href && shouldLoadAsset(href)) assetUrls.add(absoluteAsset(href));
    });
    if (!SKIP_STATIC && assetUrls.size > 0) {
      const assetResponses = http.batch([...assetUrls].map((url) => ({
        method: "GET", url, params: { headers: HEADERS, tags: { kind: "static" } },
      })));
      assetResponses.forEach((response) => {
        staticBytes.add(response.body ? response.body.length : 0);
        staticResourceDuration.add(response.timings.duration);
        if (!check(response, { "首屏静态资源返回 200": (item) => item.status === 200 })) {
          logFailure("static", response, fingerprint);
          businessFailures.add(1);
        }
      });
    }
  }

  const getStartedAt = Date.now();
  const apiResponse = http.get(`${BASE_URL}/api/vote/${VOTE_CODE}?fp=${encodeURIComponent(fingerprint)}`, {
    headers: HEADERS, tags: { kind: "audience_get" },
  });
  audienceGetDuration.add(Date.now() - getStartedAt);
  const apiPayload = payloadOf(apiResponse);
  const contestants = apiPayload?.data?.contestants || [];
  if (!check(apiResponse, {
    "选手加载成功且至少 3 人": () => apiResponse.status === 200 && apiPayload?.ok === true && apiPayload?.data?.phase === "active" && contestants.length >= 3,
  })) {
    logFailure("audience_get", apiResponse, fingerprint);
    businessFailures.add(1);
    return;
  }

  const first = (__VU + __ITER) % contestants.length;
  const picks = [0, 1, 2].map((offset) => contestants[(first + offset) % contestants.length]);
  picks.forEach((contestant, index) => {
    const postStartedAt = Date.now();
    const response = http.post(`${BASE_URL}/api/vote/${VOTE_CODE}`, JSON.stringify({ contestantId: contestant.id, fp: fingerprint }), {
      headers: { ...HEADERS, "Content-Type": "application/json" }, tags: { kind: "vote_post" },
    });
    votePostDuration.add(Date.now() - postStartedAt);
    const payload = payloadOf(response);
    const valid = response.status === 200 && payload?.ok === true
      && payload?.data?.used === index + 1 && payload?.data?.remaining === 2 - index;
    if (!check(response, {
      "投票成功且剩余票数正确": () => valid,
    })) {
      logFailure(`vote_post_${index + 1}`, response, fingerprint);
      businessFailures.add(1);
    }
  });
  audienceDuration.add(Date.now() - startedAt);
}

export function handleSummary(data) {
  return {
    [`${SUMMARY_DIR}/summary.json`]: JSON.stringify({
      run: { runId: RUN_ID, users: USERS, durationSeconds: SECONDS, expectedVotes: USERS * 3, apiOnly: API_ONLY, skipStatic: SKIP_STATIC, loadMode: ARRIVAL_MODE ? "arrival" : "closed", maxVUs: ARRIVAL_MODE ? MAX_VUS : USERS },
      ...data,
    }, null, 2),
  };
}
