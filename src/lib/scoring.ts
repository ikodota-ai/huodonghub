import { db } from "./db";

export interface GroupDetail {
  groupId: bigint;
  groupName: string;
  kind: string;
  weight: number;
  sort: number;
  participants: number; // 该群体已投人数
  raw: number;          // score=平均分, vote=票数
  contribution: number; // 计入总分的分数
  fixedPoints: number | null; // 投票群体固定分值模式时每票分值，否则 null
}

export interface ContestantResult {
  contestantId: bigint;
  number: string;
  name: string;
  intro: string | null;
  image: string | null;
  batch: number;
  seq: number;
  groups: GroupDetail[];
  total: number;
}

const n = (v: unknown) => Number(v ?? 0);

// 从流水重建群体计数器（评审删除/重置后调用，防止缓存与流水不一致）
export async function rebuildGroupStats(groupId: bigint): Promise<void> {
  const group = await db.voteGroup.findUnique({ where: { id: groupId } });
  if (!group) return;
  if (group.kind === "score") {
    const sums = await db.scoreEntry.groupBy({ by: ["contestantId"], where: { groupId }, _sum: { score: true } });
    await db.$transaction([
      db.groupStat.deleteMany({ where: { groupId } }),
      ...sums.map((s) => db.groupStat.create({
        data: { groupId, contestantId: s.contestantId, valueCache: s._sum.score ?? 0 },
      })),
    ]);
  } else {
    const counts = await db.voteEntry.groupBy({ by: ["contestantId"], where: { groupId }, _count: { _all: true } });
    await db.$transaction([
      db.groupStat.deleteMany({ where: { groupId } }),
      ...counts.map((c) => db.groupStat.create({
        data: { groupId, contestantId: c.contestantId, valueCache: c._count._all },
      })),
    ]);
  }
}

// 单轮结果：每位选手各群体明细 + 总分
export async function computeRoundResults(roundId: bigint): Promise<ContestantResult[]> {
  const round = await db.voteRound.findUniqueOrThrow({
    where: { id: roundId },
    include: {
      groups: { orderBy: { sort: "asc" }, include: { groupStats: true } },
      roundContestants: { include: { contestant: true } },
    },
  });

  const batchOf = new Map<string, number>(); // contestantId -> 批次（0=全员）
  const seqOf = new Map<string, number>(); // contestantId -> 出场顺序
  for (const rc of round.roundContestants) {
    batchOf.set(rc.contestantId.toString(), rc.batch);
    seqOf.set(rc.contestantId.toString(), rc.seq);
  }

  // 评分群体：每位选手的"实际评分人数"。分批模式下不能用"全群体已提交人数"，
  // 否则漏评某批的评委会摊薄该批选手的均分。全员模式下与旧口径一致。
  const scorerCountMap = new Map<string, Map<string, number>>(); // groupId -> contestantId -> 评分人数
  const rosterCountMap = new Map<string, number>(); // groupId -> 评委名单总人数（avgMode=roster 时作分母）
  // 投票群体：每个批次的独立投票人数（得票率基数按选手所在批次统计，批 0 = 整轮）
  const batchVotersMap = new Map<string, Map<number, number>>(); // groupId -> batch -> 人数
  const roundVotersMap = new Map<string, number>(); // groupId -> 整轮独立投票人数（pctMode=round 时作分母）
  for (const g of round.groups) {
    if (g.kind === "score") {
      const rows: { contestant_id: bigint; c: bigint }[] = await db.$queryRaw`
        SELECT contestant_id, COUNT(DISTINCT voter_id) AS c FROM score_entries WHERE group_id = ${g.id} GROUP BY contestant_id`;
      scorerCountMap.set(g.id.toString(), new Map(rows.map((r) => [r.contestant_id.toString(), Number(r.c)])));
      if (g.avgMode === "roster") {
        rosterCountMap.set(g.id.toString(), await db.voter.count({ where: { groupId: g.id } }));
      }
    } else {
      const rows: { batch: number; c: bigint }[] = await db.$queryRaw`
        SELECT rc.batch AS batch, COUNT(DISTINCT ve.voter_key) AS c
        FROM vote_entries ve
        JOIN round_contestants rc ON rc.contestant_id = ve.contestant_id AND rc.round_id = ${roundId}
        WHERE ve.group_id = ${g.id}
        GROUP BY rc.batch`;
      batchVotersMap.set(g.id.toString(), new Map(rows.map((r) => [Number(r.batch), Number(r.c)])));
      if (g.pctMode === "round") {
        const rv: { c: bigint }[] = await db.$queryRaw`
          SELECT COUNT(DISTINCT voter_key) AS c FROM vote_entries WHERE group_id = ${g.id}`;
        roundVotersMap.set(g.id.toString(), Number(rv[0]?.c ?? 0));
      }
    }
  }

  const results: ContestantResult[] = round.roundContestants.map(({ contestant }) => {
    const details: GroupDetail[] = round.groups.map((g) => {
      const stat = g.groupStats.find((s) => s.contestantId === contestant.id);
      const cache = n(stat?.valueCache);
      const participants = g.kind === "score"
        ? (g.avgMode === "roster"
            ? (rosterCountMap.get(g.id.toString()) ?? 0)
            : (scorerCountMap.get(g.id.toString())?.get(contestant.id.toString()) ?? 0))
        : (g.pctMode === "round"
            ? (roundVotersMap.get(g.id.toString()) ?? 0)
            : (batchVotersMap.get(g.id.toString())?.get(batchOf.get(contestant.id.toString()) ?? 0) ?? 0));
      const weight = n(g.weight);
      let raw = 0;
      let contribution = 0;
      const fixedPoints = g.kind === "vote" && g.fixedPoints != null ? n(g.fixedPoints) : null;
      if (g.kind === "score") {
        raw = participants > 0 ? cache / participants : 0;
        contribution = (raw * weight) / 100;
      } else if (fixedPoints != null) {
        raw = cache;
        contribution = cache * fixedPoints;
      } else {
        raw = cache;
        // 得票率封顶 100%：开启"每天重置限票"或"允许重复投同一人"后，
        // 同一人可给同一选手投多票（票数 > 参与人数），不封顶折算会超过权重
        contribution = participants > 0 ? Math.min(cache / participants, 1) * weight : 0;
      }
      return {
        groupId: g.id,
        groupName: g.name,
        kind: g.kind,
        weight,
        sort: g.sort,
        participants,
        raw: Math.round(raw * 100) / 100,
        contribution: Math.round(contribution * 100) / 100,
        fixedPoints,
      };
    });
    const total = Math.round(details.reduce((s, d) => s + d.contribution, 0) * 100) / 100;
    return {
      contestantId: contestant.id,
      number: contestant.number,
      name: contestant.name,
      intro: contestant.intro,
      image: contestant.image,
      batch: batchOf.get(contestant.id.toString()) ?? 0,
      seq: seqOf.get(contestant.id.toString()) ?? 0,
      groups: details,
      total,
    };
  });

  results.sort((a, b) => b.total - a.total);
  return results;
}

// ---- 跨轮聚合（参考 doc/references/成都分赛区聚合结果_01.png）----
// 勾选若干轮 → 按群体名称跨轮合并：评分群体取各轮均分的平均；投票群体票数求和、
// 占比（票/参与人数）取各轮平均；总分 = Σ 群体得分 × 权重（群体得分已归一到百分制）

export interface MergedGroup {
  key: string;          // 合并键：群体名+类型
  name: string;
  kind: string;
  weight: number;       // 各轮权重平均
  scoreAvg: number;     // 评分群体：跨轮均分
  votes: number;        // 投票群体：跨轮票数和
  votePct: number;      // 投票群体：各轮(票/参与×100)的平均
  fixedPoints: number | null;
  contribution: number;
}

export interface AggregateItem {
  contestantId: bigint;
  number: string;
  name: string;
  intro: string | null;
  image: string | null;
  total: number;
  groups: MergedGroup[];
}

export async function computeVoteAggregate(voteId: bigint, roundIds?: bigint[]) {
  const allRounds = await db.voteRound.findMany({ where: { voteId }, orderBy: { seq: "asc" } });
  const rounds = roundIds && roundIds.length > 0 ? allRounds.filter((r) => roundIds.includes(r.id)) : allRounds;
  const perRound = new Map<string, ContestantResult[]>();
  for (const r of rounds) perRound.set(r.id.toString(), await computeRoundResults(r.id));

  const acc = new Map<string, {
    number: string; name: string; intro: string | null; image: string | null;
    groups: Map<string, { name: string; kind: string; sorts: number[]; weights: number[]; raws: number[]; votes: number; pcts: number[]; fixedPoints: number | null }>;
  }>();

  for (const r of rounds) {
    for (const item of perRound.get(r.id.toString())!) {
      const key = item.contestantId.toString();
      if (!acc.has(key)) {
        acc.set(key, { number: item.number, name: item.name, intro: item.intro, image: item.image, groups: new Map() });
      }
      const entry = acc.get(key)!;
      for (const d of item.groups) {
        const gk = `${d.kind}|${d.groupName}`;
        if (!entry.groups.has(gk)) {
          entry.groups.set(gk, { name: d.groupName, kind: d.kind, sorts: [], weights: [], raws: [], votes: 0, pcts: [], fixedPoints: null });
        }
        const g = entry.groups.get(gk)!;
        g.sorts.push(d.sort);
        g.weights.push(d.weight);
        if (d.kind === "score") {
          // 无数据的轮次（该群体无人提交）不计入平均，避免拉低得分
          if (d.participants > 0) g.raws.push(d.raw);
        } else {
          if (d.fixedPoints != null) g.fixedPoints = d.fixedPoints;
          if (d.participants > 0) {
            g.votes += d.raw;
            // 与单轮一致：得票率按 100% 封顶（每天重置/重复投会产生票数>人数）
            g.pcts.push(Math.min(d.raw / d.participants, 1) * 100);
          }
        }
      }
    }
  }

  const avg = (arr: number[]) => (arr.length ? arr.reduce((s, v) => s + v, 0) / arr.length : 0);
  const round2 = (v: number) => Math.round(v * 100) / 100;

  const list: AggregateItem[] = [...acc.entries()].map(([cid, e]) => {
    // 群体展示顺序与轮次配置一致（各轮 sort 最小值升序），不再按名称拼音排序
    const sortedEntries = [...e.groups.entries()].sort((a, b) =>
      Math.min(...a[1].sorts) - Math.min(...b[1].sorts) ||
      (a[1].kind === b[1].kind ? 0 : a[1].kind === "score" ? -1 : 1));
    const groups: MergedGroup[] = sortedEntries.map(([gk, g]) => {
      const weight = round2(avg(g.weights));
      const scoreAvg = round2(avg(g.raws));
      const votePct = round2(avg(g.pcts));
      let contribution = 0;
      if (g.kind === "score") contribution = (scoreAvg * weight) / 100;
      else if (g.fixedPoints != null) contribution = g.votes * g.fixedPoints;
      else contribution = (votePct * weight) / 100;
      return { key: gk, name: g.name, kind: g.kind, weight, scoreAvg, votes: g.votes, votePct, fixedPoints: g.fixedPoints, contribution: round2(contribution) };
    });
    const total = round2(groups.reduce((s, g) => s + g.contribution, 0));
    return { contestantId: BigInt(cid), number: e.number, name: e.name, intro: e.intro, image: e.image, total, groups };
  });

  list.sort((a, b) => b.total - a.total);
  const totals = list.map((i) => i.total);
  return {
    rounds: rounds.map((r) => ({ id: r.id.toString(), name: r.name })),
    roundCount: rounds.length,
    contestantCount: list.length,
    maxTotal: totals.length ? Math.max(...totals) : 0,
    avgTotal: totals.length ? round2(totals.reduce((s, v) => s + v, 0) / totals.length) : 0,
    list,
  };
}

export function toCsv(rows: string[][]): string {
  return rows.map((r) => r.map((c) => `"${(c ?? "").replace(/"/g, '""')}"`).join(",")).join("\n");
}
