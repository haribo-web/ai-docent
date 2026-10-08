/* =========================================================
   전시물 설명 화면 동작   (주소 예: exhibit.html?id=gammoyeojaedo)
   - 주소의 id 는 작품 고유 ID입니다. 관람객 화면에는 작품 이름만 보여 줍니다.
   ========================================================= */

/* ---------- [AI 담당과의 약속] 연결 설정 ----------
   AI 코드의 요청·응답 형식이 다르면 이 세 곳만 고치면 됩니다.       */
const DOCENT_API = "/api/docent";

// 보내는 값: 작품 고유 ID + 작품 이름(서버는 ID로 찾고, 없으면 이름으로 찾음)
//           + 지금 보고 있는 설명 수준(쉬운/자세한 → 답변 길이)
function buildRequest(ex, question) {
  return { exhibitId: ex.id, name: ex.name, level: mode, question };
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
  $("dWhere").textContent = [ex.exhibition, ex.hall].filter(Boolean).join(" · ");
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
let sentEls = [];   // 설명 문장들 (읽는 문장 강조용)

function renderDesc() {
  $("tabEasy").setAttribute("aria-selected", mode === "easy");
  $("tabDetail").setAttribute("aria-selected", mode === "detail");
  $("dDesc").innerHTML = "";
  sentEls = [];
  const text = descText() || "설명을 준비하고 있어요.";
  text.split(/\n\s*\n/).forEach((para) => {     // 빈 줄로 문단 나누기
    const p = document.createElement("p");
    splitSentences(para).forEach((s) => {        // 문장마다 나눠 두면 읽는 문장을 강조할 수 있음
      const span = document.createElement("span");
      span.className = "sent";
      span.textContent = s;
      const i = sentEls.length + 1;              // 0번은 작품 이름
      if (Speech.supported) span.onclick = () => startDesc(i);
      sentEls.push(span);
      p.append(span, " ");
    });
    $("dDesc").appendChild(p);
  });
  resetPlayer();
}
$("tabEasy").onclick = () => { Speech.stop(); mode = "easy"; renderDesc(); };
$("tabDetail").onclick = () => { Speech.stop(); mode = "detail"; renderDesc(); };

/* ---------- 3. 소리로 듣기 (오디오 플레이어) ----------
   작품 이름 → 설명 문장 순서로 한 문장씩 읽고, 읽는 문장을 화면에 강조한다.
   재생/일시정지(이어 듣기), 이전/다음 문장, 빠르기, 목소리 고르기, 문장 눌러서 그 부분부터 듣기 */
let speakingWhat = null;   // "desc" 설명 / 답변 버튼

if (Speech.supported) {
  $("player").hidden = false;
  $("playerHint").hidden = false;
}

const descSentences = () => [ex.name, ...sentEls.map((s) => s.textContent)];

function clearHighlight() {
  document.querySelectorAll(".reading").forEach((el) => el.classList.remove("reading"));
}

function setProgress(done, total, label) {
  $("playerCount").textContent = label != null ? label : total ? `${done} / ${total}` : "";
  const pct = total ? Math.round((done / total) * 100) : 0;
  $("playerFill").style.width = pct + "%";
  $("playerBar").setAttribute("aria-valuenow", pct);
}

function resetPlayer() {
  clearHighlight();
  setProgress(0, descSentences().length, `${descSentences().length}문장`);
  updatePlayer();
}

function highlight(i, total) {
  clearHighlight();
  const el = i === 0 ? $("dTitle") : sentEls[i - 1];
  if (el) {
    el.classList.add("reading");
    const r = el.getBoundingClientRect();
    if (i > 0 && (r.top < 80 || r.bottom > innerHeight - 20)) el.scrollIntoView({ block: "center", behavior: "smooth" });
  }
  setProgress(i + 1, total);
}

function startDesc(from = 0) {
  Speech.play(descSentences(), {
    onSentence: highlight,
    onEnd: (finished) => {
      clearHighlight();
      if (speakingWhat === "desc") speakingWhat = null;
      const n = descSentences().length;
      if (finished) setProgress(1, 1, "다 들었어요 ✓");
      else setProgress(0, n, `${n}문장`);           // 중간에 멈추면 처음 상태로
      updatePlayer();
    }
  }, from);
  speakingWhat = "desc";
  updatePlayer();
}

function updatePlayer() {
  const mine = speakingWhat === "desc";
  const playing = mine && Speech.speaking;
  const paused = mine && Speech.paused;
  $("player").classList.toggle("is-playing", playing);
  $("listenBtn").setAttribute("aria-pressed", playing);
  $("listenBtn").setAttribute("aria-label", playing ? "일시정지" : paused ? "이어 듣기" : "설명 듣기");
  $("playerLabel").textContent = playing ? "읽어 드리는 중" : paused ? "잠시 멈춤 · 누르면 이어서 들어요" : "설명 듣기";
}

Speech.onChange = (on) => {
  updatePlayer();
  document.querySelectorAll(".a .speak").forEach((b) => {
    b.textContent = on && speakingWhat === b ? "멈추기" : "답변 듣기";
  });
};

$("listenBtn").onclick = () => {
  const mine = speakingWhat === "desc";
  if (mine && Speech.speaking) Speech.pause();
  else if (mine && Speech.paused) Speech.resume();
  else startDesc(0);
};
$("prevSent").onclick = () => {
  if (speakingWhat === "desc") Speech.jump(Speech.index - 1);
  else startDesc(0);
};
$("nextSent").onclick = () => {
  if (speakingWhat === "desc") Speech.jump(Speech.index + 1);
  else startDesc(1);
};

// 빠르기: 느리게 → 보통 → 빠르게
function paintRate() {
  const r = RATES.find((x) => x.value === Speech.rate) || RATES[1];
  $("rateBtn").textContent = r.label;
}
$("rateBtn").onclick = () => {
  const i = RATES.findIndex((x) => x.value === Speech.rate);
  Speech.setRate(RATES[(i + 1) % RATES.length].value);
  paintRate();
};
paintRate();

// 목소리: 한국어 목소리가 2개 이상이면 고를 수 있게
function fillVoices() {
  const list = Speech.voices();
  $("voiceBox").hidden = list.length < 2;
  const current = Speech.voice();
  $("voiceSel").innerHTML = "";
  list.forEach((v) => {
    const o = document.createElement("option");
    o.value = v.name;
    o.textContent = v.name.replace(/^(Microsoft|Google)\s*/i, "").replace(/\s*-\s*Korean.*$/i, "").replace(/\(Korean.*?\)/i, "").trim() || v.name;
    o.selected = current && v.name === current.name;
    $("voiceSel").appendChild(o);
  });
}
if (Speech.supported) {
  fillVoices();
  speechSynthesis.addEventListener("voiceschanged", fillVoices);
  $("voiceSel").onchange = () => Speech.setVoice($("voiceSel").value);
}

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
  a.href = exhibitUrl(e.id);   // 화면에는 작품 이름만, 주소에는 작품 고유 ID
  a.innerHTML = `<span><span class="t"></span><br><span class="s"></span></span>`;
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
