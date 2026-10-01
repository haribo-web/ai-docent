// AI 도슨트 설명을 만들어 주는 API (아직 AI 연동 전, 임시 응답만 돌려준다)
// 예: POST /api/docent  { "exhibitId": "...", "level": "easy" | "detail", "question": "..." }
//
// 나중에 할 일: 여기서 AI API를 호출한다.
// API 키는 반드시 이 서버 쪽 파일에서만 process.env로 읽고, public/ 폴더에는 절대 넣지 않는다.

export default function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "POST 요청만 가능합니다." });
  }

  const { exhibitId, level = "easy", question } = req.body || {};
  if (!exhibitId) {
    return res.status(400).json({ error: "exhibitId가 필요합니다." });
  }

  res.status(200).json({
    exhibitId,
    level,
    question: question || null,
    answer: "AI 도슨트 기능은 준비 중입니다.",
    placeholder: true,
  });
}
