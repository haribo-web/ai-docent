// AI 도슨트에게 질문하는 API
// 예: POST /api/docent  { "exhibitId": "gammoyeojaedo", "level": "easy" | "detail", "question": "..." }
// exhibitId는 작품 고유 ID다. 예전 임시 번호(예: "901")로 와도 같은 작품을 찾는다(호환용).
//
// 검사를 통과한 질문만 AI에게 보낸다. (답변 규칙: _lib/prompt.js)
// - GROQ_API_KEY가 있으면 Groq (_lib/groq.js) ← 기본
// - 없고 ANTHROPIC_API_KEY만 있으면 Claude (_lib/claude.js) ← 예비
// - 둘 다 없으면 AI를 부르지 않고 "준비 중" 답변을 돌려준다.
// API 키는 반드시 서버 쪽 파일에서만 process.env로 읽고, public/ 폴더에는 절대 넣지 않는다.

// 배포(Vercel)에서도 파일을 확실히 찾도록 경로로 읽지 않고 코드에서 바로 불러온다.
// (exhibits.json을 다시 만들었다면 개발 서버를 재시작해야 반영된다)
import { createHash, randomBytes } from "node:crypto";
import exhibits from "../public/data/exhibits.json" with { type: "json" };
import { askClaude, describeClaudeError } from "./_lib/claude.js";
import { askGroq, describeGroqError } from "./_lib/groq.js";

function pickAi() {
  if (process.env.GROQ_API_KEY) return { ask: askGroq, describeError: describeGroqError };
  if (process.env.ANTHROPIC_API_KEY) return { ask: askClaude, describeError: describeClaudeError };
  return null;
}

export const MAX_QUESTION_LENGTH = 200;
const LEVELS = ["easy", "detail"];

// 같은 사람이 너무 자주 질문하지 못하게 막는다. (AI 사용료 보호)
// 개인정보 보호: IP 주소는 그대로 보관하지 않고, 되돌릴 수 없는 값(해시)으로 바꾼 뒤 1분 동안만 메모리에 둔다.
// 해시에 섞는 비밀값은 서버가 켜질 때마다 새로 만들어서, 서버가 다시 켜지면 이전 기록과 연결할 수 없다.
// 위치정보(GPS 등)는 받지 않는다. 서버가 여러 대로 나뉘면 대략적으로만 동작한다.
const RATE_LIMIT = 10; // 1분에 최대 10번
const RATE_WINDOW_MS = 60 * 1000;
// 개발 서버는 요청마다 이 파일을 새로 불러오므로, 기록은 파일 밖(globalThis)에 둬야 유지된다.
const recentRequests = (globalThis.__docentRecentRequests ??= new Map());
const HASH_SALT = (globalThis.__docentHashSalt ??= randomBytes(16).toString("hex"));

function visitorKey(req) {
  const forwarded = req.headers["x-forwarded-for"];
  const ip = (typeof forwarded === "string" && forwarded.split(",")[0].trim()) || req.socket?.remoteAddress || "unknown";
  return createHash("sha256").update(HASH_SALT + ip).digest("hex").slice(0, 16);
}

function isRateLimited(key) {
  const now = Date.now();
  const times = (recentRequests.get(key) || []).filter((t) => now - t < RATE_WINDOW_MS);
  times.push(now);
  recentRequests.set(key, times);
  if (recentRequests.size > 1000) {
    for (const [key, list] of recentRequests) {
      if (list.every((t) => now - t >= RATE_WINDOW_MS)) recentRequests.delete(key);
    }
  }
  return times.length > RATE_LIMIT;
}

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "POST 요청만 가능합니다." });
  }

  let body;
  try {
    body = req.body;
  } catch {
    body = undefined; // 배포 환경에서 JSON 형식이 깨진 요청
  }
  if (!body || typeof body !== "object") {
    return res.status(400).json({ error: "요청 형식이 올바르지 않습니다." });
  }

  const requestedId = String(body.exhibitId ?? "").trim();
  const question = typeof body.question === "string" ? body.question.trim() : "";
  const level = LEVELS.includes(body.level) ? body.level : "easy";

  if (!requestedId) {
    return res.status(400).json({ error: "어떤 전시물에 대한 질문인지 알 수 없습니다." });
  }
  const exhibit =
    exhibits.find((item) => item.id === requestedId) || exhibits.find((item) => item.number === requestedId);
  if (!exhibit) {
    return res.status(404).json({ error: "해당 전시물을 찾을 수 없습니다." });
  }
  const exhibitId = exhibit.id; // 응답에는 항상 고유 ID를 돌려준다
  if (!question) {
    return res.status(400).json({ error: "질문을 입력해 주세요." });
  }
  if (question.length > MAX_QUESTION_LENGTH) {
    return res.status(400).json({ error: `질문은 ${MAX_QUESTION_LENGTH}자 이내로 입력해 주세요.` });
  }
  if (isRateLimited(visitorKey(req))) {
    return res.status(429).json({ error: "질문이 너무 많습니다. 1분 뒤에 다시 질문해 주세요." });
  }

  const ai = pickAi();
  if (!ai) {
    return res.status(200).json({
      exhibitId,
      level,
      question,
      answer: `AI 도슨트 기능은 준비 중입니다. ('${exhibit.title}'에 대한 질문을 받았어요.)`,
      placeholder: true,
    });
  }

  try {
    const { answer, refused } = await ai.ask({ exhibit, level, question });
    if (refused || !answer) {
      return res.status(200).json({
        exhibitId,
        level,
        question,
        answer: "죄송해요, 이 질문에는 답하기 어려워요. 전시물에 대해 다른 것을 물어봐 주세요.",
      });
    }
    return res.status(200).json({ exhibitId, level, question, answer });
  } catch (error) {
    const { status, message, log } = ai.describeError(error);
    console.error(`[docent] ${log}`); // 관람객 질문 내용은 기록하지 않는다
    return res.status(status).json({ error: message });
  }
}
