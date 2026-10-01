# AI 도슨트 (큐레이터즈)

국립민속박물관 상설전시관을 위한 **AI 기반 문화복지 도슨트 웹 서비스**입니다.

앱 설치나 복잡한 QR 오디오 가이드 사용을 어려워하는 관람객도 쉽게 쓸 수 있도록 만듭니다.
관람객은 전시물 번호만 입력하면 다음 기능을 쓸 수 있습니다.

- 수준에 맞춘 설명(쉬운 설명 / 자세한 설명) 보기
- 설명을 소리로 듣기
- AI 도슨트에게 질문하기

## 실행 방법

Node.js 20 이상이 필요합니다. 따로 설치할 패키지는 없습니다.

```bash
npm run dev
```

브라우저에서 http://localhost:3000 을 엽니다.

## 폴더 구조

```
AI도슨트/
├── public/              관람객이 보는 화면 (브라우저로 그대로 전달됨)
│   ├── index.html       첫 화면: 전시물 번호 입력
│   ├── exhibit.html     전시물 설명 화면
│   ├── css/style.css    디자인 (큰 글씨·큰 버튼)
│   ├── js/common.js     공통 기능: 글자 크기 조절, 소리로 듣기
│   ├── js/exhibit.js    전시물 화면 동작
│   └── data/exhibits.json  전시물 정보 (현재 비어 있음)
├── api/                 서버에서 실행되는 코드 (API 키를 다루는 곳)
│   ├── health.js        서버 상태 확인: GET /api/health
│   └── docent.js        AI 도슨트 답변: POST /api/docent (현재 임시 응답)
├── dev-server.js        로컬 개발용 서버 (배포 때는 사용하지 않음)
├── package.json         프로젝트 정보와 실행 명령
├── .env.example         환경변수(API 키) 예시
└── CLAUDE.md            Claude Code가 참고하는 프로젝트 규칙
```

## 전시물 데이터 형식 (예정)

`public/data/exhibits.json`에 아래 형식의 항목을 넣습니다.

```json
[
  {
    "id": "101",
    "name": "전시물 이름",
    "hall": "상설전시관 1관",
    "era": "조선 후기",
    "descriptionEasy": "누구나 이해할 수 있는 짧고 쉬운 설명",
    "descriptionDetail": "역사적 배경을 포함한 자세한 설명"
  }
]
```

## 배포 (Vercel)

1. 이 폴더를 GitHub 저장소에 올립니다.
2. https://vercel.com 에서 GitHub 계정으로 로그인하고 저장소를 Import 합니다.
3. Framework Preset은 **Other**로 두고, 빌드 설정 없이 Deploy를 누릅니다.
4. AI를 연동한 뒤에는 Settings > Environment Variables에 `AI_API_KEY`를 추가합니다.

Vercel은 `public/` 폴더를 웹페이지로, `api/` 폴더를 서버 함수로 자동 인식합니다.

## 진행 상황

- [x] 기본 프로젝트 구조, 화면 뼈대
- [ ] 전시물 데이터 입력
- [ ] AI API 연동 (`api/docent.js`)
- [ ] 맞춤형 콘텐츠 추천
- [ ] 배포
