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

console.log("Tekrarlayan (otomatik) işlemler:");
const hoje = new Date();
const hojeISO = S.iso(hoje);
const day = Math.min(28, hoje.getDate());
const kural = S.upsertRecurring({
  name: "Kira",
  type: "expense",
  categoryId: "ev",
  amount: 8000,
  freq: "monthly",
  startDate: S.iso(new Date(hoje.getFullYear(), hoje.getMonth() - 2, day)),
});
check("kural eklendi ve nextDate = startDate", kural && kural.nextDate === kural.startDate, kural);
check("kural listesi görünür", S.recurringRules().length === 1);
const uretildi = S.processRecurring();
check("2 ay geriden gelen 3 vade üretildi", uretildi.length === 3, uretildi.length);
check("üretilen kayıtlar kurala bağlı", uretildi.every((x) => x.tx.recurringId === kural.id && x.tx.note === "Kira"));
check("vadeler gün gün artıyor", new Set(uretildi.map((x) => x.tx.date)).size === 3);
const tekrar = S.processRecurring();
check("aynı tarih ikinci kez üretilmiyor", tekrar.length === 0, tekrar.length);
check("nextDate ilerledi", S.ruleById(kural.id).nextDate > hojeISO, S.ruleById(kural.id).nextDate);

const gelecek = S.upsertRecurring({
  name: "Netflix",
  type: "expense",
  categoryId: "abonelik",
  amount: 100,
  freq: "monthly",
  startDate: S.iso(new Date(hoje.getFullYear(), hoje.getMonth(), hoje.getDate() + 5)),
});
S.processRecurring();
check("gelecek vadeli kural henüz üretmedi", !S.allTx().some((t) => t.recurringId === gelecek.id));
check("7 gün içindeki vadeler listeleniyor", S.upcomingRecurring(7).length === 1 && S.upcomingRecurring(7)[0].rule.id === gelecek.id, S.upcomingRecurring(7));
check("duraklatılan kural dışarıda kalır", (S.toggleRecurring(gelecek.id), S.recurringRules(true).length === 1) && S.upcomingRecurring(7).length === 0);
S.toggleRecurring(gelecek.id);
check("aylık ilerleme 31 → 28", S.advanceDate("2026-01-31", "monthly") === "2026-02-28", S.advanceDate("2026-01-31", "monthly"));
check("haftalık ilerleme +7 gün", S.advanceDate("2026-09-25", "weekly") === "2026-10-02");
check("yıllık ilerleme +1 yıl", S.advanceDate("2026-09-25", "yearly") === "2027-09-25");
check("günlük ilerleme (ay sonu)", S.advanceDate("2026-02-28", "daily") === "2026-03-01");
S.removeRecurring(kural.id);
S.removeRecurring(gelecek.id);
check("kurallar silindi", S.recurringRules().length === 0);

console.log("Kategori limitleri (envelope):");
S.setCategoryBudget("market", 1000);
check("limit kaydedildi", S.categoryBudgets().market === 1000, S.categoryBudgets());
S.setCategoryBudget("fatura", 1000);
const usage = S.categoryUsage(S.periodBounds(0));
check("2 limitli kategori raporlandı", usage.length === 2, usage.map((u) => u.category.id));
const uMarket = usage.find((u) => u.category.id === "market");
const uFatura = usage.find((u) => u.category.id === "fatura");
check("Market kullanımı %25", uMarket.pct === 25 && !uMarket.over, uMarket);
check("Fatura limiti aşıldı (%120)", uFatura.over === true && uFatura.remaining === -200, uFatura);
check("aşan önce geliyor", usage[0].category.id === "fatura", usage[0]);
S.setCategoryBudget("market", 0);
check("0 → limit temizlenir", S.categoryBudgets().market === undefined, S.categoryBudgets());

console.log("Birikim hedefleri:");
const hedef = S.upsertGoal({ name: "Tatil", target: 50000 });
check("hedef eklendi", S.goals().length === 1 && hedef.target === 50000);
S.addContribution(hedef.id, 20000, hojeISO);
S.addContribution(hedef.id, 5000, hojeISO);
let hp = S.goalProgress(hedef);
check("ilerleme %50", hp.saved === 25000 && hp.pct === 50 && hp.remaining === 25000, hp);
check("henüz tamamlanmadı", hp.done === false);
S.addContribution(hedef.id, 25000, hojeISO);
check("hedef doldu", S.goalProgress(hedef).done === true);
check("katkılar harcama değil", !S.allTx().some((t) => t.note === "Tatil" && t.amount === 20000));
const hedef2 = S.upsertGoal({ name: "Araba", target: 120000, deadline: S.iso(new Date(hoje.getFullYear(), hoje.getMonth() + 12, 1)) });
const hp2 = S.goalProgress(hedef2);
check("12 ayda aylık gerekli katkı 10.000", Math.abs(hp2.monthly - 10000) < 1, hp2.monthly);
S.removeGoal(hedef.id);
check("hedef silindi", S.goals().length === 1, S.goals().length);
S.removeGoal(hedef2.id);

console.log("CSV dışa/içe aktarma:");
S.addTx({ type: "expense", amount: 33.5, categoryId: "market", date: "2026-09-12", note: 'Bakkal, "A" şubesi' });
const csv = S.exportCSV();
const lines = csv.split("\r\n");
check("CSV başlık satırı", lines[0] === "Tarih,Tur,Kategori,Tutar,Kart,Not", lines[0]);
check("CSV satır sayısı = işlem + 1", lines.length === S.allTx().length + 1, { rows: lines.length, tx: S.allTx().length });
check("virgüllü/tırnaklı not kaçışlandı", csv.indexOf('Bakkal, ""A"" şubesi') > -1);
const parsedSemi = S.parseCSV("Tarih;Tur;Kategori;Tutar\n01.10.2026;gider;Market;150,50");
check("noktalı virgül ayracı okundu", parsedSemi.length === 2 && parsedSemi[1][3] === "150,50", parsedSemi);
const oncekiSayi = S.allTx().length;
const res = S.importCSV(
  "Tarih,Tür,Kategori,Tutar,Kart,Not\n" +
    "2026-09-10,gider,Market,250,,\n" + // mevcut işlemle birebir aynı → mükerrer
    "2026-09-25,gelir,Maaş,1000,,prim\n" +
    "2026-09-26,gider,Kuaför,300,,\n" +
    "bozuk,satır,,,,\n"
);
check("önizleme: 1 mükerrer, 2 yeni, 1 bozuk", res.dup === 1 && res.new === 2 && res.bad === 1, res);
check("bilinmeyen kategori → Diğer", res.rows.find((r) => r.categoryName === "Kuaför").categoryId === "digerX");
check("kategori adı eşleşti (Türkçe)", res.rows.find((r) => r.categoryName === "Maaş").categoryId === "maas");
check("hiçbir şey yazılmadı", S.allTx().length === oncekiSayi, S.allTx().length);
const eklenen = S.importCSVRows(res.rows);
check("yalnızca yeniler eklendi", eklenen === 2 && S.allTx().length === oncekiSayi + 2, eklenen);
const res2 = S.importCSV("Tarih,Tür,Kategori,Tutar,Kart,Not\n2026-09-25,gelir,Maaş,1000,,prim\n");
check("aynı dosya tekrar → hepsi mükerrer", res2.dup === 1 && res2.new === 0, res2);
const res3 = S.importCSV("Tarih,Tur,Kategori,Tutar,Not\n2026-09-30,gider,Market,\"1.500,75\",zam\n");
check("binlik + ondalık ayracı çözüldü", Math.abs(res3.rows[0].amount - 1500.75) < 0.001, res3.rows[0]);
const res4 = S.importCSV("2026-10-01,income,Maaş,77,,bonus\n2026-10-02,expense,Market,20,,ekmek\n");
check("başlıksız CSV konumsal okundu", res4.rows.length === 2 && res4.rows[0].type === "income" && res4.rows[1].categoryId === "market", res4.rows);

console.log("v2 birleştirme (recurring + goals):");
const merged = S.mergeState({
  recurring: [{ id: "r_x", name: "Su faturası", type: "expense", categoryId: "fatura", amount: 250, freq: "monthly", startDate: hojeISO, nextDate: hojeISO }],
  goals: [{ id: "g_x", name: "Bisiklet", target: 8000, contributions: [] }],
  transactions: [],
  cards: [],
  assets: [],
  categories: [],
});
check("kurallar ve hedefler birleşti", merged.recurring === 1 && merged.goals === 1, merged);
check("birleşen kural listeye geldi", S.recurringRules().length === 1 && S.goals().length === 1);

console.log(`\nSonuç: ${pass} başarılı, ${fail} başarısız`);
process.exit(fail ? 1 : 0);
