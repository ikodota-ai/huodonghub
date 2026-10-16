export interface VoteGroupItem {
  id: string; name: string; kind: "score" | "vote"; weight: number;
  maxScore: number; maxVotes: number; allowRepeat: number;
  fixedPoints: number | null; restricted: number; sort: number;
  avgMode: "scorers" | "roster"; pctMode: "batch" | "round";
  votePeriod: "total" | "daily";
  voterCount: number;
}

export interface RoundItem {
  id: string; name: string; seq: number; status: string; code: string;
  audienceStartAt: string | null; audienceEndAt: string | null;
  screenShowResult: number; screenShowPart: number; audienceShowResult: number;
  screenGroupId: string | null; screenQrMode: number;
  screenPageSize: number;
  screenSortMode: "total" | "number" | "seq";
  currentBatch: number;
  contestantIds: string[];
  contestantBatches: { contestantId: string; batch: number; seq: number }[];
  groups: VoteGroupItem[];
}

export interface ContestantItem {
  id: string; number: string; name: string; intro: string | null; image: string | null; sort: number;
}

export interface VoteDetail {
  id: string; name: string; cover: string | null; description: string | null;
  wxAppid: string; wxSecret: string; status: string;
  wxEffective: { source: "vote" | "global"; sourceName: string } | null;
  wxGlobalConfigured: boolean;
  rounds: RoundItem[];
  contestants: ContestantItem[];
}

export const ROUND_STATUS: Record<string, { label: string; tone: "gray" | "green" | "red" | "orange" | "blue" }> = {
  pending: { label: "未开始", tone: "gray" },
  active: { label: "进行中", tone: "green" },
  paused: { label: "已暂停", tone: "orange" },
  finished: { label: "已结束", tone: "gray" },
};
