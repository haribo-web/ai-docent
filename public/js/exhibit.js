// 전시물 상세 페이지: 주소의 ?id= 값으로 전시물을 찾아 설명을 보여 준다.

const params = new URLSearchParams(location.search);
const exhibitId = params.get("id");

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
  if (!exhibitId) {
    titleEl.textContent = "전시물 번호가 없습니다.";
    return;
  }

  try {
    const response = await fetch("/data/exhibits.json");
    if (!response.ok) throw new Error(`exhibits.json ${response.status}`);
    const exhibits = await response.json();
    exhibit = exhibits.find((item) => String(item.id) === exhibitId);
  } catch (error) {
    console.error("전시물 정보를 불러오지 못했습니다:", error);
    titleEl.textContent = "전시물 정보를 불러오지 못했습니다.";
    descriptionEl.textContent = "잠시 후 다시 시도해 주세요.";
    return;
  }

  if (!exhibit) {
    titleEl.textContent = `${exhibitId}번 전시물`;
    descriptionEl.textContent = "아직 설명이 준비되지 않은 전시물입니다.";
    return;
  }

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
