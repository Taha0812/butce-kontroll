/* store.js için Node ortamında hızlı duman testi */
const fs = require("fs");
const path = require("path");

global.window = global;
const mem = new Map();
global.localStorage = {
  getItem: (k) => (mem.has(k) ? mem.get(k) : null),
  setItem: (k, v) => mem.set(k, String(v)),
  removeItem: (k) => mem.delete(k),
};

const code = fs.readFileSync(path.join(__dirname, "..", "js", "store.js"), "utf8");
eval(code);

const S = window.Store;
let pass = 0,
  fail = 0;
function check(name, cond, extra) {
  if (cond) {
    pass++;
    console.log("  ✓ " + name);
  } else {
    fail++;
    console.log("  ✗ " + name + (extra !== undefined ? "  → " + JSON.stringify(extra) : ""));
  }
}

console.log("Dönem hesapları:");
S.setSetting("periodStartDay", 15);
let b = S.periodBounds(0);
check("bugün 27.09 → dönem 15.09-14.10", b.start.getDate() === 15 && b.start.getMonth() === 8 && b.end.getDate() === 14 && b.end.getMonth() === 9, { s: S.iso(b.start), e: S.iso(b.end) });
let p = S.periodBounds(-1);
check("geçen dönem 15.08-14.09", p.start.getMonth() === 7 && p.end.getMonth() === 8 && p.end.getDate() === 14);
S.setSetting("periodStartDay", 1);
b = S.periodBounds(0);
check("1'i başlangıç → dönem 01.09-30.09", b.start.getDate() === 1 && b.end.getDate() === 30 && b.start.getMonth() === 8, { s: S.iso(b.start), e: S.iso(b.end) });

console.log("İşlemler & toplamlar:");
const tx1 = S.addTx({ type: "expense", amount: 250, categoryId: "market", date: "2026-09-10" });
const tx2 = S.addTx({ type: "expense", amount: 1200, categoryId: "fatura", date: "2026-09-20" });
const tx3 = S.addTx({ type: "income", amount: 30000, categoryId: "maas", date: "2026-09-01" });
const list = S.txIn(S.periodBounds(0));
const sums = S.sums(list);
check("dönem listesi 3 kayıt", list.length === 3, list.length);
check("gelir 30000", sums.income === 30000, sums);
check("gider 1450", sums.expense === 1450, sums);
check("bakiye 28550", sums.net === 28550, sums);

console.log("Kategori raporu:");
const cats = S.byCategory(list);
check("2 kategori", cats.length === 2, cats.map((c) => c.category.name));
check("toplam %100", Math.abs(cats.reduce((s, c) => s + c.pct, 0) - 100) < 0.01);
check("sıralama Market > Fatura yok (Fatura 1200 > Market 250)", cats[0].category.id === "fatura", cats[0]);

console.log("Günlük seri:");
const series = S.dailySeries(S.periodBounds(0));
check("30 gün serisi", series.length === 30, series.length);
check("seri toplamı = gider", series.reduce((s, d) => s + d.value, 0) === 1450);

console.log("Taksit planı:");
const planId = "p_test1";
for (let i = 0; i < 3; i++) {
  const d = new Date(2026, 8 + i, 28);
  S.addTx({ type: "expense", amount: 1000, categoryId: "giyim", date: S.iso(d), planId, installmentIndex: i + 1, installmentCount: 3 });
}
const pl = S.plan(planId);
check("plan 3 taksit", pl && pl.items.length === 3 && pl.count === 3, pl && pl.items.map((t) => t.date));
check("aylık tutar 1000", pl.monthly === 1000);
check("toplam 3000", pl.total === 3000);
S.removePlan(planId);
check("plan silindi", S.plans().length === 0);

console.log("Kart & taksit:");
const card = S.upsertCard({ name: "Bonus", last4: "4411", statementDay: 5, dueDay: 12, limit: 20000 });
check("kart eklendi", S.state.cards.length === 1 && S.cardSpending(card.id, S.periodBounds(0)) === 0);
check("kesim günü geri sayım 0-27 arası", S.daysUntil(5) >= 0 && S.daysUntil(5) <= 27, S.daysUntil(5));

console.log("Varlıklar:");
const assetId = S.upsertAsset({ code: "USD", amount: 500 }).id;
check("varlık eklendi", S.assets().length === 1);
S.importJSON(S.exportJSON());
check("JSON dışa/içe aktarma veriyi korur", S.assets().length === 1 && S.allTx().length === 3);

console.log("Hesaplar arası birleştirme (mergeState):");
const incoming = {
  version: 1,
  settings: { periodBudget: 99999, periodStartDay: 20 },
  categories: [{ id: "market", name: "Market" }, { id: "c_kahve", name: "Kahve", icon: "☕", color: "#f59e0b" }],
  transactions: [
    { id: tx1.id, type: "expense", amount: 250, categoryId: "market", date: "2026-09-10" }, // zaten var
    { id: "t_yeni", type: "expense", amount: 77.5, categoryId: "c_kahve", date: "2026-09-11" },
  ],
  cards: [
    { id: card.id, name: "Bonus" }, // zaten var
    { id: "cd_yeni", name: "Garanti", last4: "1122" },
  ],
  assets: [
    { id: assetId, code: "USD", amount: 500 }, // zaten var
    { id: "as_yeni", code: "EUR", amount: 100 },
  ],
};
const beforeTx = S.allTx().length;
const beforeSettings = JSON.stringify(S.settings());
const added = S.mergeState(incoming);
check("yalnızca eksik kayıtlar eklendi", added.transactions === 1 && added.cards === 1 && added.assets === 1 && added.categories === 1, added);
check("yeni işlem geldi", S.allTx().some((t) => t.id === "t_yeni"));
check("mevcut işlem kopyalanmadı", S.allTx().filter((t) => t.id === tx1.id).length === 1 && S.allTx().length === beforeTx + 1, S.allTx().length);
check("yeni kategori eklendi, varsayılanlar korundu", S.state.categories.some((c) => c.id === "c_kahve") && S.state.categories.filter((c) => c.id === "market").length === 1);
check("ayarlar birleştirmede korunur", JSON.stringify(S.settings()) === beforeSettings, S.settings());
const again = S.mergeState(incoming);
check("aynı dosya tekrar birleşince kopya yok", again.transactions === 0 && again.cards === 0 && again.assets === 0 && S.allTx().length === beforeTx + 1, again);
check("atlananlar sayıldı", again.skipped >= 4, again);

console.log(`\nSonuç: ${pass} başarılı, ${fail} başarısız`);
process.exit(fail ? 1 : 0);
