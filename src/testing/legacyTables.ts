// 테스트 전용: 외곽 임무 자동 배치(지시서 022)를 끈 데이터 표. 022 이전 규칙(쉬는 날·유지비·부상)을 고정한 테스트가 쓴다.
// 자동 배치를 끈 동작이 예전과 같아야 한다는 지시서 022 3항의 확인이기도 하다.
import { tables as base, type GameTables } from '../data';

export const legacyTables: GameTables = { ...base, outerMissions: { ...base.outerMissions, autoOuterDefault: false } };
