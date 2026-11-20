// 검수용 고정 세이브(JSON)를 만든다. 검수 리포트 부록의 재현 입력과 같은 상태다.
// 사용: npm run make-audit-save -- [시드] [출력 경로]
// 기본: 시드 audit-20261120, 출력 /tmp/arche-audit-v2.json
import { writeFileSync } from 'node:fs';
import { AUDIT_SEED, makeAuditSaveFile } from '../src/app/auditSave';

const [seed = AUDIT_SEED, out = '/tmp/arche-audit-v2.json'] = process.argv.slice(2);
const file = makeAuditSaveFile(seed);
writeFileSync(out, JSON.stringify(file, null, 2));
console.log(`세이브(v${file.version})를 ${out}에 썼다 (시드 ${seed}, ${file.state.day}일차, 리프트 ${file.state.rifts.length}개)`);
