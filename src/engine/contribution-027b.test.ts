// 지시서 027b: 활약도 기준값을 역할 × 레벨 구간으로. 표본 평균 100, 레벨 편향
import { describe, expect, it } from 'vitest';
import { tables } from '../data';
import { sampleBand, SAMPLE_SEED } from '../../scripts/contribution-baseline';
import { sortieScore } from './contribution';

const roles = tables.roles.filter((r) => r.enabled).map((r) => r.id);
const meanScores = (fights: ReturnType<typeof sampleBand>) => {
  const sum: Record<string, number> = {};
  const n: Record<string, number> = {};
  for (const f of fights)
    for (const a of f.allies) {
      sum[a.role] = (sum[a.role] ?? 0) + sortieScore(tables, a.role, f.level, a.tally)!;
      n[a.role] = (n[a.role] ?? 0) + 1;
    }
  return Object.fromEntries(roles.map((r) => [r, sum[r] / n[r]]));
};

describe('027b 레벨 구간 기준값', () => {
  it('기준값을 뽑은 표본과 같은 조건에서 구간별·역할별 활약도 평균은 100 ± 5', () => {
    const per = tables.contribution.baselineSample!.fightsPerBand;
    for (const band of tables.contribution.levelBands) {
      const m = meanScores(sampleBand(tables, band, per, SAMPLE_SEED));
      for (const r of roles) expect(Math.abs(m[r] - 100), `${band.id} ${r} ${m[r].toFixed(1)}`).toBeLessThanOrEqual(5);
    }
  }, 120_000);

  it('레벨 편향: 같은 역할의 Lv15·40·65가 각자 구간에 맞는 상대와 싸운 표본에서 활약도 평균이 서로 ±20% 안', () => {
    const at = (level: number) => meanScores(sampleBand(tables, tables.contribution.levelBands.find((b) => level >= b.min && level <= b.max)!, 600, 'bias-check', level));
    const rows = [15, 40, 65].map(at);
    for (const r of roles) {
      const vals = rows.map((x) => x[r]);
      const avg = vals.reduce((a, x) => a + x, 0) / vals.length;
      for (const v of vals) expect(Math.abs(v / avg - 1), `${r}: ${vals.map((x) => x.toFixed(0)).join('/')}`).toBeLessThanOrEqual(0.2);
    }
  }, 60_000);
});
