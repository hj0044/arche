/**
 * 화면 요약용 순수 계산(지시서 011): 지금 상황, 레벨업 가능 용병, 리프트별 자동 편성 위험도.
 * 같은 입력이면 같은 결과이고 상태를 바꾸지 않는다.
 */
import { getRole, type GameTables } from '../data';
import { autoParty } from './autoParty';
import { estimateRisk, type RiskEstimate } from './combatPower';
import { assignedFacility, visibleRift } from './facilities';
import {
  expToNextLevel,
  getMerc,
  guildUpkeepPerDay,
  isAvailable,
  isGuildMember,
  isOnExpedition,
  levelUpCost,
  mercToUnit,
  refusedToday,
  type GameState,
} from './game';
import type { Rift } from './rift';

export interface GuildStatusSummary {
  /** 길드 소속 인원(주인공 포함) */
  total: number;
  /** 지금 출전 가능한 인원 */
  available: number;
  /** 출전할 수 없는 이유별 인원(한 사람은 첫 번째 이유 하나로만 센다: 파견 중 → 부상 → 훈련 → 거부) */
  blocked: { expedition: number; injured: number; training: number; refused: number };
  /** 가장 빠른 파견 복귀일과 회복일(없으면 null) */
  nextReturnDay: number | null;
  nextRecoveryDay: number | null;
  /** 오늘부터 그날까지 드는 유지비 합계(지금 길드 하루 유지비 × 남은 일수) */
  upkeepUntilReturn: number | null;
  upkeepUntilRecovery: number | null;
  dailyUpkeep: number;
  /** 출전 가능 인원이 기준(ui.lowAvailableWarn)보다 적은가 */
  short: boolean;
}

export function guildStatusSummary(tables: GameTables, state: GameState): GuildStatusSummary {
  const guild = state.mercenaries.filter(isGuildMember);
  const blocked = { expedition: 0, injured: 0, training: 0, refused: 0 };
  let available = 0;
  for (const m of guild) {
    if (isAvailable(state, m.id)) available++;
    else if (isOnExpedition(state, m.id)) blocked.expedition++;
    else if (m.injury) blocked.injured++;
    else if (assignedFacility(state.facilities, m.id)) blocked.training++;
    else if (refusedToday(state, m)) blocked.refused++;
  }
  const returns = state.expeditions.map((e) => e.returnDay);
  const recoveries = guild.filter((m) => m.injury).map((m) => m.injury!.recoverDay);
  const nextReturnDay = returns.length ? Math.min(...returns) : null;
  const nextRecoveryDay = recoveries.length ? Math.min(...recoveries) : null;
  const daily = guildUpkeepPerDay(tables, state);
  const until = (day: number | null) => (day === null ? null : Math.max(0, day - state.day) * daily);
  return {
    total: guild.length,
    available,
    blocked,
    nextReturnDay,
    nextRecoveryDay,
    upkeepUntilReturn: until(nextReturnDay),
    upkeepUntilRecovery: until(nextRecoveryDay),
    dailyUpkeep: daily,
    short: available < tables.ui.lowAvailableWarn,
  };
}

export interface LevelUpCandidate {
  mercId: string;
  /** 필요 아르케 */
  cost: number;
  /** 지금 아르케로 올릴 수 있는가 */
  affordable: boolean;
  /** 모자란 아르케(올릴 수 있으면 0) */
  shortfall: number;
}

/**
 * 경험치가 차서 레벨업할 수 있는 길드 용병. 파견 중이면 제외(규칙상 레벨업 불가), 부상 중은 포함.
 * onlyIds를 주면 그 용병만(예: 오늘 경험치를 받은 용병).
 */
export function levelUpCandidates(tables: GameTables, state: GameState, onlyIds?: string[]): LevelUpCandidate[] {
  return state.mercenaries
    .filter((m) => isGuildMember(m) && !isOnExpedition(state, m.id) && m.level < m.growth.cap)
    .filter((m) => !onlyIds || onlyIds.includes(m.id))
    .filter((m) => m.exp >= expToNextLevel(tables, m.level, m.growth.speed))
    .map((m) => {
      const cost = levelUpCost(tables, m.level);
      return { mercId: m.id, cost, affordable: state.resources.arche >= cost, shortfall: Math.max(0, cost - state.resources.arche) };
    });
}

export interface RiftAutoRisk {
  /** 자동 편성 인원 */
  partySize: number;
  estimate: RiskEstimate;
}

/**
 * 지금 가용 인원으로 자동 편성했을 때의 예상 위험도. 보이는 정보(visibleRift)만 쓴다.
 * 가용 인원이 없으면 null.
 */
export function riftAutoRisk(tables: GameTables, state: GameState, rift: Rift): RiftAutoRisk | null {
  const party = autoParty(tables, state, rift);
  if (party.length === 0) return null;
  const slots = party.map((p) => ({ unit: mercToUnit(tables, getMerc(state, p.mercId)), row: p.row ?? getRole(tables, getMerc(state, p.mercId).role).defaultRow }));
  return { partySize: party.length, estimate: estimateRisk(tables, slots, visibleRift(tables, state.facilities, rift)) };
}
