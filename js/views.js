/* views.js — ekranların çizimi: ana sayfa, raporlar, varlıklar, kartlar, ayarlar */
window.Views = (function () {
  "use strict";

  const PALETTE = ["#ff8a3d", "#ffd166", "#4dc3ff", "#ff6b9d", "#b18cff", "#5ad1a6", "#7aa2ff", "#2ecc8f", "#ff7ab6", "#95a5b6"];
  const CARD_COLORS = ["#2f6fed", "#7a5cff", "#e0575b", "#0f9d76", "#d97706", "#4b5563"];
  let reportRange = "current";

  /* =========================================================
     Başlık
  ========================================================= */
  function header() {
    const b = Store.periodBounds(0);
    const left = Store.daysLeftInPeriod();
    $("#headerPeriod").textContent = `${Store.periodLabel(b)} · ${left} gün kaldı`;
    const rates = Store.rates();
    const btn = $("#btnRates");
    if (btn) btn.title = rates && rates.updatedAt ? `Son güncelleme: ${new Date(rates.updatedAt).toLocaleTimeString("tr-TR", { hour: "2-digit", minute: "2-digit" })}` : "Kurları yenile";
  }

  /* =========================================================
     Ana sayfa
  ========================================================= */
  function deltaChip(cur, prev, goodWhenUp) {
    const p = Store.pctChange(cur, prev);
    const up = p >= 0;
    const good = up === !!goodWhenUp;
    return `<span class="delta ${good ? "up" : "down"}">${up ? "▲" : "▼"} %${Math.abs(p).toFixed(0)}</span>`;
  }

  function txRow(t) {
    const cat = Store.category(t.categoryId);
    const card = t.cardId ? Store.cardById(t.cardId) : null;
    const bits = [UI.relDay(t.date)];
    if (t.installmentCount) bits.push(`Taksit ${t.installmentIndex}/${t.installmentCount}`);
    if (card) bits.push(card.name);
    if (t.note) bits.push(t.note);
    const sign = t.type === "income" ? "+" : "−";
    return `<button class="tx" data-tx="${t.id}">
      <span class="ic" style="background:${cat.color}22">${cat.icon}</span>
      <span class="mid">
        <span class="t">${esc(cat.name)}</span>
        <span class="s">${esc(bits.join(" · "))}</span>
      </span>
      <span class="amt ${t.type === "income" ? "in" : "out"}">${sign}${esc(UI.fmtMoney(t.amount))}</span>
    </button>`;
  }

  function home() {
    const el = $("#view-home");
    const b = Store.periodBounds(0);
    const list = Store.txIn(b);
    const s = Store.sums(list);
    const settings = Store.settings();
    const budget = Number(settings.periodBudget) || 0;
    const left = Store.daysLeftInPeriod();
    const used = budget > 0 ? (s.expense / budget) * 100 : 0;
    const remaining = budget - s.expense;
    const barCls = used >= 100 ? "over" : used >= 80 ? "warn" : "";
    const daily = budget > 0 && left > 0 ? Math.max(0, remaining) / left : 0;

    /* Hatırlatmalar */
    const banners = [];
    if (settings.reminders) {
      Store.state.cards.forEach((c) => {
        const ds = Store.daysUntil(c.statementDay);
        if (ds <= 3) banners.push({ ico: "💳", title: `${c.name} kesim günü`, txt: ds === 0 ? "Bugün!" : `${ds} gün kaldı` });
        const dd = Store.daysUntil(c.dueDay);
        if (dd <= 3) banners.push({ ico: "⏰", title: `${c.name} son ödeme`, txt: dd === 0 ? "Bugün!" : `${dd} gün kaldı` });
      });
      if (budget > 0 && used >= 100)
        banners.unshift({ ico: "🚨", title: "Dönem bütçesi aşıldı", txt: `${esc(UI.fmtMoney(s.expense - budget))} over limit` });
      else if (budget > 0 && used >= 80)
        banners.unshift({ ico: "⚠️", title: "Bütçenin %80'i kullanıldı", txt: `Kalan: ${esc(UI.fmtMoney(Math.max(0, remaining)))}` });
    }

    const recent = Store.allTx().slice(0, 6);
    const cats = Store.categories("expense");

    el.innerHTML = `
      <div class="card budget-card">
        <div class="budget-top">
          <div>
            <div class="budget-label">Kalan dönem bütçesi</div>
            <div class="budget-amount ${budget > 0 && remaining < 0 ? "over" : ""}">${
      budget > 0 ? esc(UI.fmtMoney(Math.max(0, remaining))) : "Bütçe yok"
    }</div>
            <div class="small muted" style="margin-top:2px">Harcanan: ${esc(UI.fmtMoney(s.expense))}${
      budget > 0 ? ` / ${esc(UI.fmtMoney(budget))}` : ""
    }</div>
          </div>
          <div style="text-align:right">
            <span class="pill ${used >= 100 ? "" : "accent"}">%${used.toFixed(0)} kullanıldı</span>
          </div>
        </div>
        <div class="progress"><i class="${barCls}" style="width:${Math.min(100, used).toFixed(1)}%"></i></div>
        <div class="budget-meta">
          <span class="pill">📅 ${esc(Store.periodLabel(b))}</span>
          <span class="pill">⏳ ${left} gün kaldı</span>
          ${
            budget > 0
              ? `<span class="pill good">💡 Günlük: ${esc(UI.fmtMoney(daily))}</span>`
              : `<button class="pill accent" id="homeSetBudget">＋ Bütçe belirle</button>`
          }
        </div>
      </div>

      <div class="stats">
        <div class="stat"><div class="lbl">Gelir</div><div class="val in">${esc(UI.fmtCompact(s.income))}</div></div>
        <div class="stat"><div class="lbl">Gider</div><div class="val out">${esc(UI.fmtCompact(s.expense))}</div></div>
        <div class="stat"><div class="lbl">Bakiye</div><div class="val">${esc(UI.fmtCompact(s.net))}</div></div>
      </div>

      ${banners
        .slice(0, 2)
        .map(
          (bn) => `<div class="banner"><span class="b-ico">${bn.ico}</span><span class="b-txt"><strong>${esc(
            bn.title
          )}</strong>${esc(bn.txt)}</span></div>`
        )
        .join("")}

      <div class="section-title">Hızlı gider ekle</div>
      <div class="chip-row" style="margin-bottom:16px">
        ${cats
          .map(
            (c) => `<button class="chip" data-quick="${c.id}"><span class="ico">${c.icon}</span><span>${esc(c.name)}</span></button>`
          )
          .join("")}
      </div>

      <div class="section-title">
        <span>Son işlemler</span>
        <button class="link" id="homeAllTx">Tümü (${Store.state.transactions.length})</button>
      </div>
      <div class="card tight">
        <div class="list">
          ${
            recent.length
              ? recent.map(txRow).join("")
              : `<div class="empty"><span class="big-ico">🧾</span>Bu dönemde henüz işlem yok.<br/>Altteki <b>＋</b> ile ilk gelirini ya da giderini ekle.</div>`
          }
        </div>
      </div>`;

    /* Bağlantılar */
    $$("[data-quick]", el).forEach((btn) => (btn.onclick = () => App.openAdd({ categoryId: btn.dataset.quick })));
    $$("[data-tx]", el).forEach((btn) => (btn.onclick = () => App.openEdit(btn.dataset.tx)));
    const allBtn = $("#homeAllTx", el);
    if (allBtn) allBtn.onclick = () => App.openTxList();
    const setBtn = $("#homeSetBudget", el);
    if (setBtn) setBtn.onclick = () => UI.showView("settings");
  }

  /* =========================================================
     Raporlar
  ========================================================= */
  function report() {
    const el = $("#view-report");
    const b = Store.rangeBounds(reportRange);
    const list = Store.txIn(b);
    const s = Store.sums(list);
    const cats = Store.byCategory(list);

    /* Karşılaştırma dönemi */
    let prev = null;
    if (reportRange === "current") prev = Store.periodBounds(-1);
    else if (reportRange === "previous") prev = Store.periodBounds(-2);
    else if (reportRange === "last3") {
      const st = Store.periodBounds(-5).start;
      const en = Store.periodBounds(-3).end;
      prev = { start: st, end: en, startISO: Store.iso(st), endISO: Store.iso(en) };
    }
    const prevSums = prev ? Store.sums(Store.txIn(prev)) : null;

    el.innerHTML = `
      <div class="seg" id="reportSeg">
        ${[
          ["current", "Bu dönem"],
          ["previous", "Geçen dönem"],
          ["last3", "Son 3 dönem"],
          ["all", "Tümü"],
        ]
          .map(([k, l]) => `<button data-range="${k}" class="${reportRange === k ? "active" : ""}">${l}</button>`)
          .join("")}
      </div>

      <div class="stats">
        <div class="stat"><div class="lbl">Gelir</div><div class="val in">${esc(UI.fmtCompact(s.income))}</div></div>
        <div class="stat"><div class="lbl">Gider</div><div class="val out">${esc(UI.fmtCompact(s.expense))}${
      prevSums ? `<div>${deltaChip(s.expense, prevSums.expense, false)}</div>` : ""
    }</div></div>
        <div class="stat"><div class="lbl">Net</div><div class="val">${esc(UI.fmtCompact(s.net))}</div></div>
      </div>

      <div class="card">
        <div class="section-title" style="margin-top:0"><span>Harcama dağılımı</span><span class="link">${esc(
          Store.rangeLabel(reportRange)
        )}</span></div>
        <div class="donut-wrap">
          <div class="donut-box" id="donutBox"></div>
        </div>
        <ul class="legend">
          ${
            cats.length
              ? cats
                  .map(
                    (c) => `<li>
                      <span class="swatch" style="background:${c.category.color}"></span>
                      <span class="name">${c.category.icon} ${esc(c.category.name)}</span>
                      <span class="val">${esc(UI.fmtMoney(c.value))}</span>
                      <span class="pct">%${c.pct.toFixed(0)}</span>
                    </li>`
                  )
                  .join("")
              : `<div class="empty">Bu dönemde gider kaydı yok</div>`
          }
        </ul>
      </div>

      <div class="card">
        <div class="section-title" style="margin-top:0">Günlük harcama</div>
        <div class="chart-box" id="areaBox"></div>
      </div>

      <div class="card">
        <div class="section-title" style="margin-top:0">En çok harcanan kategoriler</div>
        <div id="barsBox">${
          cats.length ? "" : `<div class="empty"><span class="big-ico">📉</span>Gösterilecek veri yok</div>`
        }</div>
      </div>`;

    $$("[data-range]", el).forEach((btn) => (btn.onclick = () => { reportRange = btn.dataset.range; report(); }));

    Charts.donut($("#donutBox", el), cats.map((c) => ({ value: c.value, color: c.category.color })), {
      centerLines: [
        { text: "Toplam gider", cls: "muted" },
        { text: UI.fmtCompact(s.expense), cls: "big" },
      ],
      aria: "Kategori bazlı harcama dağılımı",
    });
    Charts.area($("#areaBox", el), Store.dailySeries(b), { fmt: (v) => UI.fmtMoney(v), color: "#4f8cff" });
    if (cats.length) Charts.bars($("#barsBox", el), cats.slice(0, 6), { fmt: (v) => UI.fmtMoney(v) });
  }

  /* =========================================================
     Varlıklar (canlı döviz & altın)
  ========================================================= */
  function rateCard(r, map, prev) {
    const val = map[r.code];
    const old = prev ? prev[r.code] : null;
    let delta = "";
    if (old && val) {
      const p = ((val - old) / old) * 100;
      const cls = Math.abs(p) < 0.05 ? "flat" : p > 0 ? "up" : "down";
      delta = `<span class="delta ${cls}">${p > 0 ? "▲" : p < 0 ? "▼" : "•"} %${Math.abs(p).toFixed(2)}</span>`;
    } else {
      delta = `<span class="delta flat">canlı</span>`;
    }
    return `<div class="rate">
      <div class="r-top"><span>${r.icon}</span><span>${esc(r.label)}</span></div>
      <div class="r-price">${esc(UI.fmtMoney(val))}</div>
      <div class="small muted">${esc(r.unit)} · ${delta}</div>
    </div>`;
  }

  function assets() {
    const el = $("#view-assets");
    const rates = Store.rates();
    const map = (rates && rates.map) || {};
    const prev = (rates && rates.prev) || null;
    const holdings = Store.assets();
    const total = Store.portfolioTotal();
    const updated = rates && rates.updatedAt ? new Date(rates.updatedAt).toLocaleTimeString("tr-TR", { hour: "2-digit", minute: "2-digit" }) : "—";
    const liveBadge = rates && rates.live ? `<span class="pill good">● canlı</span>` : `<span class="pill warn">○ çevrimdışı / önbellek</span>`;

    el.innerHTML = `
      <div class="card">
        <div class="portfolio-hero">
          <div class="p-label">Portföy toplam değeri</div>
          <div class="p-value">${esc(UI.fmtMoney(total))}</div>
          <div class="small muted" style="margin-top:4px">${holdings.length} varlık · ${liveBadge} <span class="small">son: ${updated}</span></div>
        </div>
        <div class="btn-row" style="margin-top:12px">
          <button class="btn primary sm" id="addAssetBtn">＋ Varlık ekle</button>
          <button class="btn sm" id="refreshRates">🔄 Fiyatları yenile</button>
        </div>
      </div>

      <div class="section-title">Varlıklarım</div>
      <div class="card tight">
        ${
          holdings.length
            ? holdings
                .map((a) => {
                  const meta = Store.rateMeta(a.code);
                  return `<button class="row-item" data-asset="${a.id}" style="width:100%;text-align:left">
                    <span class="ic" style="width:40px;height:40px;display:grid;place-items:center;border-radius:13px;background:var(--surface-2);font-size:19px">${meta.icon}</span>
                    <span class="mid">
                      <span class="t">${esc(UI.fmtNum(a.amount))} × ${esc(meta.label)}</span>
                      <span class="s">Birim: ${esc(UI.fmtMoney(map[a.code] || 0))}</span>
                    </span>
                    <span class="right"><span class="v">${esc(UI.fmtMoney(Store.assetValue(a)))}</span></span>
                  </button>`;
                })
                .join("")
            : `<div class="empty"><span class="big-ico">💰</span>Henüz varlık eklemedin.<br/>Döviz, altın veya gümüş miktarını gir, anlık fiyatla değerini gör.</div>`
        }
      </div>

      <div class="section-title">Piyasa fiyatları (TRY)</div>
      <div class="rate-grid">
        ${Store.RATE_LIST.map((r) => rateCard(r, map, prev)).join("")}
      </div>
      <p class="small muted" style="margin-top:12px;text-align:center">
        Kaynak: open.er-api.com + gold-api.com · Her 10 dakikada bir otomatik yenilenir.
      </p>`;

    const addBtn = $("#addAssetBtn", el);
    if (addBtn) addBtn.onclick = () => App.openAssetSheet();
    const refBtn = $("#refreshRates", el);
    if (refBtn)
      refBtn.onclick = async () => {
        refBtn.textContent = "⏳ Alınıyor…";
        await Store.fetchRates(true);
        UI.refresh();
        UI.toast("Fiyatlar güncellendi");
      };
    $$("[data-asset]", el).forEach((btn) => (btn.onclick = () => App.openAssetSheet(btn.dataset.asset)));
  }

  /* =========================================================
     Kredi kartları & taksitler
  ========================================================= */
  function cards() {
    const el = $("#view-cards");
    const b = Store.periodBounds(0);
    const list = Store.state.cards;
    const plans = Store.plans();

    const cardsHtml = list.length
      ? list
          .map((c) => {
            const spent = Store.cardSpending(c.id, b);
            const pct = c.limit > 0 ? Math.min(100, (spent / c.limit) * 100) : 0;
            const stmt = Store.daysUntil(c.statementDay);
            const due = Store.daysUntil(c.dueDay);
            return `<div class="card-item" style="background:linear-gradient(135deg, ${c.color}, ${c.color}b0)">
              <div class="c-name">💳 ${esc(c.name)}</div>
              <div class="c-num">•••• •••• •••• ${esc(c.last4 || "0000")}</div>
              <div class="c-meta">
                <span>Kesim günü: ${c.statementDay} (${stmt === 0 ? "bugün" : stmt + " gün"})</span>
                <span>Son ödeme: ${c.dueDay} (${due === 0 ? "bugün" : due + " gün"})</span>
              </div>
              <div class="c-bar"><i style="width:${pct.toFixed(0)}%"></i></div>
              <div class="c-meta">
                <span>Bu dönem: ${esc(UI.fmtMoney(spent))}</span>
                <span>${c.limit > 0 ? `Limit %${pct.toFixed(0)}` : "Limit girilmedi"}</span>
              </div>
              <div class="card-actions">
                <button class="btn sm" data-card-edit="${c.id}">Düzenle</button>
                <button class="btn sm" data-card-del="${c.id}">Sil</button>
              </div>
            </div>`;
          })
          .join("")
      : `<div class="empty"><span class="big-ico">💳</span>Kartın yoksa taksit ve kesim takibi de yok demektir.<br/>İlk kartını ekle.</div>`;

    const plansHtml = plans.length
      ? plans
          .map((p) => {
            const cat = Store.category(p.categoryId);
            const card = p.cardId ? Store.cardById(p.cardId) : null;
            const next = p.items.find((t) => t.date > Store.iso(new Date()));
            const remaining = (p.count - p.paid) * p.monthly;
            return `<div class="row-item">
              <span class="ic" style="width:40px;height:40px;display:grid;place-items:center;border-radius:13px;background:var(--surface-2);font-size:19px">${cat.icon}</span>
              <span class="mid">
                <span class="t">${esc(p.count)} taksit × ${esc(UI.fmtMoney(p.monthly))}</span>
                <span class="s">${card ? esc(card.name) + " · " : ""}${esc(p.note || cat.name)} · Kalan ${p.count - p.paid}/${p.count}${
              next ? ` · Sonraki: ${esc(UI.relDay(next.date))}` : ""
            }</span>
              </span>
              <span class="right">
                <span class="v">${esc(UI.fmtMoney(remaining))}</span>
                <button class="btn sm danger" data-plan-del="${p.id}" style="margin-top:5px">Planı sil</button>
              </span>
            </div>`;
          })
          .join("")
      : `<div class="empty">Taksitli harcaman yok.</div>`;

    el.innerHTML = `
      <div class="section-title"><span>Kredi kartlarım</span><button class="link" id="addCardBtn">＋ Kart ekle</button></div>
      ${cardsHtml}
      <div class="section-title" style="margin-top:18px">Taksitli harcamalar</div>
      <div class="card tight">${plansHtml}</div>`;

    const addBtn = $("#addCardBtn", el);
    if (addBtn) addBtn.onclick = () => App.openCardSheet();
    $$("[data-card-edit]", el).forEach((b2) => (b2.onclick = () => App.openCardSheet(b2.dataset.cardEdit)));
    $$("[data-card-del]", el).forEach(
      (b2) =>
        (b2.onclick = () => {
          const c = Store.cardById(b2.dataset.cardDel);
          if (UI.confirmBox(`"${c.name}" kartı silinsin mi?`)) {
            Store.removeCard(c.id);
            UI.refresh();
            UI.toast("Kart silindi");
          }
        })
    );
    $$("[data-plan-del]", el).forEach(
      (b2) =>
        (b2.onclick = () => {
          if (UI.confirmBox("Bu taksit planındaki tüm taksitler silinsin mi?")) {
            Store.removePlan(b2.dataset.planDel);
            UI.refresh();
            UI.toast("Taksit planı silindi");
          }
        })
    );
  }

  /* =========================================================
     Ayarlar
  ========================================================= */
  function settings() {
    const el = $("#view-settings");
    const st = Store.settings();
    const customCats = Store.categories().filter((c) => String(c.id).startsWith("c_"));
    let pickedColor = PALETTE[0];

    const accUser = Auth.user();
    const accMode = Auth.currentMode();
    const accEmail = Auth.email();
    const accBadge = accMode === "server" ? "good" : accMode === "local" ? "warn" : "accent";
    /* PWA olarak (ana ekrandan) açıldıysa "Ana Ekrana Ekle" ipucu gereksiz */
    const isStandalone =
      (typeof window.matchMedia === "function" && window.matchMedia("(display-mode: standalone)").matches) ||
      window.navigator.standalone === true;

    el.innerHTML = `
      <div class="section-title">Hesap</div>
      <div class="card">
        <div class="row-item">
          <span class="ic" style="width:42px;height:42px;display:grid;place-items:center;border-radius:50%;font-weight:800;color:#fff;background:linear-gradient(135deg,#4f8cff,#7a5cff);font-size:17px">${
            accUser ? esc(accUser.slice(0, 1).toUpperCase()) : "👤"
          }</span>
          <span class="mid">
            <span class="t">${accUser ? "@" + esc(accUser) : "Misafir"}${accEmail ? ` <span class="muted" style="font-weight:400">· ${esc(accEmail)}</span>` : ""}</span>
            <span class="s"><span class="pill ${accBadge}" style="font-size:10.5px">${esc(
      Auth.modeLabel()
    )}</span> · kayıtların diğer hesaplardan ayrı</span>
          </span>
          <button class="btn sm danger" id="settingsLogout">Çıkış</button>
        </div>
        <p class="small muted" style="margin-top:10px">${esc(Auth.modeDetail())}</p>
      </div>

      <div class="section-title">Dönem &amp; bütçe</div>
      <div class="card">
        <div class="field">
          <label>Dönem başlangıç günü</label>
          <div class="range-row">
            <input type="range" id="setStartDay" min="1" max="28" value="${st.periodStartDay}" />
            <span class="range-val" id="startDayVal">Her ayın ${st.periodStartDay}'i</span>
          </div>
          <p class="small muted" style="margin-top:6px">Örn: 15 → bütçe dönemi her ayın 15'inde başlar, 14'ünde biter.</p>
        </div>
        <div class="field">
          <label>Dönem bütçesi (₺)</label>
          <input class="input" type="number" id="setBudget" min="0" step="100" value="${st.periodBudget || ""}" placeholder="örn. 15000" />
        </div>
        <div class="btn-row">
          <button class="btn primary sm" id="saveSettings">Kaydet</button>
        </div>
      </div>

      <div class="section-title">Görünüm</div>
      <div class="card">
        <div class="seg" id="themeSeg" style="margin-bottom:0">
          <button data-theme-val="dark" class="${st.theme === "dark" ? "active" : ""}">🌙 Karanlık</button>
          <button data-theme-val="light" class="${st.theme === "light" ? "active" : ""}">☀️ Aydınlık</button>
        </div>
        <div class="toggle-row" style="margin-top:8px">
          <div class="tr-text"><div class="t">Kesim günü hatırlatmaları</div><div class="s">Ana ekranda kart uyarıları göster</div></div>
          <button class="switch ${st.reminders ? "on" : ""}" id="toggleReminders" aria-label="Hatırlatmalar"></button>
        </div>
        ${
          isStandalone
            ? ""
            : `<div class="toggle-row" style="margin-top:8px">
          <div class="tr-text">
            <div class="t">📱 Telefonda uygulama gibi aç</div>
            <div class="s">Sayfayı aç → <b>Paylaş</b> → <b>Ana Ekrana Ekle</b>. Tam ekran açılır, çevrimdışı da çalışır.</div>
          </div>
        </div>`
        }
      </div>

      <div class="section-title">Kategoriler</div>
      <div class="card">
        <div class="field">
          <label>Yeni kategori</label>
          <div class="grid-2">
            <input class="input" id="catName" placeholder="Ad (örn. Evcil Hayvan)" />
            <input class="input" id="catIcon" placeholder="Emoji (örn. 🐾)" maxlength="4" value="🏷️" />
          </div>
        </div>
        <div class="field">
          <label>Tür</label>
          <div class="seg" id="catTypeSeg" style="margin-bottom:0">
            <button data-cat-type="expense" class="active">Gider</button>
            <button data-cat-type="income">Gelir</button>
          </div>
        </div>
        <div class="field">
          <label>Renk</label>
          <div class="color-row" id="catColors">
            ${PALETTE.map((c, i) => `<button class="color-dot ${i === 0 ? "selected" : ""}" data-color="${c}" style="background:${c}"></button>`).join("")}
          </div>
        </div>
        <button class="btn primary sm block" id="addCatBtn">＋ Kategori ekle</button>
        ${
          customCats.length
            ? `<div class="list" style="margin-top:10px">${customCats
                .map(
                  (c) => `<div class="row-item">
                    <span class="ic" style="width:36px;height:36px;display:grid;place-items:center;border-radius:11px;background:${c.color}22">${c.icon}</span>
                    <span class="mid"><span class="t">${esc(c.name)}</span><span class="s">${c.type === "income" ? "Gelir" : "Gider"}</span></span>
                    <button class="btn sm danger" data-cat-del="${c.id}">Sil</button>
                  </div>`
                )
                .join("")}</div>`
            : ""
        }
      </div>

      <div class="section-title">Veri &amp; hesaplar arası aktarım</div>
      <div class="card">
        <div class="toggle-row">
          <div class="tr-text"><div class="t">Bu hesaptan kopya al</div><div class="s">Kayıtlarını JSON dosyasına yaz</div></div>
          <button class="btn sm" id="exportBtn">Dışa aktar</button>
        </div>
        <div class="toggle-row">
          <div class="tr-text"><div class="t">Başka hesaptan aktar</div><div class="s">Birleştir veya üzerine yaz</div></div>
          <button class="btn sm" id="importBtn">İçe aktar</button>
        </div>
        <div class="toggle-row">
          <div class="tr-text"><div class="t">Her şeyi sıfırla</div><div class="s">Bu hesaptaki tüm kayıtlar silinir</div></div>
          <button class="btn sm danger" id="resetBtn">Sıfırla</button>
        </div>
        <p class="small muted" style="margin-top:10px;text-align:center">
          Hesaplar arası taşıma: <b>Dışa aktar</b> → çıkış yap → hedef hesapta giriş yap → <b>İçe aktar</b>.
        </p>
        <input type="file" id="importFile" accept="application/json" hidden />
      </div>

      <p class="small muted" style="text-align:center;margin-top:6px">
        Bütçe Kontroll · v1.0 · Veriler yalnızca bu cihazın tarayıcısında saklanır.
      </p>`;

    /* Bağlantılar */
    const logoutBtn = $("#settingsLogout", el);
    if (logoutBtn)
      logoutBtn.onclick = async () => {
        if (UI.confirmBox("Hesaptan çıkış yapılsın mı?")) await Auth.logout();
      };

    const range = $("#setStartDay", el);
    range.oninput = () => {
      $("#startDayVal", el).textContent = `Her ayın ${range.value}'i`;
    };
    $("#saveSettings", el).onclick = () => {
      Store.setSetting("periodStartDay", Number(range.value));
      Store.setSetting("periodBudget", Math.max(0, Number($("#setBudget", el).value) || 0));
      UI.refresh();
      UI.toast("Ayarlar kaydedildi");
    };

    $$("[data-theme-val]", el).forEach((b) => (b.onclick = () => { UI.applyTheme(b.dataset.themeVal); settings(); }));

    $("#toggleReminders", el).onclick = (e) => {
      const on = !Store.settings().reminders;
      Store.setSetting("reminders", on);
      e.currentTarget.classList.toggle("on", on);
    };

    let catType = "expense";
    $$("[data-cat-type]", el).forEach(
      (b) =>
        (b.onclick = () => {
          catType = b.dataset.catType;
          $$("[data-cat-type]", el).forEach((x) => x.classList.toggle("active", x === b));
        })
    );
    $$("#catColors .color-dot", el).forEach(
      (b) =>
        (b.onclick = () => {
          pickedColor = b.dataset.color;
          $$("#catColors .color-dot", el).forEach((x) => x.classList.toggle("selected", x === b));
        })
    );
    $("#addCatBtn", el).onclick = () => {
      const name = $("#catName", el).value.trim();
      if (!name) return UI.toast("Kategori adı gir");
      Store.addCategory({ name, icon: $("#catIcon", el).value.trim() || "🏷️", type: catType, color: pickedColor });
      UI.refresh();
      UI.toast("Kategori eklendi");
    };
    $$("[data-cat-del]", el).forEach(
      (b) =>
        (b.onclick = () => {
          if (UI.confirmBox("Kategori silinsin mi?")) {
            Store.removeCategory(b.dataset.catDel);
            UI.refresh();
          }
        })
    );

    $("#exportBtn", el).onclick = () => {
      const payload = JSON.parse(Store.exportJSON());
      payload.__exportFrom = Auth.user();
      payload.__exportAt = Date.now();
      const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = `butce-kontroll-${Auth.user() || "misafir"}-${Store.iso(new Date())}.json`;
      a.click();
      URL.revokeObjectURL(a.href);
      UI.toast("Kopya indirildi — başka hesapta “İçe aktar” ile kullan");
    };
    $("#importBtn", el).onclick = () => $("#importFile", el).click();
    $("#importFile", el).onchange = (e) => {
      const file = e.target.files[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = () => {
        try {
          App.openImportPreview(JSON.parse(reader.result));
        } catch (err) {
          UI.toast("Dosya okunamadı — geçerli bir JSON değil");
        }
        e.target.value = ""; // aynı dosyayı tekrar seçebilmek için
      };
      reader.readAsText(file);
    };
    $("#resetBtn", el).onclick = () => {
      if (UI.confirmBox("Tüm veriler kalıcı olarak silinecek. Emin misin?")) {
        Store.reset();
        UI.applyTheme(Store.settings().theme);
        UI.refresh();
        UI.toast("Veriler sıfırlandı");
      }
    };
  }

  /* ========================================================= */
  const map = { home, report, assets, cards, settings };

  function render(name) {
    (map[name] || home)();
  }

  function renderAll() {
    header();
    Object.keys(map).forEach((k) => map[k]());
  }

  return { header, render, renderAll, get reportRange() { return reportRange; }, PALETTE, CARD_COLORS };
})();
