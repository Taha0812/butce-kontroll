/* dom.server.test.js — Uçtan uca test: jsdom + gerçek sunucu API'si (sunucu modu)
   jsdom'a Node fetch'i verilir; kayıt/giriş/veri senkronu gerçek HTTP ile yapılır. */
const { JSDOM, VirtualConsole } = require("jsdom");
const { spawn } = require("child_process");
const path = require("path");
const fs = require("fs");
const os = require("os");

const INDEX = path.join(__dirname, "..", "index.html");
const SERVER = path.join(__dirname, "..", "server.js");
const PORT = 8210;
const BASE = `http://127.0.0.1:${PORT}`;
const DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "bc-e2e-"));

const vc = new VirtualConsole();
const errors = [];
vc.on("jsdomError", (e) => (/Not implemented/.test(e.message) ? null : errors.push("jsdomError: " + e.message)));
vc.on("error", (...a) => errors.push("console.error: " + a.join(" ")));

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
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

async function api(p, method, body, token) {
  const headers = { "Content-Type": "application/json" };
  if (token) headers.Authorization = "Bearer " + token;
  const r = await fetch(BASE + p, { method: method || "GET", headers, body: body ? JSON.stringify(body) : undefined });
  let data = null;
  try {
    data = await r.json();
  } catch (e) {}
  return { status: r.status, data };
}

(async () => {
  const child = spawn(process.execPath, [SERVER], {
    env: { ...process.env, PORT: String(PORT), BC_DATA_DIR: DATA_DIR },
    stdio: ["ignore", "pipe", "pipe"],
  });
  let log = "";
  child.stdout.on("data", (d) => (log += d));
  child.stderr.on("data", (d) => (log += d));

  let up = false;
  for (let i = 0; i < 60 && !up; i++) {
    try {
      up = (await fetch(BASE + "/api/health")).ok;
    } catch (e) {}
    if (!up) await wait(250);
  }
  if (!up) {
    console.error("Sunucu açılamadı:\n" + log);
    process.exit(2);
  }

  const dom = await JSDOM.fromFile(INDEX, {
    url: BASE + "/",
    runScripts: "dangerously",
    resources: "usable",
    pretendToBeVisual: true,
    virtualConsole: vc,
    beforeParse(window) {
      // jsdom'da fetch yok → Node fetch'i vererek gerçek API ile konuşmasını sağla
      window.fetch = (input, init) => fetch(new URL(String(input), BASE + "/").toString(), init || {});
    },
  });
  const w = dom.window;
  const d = w.document;

  await new Promise((res) => {
    if (d.readyState === "complete") res();
    else w.addEventListener("load", res);
    setTimeout(res, 8000);
  });
  await wait(900);

  const gate = d.querySelector("#authScreen");
  const authUser = () => d.querySelector("#authUser");
  const authPass = () => d.querySelector("#authPass");
  const authErr = () => d.querySelector("#authError").textContent;

  console.log("\nSunucu modu tespiti:");
  check("Auth sunucu modunda", w.Auth.mode === "server", w.Auth.mode);
  check("giriş ekranı görünür", !gate.hidden);
  check("sunucu modu rozeti", /Sunucu modu/.test(d.querySelector("#authMode").textContent), d.querySelector("#authMode").textContent);

  console.log("\nKayıt (gerçek API):");
  d.querySelector('[data-auth-tab="register"]').click();
  authUser().value = "serveruser";
  authPass().value = "sifre123";
  d.querySelector("#regEmail").value = "server@ornek.com";
  d.querySelector("#regAnswer").value = "kopek";
  d.querySelector("#authSubmit").click();
  await wait(700);
  check("kayıt oldu, uygulama açıldı", gate.hidden === true && w.Auth.user() === "serveruser", w.Auth.user());
  check("oturum sunucu modunda", w.Auth.session && w.Auth.session.mode === "server", w.Auth.session);
  check("yerel önbellek anahtarı", w.localStorage.getItem("butceKontroll.data.serveruser") !== null);
  const usersOnDisk = JSON.parse(fs.readFileSync(path.join(DATA_DIR, "users.json"), "utf8"));
  check("kullanıcı diske yazıldı", !!usersOnDisk["serveruser"], Object.keys(usersOnDisk));
  check("e-posta diske yazıldı", usersOnDisk.serveruser.email === "server@ornek.com", usersOnDisk.serveruser.email);
  check("güvenlik sorusu diske yazıldı", /evcil hayvan/.test(usersOnDisk.serveruser.security.question), usersOnDisk.serveruser.security);
  check("cevap hash'lendi (düz metin yok)", JSON.stringify(usersOnDisk.serveruser.security).indexOf("kopek") === -1);
  check("şifre hash'lendi", usersOnDisk.serveruser.hash.indexOf("sifre123") === -1);
  check("Auth.email() geliyor", w.Auth.email() === "server@ornek.com", w.Auth.email());

  console.log("\nKayıt ekleme → otomatik senkron:");
  d.querySelector("#btnAdd").click();
  await wait(60);
  d.querySelector('[data-cat="market"]').click();
  ["1", "9", "9", ".", "9", "0"].forEach((k) => d.querySelector(`#addKeypad [data-key="${k}"]`).click());
  d.querySelector("#addSave").click();
  await wait(80);
  check("işlem yerelde duruyor", w.Store.allTx().length === 1, w.Store.allTx().length);
  await wait(2200); // 1.2 sn debounce + ağ
  const login = await api("/api/login", "POST", { username: "serveruser", password: "sifre123" });
  const remote = await api("/api/data", "GET", null, login.data.token);
  check("işlem sunucuya gitti", remote.data && remote.data.state && remote.data.state.transactions.length === 1, remote.data);
  check("işlem tutarı doğru", remote.data.state.transactions[0].amount === 199.9, remote.data.state.transactions[0]);

  console.log("\nÇıkış & tekrar giriş:");
  await w.Auth.logout();
  await wait(250);
  check("giriş ekranına döndü", !gate.hidden);
  check("misafir veriye düştü", w.Store.allTx().length === 0, w.Store.allTx().length);
  d.querySelector('[data-auth-tab="login"]').click();
  authUser().value = "serveruser";
  authPass().value = "sifre999";
  d.querySelector("#authSubmit").click();
  await wait(300);
  check("yanlış şifre → hata", /hatalı/.test(authErr()), authErr());
  authPass().value = "sifre123";
  d.querySelector("#authSubmit").click();
  await wait(700);
  check("giriş yapıldı", gate.hidden === true && w.Auth.user() === "serveruser");
  check("kayıtlar sunucudan geri geldi", w.Store.allTx().length === 1 && w.Store.allTx()[0].amount === 199.9, w.Store.allTx());

  console.log("\nE-posta ile giriş:");
  await w.Auth.logout();
  await wait(250);
  d.querySelector('[data-auth-tab="login"]').click();
  authUser().value = "server@ornek.com";
  authPass().value = "sifre123";
  d.querySelector("#authSubmit").click();
  await wait(800);
  check("e-posta ile giriş yapıldı", gate.hidden === true && w.Auth.user() === "serveruser", w.Auth.user());
  check("e-posta oturumda", w.Auth.email() === "server@ornek.com", w.Auth.email());

  console.log("\nŞifre sıfırlama (güvenlik sorusu):");
  const nope = await api("/api/security-question", "POST", { identifier: "boylebiri" });
  check("bilinmeyen hesap → 404", nope.status === 404, nope);
  const q = await api("/api/security-question", "POST", { identifier: "server@ornek.com" });
  check("e-posta ile soru bulundu", q.status === 200 && /evcil hayvan/.test(q.data.question), q.data);

  await w.Auth.logout();
  await wait(250);
  d.querySelector('[data-auth-tab="reset"]').click();
  authUser().value = "server@ornek.com";
  d.querySelector("#resetAsk").click();
  await wait(500);
  check("soru ekrana geldi", /evcil hayvan/.test(d.querySelector("#resetQuestionText").textContent), d.querySelector("#resetQuestionText").textContent);
  d.querySelector("#resetAnswer").value = "yanlis-cevap";
  d.querySelector("#resetPass").value = "yenieski42";
  d.querySelector("#resetDo").click();
  await wait(500);
  check("yanlış cevap reddedildi", /Cevap doğru değil/.test(authErr()), authErr());
  check("hâlâ giriş ekranındayız", !gate.hidden);
  d.querySelector("#resetAnswer").value = "  KoPeK "; // boşluk + büyük/küçük harf → normalize
  d.querySelector("#resetPass").value = "yenieski42";
  d.querySelector("#resetDo").click();
  await wait(800);
  check("şifre yenilendi, oturum açıldı", gate.hidden === true && w.Auth.user() === "serveruser", w.Auth.user());
  check("kayıtlar korundu", w.Store.allTx().length === 1, w.Store.allTx().length);

  const oldLogin = await api("/api/login", "POST", { identifier: "serveruser", password: "sifre123" });
  check("eski şifre artık reddediliyor", oldLogin.status === 401, oldLogin);
  const newLogin = await api("/api/login", "POST", { identifier: "server@ornek.com", password: "yenieski42" });
  check("yeni şifre + e-posta giriş veriyor", newLogin.status === 200 && !!newLogin.data.token, newLogin);

  console.log("\nİkinci hesap (izolasyon):");
  await w.Auth.logout();
  await wait(250);
  d.querySelector('[data-auth-tab="register"]').click();
  authUser().value = "ikinci";
  authPass().value = "sifre456";
  d.querySelector("#regEmail").value = "";
  d.querySelector("#regAnswer").value = "kedi";
  d.querySelector("#authSubmit").click();
  await wait(700);
  check("ikinci hesap açıldı", gate.hidden === true && w.Auth.user() === "ikinci", w.Auth.user());
  check("ikinci hesap boş (izolasyon)", w.Store.allTx().length === 0, w.Store.allTx().length);
  check("ayrı veri anahtarı", w.localStorage.getItem("butceKontroll.data.ikinci") !== null);

  const usersFinal = JSON.parse(fs.readFileSync(path.join(DATA_DIR, "users.json"), "utf8"));
  check("diskte 2 kullanıcı", Object.keys(usersFinal).length === 2, Object.keys(usersFinal));
  check("konsol hatası yok", errors.length === 0, errors.slice(0, 5));

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
