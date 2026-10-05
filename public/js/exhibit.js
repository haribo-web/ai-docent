// 전시물 상세 페이지: 주소의 ?id= 값(작품 고유 ID, 예: gammoyeojaedo)으로 전시물을 찾아 설명을 보여 준다.
// 예전 임시 번호 주소(?id=901)로 들어와도 같은 작품을 보여 주고, 주소를 고유 ID로 바꿔 둔다.

const params = new URLSearchParams(location.search);
const requestedId = (params.get("id") || "").trim();
let exhibitId = null; // 찾은 작품의 고유 ID. 질문할 때 서버로 보낸다.

const titleEl = document.getElementById("exhibit-title");
const metaEl = document.getElementById("exhibit-meta");
const descriptionEl = document.getElementById("exhibit-description");
const answerEl = document.getElementById("answer");
const questionEl = document.getElementById("question");
const askBtn = document.getElementById("ask-btn");

const MAX_QUESTION_LENGTH = 200; // api/docent.js와 같은 값
let exhibit = null;
let level = "easy";
let asking = false;

// 질문창은 전시물을 찾았을 때만 열어 둔다. (없는 전시물에는 질문할 수 없음)
function setAskEnabled(enabled) {
  questionEl.disabled = !enabled;
  askBtn.disabled = !enabled;
}

function showAnswer(text, isError = false) {
  answerEl.textContent = text;
  answerEl.classList.toggle("answer-error", isError);
}

async function loadExhibit() {
  if (!requestedId) {
    titleEl.textContent = "어떤 작품인지 알 수 없습니다.";
    descriptionEl.textContent = "첫 화면에서 작품 이름으로 찾아 주세요.";
    return;
  }

  try {
    const response = await fetch("/data/exhibits.json");
    if (!response.ok) throw new Error(`exhibits.json ${response.status}`);
    const exhibits = await response.json();
    exhibit =
      exhibits.find((item) => item.id === requestedId) || exhibits.find((item) => item.number === requestedId);
  } catch (error) {
    console.error("전시물 정보를 불러오지 못했습니다:", error);
    titleEl.textContent = "전시물 정보를 불러오지 못했습니다.";
    descriptionEl.textContent = "잠시 후 다시 시도해 주세요.";
    return;
  }

  if (!exhibit) {
    titleEl.textContent = "작품을 찾을 수 없습니다.";
    descriptionEl.textContent = "첫 화면에서 작품 이름으로 다시 찾아 주세요.";
    return;
  }

  exhibitId = exhibit.id;
  if (requestedId !== exhibitId) {
    history.replaceState(null, "", `/exhibit.html?id=${encodeURIComponent(exhibitId)}`); // 예전 번호 주소 → 고유 ID 주소
  }
  document.title = `${exhibit.title} | AI 도슨트`;
  titleEl.textContent = exhibit.title;
  metaEl.textContent = [exhibit.chapter, exhibit.hall].filter(Boolean).join(" · ");
  renderDescription();
  setAskEnabled(true);
}

// 쉬운 설명: 기본 설명만 / 자세한 설명: 기본 설명 + 역사·문화적 배경 + 전시에서의 의미
// (AI 연동 후에는 쉬운 설명을 AI가 관람객 수준에 맞게 다시 써 줄 예정)
function renderDescription() {
  if (!exhibit) return;
  if (level === "easy") {
    descriptionEl.textContent = exhibit.basicDescription;
    return;
  }
  descriptionEl.textContent = [
    exhibit.basicDescription,
    exhibit.historicalContext && `[역사·문화적 배경]\n${exhibit.historicalContext}`,
    exhibit.exhibitionMeaning && `[전시에서의 의미]\n${exhibit.exhibitionMeaning}`,
  ]
    .filter(Boolean)
    .join("\n\n");
}

document.querySelectorAll("[data-level]").forEach((button) => {
  button.addEventListener("click", () => {
    level = button.dataset.level;
    document.querySelectorAll("[data-level]").forEach((b) => b.classList.toggle("active", b === button));
    renderDescription();
  });
});

document.getElementById("speak-btn").addEventListener("click", () => {
  speak(`${titleEl.textContent}. ${descriptionEl.textContent}`);
});

// ── 답변 저장(브라우저 안) ──
// 같은 전시물·같은 설명 수준·같은 질문은 서버와 AI에 다시 보내지 않고 저장해 둔 답을 보여 준다.
// 저장은 이 브라우저 탭 안(sessionStorage)에만 하며, 탭을 닫으면 지워진다. 서버로 보내지 않는다.
const ANSWER_CACHE_KEY = "docentAnswers";
const ANSWER_CACHE_MAX = 50;

// 띄어쓰기와 끝의 물음표·마침표 차이는 같은 질문으로 본다.
function normalizeQuestion(text) {
  return text.trim().replace(/\s+/g, " ").replace(/[?？.!。]+$/, "");
}

function cacheKey(question) {
  return `${exhibitId}|${level}|${normalizeQuestion(question)}`;
}

function readCache() {
  try {
    return JSON.parse(sessionStorage.getItem(ANSWER_CACHE_KEY)) || {};
  } catch {
    return {};
  }
}

function getCachedAnswer(question) {
  return readCache()[cacheKey(question)];
}

function saveCachedAnswer(question, answer) {
  try {
    const cache = readCache();
    cache[cacheKey(question)] = answer;
    const keys = Object.keys(cache);
    for (const old of keys.slice(0, Math.max(0, keys.length - ANSWER_CACHE_MAX))) delete cache[old];
    sessionStorage.setItem(ANSWER_CACHE_KEY, JSON.stringify(cache));
  } catch {
    // 저장할 수 없는 환경(사생활 보호 모드 등)이어도 질문·답변은 정상 동작한다.
  }
}

// 서버 응답 상태에 따라 관람객에게 보여줄 문장을 고른다.
function errorMessage(status, data) {
  if (data?.error && status >= 400 && status < 500) return data.error; // 서버가 알려 준 이유 (빈 질문, 너무 긴 질문 등)
  if (status >= 500) return "서버에 문제가 생겨 답변하지 못했습니다. 잠시 후 다시 시도해 주세요.";
  return "답변을 가져오지 못했습니다. 잠시 후 다시 시도해 주세요.";
}

document.getElementById("ask-form").addEventListener("submit", async (event) => {
  event.preventDefault();
  if (asking || !exhibit) return; // 답변을 기다리는 중에는 다시 보내지 않음

  const question = questionEl.value.trim();
  if (!question) {
    showAnswer("질문을 입력해 주세요.", true);
    return;
  }
  if (question.length > MAX_QUESTION_LENGTH) {
    showAnswer(`질문은 ${MAX_QUESTION_LENGTH}자 이내로 입력해 주세요.`, true);
    return;
  }

  const cached = getCachedAnswer(question);
  if (cached) {
    showAnswer(cached); // 이미 받은 답변 → 서버에 보내지 않음
    return;
  }

  asking = true;
  setAskEnabled(false);
  askBtn.textContent = "답변 준비 중…";
  showAnswer("답변을 준비하고 있습니다…");

  try {
    const response = await fetch("/api/docent", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ exhibitId, level, question }),
    });
    const data = await response.json().catch(() => null); // 응답이 JSON이 아닐 때 대비

    if (response.ok && data?.answer) {
      showAnswer(data.answer);
      if (!data.placeholder) saveCachedAnswer(question, data.answer); // "준비 중" 임시 답변은 저장하지 않음
    } else {
      console.error("질문 요청 실패:", response.status, data);
      showAnswer(errorMessage(response.status, data), true);
    }
  } catch (error) {
    console.error("질문 요청 중 연결 오류:", error);
    showAnswer("인터넷 연결을 확인한 뒤 다시 시도해 주세요.", true);
  } finally {
    asking = false;
    askBtn.textContent = "질문하기";
    setAskEnabled(true);
    questionEl.focus();
  }
});

loadExhibit();
