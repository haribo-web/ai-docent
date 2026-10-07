/* =========================================================
   관람 노트: 인상 깊은 작품 표시 + 감상 메모 + AI 감상문 + 공유하기
   - 첫 화면(index.html): '내 관람 노트' 바로가기를 붙인다.
   - 설명 화면(exhibit.html): ☆ 인상 깊어요 버튼과 감상 메모 칸을 붙이고,
     AI 도슨트에게 물어본 질문·답변을 노트에 함께 모은다.
   - 노트 화면(note.html): 모은 작품을 보여 주고, 감상문을 만들어 공유한다.

   [개인정보] 기록은 관람객 기기(브라우저)에만 저장한다. 서버로 보내지 않는다.
   '감상문 만들기'를 누를 때만 노트 내용을 /api/review 로 보내 글을 다듬는다.
   (common.js 다음에 불러온다)
   ========================================================= */

const REVIEW_API = "/api/review";

/* ---------- 노트 저장소 (브라우저 localStorage) ----------
   { "작품고유ID": { star: true, memo: "감상", qa: [{ q, a }], updated: 시각 } } */
const Note = {
  KEY: "docent-note",
  MAX_QA: 5,

  readAll() {
    try {
      const data = JSON.parse(localStorage.getItem(this.KEY) || "{}");
      return data && typeof data === "object" ? data : {};
    } catch (e) {
      return {};
    }
  },
  writeAll(data) {
    try {
      localStorage.setItem(this.KEY, JSON.stringify(data));
      return true;
    } catch (e) {
      return false;   // 사생활 보호 모드 등 저장할 수 없는 환경
    }
  },
  get(id) {
    const item = this.readAll()[id] || {};
    return { star: !!item.star, memo: item.memo || "", qa: item.qa || [], updated: item.updated || 0 };
  },
  // 고친 뒤 비어 있으면(별표·메모·질문 모두 없음) 노트에서 뺀다
  update(id, change) {
    const data = this.readAll();
    const item = this.get(id);
    change(item);
    item.updated = Date.now();
    if (!item.star && !item.memo.trim() && !item.qa.length) delete data[id];
    else data[id] = item;
    return this.writeAll(data);
  },
  addQa(id, q, a) {
    this.update(id, (item) => {
      item.qa = item.qa.filter((x) => x.q !== q).concat({ q, a }).slice(-this.MAX_QA);
    });
  },
  count() {
    return Object.values(this.readAll()).filter((item) => item.star || (item.memo || "").trim()).length;
  },
  clear() {
    try { localStorage.removeItem(this.KEY); } catch (e) {}
  }
};

/* ---------- 노트 화면 전용 스타일 불러오기 ---------- */
(function addStyle() {
  if (document.querySelector('link[href="css/note.css"]')) return;
  const link = document.createElement("link");
  link.rel = "stylesheet";
  link.href = "css/note.css";
  document.head.appendChild(link);
})();

const el = (tag, cls, text) => {
  const node = document.createElement(tag);
  if (cls) node.className = cls;
  if (text != null) node.textContent = text;
  return node;
};

/* ---------- 말로 적기 (브라우저 음성 인식, 지원하는 브라우저에서만) ---------- */
const Recognition = window.SpeechRecognition || window.webkitSpeechRecognition;

function addMicButton(box, textarea, onText) {
  if (!Recognition) return;
  const btn = el("button", "note-mic", "🎤 말로 적기");
  btn.type = "button";
  btn.setAttribute("aria-pressed", "false");
  let rec = null;

  btn.onclick = () => {
    if (rec) { rec.stop(); return; }
    rec = new Recognition();
    rec.lang = "ko-KR";
    rec.interimResults = false;
    rec.onresult = (e) => {
      const said = Array.from(e.results).map((r) => r[0].transcript).join(" ").trim();
      if (!said) return;
      textarea.value = (textarea.value.trim() + " " + said).trim().slice(0, textarea.maxLength || 300);
      onText();
    };
    rec.onend = () => {
      rec = null;
      btn.setAttribute("aria-pressed", "false");
      btn.textContent = "🎤 말로 적기";
    };
    rec.onerror = rec.onend;
    rec.start();
    btn.setAttribute("aria-pressed", "true");
    btn.textContent = "■ 그만 말하기";
  };
  box.appendChild(btn);
}

/* ---------- 1. 첫 화면: 관람 노트 바로가기 ---------- */
function mountHomeLink() {
  const lead = document.querySelector(".lead");
  if (!lead || !$("mapSvg")) return;   // 첫 화면에서만
  const n = Note.count();
  const a = el("a", "note-entry");
  a.href = "note.html";
  a.append(el("span", "note-entry-icon", "📒"), el("span", "note-entry-text", "내 관람 노트"));
  a.appendChild(el("span", "note-entry-count", n ? `${n}개 작품` : "아직 비어 있어요"));
  lead.after(a);
}

/* ---------- 2. 설명 화면: ☆ 인상 깊어요 + 감상 메모 ---------- */
function mountExhibitBox() {
  const main = $("exhibit");
  const id = (new URLSearchParams(location.search).get("id") || "").trim();
  if (!main || !id) return;

  const start = () => {
    if (document.querySelector(".note-box")) return;
    const saved = Note.get(id);

    const box = el("section", "note-box");
    box.setAttribute("aria-labelledby", "noteTitle");
    const head = el("div", "note-head");
    const h2 = el("h2", null, "내 관람 노트");
    h2.id = "noteTitle";
    const go = el("a", "note-go", "노트 보기 →");
    go.href = "note.html";
    head.append(h2, go);

    const star = el("button", "note-star");
    star.type = "button";
    const paintStar = (on) => {
      star.setAttribute("aria-pressed", on);
      star.textContent = on ? "★ 인상 깊은 작품이에요" : "☆ 인상 깊어요";
    };
    paintStar(saved.star);
    star.onclick = () => {
      const on = star.getAttribute("aria-pressed") !== "true";
      Note.update(id, (item) => { item.star = on; });
      paintStar(on);
    };

    const label = el("label", "note-label", "어떠셨어요? 한 줄만 적어도 돼요");
    label.htmlFor = "noteMemo";
    const memo = el("textarea", "note-memo");
    memo.id = "noteMemo";
    memo.rows = 3;
    memo.maxLength = 300;
    memo.placeholder = "예: 색깔이 참 고왔다. 할머니 생각이 났다.";
    memo.value = saved.memo;

    const tools = el("div", "note-tools");
    const status = el("span", "note-status");
    status.setAttribute("aria-live", "polite");
    let timer = null;
    const save = () => {
      clearTimeout(timer);
      timer = setTimeout(() => {
        const ok = Note.update(id, (item) => { item.memo = memo.value.trim(); });
        status.textContent = ok ? "저장했어요" : "이 브라우저에서는 저장할 수 없어요";
      }, 400);
    };
    memo.addEventListener("input", save);
    addMicButton(tools, memo, save);
    tools.appendChild(status);

    box.append(head, star, label, memo, tools);
    const label0 = main.querySelector(".label");
    (label0 || main.firstElementChild).after(box);

    watchQa(id);
  };

  // 작품 정보를 다 불러와 화면이 보인 뒤에 붙인다
  if (!main.hidden) start();
  else new MutationObserver((_, obs) => {
    if (!main.hidden) { obs.disconnect(); start(); }
  }).observe(main, { attributes: true, attributeFilter: ["hidden"] });
}

// AI 도슨트 질문·답변을 노트에 모으기 (화면 코드는 고치지 않고 답변이 나타나는 것을 지켜봄)
const FAILED_ANSWER = /못했어요|못했습니다|준비 중|다시 (눌러|질문|시도)|답하기 어려워요|너무 많|연결하지|error/i;

function watchQa(id) {
  const qa = $("qa");
  if (!qa) return;
  const collect = () => {
    qa.querySelectorAll(".a:not(.wait):not([data-noted])").forEach((a) => {
      const textNode = Array.from(a.childNodes).find((n) => n.nodeType === Node.TEXT_NODE && n.textContent.trim());
      const answer = textNode ? textNode.textContent.trim() : "";
      const q = a.previousElementSibling && a.previousElementSibling.classList.contains("q")
        ? a.previousElementSibling.textContent.trim() : "";
      if (!answer) return;              // 아직 답을 기다리는 중
      a.dataset.noted = "1";
      // 화면은 답을 받았을 때만 '답변 듣기' 버튼을 붙인다. 그중 '준비 중' 같은 안내 문구는 빼고 모은다
      const ok = (a.querySelector(".speak") || !Speech.supported) && !FAILED_ANSWER.test(answer);
      if (q && ok) Note.addQa(id, q, answer);
    });
  };
  new MutationObserver(collect).observe(qa, { childList: true, subtree: true, characterData: true, attributes: true, attributeFilter: ["class"] });
}

/* ---------- 3. 노트 화면 ---------- */
async function mountNotePage() {
  const list = $("noteList");
  if (!list) return;

  let exhibits = [];
  try { exhibits = await loadExhibits(); } catch (e) { exhibits = []; }
  const byId = new Map(exhibits.map((e) => [e.id, e]));

  // 노트에 있는 작품: 별표 → 메모 → 질문만 한 작품 순, 같은 무리에서는 전시 순서대로
  const rank = (item) => (item.star ? 0 : item.memo.trim() ? 1 : 2);
  const entries = () => {
    const all = Note.readAll();
    return exhibits
      .filter((e) => all[e.id])
      .map((e) => ({ ex: e, item: Note.get(e.id) }))
      .sort((a, b) => rank(a.item) - rank(b.item));
  };

  function render() {
    list.innerHTML = "";
    const rows = entries();
    $("noteEmpty").hidden = rows.length > 0;
    $("reviewBox").hidden = rows.length === 0;
    $("clearBtn").hidden = rows.length === 0;
    rows.forEach(({ ex, item }) => list.appendChild(card(ex, item)));
  }

  function card(ex, item) {
    const li = el("li", "note-card");
    const top = el("div", "note-card-top");
    const title = el("a", "note-card-title", ex.name);
    title.href = exhibitUrl(ex.id);
    const star = el("button", "note-card-star", item.star ? "★" : "☆");
    star.type = "button";
    star.setAttribute("aria-pressed", item.star);
    star.setAttribute("aria-label", item.star ? "인상 깊은 작품 표시 빼기" : "인상 깊은 작품으로 표시");
    star.onclick = () => { Note.update(ex.id, (it) => { it.star = !it.star; }); render(); };
    top.append(title, star);
    li.append(top, el("p", "note-card-where", ex.hall || ""));

    const memo = el("textarea", "note-memo");
    memo.rows = 2;
    memo.maxLength = 300;
    memo.placeholder = "이 작품을 보고 어떠셨어요?";
    memo.value = item.memo;
    memo.setAttribute("aria-label", `${ex.name} 감상 메모`);
    let timer = null;
    const save = () => {
      clearTimeout(timer);
      timer = setTimeout(() => Note.update(ex.id, (it) => { it.memo = memo.value.trim(); }), 400);
    };
    memo.addEventListener("input", save);
    li.appendChild(memo);
    const tools = el("div", "note-tools");
    addMicButton(tools, memo, save);
    if (tools.childNodes.length) li.appendChild(tools);

    if (item.qa.length) {
      const d = el("details", "note-qa");
      d.appendChild(el("summary", null, `AI에게 물어본 것 (${item.qa.length})`));
      item.qa.forEach(({ q, a }) => {
        d.append(el("p", "note-qa-q", "Q. " + q), el("p", "note-qa-a", a));
      });
      li.appendChild(d);
    }
    return li;
  }

  /* 공유할 글: 감상문이 있으면 감상문, 없으면 노트를 정리한 글 */
  function plainNote() {
    const date = new Date().toLocaleDateString("ko-KR");
    const lines = [`📒 관람 노트 · ${date}`, "국립민속박물관 상설전시관 3 《한국인의 일생》", ""];
    entries().forEach(({ ex, item }) => {
      lines.push(`${item.star ? "★" : "·"} ${ex.name}`);
      const first = String(ex.descriptionEasy || "").split(/(?<=[.!?])\s+/)[0];
      if (first) lines.push(`  ${first}`);
      if (item.memo.trim()) lines.push(`  내 감상: ${item.memo.trim()}`);
      lines.push("");
    });
    return lines.join("\n").trim();
  }

  // 감상문 만들기
  $("makeReview").onclick = async () => {
    const rows = entries().filter(({ item }) => item.star || item.memo.trim());
    const msg = $("reviewMsg");
    if (!rows.length) {
      msg.textContent = "☆ 인상 깊은 작품을 표시하거나 감상을 적어 주세요.";
      return;
    }
    const btn = $("makeReview");
    btn.disabled = true;
    btn.textContent = "감상문을 쓰고 있어요…";
    msg.textContent = "";
    try {
      const res = await fetch(REVIEW_API, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          items: rows.slice(0, 10).map(({ ex, item }) => ({
            exhibitId: ex.id,
            name: ex.name,
            memo: item.memo.trim(),
            qa: item.qa.slice(-3).map(({ q, a }) => ({ question: q, answer: a }))
          }))
        })
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok && data.review) {
        $("reviewText").value = data.review;
        $("reviewText").hidden = false;
        msg.textContent = data.placeholder
          ? "AI가 아직 준비 중이라 기본 형식으로 정리했어요. 자유롭게 고쳐 쓰셔도 돼요."
          : "감상문을 만들었어요. 자유롭게 고쳐 쓰셔도 돼요.";
      } else {
        msg.textContent = data.error || "감상문을 만들지 못했어요. 잠시 뒤 다시 눌러 주세요.";
      }
    } catch (e) {
      msg.textContent = "인터넷 연결을 확인한 뒤 다시 눌러 주세요.";
    } finally {
      btn.disabled = false;
      btn.textContent = "✨ 감상문 만들기";
    }
  };

  // 공유하기 (휴대폰: 메모 앱·카카오톡 등으로 보내기 / 공유를 못 하는 PC: 복사)
  $("shareBtn").onclick = async () => {
    const box = $("reviewText");
    const text = (!box.hidden && box.value.trim()) || plainNote();
    const msg = $("shareMsg");
    msg.textContent = "";
    if (navigator.share) {
      try {
        await navigator.share({ title: "관람 노트", text });
        return;
      } catch (e) {
        if (e.name === "AbortError") return;   // 관람객이 공유 창을 닫음
      }
    }
    try {
      await navigator.clipboard.writeText(text);
      msg.textContent = "글을 복사했어요. 메모장에 붙여 넣어 주세요.";
    } catch (e) {
      box.hidden = false;
      box.value = text;
      box.select();
      msg.textContent = "아래 글을 길게 눌러 복사해 주세요.";
    }
  };

  $("clearBtn").onclick = () => {
    if (!confirm("관람 노트를 모두 지울까요? 지우면 되돌릴 수 없어요.")) return;
    Note.clear();
    $("reviewText").value = "";
    $("reviewText").hidden = true;
    render();
  };

  render();
}

mountHomeLink();
mountExhibitBox();
mountNotePage();
