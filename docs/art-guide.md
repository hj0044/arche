# 그림 교체 안내 (지시서 017)

화면의 그림은 모두 `Art` 부품 하나로 그린다. **`public/art/` 안에 파일만 넣으면** 다음 배포부터 화면이 바뀐다. 코드는 고치지 않는다.

## 경로 규칙

```
public/art/<kind>/<id>.webp   ← 먼저 찾음
public/art/<kind>/<id>.png    ← 없으면
public/art/<kind>/<id>.svg    ← 그것도 없으면
(셋 다 없으면 src/ui/art/fallback/의 임시 SVG)
```

- 순서와 폴더 이름은 `src/data/ui.json`의 `art.basePath`, `art.extensions`에 있다.
- 한 번 실패한 경로는 그 실행 동안 다시 요청하지 않는다.
- 그림은 항상 비율 상자 안에 그려서, 파일이 있든 없든 레이아웃이 움직이지 않는다(지연 로딩).
- `<id>`는 데이터 표의 id 그대로다(영문 소문자·밑줄). 한글 이름이 아니다.

## 종류별 목록

| kind | id | 쓰는 곳 | 비율(가로:세로) | 권장 크기 |
|---|---|---|---|---|
| `portrait` | 계약자 id (`src/data/roster.json`의 `id`) | 계약자 카드·슬롯·아바타·상세 상단·전투 아군 | 1:1 | 512×512 |
| `monster` | 몬스터 id (`src/data/monsters.json`: `void_hound`, `husk_guard`, `spore_spitter`, `rift_caller`, `devourer`, `hollow_herald`) | 전투 재생의 적 | 1:1 | 256×256 |
| `banner` | `rift-<리프트 등급 id>` (`src/data/rift-tiers.json`: `rift-crack`, `rift-gate`, `rift-route`) | 콘텐츠의 리프트 카드 상단 | 350:52 | 1050×156 |
| `banner` | `guild` | 홈 길드 배너 | 350:84 | 1050×252 |
| `banner` | `hq` | 거점 본부 배너 | 350:96 | 1050×288 |
| `banner` | `victory` | 하루 결과의 복귀 결과 배너 | 350:104 | 1050×312 |
| `banner` | `battlefield` | 전투 재생 배경 | 390:520 | 780×1040 |
| `icon` | `facility-<시설 id>` (`src/data/facilities.json`: `facility-infirmary`, `facility-training`, `facility-scout`) | 거점 시설 카드 | 1:1 | 168×168 |
| `icon` | `facility-<곧 열림 카드 id>` (`src/data/ui.json`의 `lockedFacilities`: `facility-workshop`) | 거점 '곧 열림' 카드 | 1:1 | 168×168 |
| `emblem`, `boss` | (예약) | 탑·보스·세력 엠블럼(나중 지시서) | 1:1, 350:110 | — |

비율은 `ui.json`의 `art.ratios`(종류 기본값)와 `art.idRatios`(id별 예외)에 있다. 화면 크기가 다르게 보이면 비율 숫자를 고치지 말고 그림을 그 비율로 다시 자른다.

## 그림 만들 때

- 초상은 얼굴이 가운데 위쪽(세로 40% 근처)에 오게 한다. 카드에서는 정사각, 상세 상단(390×178)에서는 가운데를 잘라 쓴다.
- 배경은 투명하지 않게 채운다(어두운 화면 위에서 테두리가 보이지 않도록).
- 상세 상단과 배너 위에는 글자가 겹치므로 아래쪽 30%는 어둡거나 단순하게 둔다(화면이 그라데이션을 덧씌운다).
- 파일은 webp(품질 80 전후)를 권장한다. 한 장 200KB 이하.

## 확인

1. 파일을 `public/art/<kind>/<id>.webp`로 넣는다.
2. `npm run dev` 후 `/?fixture=ui&screen=merc` 같은 픽스처 화면으로 본다.
3. `npm run ui:shots`로 시안과 나란히 찍어 비교한다. `npm run ui:check`가 통과해야 한다.
