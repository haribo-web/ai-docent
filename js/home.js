/* =========================================================
   첫 화면 동작: 번호로 찾기, 전시관 지도, 전시관별 작품 목록
   ========================================================= */

// 전시관 이름 (실제 전시와 다르면 여기만 수정)
const HALLS = [
  { no: 1, name: "1관", sub: "한국인의 하루" },
  { no: 2, name: "2관", sub: "한국인의 일상" },
  { no: 3, name: "3관", sub: "한국인의 일생" }
];

// 지도 위 전시관 칸 위치 (가로 0~400, 세로 0~320)
const HALL_BOX = { top: 12, height: 266, gap: 8, left: 12, right: 388 };

const SVG_NS = "http://www.w3.org/2000/svg";
const go = (id) => { location.href = exhibitUrl(id); };

/* ---------- 1. 지도: 전시관 칸 그리기 ---------- */
const hallW = (HALL_BOX.right - HALL_BOX.left - HALL_BOX.gap * (HALLS.length - 1)) / HALLS.length;
const hallRect = (i) => ({
  x: HALL_BOX.left + i * (hallW + HALL_BOX.gap),
  y: HALL_BOX.top, w: hallW, h: HALL_BOX.height
});

HALLS.forEach((h, i) => {
  const r = hallRect(i);
  const g = document.createElementNS(SVG_NS, "g");
  g.innerHTML = `
    <rect class="hall h${i % 3}" x="${r.x}" y="${r.y}" width="${r.w}" height="${r.h}" rx="10"/>
    <text class="hallname" x="${r.x + 12}" y="${r.y + 24}"></text>
    <text class="hallsub"  x="${r.x + 12}" y="${r.y + 41}"></text>`;
  g.querySelector(".hallname").textContent = h.name;
  g.querySelector(".hallsub").textContent = h.sub;
  $("halls").appendChild(g);
});

/* ---------- 2. 데이터 불러온 뒤 핀·목록 만들기 ---------- */
(async () => {
  let exhibits = [];
  try {
    exhibits = await loadExhibits();
  } catch (e) {
    showMsg("작품 정보를 불러오지 못했어요. 잠시 뒤 새로고침해 주세요.", true);
    return;
  }
  if (exhibits.length === 0) {
    showMsg("아직 등록된 작품이 없어요.");
  }

  // 전시관별로 나누기
  const byHall = new Map(HALLS.map((h) => [h.no, []]));
  const etc = [];
  exhibits.forEach((ex) => {
    const n = hallNumber(ex.hall);
    (byHall.has(n) ? byHall.get(n) : etc).push(ex);
  });

  // 지도 핀
  HALLS.forEach((h, i) => drawPins(byHall.get(h.no), hallRect(i)));

  // 목록
  HALLS.forEach((h) => addGroup(`${h.name} ${h.sub}`, byHall.get(h.no)));
  addGroup("기타", etc);

  // 번호로 찾기
  $("findForm").onsubmit = (e) => {
    e.preventDefault();
    const raw = $("findInput").value.trim();
    if (!raw) { showMsg("작품 번호를 입력해 주세요.", true); return; }
    const hit = exhibits.find((ex) => ex.id === raw || Number(ex.id) === Number(raw));
    if (hit) go(hit.id);
    else showMsg(`${raw}번 작품을 찾지 못했어요. 작품 옆 번호를 다시 확인해 주세요.`, true);
  };
})();

function showMsg(text, isError) {
  $("findMsg").textContent = text;
  $("findMsg").classList.toggle("err", !!isError);
}

/* 핀 그리기: 데이터에 x, y 가 있으면 그 위치, 없으면 전시관 칸 안에 자동 배치 */
function drawPins(list, r) {
  if (!list.length) return;
  const cols = 2;
  const rows = Math.ceil(list.length / cols);
  const areaTop = r.y + 60, areaH = r.h - 72;
  const stepY = Math.min(48, areaH / rows);
  const radius = Math.max(9, Math.min(19, stepY / 2 - 3));

  list.forEach((ex, k) => {
    const hasXY = typeof ex.x === "number" && typeof ex.y === "number";
    const x = hasXY ? ex.x : r.x + r.w * ((k % cols) + 0.5) / cols;
    const y = hasXY ? ex.y : areaTop + stepY * (Math.floor(k / cols) + 0.5);
    const label = ex.id.length > 3 ? ex.id.slice(-3) : ex.id;   // 긴 번호는 끝 3자리만
    const font = Math.max(9, radius * (label.length > 2 ? 0.62 : 0.8));

    const pin = document.createElementNS(SVG_NS, "g");
    pin.setAttribute("class", "pin");
    pin.setAttribute("tabindex", "0");
    pin.setAttribute("role", "link");
    pin.setAttribute("aria-label", `${ex.id}번 ${ex.name}`);
    pin.innerHTML = `
      <title></title>
      <circle class="ring" cx="${x}" cy="${y}" r="${radius + 4}"/>
      <circle class="dot"  cx="${x}" cy="${y}" r="${radius}"/>
      <text x="${x}" y="${y + font * 0.35}" text-anchor="middle" font-size="${font}"></text>`;
    pin.querySelector("title").textContent = `${ex.id}번 ${ex.name}`;
    pin.querySelector("text").textContent = label;
    pin.onclick = () => go(ex.id);
    pin.onkeydown = (e) => {
      if (e.key === "Enter" || e.key === " ") { e.preventDefault(); go(ex.id); }
    };
    $("pins").appendChild(pin);
  });
}

/* 목록 묶음 하나 추가 */
function addGroup(title, list) {
  if (!list.length) return;
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
  a.href = exhibitUrl(ex.id);
  a.innerHTML = `<span class="num"></span><span><span class="t"></span><br><span class="s"></span></span>`;
  a.querySelector(".num").textContent = ex.id;
  a.querySelector(".t").textContent = ex.name;
  a.querySelector(".s").textContent = [ex.era, ex.hall].filter(Boolean).join(" · ");
  li.appendChild(a);
  return li;
}
