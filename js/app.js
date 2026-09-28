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
    if (preset && (preset.type === "income" || preset.type === "expense")) {
      form.type = preset.type;
      form.categoryId = null;
    }
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
     Tüm işlemler listesi — arama + filtre (rakip uygulamalardaki
     "işlemleri tarih/kategori/hesap/nota göre filtrele" özelliği)
  ========================================================= */
  function txRowHtml(t) {
    const cat = Store.category(t.categoryId);
    const sign = t.type === "income" ? "+" : "−";
    const bits = [UI.relDay(t.date)];
    if (t.installmentCount) bits.push(`Taksit ${t.installmentIndex}/${t.installmentCount}`);
    if (t.recurringId) bits.push("🔁 otomatik");
    if (t.cardId) {
      const c = Store.cardById(t.cardId);
      if (c) bits.push(c.name);
    }
    if (t.note) bits.push(t.note);
    return `<button class="tx" data-open-tx="${t.id}">
        <span class="ic" style="background:${cat.color}22">${cat.icon}</span>
        <span class="mid"><span class="t">${esc(cat.name)}</span>
        <span class="s">${esc(bits.join(" · "))}</span></span>
        <span class="amt ${t.type === "income" ? "in" : "out"}">${sign}${esc(UI.fmtMoney(t.amount))}</span>
      </button>`;
  }

  function openTxList() {
    const flt = { q: "", type: "all", cat: "", card: "" };
    const catOpts = Store.categories()
      .map((c) => `<option value="${c.id}">${c.icon} ${esc(c.name)}</option>`)
      .join("");
    const cardOpts = Store.state.cards
      .map((c) => `<option value="${c.id}">${esc(c.name)} ••${esc(c.last4 || "")}</option>`)
      .join("");

    const html = `
      <div class="field"><input class="input" id="txSearch" placeholder="🔍 Ara: kategori, not, kart, tutar…" /></div>
      <div class="seg" id="txTypeSeg" style="margin-bottom:12px">
        <button data-tfilter="all" class="active">Tümü</button>
        <button data-tfilter="expense">− Gider</button>
        <button data-tfilter="income">＋ Gelir</button>
      </div>
      <div class="grid-2">
        <div class="field"><select class="input" id="txCat"><option value="">Tüm kategoriler</option>${catOpts}</select></div>
        <div class="field"><select class="input" id="txCard"><option value="">Tüm kartlar</option>${cardOpts}</select></div>
      </div>
      <div class="small muted" id="txSummary" style="margin:2px 0 8px"></div>
      <div class="list" id="txRows"></div>`;

    UI.openSheet(`Tüm işlemler (${Store.allTx().length})`, html, (root) => {
      const rowsEl = $("#txRows", root);
      const sumEl = $("#txSummary", root);
      const search = $("#txSearch", root);

      const matches = () =>
        Store.allTx().filter((t) => {
          if (flt.type !== "all" && t.type !== flt.type) return false;
          if (flt.cat && t.categoryId !== flt.cat) return false;
          if (flt.card && (t.cardId || "") !== flt.card) return false;
          if (flt.q) {
            const cat = Store.category(t.categoryId);
            const card = t.cardId ? Store.cardById(t.cardId) : null;
            const hay = [
              cat.name,
              t.note || "",
              card ? card.name : "",
              String(t.amount),
              UI.fmtMoney(t.amount),
              t.date,
              UI.relDay(t.date),
            ]
              .join(" ")
              .toLowerCase();
            if (hay.indexOf(flt.q) < 0) return false;
          }
          return true;
        });

      const paint = () => {
        const list = matches();
        const s = Store.sums(list);
        sumEl.textContent = list.length
          ? `${list.length} kayıt · +${UI.fmtMoney(s.income)} / −${UI.fmtMoney(s.expense)}`
          : "Eşleşen kayıt yok";
        rowsEl.innerHTML = list.length
          ? list.map(txRowHtml).join("")
          : `<div class="empty"><span class="big-ico">🔍</span>Filtreye uyan işlem yok.<br/>Aramayı temizleyip tekrar dene.</div>`;
        $$("[data-open-tx]", rowsEl).forEach((b) => (b.onclick = () => openEdit(b.dataset.openTx)));
      };

      let deb = null;
      search.oninput = () => {
        clearTimeout(deb);
        deb = setTimeout(() => {
          flt.q = search.value.trim().toLowerCase();
          paint();
        }, 140);
      };
      $$("[data-tfilter]", root).forEach(
        (b) =>
          (b.onclick = () => {
            flt.type = b.dataset.tfilter;
            $$("[data-tfilter]", root).forEach((x) => x.classList.toggle("active", x === b));
            paint();
          })
      );
      $("#txCat", root).onchange = (e) => {
        flt.cat = e.target.value;
        paint();
      };
      $("#txCard", root).onchange = (e) => {
        flt.card = e.target.value;
        paint();
      };
      paint();
    });
  }

  /* =========================================================
     Tekrarlayan (otomatik) işlemler — kira, maaş, abonelik...
  ========================================================= */
  function openRecurringList() {
    const rules = Store.recurringRules();
    const today = Store.iso(new Date());

    const rows = rules
      .map((r) => {
        const cat = Store.category(r.categoryId);
        const card = r.cardId ? Store.cardById(r.cardId) : null;
        const paused = r.active === false;
        const wait = r.nextDate === today ? "bugün" : r.nextDate < today ? "gecikmiş" : UI.relDay(r.nextDate);
        return `<div class="row-item" style="${paused ? "opacity:.55" : ""}">
          <span class="ic" style="width:40px;height:40px;display:grid;place-items:center;border-radius:13px;background:${cat.color}22;font-size:19px">${cat.icon}</span>
          <span class="mid">
            <span class="t">${esc(r.name)} · <b>${esc(UI.fmtMoney(r.amount))}</b></span>
            <span class="s">${esc(Store.FREQ_LABEL[r.freq] || r.freq)} · ${esc(cat.name)}${card ? " · " + esc(card.name) : ""} · 🔜 ${esc(wait)}</span>
          </span>
          <span class="right" style="display:flex;gap:6px;flex-wrap:wrap;justify-content:flex-end">
            <button class="btn sm" data-rec-toggle="${r.id}">${paused ? "▶ Devam" : "⏸ Duraklat"}</button>
            <button class="btn sm" data-rec-edit="${r.id}">Düzenle</button>
            <button class="btn sm danger" data-rec-del="${r.id}">Sil</button>
          </span>
        </div>`;
      })
      .join("");

    const html = `
      <p class="small muted" style="margin-bottom:10px">
        Kurallar sen açıkken çalışır: vadesi gelen her otomatik işlem uygulama açıldığında kaydedilir.
        Aynı tarih asla iki kez oluşturulmaz.
      </p>
      <div class="card tight">${rows || `<div class="empty"><span class="big-ico">🔁</span>Henüz otomatik işlem yok.<br/>Kira, maaş, abonelik gibi tekrar edenleri eklediğinde kendiliğinden kaydedilir.</div>`}</div>
      <button class="btn primary block" id="recNew" style="margin-top:12px">＋ Otomatik işlem ekle</button>`;

    UI.openSheet("Otomatik işlemler", html, (root) => {
      $("#recNew", root).onclick = () => openRecurringForm();
      $$("[data-rec-edit]", root).forEach((b) => (b.onclick = () => openRecurringForm(b.dataset.recEdit)));
      $$("[data-rec-del]", root).forEach(
        (b) =>
          (b.onclick = () => {
            const r = Store.ruleById(b.dataset.recDel);
            if (UI.confirmBox(`"${r ? r.name : ""}" kuralı silinsin mi?`)) {
              Store.removeRecurring(b.dataset.recDel);
              UI.refresh();
              openRecurringList();
              UI.toast("Otomatik işlem silindi");
            }
          })
      );
      $$("[data-rec-toggle]", root).forEach(
        (b) =>
          (b.onclick = () => {
            const r = Store.toggleRecurring(b.dataset.recToggle);
            UI.toast(r && r.active !== false ? "Kural devrede" : "Kural duraklatıldı");
            openRecurringList();
          })
      );
    });
  }

  function openRecurringForm(id) {
    const editing = id ? Store.ruleById(id) : null;
    const draft = editing
      ? { ...editing }
      : {
          type: "expense",
          categoryId: Store.categories("expense")[0] ? Store.categories("expense")[0].id : "",
          freq: "monthly",
          startDate: UI.todayISO(),
          cardId: "",
          active: true,
        };

    const catOpts = () =>
      Store.categories(draft.type)
        .map((c) => `<option value="${c.id}" ${draft.categoryId === c.id ? "selected" : ""}>${c.icon} ${esc(c.name)}</option>`)
        .join("");
    const cardOpts = () =>
      `<option value="">— Nakit / banka —</option>` +
      Store.state.cards
        .map((c) => `<option value="${c.id}" ${draft.cardId === c.id ? "selected" : ""}>${esc(c.name)} ••${esc(c.last4 || "")}</option>`)
        .join("");

    const html = `
      <div id="recFormBox"></div>`;

    UI.openSheet(editing ? "Otomatik işlemi düzenle" : "Yeni otomatik işlem", html, (root) => {
      const box = $("#recFormBox", root);

      const paint = () => {
        box.innerHTML = `
          <div class="seg" id="recTypeSeg" style="margin-bottom:12px">
            <button data-rtype="expense" class="${draft.type === "expense" ? "active" : ""}">− Gider</button>
            <button data-rtype="income" class="${draft.type === "income" ? "active" : ""}">＋ Gelir</button>
          </div>
          <div class="field"><label>Kural adı</label><input class="input" id="recName" placeholder="örn. Kira, Netflix, Maaş" value="${esc(
            editing ? editing.name : ""
          )}" /></div>
          <div class="grid-2">
            <div class="field"><label>Tekrar</label>
              <select class="input" id="recFreq">
                ${Object.keys(Store.FREQ_LABEL)
                  .map((k) => `<option value="${k}" ${(draft.freq || "monthly") === k ? "selected" : ""}>${Store.FREQ_LABEL[k]}</option>`)
                  .join("")}
              </select>
            </div>
            <div class="field"><label>Tutar (₺)</label><input class="input" id="recAmount" type="number" min="0" step="0.01" inputmode="decimal" placeholder="örn. 8500" value="${
              editing ? editing.amount : ""
            }" /></div>
          </div>
          <div class="grid-2">
            <div class="field"><label>Kategori</label><select class="input" id="recCat">${catOpts()}</select></div>
            <div class="field"><label>Kart (opsiyonel)</label><select class="input" id="recCard">${cardOpts()}</select></div>
          </div>
          <div class="field"><label>İlk uygulama tarihi</label><input class="input" type="date" id="recStart" value="${esc(
            draft.startDate || UI.todayISO()
          )}" /></div>
          <div class="field"><label>Not (opsiyonel)</label><input class="input" id="recNote" placeholder="otomatik kaydedilecek not" value="${esc(
            editing ? editing.note : ""
          )}" /></div>
          <button class="btn primary block" id="recSave">${editing ? "Kaydet" : "＋ Otomatik işlemi oluştur"}</button>
          ${
            editing
              ? `<button class="btn danger block" id="recDel" style="margin-top:10px">Kuralı sil</button>`
              : ""
          }`;

        $$("[data-rtype]", box).forEach(
          (b) =>
            (b.onclick = () => {
              draft.type = b.dataset.rtype;
              draft.categoryId = Store.categories(draft.type)[0] ? Store.categories(draft.type)[0].id : "";
              const keep = {
                name: $("#recName", box).value,
                amount: $("#recAmount", box).value,
                freq: $("#recFreq", box).value,
                startDate: $("#recStart", box).value,
                note: $("#recNote", box).value,
              };
              Object.assign(draft, keep);
              paint();
            })
        );

        $("#recSave", box).onclick = () => {
          const name = $("#recName", box).value.trim();
          const amount = parseFloat(String($("#recAmount", box).value).replace(",", "."));
          if (!name) return UI.toast("Kural adı gir");
          if (!amount || amount <= 0) return UI.toast("Geçerli bir tutar gir");
          Store.upsertRecurring({
            id: editing ? editing.id : null,
            name,
            amount,
            type: draft.type,
            categoryId: $("#recCat", box).value,
            freq: $("#recFreq", box).value,
            startDate: $("#recStart", box).value || UI.todayISO(),
            nextDate: editing ? editing.nextDate : $("#recStart", box).value || UI.todayISO(),
            cardId: $("#recCard", box).value || null,
            note: $("#recNote", box).value.trim(),
            active: editing ? editing.active !== false : true,
          });
          const created = Store.processRecurring();
          UI.closeSheet();
          UI.refresh();
          UI.toast(
            editing
              ? "Kural güncellendi"
              : created.length
              ? `Kural oluşturuldu · ${created.length} vade kaydedildi`
              : "Kural oluşturuldu"
          );
        };
        const del = $("#recDel", box);
        if (del)
          del.onclick = () => {
            if (UI.confirmBox("Bu kural silinsin mi? (Oluşturulan kayıtlar durur)")) {
              Store.removeRecurring(editing.id);
              UI.closeSheet();
              UI.refresh();
              UI.toast("Kural silindi");
            }
          };
      };
      paint();
    });
  }

  /* =========================================================
     Birikim hedefleri
  ========================================================= */
  function openGoalSheet(id) {
    const g = id ? Store.goalById(id) : null;
    const html = `
      <div class="field"><label>Hedef adı</label><input class="input" id="gName" placeholder="örn. Tatil, acil durum fonu" value="${esc(
        g ? g.name : ""
      )}" /></div>
      <div class="grid-2">
        <div class="field"><label>Hedef tutar (₺)</label><input class="input" id="gTarget" type="number" min="0" step="100" placeholder="örn. 50000" value="${
          g && g.target ? g.target : ""
        }" /></div>
        <div class="field"><label>Son gün (opsiyonel)</label><input class="input" id="gDeadline" type="date" value="${esc(
          g ? g.deadline || "" : ""
        )}" /></div>
      </div>
      <div class="field"><label>Not (opsiyonel)</label><input class="input" id="gNote" placeholder="örn. Ağustosa kadar" value="${esc(
        g ? g.note || "" : ""
      )}" /></div>
      <button class="btn primary block" id="gSave">${g ? "Kaydet" : "＋ Hedef ekle"}</button>
      ${g ? `<button class="btn danger block" id="gDel" style="margin-top:10px">Hedefi sil</button>` : ""}`;

    UI.openSheet(g ? "Hedefi düzenle" : "Yeni birikim hedefi", html, (root) => {
      $("#gSave", root).onclick = () => {
        const name = $("#gName", root).value.trim();
        const target = parseFloat(String($("#gTarget", root).value).replace(",", "."));
        if (!name) return UI.toast("Hedef adı gir");
        if (!target || target <= 0) return UI.toast("Hedef tutarı gir");
        Store.upsertGoal({
          id: g ? g.id : null,
          name,
          target,
          deadline: $("#gDeadline", root).value,
          note: $("#gNote", root).value.trim(),
        });
        UI.closeSheet();
        UI.refresh();
        UI.toast(g ? "Hedef güncellendi" : "Hedef eklendi");
      };
      const del = $("#gDel", root);
      if (del)
        del.onclick = () => {
          if (UI.confirmBox("Bu hedef ve katkıları silinsin mi?")) {
            Store.removeGoal(g.id);
            UI.closeSheet();
            UI.refresh();
            UI.toast("Hedef silindi");
          }
        };
    });
  }

  function openGoalDetail(id) {
    const g = Store.goalById(id);
    if (!g) return UI.toast("Hedef bulunamadı");
    const p = Store.goalProgress(g);
    const contribs = [...(g.contributions || [])].sort((a, b) => (a.date < b.date ? 1 : -1));

    const html = `
      <div class="card tight">
        <div class="budget-top">
          <div>
            <div class="budget-label">${esc(g.name)}</div>
            <div class="budget-amount">${esc(UI.fmtMoney(p.saved))} <span class="small muted">/ ${esc(UI.fmtMoney(p.target))}</span></div>
            <div class="small muted" style="margin-top:2px">${
              p.done ? "🎉 Hedef tamamlandı!" : p.remaining > 0 ? `Kalan: ${esc(UI.fmtMoney(p.remaining))}` : "Hedef tutarı girilmedi"
            }</div>
          </div>
          <div style="text-align:right"><span class="pill ${p.done ? "good" : "accent"}">%${p.pct.toFixed(0)}</span></div>
        </div>
        <div class="progress"><i class="${p.done ? "" : p.pct >= 80 ? "warn" : ""}" style="width:${Math.min(100, p.pct).toFixed(1)}%"></i></div>
        <div class="budget-meta">
          ${g.deadline ? `<span class="pill">📅 ${esc(UI.relDay(g.deadline))}</span>` : ""}
          ${
            !p.done && p.monthly > 0
              ? `<span class="pill good">💡 ${esc(UI.fmtMoney(p.monthly))}/ay ayır</span>`
              : ""
          }
          <span class="pill">${(g.contributions || []).length} katkı</span>
        </div>
      </div>

      <div class="section-title" style="margin-top:14px">Para ayır</div>
      <div class="grid-2">
        <div class="field"><input class="input" id="gcAmount" type="number" min="0" step="100" placeholder="Tutar (₺)" inputmode="decimal" /></div>
        <div class="field"><input class="input" id="gcDate" type="date" value="${UI.todayISO()}" /></div>
      </div>
      <button class="btn primary block" id="gcAdd">＋ Bu kadar ayırdım</button>
      <p class="small muted" style="margin-top:6px">Birikim kaydı harcama sayılmaz — para hâlâ sende.</p>

      <div class="section-title" style="margin-top:14px">Geçmiş</div>
      <div class="card tight">
        ${
          contribs.length
            ? contribs
                .map(
                  (c) => `<div class="row-item">
                  <span class="ic" style="width:36px;height:36px;display:grid;place-items:center;border-radius:11px;background:var(--income-soft)">🏦</span>
                  <span class="mid"><span class="t">${esc(UI.fmtMoney(c.amount))}</span><span class="s">${esc(UI.relDay(c.date))}</span></span>
                  <button class="btn sm danger" data-gc-del="${c.id}">Sil</button>
                </div>`
                )
                .join("")
            : `<div class="empty">Henüz katkı yok</div>`
        }
      </div>

      <div class="btn-row" style="margin-top:14px">
        <button class="btn sm" id="gEdit">✏️ Düzenle</button>
        <button class="btn sm danger" id="gDel2">Hedefi sil</button>
      </div>`;

    UI.openSheet(g.name, html, (root) => {
      $("#gcAdd", root).onclick = () => {
        const amt = parseFloat(String($("#gcAmount", root).value).replace(",", "."));
        if (!amt || amt <= 0) return UI.toast("Tutar gir");
        Store.addContribution(g.id, amt, $("#gcDate", root).value);
        UI.refresh();
        openGoalDetail(g.id);
        UI.toast("Birikim eklendi");
      };
      $$("[data-gc-del]", root).forEach(
        (b) =>
          (b.onclick = () => {
            Store.removeContribution(g.id, b.dataset.gcDel);
            UI.refresh();
            openGoalDetail(g.id);
          })
      );
      $("#gEdit", root).onclick = () => openGoalSheet(g.id);
      $("#gDel2", root).onclick = () => {
        if (UI.confirmBox("Bu hedef silinsin mi?")) {
          Store.removeGoal(g.id);
          UI.closeSheet();
          UI.refresh();
          UI.toast("Hedef silindi");
        }
      };
    });
  }

  /* =========================================================
     CSV içe aktarma önizlemesi (banka ekstresi / diğer uygulamalar)
  ========================================================= */
  function openCsvPreview(res) {
    const sample = res.rows.slice(0, 8);
    const html = `
      <div class="import-summary">
        <div class="cell"><b>${res.new}</b><span>yeni kayıt</span></div>
        <div class="cell"><b>${res.dup}</b><span>aynı (atlanır)</span></div>
        <div class="cell"><b>${res.bad}</b><span>okunmadı</span></div>
      </div>
      <p class="small muted" style="text-align:center">
        ${res.rows.length} satır okundu${res.autoCats ? ` · ${res.autoCats} kayıt bilinmeyen kategori → <b>Diğer</b>` : ""}.<br>
        Henüz hiçbir şey eklenmedi.
      </p>
      <div class="card tight" style="margin-top:10px">
        ${sample
          .map((r) => {
            const cat = Store.category(r.categoryId);
            return `<div class="row-item" style="${r.dup ? "opacity:.5" : ""}">
              <span class="ic" style="width:34px;height:34px;display:grid;place-items:center;border-radius:10px;background:${cat.color}22">${cat.icon}</span>
              <span class="mid"><span class="t">${esc(r.date)} · ${esc(cat.name)}</span><span class="s">${esc(
              r.note || (r.dup ? "zaten var" : "—")
            )}</span></span>
              <span class="amt ${r.type === "income" ? "in" : "out"}">${r.type === "income" ? "+" : "−"}${esc(UI.fmtMoney(r.amount))}</span>
            </div>`;
          })
          .join("")}
      </div>
      <div class="btn-row" style="margin-top:14px">
        <button class="btn primary" id="csvGo">＋ ${res.new} kaydı ekle</button>
        <button class="btn ghost" id="csvCancel">Vazgeç</button>
      </div>`;

    UI.openSheet("CSV önizleme", html, (root) => {
      $("#csvGo", root).onclick = () => {
        const added = Store.importCSVRows(res.rows);
        UI.closeSheet();
        UI.refresh();
        UI.toast(`${added} işlem içe aktarıldı`);
      };
      $("#csvCancel", root).onclick = () => UI.closeSheet();
    });
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

    /* Vadesi gelen tekrarlayan işlemler — listeneler çizilmeden önce üret */
    let autoCreated = 0;
    try {
      autoCreated = Store.processRecurring().length;
    } catch (e) {
      console.warn("Otomatik işlemler işlenemedi:", e);
    }

    Views.header();
    Views.render("home");
    loadRates();
    setInterval(loadRates, 10 * 60 * 1000); // 10 dakikada bir tazele
    setInterval(() => Views.header(), 60 * 1000); // "gün kaldı" bilgisini tazele
    Charts.onResize(() => {
      if (UI.current === "report") Views.render("report");
    });
    if (autoCreated) setTimeout(() => UI.toast(`🔁 ${autoCreated} otomatik işlem kaydedildi`), 900);

    /* PWA kısayolu: /?add=income veya /?add=expense → hızlı ekleme ekranı */
    try {
      const param = new URLSearchParams(location.search).get("add");
      if (param === "income" || param === "expense") {
        openAdd({ type: param });
        history.replaceState(null, "", location.pathname);
      }
    } catch (e) {}
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

  return {
    openAdd,
    openEdit,
    openTxList,
    openCardSheet,
    openAssetSheet,
    openAccountSheet,
    openImportPreview,
    openRecurringList,
    openRecurringForm,
    openGoalSheet,
    openGoalDetail,
    openCsvPreview,
    start,
  };
})();
