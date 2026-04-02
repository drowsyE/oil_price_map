#!/usr/bin/env node
// ============================================================
//  로컬 CORS 프록시 서버 — 오피넷 API 연동용
//  실행: node server.js
//  접속: http://localhost:3000
// ============================================================

const http = require("http");
const https = require("https");
const fs = require("fs");
const path = require("path");
const url = require("url");
require("dotenv").config();

const PORT = process.env.PORT || 3000;
const STATIC_DIR = __dirname;

// MIME 타입 매핑
const MIME = {
  ".html": "text/html; charset=utf-8",
  ".css":  "text/css; charset=utf-8",
  ".js":   "application/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".png":  "image/png",
  ".jpg":  "image/jpeg",
  ".ico":  "image/x-icon",
};

// ====== 오피넷 API 프록시 함수 ======
function proxyOpinet(apiUrl, res) {
  const parsed = url.parse(apiUrl);
  const options = {
    hostname: parsed.hostname,
    path:     parsed.path,
    method:   "GET",
    headers: {
      "User-Agent": "Mozilla/5.0"
    },
  };

  const req = https.request(options, (apiRes) => {
    let data = "";
    apiRes.on("data", (chunk) => (data += chunk));
    apiRes.on("end", () => {
      res.writeHead(200, {
        "Content-Type":                "application/json; charset=utf-8",
        "Access-Control-Allow-Origin": "*",
      });
      res.end(data);
    });
  });

  req.on("error", (e) => {
    console.error("프록시 오류:", e.message);
    res.writeHead(500, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ error: e.message }));
  });

  req.end();
}

// ====== HTTP 서버 ======
const server = http.createServer((req, res) => {
  const parsed = url.parse(req.url, true);
  const pathname = parsed.pathname;

  // CORS 헤더
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, OPTIONS");

  if (req.method === "OPTIONS") {
    res.writeHead(204);
    res.end();
    return;
  }

  // ── /config.js 가상 파일 (환경 변수 주입) ──
  if (pathname === "/config.js" || pathname === "/config.js/") {
    res.writeHead(200, { "Content-Type": "application/javascript; charset=utf-8" });
    res.end(`// Backend-generated configuration
const CONFIG = {
  GOOGLE_MAPS_API_KEY: "${process.env.GOOGLE_MAPS_API_KEY || ""}",
  DEFAULT_RADIUS: 3000,
  DEFAULT_FUEL: "B027",
  USE_MOCK_DATA: false
};
`);
    return;
  }

  // ── /api/* → 오피넷 API 프록시 ──
  if (pathname.startsWith("/api/")) {
    const targetPath = pathname.replace(/^\/api/, "");
    let queryStr   = req.url.includes("?") ? req.url.slice(req.url.indexOf("?")) : "";
    
    // 백엔드에서 오피넷 키를 몰래 주입하여 프론트엔드 노출 방지
    if (process.env.OPINET_API_KEY) {
      queryStr += (queryStr ? "&" : "?") + `certkey=${process.env.OPINET_API_KEY}`;
    }
    
    const apiUrl     = `http://www.opinet.co.kr/api${targetPath}${queryStr}`;
    console.log(`[PROXY] ${apiUrl}`);
    proxyOpinet(apiUrl, res);
    return;
  }

  // ── 정적 파일 서빙 ──
  let filePath = path.join(STATIC_DIR, pathname === "/" ? "index.html" : pathname);

  // 경로 트래버설 방지
  if (!filePath.startsWith(STATIC_DIR)) {
    res.writeHead(403);
    res.end("Forbidden");
    return;
  }

  const ext  = path.extname(filePath);
  const mime = MIME[ext] || "application/octet-stream";

  fs.readFile(filePath, (err, data) => {
    if (err) {
      if (err.code === "ENOENT") {
        res.writeHead(404);
        res.end("Not Found: " + pathname);
      } else {
        res.writeHead(500);
        res.end("Server Error");
      }
      return;
    }
    res.writeHead(200, { "Content-Type": mime });
    res.end(data);
  });
});

server.listen(PORT, () => {
  console.log(`\n✅ 주유소 가격 지도 서버 실행 중`);
  console.log(`📍 접속 주소: http://localhost:${PORT}`);
  console.log(`\nCtrl+C 로 서버를 종료할 수 있습니다.\n`);
});
