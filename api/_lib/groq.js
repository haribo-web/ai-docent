// Groq API 호출 (서버 안에서만 쓰는 파일, 설치할 패키지 없음)
// API 키는 환경변수 GROQ_API_KEY 에서 읽는다. (.env 또는 Vercel 환경변수 설정)
// 문서: https://console.groq.com/docs

import { buildSystemPrompt } from "./prompt.js";

const API_URL = "https://api.groq.com/openai/v1/chat/completions";

// 모델은 환경변수 GROQ_MODEL로 바꿀 수 있다.
// 예: openai/gpt-oss-120b (기본), openai/gpt-oss-20b, llama-3.3-70b-versatile
const MODEL = process.env.GROQ_MODEL || "openai/gpt-oss-120b";
const TIMEOUT_MS = 30_000; // 관람객이 오래 기다리지 않도록 30초 안에 끝나지 않으면 포기
// 무료 요금제는 1분에 쓸 수 있는 토큰 수가 정해져 있다(gpt-oss-120b: 8,000토큰 ≈ 질문 4개).
// 한도에 걸렸을 때 Groq가 알려 준 대기 시간이 이 값 이하이면 기다렸다가 한 번 더 시도한다.
const MAX_RETRY_WAIT_SECONDS = 8;

export class GroqError extends Error {
  constructor(status, message, retryAfter) {
    super(message);
    this.status = status; // 0이면 연결 실패, -1이면 시간 초과
    this.retryAfter = retryAfter;
  }
}

// 모델이 규칙을 어기고 마크다운 꾸밈(**굵게**, # 제목)을 넣으면 화면과 음성에 그대로 보이므로 지운다.
// 가끔 섞여 나오는 깨진 글자(�)도 지운다.
// 규칙으로 막아도 계속 붙는 "확인되지 않은 부분은 없습니다" 같은 군말 문장도 지운다. (관람객에게 혼란만 줌)
function cleanAnswer(text) {
  return text
    .replace(/�/g, "")
    .replace(/\s*[^.!?。]*확인되지 않(?:은|는) (?:부분|내용)은 없습니다[.!]?/g, "")
    .replace(/\*\*(.+?)\*\*/g, "$1")
    .replace(/^#{1,6}\s+/gm, "")
    .trim();
}

export async function askGroq({ exhibit, level, question }) {
  const body = {
    model: MODEL,
    messages: [
      { role: "system", content: buildSystemPrompt(exhibit, level) },
      { role: "user", content: question },
    ],
    max_completion_tokens: 1024,
    // 낮을수록 매번 비슷하고 전시 데이터에 충실한 답을 한다. (기본값 1은 답이 들쭉날쭉함)
    temperature: 0.2,
  };
  // gpt-oss 모델은 답하기 전에 '생각'을 한다. 짧은 해설이라 생각은 짧게, 답변에는 생각 과정을 넣지 않는다.
  if (MODEL.startsWith("openai/gpt-oss")) {
    body.reasoning_effort = "low";
    body.include_reasoning = false;
  }

  let data;
  try {
    data = await callGroq(body);
  } catch (error) {
    const wait = Number(error.retryAfter);
    if (!(error instanceof GroqError) || error.status !== 429 || !(wait > 0 && wait <= MAX_RETRY_WAIT_SECONDS)) throw error;
    await new Promise((resolve) => setTimeout(resolve, wait * 1000));
    data = await callGroq(body); // 한 번만 다시 시도
  }

  const answer = cleanAnswer(data?.choices?.[0]?.message?.content || "");
  return { answer, refused: false, model: data?.model };
}

async function callGroq(body) {
  let response;
  try {
    response = await fetch(API_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${process.env.GROQ_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
  } catch (error) {
    if (error.name === "TimeoutError") throw new GroqError(-1, "Groq 응답 시간 초과");
    throw new GroqError(0, `Groq 연결 실패: ${error.message}`);
  }

  const data = await response.json().catch(() => null);
  if (!response.ok) {
    throw new GroqError(response.status, data?.error?.message || `HTTP ${response.status}`, response.headers.get("retry-after"));
  }
  return data;
}

// Groq 오류를 관람객에게 보여줄 문장과 상태 코드로 바꾼다. (자세한 원인은 서버 기록에만 남김)
export function describeGroqError(error) {
  if (!(error instanceof GroqError)) {
    return { status: 500, message: "답변을 만드는 중 문제가 생겼습니다.", log: String(error) };
  }
  const log = `Groq 오류 ${error.status}: ${error.message}`;
  if (error.status === 401 || error.status === 403) {
    return { status: 500, message: "AI 설정에 문제가 있어 답변하지 못했습니다. 관리자에게 알려 주세요.", log: "Groq API 키가 잘못되었거나 권한이 없습니다." };
  }
  if (error.status === 429 || error.status === 498) {
    return { status: 503, message: "지금 질문이 많아 답변하지 못했습니다. 1분쯤 뒤에 다시 질문해 주세요.", log: `${log} (무료 사용량 한도, retry-after: ${error.retryAfter})` };
  }
  if (error.status === -1) {
    return { status: 504, message: "답변이 너무 오래 걸려 멈췄습니다. 다시 질문해 주세요.", log };
  }
  if (error.status === 0 || error.status >= 500) {
    return { status: 503, message: "AI 서버에 연결하지 못했습니다. 잠시 후 다시 시도해 주세요.", log };
  }
  return { status: 500, message: "AI가 답변하지 못했습니다. 잠시 후 다시 시도해 주세요.", log };
}
