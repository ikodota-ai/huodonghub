import { voteAcceptsSubmissions } from "./vote-lifecycle";

export function groupAcceptsSubmissions(input: {
  voteStatus: string;
  roundStatus: string;
  screenGroupId: bigint | string | null | undefined;
  groupId: bigint | string;
}): boolean {
  return voteAcceptsSubmissions(input.voteStatus)
    && input.roundStatus === "active"
    && input.screenGroupId !== null
    && input.screenGroupId !== undefined
    && input.screenGroupId.toString() === input.groupId.toString();
}
