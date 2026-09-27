/* server.js — Bütçe Kontroll yerel sunucusu
   Bağımlılık yok (yalnızca Node standart kütüphanesi).
   • Statik dosya sunumu (index.html, css, js)
   • Hesap API'si: kayıt / giriş / çıkış / veri okuma-yazma
   • Her hesabın kaydı data/<kullanıcı>.json dosyasında ayrı ayrı saklanır
   • Parolalar scrypt ile hash'lenir, oturumlar rastgele token ile tutulur */
"use strict";

const http = require("http");
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

const PORT = Number(process.env.PORT) || 8123;
const ROOT = __dirname;
const DATA_DIR = process.env.BC_DATA_DIR || path.join(ROOT, "data"); // veriler kullanıcı bazında burada
const USERS_FILE = path.join(DATA_DIR, "users.json");
const SESSIONS_FILE = path.join(DATA_DIR, "sessions.json");
const SESSION_TTL = 45 * 24 * 60 * 60 * 1000; // 45 gün
const MAX_BODY = 6 * 1024 * 1024; // 6 MB

const MIME = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".md": "text/markdown; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".ico": "image/x-icon",
  ".bat": "text/plain; charset=utf-8",
  ".txt": "text/plain; charset=utf-8",
};

/* ---------------- Depolama yardımcıları ---------------- */
function ensureData() {
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
  if (!fs.existsSync(USERS_FILE)) fs.writeFileSync(USERS_FILE, "{}");
  if (!fs.existsSync(SESSIONS_FILE)) fs.writeFileSync(SESSIONS_FILE, "{}");
}

function readJSON(file, fallback) {
  try {
    return JSON.parse(fs.readFileSync(file, "utf8"));
  } catch (e) {
    return fallback;
  }
}

function writeJSON(file, obj) {
  const tmp = file + ".tmp";
  fs.writeFileSync(tmp, JSON.stringify(obj, null, 2));
  fs.renameSync(tmp, file); // atomik yazma — yarım kayıt kalmaz
}

const normUser = (u) => String(u || "").trim().toLowerCase();
const normAnswer = (a) => String(a || "").trim().toLowerCase().replace(/\s+/g, " ");
const userFile = (u) => path.join(DATA_DIR, "u_" + crypto.createHash("sha256").update(normUser(u)).digest("hex").slice(0, 24) + ".json");

function validUser(u) {
  return /^[a-z0-9_.-]{3,24}$/.test(normUser(u));
}
function validPass(p) {
  return typeof p === "string" && p.length >= 6 && p.length <= 100;
}
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
function validEmail(e) {
  return !e || (typeof e === "string" && e.length <= 120 && EMAIL_RE.test(e));
}
function hashPass(password, salt) {
  return crypto.scryptSync(String(password), salt, 64).toString("hex");
}
function safeEqual(a, b) {
  const ab = Buffer.from(String(a), "utf8");
  const bb = Buffer.from(String(b), "utf8");
  if (ab.length !== bb.length) return false;
  return crypto.timingSafeEqual(ab, bb);
}
/* identifier: kullanıcı adı veya e-posta */
function findUser(users, identifier) {
  const id = normUser(identifier);
  if (!id) return null;
  if (users[id]) return id;
  if (id.includes("@")) {
    const hit = Object.keys(users).find((k) => users[k].email && users[k].email === id);
    if (hit) return hit;
  }
  return null;
}
function emailOwner(users, email) {
  if (!email) return null;
  return Object.keys(users).find((k) => users[k].email && users[k].email === email) || null;
}
function issueToken(user) {
  const token = crypto.randomBytes(24).toString("hex");
  const sessions = readJSON(SESSIONS_FILE, {});
  sessions[token] = { user, exp: Date.now() + SESSION_TTL, createdAt: Date.now() };
  writeJSON(SESSIONS_FILE, sessions);
  return token;
}

/* ---------------- Basit hız sınırı (başarısız denemeler) ---------------- */
const attempts = new Map();
function isLimited(ip) {
  const now = Date.now();
  const rec = attempts.get(ip);
  if (!rec || now > rec.resetAt) return false;
  return rec.count >= 8;
}
function bumpAttempt(ip) {
  const now = Date.now();
  const rec = attempts.get(ip) || { count: 0, resetAt: now + 10 * 60 * 1000 };
  rec.count += 1;
  attempts.set(ip, rec);
}
function clearAttempts(ip) {
  attempts.delete(ip);
}

/* ---------------- HTTP yardımcıları ---------------- */
function json(res, status, obj) {
  const body = JSON.stringify(obj);
  res.writeHead(status, { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" });
  res.end(body);
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let size = 0;
    const chunks = [];
    req.on("data", (c) => {
      size += c.length;
      if (size > MAX_BODY) {
        reject(new Error("Çok büyük istek"));
        req.destroy();
        return;
      }
      chunks.push(c);
    });
    req.on("end", () => {
      if (!chunks.length) return resolve({});
      try {
        resolve(JSON.parse(Buffer.concat(chunks).toString("utf8")));
      } catch (e) {
        reject(new Error("Geçersiz JSON"));
      }
    });
    req.on("error", reject);
  });
}

function authUser(req) {
  const h = req.headers["authorization"] || "";
  const token = h.replace(/^Bearer\s+/i, "").trim();
  if (!token) return null;
  const sessions = readJSON(SESSIONS_FILE, {});
  const s = sessions[token];
  if (!s || !s.exp || s.exp < Date.now()) return null;
  return { user: s.user, token };
}

/* ---------------- API yönlendirici ---------------- */
async function handleApi(req, res, urlPath) {
  const ip = req.socket.remoteAddress || "?";

  if (urlPath === "/api/health") return json(res, 200, { ok: true, name: "butce-kontroll", api: 1 });

  if (urlPath === "/api/register" && req.method === "POST") {
    if (isLimited(ip)) return json(res, 429, { error: "Çok fazla deneme, biraz bekleyin" });
    const body = await readBody(req);
    const user = normUser(body.username);
    const pass = body.password;
    const email = body.email ? normUser(body.email) : null; // lowercase
    const question = String(body.question || "").trim();
    const answer = String(body.answer || "").trim();
    if (!validUser(user)) return json(res, 400, { error: "Kullanıcı adı 3–24 karakter olmalı (harf, rakam, . _ -)" });
    if (!validPass(pass)) return json(res, 400, { error: "Şifre en az 6 karakter olmalı" });
    if (!validEmail(email)) return json(res, 400, { error: "E-posta biçimi geçersiz" });
    // güvenlik sorusu opsiyonel; ama verildiyse sağlam olmalı
    if (question || answer) {
      if (question.length < 4) return json(res, 400, { error: "Güvenlik sorusu en az 4 karakter olmalı" });
      if (answer.length < 2) return json(res, 400, { error: "Güvenlik sorusu cevabı en az 2 karakter olmalı" });
    }

    const users = readJSON(USERS_FILE, {});
    if (users[user]) return json(res, 409, { error: "Bu kullanıcı adı zaten kayıtlı" });
    const byEmail = emailOwner(users, email);
    if (byEmail) return json(res, 409, { error: "Bu e-posta zaten kayıtlı (@" + byEmail + ")" });

    const salt = crypto.randomBytes(16).toString("hex");
    const secSalt = crypto.randomBytes(16).toString("hex");
    users[user] = {
      salt,
      hash: hashPass(pass, salt),
      email: email || null,
      security: question && answer ? { question, salt: secSalt, hash: hashPass(normAnswer(answer), secSalt) } : null,
      createdAt: Date.now(),
    };
    writeJSON(USERS_FILE, users);
    writeJSON(userFile(user), null); // boş veri dosyası oluştur

    const token = issueToken(user);
    clearAttempts(ip);
    return json(res, 201, { token, user, email: email || null });
  }

  if (urlPath === "/api/login" && req.method === "POST") {
    if (isLimited(ip)) return json(res, 429, { error: "Çok fazla deneme, biraz bekleyin" });
    const body = await readBody(req);
    const users = readJSON(USERS_FILE, {});
    const identifier = body.identifier != null ? body.identifier : body.username;
    const user = findUser(users, identifier);
    const rec = user ? users[user] : null;
    if (!rec || !safeEqual(hashPass(body.password || "", rec.salt), rec.hash)) {
      bumpAttempt(ip);
      return json(res, 401, { error: "Kullanıcı adı veya şifre hatalı" });
    }
    const token = issueToken(user);
    clearAttempts(ip);
    return json(res, 200, { token, user, email: rec.email || null });
  }

  /* Güvenlik sorusunu getir (şifre sıfırlama adımı 1) */
  if (urlPath === "/api/security-question" && req.method === "POST") {
    const body = await readBody(req);
    const users = readJSON(USERS_FILE, {});
    const user = findUser(users, body.identifier);
    const rec = user ? users[user] : null;
    if (!rec) return json(res, 404, { error: "Böyle bir hesap bulunamadı" });
    if (!rec.security) return json(res, 400, { error: "Bu hesapta güvenlik sorusu tanımlı değil" });
    return json(res, 200, { question: rec.security.question });
  }

  /* Şifre sıfırlama (adım 2) — eski oturumlar iptal edilir */
  if (urlPath === "/api/reset-password" && req.method === "POST") {
    if (isLimited(ip)) return json(res, 429, { error: "Çok fazla deneme, biraz bekleyin" });
    const body = await readBody(req);
    const users = readJSON(USERS_FILE, {});
    const user = findUser(users, body.identifier);
    const rec = user ? users[user] : null;
    if (!rec) {
      bumpAttempt(ip);
      return json(res, 404, { error: "Böyle bir hesap bulunamadı" });
    }
    if (!rec.security) return json(res, 400, { error: "Bu hesapta güvenlik sorusu tanımlı değil" });
    if (!safeEqual(hashPass(normAnswer(body.answer), rec.security.salt), rec.security.hash)) {
      bumpAttempt(ip);
      return json(res, 401, { error: "Cevap doğru değil" });
    }
    if (!validPass(body.password)) return json(res, 400, { error: "Yeni şifre en az 6 karakter olmalı" });

    const salt = crypto.randomBytes(16).toString("hex");
    rec.salt = salt;
    rec.hash = hashPass(body.password, salt);
    rec.updatedAt = Date.now();
    users[user] = rec;
    writeJSON(USERS_FILE, users);

    // kullanıcının eski tüm oturumlarını kapat
    const sessions = readJSON(SESSIONS_FILE, {});
    Object.keys(sessions).forEach((t) => {
      if (sessions[t].user === user) delete sessions[t];
    });
    writeJSON(SESSIONS_FILE, sessions);
    clearAttempts(ip);

    const token = issueToken(user);
    return json(res, 200, { token, user, email: rec.email || null });
  }

  const me = authUser(req);

  if (urlPath === "/api/logout" && req.method === "POST") {
    if (me) {
      const sessions = readJSON(SESSIONS_FILE, {});
      delete sessions[me.token];
      writeJSON(SESSIONS_FILE, sessions);
    }
    return json(res, 200, { ok: true });
  }

  if (!me) return json(res, 401, { error: "Oturum açmanız gerekiyor" });

  if (urlPath === "/api/me" && req.method === "GET") {
    const users = readJSON(USERS_FILE, {});
    const rec = users[me.user] || {};
    return json(res, 200, { user: me.user, email: rec.email || null, serverTime: Date.now() });
  }

  if (urlPath === "/api/data" && req.method === "GET") {
    const state = readJSON(userFile(me.user), null);
    return json(res, 200, { user: me.user, state, updatedAt: (fs.existsSync(userFile(me.user)) ? fs.statSync(userFile(me.user)).mtimeMs : 0) });
  }

  if (urlPath === "/api/data" && req.method === "PUT") {
    const body = await readBody(req);
    if (!body || typeof body.state !== "object" || body.state === null)
      return json(res, 400, { error: "Geçersiz veri" });
    writeJSON(userFile(me.user), body.state);
    // kullanıcı listesinde son senkron zamanı tut
    const users = readJSON(USERS_FILE, {});
    if (users[me.user]) {
      users[me.user].updatedAt = Date.now();
      writeJSON(USERS_FILE, users);
    }
    return json(res, 200, { ok: true, savedAt: Date.now() });
  }

  return json(res, 404, { error: "Bulunamadı: " + urlPath });
}

/* ---------------- Statik dosya sunumu ---------------- */
function serveStatic(req, res, urlPath) {
  if (urlPath === "/") urlPath = "/index.html";
  if (urlPath.startsWith("/data/") || urlPath === "/server.js" || urlPath.endsWith(".tmp"))
    return json(res, 403, { error: "Yasak" });

  const rel = path.normalize(decodeURIComponent(urlPath)).replace(/^(\.\.[/\\])+/, "");
  const filePath = path.join(ROOT, rel);
  if (!filePath.startsWith(ROOT)) return json(res, 403, { error: "Yasak" });

  fs.stat(filePath, (err, st) => {
    if (err || !st.isFile()) return json(res, 404, { error: "Bulunamadı: " + urlPath });
    const ext = path.extname(filePath).toLowerCase();
    res.writeHead(200, {
      "Content-Type": MIME[ext] || "application/octet-stream",
      "Content-Length": st.size,
      "Cache-Control": "no-cache",
    });
    fs.createReadStream(filePath).pipe(res);
  });
}

/* ---------------- Sunucu ---------------- */
const server = http.createServer(async (req, res) => {
  const urlPath = "/" + String(req.url || "/").replace(/^\/+/, "").split("?")[0];
  try {
    if (urlPath.startsWith("/api/")) {
      if (!["GET", "POST", "PUT"].includes(req.method)) return json(res, 405, { error: "Metot yok" });
      await handleApi(req, res, urlPath);
    } else {
      if (req.method !== "GET" && req.method !== "HEAD") return json(res, 405, { error: "Metot yok" });
      serveStatic(req, res, urlPath);
    }
  } catch (e) {
    console.error("[hata]", req.method, urlPath, "→", e.message);
    if (!res.headersSent) json(res, 500, { error: "Sunucu hatası" });
    else res.end();
  }
});

ensureData();

server.listen(PORT, () => {
  console.log("");
  console.log("  ₺ Bütçe Kontroll sunucusu hazır");
  console.log("  ├─ Uygulama : http://localhost:" + PORT);
  console.log("  ├─ API      : http://localhost:" + PORT + "/api/health");
  console.log("  └─ Veriler  : " + DATA_DIR);
  console.log("");
  console.log("  Hesaplar ve kayıtlar data\\ klasöründe kullanıcı bazında saklanır.");
  console.log("  Durdurmak için bu pencereyi kapat (Ctrl+C).");
  console.log("");
});

process.on("SIGINT", () => {
  console.log("\n  Sunucu kapatılıyor...");
  server.close(() => process.exit(0));
  setTimeout(() => process.exit(0), 1500);
});
