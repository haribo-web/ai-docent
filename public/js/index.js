// 첫 화면: 작품 이름 검색, 전시 구역별 목록
// 관람객은 작품 설명판의 이름으로 작품을 찾는다. 링크 주소에는 작품 고유 ID(예: gammoyeojaedo)를 쓴다.
// 검색과 목록은 모두 브라우저 안에서 처리한다. (서버로 보내는 정보 없음)

let exhibits = [];

function exhibitLink(exhibit) {
  const a = document.createElement("a");
  a.href = `/exhibit.html?id=${encodeURIComponent(exhibit.id)}`;
  a.textContent = exhibit.title;
  return a;
}

// ── 작품 이름으로 찾기 ──
// 띄어쓰기와 괄호·문장부호를 무시하고 비교한다. 괄호 안의 한자나 다른 이름으로도 찾을 수 있다.
// (예: "고령댁상여" → "산청 전주최씨 고령댁 상여", "感慕" → "감모여재도(感慕如在圖)", "나무 기러기" → "목안(木雁, 나무 기러기)")
function normalize(text) {
  return text.toLowerCase().replace(/[\s'"‘’“”·.,()《》「」『』-]/g, "");
}

const searchInput = document.getElementById("exhibit-search");
const searchStatus = document.getElementById("search-status");
const searchResults = document.getElementById("search-results");

function renderSearch() {
  const query = normalize(searchInput.value);
  searchResults.textContent = "";
  if (!query) {
    searchStatus.textContent = "";
    return;
  }

  const matches = exhibits.filter((e) => normalize(`${e.title} ${e.chapter}`).includes(query));
  searchStatus.textContent = matches.length
    ? `${matches.length}개를 찾았습니다.`
    : "찾는 작품이 없습니다. 이름을 조금 짧게 써 보거나, 아래 전시 구역에서 찾아 주세요.";

  for (const exhibit of matches) {
    const li = document.createElement("li");
    const link = exhibitLink(exhibit);
    const chapter = document.createElement("span");
    chapter.className = "meta";
    chapter.textContent = exhibit.chapter;
    link.append(chapter);
    li.append(link);
    searchResults.append(li);
  }
}

searchInput.addEventListener("input", renderSearch);

// ── 전시 구역에서 찾기 ──
function renderChapters() {
  const listEl = document.getElementById("exhibit-list");
  const chapters = new Map();
  for (const exhibit of exhibits) {
    if (!chapters.has(exhibit.chapter)) chapters.set(exhibit.chapter, []);
    chapters.get(exhibit.chapter).push(exhibit);
  }

  listEl.textContent = "";
  for (const [chapter, items] of chapters) {
    const details = document.createElement("details");
    const summary = document.createElement("summary");
    summary.textContent = `${chapter} (${items.length})`;
    details.append(summary);

    const ul = document.createElement("ul");
    for (const exhibit of items) {
      const li = document.createElement("li");
      li.append(exhibitLink(exhibit));
      ul.append(li);
    }
    details.append(ul);
    listEl.append(details);
  }
}

async function loadExhibits() {
  try {
    const response = await fetch("/data/exhibits.json");
    if (!response.ok) throw new Error(`exhibits.json ${response.status}`);
    exhibits = await response.json();
    renderChapters();
    renderSearch(); // 목록을 불러오기 전에 이미 검색어를 입력했을 때
  } catch (error) {
    console.error("전시물 목록을 불러오지 못했습니다:", error);
    document.getElementById("exhibit-list").textContent = "전시물 목록을 불러오지 못했습니다.";
  }
}

loadExhibits();
