# docs

## 구성

- `design/`: 정본 문서의 마크다운 사본 (게임 설계서, 세계관 설정집).
- `design/ui/`: UI 1차 시안(정적 HTML, 확정본), 기준 스크린샷(`shots/ref`), 구역·수치 계약(`contract.json`), 구현 준수 규칙. `index.html`로 한 번에 본다.
- `design/roster-stats-draft.md`/`.json`: 계약자 30명 기본 스탯·특성 슬롯 초안([제안], 016 입력, 사용자 검수 대상).
- `reviews/`: 검수 리포트 (`TEMPLATE.md` 양식).

## 정본과 사본

정본은 claude.ai의 두 문서이고, 이 폴더의 사본은 읽기 전용이다. 사본을 직접 고치지 말고 정본을 고친 뒤 다시 내보낸다.

- 용병 길드 게임 설계서: https://claude.ai/artifact/UmE5rHmJ3Ryt5pmBxnGVXQ → `design/game-design.md`
- 용병 길드 세계관 설정집: https://claude.ai/artifact/8pc36stDwxmQyuKjfVGnD2 → `design/worldbook.md`

## 사본 갱신

문서 화면의 내보내기 메뉴에서 Markdown으로 저장해 위 파일명으로 덮어쓰고 커밋한다. 문서의 변경 로그 마지막 날짜와 사본이 어긋나면 사본이 오래된 것이다.
