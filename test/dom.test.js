/* dom.test.js — jsdom ile gerçek DOM duman testi
   Akış: giriş ekranı → kayıt → misafir verisinin taşınması → uygulama → hesap izolasyonu */
const { JSDOM, VirtualConsole } = require("jsdom");
const path = require("path");

const INDEX = path.join(__dirname, "..", "index.html");
const URL = "http://localhost:8123/";

const vc = new VirtualConsole();
const errors = [];
const warnings = [];
vc.on("jsdomError", (e) => (/Not implemented/.test(e.message) ? warnings.push(e.message) : errors.push("jsdomError: " + e.message)));
vc.on("error", (...a) => errors.push("console.error: " + a.join(" ")));
vc.on("warn", (...a) => warnings.push("console.warn: " + a.join(" ")));

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

(async () => {
  const dom = await JSDOM.fromFile(INDEX, {
    url: URL,
    runScripts: "dangerously",
    resources: "usable",
    pretendToBeVisual: true,
    virtualConsole: vc,
  });
  const w = dom.window;
  const d = w.document;

  await new Promise((res) => {
    if (d.readyState === "complete") res();
    else w.addEventListener("load", res);
    setTimeout(res, 8000);
  });
  await wait(1000);

  const keyOf = () => {
    const s = JSON.parse(w.localStorage.getItem("butceKontroll.session") || "null");
    return s && s.user ? "butceKontroll.data." + s.user : "butceKontroll.v1";
  };
  const snap = () => JSON.parse(w.localStorage.getItem(keyOf()) || "null");
  const authUser = () => d.querySelector("#authUser");
  const authPass = () => d.querySelector("#authPass");
  const authErr = () => d.querySelector("#authError").textContent;
  const tab = (name) => d.querySelector(`[data-auth-tab="${name}"]`).click();
  const fillRegister = (user, pass, email, answer) => {
    tab("register");
    authUser().value = user;
    authPass().value = pass;
    d.querySelector("#regEmail").value = email || "";
    d.querySelector("#regAnswer").value = answer || "pati";
  };
  const submit = async (ms = 500) => {
    d.querySelector("#authSubmit").click();
    await wait(ms);
  };

  console.log("\nSayfa & giriş ekranı:");
  check("başlık Bütçe Kontroll", d.title.includes("Bütçe Kontroll"), d.title);
  check("Store/Views/Auth/App yüklendi", !!(w.Store && w.Views && w.Auth && w.App));
  const gate = d.querySelector("#authScreen");
  check("giriş ekranı görünür (uygulama kilitli)", !gate.hidden);
  check("giriş + kayıt + sıfırlama sekmeleri", d.querySelectorAll("[data-auth-tab]").length === 3, d.querySelectorAll("[data-auth-tab]").length);
  check("misafir butonu var", !!d.querySelector("#authGuest"));
  check("giriş sekmesinde e-posta/soru alanları gizli", d.querySelector("#fieldEmail").hidden && d.querySelector("#regExtra").hidden && d.querySelector("#resetExtra").hidden);
  check("şifre sıfırlama alanları var", !!d.querySelector("#resetAsk") && !!d.querySelector("#resetDo"));
  check("konsol hatası yok", errors.length === 0, errors);

  /* Uygulamayı bir önceki oturumdan kalan misafir verisiyle test et (taşınma) */
  w.localStorage.setItem(
    "butceKontroll.v1",
    JSON.stringify({
      version: 1,
      settings: {},
      categories: [],
      transactions: [{ id: "t_guest", type: "expense", amount: 99, categoryId: "market", date: "2020-01-01", createdAt: 1 }],
      cards: [],
      assets: [],
      rates: null,
    })
  );

  console.log("\nDoğrulama:");
  fillRegister("ahmet", "123", "ahmet@ornek.com", "pati");
  await submit(80);
  check("kısa şifre hatası", /en az 6 karakter/.test(authErr()), authErr());
  check("hâlâ giriş ekranındayız", !gate.hidden);
  check("kayıt sekmesinde e-posta + soru alanları açık", !d.querySelector("#fieldEmail").hidden && !d.querySelector("#regExtra").hidden);

  authPass().value = "sifre123";
  d.querySelector("#regAnswer").value = "";
  await submit(80);
  check("boş güvenlik cevabı reddedildi", /en az 2 karakter/.test(authErr()), authErr());

  d.querySelector("#regAnswer").value = "pati";
  await submit(500);
  check("kayıt tamamlandı, ekran kapandı", gate.hidden === true);
  check("oturum anahtarı yazıldı", w.localStorage.getItem("butceKontroll.session") !== null);
  check("hesap anahtarı kullanılıyor", keyOf() === "butceKontroll.data.ahmet", keyOf());
  const accAhmet = JSON.parse(w.localStorage.getItem("butceKontroll.accounts")).ahmet;
  check("e-posta kaydedildi", accAhmet.email === "ahmet@ornek.com", accAhmet.email);
  check("güvenlik sorusu kaydedildi", !!(accAhmet.security && accAhmet.security.question && accAhmet.security.hash), accAhmet.security);
  check("cevap düz metin saklanmadı", !JSON.stringify(accAhmet).includes("pati"));
  check("misafir verisi hesaba taşındı", (snap().transactions || []).some((t) => t.id === "t_guest"));
  check("misafir alanı temizlendi", w.localStorage.getItem("butceKontroll.v1") === null);
  check("parola düz metin saklanmadı", !JSON.stringify(JSON.parse(w.localStorage.getItem("butceKontroll.accounts"))).includes("sifre123"));

  console.log("\nAna ekran:");
  const home = d.querySelector("#view-home");
  check("ana görünüm çizildi", home.innerHTML.length > 800, home.innerHTML.length);
  check("bütçe kartı var", !!home.querySelector(".budget-card"));
  check("istatistik kartları (gelir/gider/bakiye)", home.querySelectorAll(".stat").length === 3);
  check("hızlı kategori çipleri", home.querySelectorAll("[data-quick]").length >= 10, home.querySelectorAll("[data-quick]").length);
  check("dönem başlığı", /gün kaldı/.test(d.querySelector("#headerPeriod").textContent), d.querySelector("#headerPeriod").textContent);
  check("taşınan kayıt görünüyor (eski tarih)", /Son işlemler/.test(home.textContent));

  console.log("\nHızlı gider ekleme:");
  d.querySelector("#btnAdd").click();
  await wait(50);
  check("modal açıldı", d.querySelector("#sheet").classList.contains("open"));
  check("tuş takımı 12 tuş", d.querySelectorAll("#addKeypad .key").length === 12);
  d.querySelector('[data-cat="market"]').click();
  ["1", "2", "5", ".", "5", "0"].forEach((k) => d.querySelector(`#addKeypad [data-key="${k}"]`).click());
  check("tuş takımı tutarı yazdı (125.50)", d.querySelector("#addAmount").value === "125.50", d.querySelector("#addAmount").value);
  d.querySelector("#addSave").click();
  await wait(80);
  const saved = snap();
  check("işlem kaydedildi", saved.transactions.some((t) => t.amount === 125.5 && t.categoryId === "market"), saved.transactions.map((t) => t.amount));
  check("modal kapandı", !d.querySelector("#sheet").classList.contains("open"));
  check("ana ekranda gider güncellendi", /125,50/.test(home.textContent));

  console.log("\nGelir ekleme:");
  d.querySelector("#btnAdd").click();
  await wait(30);
  d.querySelector('[data-type="income"]').click();
  await wait(30);
  check("gelir kategorileri geldi", !!d.querySelector('[data-cat="maas"]'));
  d.querySelector('[data-cat="maas"]').click();
  ["3", "0", "0", "0", "0"].forEach((k) => d.querySelector(`#addKeypad [data-key="${k}"]`).click());
  d.querySelector("#addSave").click();
  await wait(80);
  check("gelir kaydedildi", snap().transactions.some((t) => t.type === "income" && t.amount === 30000));

  console.log("\nRapor ekranı:");
  d.querySelector('[data-nav="report"]').click();
  await wait(80);
  const report = d.querySelector("#view-report");
  check("rapor görünümü aktif", report.classList.contains("active"));
  check("pasta grafik (SVG)", !!report.querySelector("#donutBox svg"));
  check("alan grafik (SVG)", !!report.querySelector("#areaBox svg"));
  check("lejant kalemleri", report.querySelectorAll(".legend li").length >= 1, report.querySelectorAll(".legend li").length);
  check("kategori barları", report.querySelectorAll(".bar-row").length >= 1);
  d.querySelector('[data-range="all"]').click();
  await wait(50);
  check("tüm zamanlar sekmesi çalıştı", d.querySelector('[data-range="all"]').classList.contains("active"));

  console.log("\nVarlıklar (canlı fiyat):");
  d.querySelector('[data-nav="assets"]').click();
  await wait(100);
  const assets = d.querySelector("#view-assets");
  check("varlık görünümü aktif", assets.classList.contains("active"));
  check("10 piyasa kartı", assets.querySelectorAll(".rate").length === 10, assets.querySelectorAll(".rate").length);
  check("portföy toplamı görünüyor", /Portföy toplam değeri/.test(assets.textContent));
  d.querySelector("#addAssetBtn").click();
  await wait(40);
  d.querySelector("#aCode").value = "USD";
  d.querySelector("#aCode").dispatchEvent(new w.Event("change"));
  const amtInput = d.querySelector("#aAmount");
  amtInput.value = "500";
  amtInput.dispatchEvent(new w.Event("input"));
  check("varlık önizlemesi hesaplandı", /= ₺/.test(d.querySelector("#aPreview").textContent), d.querySelector("#aPreview").textContent);
  d.querySelector("#aSave").click();
  await wait(60);
  check("varlık kaydedildi", snap().assets.length === 1 && snap().assets[0].code === "USD" && snap().assets[0].amount === 500);
  check("portföy toplamı > 0", !/₺0,00/.test(d.querySelector("#view-assets .p-value").textContent), d.querySelector("#view-assets .p-value").textContent);

  console.log("\nKart & taksit:");
  d.querySelector('[data-nav="cards"]').click();
  await wait(60);
  check("kart görünümü aktif", d.querySelector("#view-cards").classList.contains("active"));
  check("boş kart durumu", /Kartın yoksa/.test(d.querySelector("#view-cards").textContent));
  d.querySelector("#addCardBtn").click();
  await wait(40);
  d.querySelector("#cName").value = "Bonus";
  d.querySelector("#cLast4").value = "4411";
  d.querySelector("#cSave").click();
  await wait(60);
  check("kart kaydedildi", snap().cards.length === 1 && snap().cards[0].name === "Bonus", snap().cards);
  check("kart yüzeyi çizildi", !!d.querySelector(".card-item"));

  d.querySelector("#btnAdd").click();
  await wait(40);
  d.querySelector('[data-cat="giyim"]').click();
  ["2", "0", "0", "0"].forEach((k) => d.querySelector(`#addKeypad [data-key="${k}"]`).click());
  const cardSel = d.querySelector("#addCard");
  cardSel.value = snap().cards[0].id;
  cardSel.dispatchEvent(new w.Event("change"));
  await wait(60);
  check("taksit seçimi çıktı", !!d.querySelector("#addInstall"));
  d.querySelector("#addInstall").value = "4";
  d.querySelector("#addInstall").dispatchEvent(new w.Event("change"));
  d.querySelector("#addSave").click();
  await wait(80);
  const planTxs = snap().transactions.filter((t) => t.type === "expense" && t.amount === 2000);
  check("4 taksit oluştu", planTxs.length === 4, planTxs.length);
  check("taksit indisleri", planTxs.every((t, i) => t.installmentIndex === i + 1 && t.installmentCount === 4));
  d.querySelector('[data-nav="cards"]').click();
  await wait(60);
  check("taksit planı listelendi", /4 taksit ×/.test(d.querySelector("#view-cards").textContent));

  console.log("\nAyarlar & hesap kartı:");
  d.querySelector("#btnSettings").click();
  await wait(60);
  const st = d.querySelector("#view-settings");
  check("ayarlar görünümü", st.classList.contains("active"));
  check("hesap kartı görünüyor", /@ahmet/.test(st.textContent), st.textContent.slice(0, 120));
  check("mod rozeti", /Yerel mod/.test(st.textContent));
  const range = d.querySelector("#setStartDay");
  range.value = "15";
  range.dispatchEvent(new w.Event("input"));
  check("gün etiketi güncellendi", d.querySelector("#startDayVal").textContent.includes("15"));
  d.querySelector("#setBudget").value = "15000";
  d.querySelector("#saveSettings").click();
  await wait(80);
  check("dönem günü kaydedildi", snap().settings.periodStartDay === 15, snap().settings);
  check("bütçe kaydedildi", snap().settings.periodBudget === 15000);
  check("ayarlarda çıkış butonu", !!d.querySelector("#settingsLogout"));

  console.log("\nTema:");
  d.querySelector("#btnTheme").click();
  await wait(40);
  check("tema aydınlığa döndü", d.documentElement.getAttribute("data-theme") === "light");
  d.querySelector("#btnTheme").click();
  await wait(40);
  check("tema karanlığa döndü", d.documentElement.getAttribute("data-theme") === "dark");

  console.log("\nHesap izolasyonu:");
  const txCountAhmet = snap().transactions.length;
  await w.Auth.logout();
  await wait(150);
  check("çıkışta giriş ekranı döndü", !gate.hidden);
  check("çıkıştan sonra misafir (boş) veri yüklendi", w.Store.allTx().length === 0, w.Store.allTx().length);

  d.querySelector('[data-auth-tab="register"]').click();
  authUser().value = "ayse";
  authPass().value = "sifre456";
  d.querySelector("#regEmail").value = ""; // önceki hesabın e-postası taşınmasın
  d.querySelector("#regAnswer").value = "kedi";
  d.querySelector("#authSubmit").click();
  await wait(500);
  check("ikinci hesap açıldı", gate.hidden === true && w.Auth.user() === "ayse", w.Auth.user());
  check("ikinci hesap BOS başladı (izolasyon)", w.Store.allTx().length === 0, w.Store.allTx().length);
  check("ikinci hesabın ayrı anahtarı var", keyOf() === "butceKontroll.data.ayse", keyOf());
  check("ayse'nin kartı yok", w.Store.state.cards.length === 0, w.Store.state.cards.length);

  d.querySelector("#btnAdd").click();
  await wait(40);
  d.querySelector('[data-cat="market"]').click();
  ["7", "7"].forEach((k) => d.querySelector(`#addKeypad [data-key="${k}"]`).click());
  d.querySelector("#addSave").click();
  await wait(80);
  check("ayse kendi kaydını oluşturdu", snap().transactions.some((t) => t.amount === 77));

  await w.Auth.logout();
  await wait(150);
  d.querySelector('[data-auth-tab="login"]').click();
  authUser().value = "ahmet";
  authPass().value = "yanlis123";
  d.querySelector("#authSubmit").click();
  await wait(120);
  check("yanlış şifre reddedildi", /hatalı/.test(authErr()), authErr());
  authPass().value = "sifre123";
  d.querySelector("#authSubmit").click();
  await wait(500);
  check("ahmet tekrar giriş yaptı", gate.hidden === true && w.Auth.user() === "ahmet", w.Auth.user());
  check("ahmet'in kayıtları geri geldi", w.Store.allTx().length === txCountAhmet, { beklenen: txCountAhmet, gelen: w.Store.allTx().length });
  check("ahmet'in kayıtlarında ayse'nin 77'si yok", !w.Store.allTx().some((t) => t.amount === 77));
  check("ahmet'in ayarları korundu", w.Store.settings().periodBudget === 15000, w.Store.settings());

  console.log("\nE-posta ile giriş:");
  await w.Auth.logout();
  await wait(200);
  tab("login");
  check("giriş sekmesinde e-posta alanı gizli", d.querySelector("#fieldEmail").hidden);
  authUser().value = "AHMET@ornek.com"; // büyük/küçük harf duyarsız
  authPass().value = "sifre123";
  await submit(500);
  check("e-posta ile giriş yapıldı", gate.hidden === true && w.Auth.user() === "ahmet", w.Auth.user());
  d.querySelector("#btnAccount").click();
  await wait(60);
  check("hesap panelinde e-posta görünüyor", /ahmet@ornek\.com/.test(d.querySelector("#sheetBody").textContent));
  d.querySelector("#sheetClose").click();
  await wait(40);

  console.log("\nŞifre sıfırlama (güvenlik sorusu):");
  await w.Auth.logout();
  await wait(200);
  tab("reset");
  authUser().value = "ahmet";
  d.querySelector("#resetAsk").click();
  await wait(300);
  check("güvenlik sorusu geldi", /evcil hayvan/.test(d.querySelector("#resetQuestionText").textContent), d.querySelector("#resetQuestionText").textContent);
  check("2. adım açıldı", !d.querySelector("#resetStep2").hidden && d.querySelector("#authSubmit").hidden);
  d.querySelector("#resetAnswer").value = "yanlis-cevap";
  d.querySelector("#resetPass").value = "yeni9999";
  d.querySelector("#resetDo").click();
  await wait(300);
  check("yanlış cevap reddedildi", /Cevap doğru değil/.test(authErr()), authErr());
  d.querySelector("#resetAnswer").value = "PATI"; // büyük harf, boşluk → normalize
  d.querySelector("#resetPass").value = "yeni9999";
  d.querySelector("#resetDo").click();
  await wait(600);
  check("şifre yenilendi, oturum açıldı", gate.hidden === true && w.Auth.user() === "ahmet", w.Auth.user());
  check("cevap düz metin saklanmadı", !JSON.stringify(JSON.parse(w.localStorage.getItem("butceKontroll.accounts"))).includes("PATI"));
  check("yenilenen şifre kayıtları getirdi", w.Store.allTx().length === txCountAhmet, w.Store.allTx().length);

  await w.Auth.logout();
  await wait(200);
  tab("login");
  authUser().value = "ahmet";
  authPass().value = "sifre123";
  await submit(250);
  check("eski şifre artık çalışmıyor", /hatalı/.test(authErr()), authErr());
  authPass().value = "yeni9999";
  await submit(500);
  check("yeni şifre ile giriş yapıldı", gate.hidden === true && w.Auth.user() === "ahmet", w.Auth.user());

  console.log("\nHesaplar arası veri aktarımı:");
  const ahmetPayload = JSON.parse(w.Store.exportJSON());
  ahmetPayload.__exportFrom = "ahmet";
  ahmetPayload.__exportAt = Date.now();
  const ahmetCount = w.Store.allTx().length;
  await w.Auth.logout();
  await wait(200);
  tab("login");
  authUser().value = "ayse";
  authPass().value = "sifre456";
  await submit(500);
  check("ayse'ye giriş", gate.hidden === true && w.Auth.user() === "ayse", w.Auth.user());
  const ayseCount = w.Store.allTx().length;
  const ayseBudget = w.Store.settings().periodBudget;

  w.App.openImportPreview(ahmetPayload);
  await wait(80);
  const impBody = d.querySelector("#sheetBody");
  check("önizleme sayfası açıldı", /Birleştir/.test(impBody.textContent) && /@ahmet/.test(impBody.textContent), impBody.textContent.slice(0, 160));
  check("kayıt sayıları gösteriliyor", impBody.querySelectorAll(".import-summary .cell").length === 3);
  d.querySelector("#impCancel").click();
  await wait(60);
  check("vazgeç → veri değişmedi", w.Store.allTx().length === ayseCount, w.Store.allTx().length);

  w.App.openImportPreview(ahmetPayload);
  await wait(80);
  d.querySelector("#impMerge").click();
  await wait(150);
  check("birleştirme eklendi", w.Store.allTx().length === ayseCount + ahmetCount, { ayseCount, ahmetCount, simdi: w.Store.allTx().length });
  check("ayse'nin kendi kaydı duruyor", w.Store.allTx().some((t) => t.amount === 77));
  check("ayarlara dokunulmadı (birleştir)", w.Store.settings().periodBudget === ayseBudget, w.Store.settings().periodBudget);
  check("misafir kaydı tek kez geldi", w.Store.allTx().filter((t) => t.id === "t_guest").length === 1);

  w.App.openImportPreview(ahmetPayload);
  await wait(80);
  d.querySelector("#impMerge").click();
  await wait(150);
  check("aynı dosya tekrar birleştirilse kopya yok", w.Store.allTx().length === ayseCount + ahmetCount, w.Store.allTx().length);

  w.confirm = () => true; // jsdom'da window.confirm yok → üzerine yazma onayı sahte
  w.App.openImportPreview(ahmetPayload);
  await wait(80);
  d.querySelector("#impReplace").click();
  await wait(150);
  check("üzerine yazma çalıştı", w.Store.allTx().length === ahmetCount, w.Store.allTx().length);
  check("üzerine yazınca settings de dosyadan geldi", w.Store.settings().periodBudget === 15000, w.Store.settings().periodBudget);

  // sonraki bölümler ahmet hesabı üzerinden devam ediyor
  await w.Auth.logout();
  await wait(200);
  tab("login");
  authUser().value = "ahmet";
  authPass().value = "yeni9999";
  await submit(500);
  check("ahmet'e geri dönüldü", gate.hidden === true && w.Auth.user() === "ahmet", w.Auth.user());

  console.log("\nHesap paneli:");
  d.querySelector("#btnAccount").click();
  await wait(60);
  const sheet = d.querySelector("#sheetBody");
  check("hesap paneli açıldı", /@ahmet/.test(sheet.textContent), sheet.textContent.slice(0, 120));
  check("çıkış butonu var", !!d.querySelector("#acctLogout"));
  d.querySelector("#sheetClose").click();
  await wait(40);

  console.log("\nYeniden başlatma:");
  const dom2 = await JSDOM.fromFile(INDEX, { url: URL, runScripts: "dangerously", resources: "usable", pretendToBeVisual: true, virtualConsole: vc });
  await new Promise((res) => (dom2.window.document.readyState === "complete" ? res() : dom2.window.addEventListener("load", res)));
  await wait(700);
  check("ikinci örnek de hatasız yüklendi", errors.length === 0, errors.slice(0, 5));

  console.log("\nKonsol:");
  check("kritik hata yok", errors.length === 0, errors.slice(0, 5));
  if (warnings.length) console.log("  ⚠ uyarılar: " + warnings.slice(0, 3).join(" | "));

  console.log(`\nSonuç: ${pass} başarılı, ${fail} başarısız`);
  process.exit(fail ? 1 : 0);
})().catch((e) => {
  console.error("TEST ÇÖKTÜ:", e);
  process.exit(2);
});
