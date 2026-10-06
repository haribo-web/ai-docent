/* =========================================================
   첫 화면 동작: 작품 이름으로 찾기, 전시 지도, 전시별 작품 목록
   - 관람객에게는 작품 이름만 보여 줍니다. (작품 번호는 쓰지 않음)
   - 작품을 고르면 작품 고유 ID(ex.id, 예: gammoyeojaedo)로 설명 화면에 연결합니다.
   - 전시 구역은 데이터의 hall 값을 보고 자동으로 만듭니다.
     (hall 이 1~9 처럼 숫자여도, "상설전시관 1관" 같은 글이어도 됩니다)
   ========================================================= */

/* 전시 이름 붙이기 (선택)
   hall 값이 숫자뿐이라 지도에 "1", "2"만 보이면 여기에 이름을 적어 주세요.
   예: "1": "1. 한국인의 하루"
   비워 두면 데이터의 hall 값이 그대로 보입니다.                       */
const HALL_NAMES = {
  // "1": "",
  // "2": "",
};

const SVG_NS = "http://www.w3.org/2000/svg";
const go = (id) => { location.href = exhibitUrl(id); };

// 지도 크기 (가로 400 기준, 세로는 전시 수에 따라 자동)
const MAP = { left: 12, width: 376, top: 12, gap: 8, cellH: 104, maxCols: 3, entryH: 44 };

(async () => {
  let exhibits = [];
  try {
    exhibits = await loadExhibits();
  } catch (e) {
    showMsg("작품 정보를 불러오지 못했어요. 잠시 뒤 새로고침해 주세요.", true);
    return;
  }
  if (exhibits.length === 0) showMsg("아직 등록된 작품이 없어요.");

  // 1. hall 값으로 전시 묶기 → 숫자 순서로 정렬
  const groups = new Map();
  exhibits.forEach((ex) => {
    const key = String(ex.hall || "").trim() || "기타";
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(ex);
  });
  const halls = [...groups.keys()].sort((a, b) => {
    const na = firstNumber(a), nb = firstNumber(b);
    if (na !== nb) return na - nb;
    return a.localeCompare(b, "ko");
  });

  // 2. 지도 그리기
  drawMap(halls, groups);

  // 3. 전시별 목록
  halls.forEach((key) => addGroup(hallLabel(key), groups.get(key)));

  // 4. 작품 이름으로 찾기
  //    - 띄어쓰기 상관없이, 이름 일부만 입력해도 찾음 (예: "감모" → 감모여재도)
  //    - 하나만 맞으면 바로 이동, 여러 개면 아래에 목록으로 보여 줌
  $("findForm").onsubmit = (e) => {
    e.preventDefault();
    const raw = $("findInput").value.trim();
    $("results").hidden = true;
    $("results").innerHTML = "";

    if (!raw) { showMsg("작품 이름을 입력해 주세요.", true); return; }

    const q = normalize(raw);
    const exact = exhibits.filter((ex) => normalize(ex.name) === q || normalize(shortName(ex.name)) === q);
    const partial = exhibits.filter((ex) => normalize(ex.name).includes(q));
    const hits = exact.length ? exact : partial;

    if (hits.length === 1) { go(hits[0].id); return; }
    if (hits.length === 0) {
      showMsg(`'${raw}'(으)로 찾은 작품이 없어요. 이름을 짧게 줄여서 다시 입력해 보세요.`, true);
      return;
    }
    showMsg(`'${raw}'(으)로 찾은 작품이 ${hits.length}개 있어요. 보고 싶은 작품을 눌러 주세요.`);
    hits.forEach((ex) => $("results").appendChild(exhibitItem(ex)));
    $("results").hidden = false;
  };
})();

/* ---------- 도움 함수 ---------- */
// 비교용: 띄어쓰기·괄호·따옴표·기호를 빼고 소문자로 맞춤 (괄호 안 한자로도 찾을 수 있음)
function normalize(s) {
  return String(s || "").toLowerCase().replace(/[\s()\[\]·.,\-_/'"‘’“”《》「」『』]/g, "");
}

// 괄호 안 한자 등을 뺀 짧은 이름 (예: "감모여재도(感慕如在圖)" → "감모여재도")
function shortName(name) {
  return String(name || "").replace(/\([^)]*\)/g, "").replace(/\s+/g, " ").trim();
}

function firstNumber(s) {
  const m = String(s).match(/\d+/);
  return m ? Number(m[0]) : 9999;     // 숫자가 없으면 맨 뒤로
}

function hallLabel(key) {
  const n = firstNumber(key);
  return HALL_NAMES[key] || HALL_NAMES[String(n)] || (/^\d+$/.test(key) ? `전시 ${key}` : key);
}

function showMsg(text, isError) {
  $("findMsg").textContent = text;
  $("findMsg").classList.toggle("err", !!isError);
}

/* ---------- 지도 ---------- */
function drawMap(halls, groups) {
  const svg = $("mapSvg");
  if (!halls.length) { svg.closest(".map").hidden = true; return; }

  const cols = Math.min(MAP.maxCols, halls.length);
  const rows = Math.ceil(halls.length / cols);
  const cellW = (MAP.width - MAP.gap * (cols - 1)) / cols;
  const bottom = MAP.top + rows * MAP.cellH + (rows - 1) * MAP.gap;
  const height = bottom + MAP.entryH;

  // 지도 전체 크기와 입구 위치 맞추기
  svg.setAttribute("viewBox", `0 0 400 ${height}`);
  svg.querySelector(".door").setAttribute("d", `M170 ${bottom} v24 M230 ${bottom} v24`);
  svg.querySelector(".entry").setAttribute("y", bottom + 20);

  halls.forEach((key, i) => {
    const r = {
      x: MAP.left + (i % cols) * (cellW + MAP.gap),
      y: MAP.top + Math.floor(i / cols) * (MAP.cellH + MAP.gap),
      w: cellW, h: MAP.cellH
    };
    // 전시 칸
    const g = document.createElementNS(SVG_NS, "g");
    g.innerHTML = `
      <rect class="hall h${i % 3}" x="${r.x}" y="${r.y}" width="${r.w}" height="${r.h}" rx="10"/>
      <text class="hallname" x="${r.x + 10}" y="${r.y + 20}"></text>`;
    const label = hallLabel(key);
    const maxChars = Math.floor(cellW / 13);
    g.querySelector(".hallname").textContent = label.length > maxChars ? label.slice(0, maxChars - 1) + "…" : label;
    $("halls").appendChild(g);

    drawPins(groups.get(key), r);
  });
}

/* 핀: 데이터에 x, y 가 있으면 그 위치, 없으면 전시 칸 안에 자동 배치 */
function drawPins(list, r) {
  const cols = 3;
  const rows = Math.ceil(list.length / cols);
  const areaTop = r.y + 30, areaH = r.h - 34;
  const stepY = Math.min(36, areaH / rows);
  const radius = Math.max(7, Math.min(15, stepY / 2 - 2));

  list.forEach((ex, k) => {
    const hasXY = typeof ex.x === "number" && typeof ex.y === "number";
    const x = hasXY ? ex.x : r.x + r.w * ((k % cols) + 0.5) / cols;
    const y = hasXY ? ex.y : areaTop + stepY * (Math.floor(k / cols) + 0.5);
    const label = shortName(ex.name).replace(/\s+/g, "").slice(0, 2);   // 핀에는 작품 이름 앞 2글자
    const font = Math.max(7, radius * 0.7);

    const pin = document.createElementNS(SVG_NS, "g");
    pin.setAttribute("class", "pin");
    pin.setAttribute("tabindex", "0");
    pin.setAttribute("role", "link");
    pin.setAttribute("aria-label", ex.name);
    pin.innerHTML = `
      <title></title>
      <circle class="ring" cx="${x}" cy="${y}" r="${radius + 4}"/>
      <circle class="dot"  cx="${x}" cy="${y}" r="${radius}"/>
      <text x="${x}" y="${y + font * 0.35}" text-anchor="middle" font-size="${font}"></text>`;
    pin.querySelector("title").textContent = ex.name;
    pin.querySelector("text").textContent = label;
    pin.onclick = () => go(ex.id);
    pin.onkeydown = (e) => {
      if (e.key === "Enter" || e.key === " ") { e.preventDefault(); go(ex.id); }
    };
    $("pins").appendChild(pin);
  });
}

/* ---------- 목록 ---------- */
function addGroup(title, list) {
  const box = document.createElement("div");
  box.className = "group";
  const h = document.createElement("h3");
  h.textContent = title;
  const ul = document.createElement("ul");
  ul.className = "list";
  list.forEach((ex) => ul.appendChild(exhibitItem(ex)));
  box.append(h, ul);
  $("list").appendChild(box);
}

function exhibitItem(ex) {
  const li = document.createElement("li");
  const a = document.createElement("a");
  a.href = exhibitUrl(ex.id);   // 화면에는 작품 이름만, 주소에는 작품 고유 ID
  a.innerHTML = `<span><span class="t"></span><br><span class="s"></span></span>`;
  a.querySelector(".t").textContent = ex.name;
  a.querySelector(".s").textContent = ex.era || "";
  li.appendChild(a);
  return li;
}
