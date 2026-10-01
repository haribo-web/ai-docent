// 로컬 개발용 서버 (설치할 패키지 없음).
// - public/ 폴더의 파일을 그대로 보여주고
// - /api/<이름> 요청은 api/<이름>.js 파일로 연결한다.
// 실제 배포(Vercel)에서는 이 파일을 쓰지 않고, Vercel이 같은 방식으로 자동 처리한다.

import http from "node:http";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const ROOT = path.dirname(fileURLToPath(import.meta.url));
const PUBLIC_DIR = path.join(ROOT, "public");
const API_DIR = path.join(ROOT, "api");
const PORT = process.env.PORT || 3000;

// .env 파일이 있으면 읽어서 환경변수로 등록 (AI API 키 등)
try {
  const env = await fs.readFile(path.join(ROOT, ".env"), "utf8");
  for (const line of env.split(/\r?\n/)) {
    const match = line.match(/^\s*([\w.-]+)\s*=\s*(.*)\s*$/);
    if (match && !(match[1] in process.env)) process.env[match[1]] = match[2];
  }
} catch {
  // .env가 없어도 실행에는 문제 없음
}

const MIME = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".svg": "image/svg+xml",
  ".ico": "image/x-icon",
  ".mp3": "audio/mpeg",
};

// Vercel 함수와 같은 모양(res.status().json())을 쓸 수 있게 해 준다.
function addVercelHelpers(res) {
  res.status = (code) => {
    res.statusCode = code;
    return res;
  };
  res.json = (data) => {
    res.setHeader("Content-Type", "application/json; charset=utf-8");
    res.end(JSON.stringify(data));
  };
  return res;
}

async function readBody(req) {
  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  const text = Buffer.concat(chunks).toString("utf8");
  if (!text) return undefined;
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

async function handleApi(req, res, url) {
  const name = url.pathname.slice("/api/".length).replace(/\/$/, "");
  if (!/^[\w-]+$/.test(name)) return res.status(404).json({ error: "Not found" });

  const file = path.join(API_DIR, `${name}.js`);
  try {
    await fs.access(file);
  } catch {
    return res.status(404).json({ error: "Not found" });
  }

  req.query = Object.fromEntries(url.searchParams);
  req.body = await readBody(req);
  // 파일을 고치면 서버를 재시작하지 않아도 반영되도록 매번 새로 불러온다.
  const mod = await import(`${pathToFileURL(file).href}?t=${Date.now()}`);
  await mod.default(req, res);
}

async function handleStatic(res, url) {
  let pathname = decodeURIComponent(url.pathname);
  if (pathname.endsWith("/")) pathname += "index.html";

  const file = path.normalize(path.join(PUBLIC_DIR, pathname));
  if (!file.startsWith(PUBLIC_DIR)) return res.status(403).end("Forbidden");

  try {
    const data = await fs.readFile(file);
    res.setHeader("Content-Type", MIME[path.extname(file).toLowerCase()] || "application/octet-stream");
    res.end(data);
  } catch {
    res.status(404).setHeader("Content-Type", "text/plain; charset=utf-8");
    res.end("페이지를 찾을 수 없습니다.");
  }
}

const server = http.createServer(async (req, res) => {
  addVercelHelpers(res);
  const url = new URL(req.url, `http://${req.headers.host}`);
  try {
    if (url.pathname.startsWith("/api/")) await handleApi(req, res, url);
    else await handleStatic(res, url);
  } catch (err) {
    console.error(err);
    if (!res.headersSent) res.status(500).json({ error: "Server error" });
  }
});

server.listen(PORT, () => {
  console.log(`AI 도슨트 개발 서버 실행 중: http://localhost:${PORT}`);
});
