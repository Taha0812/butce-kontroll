/* app.js — etkileşimler: hızlı ekleme, tuş takımı, kart & varlık formları, başlangıç */
window.App = (function () {
  "use strict";

  const rnd = () => Math.random().toString(36).slice(2, 9);

  /* =========================================================
     İşlem ekle / düzenle
  ========================================================= */
  const form = {
    type: "expense",
    categoryId: null,
    amount: "",
    date: UI.todayISO(),
    note: "",
    cardId: "",
    installments: 1,
    editingId: null,
    planId: null,
  };

  function resetForm() {
    Object.assign(form, {
      type: "expense",
      categoryId: null,
      amount: "",
      date: UI.todayISO(),
      note: "",
      cardId: "",
      installments: 1,
      editingId: null,
      planId: null,
    });
  }

  function openAdd(preset) {
    resetForm();
    if (preset && preset.categoryId) {
      form.categoryId = preset.categoryId;
      form.type = Store.category(preset.categoryId).type || "expense";
    }
    renderAdd();
  }

  function openEdit(id) {
    const t = Store.txById(id);
    if (!t) return UI.toast("İşlem bulunamadı");
    resetForm();
    Object.assign(form, {
      type: t.type,
      categoryId: t.categoryId,
      amount: String(t.amount),
      date: t.date,
      note: t.note || "",
      cardId: t.cardId || "",
      installments: t.installmentCount || 1,
      editingId: t.id,
      planId: t.planId || null,
    });
    renderAdd();
  }

  function catGridHtml() {
    return Store.categories(form.type)
      .map(
        (c) => `<button class="cat-pick ${form.categoryId === c.id ? "selected" : ""}" data-cat="${c.id}">
          <span class="ico">${c.icon}</span><span>${esc(c.name)}</span>
        </button>`
      )
      .join("");
  }

  function cardOptionsHtml() {
    const cards = Store.state.cards;
    return `<option value="">— Nakit / banka kartı —</option>` +
      cards.map((c) => `<option value="${c.id}" ${form.cardId === c.id ? "selected" : ""}>${esc(c.name)} ••${esc(
        c.last4 || ""
      )}</option>`).join("");
  }

  function installmentOptionsHtml() {
    let html = "";
    for (let i = 1; i <= 12; i++)
      html += `<option value="${i}" ${Number(form.installments) === i ? "selected" : ""}>${i === 1 ? "Tek çekim" : i + " taksit"}</option>`;
    return html;
  }

  function renderAdd() {
    const isEdit = !!form.editingId;
    const amountVal = form.amount ? form.amount : "";
    const html = `
      <div class="seg" id="addTypeSeg">
        <button data-type="expense" class="${form.type === "expense" ? "active" : ""}">− Gider</button>
        <button data-type="income" class="${form.type === "income" ? "active" : ""}">＋ Gelir</button>
      </div>

      <div class="cat-grid" id="addCats">${catGridHtml()}</div>

      <div class="amount-display">
        <input class="a-val ${form.type === "income" ? "in" : "out"}" id="addAmount" inputmode="decimal"
               placeholder="0,00" value="${esc(amountVal)}" aria-label="Tutar" />
        <div class="a-cur">Türk Lirası (₺) · kuruş için nokta kullan</div>
      </div>

      <div class="keypad" id="addKeypad">
        ${["1", "2", "3", "4", "5", "6", "7", "8", "9", ".", "0", "⌫"]
          .map((k) => `<button class="key" data-key="${k}">${k}</button>`)
          .join("")}
      </div>

      <div class="grid-2" style="margin-top:16px">
        <div class="field"><label>Tarih</label><input class="input" type="date" id="addDate" value="${esc(form.date)}" /></div>
        <div class="field"><label>Kart</label><select class="input" id="addCard">${cardOptionsHtml()}</select></div>
      </div>

      ${
        !isEdit && form.type === "expense" && form.cardId
          ? `<div class="field"><label>Taksit</label><select class="input" id="addInstall">${installmentOptionsHtml()}</select></div>`
          : ""
      }

      <div class="field"><label>Not (opsiyonel)</label><input class="input" id="addNote" placeholder="örn. Haftalık alışveriş" value="${esc(form.note)}" /></div>

      <button class="btn primary block" id="addSave">${isEdit ? "✓ Güncelle" : form.type === "income" ? "＋ Geliri kaydet" : "− Gideri kaydet"}</button>

      ${
        isEdit
          ? `<div class="btn-row" style="margin-top:10px">
              ${form.planId ? `<button class="btn danger" id="delTx">Bu taksiti sil</button><button class="btn danger" id="delPlan">Planı sil</button>` : `<button class="btn danger" id="delTx">İşlemi sil</button>`}
             </div>`
          : ""
      }`;

    UI.openSheet(isEdit ? "İşlemi düzenle" : "Hızlı işlem ekle", html, mountAdd);
  }

  function mountAdd(root) {
    /* Tür değiştirme */
    $$("[data-type]", root).forEach(
      (b) =>
        (b.onclick = () => {
          form.type = b.dataset.type;
          form.categoryId = null;
          renderAdd();
        })
    );

    /* Kategori seçimi */
    $$("[data-cat]", root).forEach(
      (b) =>
        (b.onclick = () => {
          form.categoryId = b.dataset.cat;
          $$("[data-cat]", root).forEach((x) => x.classList.toggle("selected", x === b));
        })
    );

    /* Tutar alanı */
    const amountInput = $("#addAmount", root);
    amountInput.addEventListener("input", () => {
      let v = amountInput.value.replace(/[^\d.,]/g, "").replace(",", ".");
      const parts = v.split(".");
      if (parts.length > 2) v = parts[0] + "." + parts.slice(1).join("");
      if (parts[1] && parts[1].length > 2) v = parts[0] + "." + parts[1].slice(0, 2);
      amountInput.value = v;
      form.amount = v;
    });

    /* Tuş takımı */
    $$("[data-key]", root).forEach((b) =>
      (b.onclick = () => {
        const k = b.dataset.key;
        let v = form.amount;
        if (k === "⌫") v = v.slice(0, -1);
        else if (k === ".") {
          if (v.includes(".")) return;
          v = v === "" ? "0." : v + ".";
        } else {
          if (v.includes(".") && v.split(".")[1].length >= 2) return;
          if (v.replace(".", "").length >= 9) return;
          v = v === "0" ? k : v + k;
        }
        form.amount = v;
        amountInput.value = v;
      })
    );

    /* Tarih / kart / taksit / not */
    $("#addDate", root).onchange = (e) => (form.date = e.target.value || UI.todayISO());
    const cardSel = $("#addCard", root);
    if (cardSel)
      cardSel.onchange = (e) => {
        form.cardId = e.target.value;
        if (!form.editingId && form.type === "expense") renderAdd();
      };
    const instSel = $("#addInstall", root);
    if (instSel) instSel.onchange = (e) => (form.installments = Number(e.target.value));
    const noteInput = $("#addNote", root);
    if (noteInput) noteInput.oninput = (e) => (form.note = e.target.value);

    /* Kaydet */
    $("#addSave", root).onclick = saveAdd;

    /* Sil */
    const delTx = $("#delTx", root);
    if (delTx)
      delTx.onclick = () => {
        if (UI.confirmBox("Bu işlem silinsin mi?")) {
          Store.removeTx(form.editingId);
          UI.closeSheet();
          UI.refresh();
          UI.toast("İşlem silindi");
        }
      };
    const delPlan = $("#delPlan", root);
    if (delPlan)
      delPlan.onclick = () => {
        if (UI.confirmBox("Taksit planındaki tüm taksitler silinsin mi?")) {
          Store.removePlan(form.planId);
          UI.closeSheet();
          UI.refresh();
          UI.toast("Plan silindi");
        }
      };

    setTimeout(() => amountInput.focus(), 260);
  }

  function saveAdd() {
    const amount = parseFloat(String(form.amount).replace(",", "."));
    if (!amount || amount <= 0) return UI.toast("Geçerli bir tutar gir");
    if (!form.categoryId) return UI.toast("Kategori seç");
    if (!form.date) return UI.toast("Tarih seç");

    if (form.editingId) {
      Store.updateTx(form.editingId, {
        type: form.type,
        amount,
        categoryId: form.categoryId,
        date: form.date,
        note: form.note,
        cardId: form.cardId || null,
      });
      UI.closeSheet();
      UI.refresh();
      return UI.toast("İşlem güncellendi");
    }

    const base = Store.parseISO(form.date);

    if (form.type === "expense" && form.cardId && Number(form.installments) > 1) {
      const n = Number(form.installments);
      const planId = "p_" + rnd();
      for (let i = 0; i < n; i++) {
        const probe = new Date(base.getFullYear(), base.getMonth() + i, 1);
        const lastDay = new Date(probe.getFullYear(), probe.getMonth() + 1, 0).getDate();
        const d = new Date(probe.getFullYear(), probe.getMonth() + i, Math.min(base.getDate(), lastDay));
        Store.addTx({
          type: "expense",
          amount,
          categoryId: form.categoryId,
          date: Store.iso(d),
          note: form.note,
          cardId: form.cardId,
          planId,
          installmentIndex: i + 1,
          installmentCount: n,
        });
      }
      UI.closeSheet();
      UI.refresh();
      return UI.toast(`${n} taksitli plan oluşturuldu`);
    }

    Store.addTx({
      type: form.type,
      amount,
      categoryId: form.categoryId,
      date: form.date,
      note: form.note,
      cardId: form.cardId || null,
    });
    UI.closeSheet();
    UI.refresh();
    UI.toast(form.type === "income" ? "Gelir kaydedildi" : "Gider kaydedildi");
  }

  /* =========================================================
     Tüm işlemler listesi
  ========================================================= */
  function openTxList() {
    const all = Store.allTx();
    const rows = all
      .map((t) => {
        const cat = Store.category(t.categoryId);
        const sign = t.type === "income" ? "+" : "−";
        return `<button class="tx" data-open-tx="${t.id}">
          <span class="ic" style="background:${cat.color}22">${cat.icon}</span>
          <span class="mid"><span class="t">${esc(cat.name)}</span>
          <span class="s">${esc(UI.relDay(t.date))}${t.note ? " · " + esc(t.note) : ""}${
          t.installmentCount ? ` · Taksit ${t.installmentIndex}/${t.installmentCount}` : ""
        }</span></span>
          <span class="amt ${t.type === "income" ? "in" : "out"}">${sign}${esc(UI.fmtMoney(t.amount))}</span>
        </button>`;
      })
      .join("");

    UI.openSheet(
      `Tüm işlemler (${all.length})`,
      `<div class="list">${rows || `<div class="empty">Kayıt yok</div>`}</div>`,
      (root) => {
        $$("[data-open-tx]", root).forEach((b) => (b.onclick = () => openEdit(b.dataset.openTx)));
      }
    );
  }

  /* =========================================================
     Kredi kartı formu
  ========================================================= */
  function openCardSheet(id) {
    const card = id ? Store.cardById(id) : null;
    const color = card ? card.color : Views.CARD_COLORS[0];
    const html = `
      <div class="field"><label>Kart adı</label><input class="input" id="cName" placeholder="örn. Bonus" value="${esc(
        card ? card.name : ""
      )}" /></div>
      <div class="grid-2">
        <div class="field"><label>Son 4 hane</label><input class="input" id="cLast4" inputmode="numeric" maxlength="4" placeholder="1234" value="${esc(
          card ? card.last4 : ""
        )}" /></div>
        <div class="field"><label>Limit (₺)</label><input class="input" id="cLimit" type="number" min="0" step="100" value="${
          card && card.limit ? card.limit : ""
        }" placeholder="opsiyonel" /></div>
      </div>
      <div class="grid-2">
        <div class="field"><label>Kesim günü</label><input class="input" id="cStmt" type="number" min="1" max="28" value="${
          card ? card.statementDay : 5
        }" /></div>
        <div class="field"><label>Son ödeme günü</label><input class="input" id="cDue" type="number" min="1" max="28" value="${
          card ? card.dueDay : 12
        }" /></div>
      </div>
      <div class="field"><label>Renk</label>
        <div class="color-row" id="cColors">
          ${Views.CARD_COLORS.map(
            (c) => `<button class="color-dot ${c === color ? "selected" : ""}" data-color="${c}" style="background:${c}"></button>`
          ).join("")}
        </div>
      </div>
      <button class="btn primary block" id="cSave">${card ? "Kaydet" : "＋ Kart ekle"}</button>
      ${card ? `<button class="btn danger block" id="cDel" style="margin-top:10px">Kartı sil</button>` : ""}`;

    UI.openSheet(card ? "Kartı düzenle" : "Yeni kredi kartı", html, (root) => {
      let picked = color;
      $$("#cColors .color-dot", root).forEach(
        (b) =>
          (b.onclick = () => {
            picked = b.dataset.color;
            $$("#cColors .color-dot", root).forEach((x) => x.classList.toggle("selected", x === b));
          })
      );
      $("#cSave", root).onclick = () => {
        const name = $("#cName", root).value.trim();
        if (!name) return UI.toast("Kart adı gir");
        Store.upsertCard({
          id: card ? card.id : null,
          name,
          last4: $("#cLast4", root).value.replace(/\D/g, ""),
          limit: Number($("#cLimit", root).value) || 0,
          statementDay: Number($("#cStmt", root).value) || 1,
          dueDay: Number($("#cDue", root).value) || 10,
          color: picked,
        });
        UI.closeSheet();
        UI.refresh();
        UI.toast(card ? "Kart güncellendi" : "Kart eklendi");
      };
      const del = $("#cDel", root);
      if (del)
        del.onclick = () => {
          if (UI.confirmBox(`"${card.name}" silinsin mi?`)) {
            Store.removeCard(card.id);
            UI.closeSheet();
            UI.refresh();
            UI.toast("Kart silindi");
          }
        };
    });
  }

  /* =========================================================
     Varlık formu
  ========================================================= */
  function openAssetSheet(id) {
    const asset = id ? Store.assets().find((a) => a.id === id) : null;
    const rates = (Store.rates() && Store.rates().map) || {};
    const html = `
      <div class="field"><label>Varlık türü</label>
        <select class="input" id="aCode">
          ${Store.RATE_LIST.map(
            (r) => `<option value="${r.code}" ${asset && asset.code === r.code ? "selected" : ""}>${r.icon} ${esc(r.label)}</option>`
          ).join("")}
        </select>
      </div>
      <div class="field"><label>Miktar</label><input class="input" id="aAmount" type="number" min="0" step="0.01" value="${
        asset ? asset.amount : ""
      }" placeholder="örn. 500 (veya gram)" /></div>
      <div class="card tight" style="margin-bottom:14px">
        <div class="small muted">Anlık değer</div>
        <div style="font-size:20px;font-weight:700" id="aPreview">—</div>
      </div>
      <button class="btn primary block" id="aSave">${asset ? "Kaydet" : "＋ Varlık ekle"}</button>
      ${asset ? `<button class="btn danger block" id="aDel" style="margin-top:10px">Varlığı sil</button>` : ""}`;

    UI.openSheet(asset ? "Varlığı düzenle" : "Yeni varlık", html, (root) => {
      const codeSel = $("#aCode", root);
      const amountIn = $("#aAmount", root);
      const preview = $("#aPreview", root);
      const update = () => {
        const code = codeSel.value;
        const amt = Number(amountIn.value) || 0;
        const rate = rates[code] || 0;
        preview.textContent = `${UI.fmtNum(amt)} × ${Store.rateMeta(code).label} = ${UI.fmtMoney(amt * rate)}`;
      };
      codeSel.onchange = update;
      amountIn.oninput = update;
      update();

      $("#aSave", root).onclick = () => {
        const amt = Number(amountIn.value);
        if (!amt || amt <= 0) return UI.toast("Miktar gir");
        Store.upsertAsset({ id: asset ? asset.id : null, code: codeSel.value, amount: amt });
        UI.closeSheet();
        UI.refresh();
        UI.toast(asset ? "Varlık güncellendi" : "Varlık eklendi");
      };
      const del = $("#aDel", root);
      if (del)
        del.onclick = () => {
          if (UI.confirmBox("Varlık silinsin mi?")) {
            Store.removeAsset(asset.id);
            UI.closeSheet();
            UI.refresh();
            UI.toast("Varlık silindi");
          }
        };
    });
  }

  /* =========================================================
     Bağlantılar & başlangıç
  ========================================================= */
  function bind() {
    $$(".nav-btn").forEach((b) => (b.onclick = () => UI.showView(b.dataset.nav)));
    $("#btnAdd").onclick = () => openAdd();
    $("#btnTheme").onclick = () => UI.toggleTheme();
    $("#btnSettings").onclick = () => UI.showView("settings");
    $("#btnRates").onclick = async () => {
      $("#btnRates").textContent = "⏳";
      await Store.fetchRates(true);
      $("#btnRates").textContent = "🔄";
      UI.refresh();
      UI.toast("Fiyatlar güncellendi");
    };
    $("#backdrop").onclick = () => UI.closeSheet();
    $("#sheetClose").onclick = () => UI.closeSheet();
    $("#btnAccount").onclick = () => openAccountSheet();
    document.addEventListener("keydown", (e) => {
      if (e.key === "Escape" && UI.sheetOpen()) UI.closeSheet();
    });
  }

  /* =========================================================
     Başka hesaptan veri aktarma (birleştir / üzerine yaz)
  ========================================================= */
  function openImportPreview(data) {
    if (!data || typeof data !== "object" || !Array.isArray(data.transactions)) {
      return UI.toast("Dosya Bütçe Kontroll yedeği değil");
    }
    const counts = {
      tx: (data.transactions || []).length,
      cards: (data.cards || []).length,
      assets: (data.assets || []).length,
      cats: (data.categories || []).length,
    };
    const from = data.__exportFrom ? "@" + String(data.__exportFrom) : "bilinmiyor";
    const at = data.__exportAt ? new Date(data.__exportAt).toLocaleString("tr-TR") : "—";

    const html = `
      <div class="import-summary">
        <div class="cell"><b>${counts.tx}</b><span>işlem</span></div>
        <div class="cell"><b>${counts.cards}</b><span>kart</span></div>
        <div class="cell"><b>${counts.assets}</b><span>varlık</span></div>
      </div>
      <p class="small muted" style="text-align:center">
        Kaynak hesap: <b>${esc(from)}</b> · ${esc(at)}<br>
        Hedef hesap: <b>@${esc(Auth.user() || "misafir")}</b>
      </p>

      <div class="btn-row" style="margin-top:14px">
        <button class="btn primary" id="impMerge">⇄ Birleştir</button>
        <button class="btn danger" id="impReplace">↺ Üzerine yaz</button>
      </div>
      <button class="btn ghost block" id="impCancel" style="margin-top:8px">Vazgeç</button>

      <p class="small muted" style="margin-top:14px;text-align:center;line-height:1.6">
        <b>Birleştir:</b> mevcut ayarların korunur, bu hesapta olmayan kayıtlar eklenir.<br>
        <b>Üzerine yaz:</b> bu hesaptaki her şey dosyadakilerle değiştirilir.
      </p>`;

    UI.openSheet("Başka hesaptan aktar", html, (root) => {
      $("#impMerge", root).onclick = () => {
        const added = Store.mergeState(data);
        UI.closeSheet();
        UI.refresh();
        UI.toast(`Aktarıldı: ${added.transactions} işlem, ${added.cards} kart, ${added.assets} varlık, ${added.categories} kategori`);
      };
      $("#impReplace", root).onclick = () => {
        if (!UI.confirmBox("Bu hesaptaki TÜM kayıtlar dosyadakilerle değiştirilecek. Emin misin?")) return;
        Store.importJSON(JSON.stringify(data));
        UI.applyTheme(Store.settings().theme);
        UI.closeSheet();
        UI.refresh();
        UI.toast("Veriler üzerine yazıldı");
      };
      $("#impCancel", root).onclick = () => UI.closeSheet();
    });
  }

  /* =========================================================
     Hesap paneli
  ========================================================= */
  function openAccountSheet() {
    const user = Auth.user();
    const mode = Auth.currentMode();
    const badgeCls = mode === "server" ? "good" : mode === "local" ? "warn" : "accent";
    const html = `
      <div class="account-hero">
        <div class="account-avatar">${user ? esc(user.slice(0, 1).toUpperCase()) : "👤"}</div>
        <div class="account-name">${user ? "@" + esc(user) : "Misafir"}</div>
        ${Auth.email() ? `<div class="small muted" style="margin-top:2px">${esc(Auth.email())}</div>` : ""}
        <span class="pill ${badgeCls}">${esc(Auth.modeLabel())}</span>
      </div>
      <p class="small muted" style="text-align:center;margin-top:12px">${esc(Auth.modeDetail())}</p>

      <div class="card tight" style="margin-top:14px">
        <div class="toggle-row">
          <div class="tr-text"><div class="t">Bu hesabın kayıtları</div><div class="s">Diğer hesaplardan tamamen ayrı</div></div>
          <span class="pill accent">${Store.allTx().length} işlem</span>
        </div>
        <div class="toggle-row">
          <div class="tr-text"><div class="t">Son senkron</div><div class="s">Sunucuya son kayıt gönderimi</div></div>
          <span class="pill">${esc(Auth.lastSyncLabel())}</span>
        </div>
        <div class="toggle-row">
          <div class="tr-text"><div class="t">Veri anahtarı</div><div class="s">Bu hesabın saklama alanı</div></div>
          <span class="pill">${user ? "data\\" + esc(user.slice(0, 12)) : "misafir"}</span>
        </div>
      </div>

      <button class="btn danger block" id="acctLogout">↩ Çıkış yap</button>
      <button class="btn ghost block" id="acctClose" style="margin-top:8px">Kapat</button>`;

    UI.openSheet("Hesap", html, (root) => {
      $("#acctLogout", root).onclick = async () => {
        UI.closeSheet();
        await Auth.logout();
      };
      $("#acctClose", root).onclick = () => UI.closeSheet();
    });
  }

  async function loadRates() {
    await Store.fetchRates();
    Views.header();
    if (UI.current === "assets") UI.refresh();
  }

  let started = false;

  function init() {
    UI.applyTheme(Store.settings().theme);
    bind();
    Views.header();
    Views.render("home");
    loadRates();
    setInterval(loadRates, 10 * 60 * 1000); // 10 dakikada bir tazele
    setInterval(() => Views.header(), 60 * 1000); // "gün kaldı" bilgisini tazele
    Charts.onResize(() => {
      if (UI.current === "report") Views.render("report");
    });
  }

  /* Uygulama ancak giriş yapıldığında başlar (Auth.init çağırır) */
  function start() {
    if (started) {
      UI.refresh();
      return;
    }
    started = true;
    init();
  }

  async function boot() {
    try {
      await Auth.init();
    } catch (e) {
      console.error("Oturum başlatılamadı:", e);
    }
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot);
  else boot();

  return { openAdd, openEdit, openTxList, openCardSheet, openAssetSheet, openAccountSheet, openImportPreview, start };
})();
