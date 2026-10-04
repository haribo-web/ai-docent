# AI 도슨트 프로젝트 규칙

국립민속박물관 상설전시관용 AI 도슨트 웹 서비스입니다. 디지털 기기에 익숙하지 않은 관람객(고령층 등)의 문화 접근성을 높이는 것이 목적입니다.
개발 경험이 적은 팀이 짧은 기간(약 6일) 안에 배포하는 프로토타입입니다.

## 기술 스택 (바꾸지 말 것)

- 화면: HTML + CSS + 순수 JavaScript. React 같은 프레임워크나 빌드 도구를 쓰지 않는다.
- 서버: `api/` 폴더의 Vercel 서버리스 함수 (Node.js, ES 모듈, `export default function handler(req, res)`).
- 데이터: `public/data/*.json` 파일. 데이터베이스를 쓰지 않는다.
  - `exhibits.json`은 `작품 정리_정리본.xlsx`에서 `npm run build:data`로 만든다. 직접 고치지 않는다.
- AI: 기본은 Groq 무료 요금제(`api/_lib/groq.js`, fetch로 호출), 예비는 Claude(`api/_lib/claude.js`, `@anthropic-ai/sdk`).
  - 답변 규칙은 `api/_lib/prompt.js` 한 곳에서 관리한다. AI 서비스를 바꿔도 규칙은 그대로 쓴다.
  - `GROQ_API_KEY` → Groq, 없고 `ANTHROPIC_API_KEY`만 있으면 Claude, 둘 다 없으면 "준비 중" 답변.
  - 관람객 질문 내용은 서버 기록(console)에 남기지 않는다.
- 회원가입·로그인·결제 등 개인정보를 받는 기능은 만들지 않는다.
- 배포: Vercel. 로컬 실행은 `npm run dev` (`dev-server.js`).
- npm 패키지는 꼭 필요할 때만 추가한다.

## 코드 작성 규칙

- AI API 키 등 비밀값은 `api/` 안에서 `process.env`로만 읽는다. `public/`에 절대 넣지 않는다.
- 접근성 우선: 글씨는 크게, 버튼은 누르기 쉽게(높이 3rem 이상), 명암 대비를 충분히 한다.
- 화면 문구와 코드 주석은 한국어로, 쉬운 말로 쓴다.
- 공통 기능은 `public/js/common.js`, 페이지별 기능은 `public/js/<페이지>.js`에 둔다.
- 모바일 화면(폭 360px)에서 먼저 확인한다.
