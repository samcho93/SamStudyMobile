# samStudyMobile

[SamStudy](https://github.com/samcho93/SamStudy) 허브의 **모바일 웹앱(PWA)** 입니다. 폰 홈 화면에 앱으로 설치해 강좌를 전체 화면으로 봅니다.
허브가 게시한 `site-config.json`(강좌 목록)과 `access-config.json`(사용자·권한)을 그대로 읽으므로, **허브를 고치면 이 앱에도 바로 반영**됩니다. 허브 쪽은 수정할 필요가 없습니다.

## 기능

- 허브와 같은 계정으로 로그인 (`sha256("samstudy|아이디|비밀번호")`), 사용자별 숨김 강좌(`deny`) 적용
- 학습 그룹 칩(프로그래머, AI 학습자, …), 강좌 검색, 섹션 접기/펼치기
- ★ 즐겨찾기, 최근 본 강좌 (이 기기에만 저장)
- 강좌를 앱 안에서 열기 (뒤로 가기·다시 불러오기·브라우저로 열기). `external` 강좌는 새 탭으로 엽니다
- 오프라인: 마지막으로 받은 강좌 목록과 사용자 목록을 저장해 두고 대신 사용

## 배포 (GitHub Pages)

저장소 **Settings → Pages → Deploy from branch → `main` / `/ (root)`**. 주소는 `https://samcho93.github.io/samStudyMobile/` 형태입니다.
(Private 저장소의 Pages는 유료 요금제에서만 가능합니다. 코드에 비밀 값이 없으므로 Public으로 둬도 안전합니다.)

## 허브 주소 설정

기본값은 `https://samcho93.github.io/SamStudy/` 입니다. 허브가 다른 주소에 배포되어 있다면 앱의 **설정 → 허브 주소**에서 바꾸세요.
허브 주소에서 `site-config.json`, `access-config.json`을 CORS로 읽을 수 있어야 합니다. (GitHub Pages와 Cloudflare Pages는 기본으로 가능합니다.)

## 알아둘 점

- 허브와 마찬가지로 로그인은 **화면을 가리는 용도**입니다. 강좌 주소를 아는 사람은 직접 열 수 있습니다.
- 강좌 사이트를 iframe으로 보여 줍니다. 강좌가 프레임 안에서 열리지 않으면 상단 ↗ 버튼으로 브라우저에서 여세요.
- 접속 기록(Google 시트)과 허브의 화면 편집·사용자 관리는 이 앱에 없습니다. 그건 허브에서 합니다.

## 개발

정적 파일뿐이라 빌드가 필요 없습니다.

```
js/hub.js      허브 설정 불러오기·캐시
js/auth.js     로그인·세션
js/catalog.js  권한·그룹·검색·즐겨찾기 필터
js/app.js      화면 (로그인, 홈, 강좌 뷰어, 설정)
sw.js          앱 껍데기 오프라인 캐시
```

```bash
npm test          # 로그인·필터·허브 캐시 테스트
npm run serve     # http://localhost:8080
```
