// 전시물 상세 페이지: 주소의 ?id= 값으로 전시물을 찾아 설명을 보여 준다.

const params = new URLSearchParams(location.search);
const exhibitId = params.get("id");

const titleEl = document.getElementById("exhibit-title");
const metaEl = document.getElementById("exhibit-meta");
const descriptionEl = document.getElementById("exhibit-description");
const answerEl = document.getElementById("answer");

let exhibit = null;
let level = "easy";

async function loadExhibit() {
  if (!exhibitId) {
    titleEl.textContent = "전시물 번호가 없습니다.";
    return;
  }

  const response = await fetch("/data/exhibits.json");
  const exhibits = await response.json();
  exhibit = exhibits.find((item) => String(item.id) === exhibitId);

  if (!exhibit) {
    titleEl.textContent = `${exhibitId}번 전시물`;
    descriptionEl.textContent = "아직 설명이 준비되지 않은 전시물입니다.";
    return;
  }

  titleEl.textContent = exhibit.name;
  metaEl.textContent = [exhibit.hall, exhibit.era].filter(Boolean).join(" · ");
  renderDescription();
}

function renderDescription() {
  if (!exhibit) return;
  descriptionEl.textContent = level === "easy" ? exhibit.descriptionEasy : exhibit.descriptionDetail;
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

document.getElementById("ask-form").addEventListener("submit", async (event) => {
  event.preventDefault();
  const question = document.getElementById("question").value.trim();
  if (!question) return;

  answerEl.textContent = "답변을 준비하고 있습니다…";
  try {
    const response = await fetch("/api/docent", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ exhibitId, level, question }),
    });
    const data = await response.json();
    answerEl.textContent = data.answer || data.error;
  } catch {
    answerEl.textContent = "답변을 가져오지 못했습니다. 잠시 후 다시 시도해 주세요.";
  }
});

loadExhibit();
