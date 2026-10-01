// 서버가 정상 동작하는지 확인하는 API
// 예: GET /api/health

export default function handler(req, res) {
  res.status(200).json({ ok: true, service: "ai-docent" });
}
