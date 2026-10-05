# AI 도슨트 (큐레이터즈)

국립민속박물관 상설전시관 3 《한국인의 일생》을 위한 **AI 기반 문화복지 도슨트 웹 서비스**입니다.

앱 설치나 복잡한 QR 오디오 가이드 사용을 어려워하는 관람객도 쉽게 쓸 수 있도록 만듭니다.
관람객은 지금 보고 있는 작품을 **작품 설명판의 이름**이나 **전시 구역**으로 찾은 뒤 다음 기능을 쓸 수 있습니다.
위치정보와 회원가입 없이 이용합니다.

- 수준에 맞춘 설명(쉬운 설명 / 자세한 설명) 보기
- 설명을 소리로 듣기
- AI 도슨트에게 질문하기

## 실행 방법

Node.js 20.10 이상이 필요합니다. 처음 한 번은 패키지를 설치하세요.

```bash
npm install
```

```bash
npm run dev
```

AI 답변을 켜려면 `.env.example`을 복사해 `.env`를 만들고 `GROQ_API_KEY`를 넣은 뒤 서버를 다시 시작하세요.
키가 없으면 AI 대신 "준비 중" 답변이 나옵니다. `api/_lib/`의 파일을 고친 뒤에도 서버를 다시 시작해야 반영됩니다.

AI 답변을 한꺼번에 시험하려면, 개발 서버를 켜 둔 채로 다른 터미널에서 아래를 실행하세요. (질문 목록: `scripts/try-questions.js`)

```bash
npm run try:ai
```

브라우저에서 http://localhost:3000 을 엽니다.

## 폴더 구조

```
AI도슨트/
├── public/              관람객이 보는 화면 (브라우저로 그대로 전달됨)
│   ├── index.html       첫 화면: 작품 이름 검색, 전시 구역 목록
│   ├── exhibit.html     전시물 설명 화면
│   ├── css/style.css    디자인 (큰 글씨·큰 버튼)
│   ├── js/common.js     공통 기능: 글자 크기 조절, 소리로 듣기
│   ├── js/index.js      첫 화면 동작 (이름 검색·구역 목록, 브라우저에서 처리)
│   ├── js/exhibit.js    전시물 화면 동작
│   └── data/exhibits.json  전시물 정보 (엑셀에서 자동 생성, 직접 수정 금지)
├── scripts/build-exhibits.js  엑셀 → exhibits.json 변환 (npm run build:data)
├── data/exhibit-ids.json  작품명 → 고유 ID 목록 (한 번 정하면 고정)
├── research/            자료조사 결과
├── 작품 정리.xlsx         팀 공유 원본 (보존)
├── 작품 정리_정리본.xlsx    정리본 (exhibits.json의 원본)
├── api/                 서버에서 실행되는 코드 (API 키를 다루는 곳)
│   ├── health.js        서버 상태 확인: GET /api/health
│   ├── docent.js        AI 도슨트 답변: POST /api/docent (질문 검사 → AI 호출)
│   └── _lib/            서버 안에서만 쓰는 파일 (웹 주소로 열리지 않음)
│       ├── prompt.js    AI 답변 규칙 ← 답변 말투·범위를 바꾸려면 여기를 고친다
│       ├── groq.js      Groq API 호출 (기본, 무료 요금제)
│       └── claude.js    Claude API 호출 (예비, 유료)
├── dev-server.js        로컬 개발용 서버 (배포 때는 사용하지 않음)
├── package.json         프로젝트 정보와 실행 명령
├── .env.example         환경변수(API 키) 예시
└── CLAUDE.md            Claude Code가 참고하는 프로젝트 규칙
```

## 전시물 데이터

전시물 정보는 팀이 함께 정리한 엑셀 **`작품 정리_정리본.xlsx`**가 원본입니다.
`public/data/exhibits.json`은 이 엑셀에서 자동으로 만들어지므로 **직접 고치지 않습니다.**

엑셀을 고친 뒤에는 아래 명령으로 JSON을 다시 만드세요.

```bash
npm run build:data
```

- 엑셀의 글은 줄이거나 지우지 않고 그대로 옮깁니다.
- **관람객은 작품명으로 작품을 찾습니다.** (작품 설명판의 이름 검색, 전시 구역 목록)
- `id`는 작품마다 고유한 영문 ID입니다. 작품 주소와 AI 요청에 씁니다. (예: 감모여재도 → `/exhibit.html?id=gammoyeojaedo`)
  - 처음 만들 때 작품명을 로마자로 바꿔 정하고 **`data/exhibit-ids.json`에 고정**합니다. 엑셀 행 순서가 바뀌어도 ID는 그대로입니다.
  - ID를 바꾸고 싶으면 `data/exhibit-ids.json`을 고친 뒤 `npm run build:data`를 실행하세요.
  - 엑셀에서 **작품명을 바꾸면 새 ID가 생깁니다.** 예전 ID를 유지하려면 `data/exhibit-ids.json`에서 작품명도 같이 바꿔 주세요.
  - 작품명은 서로 달라야 합니다. (겹치면 변환이 멈춥니다)
- `number`는 예전에 쓰던 임시 번호(챕터 번호 + 순서, 예: `901`)입니다. 예전 주소(`?id=901`)도 열리도록 호환용으로만 남겨 둡니다.

항목 하나의 형식:

```json
{
  "id": "chimtong",
  "number": "702",
  "hall": "상설전시관 3 《한국인의 일생》",
  "chapterNo": 7,
  "title": "작품명",
  "artist": "작가/제작자",
  "chapter": "7부 치유",
  "basicDescription": "기본 설명",
  "workInfo": "작품 정보",
  "historicalContext": "역사·문화적 배경",
  "exhibitionMeaning": "전시에서의 의미",
  "additionalInfo": "추가 정보",
  "expectedQuestions": "예상 질문",
  "sources": "출처 (엑셀 원문 그대로)",
  "sourceUrls": ["출처에서 뽑은 URL 목록"],
  "sourceStatus": "확인됨 | 일부 확인 필요 | 확인 필요",
  "needsReview": true,
  "sourceRow": 33
}
```

- `needsReview`: 내용 어딘가에 '확인 필요'가 있으면 `true`
- `sourceRow`: 엑셀에서 몇 번째 행인지

## 배포 (Vercel)

1. 이 폴더를 GitHub 저장소에 올립니다.
2. https://vercel.com 에서 GitHub 계정으로 로그인하고 저장소를 Import 합니다.
3. Framework Preset은 **Other**로 두고, 빌드 설정 없이 Deploy를 누릅니다.
4. Settings > Environment Variables에 `GROQ_API_KEY`를 추가합니다.

Vercel은 `public/` 폴더를 웹페이지로, `api/` 폴더를 서버 함수로 자동 인식합니다.

## 진행 상황

- [x] 기본 프로젝트 구조, 화면 뼈대
- [x] 전시물 데이터 통합 (37개, 일부 출처 확인 필요)
- [x] AI 연결 코드 (Groq 기본, Claude 예비), 답변 규칙 초안 (`api/_lib/prompt.js`)
- [ ] API 키 발급 후 실제 답변 시험
- [ ] 맞춤형 콘텐츠 추천
- [ ] 배포
