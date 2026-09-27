/* server.test.js — Hesap API'si ve kullanıcı izolasyonu testleri */
const { spawn } = require("child_process");
const path = require("path");
const fs = require("fs");
const os = require("os");

const PORT = 8199;
const BASE = `http://127.0.0.1:${PORT}`;
const SERVER = path.join(__dirname, "..", "server.js");
const DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "bc-data-"));

let pass = 0,
  fail = 0;
const check = (name, cond, extra) => {
  if (cond) {
    pass++;
    console.log("  ✓ " + name);
  } else {
    fail++;
    console.log("  ✗ " + name + (extra !== undefined ? "  → " + JSON.stringify(extra).slice(0, 300) : ""));
  }
};

async function call(p, method = "GET", body, token) {
  const headers = { "Content-Type": "application/json" };
  if (token) headers.Authorization = "Bearer " + token;
  const r = await fetch(BASE + p, { method, headers, body: body ? JSON.stringify(body) : undefined });
  let data = null;
  try {
    data = await r.json();
  } catch (e) {}
  return { status: r.status, data };
}

async function waitForServer() {
  for (let i = 0; i < 60; i++) {
    try {
      const r = await fetch(BASE + "/api/health");
      if (r.ok) return true;
    } catch (e) {}
    await new Promise((r) => setTimeout(r, 250));
  }
  return false;
}

(async () => {
  const child = spawn(process.execPath, [SERVER], {
    env: { ...process.env, PORT: String(PORT), BC_DATA_DIR: DATA_DIR },
    stdio: ["ignore", "pipe", "pipe"],
  });
  let serverLog = "";
  child.stdout.on("data", (d) => (serverLog += d));
  child.stderr.on("data", (d) => (serverLog += d));

  const up = await waitForServer();
  if (!up) {
    console.error("Sunucu başlatılamadı:\n" + serverLog);
    process.exit(2);
  }

  console.log("\nSağlık & statik:");
  const h = await call("/api/health");
  check("GET /api/health → 200", h.status === 200 && h.data.ok === true, h.data);
  const idx = await fetch(BASE + "/");
  const html = await idx.text();
  check("index.html sunuluyor", idx.status === 200 && html.includes("Bütçe Kontroll"));
  const css = await fetch(BASE + "/css/styles.css");
  check("styles.css sunuluyor", css.status === 200);
  const dataFile = await fetch(BASE + "/data/users.json");
  check("data/ klasörüne erişim yasak (403)", dataFile.status === 403, dataFile.status);
  const srvFile = await fetch(BASE + "/server.js");
  check("server.js'e erişim yasak (403)", srvFile.status === 403, srvFile.status);
  const trav = await fetch(BASE + "/../opencode.json");
  check("path traversal engelleniyor", trav.status !== 200, trav.status);

  console.log("\nKayıt:");
  const r1 = await call("/api/register", "POST", { username: "ahmet", password: "sifre123" });
  check("kayıt başarılı → token", r1.status === 201 && !!r1.data.token && r1.data.user === "ahmet", r1.data);
  const tokA = r1.data && r1.data.token;

  const r2 = await call("/api/register", "POST", { username: "Ahmet", password: "baska123" });
  check("aynı kullanıcı adı tekrar reddedildi (409)", r2.status === 409, r2.status);
  const r3 = await call("/api/register", "POST", { username: "ab", password: "sifre123" });
  check("kısa kullanıcı adı reddedildi (400)", r3.status === 400, r3.status);
  const r4 = await call("/api/register", "POST", { username: "mehmet", password: "123" });
  check("kısa şifre reddedildi (400)", r4.status === 400, r4.status);

  console.log("\nGiriş:");
  const bad = await call("/api/login", "POST", { username: "ahmet", password: "yanlis1" });
  check("yanlış şifre → 401", bad.status === 401, bad.status);
  const bad2 = await call("/api/login", "POST", { username: "olmayan", password: "sifre123" });
  check("olmayan kullanıcı → 401", bad2.status === 401, bad2.status);
  const ok2 = await call("/api/login", "POST", { username: "ahmet", password: "sifre123" });
  check("doğru şifre → token", ok2.status === 200 && !!ok2.data.token, ok2.data);
  const loginTok = ok2.data.token;

  const me = await call("/api/me", "GET", null, loginTok);
  check("GET /api/me kullanıcıyı döndürür", me.status === 200 && me.data.user === "ahmet", me.data);
  const meNoTok = await call("/api/me");
  check("tokensız /api/me → 401", meNoTok.status === 401, meNoTok.status);

  console.log("\nVeri yazma / okuma:");
  const state = { version: 1, settings: { periodBudget: 15000, periodStartDay: 15 }, transactions: [{ id: "t1", type: "expense", amount: 250, categoryId: "market", date: "2026-09-27" }], cards: [], assets: [], rates: null, __savedAt: 111 };
  const put = await call("/api/data", "PUT", { state }, tokA);
  check("PUT /api/data → 200", put.status === 200 && put.data.ok === true, put.data);
  const getA = await call("/api/data", "GET", null, tokA);
  check("veri geri okundu", getA.status === 200 && getA.data.state && getA.data.state.transactions.length === 1, getA.data);
  check("bütçe ayarı korunuyor", getA.data.state.settings.periodBudget === 15000);
  const putNoTok = await call("/api/data", "PUT", { state });
  check("tokensız yazma → 401", putNoTok.status === 401, putNoTok.status);

  console.log("\nHesap izolasyonu:");
  const r5 = await call("/api/register", "POST", { username: "ayse", password: "sifre456" });
  check("ikinci hesap açıldı", r5.status === 201, r5.status);
  const tokB = r5.data.token;
  const getB = await call("/api/data", "GET", null, tokB);
  check("B hesabının verisi boş", getB.status === 200 && (getB.data.state === null || !getB.data.state || !getB.data.state.transactions || getB.data.state.transactions.length === 0), getB.data);
  const stateB = { version: 1, settings: {}, transactions: [{ id: "tb", type: "income", amount: 99999, categoryId: "maas", date: "2026-09-27" }], cards: [], assets: [], __savedAt: 222 };
  await call("/api/data", "PUT", { state: stateB }, tokB);
  const getA2 = await call("/api/data", "GET", null, tokA);
  check("B yazdıktan sonra A'nın verisi değişmedi", getA2.data.state.transactions.length === 1 && getA2.data.state.transactions[0].amount === 250, getA2.data.state.transactions);
  const getB2 = await call("/api/data", "GET", null, tokB);
  check("B'nin kendi verisi yerinde", getB2.data.state.transactions[0].amount === 99999, getB2.data.state.transactions);

  console.log("\nDosya düzeyinde izolasyon:");
  const files = fs.readdirSync(DATA_DIR).filter((f) => f.startsWith("u_"));
  check("iki ayrı kullanıcı dosyası oluştu", files.length === 2, files);
  const usersJson = JSON.parse(fs.readFileSync(path.join(DATA_DIR, "users.json"), "utf8"));
  check("kayıtlı 2 kullanıcı", Object.keys(usersJson).length === 2, Object.keys(usersJson));
  check("parolalar düz metin değil", Object.values(usersJson).every((u) => /^[0-9a-f]{128}$/.test(u.hash)), Object.values(usersJson).map((u) => u.hash && u.hash.slice(0, 10)));
  const aFiles = files.map((f) => JSON.parse(fs.readFileSync(path.join(DATA_DIR, f), "utf8")));
  const aTxs = aFiles.map((s) => (s && s.transactions ? s.transactions[0] && s.transactions[0].amount : null));
  check("dosyalar farklı veriler içeriyor", aTxs.includes(250) && aTxs.includes(99999), aTxs);

  console.log("\nE-posta, güvenlik sorusu ve şifre sıfırlama:");
  const r6 = await call("/api/register", "POST", { username: "selin", password: "sifre789", email: "selin@ornek.com", question: "İlk evcil hayvanının adı neydi?", answer: "Pati" });
  check("e-posta + soru ile kayıt → 201", r6.status === 201 && r6.data.email === "selin@ornek.com", r6.data);
  const dupEm = await call("/api/register", "POST", { username: "selin2", password: "sifre789", email: "SELIN@ornek.com", question: "Doğduğun şehir neresi?", answer: "Ankara" });
  check("aynı e-posta (büyük harf) reddedildi → 409", dupEm.status === 409, dupEm.status);
  const badEmail = await call("/api/register", "POST", { username: "selin3", password: "sifre789", email: "gecersiz", question: "Doğduğun şehir neresi?", answer: "Ankara" });
  check("geçersiz e-posta → 400", badEmail.status === 400, badEmail.status);
  const badQ = await call("/api/register", "POST", { username: "selin4", password: "sifre789", question: "ab", answer: "x" });
  check("kısa soru/cevap → 400", badQ.status === 400, badQ.status);

  const emLogin = await call("/api/login", "POST", { identifier: "selin@ornek.com", password: "sifre789" });
  check("e-posta ile giriş → token", emLogin.status === 200 && emLogin.data.user === "selin", emLogin.data);
  const meSelin = await call("/api/me", "GET", null, emLogin.data.token);
  check("/api/me e-postayı döndürüyor", meSelin.status === 200 && meSelin.data.email === "selin@ornek.com", meSelin.data);

  const q1 = await call("/api/security-question", "POST", { identifier: "SELIN@ornek.com" });
  check("soru e-posta ile bulundu", q1.status === 200 && q1.data.question === "İlk evcil hayvanının adı neydi?", q1.data);
  const q2 = await call("/api/security-question", "POST", { identifier: "yokboylebiri" });
  check("olmayan hesapta soru → 404", q2.status === 404, q2.status);

  const wrongAns = await call("/api/reset-password", "POST", { identifier: "selin", answer: "kedi", password: "yeni12345" });
  check("yanlış cevap → 401", wrongAns.status === 401, wrongAns.status);
  const shortNew = await call("/api/reset-password", "POST", { identifier: "selin", answer: "pati", password: "123" });
  check("kısa yeni şifre → 400", shortNew.status === 400, shortNew.status);
  const reset = await call("/api/reset-password", "POST", { identifier: "selin", answer: "  PATI  ", password: "yeni12345" });
  check("doğru cevap → yeni token", reset.status === 200 && !!reset.data.token, reset.data);

  const meOld = await call("/api/me", "GET", null, emLogin.data.token);
  check("sıfırlamadan önceki oturum iptal", meOld.status === 401, meOld.status);
  const oldLogin = await call("/api/login", "POST", { identifier: "selin", password: "sifre789" });
  check("eski şifre artık reddedildi", oldLogin.status === 401, oldLogin.status);
  const newLogin = await call("/api/login", "POST", { identifier: "selin", password: "yeni12345" });
  check("yeni şifre giriş veriyor", newLogin.status === 200, newLogin.status);
  const usersAfter = JSON.parse(fs.readFileSync(path.join(DATA_DIR, "users.json"), "utf8"));
  check("cevap/şifre düz metin değil", !JSON.stringify(usersAfter.selin).includes("Pati") && !JSON.stringify(usersAfter.selin).includes("yeni12345"), Object.keys(usersAfter.selin));

  console.log("\nÇıkış:");
  const out = await call("/api/logout", "POST", null, tokA);
  check("logout → 200", out.status === 200, out.status);
  const meAfter = await call("/api/me", "GET", null, tokA);
  check("token geçersizleşti (401)", meAfter.status === 401, meAfter.status);
  const meB = await call("/api/me", "GET", null, tokB);
  check("diğer hesabın oturumu etkilenmedi", meB.status === 200, meB.status);

  console.log("\nSınır denemeleri:");
  let limited = false;
  for (let i = 0; i < 12; i++) {
    const rr = await call("/api/login", "POST", { username: "ayse", password: "yanlis" + i });
    if (rr.status === 429) {
      limited = true;
      break;
    }
  }
  check("art arda başarısız girişlerde hız sınırı devreye giriyor", limited);

  child.kill();
  try {
    fs.rmSync(DATA_DIR, { recursive: true, force: true });
  } catch (e) {}

  console.log(`\nSonuç: ${pass} başarılı, ${fail} başarısız`);
  process.exit(fail ? 1 : 0);
})().catch((e) => {
  console.error("TEST ÇÖKTÜ:", e);
  process.exit(2);
});
