// 화면 없이 며칠을 자동으로 진행해 결과를 요약한다. 사용: npm run days -- [일수] [시드] [--no-outer]
// --no-outer: 외곽 임무 자동 배치를 끈다(지시서 022 비교용)
// --no-train: 남는 계약자를 훈련소에 넣지 않는다(쉬는 계약자가 생겨 외곽 임무가 돈다)
import { tables } from '../src/data';
import { loyaltyTier } from '../src/engine/loyalty';
import { newGame, type GameState } from '../src/engine/game';
import { autoplayDay } from './autoplay';

const args = process.argv.slice(2).filter((a) => !a.startsWith('--'));
const noOuter = process.argv.includes('--no-outer');
const play = process.argv.includes('--no-train') ? { ...tables, autoplay: { ...tables.autoplay, assignIdleToTraining: false } } : tables;
const [daysArg = '20', seed = 'days'] = args;
let s: GameState = newGame(tables, {
  seed,
  guildName: '시험 길드',
  baseCityId: 'seoul',
  protagonist: { name: '마스터' },
});

// 용병별 출전 횟수와 승리(영입 후 특정 용병 쏠림 확인용)
const sorties = new Map<string, { n: number; win: number }>();
// 충성도 요약용
let refusals = 0;
let idleDecays = 0;
const departures: string[] = [];
const poaches: string[] = [];

let trainingExpTotal = 0;
let unpaidDays = 0;
/** 미납한 용병 수의 합(용병·일) */
let unpaidMercDays = 0;
// 외곽 임무·파견 보상 합계(지시서 022)
const outerSum = { n: 0, exp: 0, zero: 0, arche: 0, hurt: 0, loyalty: 0 };
const dispatchSum = { n: 0, exp: 0, zero: 0, arche: 0 };
if (noOuter) s = { ...s, settings: { ...s.settings, autoOuter: false } };
for (let d = 0; d < Number(daysArg); d++) {
  const { state, events } = autoplayDay(play, s, (line) => console.log(line));
  s = state;
  for (const m of s.mercenaries) idleDecays += (m.loyalty?.recent ?? []).filter((r) => r.day === s.day && r.reason === 'idleDecay').length;
  for (const e of events) {
    if (e.type === 'returned') {
      const r = s.reports.find((x) => x.expeditionId === e.expeditionId)!;
      for (const p of r.party) {
        const st = sorties.get(p.mercId) ?? { n: 0, win: 0 };
        sorties.set(p.mercId, { n: st.n + 1, win: st.win + (r.outcome === 'victory' ? 1 : 0) });
      }
      console.log(`${s.day}일 복귀: ${r.rift.name} ${r.outcome} ${r.rounds}R 제로+${r.reward.zero} 아르케+${r.reward.arche} 부상 ${r.injuries.length}`);
    }
    if (e.type === 'outerMission')
      for (const r of e.results) {
        outerSum.n++;
        outerSum.exp += r.exp;
        outerSum.zero += r.zero;
        outerSum.arche += r.arche;
        outerSum.hurt += r.injuryDays !== undefined ? 1 : 0;
        outerSum.loyalty += r.loyaltyDelta;
      }
    if (e.type === 'returned') {
      const r = s.reports.find((x) => x.expeditionId === e.expeditionId)!;
      dispatchSum.n++;
      dispatchSum.exp += r.expGains.reduce((a, g) => a + g.exp, 0);
      dispatchSum.zero += r.reward.zero;
      dispatchSum.arche += r.reward.arche;
    }
    if (e.type === 'upkeep' && e.unpaid) console.log(`${s.day}일 유지비 미납 ${e.unpaid}`);
    if (e.type === 'refused') refusals++;
    if (e.type === 'trained') trainingExpTotal += e.exp;
    if (e.type === 'upkeep' && e.unpaid > 0) {
      unpaidDays++;
      unpaidMercDays += e.unpaidMercIds.length;
    }
    if (e.type === 'facilityBuilt') console.log(`${s.day}일 완공: ${tables.facilities.facilities.find((f) => f.id === e.facilityId)!.name} Lv${e.level}`);
    if (e.type === 'poached') {
      const m = s.mercenaries.find((x) => x.id === e.mercId)!;
      poaches.push(`${s.day}일 ${m.name}→${tables.factions.find((f) => f.id === e.toFactionId)?.name}`);
    }
    if (e.type === 'departed') {
      const m = s.mercenaries.find((x) => x.id === e.mercId)!;
      departures.push(`${s.day}일 ${m.name}`);
      console.log(`${s.day}일 이탈: ${m.name}`);
    }
  }
}
console.log('\n최종', { day: s.day, ...s.resources, victories: s.records.victories });
console.log(`파견 보상(복귀 ${dispatchSum.n}회): 경험치 ${dispatchSum.exp} · 제로 ${dispatchSum.zero} · 아르케 ${dispatchSum.arche}`);
console.log(`외곽 임무(${noOuter ? '끔' : `${outerSum.n}명·일`}): 경험치 ${outerSum.exp} · 제로 ${outerSum.zero} · 아르케 ${outerSum.arche} · 경상 ${outerSum.hurt} · 충성도 ${Math.round(outerSum.loyalty * 100) / 100}`);
console.log(s.mercenaries.filter((m) => m.affiliation.kind === 'guild').map((m) => `${m.name} Lv${m.level} exp${m.exp}${m.injury ? ' 부상' : ''}`).join('\n'));

console.log('\n용병별 출전');
const totalSorties = [...sorties.values()].reduce((a, x) => a + x.n, 0);
for (const [id, st] of [...sorties.entries()].sort((a, b) => b[1].n - a[1].n || (a[0] < b[0] ? -1 : 1))) {
  const m = s.mercenaries.find((x) => x.id === id)!;
  console.log(`${m.name}\t출전 ${st.n} (${Math.round((st.n / totalSorties) * 100)}%)\t승 ${st.win}\t승률 ${Math.round((st.win / st.n) * 100)}%`);
}

console.log('\n충성도');
const dist = new Map<string, number>(tables.loyalty.tiers.map((t) => [t.name, 0]));
for (const m of s.mercenaries) if (m.loyalty && m.affiliation.kind === 'guild') dist.set(loyaltyTier(tables, m.loyalty.value).name, (dist.get(loyaltyTier(tables, m.loyalty.value).name) ?? 0) + 1);
console.log(`구간 분포: ${[...dist].map(([k, v]) => `${k} ${v}`).join(', ')}`);
console.log(`거부 ${refusals}회, 이탈 ${departures.length}회${departures.length ? ` (${departures.join(', ')})` : ''}`);
console.log(`대기 하락 ${idleDecays}회, 무소속 이동 ${poaches.length}회${poaches.length ? ` (${poaches.join(', ')})` : ''}`);

console.log('\n거점 시설');
console.log(`레벨: ${tables.facilities.facilities.map((f) => `${f.name} Lv${s.facilities.levels[f.id] ?? 0}`).join(', ')}${s.facilities.construction ? ` (진행 중: ${tables.facilities.facilities.find((f) => f.id === s.facilities.construction!.facilityId)!.name})` : ''}`);
console.log(`훈련 경험치 합계 ${trainingExpTotal}, 미납 ${unpaidDays}일(용병·일 ${unpaidMercDays}), 이탈 ${departures.length}회`);
