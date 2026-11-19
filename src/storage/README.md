# storage

- `saveFile.ts`: 버전 번호가 붙은 JSON 세이브 형식(`format: "arche-save"`, `version`). 옛 버전은 `MIGRATIONS`로 올린다.
- `repository.ts`: `SaveRepository` 인터페이스(get/put/delete/list)와 메모리 구현. 서버 저장은 이 인터페이스를 구현하면 된다.
- `indexedDb.ts`: 브라우저 IndexedDB 구현(용량이 커서 슬롯 무제한에 맞음).
- `saveService.ts`: 슬롯 규칙. 슬롯마다 수동 저장 1개(덮어쓰기는 확인 필요) + 자동 저장 최근 3개 순환, 파일 내보내기·불러오기.
- `quota.ts`: 저장 용량 사용률(가까워지면 화면에서 내보내기 안내).
