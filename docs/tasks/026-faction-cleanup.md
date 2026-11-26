# 지시서 026: 세력 정리 (세계관 전용으로)

사용자 결정(2026-11-26): 세력은 세계관 전용이다. 게임 수치(영입 비용, 계약자 이동)에 개입하지 않고, 소속 표시·분위기·소개·의뢰 문구·NPC 등장에만 쓴다. 도깨비불 세력은 삭제하고 소속 계약자 6명은 "독립 강자 모임"으로 옮긴다. 불워크 시스템즈를 세력 행으로 추가한다(설정집에 이름이 이미 있음). 설계서 "리그와 세계 확장 > 세력" 절과 AGENTS.md가 정본이다. 이 지시서는 코드와 데이터만 정리한다. 리그, NPC, 도시 확장, 이름 풀은 이 지시서의 범위가 아니다.

## 1. 데이터

1. `src/data/factions.json`
   - `dokkaebi` 행을 지운다.
   - `indie` 행을 추가한다: 이름 "독립 강자 모임", `type: "elite"`, `typeName: "독립 강자 모임"`. 도시 영향력은 지운 dokkaebi 행의 값을 그대로 쓴다.
   - `bulwark` 행을 추가한다: 이름 "불워크 시스템즈", `type: "megacorp"`, `typeName: "메가코프 용병"`. 도시 영향력은 임시로 서울 0.15, 도쿄 0.4, 뉴욕 0.45(합 1).
   - 모든 행에서 `recruitCostMultiplier`를 지운다. `cityInfluence`는 남기되 의미는 "그 세력 인물이 어느 도시에 자주 나오는지를 정하는 연출 가중치"다(`rift.ts`의 선점 영역 표시에 계속 쓰인다). `src/data/index.ts` 타입과 로더에서도 `recruitCostMultiplier`를 지운다.
2. `src/data/roster.json`: `faction: "dokkaebi"`인 계약자 6명을 `"indie"`로 바꾼다. 같은 값이 있는 `docs/design/roster-phase1.csv`(`import-roster`의 입력)와 `docs/design/roster-v2-draft.json`, `src/ui/fixtures/ui-mock.json`(`factionId`, `territoryFactionId`)도 같은 값으로 바꾼다. CSV의 세력 칸은 "도깨비불"을 "독립 강자 모임"으로 바꾼다. 계약자 이름·스탯·역할은 그대로 둔다.
3. `src/data/rift-preemption.json`의 `territoryExcludeFactions`와 다른 표에서 `dokkaebi`를 가리키는 곳이 있으면 `indie`로 바꾼다(`grep -rn "dokkaebi"`로 전부 확인).

## 2. 규칙 변경

1. **영입 비용**: `src/engine/game.ts`의 영입 비용 계산에서 세력 배율을 뺀다. 비용 = 기본식(`progression.json` `recruitZeroCost`) × 타향 보정(`otherHometownCostMultiplier`)만 쓴다. 도움말(`help.json`)과 영입 화면에 세력 배율을 설명하는 문구가 있으면 지운다.
2. **무소속 스카우트 이동 폐지**: `poaching.json`을 지우고 `game.ts`의 일일 처리, `DayResult.tsx`의 알림, `data/index.ts`의 타입, 세이브에 저장된 관련 필드(있다면), 관련 테스트(`loyalty-extension.test.ts`, `determinism.test.ts` 등)를 정리한다. 하루 결과에 "무소속 계약자가 다른 세력으로 갔다"는 알림이 더 나오지 않는다.
3. **유지**: 충성도 이탈 시 계약자의 소속이 `free`로 바뀌는 처리는 그대로 둔다(소속 라벨). 영입 화면의 세력 표시·검색·필터는 그대로 둔다. 리프트 선점의 영역 세력 표시와 알림(표시 전용)도 그대로 둔다.
4. 위 두 곳 말고 `faction`·`cityInfluence`가 **수치 계산**에 쓰이는 곳(확률, 비용, 보상, 충성도 계산 등)이 더 있으면 지우지 말고 멈추고 그 위치를 보고한다.

## 3. 세이브

- 세이브 버전을 12로 올린다. v11 → v12 변환: 모든 계약자의 `faction`이 `"dokkaebi"`이면 `"indie"`로 바꾸고, 지운 스카우트 이동 관련 필드는 버린다. 기존 마이그레이션 패턴(`saveSemantics.ts`와 테스트)을 따라 v11 세이브가 열리는 테스트를 추가한다.
- `docs/design/phase1-spec.md`와 `docs/open-questions.md`에 세이브 v12를 기록한다.

## 4. 검증

- 영입 비용이 세력과 무관한지 보는 테스트를 추가한다(같은 계약자를 다른 세력으로 바꿔도 비용이 같다).
- 데이터 무결성 테스트: 모든 `roster.faction`이 `factions.json`에 있다. `dokkaebi`, `도깨비불` 문자열이 코드·데이터·화면 문구에 남지 않는다(`docs/reviews/`와 변경 기록 같은 역사 문서는 제외).
- 경제 영향 확인: `npm run economy-sweep`(또는 `npm run days -- 30`)를 전후로 돌려, 영입 비용 평균과 첫 30일 제로 수지의 변화를 표로 `docs/open-questions.md`에 남긴다. 세력 배율 평균이 약 1.04였으므로 변화는 ±5% 안일 것으로 본다. 벗어나면 보고한다(조정은 하지 않는다).
- 보존 기준: `npm run balance -- 400`(016 ±5%p, M3 보호선)이 그대로다. `npm test`, `typecheck`, `build`, `ui:check` 통과.
- UI 시안 문구가 바뀌는 곳(영입 화면의 세력 이름 등)이 있으면 `docs/design/ui/`의 시안과 `contract.json`도 같은 값으로 맞춘다. 화면 구성은 바꾸지 않는다.

## 5. 하지 않는 것

리그·NPC·시즌 구현, 도시 확장, 이름 풀, 세력 표시 UI 개편, 새 세력 수치, 계약자 이름·스탯 조정, 019.

## 6. 완료 조건: 머지와 배포까지 (docs/tasks/README.md 규칙, 이 지시서의 일부)

1. 위 검사가 통과한 PR을 연다(테스트, 타입 검사, 빌드, `ui:check`).
2. 사용자 확인을 기다리지 않고 바로 `main`에 머지한다. 결정이 필요한 항목은 PR 본문과 `docs/open-questions.md`에 적되 머지를 막지 않는다.
3. Render 배포가 `live`가 된 것을 확인한다. 실패하면 고쳐 다시 머지한다.
4. 최종 보고는 "배포 완료", 배포 커밋, 경제 영향 표, 4절 규칙 외에 발견한 세력 수치 개입 위치, 미해결 결정 목록으로 한다.
