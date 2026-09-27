/* ui.js — ortak yardımcılar: biçimlendirme, toast, alt-pencere (sheet), gezinme, tema */
window.UI = (function () {
  "use strict";

  const $ = (sel, root) => (root || document).querySelector(sel);
  const $$ = (sel, root) => Array.prototype.slice.call((root || document).querySelectorAll(sel));

  window.$ = $;
  window.$$ = $$;

  function esc(str) {
    return String(str == null ? "" : str).replace(/[&<>"']/g, (c) => ({
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&#39;",
    })[c]);
  }

  const moneyFmt = new Intl.NumberFormat("tr-TR", { style: "currency", currency: "TRY", maximumFractionDigits: 2 });
  const numFmt = new Intl.NumberFormat("tr-TR", { maximumFractionDigits: 2 });

  function fmtMoney(n) {
    return moneyFmt.format(Number(n) || 0);
  }

  function fmtNum(n) {
    return numFmt.format(Number(n) || 0);
  }

  function fmtCompact(n) {
    const v = Number(n) || 0;
    const a = Math.abs(v);
    if (a >= 1e6) return `${(v / 1e6).toLocaleString("tr-TR", { maximumFractionDigits: 1 })} Mn ₺`;
    if (a >= 1e4) return `${(v / 1e3).toLocaleString("tr-TR", { maximumFractionDigits: 1 })} B ₺`;
    return fmtMoney(v);
  }

  function relDay(isoStr) {
    const d = Store.parseISO(isoStr);
    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const diff = Math.round((today - new Date(d.getFullYear(), d.getMonth(), d.getDate())) / 86400000);
    if (diff === 0) return "Bugün";
    if (diff === 1) return "Dün";
    if (diff === -1) return "Yarın";
    return d.toLocaleDateString("tr-TR", { day: "2-digit", month: "short" });
  }

  function fmtDateLong(isoStr) {
    return Store.parseISO(isoStr).toLocaleDateString("tr-TR", { day: "2-digit", month: "long", year: "numeric" });
  }

  function todayISO() {
    return Store.iso(new Date());
  }

  /* ---------------- Toast ---------------- */
  let toastTimer = null;
  function toast(msg) {
    const el = $("#toast");
    el.textContent = msg;
    el.classList.add("show");
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => el.classList.remove("show"), 2200);
  }

  /* ---------------- Sheet ---------------- */
  function openSheet(title, html, onMount) {
    $("#sheetTitle").textContent = title;
    $("#sheetBody").innerHTML = html;
    $("#sheet").classList.add("open");
    $("#backdrop").classList.add("open");
    document.body.style.overflow = "hidden";
    if (typeof onMount === "function") onMount($("#sheetBody"));
  }

  function closeSheet() {
    $("#sheet").classList.remove("open");
    $("#backdrop").classList.remove("open");
    document.body.style.overflow = "";
  }

  function sheetOpen() {
    return $("#sheet").classList.contains("open");
  }

  /* ---------------- Gezinme ---------------- */
  let current = "home";

  function showView(name) {
    current = name;
    $$(".view").forEach((v) => v.classList.toggle("active", v.dataset.view === name));
    $$(".nav-btn").forEach((b) => b.classList.toggle("active", b.dataset.nav === name));
    if (window.Views && Views.render) Views.render(name);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function refresh() {
    if (window.Views) {
      Views.header();
      Views.render(current);
    }
  }

  /* ---------------- Tema ---------------- */
  function applyTheme(theme) {
    document.documentElement.setAttribute("data-theme", theme);
    const meta = document.querySelector('meta[name="theme-color"]');
    if (meta) meta.setAttribute("content", theme === "dark" ? "#0b0f14" : "#eef1f7");
    const btn = $("#btnTheme");
    if (btn) btn.textContent = theme === "dark" ? "☀️" : "🌙";
    Store.setSetting("theme", theme);
  }

  function toggleTheme() {
    const next = Store.settings().theme === "dark" ? "light" : "dark";
    applyTheme(next);
    toast(next === "dark" ? "Karanlık tema" : "Aydınlık tema");
  }

  /* ---------------- Onay ---------------- */
  function confirmBox(msg) {
    return window.confirm(msg);
  }

  return {
    $,
    $$,
    esc,
    fmtMoney,
    fmtNum,
    fmtCompact,
    relDay,
    fmtDateLong,
    todayISO,
    toast,
    openSheet,
    closeSheet,
    sheetOpen,
    showView,
    refresh,
    applyTheme,
    toggleTheme,
    confirmBox,
    get current() {
      return current;
    },
  };
})();

/* Kolay erişim için global kısayollar */
const esc = UI.esc;
const fmtMoney = UI.fmtMoney;
const fmtCompact = UI.fmtCompact;
