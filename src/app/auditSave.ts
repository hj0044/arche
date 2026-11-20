// 검수용 고정 세이브. scripts/make-audit-save.ts와 테스트가 같은 함수를 쓴다.
import { tables } from '../data';
import { newGame } from '../engine/game';
import { createSaveFile, type SaveFile } from '../storage/saveFile';

export const AUDIT_SEED = 'audit-20261120';

export function makeAuditSaveFile(seed: string = AUDIT_SEED): SaveFile {
  const state = newGame(tables, {
    seed,
    guildName: '검수 길드',
    baseCityId: 'seoul',
    protagonist: { mode: 'opener', name: '검수자', element: 'fire', role: 'warrior', background: 'survivor' },
  });
  // 저장 시각을 고정해 같은 시드면 파일 내용도 같게 한다.
  return createSaveFile(state, 'manual', new Date('2026-11-20T00:00:00Z'));
}
