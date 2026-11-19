# Render 배포

정적 사이트(서버 없음)로 배포한다. 저장소 루트의 `render.yaml`이 설정이다.

## 처음 연결 (사용자가 한 번)

1. Render 대시보드 → New → Blueprint → 이 GitHub 저장소(`hj0044/arche`)를 고른다.
2. `render.yaml`을 읽어 `arche` 정적 사이트를 만든다. 적용(Apply)한다.
3. 기본 브랜치(`main`)에 머지될 때마다 자동으로 다시 배포된다.

Blueprint 대신 직접 만들 때(New → Static Site) 넣을 값:

| 항목 | 값 |
|---|---|
| Branch | `main` |
| Root Directory | (비움) |
| Build Command | `npm ci && npm run build` |
| Publish Directory | `dist` |
| 환경 변수 | 없음 (Node 버전은 `.node-version`의 22를 쓴다) |

## 참고

- 화면 전환은 앱 안의 상태로만 하고 URL 경로를 쓰지 않으므로 rewrite 규칙이 필요 없다.
- 빌드 결과는 상대 경로(`base: './'`)로 만들어 하위 경로에 올려도 동작한다.
