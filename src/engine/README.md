# engine

화면과 분리된 순수 규칙 로직(전투, 진행). DOM, React, 저장소에 의존하지 않는다.
수치는 `src/data/`의 표(`GameTables`)를 인자로 받아 쓰고, 난수는 시드 기반 생성기(`rng.ts`)만 쓴다.

- `rng.ts`: 시드 난수(mulberry32). 상태를 꺼내 세이브에 넣을 수 있다.
- `unit.ts`: 공통 유닛 틀. 용병과 몬스터가 같은 틀을 쓰고 차이는 데이터 필드로 둔다.
- `combat.ts`: 턴제 자동 전투. `resolveCombat(tables, { allies, enemies, seed })` → 결과와 구조화된 이벤트 로그.
- `injury.ts`: 쓰러진 용병의 부상 판정.
- `samples.ts`: 확인용 샘플 파티·몬스터.

샘플 전투 로그 보기: `npm run sim -- [시드] [몬스터 레벨] [몬스터 등급]`

## 전투 로그 이벤트

| type | 내용 |
|---|---|
| `start` | 참가 유닛 스냅샷(키 a0.. / e0.., 열, 체력, 반대 열 여부), 양측 구성 배율 |
| `round` | 라운드 번호와 행동 순서 |
| `action` | 행동 유닛, 스킬, 효과 목록(피해·회복·상태, 피해 후 체력, 상성 배율, 쓰러짐) |
| `expire` | 버프·도발 만료 |
| `end` | 결과(victory/defeat/retreat)와 라운드 수 |
