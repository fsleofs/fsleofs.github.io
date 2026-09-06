# FS Leo 풋살팀 기록 사이트

빌드 도구 없이 순수 HTML/CSS/JS(ES 모듈)로 만든 정적 사이트입니다. Firebase(Firestore + Auth + Storage)를 데이터/인증 백엔드로 쓰고, GitHub Pages로 배포합니다.

## 1. Firebase 프로젝트 만들기

1. https://console.firebase.google.com 에서 새 프로젝트를 만듭니다.
2. **Build > Firestore Database** 에서 데이터베이스를 생성합니다 (프로덕션 모드로 시작해도 됩니다. 규칙은 3단계에서 별도로 배포합니다).
3. **Build > Authentication** 에서 로그인 방법 중 **이메일/비밀번호**를 사용 설정합니다. 그리고 **Users** 탭에서 사용자를 1명 추가합니다.
   - 이메일: `admin@fsleo.local` (코드에 이미 이 이메일로 고정되어 있습니다. 바꾸고 싶다면 `js/firebase-config.js`의 `ADMIN_EMAIL`을 수정하세요)
   - 비밀번호: 관리자 로그인 화면에서 실제로 쓸 비밀번호
4. **Build > Storage** 를 사용 설정합니다 (선수 사진 업로드용).
5. **프로젝트 설정(톱니바퀴) > 일반 > 내 앱** 에서 "웹 앱 추가"(</> 아이콘)를 눌러 웹 앱을 등록하고, 나오는 `firebaseConfig` 객체 값을 복사합니다.

## 2. 이 프로젝트에 설정 붙여넣기

`js/firebase-config.js` 를 열어 `firebaseConfig` 값을 방금 복사한 값으로 교체하세요.

```js
export const firebaseConfig = {
  apiKey: "...",
  authDomain: "...",
  projectId: "...",
  storageBucket: "...",
  messagingSenderId: "...",
  appId: "...",
};
```

> 이 값들은 클라이언트에 공개되는 것이 정상입니다(Firebase 웹 앱 설계상 그렇습니다). 실제 보안은 아래 3단계의 Firestore/Storage 규칙이 담당합니다 — "로그인한 사람만 쓰기 가능, 누구나 읽기 가능" 구조입니다.

## 3. 보안 규칙 배포

[Firebase CLI](https://firebase.google.com/docs/cli)를 설치한 뒤 (Node.js 필요):

```bash
npm install -g firebase-tools
firebase login
firebase init firestore storage   # 기존 firestore.rules / storage.rules 파일을 그대로 쓰겠냐고 물으면 Yes
firebase deploy --only firestore:rules,storage:rules
```

CLI 설치가 번거로우면 Firebase 콘솔의 Firestore/Storage "규칙" 탭에 `firestore.rules`, `storage.rules` 파일 내용을 그대로 붙여넣고 게시해도 됩니다.

## 4. 로컬에서 미리보기

빌드 과정이 없으므로 아무 정적 서버로 열면 됩니다 (파일을 더블클릭해서 `file://`로 열면 브라우저가 ES 모듈을 막으므로 반드시 로컬 서버를 통해 열어야 합니다):

```bash
python -m http.server 8000
```

그리고 브라우저에서 `http://localhost:8000` 접속.

## 5. GitHub Pages 배포

1. 이 폴더로 새 GitHub 저장소를 만들고 push 합니다.
2. 저장소 **Settings > Pages** 에서 Source를 "Deploy from a branch", 브랜치는 `main`, 폴더는 `/ (root)` 로 설정합니다.
3. 몇 분 뒤 `https://<사용자명>.github.io/<저장소명>/` 에서 접속 가능합니다.

라우팅은 해시(`#/dashboard` 등) 기반이라 GitHub Pages의 하위 경로 새로고침 404 문제가 발생하지 않습니다.

## 데이터 구조

- `players/{id}`: `name`, `number`, `position`(`Goleiro`/`Fixo`/`Ala`/`Pivô`/`미정`), `photoUrl`
- `matches/{id}`: `date`, `time`, `venue`, `opponentName`, `quarterCount`, `lineupPlayerIds`
- `matches/{id}/quarters/{quarterNumber}`: `quarterNumber`, `startingLineup`(playerId 배열), `substitutions`(`{time, playerInId, playerOutId}` 배열), `events`(`{time, type, playerId?, assistPlayerId?}` 배열)
  - `time`은 해당 쿼터 시작(0)부터 흐른 **초** 단위입니다. 입력 화면에는 `분:초` 형식으로 표시/입력됩니다.
  - `type`: `득점` / `실점` / `슛` / `허용한 슈팅` / `쿼터 종료`
  - 각 쿼터에는 반드시 `쿼터 종료` 이벤트가 하나 있어야 출전시간이 계산됩니다. 관리자 화면에 경고 문구로 안내됩니다.

승점은 승 3 / 무 1 / 패 0 으로 계산됩니다 (`js/calc.js`의 `POINTS` 상수를 바꾸면 규칙을 변경할 수 있습니다).

## 파일 구조

```
index.html
css/styles.css
js/
  firebase-config.js   # 여기에 본인 Firebase 설정을 채워넣습니다
  firebase.js          # Firebase 초기화 + 로그인/로그아웃
  data.js              # Firestore 읽기/쓰기
  calc.js              # 출전시간/승점/리더보드 계산 로직 (순수 함수)
  util.js              # 날짜/시간 포맷, escapeHtml
  router.js            # 해시 라우터 + 사이드바
  pages/                # 화면별 렌더링 코드
```
