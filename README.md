# samStudyMobile

**irodmas.com**(SamStudy 결제·이용권 사이트)의 **모바일 웹앱(PWA)** 입니다. 폰 홈 화면에 앱으로 설치해 강좌를 전체 화면으로 봅니다.

## 어디서 동작하나

이 앱은 반드시 **irodmas.com 안(`https://irodmas.com/m/`)** 에서 열려야 합니다.
irodmas.com의 로그인 쿠키는 `HttpOnly; SameSite=Lax` 이고 API에 CORS 허용이 없어서, 다른 주소(예: github.io)에 올린 앱은 로그인도 강좌 열기도 할 수 없습니다. 같은 출처에서 열리면 로그인 쿠키·이용권 검사(문지기)가 웹사이트와 똑같이 적용됩니다.

배포는 SamStudy 저장소의 `paygate/public/m/` 에 이 폴더의 내용을 넣는 방식입니다 (Cloudflare가 `paygate/` 를 배포). 이 저장소는 개발·테스트용 원본입니다.

## 기능

- irodmas.com 계정(이메일·비밀번호)으로 로그인, 로그아웃 (회원가입·비밀번호 찾기는 `/login.html` 을 새 탭으로)
- 대문과 같은 규칙으로 표시: 공개 강좌, 내 이용권(이용 중·올패스·관리자)으로 열리는 강좌, 이용권이 필요한 강좌(접힘)
- 분류 칩(강좌·자격증·빌더·시뮬레이터·도구·기타), 강좌 검색, 분야별 접기, ★ 즐겨찾기, 최근 본 강좌
- 강좌를 앱 안에서 열기 — 문지기가 그대로 적용되어 이용권 없는 강좌는 열리지 않음 (잠긴 강좌를 누르면 이용권 페이지 안내)
- 내 정보: 이용권 만료일, 이용권·결제·프로그램·관리자 화면 링크
- 오프라인: 마지막으로 받은 목록 표시 (강좌 자체는 온라인에서만 열림)

## 사용하는 API (모두 기존 것, 서버 수정 없음)

`GET /api/me` · `GET /api/catalog` · `POST /api/auth/login` · `POST /api/auth/logout`

## 개발

정적 파일뿐이라 빌드가 필요 없습니다.

```
js/api.js      irodmas.com API 호출, 오프라인 사본
js/catalog.js  이용권·분류·검색 규칙 (public/index.html 의 canOpen · until 과 같은 규칙)
js/app.js      화면 (로그인, 홈, 강좌 뷰어, 내 정보)
sw.js          앱 껍데기 오프라인 캐시 (앱 폴더 밖과 /api/ 는 가로채지 않음)
```

```bash
npm test      # 열림 규칙·필터·API 오류 처리 테스트
```

## SamStudy 에 반영하기

```bash
# SamStudy 저장소 루트에서
mkdir -p paygate/public/m
cp -r <samStudyMobile>/{index.html,style.css,manifest.webmanifest,sw.js,js,icons} paygate/public/m/
```

`paygate/.gitignore` 의 `public/*/`(빌드가 가져오는 강좌 폴더) 때문에 `public/m/` 이 무시되므로 `!public/m/` 예외가 필요합니다.
