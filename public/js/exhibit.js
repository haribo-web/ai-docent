/* =========================================================
   전시물 설명 화면 동작   (주소 예: exhibit.html?id=101)
   ========================================================= */

/* ---------- [AI 담당과의 약속] 연결 설정 ----------
   AI 코드의 요청·응답 형식이 다르면 이 세 곳만 고치면 됩니다.       */
const DOCENT_API = "/api/docent";

// 보내는 값: 작품명 기준으로 작품 정보를 찾으므로 name 을 보냄 (id 도 함께)
function buildRequest(ex, question) {
  return { name: ex.name, id: ex.id, question };
}

// 받는 값: { answer: "..." } (reply / text / message 로 와도 읽음)
function readAnswer(data) {
  return data.answer || data.reply || data.text || data.message || "";
}
/* ------------------------------------------------- */

const QUICK_QUESTIONS = [
  "이건 무엇에 쓰던 물건이에요?",
  "아이에게 설명하듯 알려 주세요",
  "옛날 사람들은 이걸 어떻게 썼나요?"
];

let exhibits = [];
let ex = null;          // 지금 보고 있는 작품
let mode = "easy";      // "easy" 쉬운 설명 / "detail" 자세한 설명

(async () => {
  const id = (new URLSearchParams(location.search).get("id") || "").trim();
  try { exhibits = await loadExhibits(); } catch (e) { exhibits = []; }

  const idx = exhibits.findIndex((e) => e.id === id);
  if (idx < 0) { $("notFound").hidden = false; return; }

  ex = exhibits[idx];
  document.title = `${ex.name} | 큐레이터즈 AI 도슨트`;
  $("exhibit").hidden = false;

  // 1. 작품 정보
  $("dWhere").textContent = [ex.hall, `${ex.id}번`].filter(Boolean).join(" · ");
  $("dTitle").textContent = ex.name;
  $("dMeta").textContent = ex.era || "";
  renderDesc();
  $("dTitle").focus();

  // 4. AI 빠른 질문 버튼
  QUICK_QUESTIONS.forEach((q) => {
    const b = document.createElement("button");
    b.type = "button";
    b.textContent = q;
    b.onclick = () => askDocent(q);
    $("chips").appendChild(b);
  });

  // 5. 추천: 같은 전시관의 다른 작품 (최대 3개, 바로 다음 작품부터)
  const sameHall = exhibits
    .slice(idx + 1).concat(exhibits.slice(0, idx))
    .filter((e) => e.hall && e.hall === ex.hall)
    .slice(0, 3);
  if (sameHall.length) {
    sameHall.forEach((e) => $("recList").appendChild(recItem(e)));
    $("recBox").hidden = false;
  }

  // 6. 이전 / 다음
  setPager($("prevLink"), exhibits[idx - 1]);
  setPager($("nextLink"), exhibits[idx + 1]);
})();

/* ---------- 2. 설명 (쉬운 / 자세한) ---------- */
function descText() {
  return mode === "easy" ? ex.descriptionEasy : ex.descriptionDetail;
}
function renderDesc() {
  $("tabEasy").setAttribute("aria-selected", mode === "easy");
  $("tabDetail").setAttribute("aria-selected", mode === "detail");
  $("dDesc").innerHTML = "";
  const text = descText() || "설명을 준비하고 있어요.";
  text.split(/\n\s*\n/).forEach((para) => {     // 빈 줄로 문단 나누기
    const p = document.createElement("p");
    p.textContent = para.trim();
    $("dDesc").appendChild(p);
  });
}
$("tabEasy").onclick = () => { Speech.stop(); mode = "easy"; renderDesc(); };
$("tabDetail").onclick = () => { Speech.stop(); mode = "detail"; renderDesc(); };

/* ---------- 3. 소리로 듣기 ---------- */
if (Speech.supported) $("listenBtn").hidden = false;
let speakingWhat = null;   // "desc" 설명 / 답변 버튼
Speech.onChange = (on) => {
  if (!on) speakingWhat = null;
  const descOn = on && speakingWhat === "desc";
  $("listenBtn").setAttribute("aria-pressed", descOn);
  $("listenBtn").textContent = descOn ? "듣기 멈추기" : "소리로 듣기";
  document.querySelectorAll(".a .speak").forEach((b) => {
    b.textContent = on && speakingWhat === b ? "멈추기" : "답변 듣기";
  });
};
$("listenBtn").onclick = () => {
  if (Speech.speaking && speakingWhat === "desc") { Speech.stop(); return; }
  Speech.speak(`${ex.name}. ${descText() || ""}`);
  speakingWhat = "desc";
  Speech.onChange(true);
};

/* ---------- 4. AI 도슨트 질문 ---------- */
$("askForm").onsubmit = (e) => {
  e.preventDefault();
  const q = $("askInput").value.trim();
  if (q) askDocent(q);
};

let busy = false;
async function askDocent(question) {
  if (busy || !ex) return;
  setBusy(true);
  $("askInput").value = "";

  // 질문 말풍선 + 답변 자리
  const q = document.createElement("div");
  q.className = "q";
  q.textContent = question;
  const a = document.createElement("div");
  a.className = "a wait";
  a.textContent = "답을 준비하고 있어요…";
  $("qa").append(q, a);
  a.scrollIntoView({ block: "nearest", behavior: "smooth" });

  try {
    const res = await fetch(DOCENT_API, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(buildRequest(ex, question))
    });
    const data = await res.json().catch(() => ({}));
    const answer = res.ok ? readAnswer(data) : "";
    a.className = "a";
    a.textContent = answer || data.error || "답을 가져오지 못했어요. 다시 눌러 주세요.";
    if (answer && Speech.supported) addSpeakButton(a, answer);
  } catch (err) {
    a.className = "a";
    a.textContent = "AI 도슨트에 연결하지 못했어요. 잠시 뒤 다시 눌러 주세요.";
  } finally {
    setBusy(false);
  }
}

function setBusy(on) {
  busy = on;
  document.querySelectorAll("#chips button, #askForm button").forEach((b) => { b.disabled = on; });
}

function addSpeakButton(box, text) {
  const b = document.createElement("button");
  b.type = "button";
  b.className = "speak";
  b.textContent = "답변 듣기";
  b.onclick = () => {
    if (Speech.speaking && speakingWhat === b) { Speech.stop(); return; }
    Speech.speak(text);
    speakingWhat = b;
    Speech.onChange(true);
  };
  box.appendChild(b);
}

/* ---------- 5·6. 추천 목록, 이전/다음 ---------- */
function recItem(e) {
  const li = document.createElement("li");
  const a = document.createElement("a");
  a.href = exhibitUrl(e.id);
  a.innerHTML = `<span class="num"></span><span><span class="t"></span><br><span class="s"></span></span>`;
  a.querySelector(".num").textContent = e.id;
  a.querySelector(".t").textContent = e.name;
  a.querySelector(".s").textContent = e.era || "";
  li.appendChild(a);
  return li;
}

function setPager(link, target) {
  if (target) {
    link.href = exhibitUrl(target.id);
  } else {
    link.removeAttribute("href");
    link.setAttribute("aria-disabled", "true");
  }
}
