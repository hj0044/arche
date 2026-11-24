// UI 픽스처(지시서 017 A-2): 시안의 예시를 닮은 상태를 만들어 src/ui/fixtures/ui-mock.json(세이브 JSON)에 쓴다.
// 사용: npm run make-ui-fixture
// 조건: 12일차, 제로 1,240·아르케 86·고유 재료 3, 길드 계약자 20명(대기·파견·훈련·부상·레벨업 가능·충성 낮음),
// 진행 중 파견 2건, 의무실 공사 중, 거점 리프트 목록에 위험도 5구간이 모두, 마감 D-1 리프트, 도시 3곳.
import { mkdirSync, writeFileSync } from 'node:fs';
import { tables } from '../src/data';
import { advanceDay, assignToFacility, dispatch, expToNextLevel, newGame, type GameState, type MercenaryState } from '../src/engine/game';
import { generateRift, type Rift } from '../src/engine/rift';
import { createRng } from '../src/engine/rng';
import { riftAutoRisk } from '../src/engine/status';
import { createSaveFile } from '../src/storage/saveFile';

const OUT = 'src/ui/fixtures/ui-mock.json';
const DAY = 12;
const t = tables;

let s: GameState = newGame(t, {
  seed: 'ui-fixture',
  guildName: '새벽 길드',
  baseCityId: 'seoul',
  protagonist: { mode: 'guildMaster', name: '길드장', background: 'heir' },
});

// ── 계약자 20명: 로스터 앞 20명을 길드로, 레벨은 시작값 + 조금씩
const guildIds = t.roster.slice(0, 20).map((r) => r.id);
s = {
  ...s,
  day: DAY,
  resources: { zero: 1240, arche: 86, materials: { earth_parts: 3 } },
  mercenaries: s.mercenaries.map((m, i): MercenaryState => {
    if (!guildIds.includes(m.id)) return m;
    const level = Math.min(m.growth.cap, 6 + (i % 7));
    return { ...m, affiliation: { kind: 'guild' }, level, exp: 0, loyalty: m.loyalty ? { ...m.loyalty, value: 62 } : m.loyalty };
  }),
  rifts: [],
  facilities: { ...s.facilities, levels: { ...s.facilities.levels, infirmary: 1, training: 2, scout: 3 } },
};
const patch = (id: string, f: (m: MercenaryState) => Partial<MercenaryState>) => {
  s = { ...s, mercenaries: s.mercenaries.map((m) => (m.id === id ? { ...m, ...f(m) } : m)) };
};
// 레벨업 가능 3명(아르케 86으로 일부만 가능)
for (const id of [guildIds[0], guildIds[2], guildIds[5]]) patch(id, (m) => ({ exp: expToNextLevel(t, m.level, m.growth.speed) }));
// 부상 1명, 충성 낮음 1명
patch(guildIds[4], () => ({ injury: { severity: 'light', recoverDay: DAY + 1 } }));
patch(guildIds[3], (m) => ({ loyalty: m.loyalty ? { ...m.loyalty, value: 15, dangerDays: 1 } : m.loyalty }));

// ── 리프트: 거점(서울)에 위험도 5구간이 모두 나오도록 고른다(남은 파티 기준). 도쿄·뉴욕은 몇 개씩
let counter = 100;
const make = (cityId: string, seed: string, deadline?: number): Rift => {
  counter += 1;
  const r = generateRift(t, cityId, DAY - 2, `r${counter}`, createRng(seed));
  return deadline ? { ...r, deadlineDay: deadline } : r;
};

// 파견 2건(관문 하나, 균열 하나)을 먼저 보낸다.
const g1 = make('seoul', 'fx-gate', DAY + 5);
const c1 = make('seoul', 'fx-crack', DAY + 4);
s = { ...s, rifts: [g1, c1] };
s = dispatch(t, s, g1.id, [guildIds[6], guildIds[7], guildIds[8], guildIds[9]].map((id) => ({ mercId: id, row: 'front' as const })));
s = dispatch(t, s, c1.id, [guildIds[10], guildIds[11]].map((id) => ({ mercId: id, row: 'front' as const })));
s = { ...s, expeditions: s.expeditions.map((e, i) => ({ ...e, departDay: DAY - 1 - i, returnDay: DAY + 2 - i })) };

// 훈련 배치 2명
s = assignToFacility(t, s, 'training', guildIds[12]);
s = assignToFacility(t, s, 'training', guildIds[13]);
// 의무실 Lv2 공사 중
s = { ...s, facilities: { ...s.facilities, construction: { facilityId: 'infirmary', targetLevel: 2, startDay: DAY - 1, completeDay: DAY + 2 } } };

// 위험도 5구간 채우기: 같은 구성(중급 3마리 균열)의 몬스터 레벨을 올려 가며 구간별로 하나씩 고른다(정확히 한 구간인 것).
// 탐지소 Lv3이라 레벨·수가 정확히 보여 위험도가 범위가 아니다(017b: 징조 배지가 보이도록 Lv3).
const want = t.combatPower.riskTiers.map((x) => x.id);
const picked = new Map<string, Rift>();
const tmpl = make('seoul', 'fx-tmpl', DAY + 4);
const gradeRange = t.monsterGrades.find((g) => g.id === 'mid')!.level;
for (const count of [2, 3, 4]) {
  for (let level = gradeRange[0]; level <= gradeRange[1] && picked.size < want.length; level++) {
    const species = t.monsters.filter((m) => m.grades.includes('mid'));
    const r: Rift = {
      ...tmpl,
      id: `r${++counter}`,
      enemies: Array.from({ length: count }, (_, i) => ({ monsterId: species[i % species.length].id, grade: 'mid', level, row: t.roles.find((x) => x.id === species[i % species.length].role)!.defaultRow })),
    };
    const risk = riftAutoRisk(t, { ...s, rifts: [r] }, r);
    if (!risk) continue;
    const tier = risk.estimate.worst.id;
    if (risk.estimate.best.id === tier && !picked.has(tier)) picked.set(tier, r);
  }
}
const missing = want.filter((id) => !picked.has(id));
if (missing.length) throw new Error(`위험도 구간을 다 채우지 못했다: ${missing.join(', ')}`);
// 마감 D-1 하나(가장 위험도가 좋은 것)
const crackNames = t.riftTiers.find((x) => x.id === 'crack')!.names;
const seoul = want.map((id, i) => ({ ...picked.get(id)!, name: `서울 ${crackNames[i]}`, deadlineDay: DAY + 3 + i }));
seoul[0] = { ...seoul[0], deadlineDay: DAY + 1, variant: 'small' };
// 017b 배지: 첫 카드는 소규모 변형, 둘째 카드는 징조(시안 Content)
seoul[1] = { ...seoul[1], omen: { textId: t.omens[0].id } };
const others = [
  make('tokyo', 'fx-t1'),
  make('tokyo', 'fx-t2'),
  make('tokyo', 'fx-t3'),
  make('newyork', 'fx-n1'),
  make('newyork', 'fx-n2'),
];
s = { ...s, rifts: [...seoul, ...others], counters: { ...s.counters, rift: counter } };

// 지난 복귀 보고 하나(전투 재생 화면용): 첫 파견이 어제 돌아왔다고 치고 정산한 보고를 붙인다.
{
  const tmp: GameState = { ...s, day: DAY - 1, expeditions: [{ ...s.expeditions[0], returnDay: DAY }] };
  const rep = advanceDay(t, tmp).state.reports.at(-1)!;
  s = { ...s, reports: [{ ...rep, expeditionId: 'e0', day: DAY - 1 }] };
}

const file = createSaveFile(s, 'manual', new Date('2026-11-23T00:00:00Z'));
mkdirSync('src/ui/fixtures', { recursive: true });
writeFileSync(OUT, JSON.stringify(file, null, 1) + '\n');
console.log(`UI 픽스처를 ${OUT}에 썼다: ${s.day}일차, 길드 ${s.mercenaries.filter((m) => m.affiliation.kind === 'guild').length}명, 리프트 ${s.rifts.length}개, 파견 ${s.expeditions.length}건`);
