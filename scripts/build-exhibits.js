// 작품 정리 엑셀(정리본)을 읽어 public/data/exhibits.json 을 만든다. (설치할 패키지 없음)
//
// 실행: npm run build:data
//       node scripts/build-exhibits.js "다른 파일.xlsx"   ← 다른 엑셀을 쓸 때
//
// 원칙
// - 엑셀의 글은 줄이거나 지우지 않고 그대로 옮긴다.
// - 출처 URL 목록(sourceUrls)과 출처 상태(sourceStatus)만 계산해서 덧붙인다.
// - id: 작품마다 고유한 영문 ID (예: 감모여재도 → gammoyeojaedo). 주소와 AI 요청에 쓴다.
//   처음 만들 때 작품명을 로마자로 바꿔 정하고, data/exhibit-ids.json 에 기록해 고정한다.
//   그 뒤에는 엑셀 행 순서가 바뀌어도 같은 ID를 쓴다. ID를 바꾸고 싶으면 그 파일을 고친다.
// - number: 예전에 쓰던 임시 번호 (챕터 번호 + 순서, 예: 901). 예전 주소(?id=901) 호환용으로만 남긴다.

import fs from "node:fs";
import path from "node:path";
import zlib from "node:zlib";
import { fileURLToPath } from "node:url";

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const INPUT = path.resolve(ROOT, process.argv[2] || "작품 정리_정리본.xlsx");
const OUTPUT = path.join(ROOT, "public", "data", "exhibits.json");
const ID_FILE = path.join(ROOT, "data", "exhibit-ids.json");
const SHEET_NAME = "시트1";
const HALL = "상설전시관 3 《한국인의 일생》";

// 엑셀 제목 행 → JSON 필드 이름
const COLUMNS = {
  "작품명": "title",
  "작가": "artist",
  "챕터": "chapter",
  "기본설명": "basicDescription",
  "작품정보": "workInfo",
  "역사/문화적 배경": "historicalContext",
  "작품의 의미": "exhibitionMeaning",
  "추가 정보": "additionalInfo",
  "예상질문": "expectedQuestions",
  "출처": "sources",
};

// ── xlsx(zip) 파일 열기 ──
function unzip(buffer) {
  const files = {};
  let eocd = buffer.length - 22;
  while (eocd >= 0 && buffer.readUInt32LE(eocd) !== 0x06054b50) eocd--;
  if (eocd < 0) throw new Error("엑셀(xlsx) 파일 형식이 아닙니다.");
  const count = buffer.readUInt16LE(eocd + 10);
  let p = buffer.readUInt32LE(eocd + 16);
  for (let i = 0; i < count; i++) {
    const method = buffer.readUInt16LE(p + 10);
    const size = buffer.readUInt32LE(p + 20);
    const nameLen = buffer.readUInt16LE(p + 28);
    const extraLen = buffer.readUInt16LE(p + 30);
    const commentLen = buffer.readUInt16LE(p + 32);
    const local = buffer.readUInt32LE(p + 42);
    const name = buffer.toString("utf8", p + 46, p + 46 + nameLen);
    const start = local + 30 + buffer.readUInt16LE(local + 26) + buffer.readUInt16LE(local + 28);
    const data = buffer.subarray(start, start + size);
    files[name] = (method === 8 ? zlib.inflateRawSync(data) : data).toString("utf8");
    p += 46 + nameLen + extraLen + commentLen;
  }
  return files;
}

function decodeXml(text) {
  return text
    .replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCodePoint(parseInt(h, 16)))
    .replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(Number(d)))
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, "&");
}

// <si>나 <is> 안의 글자를 모두 이어 붙인다 (서식이 섞인 글자 포함, 읽기 표시 rPh 제외)
function textOf(xml) {
  const clean = xml.replace(/<rPh[\s\S]*?<\/rPh>/g, "");
  return [...clean.matchAll(/<t(?:\s[^>]*)?>([\s\S]*?)<\/t>/g)].map((m) => decodeXml(m[1])).join("");
}

function readSheet(files, sheetName) {
  const shared = [...(files["xl/sharedStrings.xml"] || "").matchAll(/<si>([\s\S]*?)<\/si>/g)].map((m) => textOf(m[1]));

  const workbook = files["xl/workbook.xml"];
  const sheet = [...workbook.matchAll(/<sheet\b[^>]*>/g)].map((m) => m[0]).find((tag) => tag.includes(`name="${sheetName}"`));
  if (!sheet) throw new Error(`'${sheetName}' 시트를 찾을 수 없습니다.`);
  const relId = sheet.match(/r:id="([^"]+)"/)[1];
  const rel = files["xl/_rels/workbook.xml.rels"].match(new RegExp(`<Relationship\\b[^>]*Id="${relId}"[^>]*>`))[0];
  const target = rel.match(/Target="([^"]+)"/)[1].replace(/^\/?(xl\/)?/, "");
  const xml = files[`xl/${target}`];

  const rows = {};
  for (const m of xml.matchAll(/<c r="([A-Z]+)(\d+)"([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g)) {
    const [, col, row, attrs, inner = ""] = m;
    const type = (attrs.match(/t="([^"]+)"/) || [])[1];
    let value = "";
    if (type === "s") value = shared[Number(inner.match(/<v>(\d+)<\/v>/)?.[1])] ?? "";
    else if (type === "inlineStr") value = textOf(inner);
    else value = decodeXml(inner.match(/<v>([\s\S]*?)<\/v>/)?.[1] ?? "");
    (rows[row] ??= {})[col] = value;
  }
  return Object.keys(rows)
    .map(Number)
    .sort((a, b) => a - b)
    .map((n) => ({ rowNumber: n, cells: rows[n] }));
}

// ── 출처 상태 계산 ──
function sourceInfo(text) {
  const urls = [...text.matchAll(/https?:\/\/[^\s;]+/g)].map((m) => m[0].replace(/[),.]+$/, ""));
  const partial = (text.match(/(?<![\w./])nfm\.go\.kr\/\S+/g) || []).length;
  const todo = (text.match(/\[확인 필요/g) || []).length + (text.match(/URL 없음\)/g) || []).length;
  let status = "확인 필요";
  if (urls.length + partial > 0) status = todo ? "일부 확인 필요" : "확인됨";
  return { sourceUrls: [...new Set(urls)], sourceStatus: status };
}

// ── 작품 고유 ID (로마자) ──
// 국어의 로마자 표기법의 글자 대응을 따른다. (소리가 바뀌는 규칙까지는 적용하지 않음)
const INITIALS = ["g", "kk", "n", "d", "tt", "r", "m", "b", "pp", "s", "ss", "", "j", "jj", "ch", "k", "t", "p", "h"];
const VOWELS = ["a", "ae", "ya", "yae", "eo", "e", "yeo", "ye", "o", "wa", "wae", "oe", "yo", "u", "wo", "we", "wi", "yu", "eu", "ui", "i"];
const FINALS = ["", "k", "k", "k", "n", "n", "n", "t", "l", "k", "m", "l", "l", "l", "p", "l", "m", "p", "p", "t", "t", "ng", "t", "t", "k", "t", "p", "t"];

function romanize(text) {
  let out = "";
  for (const ch of text) {
    const code = ch.codePointAt(0) - 0xac00;
    if (code >= 0 && code < 11172) {
      out += INITIALS[Math.floor(code / 588)] + VOWELS[Math.floor((code % 588) / 28)] + FINALS[code % 28];
    } else {
      out += ch;
    }
  }
  return out;
}

function makeId(title) {
  return romanize(title.replace(/\([^)]*\)/g, "")) // 괄호 속 한자 등은 빼고
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-") // 띄어쓰기·문장부호 → 하이픈
    .replace(/^-+|-+$/g, "");
}

// 이미 정해 둔 ID는 그대로 쓰고, 새 작품에만 새 ID를 만든다.
function assignIds(titles) {
  const saved = fs.existsSync(ID_FILE) ? JSON.parse(fs.readFileSync(ID_FILE, "utf8")) : {};
  const used = new Set(Object.values(saved));
  const ids = {};
  for (const title of titles) {
    if (saved[title]) {
      ids[title] = saved[title];
      continue;
    }
    const base = makeId(title) || "exhibit";
    let id = base;
    for (let n = 2; used.has(id); n++) id = `${base}-${n}`;
    used.add(id);
    ids[title] = id;
    saved[title] = id;
  }
  fs.mkdirSync(path.dirname(ID_FILE), { recursive: true });
  fs.writeFileSync(ID_FILE, JSON.stringify(saved, null, 2) + "\n", "utf8");
  return ids;
}

// ── 실행 ──
const rows = readSheet(unzip(fs.readFileSync(INPUT)), SHEET_NAME);
const [header, ...body] = rows;
const colOf = {};
for (const [col, label] of Object.entries(header.cells)) {
  if (COLUMNS[label.trim()]) colOf[COLUMNS[label.trim()]] = col;
}
const missing = Object.values(COLUMNS).filter((f) => !colOf[f]);
if (missing.length) throw new Error(`엑셀 제목 행에 없는 열: ${missing.join(", ")}`);

const dataRows = body.filter(({ cells }) => (cells[colOf.title] || "").trim());
const titles = dataRows.map(({ cells }) => cells[colOf.title].trim());
const duplicated = titles.filter((t, i) => titles.indexOf(t) !== i);
if (duplicated.length) throw new Error(`작품명이 겹칩니다. 작품명은 서로 달라야 합니다 → ${[...new Set(duplicated)].join(", ")}`);
const idOf = assignIds(titles);

const perChapter = {};
const exhibits = dataRows
  .map(({ rowNumber, cells }) => {
    const item = {};
    for (const [field, col] of Object.entries(colOf)) item[field] = (cells[col] || "").trim();

    const chapterNo = Number((item.chapter.match(/^(\d+)부\s/) || [])[1]);
    if (!chapterNo) throw new Error(`${rowNumber}행: 챕터 이름이 'N부 이름' 형식이 아닙니다 → '${item.chapter}'`);
    perChapter[chapterNo] = (perChapter[chapterNo] || 0) + 1;

    const number = `${chapterNo}${String(perChapter[chapterNo]).padStart(2, "0")}`;
    const fullText = Object.values(item).join(" ");
    return {
      id: idOf[item.title],
      number,
      hall: HALL,
      chapterNo,
      ...item,
      ...sourceInfo(item.sources),
      needsReview: /확인 필요|검수 필요/.test(fullText),
      sourceRow: rowNumber,
    };
  });

fs.writeFileSync(OUTPUT, JSON.stringify(exhibits, null, 2) + "\n", "utf8");

const byStatus = {};
for (const e of exhibits) byStatus[e.sourceStatus] = (byStatus[e.sourceStatus] || 0) + 1;
console.log(`${path.basename(INPUT)} → public/data/exhibits.json`);
console.log(`작품 ${exhibits.length}개 | 챕터별 ${Object.entries(perChapter).map(([c, n]) => `${c}부 ${n}`).join(", ")}`);
console.log(`출처 상태: ${Object.entries(byStatus).map(([s, n]) => `${s} ${n}`).join(", ")}`);
console.log(`'확인 필요' 표시가 있는 작품: ${exhibits.filter((e) => e.needsReview).length}개`);
