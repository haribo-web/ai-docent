// 모든 페이지에서 함께 쓰는 기능: 글자 크기 조절, 음성으로 읽어 주기

const FONT_MIN = 16;
const FONT_MAX = 32;
const FONT_STEP = 2;

function getSavedFontSize() {
  try {
    return Number(localStorage.getItem("fontSize")) || 20;
  } catch {
    return 20;
  }
}

function applyFontSize(size) {
  document.documentElement.style.setProperty("--font-size", `${size}px`);
  try {
    localStorage.setItem("fontSize", size);
  } catch {
    // 저장이 안 돼도 화면에는 적용됨
  }
}

applyFontSize(getSavedFontSize());

document.querySelectorAll("[data-font]").forEach((button) => {
  button.addEventListener("click", () => {
    const step = button.dataset.font === "up" ? FONT_STEP : -FONT_STEP;
    const next = Math.min(FONT_MAX, Math.max(FONT_MIN, getSavedFontSize() + step));
    applyFontSize(next);
  });
});

// 브라우저에 내장된 음성 합성(TTS)으로 글을 읽어 준다. 별도 비용 없음.
function speak(text) {
  if (!("speechSynthesis" in window)) {
    alert("이 기기에서는 소리로 듣기를 지원하지 않습니다.");
    return;
  }
  window.speechSynthesis.cancel();
  const utterance = new SpeechSynthesisUtterance(text);
  utterance.lang = "ko-KR";
  utterance.rate = 0.9; // 조금 천천히
  window.speechSynthesis.speak(utterance);
}
