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

/* ---------- 2. 소리로 듣기 (브라우저 내장 음성, 설치 불필요) ---------- */
const Speech = {
  supported: "speechSynthesis" in window,
  speaking: false,
  onChange: null,               // 상태가 바뀔 때 화면을 고치는 함수

  speak(text) {
    if (!this.supported || !text) return;
    this.stop();
    const u = new SpeechSynthesisUtterance(cleanForSpeech(text));
    u.lang = "ko-KR";
    u.rate = 0.9;               // 조금 천천히
    u.onend = u.onerror = () => this._set(false);
    speechSynthesis.speak(u);
    this._set(true);
  },
  stop() {
    if (this.supported) speechSynthesis.cancel();
    this._set(false);
  },
  _set(v) {
    this.speaking = v;
    if (this.onChange) this.onChange(v);
  }
};

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
