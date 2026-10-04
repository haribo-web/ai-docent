// Claude API 호출 (서버 안에서만 쓰는 파일)
// API 키는 환경변수 ANTHROPIC_API_KEY 에서 읽는다. (.env 또는 Vercel 환경변수 설정)

import Anthropic from "@anthropic-ai/sdk";
import { ANSWER_RULES, LEVEL_RULES, buildExhibitContext } from "./prompt.js";

// 모델은 환경변수 CLAUDE_MODEL로 바꿀 수 있다. (기본: claude-opus-5-5)
const MODEL = process.env.CLAUDE_MODEL || "claude-opus-5-5";

// 안전 필터가 답변을 거절하면 다른 Claude 모델이 대신 답하게 하는 기능.
// 이 기능을 지원하는 모델에서만 켠다.
const FALLBACK_MODELS = ["claude-opus-5-5", "claude-opus-5", "claude-fable-5-1", "claude-sonnet-5-5"];

let client;
function getClient() {
  // 관람객이 오래 기다리지 않도록 30초 안에 끝나지 않으면 포기하고, 다시 시도는 1번만 한다.
  client ??= new Anthropic({ timeout: 30_000, maxRetries: 1 });
  return client;
}

export async function askClaude({ exhibit, level, question }) {
  const request = {
    model: MODEL,
    max_tokens: 16000,
    // 짧은 해설이라 깊게 생각할 필요가 없다. 답변이 빨라지고 비용도 줄어든다.
    output_config: { effort: "low" },
    system: [
      { type: "text", text: `${ANSWER_RULES}\n\n관람객이 기다리고 있으니 바로 답변을 시작하세요.` },
      {
        type: "text",
        text: `${LEVEL_RULES[level] || LEVEL_RULES.easy}\n\n${buildExhibitContext(exhibit)}`,
        // 같은 전시물·같은 설명 수준의 질문이 이어지면 규칙과 전시물 정보를 저장해 두고 재사용한다(비용 절감).
        // 매번 바뀌는 질문은 이 뒤에 오므로 저장 대상에서 빠진다. 글이 짧으면 저장되지 않을 수 있다(오류 아님).
        cache_control: { type: "ephemeral" },
      },
    ],
    messages: [{ role: "user", content: question }],
  };
  if (FALLBACK_MODELS.includes(MODEL)) {
    request.betas = ["server-side-fallback-2026-07-01"];
    request.fallbacks = "default";
  }

  const response = await getClient().beta.messages.create(request);

  if (response.stop_reason === "refusal") {
    return { answer: null, refused: true };
  }
  const answer = response.content
    .filter((block) => block.type === "text")
    .map((block) => block.text)
    .join("")
    .trim();
  return { answer, refused: false, model: response.model };
}

// Claude 오류를 관람객에게 보여줄 문장과 상태 코드로 바꾼다. (자세한 원인은 서버 기록에만 남김)
export function describeClaudeError(error) {
  if (error instanceof Anthropic.AuthenticationError || error instanceof Anthropic.PermissionDeniedError) {
    return { status: 500, message: "AI 설정에 문제가 있어 답변하지 못했습니다. 관리자에게 알려 주세요.", log: "API 키가 잘못되었거나 권한이 없습니다." };
  }
  if (error instanceof Anthropic.RateLimitError) {
    return { status: 503, message: "지금 질문이 많아 답변이 늦어지고 있습니다. 잠시 후 다시 질문해 주세요.", log: "Claude 사용량 한도 초과" };
  }
  if (error instanceof Anthropic.APIConnectionTimeoutError) {
    return { status: 504, message: "답변이 너무 오래 걸려 멈췄습니다. 다시 질문해 주세요.", log: "Claude 응답 시간 초과" };
  }
  if (error instanceof Anthropic.APIConnectionError) {
    return { status: 503, message: "AI 서버에 연결하지 못했습니다. 잠시 후 다시 시도해 주세요.", log: "Claude 연결 실패" };
  }
  if (error instanceof Anthropic.APIError) {
    const status = error.status >= 500 ? 503 : 500;
    return { status, message: "AI가 답변하지 못했습니다. 잠시 후 다시 시도해 주세요.", log: `Claude API 오류 ${error.status}: ${error.message}` };
  }
  return { status: 500, message: "답변을 만드는 중 문제가 생겼습니다.", log: String(error) };
}
