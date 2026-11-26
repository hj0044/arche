/**
 * 세이브 필수 필드 스키마. 필수 필드 목록은 이 파일 한 곳에서만 정의한다.
 * 가져오기와 불러오기는 슬롯에 기록하거나 게임을 시작하기 전에 이 스키마로 검사하고,
 * 실패하면 필드 경로가 들어간 오류(예: "state.resources 없음")를 돌려준다.
 */

type Schema =
  | 'string'
  | 'number'
  | 'boolean'
  | 'object'
  | { nullable: Schema }
  | { oneOf: readonly (string | number)[] }
  | { arrayOf: Schema }
  | { record: Schema }
  | { fields: Record<string, Schema>; optional?: Record<string, Schema> };

const reward: Schema = { fields: { zero: 'number', arche: 'number', materials: { record: 'number' } } };

const rift: Schema = {
  fields: {
    id: 'string',
    cityId: 'string',
    tier: 'string',
    name: 'string',
    appearedDay: 'number',
    deadlineDay: { nullable: 'number' },
    durationDays: 'number',
    enemies: { arrayOf: { fields: { monsterId: 'string', grade: 'string', level: 'number', row: { oneOf: ['front', 'back'] } } } },
    reward,
  },
  optional: { stable: 'boolean', omen: { fields: { textId: 'string' } }, variant: 'string' },
};
(rift as { fields: Record<string, Schema> }).fields.fog = {
  fields: { deadlineOffset: 'number', levelOffset: 'number', countOffset: 'number', rewardU: 'number' },
};
(rift as { fields: Record<string, Schema> }).fields.territoryFactionId = { nullable: 'string' };

const partyMember: Schema = { fields: { mercId: 'string', row: { oneOf: ['front', 'back'] } } };

/** 활약도 합계(지시서 027) */
const activityTally = { sorties: 'number', clears: 'number', downs: 'number', items: { record: 'number' } } as const;
const activity: Schema = {
  fields: {
    career: { fields: activityTally },
    season: { fields: { no: 'number', ...activityTally } },
    pastSeasons: { arrayOf: { fields: { no: 'number', ...activityTally } } },
    recent: {
      arrayOf: {
        fields: { day: 'number', riftName: 'string', tier: 'string', score: { nullable: 'number' }, outcome: { oneOf: ['victory', 'retreat', 'defeat'] } },
      },
    },
  },
};

const mercenary: Schema = {
  fields: {
    id: 'string',
    name: 'string',
    element: 'string',
    role: 'string',
    level: 'number',
    exp: 'number',
    growth: { fields: { cap: 'number' } },
    initialLevel: 'number',
    profile: { fields: { background: 'string', world: 'string', race: 'string' } },
    affiliation: { fields: { kind: 'string' } },
  },
  optional: {
    injury: { fields: { severity: 'string', recoverDay: 'number' } },
    unpaidUpkeep: { fields: { days: 'number', zero: 'number' } },
    departedDay: 'number',
    traitRanks: { record: 'number' },
    activity,
    loyalty: {
      fields: {
        value: 'number',
        dangerDays: 'number',
        restStreak: 'number',
        refusedOnDay: { nullable: 'number' },
        bonusDay: { nullable: 'number' },
        recent: { arrayOf: { fields: { day: 'number', reason: 'string', delta: 'number' } } },
      },
    },
  },
};

/** 리그 세계(지시서 028a). 곡선은 파라미터만 저장하고 값은 시드로 다시 계산한다 */
const standingRows: Schema = { record: { arrayOf: { fields: { id: 'string', score: 'number' } } } };
const leagueMove: Schema = { arrayOf: { fields: { id: 'string', from: 'string', to: 'string' } } };
const league: Schema = {
  fields: {
    seed: 'string',
    season: 'number',
    teams: {
      arrayOf: {
        fields: {
          id: 'string',
          name: 'string',
          kind: { oneOf: ['named', 'civil'] },
          faction: 'string',
          homeCity: { nullable: 'string' },
          scaleTier: 'number',
          tier: 'string',
          total: 'number',
          shape: 'number',
        },
      },
    },
    members: {
      arrayOf: {
        fields: {
          id: 'string',
          teamId: 'string',
          name: 'string',
          cultureId: 'string',
          gender: { oneOf: ['m', 'f', 'n'] },
          age: 'number',
          role: 'string',
          element: 'string',
          hometown: 'string',
          background: 'string',
          cap: 'number',
          talent: 'number',
          act: 'number',
          career: { fields: { seasons: 'number', activitySum: 'number', transfers: 'number' } },
        },
        optional: { post: 'string', featuredId: 'string', unit: 'object' },
      },
    },
    player: { fields: { tier: 'string', score: 'number' } },
    checkpoints: {
      arrayOf: {
        fields: {
          season: 'number',
          day: 'number',
          standings: standingRows,
          topByRole: { record: { arrayOf: { fields: { memberId: 'string', activity: 'number' } } } },
        },
      },
    },
    history: {
      arrayOf: {
        fields: {
          season: 'number',
          standings: standingRows,
          promoted: leagueMove,
          relegated: leagueMove,
          renamed: leagueMove,
          scaleMoves: { arrayOf: { fields: { id: 'string', from: 'number', to: 'number' } } },
          transfers: 'number',
          retired: 'number',
          recruits: 'number',
        },
      },
    },
    counters: { fields: { member: 'number' } },
  },
};

const state: Schema = {
  fields: {
    seed: 'string',
    day: 'number',
    guildName: 'string',
    baseCityId: 'string',
    protagonist: { fields: { name: 'string', background: 'string' } },
    resources: { fields: { zero: 'number', arche: 'number', materials: { record: 'number' } } },
    mercenaries: { arrayOf: mercenary },
    rifts: { arrayOf: rift },
    expeditions: {
      arrayOf: { fields: { id: 'string', rift, party: { arrayOf: partyMember }, departDay: 'number', travelDays: 'number', returnDay: 'number' } },
    },
    reports: {
      arrayOf: {
        fields: {
          expeditionId: 'string',
          rift,
          party: { arrayOf: partyMember },
          day: 'number',
          outcome: { oneOf: ['victory', 'retreat', 'defeat'] },
          rounds: 'number',
          combatSeed: 'string',
          reward,
          expGains: { arrayOf: { fields: { mercId: 'string', exp: 'number' } } },
          injuries: { arrayOf: { fields: { unitId: 'string', severity: 'string', days: 'number' } } },
          stabilized: 'boolean',
        },
        optional: { events: { arrayOf: 'object' } },
      },
    },
    stabilizedRoutes: { arrayOf: { fields: { riftId: 'string', name: 'string', day: 'number' } } },
    counters: { fields: { rift: 'number', expedition: 'number' } },
    records: { fields: { victories: 'number', victoriesByTier: { record: 'number' } } },
    facilities: {
      fields: {
        levels: { record: 'number' },
        construction: { nullable: { fields: { facilityId: 'string', targetLevel: 'number', startDay: 'number', completeDay: 'number' } } },
        assignments: { record: { arrayOf: 'string' } },
      },
    },
    settings: { fields: { autoOuter: 'boolean' } },
    league,
  },
};

/** 버전 확인을 통과한 뒤의 봉투(형식·버전은 parseSave가 먼저 본다) */
export const SAVE_SCHEMA: Schema = {
  fields: {
    savedAt: 'string',
    kind: { oneOf: ['manual', 'auto'] },
    summary: { fields: { guildName: 'string', day: 'number', baseCityId: 'string' } },
    state,
  },
};

/** 값을 스키마로 검사해 문제 목록(필드 경로 포함)을 돌려준다. 빈 배열이면 통과. */
export function validate(value: unknown, schema: Schema = SAVE_SCHEMA, path = ''): string[] {
  const at = path || '(최상위)';
  if (typeof schema === 'string') {
    if (schema === 'object') return isObject(value) ? [] : [`${at}: 객체가 아님`];
    return typeof value === schema && !(schema === 'number' && !Number.isFinite(value)) ? [] : [`${at}: ${KIND_NAME[schema]}가 아님`];
  }
  if ('nullable' in schema) return value === null ? [] : validate(value, schema.nullable, path);
  if ('oneOf' in schema) return schema.oneOf.includes(value as string) ? [] : [`${at}: 허용되지 않은 값 ${JSON.stringify(value)}`];
  if ('arrayOf' in schema) {
    if (!Array.isArray(value)) return [`${at}: 배열이 아님`];
    return value.flatMap((v, i) => validate(v, schema.arrayOf, `${path}[${i}]`));
  }
  if (!isObject(value)) return [`${at}: 객체가 아님`];
  if ('record' in schema) return Object.entries(value).flatMap(([k, v]) => validate(v, schema.record, `${path}.${k}`));
  const errors: string[] = [];
  for (const [key, sub] of Object.entries(schema.fields)) {
    const p = path ? `${path}.${key}` : key;
    if (!(key in value) || value[key] === undefined) errors.push(`${p} 없음`);
    else errors.push(...validate(value[key], sub, p));
  }
  for (const [key, sub] of Object.entries(schema.optional ?? {})) {
    if (value[key] !== undefined) errors.push(...validate(value[key], sub, path ? `${path}.${key}` : key));
  }
  return errors;
}

const KIND_NAME = { string: '문자열', number: '숫자', boolean: '참/거짓' } as const;

function isObject(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}
