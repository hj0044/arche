# 데이터 지시서 D02: NPC 용병단 명단과 대표 인물

대상: GPT/Codex 등 데이터 작성자. **D01의 5개 배치가 모두 머지된 뒤에 시작한다**(문화권 id를 쓰기 때문). 먼저 `docs/design/world-brief-for-data.md`, `docs/tasks/README.md`의 "데이터 지시서" 절, D01을 읽는다.

## 1. 목적

용병단 리그에 나오는 NPC 용병단 39곳의 **명단과 소개**, 그리고 설정이 있는 팀의 **대표 인물**을 만든다. NPC 용병 대부분(약 660명)은 게임이 이름 풀에서 시드로 만들므로 여기서 쓰지 않는다. 이번 작업은 데이터 파일과 검증 테스트만 만든다. 엔진, UI, 기존 데이터는 고치지 않는다.

NPC 용병단은 전투도 판단도 하지 않는 "점수 생성기"다. 따라서 소개 문구는 분위기와 읽는 재미를 위한 것이고, 강하고 약함을 문장으로 확정하지 않는다(등급은 시즌마다 바뀐다).

## 2. 파일

`src/data/league/` 안에 둔다.

### `teams.json` (정확히 39행)
```json
{
  "id": "oboro",
  "name": "오보로",
  "kind": "named",
  "faction": "indie",
  "sizeTier": 1,
  "leagueHint": "top",
  "homeCity": null,
  "concept": "은신과 암습",
  "intro": "달빛이 흐린 밤에만 일을 맡는다고 알려진 소수 정예. 의뢰인의 이름도 묻지 않는다."
}
```
- `id`: 영문 소문자와 하이픈만(예: ash-oath). `name`: 한글 2~10자.
- `kind`: named(아래 3절의 14곳) 또는 civil(민간 용병단 25곳).
- `faction`: rrb, archon, bulwark, waypoint, indie, free 중 하나(세계관 요약 3절).
- `sizeTier`: 1~5(규모 단계, 초기 규모). `leagueHint`: top(격진 후보), upper(강진 후보), mid, lower, any. 이 값은 초기 배치 힌트일 뿐이다.
- `homeCity`: 9개 도시 id 중 하나 또는 null(도시에 묶이지 않음).
- `concept`: 한 줄(30자 이하). `intro`: 1~2문장(100자 이하).

### `featured.json` (대표 인물, 3절의 named 14곳당 2~3명, 총 30~40명)
```json
{
  "id": "oboro-01",
  "teamId": "oboro",
  "name": "시라누이 카논",
  "cultureId": "japan",
  "gender": "f",
  "age": 31,
  "role": "assassin",
  "element": "void",
  "hometown": "tokyo",
  "background": "mercenary_company",
  "post": "대표",
  "oneLine": "말수가 적고 계획이 정확한 암살 전문가.",
  "voice": "짧고 건조하게 말한다."
}
```
- `name`: D01의 해당 문화권(`cultureId`) 이름 풀 스타일에 맞게 한글로 쓴다. 풀에 있는 성·이름을 그대로 쓸 필요는 없지만, 그 문화권에서 자연스러운 이름이어야 한다(실존 인물 이름 조합 금지).
- `gender`: m, f, n. `age`: 20~55. `role`, `element`, `hometown`, `background`은 세계관 요약 2절의 id만 쓴다.
- `post`: 팀 내 직책 한 마디(대표, 부대표, 참모 등, 12자 이하). `oneLine`: 설정 한 줄(60자 이하). `voice`: 말투 한 줄(30자 이하).
- 한 팀의 인물은 역할이 겹치지 않게 하고, 팀 컨셉에 맞는 역할·속성을 고른다(3절 표의 권장 역할 참고). 속성은 한 팀에서 3개 이상 겹치지 않게 한다.
- 국적(`cultureId`)과 고향(`hometown`)은 다를 수 있다. 국적으로 역할·성격을 정하지 않는다. 한 팀 안에서도 국적을 다양하게 쓰되, 팀의 이름 언어와 어울리는 쪽을 조금 더 쓴다.
- 인물의 죽음이나 전사를 쓰지 않는다(세계관 요약 1절).

## 3. 팀 명단

### named 14곳 (초기 규모와 힌트는 고정, 소개·대표 인물은 작성)
| id | 이름 | 세력 | 규모 | 힌트 | 컨셉(참고) | 권장 역할 |
|---|---|---|---|---|---|---|
| oboro | 오보로 | indie | 1 | top | 은신과 암습 | 자객, 기만자 |
| rambualle | 람 부알레 | indie | 1 | top | 신원 불명의 암살단 | 자객, 저격수, 기만자 |
| roundtable | 원탁회 | indie | 4 | top | 소속이 다른 강자 20~30명의 느슨한 독립 모임 | 전 역할 |
| refining-guard | 정제 경비대 | archon | 5 | top | 아르케 정제 시설을 지키는 방어 중심 대부대 | 수호자, 사제, 전술가 |
| ash-oath | 애셔 오스 | indie | 2 | upper | 오래된 맹세에 묶인 베테랑 팀 | 투사, 수호자, 사제 |
| ingonyama | 인고냐마 | indie | 2 | upper | 명예를 건 정면 돌격 | 투사, 수호자 |
| vajra | 바즈라 | indie | 2 | upper | 수련과 의식을 중시하는 집단 | 마도사, 사제, 투사 |
| bulwark-regiment | 방벽 연대 | bulwark | 4 | upper | 중장갑·드론, 장비가 강한 군수 용병 | 수호자, 저격수, 전술가 |
| joint-special | 연합군 특수 중대 | free | 2 | upper | 지구연합군 특수부대 출신 소수 정예 | 투사, 저격수, 전술가 |
| healing-battalion | 치유 대대 | free | 4 | upper | 의료·생명 업종 메가코프 계열, 회복과 지원이 압도적 | 사제, 수호자, 전술가 |
| response-mobile | 대응국 기동대 | rrb | 4 | upper | 규율 잡힌 공무원 용병의 안정적인 대규모 부대 | 수호자, 투사, 전술가 |
| waypoint-main | 웨이포인트 본대 | waypoint | 5 | upper | 민간 용병단을 중개하고 거느리는 거대 민간 업체 | 전 역할 |
| corvo-nero | 코르보 네로 | indie | 2 | mid | 정보와 용병 중개 | 전술가, 저격수, 기만자 |
| observation-unit | 관측 부대 | free | 3 | mid | 정보·AI 업종 메가코프 계열, 정찰·분석·감시 | 전술가, 저격수, 마도사 |

- 이름과 한 줄 컨셉은 이 표를 따른다(바꾸지 않는다). 소개문과 대표 인물을 쓴다. "연합군 특수 중대"는 이름 그대로 쓰고 세력은 free로 둔다(세력 id 없음).
- 업종이 의료·생명, 정보·AI인 팀은 소개 문구에 업종과 모기업의 성격만 적고 구체적인 회사 이름을 지어내지 않는다.

### civil 25곳 (민간 용병단: 우리와 같은 층의 중소 팀, 이름·소개 작성)
- 규모 단계 분포(정확히): 1단계 4곳, 2단계 6곳, 3단계 10곳, 4단계 4곳, 5단계 1곳. `leagueHint`는 any 또는 lower·mid로 쓴다(상위 후보는 named가 맡는다).
- `faction`: waypoint(웨이포인트 제휴) 8곳, free(독립) 17곳.
- `homeCity`: 9개 도시에 가능한 한 고르게(도시마다 2~3곳, 나머지는 null). 팀 이름의 언어·분위기가 도시와 어울리게 한다(예: 런던은 고풍스럽고, 라고스는 거칠고 활기차게).
- 이름은 한글 2~10자의 실제 업종·지명·상징 느낌(수선공, 방파제, 지붕 위, 항구 같은 생활 감각), 외국어를 한글로 적은 이름도 섞는다. 서로 비슷하게 읽히거나 named 14곳과 겹치는 이름을 쓰지 않는다. 현실의 실존 회사·팀 이름을 쓰지 않는다.
- 소개는 팀의 "생활"을 한두 문장으로 보여 준다(어떤 일을 주로 맡는지, 어떤 사람들이 모였는지). 대표 인물은 쓰지 않는다.

## 4. 검증 테스트 (이 지시서에서 코드로 만드는 파일)

`src/data/league/league.test.ts`를 만든다. 다음을 검사한다.
1. `teams.json`은 정확히 39행이고 id가 고유하며 형식이 맞다. named 14, civil 25.
2. `faction`, `sizeTier`, `leagueHint`, `homeCity` 값이 허용 목록 안이다(도시 9개 id 포함, 세력 id는 이 지시서의 6개). `kind`별 규모 분포: 전체 1~5단계가 6, 11, 11, 8, 3곳이고 civil은 4, 6, 10, 4, 1곳.
3. 길이 제한(이름, 컨셉, 소개)을 지킨다.
4. `featured.json`: 모든 `teamId`가 named 팀을 가리키고 팀마다 2~3명, 전체 30~40명. `cultureId`는 `src/data/names/cultures.json`에 있다. `role`은 `src/data/roles.json`, `element`는 `src/data/elements.json`, `background`는 `src/data/backgrounds.json`에 있는 id이고 `hometown`은 9개 도시 id다. 같은 팀에 같은 역할이 두 명 이상 없다.
5. 모든 `text`성 필드(`name`, `concept`, `intro`, `oneLine`, `voice`, `post`)에 영문자가 없다. "사망", "전사", "죽" 같은 단어가 소개와 인물 설정에 없다.

`src/data/league/README.md`에 스키마를 짧게 적는다.

## 5. 하지 않는 것

엔진·UI·기존 데이터 변경, NPC 용병 개개인(660명) 목록 작성, 점수 곡선·시즌 규칙 값(Claude Code가 028에서 정한다), 이세계 팀, 흑막 언급.

## 6. 완료 조건: 머지와 배포까지 (docs/tasks/README.md 규칙, 이 지시서의 일부)

1. `npm test`, `npm run typecheck`, `npm run build`가 통과한 PR을 연다(한 번에 올려도 되고 `teams`와 `featured`를 나눠도 된다).
2. 아직 게임이 읽지 않는 데이터이므로 사용자 확인을 기다리지 않고 바로 `main`에 머지한다. 품질 문제는 머지 뒤에 Claude가 검수해서 수정 요청한다.
3. Render 배포가 `live`가 된 것을 확인한다.
4. 보고는 "배포 완료", 배포 커밋, 막힌 질문 목록으로 한다.
