# 026c — 세력 10개, 무소속은 세력이 아닌 상태 (Claude Code)

사용자 확정(2026-11-26): 세력을 10개로 늘리고, 웨이포인트 컴퍼니를 세력에서 뺀다. 무소속은 세력이 아니라 "소속이 없는 상태"다. 세력은 계속 세계관 전용이다(게임 수치에 개입하지 않음). 변경 이유는 설계서·설정집 변경 기록에 적혀 있다. 코드와 데이터를 문서에 맞춘다. 세력 이름과 유형 표기는 `docs/design/world-brief-for-data.md` 3절이 정본이다.

## 1. 세력 표 (`src/data/factions.json`)

10행으로 바꾼다. `waypoint`, `free` 행은 지운다.

| id | 이름 | type | typeName |
|---|---|---|---|
| rrb | 리프트 대응국 | public | 공공기관 용병 |
| archon | 아르콘 에너지 | megacorp | 메가코프 용병 |
| bulwark | 불워크 시스템즈 | megacorp | 메가코프 용병 |
| indie | 에지 서클 | elite | 독립 강자 모임 |
| lantern | 랜턴 자경단 | vigilante | 주민 자경단 |
| prism | 프리즘 메디컬 | medical | 의료·연구 기관 |
| rose | 장미 가문회 | noble | 기사 가문 연합 |
| beacon | 비컨 방송 | media | 방송·중계 |
| anchor | 앵커 항만조합 | harbor | 항만·항로 조합 |
| gray | 그레이 거래소 | underworld | 회색지대 거래 |

- `indie`의 id는 그대로 두고 이름만 "에지 서클"로 바꾼다("독립 강자 모임"은 typeName으로 남는다). 화면과 데이터 문자열에서 옛 이름 "독립 강자 모임"이 세력 이름으로 쓰이는 곳은 새 이름으로 바꾼다(typeName은 제외).
- `cityInfluence`는 지금 도시가 3곳이라 서울·도쿄·뉴욕 값만 둔다(세력별 합 1.0). 새 6개 세력 값은 임시로 방향만 맞게 채운다(예: 랜턴은 서울 0.3·도쿄 0.2·뉴욕 0.5가 아니라 균등에 가깝게). 9도시 값은 D04 데이터를 도시 확장 때 연결하며 바꾼다. 영역 세력 표시(`pickTerritoryFaction`)는 그대로 쓴다.

## 2. 무소속 = 세력 없음

- 무소속은 세력 행이 아니다. 계약자 소속이 `guild`(우리 길드)도 `faction`(세력)도 아닌 상태를 하나 둔다(구현은 구현자가 정한다. 예: `affiliation.kind: 'unaffiliated'`). 로스터 데이터에서 `faction: "free"`였던 계약자는 이 상태로 바뀐다.
- 충성도 이탈로 길드를 떠난 계약자는 이 상태가 된다(지금 `free` 라벨로 바꾸던 처리와 같은 결과).
- 화면 표시는 "무소속". 영입 화면 필터에는 "무소속" 칩을 항상 따로 둔다(세력 칩과 구분, 소속 계약자가 있을 때만 보이는 규칙은 세력 칩에만 적용).
- 선점 영역 세력 후보에서는 빠진다(`rift-preemption.json`의 `territoryExcludeFactions: ["free"]`는 지우고, 세력 행이 없으니 후보에 원래 없다).
- 데이터 무결성: `roster`의 `faction` 값은 세력 id이거나 `null`(무소속)이다. `"free"`, `"waypoint"`, `"dokkaebi"` 문자열이 코드·데이터·화면에 남지 않는다(`docs/reviews/`와 변경 기록 문서는 예외).

## 3. 데이터 옮기기

### 로스터 36명
- `rrb` 7, `archon` 6, `indie` 6은 그대로다.
- `free` 7명은 `null`(무소속)로 바꾼다.
- `waypoint` 6명은 새 세력 6개(lantern, prism, rose, beacon, anchor, gray)에 한 명씩 나눈다. 계약자의 배경·고향·역할·분위기에 어울리게 고르고(예: heir는 rose, researcher는 prism, citizen은 lantern), 바꾼 목록을 PR 본문에 표로 적는다. 애매하면 임시로 정하고 `docs/open-questions.md`에 남긴다(임시 캐릭터라 나중에 바뀐다).
- `bulwark`는 계약자 0명이어도 된다.
- CSV 초안(`docs/design/roster-phase1.csv` 등), `roster-v2-draft.json`, UI 픽스처를 같은 값으로 맞춘다.

### NPC 팀 (`src/data/league/teams.json`, 028a가 이미 읽는다)
`faction` 값만 바꾼다. 다른 필드, 명단, 점수는 건드리지 않는다.
- 설정 14팀: oboro·rambualle·roundtable·ash-oath·ingonyama·vajra·corvo-nero → `indie`, refining-guard → `archon`, bulwark-regiment → `bulwark`, response-mobile → `rrb`, joint-special → `rrb`, healing-battalion → `prism`, observation-unit → `beacon`, waypoint-main → `null`(무소속, 팀 이름은 그대로).
- 민간 25팀(지금 waypoint 8, free 17): 팀 컨셉과 거점 도시에 어울리는 세력으로 나눈다. 목표는 lantern 5, anchor 3, gray 3, rose 2, beacon 2, prism 2, 나머지 8팀은 `null`(무소속). 바꾼 목록을 PR 본문에 표로 적는다.
- `league.test.ts`와 `src/data/league/README.md`의 세력 설명·분포 검사를 새 값에 맞춘다. 데이터 지시서 규칙(데이터 작성자의 파일을 건드리면 안 됨)의 예외로 이번에만 허용한다(세력 id가 없어져서 테스트가 깨지는 것을 막기 위해).

## 4. 세이브

- 세이브 버전을 하나 올린다(현재 14 → 15). AGENTS.md 규칙에 따라 마이그레이션 없이 옛 버전은 "지원하지 않는 세이브"로 거절한다. 삭제한 세력 id(`waypoint`, `free`)가 들어 있는 세이브 거절 검사를 둔다.

## 5. 검증

- 세력이 정확히 10개이고 id가 위와 같다. 모든 세력 `cityInfluence` 합이 1.0이다.
- 로스터와 NPC 팀의 소속이 세력 id 10개 중 하나이거나 `null`이다.
- 영입비·충성도·점수는 세력과 무관하다(기존 테스트 유지). `balance 400`과 전투 결과는 그대로다.
- 영입 화면: 세력 칩은 소속 계약자가 있는 세력만(지금 bulwark만 비어 있음), "무소속" 칩은 따로 있다. 390×844 스크린샷을 갱신하고 `contract.json`·시안 문구(세력 이름)를 같은 값으로 맞춘다. 화면 구성은 바꾸지 않는다.
- `npm test`, `typecheck`, `build`, `ui:check` 통과.
- 문서: `docs/design/phase1-spec.md`, `docs/open-questions.md`에 세이브 v15와 세력 정리를 기록한다.

## 6. 하지 않는 것

도시 확장(9곳), D04 데이터 연결, 세력별 문구·소개 확장, 세력 수치 개입, 이름 풀·NPC 명단 수정(팀의 `faction` 필드 제외).

## 7. 완료 조건: 머지와 배포까지 (docs/tasks/README.md 규칙, 이 지시서의 일부)

1. 위 검사가 통과한 PR을 연다(테스트, 타입 검사, 빌드, `ui:check`).
2. 사용자 확인을 기다리지 않고 바로 `main`에 머지한다. 결정이 필요한 항목은 PR 본문과 `docs/open-questions.md`에 적되 머지를 막지 않는다.
3. Render 배포가 `live`가 된 것을 확인한다. 실패하면 고쳐 다시 머지한다.
4. 최종 보고는 "배포 완료", 배포 커밋, 로스터·NPC 팀 소속 변경 표, 미해결 결정으로 한다.
