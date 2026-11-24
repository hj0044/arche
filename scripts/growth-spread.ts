// 지시서 021: 레벨별 계약자 스탯 분포. 역할마다 같은 역할 안의 최대/최소 비율을 성장률 적용 전(기본 성장률)과 후로 비교하고,
// 체력·물리방어가 가장 잘 크는 계약자가 갈리는지 본다. 특성·충성도는 빼고 기본 스탯 × 레벨 성장만 쓴다.
// 사용: npm run growth-spread -- [레벨,레벨,...]
import { CORE_STATS, tables, type CoreStatId } from '../src/data';
import { statsAtLevel } from '../src/engine/stats';

const levels = (process.argv[2] ?? '1,30,50').split(',').map(Number);
const roles = tables.roles.filter((r) => r.enabled).map((r) => r.id);
const name = (id: string) => tables.roster.find((r) => r.id === id)!.shortName;
const statName = (id: string) => tables.stats.stats.find((s) => s.id === id)!.name;

console.log(['역할', '레벨', ...CORE_STATS.map((s) => `${statName(s)} 최대/최소(전→후)`), '체력 1위', '물리방어 1위'].join('\t'));
for (const role of roles) {
  const rows = tables.roster.filter((r) => r.role === role);
  for (const L of levels) {
    const lv = (r: (typeof rows)[number]) => Math.min(L, r.growth.cap);
    const before = rows.map((r) => ({ id: r.id, s: statsAtLevel(tables, r.baseStats!, lv(r)) }));
    const after = rows.map((r) => ({ id: r.id, s: statsAtLevel(tables, r.baseStats!, lv(r), 1, r.growthRates) }));
    const spread = (list: typeof after, k: CoreStatId) => {
      const v = list.map((x) => x.s[k]);
      return Math.max(...v) / Math.min(...v);
    };
    const top = (k: CoreStatId) => after.reduce((a, b) => (b.s[k] > a.s[k] ? b : a)).id;
    console.log([role, L, ...CORE_STATS.map((k) => `${spread(before, k).toFixed(2)}→${spread(after, k).toFixed(2)}`), name(top('hp')), name(top('pDef'))].join('\t'));
  }
}
