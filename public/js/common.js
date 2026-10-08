/* =========================================================
   공통 기능 (모든 화면에서 사용)
   1. 글자 크기 조절   2. 소리로 듣기   3. 전시물 데이터 불러오기
   ========================================================= */

const $ = (id) => document.getElementById(id);

/* ---------- 1. 글자 크기 조절 (선택 기억) ---------- */
function applySize(big) {
  document.documentElement.dataset.size = big ? "large" : "";
  const btn = $("sizeBtn");
  if (!btn) return;
  btn.setAttribute("aria-pressed", big);
  btn.textContent = big ? "글자 보통" : "글자 크게";
}

try { applySize(localStorage.getItem("docent-size") === "large"); } catch (e) {}

if ($("sizeBtn")) {
  $("sizeBtn").onclick = () => {
    const big = document.documentElement.dataset.size !== "large";
    applySize(big);
    try { localStorage.setItem("docent-size", big ? "large" : ""); } catch (e) {}
  };
}

/* ---------- 2. 소리로 듣기 (브라우저 내장 음성, 설치 불필요) ----------
   문장 단위로 나눠 읽는다.
   - 긴 글도 끊기지 않음 (크롬은 한 번에 오래 읽으면 중간에 멈춤)
   - 일시정지 → 그 문장부터 이어 듣기, 이전/다음 문장으로 건너뛰기
   - 지금 읽는 문장을 화면에 알려 줌 (hooks.onSentence)
   - 기기에 있는 한국어 목소리 중 가장 자연스러운 것을 고름 (Edge의 Natural 음성 등)

   Speech.speak(text)                       글 하나 읽기 (예: AI 답변)
   Speech.play(문장 목록, { onSentence, onEnd }, 시작 번호)
   Speech.pause() / resume() / jump(번호) / stop() / setRate(빠르기) / setVoice(이름)  */
const RATES = [
  { value: 0.8, label: "느리게" },
  { value: 0.95, label: "보통" },
  { value: 1.15, label: "빠르게" }
];

function splitSentences(text) {
  return String(text || "")
    .split(/\n\s*\n|(?<=[.!?。])\s+/)
    .map((s) => s.trim())
    .filter(Boolean);
}

const Speech = {
  supported: "speechSynthesis" in window && "SpeechSynthesisUtterance" in window,
  speaking: false,              // 지금 소리가 나는 중
  paused: false,                // 일시정지 (이어 듣기 가능)
  onChange: null,               // 상태가 바뀔 때 화면을 고치는 함수
  queue: [],
  index: 0,
  hooks: {},
  rate: 0.95,
  voiceName: "",
  _token: 0,

  /* 한국어 목소리 목록 (자연스러운 목소리가 앞에 옴) */
  voices() {
    if (!this.supported) return [];
    const score = (v) =>
      (/natural|neural|online/i.test(v.name) ? 0 : /google/i.test(v.name) ? 1 : 2) + (v.localService ? 0.5 : 0);
    return speechSynthesis.getVoices()
      .filter((v) => /^ko/i.test(v.lang))
      .sort((a, b) => score(a) - score(b));
  },
  voice() {
    const list = this.voices();
    return list.find((v) => v.name === this.voiceName) || list[0] || null;
  },
  setVoice(name) {
    this.voiceName = name;
    try { localStorage.setItem("docent-voice", name); } catch (e) {}
    if (this.speaking) this._run();
  },
  setRate(value) {
    this.rate = value;
    try { localStorage.setItem("docent-rate", String(value)); } catch (e) {}
    if (this.speaking) this._run();   // 지금 문장부터 새 빠르기로
  },

  speak(text) {
    this.play(splitSentences(text));
  },
  play(sentences, hooks = {}, start = 0) {
    if (!this.supported || !sentences.length) return;
    this.stop();
    this.queue = sentences;
    this.hooks = hooks;
    this.index = Math.max(0, Math.min(start, sentences.length - 1));
    this.paused = false;
    this._run();
  },
  pause() {
    if (!this.speaking) return;
    this._cancel();
    this.paused = true;
    this._set(false);
  },
  resume() {
    if (!this.paused) return;
    this.paused = false;
    this._run();
  },
  jump(i) {
    if (!this.queue.length) return;
    this.index = Math.max(0, Math.min(i, this.queue.length - 1));
    if (this.speaking || this.paused) { this.paused = false; this._run(); }
    else if (this.hooks.onSentence) this.hooks.onSentence(this.index, this.queue.length);
  },
  stop() {
    const hooks = this.hooks;
    this._cancel();
    this.queue = [];
    this.index = 0;
    this.paused = false;
    this.hooks = {};
    this._set(false);
    if (hooks.onEnd) hooks.onEnd(false);
  },

  _cancel() {
    this._token++;                // 취소된 문장의 '끝남' 알림은 무시
    if (this.supported) speechSynthesis.cancel();
  },
  _run() {
    this._cancel();
    const token = this._token;
    if (this.index >= this.queue.length) {
      const hooks = this.hooks;
      this.queue = [];
      this.hooks = {};
      this._set(false);
      if (hooks.onEnd) hooks.onEnd(true);   // 끝까지 다 읽음
      return;
    }
    const u = new SpeechSynthesisUtterance(cleanForSpeech(this.queue[this.index]) || " ");
    u.lang = "ko-KR";
    u.rate = this.rate;
    const v = this.voice();
    if (v) u.voice = v;
    u.onend = () => {
      if (token !== this._token) return;
      this.index++;
      this._run();
    };
    u.onerror = (e) => {
      if (token !== this._token || e.error === "interrupted" || e.error === "canceled") return;
      this.index++;
      this._run();
    };
    if (this.hooks.onSentence) this.hooks.onSentence(this.index, this.queue.length);
    speechSynthesis.speak(u);
    this._set(true);
  },
  _set(v) {
    this.speaking = v;
    if (this.onChange) this.onChange(v);
  }
};

try {
  const savedRate = Number(localStorage.getItem("docent-rate"));
  if (RATES.some((r) => r.value === savedRate)) Speech.rate = savedRate;
  Speech.voiceName = localStorage.getItem("docent-voice") || "";
} catch (e) {}

// 다른 화면으로 넘어가면 소리 끄기
window.addEventListener("pagehide", () => Speech.stop());

/* ---------- 3. 전시물 데이터 불러오기 ----------
   [데이터 담당과의 약속] public/data/exhibits.json (README 형식)
   [
     { "slug": "gammoyeojaedo", "name": "전시물 이름", "hall": "9부 제례",
       "era": "조선 후기",
       "descriptionEasy": "쉬운 설명", "descriptionDetail": "자세한 설명",
       "x": 60, "y": 120 }          ← x, y 는 선택 (없으면 지도에 자동 배치)
   ]
   - 관람객에게는 작품명(name)만 보여 준다. 작품 번호는 쓰지 않는다.
   - 화면 안에서는 작품마다 고정된 고유 ID(slug, data/exhibit-ids.json)를 ex.id 로 쓴다.
     (데이터의 옛 번호 칸은 쓰지 않음)
   - 순서는 챕터 순서 → 엑셀 행 순서.
   파일이 없거나 비어 있으면 '등록된 작품 없음'으로 표시                       */
async function loadExhibits() {
  const res = await fetch("data/exhibits.json", { cache: "no-cache" });
  if (res.status === 404) return [];
  if (!res.ok) throw new Error("data");
  const text = (await res.text()).trim();
  if (!text) return [];
  const list = JSON.parse(text);
  if (!Array.isArray(list)) return [];
  return list
    .filter((e) => e && e.slug && e.name)
    .map((e) => ({ ...e, id: String(e.slug).trim() }))
    .sort((a, b) =>
      (chapterOrder(a) - chapterOrder(b)) ||
      ((a.sourceRow ?? 9999) - (b.sourceRow ?? 9999)) ||
      a.name.localeCompare(b.name, "ko"));
}

// 챕터 순서: chapterNo, 없으면 "9부 제례"처럼 hall 앞의 숫자
function chapterOrder(e) {
  if (typeof e.chapterNo === "number") return e.chapterNo;
  const m = String(e.hall || "").match(/\d+/);
  return m ? Number(m[0]) : 9999;
}

// 작품 고유 ID → 설명 화면 주소 (예: exhibit.html?id=gammoyeojaedo)
const exhibitUrl = (id) => `exhibit.html?id=${encodeURIComponent(id)}`;

// 전시관 이름에서 "1관", "2관" 같은 번호를 찾아 냄 (예: "상설전시관 1관" → 1)
function hallNumber(hall) {
  const m = String(hall || "").match(/(\d+)\s*관/);
  return m ? Number(m[1]) : null;
}


/* 소리로 읽을 때만 한자 빼기 (화면 글자는 그대로)
   예: "길상화(吉祥畵)" → "길상화", "효(孝)·제(悌)" → "효·제" */
function cleanForSpeech(text) {
  return String(text || "")
    .replace(/\s*[(（][^()（）]*[\u3400-\u9FFF\uF900-\uFAFF][^()（）]*[)）]/g, "")
    .replace(/[\u3400-\u4DBF\u4E00-\u9FFF\uF900-\uFAFF]+/g, "")
    .replace(/\s{2,}/g, " ")
    .trim();
}
