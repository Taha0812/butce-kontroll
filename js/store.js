/* store.js — Veri katmanı: durum, kalıcılık (localStorage), dönem/rapor hesapları, canlı kur & altın servisi */
window.Store = (function () {
  "use strict";

  const GUEST_KEY = "butceKontroll.v1"; // misafir (oturumsuz) veri alanı
  let KEY = GUEST_KEY; // oturum açıldığında hesabın kendi veri anahtarına bağlanır
  const OZ_GRAM = 31.1034768; // 1 onsu gram
  const RATE_TTL = 10 * 60 * 1000; // 10 dakika
  let saveHook = null; // auth.js tarafından: her kayıttan sonra sunucu senkronu tetikler

  /* ---------------- Varsayılan kategoriler ---------------- */
  const DEFAULT_CATEGORIES = [
    { id: "market", name: "Market", icon: "🛒", type: "expense", color: "#ff8a3d" },
    { id: "fatura", name: "Fatura", icon: "💡", type: "expense", color: "#ffd166" },
    { id: "ulasim", name: "Ulaşım", icon: "🚌", type: "expense", color: "#4dc3ff" },
    { id: "saglik", name: "Sağlık", icon: "💊", type: "expense", color: "#ff6b9d" },
    { id: "eglence", name: "Eğlence", icon: "🎬", type: "expense", color: "#b18cff" },
    { id: "egitim", name: "Eğitim", icon: "📚", type: "expense", color: "#5ad1a6" },
    { id: "giyim", name: "Giyim", icon: "👕", type: "expense", color: "#7aa2ff" },
    { id: "ev", name: "Ev / Kira", icon: "🏠", type: "expense", color: "#f0a35e" },
    { id: "abonelik", name: "Abonelik", icon: "📱", type: "expense", color: "#56ccf2" },
    { id: "tatil", name: "Tatil", icon: "🏖️", type: "expense", color: "#2fd6b0" },
    { id: "hediye", name: "Hediye", icon: "🎁", type: "expense", color: "#ff7ab6" },
    { id: "digerX", name: "Diğer", icon: "📦", type: "expense", color: "#95a5b6" },
    { id: "maas", name: "Maaş", icon: "💼", type: "income", color: "#2ecc8f" },
    { id: "ekgelir", name: "Ek Gelir", icon: "💰", type: "income", color: "#7ed957" },
    { id: "satis", name: "Satış", icon: "🛍️", type: "income", color: "#38c6ff" },
    { id: "kiragelir", name: "Kira Geliri", icon: "🏢", type: "income", color: "#ffd45e" },
    { id: "digerG", name: "Diğer Gelir", icon: "➕", type: "income", color: "#9be15d" },
  ];

  /* ---------------- Canlı takip edilen varlıklar (piyasa fiyatları) ---------------- */
  const RATE_LIST = [
    { code: "USD", label: "Dolar", icon: "🇺🇸", unit: "1 $" },
    { code: "EUR", label: "Euro", icon: "🇪🇺", unit: "1 €" },
    { code: "GBP", label: "Sterlin", icon: "🇬🇧", unit: "1 £" },
    { code: "CHF", label: "Frank", icon: "🇨🇭", unit: "1 Fr" },
    { code: "JPY", label: "Yen", icon: "🇯🇵", unit: "100 ¥" },
    { code: "XAU", label: "Ons Altın", icon: "🥇", unit: "1 ons" },
    { code: "GRAM", label: "Gram Altın", icon: "🟡", unit: "1 gr" },
    { code: "CEYREK", label: "Çeyrek Altın", icon: "🪙", unit: "1 çeyrek" },
    { code: "YARIM", label: "Yarım Altın", icon: "🪙", unit: "1 yarım" },
    { code: "XAG", label: "Gümüş", icon: "🥈", unit: "1 gr" },
  ];

  /* ---------------- Yardımcılar ---------------- */
  const uid = () => Math.random().toString(36).slice(2, 9) + Date.now().toString(36).slice(-3);
  const pad = (n) => String(n).padStart(2, "0");
  const iso = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  const parseISO = (s) => {
    const [y, m, d] = String(s).split("-").map(Number);
    return new Date(y, (m || 1) - 1, d || 1);
  };

  function freshState() {
    return {
      version: 1,
      settings: {
        theme: "dark",
        periodStartDay: 1, // dönem başlangıç günü (1-28)
        periodBudget: 0, // dönem bütçesi (TRY)
        currency: "TRY",
        reminders: true,
      },
      categories: DEFAULT_CATEGORIES.map((c) => ({ ...c })),
      transactions: [],
      cards: [],
      assets: [],
      rates: null,
    };
  }

  function migrate(parsed) {
    const base = freshState();
    if (!parsed || typeof parsed !== "object") return base;
    const out = {
      ...base,
      ...parsed,
      settings: { ...base.settings, ...(parsed.settings || {}) },
      categories: Array.isArray(parsed.categories) && parsed.categories.length ? parsed.categories : base.categories,
      transactions: Array.isArray(parsed.transactions) ? parsed.transactions : [],
      cards: Array.isArray(parsed.cards) ? parsed.cards : [],
      assets: Array.isArray(parsed.assets) ? parsed.assets : [],
      rates: parsed.rates || null,
    };
    // dosyadan gelen tanıtım alanları (__exportFrom vb.) duruma karışmasın
    Object.keys(out).forEach((k) => {
      if (k.slice(0, 2) === "__" && k !== "__savedAt") delete out[k];
    });
    return out;
  }

  function load() {
    try {
      const raw = localStorage.getItem(KEY);
      if (raw) return migrate(JSON.parse(raw));
    } catch (e) {
      console.warn("Veri okunamadı, yeni kayıt oluşturuluyor.", e);
    }
    return freshState();
  }

  let state = load();

  function save() {
    state.__savedAt = Date.now(); // hangi kopya daha yeni? (sunucu ↔ cihaz karşılaştırması)
    try {
      localStorage.setItem(KEY, JSON.stringify(state));
    } catch (e) {
      console.warn("Kayıt başarısız", e);
    }
    if (typeof saveHook === "function") {
      try {
        saveHook(state);
      } catch (e) {
        console.warn("Senkron kancası hatalı", e);
      }
    }
  }

  /* Oturum değişince çağrılır: veri alanını (namespace) değiştirir ve anında diske yazar */
  function attach(nsKey, initialState) {
    KEY = nsKey || GUEST_KEY;
    state = initialState ? migrate(initialState) : load();
    save();
    return state;
  }

  function setSaveHook(fn) {
    saveHook = typeof fn === "function" ? fn : null;
  }

  /* Bir veri kümesinde gerçek kayıt var mı? (misafir verisini hesaba taşımak için) */
  function hasContent(st) {
    if (!st || typeof st !== "object") return false;
    return !!(
      (Array.isArray(st.transactions) && st.transactions.length) ||
      (Array.isArray(st.cards) && st.cards.length) ||
      (Array.isArray(st.assets) && st.assets.length)
    );
  }

  /* ---------------- Ayarlar ---------------- */
  function settings() {
    return state.settings;
  }
  function setSetting(k, v) {
    state.settings[k] = v;
    save();
    return state.settings;
  }

  /* ---------------- Kategoriler ---------------- */
  function categories(type) {
    return type ? state.categories.filter((c) => c.type === type) : state.categories;
  }
  function category(id) {
    return state.categories.find((c) => c.id === id) || { id: "?", name: "Bilinmiyor", icon: "❓", color: "#95a5b6", type: "expense" };
  }
  function addCategory(c) {
    const item = { id: "c_" + uid(), name: c.name, icon: c.icon || "🏷️", type: c.type || "expense", color: c.color || "#7aa2ff" };
    state.categories.push(item);
    save();
    return item;
  }
  function removeCategory(id) {
    state.categories = state.categories.filter((c) => c.id !== id);
    save();
  }

  /* ---------------- Dönem hesapları ---------------- */
  // offset: 0 = içinde bulunulan dönem, -1 = bir önceki dönem ...
  function periodStart(offset = 0, ref = new Date()) {
    const day = Math.min(28, Math.max(1, Number(state.settings.periodStartDay) || 1));
    let start = new Date(ref.getFullYear(), ref.getMonth(), day);
    if (ref < start) start = new Date(ref.getFullYear(), ref.getMonth() - 1, day);
    return new Date(start.getFullYear(), start.getMonth() + offset, day);
  }

  function periodBounds(offset = 0, ref = new Date()) {
    const start = periodStart(offset, ref);
    const end = new Date(start.getFullYear(), start.getMonth() + 1, start.getDate() - 1);
    return { start, end, startISO: iso(start), endISO: iso(end) };
  }

  function periodLabel(b) {
    const f = (d) => d.toLocaleDateString("tr-TR", { day: "2-digit", month: "short" });
    const y1 = b.start.getFullYear() !== b.end.getFullYear() ? ` ${b.start.getFullYear()}` : "";
    return `${f(b.start)} – ${f(b.end)}${y1}`;
  }

  function rangeBounds(key) {
    const now = new Date();
    if (key === "previous") return periodBounds(-1, now);
    if (key === "last3") {
      const s = periodBounds(-2, now).start;
      const e = periodBounds(0, now).end;
      return { start: s, end: e, startISO: iso(s), endISO: iso(e) };
    }
    if (key === "all") {
      const dates = state.transactions.map((t) => t.date).sort();
      const s = dates.length ? parseISO(dates[0]) : periodBounds(0, now).start;
      return { start: s, end: now, startISO: iso(s), endISO: iso(now) };
    }
    return periodBounds(0, now);
  }

  function rangeLabel(key) {
    const map = { current: "Bu dönem", previous: "Geçen dönem", last3: "Son 3 dönem", all: "Tüm zamanlar" };
    return map[key] || map.current;
  }

  function daysLeftInPeriod() {
    const b = periodBounds(0);
    const today = new Date();
    const end = new Date(b.end.getFullYear(), b.end.getMonth(), b.end.getDate(), 23, 59, 59);
    return Math.max(0, Math.ceil((end - today) / 86400000));
  }

  /* ---------------- İşlemler ---------------- */
  function allTx() {
    return [...state.transactions].sort((a, b) => (a.date === b.date ? (b.createdAt || 0) - (a.createdAt || 0) : a.date < b.date ? 1 : -1));
  }

  function txIn(bounds, type) {
    return allTx().filter(
      (t) => t.date >= bounds.startISO && t.date <= bounds.endISO && (!type || t.type === type)
    );
  }

  function txById(id) {
    return state.transactions.find((t) => t.id === id);
  }

  function addTx(tx) {
    const item = {
      id: tx.id || "t_" + uid(),
      type: tx.type,
      amount: Math.abs(Number(tx.amount) || 0),
      categoryId: tx.categoryId,
      date: tx.date,
      note: tx.note || "",
      cardId: tx.cardId || null,
      planId: tx.planId || null,
      installmentIndex: tx.installmentIndex || null,
      installmentCount: tx.installmentCount || null,
      createdAt: Date.now(),
    };
    state.transactions.push(item);
    save();
    return item;
  }

  function updateTx(id, patch) {
    const t = txById(id);
    if (!t) return null;
    Object.assign(t, patch, { amount: Math.abs(Number(patch.amount != null ? patch.amount : t.amount) || 0) });
    save();
    return t;
  }

  function removeTx(id) {
    state.transactions = state.transactions.filter((t) => t.id !== id);
    save();
  }

  function removePlan(planId) {
    state.transactions = state.transactions.filter((t) => t.planId !== planId);
    save();
  }

  function plan(planId) {
    const items = state.transactions
      .filter((t) => t.planId === planId)
      .sort((a, b) => a.date.localeCompare(b.date));
    if (!items.length) return null;
    const first = items[0];
    return {
      id: planId,
      items,
      count: first.installmentCount || items.length,
      monthly: first.amount,
      total: items.reduce((s, t) => s + t.amount, 0),
      cardId: first.cardId,
      categoryId: first.categoryId,
      startDate: first.date,
      note: first.note,
      paid: items.filter((t) => t.date <= iso(new Date())).length,
    };
  }

  function plans() {
    const ids = [...new Set(state.transactions.filter((t) => t.planId).map((t) => t.planId))];
    return ids.map(plan).filter(Boolean).sort((a, b) => a.startDate.localeCompare(b.startDate));
  }

  function upsertCard(card) {
    if (card.id) {
      const c = state.cards.find((x) => x.id === card.id);
      Object.assign(c, card);
      save();
      return c;
    }
    const item = {
      id: "k_" + uid(),
      name: card.name || "Kart",
      last4: String(card.last4 || "").slice(0, 4),
      statementDay: Math.min(28, Math.max(1, Number(card.statementDay) || 1)),
      dueDay: Math.min(28, Math.max(1, Number(card.dueDay) || 10)),
      limit: Number(card.limit) || 0,
      color: card.color || "#4f8cff",
    };
    state.cards.push(item);
    save();
    return item;
  }

  function removeCard(id) {
    state.cards = state.cards.filter((c) => c.id !== id);
    state.transactions.forEach((t) => {
      if (t.cardId === id) t.cardId = null;
    });
    save();
  }

  function cardById(id) {
    return state.cards.find((c) => c.id === id) || null;
  }

  function cardSpending(cardId, bounds) {
    return state.transactions
      .filter((t) => t.cardId === cardId && t.type === "expense" && t.date >= bounds.startISO && t.date <= bounds.endISO)
      .reduce((s, t) => s + t.amount, 0);
  }

  function nextOccurrence(day) {
    const now = new Date();
    const d = new Date(now.getFullYear(), now.getMonth(), Math.min(28, Math.max(1, day)));
    if (d < new Date(now.getFullYear(), now.getMonth(), now.getDate())) d.setMonth(d.getMonth() + 1);
    return d;
  }

  function daysUntil(day) {
    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    return Math.round((nextOccurrence(day) - today) / 86400000);
  }

  /* ---------------- Toplamlar & raporlar ---------------- */
  function sums(list) {
    let income = 0,
      expense = 0;
    list.forEach((t) => (t.type === "income" ? (income += t.amount) : (expense += t.amount)));
    return { income, expense, net: income - expense };
  }

  function byCategory(list) {
    const map = new Map();
    list.filter((t) => t.type === "expense").forEach((t) => {
      map.set(t.categoryId, (map.get(t.categoryId) || 0) + t.amount);
    });
    const total = [...map.values()].reduce((s, v) => s + v, 0);
    return [...map.entries()]
      .map(([id, value]) => ({ category: category(id), value, pct: total ? (value / total) * 100 : 0 }))
      .sort((a, b) => b.value - a.value);
  }

  function dailySeries(bounds) {
    const out = [];
    const start = bounds.start;
    const total = Math.round((bounds.end - start) / 86400000) + 1;
    const map = new Map();
    state.transactions
      .filter((t) => t.type === "expense" && t.date >= bounds.startISO && t.date <= bounds.endISO)
      .forEach((t) => map.set(t.date, (map.get(t.date) || 0) + t.amount));
    const limit = Math.min(total, 400); // çok uzun dönemlerde örnekleyerek çiz
    const step = Math.max(1, Math.ceil(total / limit));
    for (let i = 0; i < total; i += step) {
      const d = new Date(start.getFullYear(), start.getMonth(), start.getDate() + i);
      let v = 0;
      for (let k = 0; k < step && i + k < total; k++) {
        const dd = new Date(start.getFullYear(), start.getMonth(), start.getDate() + i + k);
        v += map.get(iso(dd)) || 0;
      }
      out.push({ date: iso(d), label: d.toLocaleDateString("tr-TR", { day: "2-digit", month: "short" }), value: v });
    }
    return out;
  }

  function pctChange(cur, prev) {
    if (!prev) return cur ? 100 : 0;
    return ((cur - prev) / prev) * 100;
  }

  /* ---------------- Varlıklar & canlı fiyatlar ---------------- */
  function assets() {
    return state.assets;
  }
  function upsertAsset(a) {
    if (a.id) {
      const item = state.assets.find((x) => x.id === a.id);
      Object.assign(item, { code: a.code, amount: Number(a.amount) || 0 });
      save();
      return item;
    }
    const item = { id: "a_" + uid(), code: a.code, amount: Number(a.amount) || 0 };
    state.assets.push(item);
    save();
    return item;
  }
  function removeAsset(id) {
    state.assets = state.assets.filter((a) => a.id !== id);
    save();
  }
  function rateMeta(code) {
    return RATE_LIST.find((r) => r.code === code) || { code, label: code, icon: "💲", unit: "" };
  }
  function rateMap() {
    if (!state.rates) return null;
    return state.rates.map || null;
  }
  function rates() {
    return state.rates;
  }
  function assetValue(a) {
    const m = rateMap();
    if (!m || m[a.code] == null) return 0;
    return a.amount * m[a.code];
  }
  function portfolioTotal() {
    return state.assets.reduce((s, a) => s + assetValue(a), 0);
  }

  async function fetchRates(force) {
    const cached = state.rates;
    if (!force && cached && Date.now() - (cached.updatedAt || 0) < RATE_TTL) return cached;
    try {
      const [fxRes, xauRes, xagRes] = await Promise.all([
        fetch("https://open.er-api.com/v6/latest/USD", { cache: "no-store" }),
        fetch("https://api.gold-api.com/price/XAU", { cache: "no-store" }),
        fetch("https://api.gold-api.com/price/XAG", { cache: "no-store" }),
      ]);
      if (!fxRes.ok) throw new Error("Kur servisi yanıt vermedi");
      const fx = await fxRes.json();
      const xau = xauRes.ok ? await xauRes.json() : null;
      const xag = xagRes.ok ? await xagRes.json() : null;
      if (fx.result !== "success" || !fx.rates || !fx.rates.TRY) throw new Error("Kur verisi alınamadı");

      const usdTry = fx.rates.TRY;
      const per = (code) => (fx.rates[code] ? usdTry / fx.rates[code] : 0);
      const ounceUsd = xau && xau.price ? xau.price : cached && cached.map ? cached.map.XAU / usdTry : 0;
      const gram = (ounceUsd * usdTry) / OZ_GRAM;
      const silverGram = xag && xag.price ? (xag.price * usdTry) / OZ_GRAM : cached && cached.map ? cached.map.XAG : 0;

      const map = {
        USD: usdTry,
        EUR: per("EUR"),
        GBP: per("GBP"),
        CHF: per("CHF"),
        JPY: per("JPY") * 100, // 100 Yen
        XAU: ounceUsd * usdTry, // ons (TRY)
        GRAM: gram,
        CEYREK: gram * 1.75 * 0.916, // 1,75 gr × 916 ayar (yaklaşık)
        YARIM: gram * 3.5 * 0.916,
        XAG: silverGram,
      };

      const prev = cached && cached.map ? cached.map : map;
      state.rates = { updatedAt: Date.now(), live: true, map, prev };
      save();
      return state.rates;
    } catch (e) {
      console.warn("Canlı fiyatlar alınamadı (çevrimdışı olabilirsiniz):", e.message);
      if (state.rates) state.rates.live = false;
      else
        state.rates = {
          updatedAt: 0,
          live: false,
          map: { USD: 41, EUR: 44, GBP: 52, CHF: 47, JPY: 28, XAU: 39000, GRAM: 4500, CEYREK: 7300, YARIM: 14600, XAG: 620 },
          prev: null,
        };
      save();
      return state.rates;
    }
  }

  /* ---------------- Dışa/içe aktarma ---------------- */
  function exportJSON() {
    return JSON.stringify(state, null, 2);
  }
  function importJSON(text) {
    const parsed = JSON.parse(text);
    state = migrate(parsed);
    save();
    return state;
  }

  /* Başka hesaptan gelen veriyi BU hesaba ekler (üzerine yazmaz, sadece eksikleri alır) */
  function mergeState(incoming) {
    const src = migrate(incoming);
    const added = { transactions: 0, cards: 0, assets: 0, categories: 0, skipped: 0 };
    ["transactions", "cards", "assets", "categories"].forEach((key) => {
      const have = new Set((state[key] || []).map((x) => x.id));
      (src[key] || []).forEach((item) => {
        if (item && item.id && !have.has(item.id)) {
          state[key].push(item);
          have.add(item.id);
          added[key]++;
        } else {
          added.skipped++;
        }
      });
    });
    save();
    return added;
  }
  function reset() {
    const theme = state.settings.theme;
    state = freshState();
    state.settings.theme = theme;
    save();
  }

  return {
    get state() {
      return state;
    },
    DEFAULT_CATEGORIES,
    RATE_LIST,
    save,
    attach,
    setSaveHook,
    hasContent,
    GUEST_KEY,
    settings,
    setSetting,
    categories,
    category,
    addCategory,
    removeCategory,
    periodBounds,
    periodLabel,
    rangeBounds,
    rangeLabel,
    daysLeftInPeriod,
    allTx,
    txIn,
    txById,
    addTx,
    updateTx,
    removeTx,
    removePlan,
    plan,
    plans,
    upsertCard,
    removeCard,
    cardById,
    cardSpending,
    daysUntil,
    sums,
    byCategory,
    dailySeries,
    pctChange,
    assets,
    upsertAsset,
    removeAsset,
    rateMeta,
    RATE_LIST,
    rates,
    rateMap,
    assetValue,
    portfolioTotal,
    fetchRates,
    exportJSON,
    importJSON,
    mergeState,
    reset,
    iso,
    parseISO,
  };
})();
