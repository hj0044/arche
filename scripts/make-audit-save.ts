// 검수용 고정 세이브(JSON)를 만든다. 검수 리포트 부록의 재현 입력과 같은 상태다.
// 사용: npm run make-audit-save -- [시드] [출력 경로]
// 기본: 시드 audit-20261120, 출력 /tmp/arche-audit-v2.json
import { writeFileSync } from 'node:fs';
import { tables } from '../src/data';
import { newGame } from '../src/engine/game';
import { createSaveFile } from '../src/storage/saveFile';

const [seed = 'audit-20261120', out = '/tmp/arche-audit-v2.json'] = process.argv.slice(2);

const state = newGame(tables, {
  seed,
  guildName: '검수 길드',
  baseCityId: 'seoul',
  protagonist: { mode: 'opener', name: '검수자', element: 'fire', role: 'warrior', background: 'survivor' },
});
// 저장 시각을 고정해 같은 시드면 파일 내용도 같게 한다.
const file = createSaveFile(state, 'manual', new Date('2026-11-20T00:00:00Z'));
writeFileSync(out, JSON.stringify(file, null, 2));
console.log(`세이브(v${file.version})를 ${out}에 썼다 (시드 ${seed}, ${state.day}일차, 리프트 ${state.rifts.length}개)`);
