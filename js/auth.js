/* auth.js — Kayıt / Giriş / Şifre sıfırlama / Oturum
   İki mod:
   • "server" — node server.js açıkken: hesaplar ve kayıtlar data\ klasöründe kullanıcı bazında saklanır
   • "local"  — sunucu yokken: hesaplar tarayıcıda (SHA-256 + tuz), veriler hesap başına ayrı anahtarda
   Her iki modda da bir hesabın kayıtları diğer hesaptan tamamen ayrıdır. */
window.Auth = (function () {
  "use strict";

  const SESSION_KEY = "butceKontroll.session";
  const ACCOUNTS_KEY = "butceKontroll.accounts";
  const ITER = 2500; // yerel parola uzatma turu

  let mode = "local"; // 'server' | 'local'
  let session = null; // { user, mode, token, email? }
  let saveTimer = null;
  let lastSync = 0;
  let tab = "login";

  const dataKey = (u) => "butceKontroll.data." + String(u).toLowerCase();
  const val = (id) => {
    const el = document.getElementById(id);
    return el ? el.value : "";
  };
  const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
  const normAnswer = (s) => String(s || "").trim().toLowerCase().replace(/\s+/g, " ");

  /* =========================================================
     SHA-256 (saf JS — tarayıcı ve test ortamında aynı sonuç)
  ========================================================= */
  const K256 = new Uint32Array([
    0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5,
    0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174,
    0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
    0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967,
    0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85,
    0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
    0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3,
    0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2,
  ]);

  function utf8Bytes(str) {
    if (typeof TextEncoder !== "undefined") return new TextEncoder().encode(str);
    const out = [];
    for (let i = 0; i < str.length; i++) {
      const c = str.charCodeAt(i);
      if (c < 0x80) out.push(c);
      else if (c < 0x800) out.push(0xc0 | (c >> 6), 0x80 | (c & 63));
      else out.push(0xe0 | (c >> 12), 0x80 | ((c >> 6) & 63), 0x80 | (c & 63));
    }
    return new Uint8Array(out);
  }

  const rotr = (x, n) => (x >>> n) | (x << (32 - n));

  function sha256(str) {
    const bytes = utf8Bytes(str);
    const l = bytes.length;
    const k = (56 - ((l + 1) % 64) + 64) % 64;
    const m = new Uint8Array(l + 1 + k + 8);
    m.set(bytes);
    m[l] = 0x80;
    const bits = l * 8;
    const hi = Math.floor(bits / 0x100000000);
    const lo = bits >>> 0;
    const end = m.length;
    m[end - 8] = (hi >>> 24) & 255;
    m[end - 7] = (hi >>> 16) & 255;
    m[end - 6] = (hi >>> 8) & 255;
    m[end - 5] = hi & 255;
    m[end - 4] = (lo >>> 24) & 255;
    m[end - 3] = (lo >>> 16) & 255;
    m[end - 2] = (lo >>> 8) & 255;
    m[end - 1] = lo & 255;

    const H = new Uint32Array([0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a, 0x510e527f, 0x9b05688c, 0x1f83d9ab, 0x5be0cd19]);
    const w = new Uint32Array(64);

    for (let i = 0; i < m.length; i += 64) {
      for (let t = 0; t < 16; t++) {
        const j = i + t * 4;
        w[t] = (m[j] << 24) | (m[j + 1] << 16) | (m[j + 2] << 8) | m[j + 3];
      }
      for (let t = 16; t < 64; t++) {
        const a15 = w[t - 15];
        const a2 = w[t - 2];
        const s0 = rotr(a15, 7) ^ rotr(a15, 18) ^ (a15 >>> 3);
        const s1 = rotr(a2, 17) ^ rotr(a2, 19) ^ (a2 >>> 10);
        w[t] = (w[t - 16] + s0 + w[t - 7] + s1) | 0;
      }
      let a = H[0], b = H[1], c = H[2], d = H[3], e = H[4], f = H[5], g = H[6], h = H[7];
      for (let t = 0; t < 64; t++) {
        const S1 = rotr(e, 6) ^ rotr(e, 11) ^ rotr(e, 25);
        const ch = (e & f) ^ (~e & g);
        const t1 = (h + S1 + ch + K256[t] + w[t]) | 0;
        const S0 = rotr(a, 2) ^ rotr(a, 13) ^ rotr(a, 22);
        const maj = (a & b) ^ (a & c) ^ (b & c);
        const t2 = (S0 + maj) | 0;
        h = g; g = f; f = e; e = (d + t1) | 0;
        d = c; c = b; b = a; a = (t1 + t2) | 0;
      }
      H[0] = (H[0] + a) | 0; H[1] = (H[1] + b) | 0; H[2] = (H[2] + c) | 0; H[3] = (H[3] + d) | 0;
      H[4] = (H[4] + e) | 0; H[5] = (H[5] + f) | 0; H[6] = (H[6] + g) | 0; H[7] = (H[7] + h) | 0;
    }
    let hex = "";
    for (let i = 0; i < 8; i++) hex += (H[i] >>> 0).toString(16).padStart(8, "0");
    return hex;
  }

  function stretch(salt, pass) {
    let h = sha256(salt + ":" + pass);
    for (let i = 1; i < ITER; i++) h = sha256(h + salt + ":" + i);
    return h;
  }

  const rndHex = (n) => {
    const arr = new Uint8Array(n);
    if (typeof crypto !== "undefined" && crypto.getRandomValues) crypto.getRandomValues(arr);
    else for (let i = 0; i < n; i++) arr[i] = Math.floor(Math.random() * 256);
    return Array.from(arr, (b) => b.toString(16).padStart(2, "0")).join("");
  };

  /* =========================================================
     Depolama (yerel mod)
  ========================================================= */
  function accounts() {
    try {
      const o = JSON.parse(localStorage.getItem(ACCOUNTS_KEY));
      return o && typeof o === "object" ? o : {};
    } catch (e) {
      return {};
    }
  }
  function setAccounts(a) {
    try {
      localStorage.setItem(ACCOUNTS_KEY, JSON.stringify(a));
    } catch (e) {}
  }
  function readLocal(key) {
    try {
      const v = localStorage.getItem(key);
      return v ? JSON.parse(v) : null;
    } catch (e) {
      return null;
    }
  }
  function writeSession() {
    try {
      if (session) localStorage.setItem(SESSION_KEY, JSON.stringify(session));
      else localStorage.removeItem(SESSION_KEY);
    } catch (e) {}
  }

  /* identifier: kullanıcı adı ya da e-posta — accounts() map'i verilirse üzerinde çalışır */
  function findLocalAccount(identifier, accs) {
    const id = String(identifier || "").trim().toLowerCase();
    const map = accs || accounts();
    if (map[id]) return { key: id, rec: map[id] };
    if (id.includes("@")) {
      const hit = Object.keys(map).find((k) => map[k].email && map[k].email === id);
      if (hit) return { key: hit, rec: map[hit] };
    }
    return null;
  }

  /* =========================================================
     Sunucu API'si
  ========================================================= */
  async function api(p, method, body) {
    if (typeof fetch !== "function") throw new Error("Sunucuya bağlanılamadı");
    const headers = { "Content-Type": "application/json" };
    if (session && session.token) headers.Authorization = "Bearer " + session.token;
    const r = await fetch(p, { method: method || "GET", headers, body: body === undefined ? undefined : JSON.stringify(body) });
    let data = null;
    try {
      data = await r.json();
    } catch (e) {}
    if (!r.ok) throw new Error((data && data.error) || "Sunucu hatası (" + r.status + ")");
    return data;
  }

  async function detect() {
    if (typeof fetch !== "function") return "local";
    try {
      const r = await fetch("/api/health", { cache: "no-store" });
      if (r.ok) {
        const j = await r.json().catch(() => null);
        if (j && j.ok) return "server";
      }
    } catch (e) {}
    return "local";
  }

  /* =========================================================
     Senkronizasyon (sunucu modu)
  ========================================================= */
  function scheduleSync() {
    if (mode !== "server" || !session || !session.token) return;
    clearTimeout(saveTimer);
    saveTimer = setTimeout(push, 1200);
  }

  async function push() {
    if (mode !== "server" || !session || !session.token) return;
    try {
      await api("/api/data", "PUT", { state: Store.state });
      lastSync = Date.now();
    } catch (e) {
      console.warn("Sunucuya senkronize edilemedi:", e.message);
    }
  }

  /* =========================================================
     Giriş ekranı
  ========================================================= */
  function showGate() {
    const g = document.getElementById("authScreen");
    if (g) g.hidden = false;
    setTab("login");
    // önceki oturumun alanları temizlensin (eski e-posta vb. taşınmasın)
    ["authUser", "authPass", "regEmail", "regAnswer", "resetAnswer", "resetPass", "regQuestionCustom"].forEach((id) => {
      const el = document.getElementById(id);
      if (el) el.value = "";
    });
    const sel = document.getElementById("regQuestion");
    if (sel) sel.selectedIndex = 0;
    const custom = document.getElementById("regQuestionCustom");
    if (custom) custom.hidden = true;
    renderMode();
  }
  function hideGate() {
    const g = document.getElementById("authScreen");
    if (g) g.hidden = true;
  }
  function showError(msg) {
    const e = document.getElementById("authError");
    if (!e) return;
    e.textContent = msg || "";
    e.hidden = !msg;
  }
  function setBusy(b) {
    const btn = document.getElementById("authSubmit");
    if (btn) {
      btn.disabled = b;
      btn.textContent = b ? "⏳ Lütfen bekleyin…" : tab === "register" ? "Kayıt ol" : "Giriş yap";
    }
    const ask = document.getElementById("resetAsk");
    if (ask) ask.disabled = b;
    const redo = document.getElementById("resetDo");
    if (redo) redo.disabled = b;
  }

  function setTab(next) {
    tab = next;
    document.querySelectorAll("[data-auth-tab]").forEach((b) => b.classList.toggle("active", b.dataset.authTab === next));
    const isLogin = next === "login";
    const isReg = next === "register";
    const isReset = next === "reset";
    const set = (id, prop, v) => {
      const el = document.getElementById(id);
      if (el) el[prop] = v;
    };
    set("fieldEmail", "hidden", !isReg);
    set("regExtra", "hidden", !isReg);
    set("resetExtra", "hidden", !isReset);
    set("fieldPass", "hidden", isReset);
    set("authSubmit", "hidden", isReset);
    set("resetStep1", "hidden", false);
    set("resetStep2", "hidden", true);
    set("lblUser", "textContent", isReg ? "Kullanıcı adı" : "Kullanıcı adı veya e-posta");
    set("lblPass", "textContent", isReg ? "Şifre (en az 6 karakter)" : "Şifre");
    const pass = document.getElementById("authPass");
    if (pass) pass.autocomplete = isReg ? "new-password" : "current-password";
    setBusy(false);
    showError("");
  }

  function renderMode() {
    const badge = document.getElementById("authMode");
    const hint = document.getElementById("authHint");
    if (!badge) return;
    if (mode === "server") {
      badge.innerHTML = '<span class="pill good">🔐 Sunucu modu</span>';
      if (hint) hint.textContent = "Hesabın ve kayıtların sunucuda data\\ klasöründe saklanır; başka tarayıcıdan da giriş yapabilirsin.";
    } else {
      badge.innerHTML = '<span class="pill warn">🔒 Yerel mod</span>';
      if (hint) hint.textContent = "Hesabın ve kayıtların bu tarayıcıda saklanıyor (cihazdan çıkmaz). Kendi bilgisayarında senkron için `node server.js` ile sunucuyu başlat.";
    }
  }

  function securityQuestionValue() {
    const sel = document.getElementById("regQuestion");
    const custom = document.getElementById("regQuestionCustom");
    if (!sel) return "Güvenlik sorusu";
    if (sel.value === "__custom") return custom ? custom.value.trim() : "";
    return sel.value;
  }

  function bindGate() {
    document.querySelectorAll("[data-auth-tab]").forEach((b) => (b.onclick = () => setTab(b.dataset.authTab)));
    const submit = document.getElementById("authSubmit");
    if (submit) submit.onclick = submitAuth;
    const guest = document.getElementById("authGuest");
    if (guest) guest.onclick = continueAsGuest;

    const qSel = document.getElementById("regQuestion");
    if (qSel)
      qSel.onchange = () => {
        const c = document.getElementById("regQuestionCustom");
        if (c) c.hidden = qSel.value !== "__custom";
      };

    const askBtn = document.getElementById("resetAsk");
    if (askBtn) askBtn.onclick = askQuestion;
    const doBtn = document.getElementById("resetDo");
    if (doBtn) doBtn.onclick = doReset;

    const enterHandler = (e) => {
      if (e.key !== "Enter") return;
      e.preventDefault();
      if (tab === "reset") {
        const s2 = document.getElementById("resetStep2");
        if (s2 && !s2.hidden) doReset();
        else askQuestion();
      } else submitAuth();
    };
    ["authUser", "authPass", "regAnswer", "resetAnswer", "resetPass", "regEmail"].forEach((id) => {
      const el = document.getElementById(id);
      if (el) el.onkeydown = enterHandler;
    });
  }

  /* =========================================================
     Aktivasyon (oturum + veri bağlama)
  ========================================================= */
  function activate(serverState, message) {
    const key = dataKey(session.user);
    let st = serverState || readLocal(key);

    /* Daha yeni olan kazanır (sunucu ↔ yerel önbellek) */
    const cached = readLocal(key);
    if (serverState && cached && (cached.__savedAt || 0) > (serverState.__savedAt || 0)) st = cached;

    /* Daha önce kaydedilmiş misafir verisi varsa ilk hesaba taşınır */
    const guest = readLocal(Store.GUEST_KEY);
    if (Store.hasContent(guest) && !Store.hasContent(st)) {
      st = guest;
      try {
        localStorage.removeItem(Store.GUEST_KEY);
      } catch (e) {}
      message = "Önceki verilerin hesabına taşındı ✓";
    }

    Store.attach(key, st);
    writeSession();
    hideGate();
    showError("");
    const passEl = document.getElementById("authPass");
    if (passEl) passEl.value = "";

    if (window.UI) UI.refresh();
    if (window.App && window.App.start) App.start();
    if (mode === "server") push();
    if (message && window.UI) UI.toast(message);
  }

  /* =========================================================
     Giriş
  ========================================================= */
  async function doLogin(identifier, pass) {
    const id = String(identifier || "").trim().toLowerCase();
    if (!id) return showError("Kullanıcı adını veya e-postanı yaz");
    if (pass.length < 6) return showError("Şifre en az 6 karakter olmalı");

    if (mode === "server") {
      const res = await api("/api/login", "POST", { identifier: id, password: pass });
      session = { user: res.user, mode: "server", token: res.token, email: res.email || null };
      let serverState = null;
      try {
        const d = await api("/api/data", "GET");
        serverState = d && d.state;
      } catch (e) {}
      activate(serverState, "Tekrar hoş geldin, " + res.user + "!");
    } else {
      const hit = findLocalAccount(id);
      const hash = hit ? stretch(hit.rec.salt, pass) : null;
      if (!hit || hash !== hit.rec.hash) throw new Error("Kullanıcı adı veya şifre hatalı");
      session = { user: hit.key, mode: "local", token: hit.rec.token, email: hit.rec.email || null };
      activate(null, "Tekrar hoş geldin, " + hit.key + "!");
    }
  }

  /* =========================================================
     Kayıt
  ========================================================= */
  async function doRegister(username, email, pass, question, answer) {
    const u = String(username || "").trim().toLowerCase();
    const em = String(email || "").trim().toLowerCase();
    const q = String(question || "").trim();
    const a = String(answer || "").trim();

    if (u.length < 3) return showError("Kullanıcı adı en az 3 karakter olmalı");
    if (!/^[a-z0-9_.-]+$/.test(u)) return showError("Kullanıcı adı yalnızca harf, rakam, . _ - içerebilir");
    if (em && !EMAIL_RE.test(em)) return showError("E-posta biçimi geçersiz (boş bırakabilirsin)");
    if (pass.length < 6) return showError("Şifre en az 6 karakter olmalı");
    if (q.length < 4) return showError("Güvenlik sorusu yaz (en az 4 karakter)");
    if (a.length < 2) return showError("Güvenlik sorusu cevabı en az 2 karakter olmalı");

    if (mode === "server") {
      const res = await api("/api/register", "POST", { username: u, password: pass, email: em || null, question: q, answer: a });
      session = { user: res.user, mode: "server", token: res.token, email: res.email || em || null };
      let serverState = null;
      try {
        const d = await api("/api/data", "GET");
        serverState = d && d.state;
      } catch (e) {}
      activate(serverState, "Hesabın oluşturuldu 🎉");
    } else {
      const accs = accounts();
      if (accs[u]) throw new Error("Bu kullanıcı adı zaten kayıtlı");
      if (em) {
        const dup = Object.keys(accs).find((k) => accs[k].email === em);
        if (dup) throw new Error("Bu e-posta zaten kayıtlı (@" + dup + ")");
      }
      const salt = rndHex(16);
      const secSalt = rndHex(16);
      accs[u] = {
        salt,
        hash: stretch(salt, pass),
        token: rndHex(24),
        createdAt: Date.now(),
        email: em || null,
        security: { question: q, salt: secSalt, hash: stretch(secSalt, normAnswer(a)) },
      };
      setAccounts(accs);
      session = { user: u, mode: "local", token: accs[u].token, email: em || null };
      activate(null, "Hesabın oluşturuldu 🎉");
    }
  }

  async function submitAuth() {
    if (tab === "reset") return askQuestion();
    setBusy(true);
    showError("");
    try {
      if (tab === "register") {
        await doRegister(val("authUser"), val("regEmail"), val("authPass"), securityQuestionValue(), val("regAnswer"));
      } else {
        await doLogin(val("authUser"), val("authPass"));
      }
    } catch (e) {
      showError(e.message || "Bir şeyler ters gitti");
    } finally {
      setBusy(false);
    }
  }

  /* =========================================================
     Şifre sıfırlama (güvenlik sorusu)
  ========================================================= */
  async function askQuestion() {
    const id = val("authUser").trim().toLowerCase();
    if (!id) return showError("Önce kullanıcı adını (veya e-postanı) yaz");
    setBusy(true);
    showError("");
    try {
      let question = null;
      if (mode === "server") {
        const res = await api("/api/security-question", "POST", { identifier: id });
        question = res && res.question;
      } else {
        const hit = findLocalAccount(id);
        if (!hit) throw new Error("Böyle bir hesap bulunamadı");
        const sec = hit.rec.security;
        if (!sec || !sec.hash) throw new Error("Bu hesapta güvenlik sorusu tanımlı değil — şifre yenilenemez");
        question = sec.question;
      }
      const qEl = document.getElementById("resetQuestionText");
      if (qEl) qEl.textContent = "🔐 " + question;
      const s1 = document.getElementById("resetStep1");
      const s2 = document.getElementById("resetStep2");
      if (s1) s1.hidden = true;
      if (s2) s2.hidden = false;
      const ans = document.getElementById("resetAnswer");
      if (ans) setTimeout(() => ans.focus(), 50);
    } catch (e) {
      showError(e.message);
    } finally {
      setBusy(false);
    }
  }

  async function doReset() {
    const id = val("authUser").trim().toLowerCase();
    const answer = val("resetAnswer");
    const newPass = val("resetPass");
    if (answer.trim().length < 2) return showError("Güvenlik sorusu cevabını yaz");
    if (newPass.length < 6) return showError("Yeni şifre en az 6 karakter olmalı");
    setBusy(true);
    showError("");
    try {
      if (mode === "server") {
        const res = await api("/api/reset-password", "POST", { identifier: id, answer, password: newPass });
        session = { user: res.user, mode: "server", token: res.token, email: res.email || null };
        let serverState = null;
        try {
          const d = await api("/api/data", "GET");
          serverState = d && d.state;
        } catch (e) {}
        activate(serverState, "Şifren yenilendi, hoş geldin 🎉");
      } else {
        const accs = accounts();
        const hit = findLocalAccount(id, accs);
        if (!hit) throw new Error("Böyle bir hesap bulunamadı");
        const sec = hit.rec.security;
        if (!sec || !sec.hash) throw new Error("Bu hesapta güvenlik sorusu tanımlı değil");
        if (stretch(sec.salt, normAnswer(answer)) !== sec.hash) throw new Error("Cevap doğru değil");
        const salt = rndHex(16);
        hit.rec.salt = salt;
        hit.rec.hash = stretch(salt, newPass);
        hit.rec.token = rndHex(24); // eski oturumlar geçersiz
        hit.rec.updatedAt = Date.now();
        setAccounts(accs); // aynı nesne üzerinde değişiklik → diske yazılır
        session = { user: hit.key, mode: "local", token: hit.rec.token, email: hit.rec.email || null };
        activate(null, "Şifren yenilendi 🎉");
      }
    } catch (e) {
      showError(e.message);
    } finally {
      setBusy(false);
    }
  }

  function continueAsGuest() {
    session = { user: null, mode: "guest", token: null };
    Store.attach(Store.GUEST_KEY, null);
    writeSession();
    hideGate();
    if (window.App && window.App.start) App.start();
    if (window.UI) UI.refresh(), UI.toast("Misafir modu — kayıtlar bu cihazda tutuluyor");
  }

  async function logout() {
    if (mode === "server" && session && session.token) {
      try {
        await api("/api/logout", "POST");
      } catch (e) {}
    }
    session = null;
    writeSession();
    Store.attach(Store.GUEST_KEY, null);
    setTab("login");
    showGate();
    if (window.UI) {
      UI.refresh();
      UI.toast("Çıkış yapıldı");
    }
  }

  /* =========================================================
     Başlangıç
  ========================================================= */
  async function init() {
    Store.setSaveHook(scheduleSync);
    mode = await detect();
    renderMode();
    bindGate();
    setTab("login");

    const saved = JSON.parse(localStorage.getItem(SESSION_KEY) || "null");
    if (saved) {
      try {
        if (saved.user === null || saved.mode === "guest") {
          session = { user: null, mode: "guest", token: null };
          Store.attach(Store.GUEST_KEY, null);
          hideGate();
          if (window.App && window.App.start) App.start();
          return true;
        }
        if (mode === "server" && saved.token) {
          session = saved;
          const me = await api("/api/me", "GET");
          if (me.user !== saved.user) throw new Error("Oturum geçersiz");
          session.email = me.email || saved.email || null;
          writeSession();
          let serverState = null;
          try {
            const d = await api("/api/data", "GET");
            serverState = d && d.state;
          } catch (e) {}
          activate(serverState, null);
          return true;
        }
        const hit = findLocalAccount(saved.user);
        if (hit && hit.rec.token === saved.token) {
          session = saved;
          session.email = hit.rec.email || null;
          activate(null, null);
          return true;
        }
        throw new Error("Oturum geçersiz");
      } catch (e) {
        session = null;
        writeSession();
        showGate();
        return false;
      }
    }
    showGate();
    return false;
  }

  /* =========================================================
     Genel bilgi
  ========================================================= */
  function user() {
    return session ? session.user : null;
  }
  function email() {
    if (!session || !session.user) return null;
    if (session.email) return session.email;
    const rec = accounts()[session.user];
    return (rec && rec.email) || null;
  }
  function currentMode() {
    if (!session) return "none";
    if (session.mode === "guest") return "guest";
    return mode;
  }
  function modeLabel() {
    const m = currentMode();
    if (m === "none") return "Oturum yok";
    if (m === "guest") return "Misafir modu";
    if (m === "server") return "Sunucu modu";
    return "Yerel mod";
  }
  function modeDetail() {
    const m = currentMode();
    if (m === "server") return "Kayıtlar sunucuda (data\\ klasörü) kullanıcı bazında saklanır; bu cihazda da önbellek tutulur.";
    if (m === "local") return "Sunucu kapalı — hesabın ve kayıtların yalnızca bu tarayıcıda saklanıyor.";
    if (m === "guest") return "Kayıtlar yalnızca bu cihazda; hesaba bağlanmadı.";
    return "";
  }
  function lastSyncLabel() {
    if (mode !== "server" || !lastSync) return "—";
    return new Date(lastSync).toLocaleTimeString("tr-TR", { hour: "2-digit", minute: "2-digit" });
  }

  return {
    init,
    logout,
    user,
    email,
    currentMode,
    modeLabel,
    modeDetail,
    lastSyncLabel,
    push,
    dataKey,
    /* testler için */
    sha256,
    stretch,
    get mode() {
      return mode;
    },
    get session() {
      return session;
    },
    get tab() {
      return tab;
    },
  };
})();
