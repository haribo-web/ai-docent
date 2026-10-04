// 첫 화면: 번호로 찾기, 챕터별 전시물 목록

document.getElementById("exhibit-form").addEventListener("submit", (event) => {
  event.preventDefault();
  const id = document.getElementById("exhibit-id").value.trim();
  if (id) location.href = `/exhibit.html?id=${encodeURIComponent(id)}`;
});

async function loadExhibitList() {
  const listEl = document.getElementById("exhibit-list");
  try {
    const response = await fetch("/data/exhibits.json");
    const exhibits = await response.json();

    // 챕터별로 묶기 (데이터 순서 유지)
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
        const a = document.createElement("a");
        a.href = `/exhibit.html?id=${encodeURIComponent(exhibit.id)}`;
        a.textContent = `${exhibit.id}. ${exhibit.title}`;
        li.append(a);
        ul.append(li);
      }
      details.append(ul);
      listEl.append(details);
    }
  } catch {
    listEl.textContent = "전시물 목록을 불러오지 못했습니다.";
  }
}

loadExhibitList();
