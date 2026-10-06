// 1번 담당(전시 데이터 & 설명) ─ 작품 정리 엑셀을 읽어 public/data/exhibits.json 을 만든다.
// 설치할 패키지 없음.
//
// 실행: node scripts/build-data.js
//       node scripts/build-data.js "다른 파일.xlsx"   ← 다른 엑셀을 쓸 때
//
// 만드는 필드
// - 화면(3번)용: id, name, hall, era, descriptionEasy, descriptionDetail, questions, info
//     id   : 작품 번호 (챕터 번호 + 순서, 예: 401). 번호 입력·지도 핀에 쓴다.
//     hall : "4부 관직과 직업"처럼 챕터 이름. 앞의 숫자로 지도 칸이 자동으로 나뉜다.
//     descriptionEasy   : 쉬운 설명 (핵심 2~3문장, 한자 표기 뺌)
//     descriptionDetail : 자세한 설명 (소개·배경·의미·추가 이야기, 빈 줄로 문단 구분)
//     nameSpeech, speechEasy, speechDetail : 소리로 듣기용 글 (한자·기호를 빼서 자연스럽게 읽힘)
// - AI(2번)용: 엑셀 원문 필드를 그대로 둔다. (title, basicDescription, historicalContext 등)
//     엑셀 글을 줄이거나 고치지 않은 원문이라, '확인 필요' 표시도 그대로 남아 있다.
//     slug 는 작품 고유 영문 ID (data/exhibit-ids.json 에 고정, 예: gammoyeojaedo)
//
// 화면용 설명은 엑셀 문장을 이렇게 다듬는다.
// - '~함/~임' 개조식 문장 → '~합니다/~입니다' (화면 문구와 소리로 듣기에 자연스럽게)
// - '확인 필요', '보도자료' 같은 조사 메모 문장은 관람객 설명에서 뺀다.
//
// xlsx 읽기와 고유 ID 규칙은 2번 담당의 scripts/build-exhibits.js 와 같은 방식이다.

import fs from "node:fs";
import path from "node:path";
import zlib from "node:zlib";
import { fileURLToPath } from "node:url";

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const INPUT = path.resolve(ROOT, process.argv[2] || "작품 정리_정리본.xlsx");
const OUTPUT = path.join(ROOT, "public", "data", "exhibits.json");
const ID_FILE = path.join(ROOT, "data", "exhibit-ids.json");
const SHEET_NAME = "시트1";
const EXHIBITION = "상설전시관 3 《한국인의 일생》";

// 엑셀 제목 행 → JSON 필드 이름 (AI 담당과 같은 이름)
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

// 관람객 설명에서 뺄 조사 메모 문장
const NOTE = /확인 ?필요|검수 필요|대조 필요|팀원|오역|권장|단정하지 않음|해설 가능|설명 가능|공감을 얻기 좋음|보도자료|백과사전의/;

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

// ── 출처 상태 (AI 담당과 같은 계산) ──
function sourceInfo(text) {
  const urls = [...text.matchAll(/https?:\/\/[^\s;]+/g)].map((m) => m[0].replace(/[),.]+$/, ""));
  const partial = (text.match(/(?<![\w./])nfm\.go\.kr\/\S+/g) || []).length;
  const todo = (text.match(/\[확인 필요/g) || []).length + (text.match(/URL 없음\)/g) || []).length;
  let status = "확인 필요";
  if (urls.length + partial > 0) status = todo ? "일부 확인 필요" : "확인됨";
  return { sourceUrls: [...new Set(urls)], sourceStatus: status };
}

// ── 작품 고유 영문 ID (AI 담당과 같은 규칙, data/exhibit-ids.json 에 고정) ──
const INITIALS = ["g", "kk", "n", "d", "tt", "r", "m", "b", "pp", "s", "ss", "", "j", "jj", "ch", "k", "t", "p", "h"];
const VOWELS = ["a", "ae", "ya", "yae", "eo", "e", "yeo", "ye", "o", "wa", "wae", "oe", "yo", "u", "wo", "we", "wi", "yu", "eu", "ui", "i"];
const FINALS = ["", "k", "k", "k", "n", "n", "n", "t", "l", "k", "m", "l", "l", "l", "p", "l", "m", "p", "p", "t", "t", "ng", "t", "t", "k", "t", "p", "t"];

function romanize(text) {
  let out = "";
  for (const ch of text) {
    const code = ch.codePointAt(0) - 0xac00;
    out += code >= 0 && code < 11172
      ? INITIALS[Math.floor(code / 588)] + VOWELS[Math.floor((code % 588) / 28)] + FINALS[code % 28]
      : ch;
  }
  return out;
}

function assignSlugs(titles) {
  const saved = fs.existsSync(ID_FILE) ? JSON.parse(fs.readFileSync(ID_FILE, "utf8")) : {};
  const used = new Set(Object.values(saved));
  let changed = false;
  for (const title of titles) {
    if (saved[title]) continue;
    const base = romanize(title.replace(/\([^)]*\)/g, "")).toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "") || "exhibit";
    let slug = base;
    for (let n = 2; used.has(slug); n++) slug = `${base}-${n}`;
    used.add(slug);
    saved[title] = slug;
    changed = true;
  }
  if (changed) {
    fs.mkdirSync(path.dirname(ID_FILE), { recursive: true });
    fs.writeFileSync(ID_FILE, JSON.stringify(saved, null, 2) + "\n", "utf8");
  }
  return saved;
}

// ── 한글 문장 다듬기 ──
const isHangul = (ch) => !!ch && ch >= "가" && ch <= "힣";
const finalOf = (ch) => (ch.charCodeAt(0) - 0xac00) % 28;
const withFinal = (ch, f) => {
  const code = ch.charCodeAt(0) - 0xac00;
  return String.fromCharCode(0xac00 + code - (code % 28) + f);
};
const FINAL_N = 4;
const FINAL_M = 16;
const FINAL_B = 17;

// 'ㅁ' 받침으로 끝나지만 동사가 아니라 명사인 낱말 (뒤에 '입니다'를 붙임)
const NOUNS_M = ["사람", "이름", "마음", "처음", "다음", "품", "모임", "무덤", "장점", "침", "차림"];

// 문장이 한자어 명사로 끝날 때 자연스러운 서술어
const VERBAL_NOUNS = {
  구분: "구분됩니다", 사용: "사용합니다", 치료: "치료했습니다", 등재: "등재되었습니다",
  보관: "보관합니다", 등장: "등장했습니다", 대표: "대표합니다", 상징: "상징합니다",
  강화: "강화되었습니다", 개정: "개정되었습니다", 시행: "시행되었습니다",
  확인: "확인할 수 있습니다", 금지: "금지했습니다", 진행: "진행합니다",
  반포: "반포했습니다", 간행: "간행했습니다",
};

// 개조식/해라체 문장 끝을 '합니다'체로 바꾼다. 바꿀 수 없으면 그대로 둔다.
function toPolite(sentence) {
  let s = sentence.trim().replace(/\.+$/, "").trim();
  if (!s) return s;

  // 끝의 괄호 보충 설명은 떼었다가 다시 붙임: '달랐다(예: ...)' → '달랐습니다(예: ...)'
  const paren = s.match(/^(.*[가-힣])(\s*\([^()]*\))$/);
  if (paren) {
    const [, body, tail] = paren;
    const converted = toPolite(body);
    return converted === body + "입니다." ? s + "입니다." : converted.slice(0, -1) + tail + ".";
  }
  if (/['"’”」』]$/.test(s)) return s + "입니다.";
  const last = s.at(-1);
  if (!isHangul(last)) return s + ".";
  if (/(니다|세요|까요|어요|아요|해요|예요|에요)$/.test(s)) return s + ".";

  const words = s.split(/\s+/);
  const lastWord = words.at(-1).replace(/^[^가-힣]+/, "");
  const prev = isHangul(s.at(-2)) ? s.at(-2) : null;

  if (VERBAL_NOUNS[lastWord]) return s.slice(0, -lastWord.length) + VERBAL_NOUNS[lastWord] + ".";
  if (s.endsWith("는다")) return s.slice(0, -2) + "습니다.";      // 담는다 → 담습니다
  if (s.endsWith("듦")) return s.slice(0, -1) + "듭니다.";         // 만듦 → 만듭니다

  // 해라체: 한다 → 합니다 / 이다 → 입니다 / 있다 → 있습니다
  if (last === "다" && prev) {
    const f = finalOf(prev);
    if (f === FINAL_N || f === 0) return s.slice(0, -2) + withFinal(prev, FINAL_B) + "니다.";
    return s.slice(0, -1) + "습니다.";
  }

  // 명사형 'ㅁ' 어미: 함 → 합니다 / 있음 → 있습니다
  let isNoun = NOUNS_M.some((n) => lastWord.endsWith(n));
  if (lastWord === "그림") isNoun = !(words.length >= 2 && /[을를]$/.test(words.at(-2))); // '~을 그림'이면 동사
  if (finalOf(last) === FINAL_M && !isNoun) {
    if (last === "음" && prev && finalOf(prev) !== 0) return s.slice(0, -1) + "습니다.";
    return s.slice(0, -1) + withFinal(last, FINAL_B) + "니다.";
  }

  // 명사로 끝나는 문장: '합격 증서' → '합격 증서입니다'
  return s + "입니다.";
}

function sentences(text) {
  return (text || "")
    .replace(/\r/g, "")
    .replace(/\n+/g, " ")
    .split(/(?<=[.!?])\s+/)
    .map((s) => s.trim())
    .filter(Boolean);
}

// 앞 따옴표가 빠진 문장('백'은 ...)을 바로잡는다.
function fixQuotes(s) {
  for (const q of ["'", '"']) {
    if ((s.split(q).length - 1) % 2 === 1) {
      s = s.indexOf(q) <= 12 ? q + s : s.replace(q, "");
    }
  }
  return s;
}

// 관람객용 문장만 골라 존댓말로
function visitorSentences(text) {
  return sentences(text).filter((s) => !NOTE.test(s)).map((s) => toPolite(fixQuotes(s)));
}

// 한자 괄호 표기 제거: '길상화(吉祥畵)' → '길상화'
const stripHanja = (text) => text.replace(/\s*\([^()]*[一-鿿][^()]*\)/g, "");

// '제작연도: 조선 후기 / 재료: 종이 / ...' → [{ label, value }]
function parseInfo(text) {
  const parts = (text || "").split(/\s+\/\s+/).map((p) => p.trim()).filter(Boolean);
  const defaults = parts[0] && parts[0].includes("재현") ? ["구분", "구성", "특징"] : ["시대", "재료", "특징"];
  const items = [];
  parts.forEach((part, i) => {
    while ((part.match(/\)/g) || []).length > (part.match(/\(/g) || []).length) {
      const at = part.lastIndexOf(")");
      part = (part.slice(0, at) + part.slice(at + 1)).trim();
    }
    const m = part.match(/^([^:：]{1,10})[:：]\s*(.*)$/);
    const label = m ? m[1].trim() : defaults[i] || "";
    const value = (m ? m[2] : part)
      .split(/,\s+/)
      .filter((piece) => !NOTE.test(piece))
      .join(", ")
      .trim();
    if (value) items.push({ label, value });
  });
  return items;
}

// 예상 질문: '1) ...', 'Q. ...', '① ...' → ['...?']
function parseQuestions(text) {
  return (text || "")
    .replace(/\s*([①②③④⑤⑥⑦⑧⑨])\s*/g, "\n$1 ")
    .split("\n")
    .map((line) => line.replace(/^\s*(\d+\)|Q\.|[①②③④⑤⑥⑦⑧⑨])\s*/, "").trim())
    .filter(Boolean)
    .map((line) => {
      line = line.replace(/\s*\([^()]*\)\s*$/, "").replace(/[?？]+$/, "").trim(); // 끝의 괄호 메모·힌트 제거
      if (line.endsWith("는지")) line = line.slice(0, -2) + "나요";               // ~하는지 → ~하나요
      else if (line.endsWith("지") && isHangul(line.at(-2)) && finalOf(line.at(-2)) === FINAL_N) line = line.slice(0, -1) + "가요"; // ~인지 → ~인가요
      return line + "?";
    });
}

// 시대 한 줄 (목록·제목 아래에 표시)
function eraOf(info) {
  const item = info.find((i) => ["제작연도", "시대", "구분"].includes(i.label));
  return item ? item.value : "";
}

function describe(item) {
  const summary = visitorSentences(item.basicDescription);
  const background = visitorSentences(item.historicalContext);
  const meaning = visitorSentences(item.exhibitionMeaning);
  const extra = visitorSentences(item.additionalInfo);

  // 쉬운 설명에는 전시 기획 용어(파트, 챕터 등)나 안내 문장이 든 문장은 넣지 않는다.
  const plain = (s) => !/파트|챕터|코너|전시품|맞물|짝으로|누리집|VR/.test(s) && s.length >= 15;
  const easySummary = summary.filter(plain).slice(0, 2);
  const easy = [easySummary.length ? easySummary : summary.slice(0, 1), meaning.filter(plain).slice(0, 1)]
    .filter((p) => p.length)
    .map((p) => stripHanja(p.join(" ")));
  const detail = [summary, background, meaning, extra].filter((p) => p.length).map((p) => p.join(" "));

  return {
    descriptionEasy: easy.join("\n\n"),
    descriptionDetail: detail.join("\n\n"),
    speechEasy: forSpeech(easy.join(" ")),
    speechDetail: forSpeech(detail.join(" ")),
  };
}

// 소리로 듣기용 글: 한자 표기·기호를 빼서 음성이 자연스럽게 읽도록
//   '활옷(闊衣)' → '활옷', '공주·옹주' → '공주, 옹주', '1478~1548' → '1478에서 1548'
function forSpeech(text) {
  return stripHanja(text)
    .replace(/[『』「」〈〉《》]/g, "")
    .replace(/·/g, ", ")
    .replace(/(\d)\s*~\s*(\d)/g, "$1에서 $2")
    .replace(/~/g, "에서 ")
    .replace(/→/g, "에서 ")
    .replace(/\s+/g, " ")
    .trim();
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
if (duplicated.length) throw new Error(`작품명이 겹칩니다 → ${[...new Set(duplicated)].join(", ")}`);
const slugOf = assignSlugs(titles);

const perChapter = {};
const exhibits = dataRows.map(({ rowNumber, cells }) => {
  const item = {};
  for (const [field, col] of Object.entries(colOf)) item[field] = (cells[col] || "").trim();

  const chapterNo = Number((item.chapter.match(/^(\d+)부\s/) || [])[1]);
  if (!chapterNo) throw new Error(`${rowNumber}행: 챕터 이름이 'N부 이름' 형식이 아닙니다 → '${item.chapter}'`);
  perChapter[chapterNo] = (perChapter[chapterNo] || 0) + 1;
  const number = `${chapterNo}${String(perChapter[chapterNo]).padStart(2, "0")}`;
  const info = parseInfo(item.workInfo);

  return {
    // 화면(3번)용
    id: number,
    name: item.title,
    nameSpeech: forSpeech(item.title),
    hall: item.chapter,
    era: eraOf(info),
    ...describe(item),
    questions: parseQuestions(item.expectedQuestions),
    info,
    // AI(2번)용: 엑셀 원문 그대로
    slug: slugOf[item.title],
    number,
    exhibition: EXHIBITION,
    chapterNo,
    ...item,
    ...sourceInfo(item.sources),
    needsReview: /확인 필요|검수 필요/.test(Object.values(item).join(" ")),
    sourceRow: rowNumber,
  };
});

fs.writeFileSync(OUTPUT, JSON.stringify(exhibits, null, 2) + "\n", "utf8");
console.log(`${path.basename(INPUT)} → public/data/exhibits.json`);
console.log(`작품 ${exhibits.length}개 | ${Object.entries(perChapter).map(([c, n]) => `${c}부 ${n}개`).join(", ")}`);
