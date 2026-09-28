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
        categoryBudgets: {}, // kategori bazlı aylık limit: { [catId]: tutar }
      },
      categories: DEFAULT_CATEGORIES.map((c) => ({ ...c })),
      transactions: [],
      cards: [],
      assets: [],
      recurring: [], // tekrarlayan (otomatik) işlemler
      goals: [], // birikim hedefleri
      rates: null,
    };
  }

  function migrate(parsed) {
    const base = freshState();
    if (!parsed || typeof parsed !== "object") return base;
    const srcSettings = parsed.settings && typeof parsed.settings === "object" ? parsed.settings : {};
    const out = {
      ...base,
      ...parsed,
      settings: {
        ...base.settings,
        ...srcSettings,
        categoryBudgets:
          srcSettings.categoryBudgets && typeof srcSettings.categoryBudgets === "object" ? srcSettings.categoryBudgets : {},
      },
      categories: Array.isArray(parsed.categories) && parsed.categories.length ? parsed.categories : base.categories,
      transactions: Array.isArray(parsed.transactions) ? parsed.transactions : [],
      cards: Array.isArray(parsed.cards) ? parsed.cards : [],
      assets: Array.isArray(parsed.assets) ? parsed.assets : [],
      recurring: Array.isArray(parsed.recurring) ? parsed.recurring : [],
      goals: Array.isArray(parsed.goals) ? parsed.goals : [],
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
      (Array.isArray(st.assets) && st.assets.length) ||
      (Array.isArray(st.recurring) && st.recurring.length) ||
      (Array.isArray(st.goals) && st.goals.length)
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

  /* ---------------- Tekrarlayan (otomatik) işlemler ---------------- */
  const FREQ_LABEL = { daily: "Her gün", weekly: "Haftada bir", monthly: "Ayda bir", yearly: "Yılda bir" };

  function normalizeRule(r) {
    const freq = FREQ_LABEL[r.freq] ? r.freq : "monthly";
    const type = r.type === "income" ? "income" : "expense";
    let nextDate = r.nextDate || r.startDate || iso(new Date());
    if (!/^\d{4}-\d{2}-\d{2}$/.test(nextDate)) nextDate = iso(new Date());
    return {
      id: r.id || "r_" + uid(),
      name: (r.name || "").trim() || "Otomatik işlem",
      type,
      categoryId: r.categoryId,
      amount: Math.abs(Number(r.amount) || 0),
      freq,
      startDate: /^\d{4}-\d{2}-\d{2}$/.test(r.startDate || "") ? r.startDate : nextDate,
      nextDate,
      cardId: r.cardId || null,
      note: r.note || "",
      active: r.active !== false,
      createdAt: r.createdAt || Date.now(),
    };
  }

  function recurringRules(activeOnly) {
    return [...state.recurring]
      .filter((r) => (activeOnly ? r.active !== false : true))
      .sort((a, b) => String(a.nextDate).localeCompare(String(b.nextDate)));
  }

  function ruleById(id) {
    return state.recurring.find((r) => r.id === id) || null;
  }

  function upsertRecurring(rule) {
    const clean = normalizeRule({ ...rule, id: rule.id || null });
    if (rule.id) {
      const item = ruleById(rule.id);
      if (!item) return null;
      Object.assign(item, clean, { id: item.id, createdAt: item.createdAt });
      save();
      return item;
    }
    state.recurring.push(clean);
    save();
    return clean;
  }

  function removeRecurring(id) {
    state.recurring = state.recurring.filter((r) => r.id !== id);
    save();
  }

  function toggleRecurring(id) {
    const r = ruleById(id);
    if (!r) return null;
    r.active = r.active === false;
    save();
    return r;
  }

  /* Bir sonraki tarihe ilerle (aylıkta gün 1-28 arasına sabitlenir, şubet sorunu yaşanmaz) */
  function advanceDate(dateStr, freq) {
    const d = parseISO(dateStr);
    if (freq === "daily") d.setDate(d.getDate() + 1);
    else if (freq === "weekly") d.setDate(d.getDate() + 7);
    else if (freq === "yearly") d.setFullYear(d.getFullYear() + 1);
    else {
      const day = Math.min(28, Math.max(1, d.getDate()));
      const probe = new Date(d.getFullYear(), d.getMonth() + 1, 1);
      const last = new Date(probe.getFullYear(), probe.getMonth() + 1, 0).getDate();
      return iso(new Date(probe.getFullYear(), probe.getMonth(), Math.min(day, last)));
    }
    return iso(d);
  }

  /* Bugüne kadar vadesi gelen otomatik işlemleri oluşturur (idempotent: aynı tarih iki kez üretilmez).
     Döngü return edilen dizi: [{rule, tx}] */
  function processRecurring(ref = new Date()) {
    const todayISO = iso(ref);
    const out = [];
    state.recurring.forEach((rule) => {
      if (rule.active === false || !rule.amount) return;
      if (!/^\d{4}-\d{2}-\d{2}$/.test(rule.nextDate || "")) rule.nextDate = rule.startDate || todayISO;
      let guard = 0;
      while (rule.nextDate <= todayISO && guard++ < 400) {
        const date = rule.nextDate;
        const key = rule.id + ":" + date;
        const exists = state.transactions.some((t) => t.recurringKey === key);
        if (!exists) {
          const item = {
            id: "t_" + uid(),
            type: rule.type === "income" ? "income" : "expense",
            amount: Math.abs(Number(rule.amount) || 0),
            categoryId: rule.categoryId,
            date,
            note: rule.note || rule.name,
            cardId: rule.cardId || null,
            planId: null,
            installmentIndex: null,
            installmentCount: null,
            recurringId: rule.id,
            recurringKey: key,
            createdAt: Date.now(),
          };
          state.transactions.push(item);
          out.push({ rule, tx: item });
        }
        rule.nextDate = advanceDate(date, rule.freq);
      }
    });
    if (out.length) save();
    return out;
  }

  /* Önümüzdeki `days` gün içinde vadesi gelen otomatik işlemler */
  function upcomingRecurring(days = 7, ref = new Date()) {
    const until = iso(new Date(ref.getFullYear(), ref.getMonth(), ref.getDate() + Math.max(0, days)));
    return recurringRules(true)
      .filter((r) => r.nextDate <= until)
      .map((r) => ({ rule: r, days: Math.round((parseISO(r.nextDate) - new Date(ref.getFullYear(), ref.getMonth(), ref.getDate())) / 86400000) }));
  }

  /* ---------------- Kategori bazlı limit (envelope) ---------------- */
  function categoryBudgets() {
    return (state.settings && state.settings.categoryBudgets) || {};
  }

  function setCategoryBudget(catId, amount) {
    if (!state.settings.categoryBudgets || typeof state.settings.categoryBudgets !== "object")
      state.settings.categoryBudgets = {};
    const v = Math.max(0, Number(amount) || 0);
    if (v > 0) state.settings.categoryBudgets[catId] = v;
    else delete state.settings.categoryBudgets[catId];
    save();
    return categoryBudgets();
  }

  /* Dönem içindeki limitli kategorilerin kullanımı */
  function categoryUsage(bounds) {
    const budgets = categoryBudgets();
    const spent = {};
    txIn(bounds, "expense").forEach((t) => (spent[t.categoryId] = (spent[t.categoryId] || 0) + t.amount));
    return Object.keys(budgets)
      .map((id) => {
        const limit = Number(budgets[id]) || 0;
        const used = Number(spent[id]) || 0;
        return {
          category: category(id),
          limit,
          spent: used,
          remaining: limit - used,
          pct: limit > 0 ? (used / limit) * 100 : 0,
          over: limit > 0 && used > limit,
          close: limit > 0 && used >= limit * 0.8 && used <= limit,
        };
      })
      .sort((a, b) => b.pct - a.pct);
  }

  /* ---------------- Birikim hedefleri ---------------- */
  function goals() {
    return state.goals;
  }

  function goalById(id) {
    return state.goals.find((g) => g.id === id) || null;
  }

  function upsertGoal(g) {
    const target = Math.max(0, Number(g.target) || 0);
    if (g.id) {
      const item = goalById(g.id);
      if (!item) return null;
      Object.assign(item, {
        name: (g.name || "").trim() || item.name,
        target,
        deadline: /^\d{4}-\d{2}-\d{2}$/.test(g.deadline || "") ? g.deadline : "",
        note: g.note || "",
      });
      save();
      return item;
    }
    const item = {
      id: "g_" + uid(),
      name: (g.name || "").trim() || "Hedef",
      target,
      deadline: /^\d{4}-\d{2}-\d{2}$/.test(g.deadline || "") ? g.deadline : "",
      note: g.note || "",
      contributions: [],
      createdAt: Date.now(),
    };
    state.goals.push(item);
    save();
    return item;
  }

  function removeGoal(id) {
    state.goals = state.goals.filter((g) => g.id !== id);
    save();
  }

  /* Hedefe para ayırma — harcama değildir (para hâlâ kullanıcıda), raporlara girmez */
  function addContribution(goalId, amount, date) {
    const g = goalById(goalId);
    if (!g) return null;
    if (!Array.isArray(g.contributions)) g.contributions = [];
    const item = {
      id: "gc_" + uid(),
      date: /^\d{4}-\d{2}-\d{2}$/.test(date || "") ? date : iso(new Date()),
      amount: Math.abs(Number(amount) || 0),
      createdAt: Date.now(),
    };
    g.contributions.push(item);
    save();
    return item;
  }

  function removeContribution(goalId, contributionId) {
    const g = goalById(goalId);
    if (!g) return;
    g.contributions = (g.contributions || []).filter((c) => c.id !== contributionId);
    save();
  }

  function goalProgress(g, ref = new Date()) {
    const saved = (g.contributions || []).reduce((s, c) => s + (Number(c.amount) || 0), 0);
    const target = Number(g.target) || 0;
    const remaining = Math.max(0, target - saved);
    const pct = target > 0 ? Math.min(100, (saved / target) * 100) : 0;
    let monthly = 0;
    let monthsLeft = 0;
    if (g.deadline) {
      const dl = parseISO(g.deadline);
      monthsLeft = Math.max(0, (dl.getFullYear() - ref.getFullYear()) * 12 + (dl.getMonth() - ref.getMonth()));
      if (monthsLeft > 0 && remaining > 0) monthly = remaining / monthsLeft;
      else if (remaining > 0) monthly = remaining; // süre dolmuş: hemen gereken
    }
    return { saved, target, remaining, pct, monthly, monthsLeft, done: target > 0 && saved >= target };
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
    const added = { transactions: 0, cards: 0, assets: 0, categories: 0, recurring: 0, goals: 0, skipped: 0 };
    ["transactions", "cards", "assets", "categories", "recurring", "goals"].forEach((key) => {
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

  /* ---------------- CSV dışa / içe aktarma ----------------
     Rakiplerde (Monefy, Wallet, Money Manager, banka ekstreleri) yaygın biçim:
     başlık satırlı, `;` veya `,` ayraçlı, tırnak korumalı. */
  function csvEscape(v) {
    const s = v == null ? "" : String(v);
    return /[",\n\r]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
  }

  function exportCSV() {
    const head = ["Tarih", "Tur", "Kategori", "Tutar", "Kart", "Not"];
    const rows = allTx().map((t) => {
      const c = category(t.categoryId);
      const card = t.cardId ? cardById(t.cardId) : null;
      return [t.date, t.type === "income" ? "gelir" : "gider", c.name, Number(t.amount).toFixed(2), card ? card.name : "", t.note || ""];
    });
    return [head, ...rows].map((r) => r.map(csvEscape).join(",")).join("\r\n");
  }

  /* CSV metnini satırlara ayırır (tırnak / kaçış / iki ayraç da desteklenir) */
  function parseCSV(text) {
    const clean = String(text == null ? "" : text).replace(/^\uFEFF/, "");
    const first = clean.split(/\r?\n/)[0] || "";
    const delim = (first.match(/;/g) || []).length > (first.match(/,/g) || []).length ? ";" : ",";
    const rows = [];
    let row = [],
      field = "",
      inQ = false;
    for (let i = 0; i < clean.length; i++) {
      const ch = clean[i];
      if (inQ) {
        if (ch === '"') {
          if (clean[i + 1] === '"') {
            field += '"';
            i++;
          } else inQ = false;
        } else field += ch;
      } else if (ch === '"') inQ = true;
      else if (ch === delim) {
        row.push(field);
        field = "";
      } else if (ch === "\n") {
        row.push(field);
        rows.push(row);
        row = [];
        field = "";
      } else if (ch !== "\r") field += ch;
    }
    if (field.length || row.length) {
      row.push(field);
      rows.push(row);
    }
    return rows.filter((r) => r.some((c) => String(c).trim() !== ""));
  }

  const trFold = (s) =>
    String(s || "")
      .toLowerCase()
      .replace(/ç/g, "c")
      .replace(/ğ/g, "g")
      .replace(/ı/g, "i")
      .replace(/ö/g, "o")
      .replace(/ş/g, "s")
      .replace(/ü/g, "u")
      .replace(/\s+/g, " ")
      .trim();

  function toISODate(v) {
    const s = String(v || "").trim();
    let m = s.match(/^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})/);
    if (m) return `${m[1]}-${String(m[2]).padStart(2, "0")}-${String(m[3]).padStart(2, "0")}`;
    m = s.match(/^(\d{1,2})[-/.](\d{1,2})[-/.](\d{4})/);
    if (m) return `${m[3]}-${String(m[2]).padStart(2, "0")}-${String(m[1]).padStart(2, "0")}`;
    return "";
  }

  function csvFingerprint(date, type, amount, categoryId, note) {
    return [date, type, Number(amount).toFixed(2), categoryId, trFold(note)].join("|");
  }

  /* CSV metnini işle → önizleme satırları. Hiçbir şey yazmaz, sadece okur. */
  function importCSV(text) {
    const rows = parseCSV(text);
    if (rows.length < 2) throw new Error("Dosyada en az bir başlık ve bir kayıt satırı olmalı");

    const header = rows[0].map(trFold);
    const findCol = (aliases) => header.findIndex((h) => aliases.some((a) => h === a || h.indexOf(a) === 0));
    let idx = {
      date: findCol(["tarih", "date", "gun", "islem tarihi"]),
      type: findCol(["tur", "tip", "type", "yon", "gelir/gider"]),
      category: findCol(["kategori", "category", "harcama", "gider turu"]),
      amount: findCol(["tutar", "amount", "miktar", "fiyat", "bedel", "para"]),
      card: findCol(["kart", "hesap", "account", "card"]),
      note: findCol(["not", "aciklama", "description", "note", "isim", "ad"]),
    };
    /* Başlık gerçekten başlık mı? İlk hücre tarih okunuyorsa o satır da kayıttır */
    const looksHeader = (idx.date >= 0 || idx.amount >= 0) && !toISODate(rows[0][idx.date >= 0 ? idx.date : 0]);
    const firstDataRow = looksHeader ? 1 : 0; // başlık yoksa ilk satır da kayıttır
    if (!looksHeader) idx = { date: 0, type: 1, category: 2, amount: 3, card: 4, note: 5 };
    if (idx.date < 0 || idx.amount < 0) throw new Error("Tarih ve tutar sütunları bulunamadı — başlık satırını kontrol et");

    const existing = new Set(state.transactions.map((t) => csvFingerprint(t.date, t.type, t.amount, t.categoryId, t.note)));
    const out = [];
    let dup = 0,
      bad = 0,
      autoCats = 0;

    for (let r = firstDataRow; r < rows.length; r++) {
      const cells = rows[r];
      const date = toISODate(cells[idx.date]);
      const raw = String(cells[idx.amount] == null ? "" : cells[idx.amount])
        .replace(/[^\d.,-]/g, "")
        .replace(/\.(?=\d{3}\b)/g, "") // binlik ayracı: 1.500
        .replace(",", ".");
      const amount = Math.abs(parseFloat(raw));
      if (!date || !isFinite(amount) || amount <= 0) {
        bad++;
        continue;
      }
      const rawType = idx.type >= 0 ? trFold(cells[idx.type]) : "";
      const signed = String(cells[idx.amount] == null ? "" : cells[idx.amount]).trim().charAt(0) === "-";
      let type;
      if (rawType.indexOf("gelir") >= 0 || rawType === "income" || rawType === "+" || rawType === "in") type = "income";
      else if (rawType.indexOf("gider") >= 0 || rawType === "expense" || rawType === "-" || rawType === "out") type = "expense";
      else type = signed ? "expense" : "income"; // işaretsiz ise banka ekstresinde + gelir

      let categoryId = "";
      const catName = idx.category >= 0 ? String(cells[idx.category] || "").trim() : "";
      if (catName) {
        const found = state.categories.find((c) => trFold(c.name) === trFold(catName));
        if (found) categoryId = found.id;
      }
      if (!categoryId) {
        if (catName) autoCats++;
        categoryId = type === "income" ? "digerG" : "digerX";
      }

      const note = idx.note >= 0 ? String(cells[idx.note] || "").trim() : "";
      const cardName = idx.card >= 0 ? String(cells[idx.card] || "").trim() : "";
      const cardHit = cardName ? state.cards.find((c) => trFold(c.name) === trFold(cardName)) : null;
      const cardId = cardHit ? cardHit.id : null;

      const fp = csvFingerprint(date, type, amount, categoryId, note);
      const isDup = existing.has(fp);
      if (isDup) dup++;
      else existing.add(fp);

      out.push({ date, type, amount, categoryId, categoryName: catName, note, cardId, cardName, dup: isDup });
    }

    return { rows: out, total: out.length, new: out.length - dup, dup, bad, autoCats };
  }

  /* Önizlemeden onaylanan satırları ekler (tek seferde tek save) */
  function importCSVRows(items) {
    let added = 0;
    (items || []).forEach((it) => {
      if (!it || it.dup) return;
      state.transactions.push({
        id: "t_" + uid(),
        type: it.type === "income" ? "income" : "expense",
        amount: Math.abs(Number(it.amount) || 0),
        categoryId: it.categoryId || (it.type === "income" ? "digerG" : "digerX"),
        date: it.date,
        note: it.note || "",
        cardId: it.cardId || null,
        planId: null,
        installmentIndex: null,
        installmentCount: null,
        createdAt: Date.now(),
      });
      added++;
    });
    if (added) save();
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
    /* v2 özellikleri (diğer bütçe uygulamalarından) */
    FREQ_LABEL,
    recurringRules,
    ruleById,
    upsertRecurring,
    removeRecurring,
    toggleRecurring,
    processRecurring,
    upcomingRecurring,
    advanceDate,
    categoryBudgets,
    setCategoryBudget,
    categoryUsage,
    goals,
    goalById,
    upsertGoal,
    removeGoal,
    addContribution,
    removeContribution,
    goalProgress,
    exportCSV,
    parseCSV,
    importCSV,
    importCSVRows,
    iso,
    parseISO,
  };
})();
