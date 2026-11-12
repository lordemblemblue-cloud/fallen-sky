/** Read-only UI contracts. These are not gameplay or reward authorizations. */
export type StarStatus = 'unknown' | 'locked' | 'available' | 'active' | 'turn_in' | 'completed';
export interface ChronicleNarrative {
  readonly templateId: string;
  readonly text: string;
  readonly memoryIds: readonly string[];
  readonly nextStars: readonly { readonly starId: string; readonly title: string; readonly status: StarStatus }[];
  readonly usedFallback: boolean;
  readonly readOnly: true;
}
export interface ChronicleMemory {
  readonly id: string;
  readonly source: 'echo_quest_turnin_165';
  readonly questId: string;
  readonly objectiveId: string;
  readonly outcome: 'completed';
  readonly completedAt: string;
  readonly npcId: string;
  readonly chapter: string | null;
  readonly branchOf: string | null;
}
export interface ConstellationStar {
  readonly id: string;
  readonly questId: string;
  readonly title: string;
  readonly description: string;
  readonly requires: string;
  readonly npcId: string;
  readonly chapter: string | null;
  readonly branchOf: string | null;
  readonly x: number;
  readonly y: number;
  readonly status: StarStatus;
  readonly memory: ChronicleMemory | null;
}
export interface ConstellationView {
  readonly id: string;
  readonly revision: number;
  readonly title: string;
  readonly description: string;
  readonly category: 'minor' | 'major' | 'legendary';
  readonly availability: 'available' | 'unavailable';
  readonly stars: readonly ConstellationStar[];
  readonly edges: readonly (readonly string[])[];
  readonly illuminatedEdges: readonly (readonly string[])[];
  readonly completedStars: number | null;
  readonly totalStars: number;
  readonly complete: boolean;
  readonly readOnly: true;
  readonly rewardsIssued: false;
}
