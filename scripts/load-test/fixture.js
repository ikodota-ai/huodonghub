#!/usr/bin/env node
/* eslint-disable no-console */
const fs = require("fs");
const path = require("path");
const { randomBytes } = require("crypto");
const { PrismaClient } = require("@prisma/client");

const db = new PrismaClient();
const PREFIX = "压测专用";
const THROTTLE_KEY = "vote.ipLimit";
const THROTTLE_VALUE = JSON.stringify({ windowMin: 10, max: 1000000 });
const FIXTURE_FILE = path.resolve(process.env.FIXTURE_FILE || "output/load-test/fixture.json");

function usage() {
  console.log(`用法：
  LOAD_TEST_ACK=YES node scripts/load-test/fixture.js create
  node scripts/load-test/fixture.js verify --expected-voters 50 --expected-votes 150
  node scripts/load-test/fixture.js cleanup
  node scripts/load-test/fixture.js destroy

可用 FIXTURE_FILE 指定元数据路径，默认 output/load-test/fixture.json。`);
}

function argsOf(argv) {
  const result = {};
  for (let index = 0; index < argv.length; index += 2) {
    if (!argv[index].startsWith("--")) throw new Error(`无法识别参数：${argv[index]}`);
    result[argv[index].slice(2)] = argv[index + 1];
  }
  return result;
}

function positiveInteger(value, name) {
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed <= 0) throw new Error(`${name} 必须是正整数`);
  return parsed;
}

function readFixture() {
  if (!fs.existsSync(FIXTURE_FILE)) throw new Error(`找不到压测元数据：${FIXTURE_FILE}`);
  const fixture = JSON.parse(fs.readFileSync(FIXTURE_FILE, "utf8"));
  for (const key of ["voteId", "roundId", "groupId", "code", "name"]) {
    if (!fixture[key]) throw new Error(`压测元数据缺少 ${key}`);
  }
  if (!fixture.name.startsWith(PREFIX)) throw new Error("活动名称缺少“压测专用”前缀，拒绝操作");
  return fixture;
}

async function fixtureGroup(fixture) {
  const group = await db.voteGroup.findFirst({
    where: {
      id: BigInt(fixture.groupId),
      kind: "vote",
      round: { id: BigInt(fixture.roundId), vote: { id: BigInt(fixture.voteId), name: { startsWith: PREFIX } } },
    },
    include: { round: { include: { vote: true } }, groupStats: true },
  });
  if (!group) throw new Error("专用活动/轮次/群体关系不匹配，拒绝操作");
  return group;
}

async function databaseMetrics() {
  const rows = await db.$queryRawUnsafe("SHOW GLOBAL STATUS");
  const wanted = new Set(["Connections", "Max_used_connections", "Threads_connected", "Threads_running", "Slow_queries", "Questions"]);
  return Object.fromEntries(rows.filter((row) => wanted.has(row.Variable_name)).map((row) => [row.Variable_name, Number(row.Value)]));
}

async function create() {
  if (process.env.LOAD_TEST_ACK !== "YES") throw new Error("创建压测数据必须显式设置 LOAD_TEST_ACK=YES");
  if (fs.existsSync(FIXTURE_FILE)) throw new Error(`元数据已存在：${FIXTURE_FILE}，请先核实现有压测活动`);

  const admin = await db.user.findFirst({ where: { role: "admin", status: 1 }, orderBy: { id: "asc" } });
  if (!admin) throw new Error("没有可用的管理员账号作为专用活动所有者");
  const original = await db.setting.findUnique({ where: { key: THROTTLE_KEY } });
  const stamp = new Date().toISOString().replace(/[-:]/g, "").replace(/\..+/, "");
  let vote = null;

  try {
    vote = await db.vote.create({
      data: {
        name: `${PREFIX}-${stamp}-${randomBytes(3).toString("hex")}`,
        status: "active",
        ownerId: admin.id,
        description: "仅用于压力测试，禁止用于正式活动。",
        contestants: {
          create: Array.from({ length: 12 }, (_, index) => ({
            number: String(index + 1).padStart(2, "0"),
            name: `压测选手${String(index + 1).padStart(2, "0")}`,
            sort: index + 1,
          })),
        },
        rounds: {
          create: {
            name: "完整链路压测轮",
            seq: 1,
            status: "active",
            code: randomBytes(8).toString("base64url"),
            screenQrMode: 0,
            groups: {
              create: {
                name: "观众评审",
                kind: "vote",
                weight: 100,
                maxVotes: 3,
                allowRepeat: 0,
                restricted: 0,
                pctMode: "round",
                voteMode: "top",
                votePeriod: "total",
              },
            },
          },
        },
      },
      include: { contestants: { orderBy: { sort: "asc" } }, rounds: { include: { groups: true } } },
    });
    const round = vote.rounds[0];
    const group = round.groups[0];
    await db.roundContestant.createMany({
      data: vote.contestants.map((contestant, index) => ({ roundId: round.id, contestantId: contestant.id, seq: index + 1, batch: 0 })),
    });
    await db.setting.upsert({ where: { key: THROTTLE_KEY }, update: { value: THROTTLE_VALUE }, create: { key: THROTTLE_KEY, value: THROTTLE_VALUE } });

    const fixture = {
      name: vote.name,
      voteId: vote.id.toString(),
      roundId: round.id.toString(),
      groupId: group.id.toString(),
      code: round.code,
      createdAt: new Date().toISOString(),
      throttle: { existed: Boolean(original), originalValue: original?.value ?? null, testValue: THROTTLE_VALUE },
    };
    fs.mkdirSync(path.dirname(FIXTURE_FILE), { recursive: true });
    fs.writeFileSync(FIXTURE_FILE, `${JSON.stringify(fixture, null, 2)}\n`, { flag: "wx" });
    console.log(JSON.stringify({ ok: true, fixtureFile: FIXTURE_FILE, ...fixture }, null, 2));
  } catch (error) {
    if (vote) await db.vote.delete({ where: { id: vote.id } }).catch(() => {});
    const current = await db.setting.findUnique({ where: { key: THROTTLE_KEY } }).catch(() => null);
    if (current?.value === THROTTLE_VALUE) {
      if (original) await db.setting.update({ where: { key: THROTTLE_KEY }, data: { value: original.value } }).catch(() => {});
      else await db.setting.delete({ where: { key: THROTTLE_KEY } }).catch(() => {});
    }
    throw error;
  }
}

async function verify(argv) {
  const args = argsOf(argv);
  const expectedVoters = args["expected-voters"] === undefined ? null : positiveInteger(args["expected-voters"], "expected-voters");
  const expectedVotes = args["expected-votes"] === undefined ? null : positiveInteger(args["expected-votes"], "expected-votes");
  const fixture = readFixture();
  const group = await fixtureGroup(fixture);
  const entries = await db.voteEntry.findMany({ where: { groupId: group.id }, orderBy: { id: "asc" } });
  const voters = new Map();
  const perContestant = new Map();
  for (const entry of entries) {
    const contestantId = entry.contestantId.toString();
    if (!voters.has(entry.voterKey)) voters.set(entry.voterKey, []);
    voters.get(entry.voterKey).push(contestantId);
    perContestant.set(contestantId, (perContestant.get(contestantId) || 0) + 1);
  }
  const votesPerVoter = expectedVoters && expectedVotes ? expectedVotes / expectedVoters : 3;
  const invalidVoters = [...voters.entries()].filter(([, ids]) => ids.length !== votesPerVoter || new Set(ids).size !== ids.length)
    .map(([voterKey, ids]) => ({ voterKey, votes: ids.length, distinctContestants: new Set(ids).size }));
  const stats = new Map(group.groupStats.map((stat) => [stat.contestantId.toString(), Number(stat.valueCache)]));
  const contestantIds = new Set([...perContestant.keys(), ...stats.keys()]);
  const counterMismatches = [...contestantIds].filter((id) => (perContestant.get(id) || 0) !== (stats.get(id) || 0))
    .map((contestantId) => ({ contestantId, entries: perContestant.get(contestantId) || 0, groupStats: stats.get(contestantId) || 0 }));
  let screenApi = null;
  if (process.env.BASE_URL) {
    if (typeof fetch !== "function") throw new Error("结果 API 核对需要 Node.js 20+");
    const response = await fetch(`${process.env.BASE_URL.replace(/\/+$/, "")}/api/screen/${fixture.roundId}/state`);
    const payload = await response.json();
    const rows = payload?.data?.results;
    const mismatches = [];
    if (response.ok && payload?.ok === true && Array.isArray(rows)) {
      for (const contestantId of contestantIds) {
        const row = rows.find((item) => item.contestantId === contestantId);
        const raw = row?.groups?.find((item) => item.groupId === fixture.groupId)?.raw || 0;
        if ((perContestant.get(contestantId) || 0) !== raw) {
          mismatches.push({ contestantId, entries: perContestant.get(contestantId) || 0, screenRaw: raw });
        }
      }
    } else {
      mismatches.push({ error: `大屏 state 响应异常：${response.status}` });
    }
    screenApi = { ok: mismatches.length === 0, mismatches };
  }
  const report = {
    ok: (expectedVoters === null || voters.size === expectedVoters)
      && (expectedVotes === null || entries.length === expectedVotes)
      && invalidVoters.length === 0 && counterMismatches.length === 0 && screenApi?.ok !== false,
    fixture: fixture.name,
    uniqueVoters: voters.size,
    votes: entries.length,
    expectedVoters,
    expectedVotes,
    invalidVoters,
    counterMismatches,
    screenApi,
    database: await databaseMetrics(),
    checkedAt: new Date().toISOString(),
  };
  console.log(JSON.stringify(report, null, 2));
  if (!report.ok) throw new Error("票数或计数器核对失败");
}

async function cleanup() {
  const fixture = readFixture();
  const group = await fixtureGroup(fixture);
  const [entries, stats] = await db.$transaction([
    db.voteEntry.deleteMany({ where: { groupId: group.id } }),
    db.groupStat.deleteMany({ where: { groupId: group.id } }),
  ]);
  console.log(JSON.stringify({ ok: true, fixture: fixture.name, deletedEntries: entries.count, deletedStats: stats.count }, null, 2));
}

async function destroy() {
  const fixture = readFixture();
  await fixtureGroup(fixture);
  const current = await db.setting.findUnique({ where: { key: THROTTLE_KEY } });
  if (current?.value !== fixture.throttle.testValue) {
    throw new Error("vote.ipLimit 已被其他操作修改，停止销毁；请人工核对限流配置，避免覆盖他人修改");
  }
  await db.$transaction(async (tx) => {
    await tx.vote.delete({ where: { id: BigInt(fixture.voteId) } });
    if (fixture.throttle.existed) {
      await tx.setting.update({ where: { key: THROTTLE_KEY }, data: { value: fixture.throttle.originalValue } });
    } else {
      await tx.setting.delete({ where: { key: THROTTLE_KEY } });
    }
  });
  const archived = `${FIXTURE_FILE}.destroyed-${Date.now()}`;
  fs.renameSync(FIXTURE_FILE, archived);
  console.log(JSON.stringify({ ok: true, deletedVoteId: fixture.voteId, throttleRestored: true, metadataArchived: archived }, null, 2));
}

async function main() {
  const [command, ...argv] = process.argv.slice(2);
  if (!command || command === "--help" || command === "-h") return usage();
  if (command === "create") return create();
  if (command === "verify") return verify(argv);
  if (command === "cleanup") return cleanup();
  if (command === "destroy") return destroy();
  throw new Error(`未知命令：${command}`);
}

main().catch((error) => {
  console.error(`[压测] ${error.message}`);
  process.exitCode = 1;
}).finally(() => db.$disconnect());
