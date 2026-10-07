"use strict";
const LS_KEY = "photographer_ledger_v1";
/* ثوابت التخزين: يجب أن تُعرَّف قبل أول load */
const LS_TMP = LS_KEY + "__tmp", LS_GOOD = LS_KEY + "__good", LS_PREWIPE = LS_KEY + "__prewipe";
const SNAP_PREFIX = "pl_snap_", DATA_VER = 3, SNAP_MAX = 7, BIG_DATA = 400000;
const ARRAYS = ["orders", "payments", "clients", "ledger", "bookings", "photographerDues", "bin"];
const errorLog = [];
let saveTimer = null, saveFailed = false;
const $ = s => document.querySelector(s);
const $$ = s => [...document.querySelectorAll(s)];

let state = load();
let reportRange = "month";
let selectMode = false;
let selected = new Set();

/* ---------- Store: ترقية بيانات + حفظ آمن ---------- */
const SNAP_MAX_BIG = 2;
function migrate(d) {
  const b = { dataVer: DATA_VER, orders: [], payments: [], clients: [], ledger: [], bookings: [], photographerDues: [], bin: [], settings: {} };
  if (!d || typeof d !== "object") return b;
  ARRAYS.forEach(k => { if (Array.isArray(d[k])) b[k] = d[k]; });
  if (d.settings && typeof d.settings === "object") b.settings = d.settings;
  b.clients.forEach(c => { c.id = c.id || uid(); c.name = (c.name || "").trim() || "عميل"; c.phone = c.phone || ""; c.details = c.details || ""; });
  const byName = {};
  b.clients.forEach(c => { byName[c.name] = c.id; });
  b.orders.forEach(o => {
    o.id = o.id || uid(); o.amount = Number(o.amount) || 0; o.date = o.date || todayStr();
    if (!o.clientId) {
      const nm = (o.client || "").trim() || "عميل";
      if (!byName[nm]) { byName[nm] = uid(); b.clients.push({ id: byName[nm], name: nm, phone: "", details: "" }); }
      o.clientId = byName[nm];
    }
    const c = b.clients.find(x => x.id === o.clientId);
    o.client = o.client || (c ? c.name : "عميل");
  });
  b.payments.forEach(p => { p.id = p.id || uid(); p.amount = Number(p.amount) || 0; p.date = p.date || todayStr(); p.orderId = p.orderId || ""; });
  b.ledger.forEach(l => { l.id = l.id || uid(); l.amount = Number(l.amount) || 0; l.paid = Number(l.paid) || 0; l.date = l.date || todayStr(); });
  b.bookings.forEach(x => { x.id = x.id || uid(); x.date = x.date || todayStr(); x.done = !!x.done; });
  b.photographerDues.forEach(x => { x.id = x.id || uid(); x.amount = Number(x.amount) || 0; x.date = x.date || todayStr(); });
  b.bin = b.bin.filter(x => x && x.id && x.item);
  return b;
}
function load() {
  let d = readKey(LS_KEY);
  if (!d || !Array.isArray(d.orders)) {
    const good = readKey(LS_GOOD);
    if (good && Array.isArray(good.orders)) { d = good; setTimeout(() => toast("⚠️ تم استرجاع آخر نسخة سليمة للبيانات"), 1400); }
  }
  return migrate(d);
}
function readKey(k) {
  try { const raw = localStorage.getItem(k); return raw ? JSON.parse(raw) : null; }
  catch (e) { return null; }
}
function snapshots() {
  const keys = [];
  try { for (let i = 0; i < localStorage.length; i++) { const k = localStorage.key(i); if (k && k.indexOf(SNAP_PREFIX) === 0) keys.push(k); } } catch (_) {}
  return keys.sort();
}
function dailySnapshot(json) {
  try {
    const key = SNAP_PREFIX + todayStr();
    if (localStorage.getItem(key)) return;
    localStorage.setItem(key, json);
    const keys = snapshots();
    const max = json.length > BIG_DATA ? SNAP_MAX_BIG : SNAP_MAX;
    while (keys.length > max) localStorage.removeItem(keys.shift());
  } catch (_) {}
}
function saveNow() {
  saveTimer = null;
  try {
    const json = JSON.stringify(state);
    const prev = localStorage.getItem(LS_KEY);
    if (prev) { try { JSON.parse(prev); localStorage.setItem(LS_GOOD, prev); } catch (_) {} }
    localStorage.setItem(LS_TMP, json);
    const check = JSON.parse(localStorage.getItem(LS_TMP) || "null");
    if (!check || !Array.isArray(check.orders)) throw new Error("verify");
    localStorage.setItem(LS_KEY, json);
    try { localStorage.removeItem(LS_TMP); } catch (_) {}
    saveFailed = false;
    dailySnapshot(json);
  } catch (e) {
    console.error("storage write failed", e);
    try { localStorage.removeItem(LS_TMP); } catch (_) {}
    if (!saveFailed) {
      saveFailed = true;
      setTimeout(() => alert("⚠️ تعذر حفظ البيانات (المساحة ممتلئة أو التصفح الخاص).\nما تكتبه الآن سيُفقد عند إغلاق التطبيق — صدّر نسخة احتياطية فوراً من «التقرير ← التصدير»."), 300);
    }
  }
}
function save() { if (!saveTimer) saveTimer = setTimeout(saveNow, 150); }
function flushSave() { if (saveTimer) { clearTimeout(saveTimer); saveNow(); } }
window.addEventListener("pagehide", flushSave);
document.addEventListener("visibilitychange", () => { if (document.visibilityState === "hidden") flushSave(); });
function uid() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
}
function todayStr() {
  const d = new Date();
  return d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0");
}
function cur() {
  return (state.settings.currency || "ر.س").trim() || "ر.س";
}
function fmtMoney(n) {
  const num = Number(n).toLocaleString("en-US", { maximumFractionDigits: 2 });
  return num + " " + cur();
}
function privMoney(n) {
  return state.settings.hideAmounts ? "••••" : fmtMoney(n);
}
function togglePrivacy() {
  state.settings.hideAmounts = !state.settings.hideAmounts;
  save();
  refresh();
  toast(state.settings.hideAmounts ? "🙈 المبالغ مخفية" : "👁️ المبالغ ظاهرة");
}
function toggleRecent() {
  const list = $("#recentList");
  const btn = $("#recentToggle");
  if (!list || !btn) return;
  const collapsed = list.classList.toggle("collapsed");
  btn.setAttribute("aria-expanded", collapsed ? "false" : "true");
}
function fmtDate(s) {
  if (!s) return "";
  try {
    const d = new Date(s);
    return d.toLocaleDateString("ar-EG-u-nu-latn", { day: "numeric", month: "short", year: "numeric" });
  } catch (e) { return s; }
}
function monthOf(s) { return s ? s.slice(0, 7) : ""; }
function inMonth(s, m) { return monthOf(s) === m; }
function currentMonth() { return monthOf(todayStr()); }

function toast(msg) {
  const t = $("#toast");
  t.textContent = msg;
  t.classList.add("show");
  clearTimeout(t._timer);
  t._timer = setTimeout(() => t.classList.remove("show"), 2200);
}
const APP_VER = "v45";
try {
  const av = document.querySelector("#appVer");
  if (av) av.textContent = "الإصدار " + APP_VER;
} catch (_) {}
window.addEventListener("error", e => {
  try {
    const msg = e.message || "غير معروف";
    errorLog.unshift({ t: new Date().toLocaleTimeString(), m: msg });
    if (errorLog.length > 20) errorLog.length = 20;
    const av = document.querySelector("#appVer");
    if (av) av.textContent = "⚠️ خطأ: " + msg;
    toast("⚠️ خطأ: " + msg);
  } catch (_) {}
});

/* ---------- Navigation ---------- */
function go(which) {
  if (which !== "orders") {
    selectMode = false;
    selected.clear();
  }
  currentScreen = which;
  $$("nav button").forEach(b => b.classList.toggle("active", b.dataset.nav === which));
  $$(".screen").forEach(s => s.classList.toggle("active", s.id === "screen-" + which));
  refresh();
  window.scrollTo({ top: 0 });
}
$$("nav button").forEach(b => b.addEventListener("click", () => go(b.dataset.nav)));

/* ---------- Month filter ---------- */
function buildMonths() {
  const set = new Set();
  ["orders", "payments"].forEach(k => state[k].forEach(x => set.add(monthOf(x.date))));
  set.add(currentMonth());
  const months = [...set].filter(Boolean).sort().reverse();
  if (!months.length) months.push(currentMonth());
  const sel = $("#monthFilter");
  const prev = sel.value || state.settings.monthSel || "";
  const opts = months.map(m => `<option value="${m}">${monthLabel(m)}</option>`).join("") +
    `<option value="all">كل الفترات</option>`;
  if (sel.innerHTML !== opts) sel.innerHTML = opts;
  if (prev && [...sel.options].some(o => o.value === prev)) sel.value = prev;
  if (!sel.value) sel.value = currentMonth();
}
function monthLabel(m) {
  try {
    const d = new Date(m + "-01T12:00:00");
    return d.toLocaleDateString("ar-EG-u-nu-latn", { month: "long", year: "numeric" });
  } catch (e) { return m; }
}
$("#monthFilter").addEventListener("change", e => {
  state.settings.monthSel = e.target.value;
  save();
  refresh();
});

/* ---------- Data accessors ---------- */
function filtered(kind) {
  const m = $("#monthFilter").value;
  if (!m || m === "all") return state[kind].slice();
  return state[kind].filter(x => inMonth(x.date, m)).slice();
}
function totals(kind) {
  return filtered(kind).reduce((s, x) => s + (Number(x.amount) || 0), 0);
}
function paidForOrder(id) {
  return state.payments.filter(p => p.orderId === id).reduce((s, p) => s + (Number(p.amount) || 0), 0);
}
function clientById(id) {
  return state.clients.find(c => c.id === id) || null;
}
function clientName(id) {
  const c = clientById(id);
  if (c) return c.name;
  const o = state.orders.find(x => x.clientId === id);
  return o ? o.client || "عميل" : "عميل";
}
function ordersOfClient(id) {
  return state.orders.filter(o => o.clientId === id);
}
function clientTotals(id) {
  const list = ordersOfClient(id);
  const total = list.reduce((a, x) => a + (Number(x.amount) || 0), 0);
  const paid = list.reduce((a, x) => a + paidForOrder(x.id), 0);
  return { count: list.length, total, paid, remaining: total - paid };
}
function ledgerOfClient(id) {
  return (state.ledger || []).filter(l => l.clientId === id);
}
function ledgerTotals(id) {
  const list = ledgerOfClient(id);
  const total = list.reduce((a, x) => a + (Number(x.amount) || 0), 0);
  const paid = list.reduce((a, x) => a + (Number(x.paid) || 0), 0);
  return { count: list.length, total, paid, remaining: total - paid };
}

/* ---------- Rendering ---------- */
function esc(s) {
  return String(s == null ? "" : s).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}

/* ---------- أيقونات SVG حديثة ---------- */
const ICONS = {
  home: '<path d="M3 10.6 12 3l9 7.6"/><path d="M5.5 9.4V20h13V9.4"/><path d="M9.7 20v-5.4h4.6V20"/>',
  users: '<path d="M16 20v-1.6a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4V20"/><circle cx="9" cy="7" r="3.4"/><path d="M22 20v-1.6a4 4 0 0 0-3-3.87"/><path d="M16.5 3.7a4 4 0 0 1 0 7.5"/>',
  box: '<path d="M20.5 7.6 12 3.2 3.5 7.6v8.8L12 20.8l8.5-4.4z"/><path d="M3.6 7.7 12 12l8.4-4.3"/><path d="M12 20.8V12"/>',
  wallet: '<path d="M3 8.4A2.4 2.4 0 0 1 5.4 6h13.2A2.4 2.4 0 0 1 21 8.4v8.2a2.4 2.4 0 0 1-2.4 2.4H5.4A2.4 2.4 0 0 1 3 16.6z"/><path d="M3 9.6V7.4a2 2 0 0 1 1.6-2l10.6-1.7"/><circle cx="16.8" cy="12.6" r="1.5"/>',
  calendar: '<rect x="3.2" y="5" width="17.6" height="16" rx="3.4"/><path d="M8 3v4M16 3v4M3.2 10h17.6"/>',
  hand: '<path d="M11 12.5 8.6 10a1.8 1.8 0 0 0-2.6 2.5l3.4 4a6 6 0 0 0 4.6 2.1h2.2a4.4 4.4 0 0 0 4.4-4.4V12"/><path d="M15 6.2a1.8 1.8 0 1 1 2.6 2.6L15 11.2"/>',
  chart: '<path d="M4 20V4"/><path d="M4 20h16"/><path d="M7.5 16.5V11M12 16.5V6.5M16.5 16.5v-4"/>',
  camera: '<path d="M4 8.6h3.2l1.6-2.4h6.4l1.6 2.4H20a1.6 1.6 0 0 1 1.6 1.6v8a1.6 1.6 0 0 1-1.6 1.6H4a1.6 1.6 0 0 1-1.6-1.6v-8A1.6 1.6 0 0 1 4 8.6z"/><circle cx="12" cy="13.8" r="3.4"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  user: '<circle cx="12" cy="8" r="3.6"/><path d="M4.6 20.4a7.6 7.6 0 0 1 14.8 0"/>',
  search: '<circle cx="11" cy="11" r="6.6"/><path d="m16 16 4.6 4.6"/>',
  bell: '<path d="M6.5 10a5.5 5.5 0 0 1 11 0c0 4 1.5 5.6 1.5 5.6H5S6.5 14 6.5 10z"/><path d="M10.2 19a2 2 0 0 0 3.6 0"/>',
  lock: '<rect x="4.6" y="10.4" width="14.8" height="10.2" rx="3"/><path d="M8.2 10.4V7.8a3.8 3.8 0 0 1 7.6 0v2.6"/>',
  trash: '<path d="M4.6 6.6h14.8"/><path d="M9 6.6V4.8A1.4 1.4 0 0 1 10.4 3.4h3.2A1.4 1.4 0 0 1 15 4.8v1.8"/><path d="M6.6 6.6 7.6 19a1.6 1.6 0 0 0 1.6 1.5h5.6a1.6 1.6 0 0 0 1.6-1.5l1-12.4"/>',
  edit: '<path d="M12.5 5.5H5.4A2.4 2.4 0 0 0 3 7.9v10.7A2.4 2.4 0 0 0 5.4 21h10.7a2.4 2.4 0 0 0 2.4-2.4V11.5"/><path d="M17.6 3.4a2.1 2.1 0 0 1 3 3L12.6 14.4l-3.9.9.9-3.9z"/>',
  download: '<path d="M12 3.6v11"/><path d="m7.6 10.6 4.4 4.4 4.4-4.4"/><path d="M4.4 17.4v1.6a1.6 1.6 0 0 0 1.6 1.6h12a1.6 1.6 0 0 0 1.6-1.6v-1.6"/>',
  check: '<path d="m4.6 12.6 4.8 4.8L19.4 7.2"/>',
  eye: '<path d="M2.6 12S6 5.6 12 5.6 21.4 12 21.4 12 18 18.4 12 18.4 2.6 12 2.6 12z"/><circle cx="12" cy="12" r="3"/>',
  eyeOff: '<path d="M9.6 6.2A8.9 8.9 0 0 1 12 5.8c6 0 9.4 6.2 9.4 6.2a15.7 15.7 0 0 1-2.6 3.4"/><path d="M6.4 7.9A15.8 15.8 0 0 0 2.6 12S6 18.2 12 18.2a8.8 8.8 0 0 0 3.4-.7"/><path d="M9.9 9.9a2.9 2.9 0 0 0 4.1 4.1"/><path d="M3.4 3.4 20.6 20.6"/>',
  share: '<path d="M4 12v7.4a1.6 1.6 0 0 0 1.6 1.6h12.8a1.6 1.6 0 0 0 1.6-1.6V12"/><path d="m8.4 7.2 3.6-3.6 3.6 3.6"/><path d="M12 3.6v12.2"/>',
  arrowUp: '<path d="M12 19V5"/><path d="m6 11 6-6 6 6"/>',
  arrowDown: '<path d="M12 5v14"/><path d="m6 13 6 6 6-6"/>',
  shield: '<path d="M12 3 5 5.8v5.4c0 4.4 3 8.2 7 9.8 4-1.6 7-5.4 7-9.8V5.8z"/><path d="m9.2 11.8 2 2 3.6-3.8"/>',
  target: '<circle cx="12" cy="12" r="8.4"/><circle cx="12" cy="12" r="4.6"/><circle cx="12" cy="12" r="1"/>',
  layers: '<path d="M12 3.2 3.4 7.4 12 11.6l8.6-4.2z"/><path d="m3.4 12 8.6 4.2L20.6 12"/><path d="m3.4 16.6 8.6 4.2 8.6-4.2"/>',
  file: '<path d="M14 3.4H7.4A1.8 1.8 0 0 0 5.6 5.2v13.6a1.8 1.8 0 0 0 1.8 1.8h9.2a1.8 1.8 0 0 0 1.8-1.8V8.4z"/><path d="M13.8 3.6v4.8h4.6"/><path d="M9 13h6M9 16.4h4"/>',
  trashBin: '<path d="M4.6 7h14.8"/><path d="M9.4 7V5.2A1.4 1.4 0 0 1 10.8 3.8h2.4a1.4 1.4 0 0 1 1.4 1.4V7"/><path d="M6.4 7h11.2l-.9 12.2a1.6 1.6 0 0 1-1.6 1.4H8.9a1.6 1.6 0 0 1-1.6-1.4z"/>',
  refresh: '<path d="M20 11.4a8 8 0 1 0-.7 4.6"/><path d="M20.4 4.6v6.8h-6.8"/>',
  clock: '<circle cx="12" cy="12" r="8.4"/><path d="M12 7.4V12l3.4 2"/>',
  send: '<path d="M20.6 3.4 10.4 13.6"/><path d="M20.6 3.4 14.2 20.6l-3.8-7-7-3.8z"/>',
  sparkle: '<path d="M12 3.4 13.9 9 19.6 10.9 13.9 12.8 12 18.4 10.1 12.8 4.4 10.9 10.1 9z"/>',
  gear: '<circle cx="12" cy="12" r="3.1"/><path d="M19.3 14.5a1.6 1.6 0 0 0 .32 1.77l.06.06a1.9 1.9 0 1 1-2.7 2.7l-.06-.06a1.6 1.6 0 0 0-1.77-.32 1.6 1.6 0 0 0-1 1.46V21a1.9 1.9 0 1 1-3.8 0v-.11a1.6 1.6 0 0 0-1.05-1.46 1.6 1.6 0 0 0-1.77.32l-.06.06a1.9 1.9 0 1 1-2.7-2.7l.06-.06a1.6 1.6 0 0 0 .32-1.77 1.6 1.6 0 0 0-1.46-1H3a1.9 1.9 0 1 1 0-3.8h.11a1.6 1.6 0 0 0 1.46-1.05 1.6 1.6 0 0 0-.32-1.77l-.06-.06a1.9 1.9 0 1 1 2.7-2.7l.06.06a1.6 1.6 0 0 0 1.77.32H9a1.6 1.6 0 0 0 1-1.46V3a1.9 1.9 0 1 1 3.8 0v.11a1.6 1.6 0 0 0 1 1.46 1.6 1.6 0 0 0 1.77-.32l.06-.06a1.9 1.9 0 1 1 2.7 2.7l-.06.06a1.6 1.6 0 0 0-.32 1.77V9a1.6 1.6 0 0 0 1.46 1H21a1.9 1.9 0 1 1 0 3.8h-.11a1.6 1.6 0 0 0-1.46 1z"/>',
  info: '<circle cx="12" cy="12" r="9"/><path d="M12 11.2v5"/><circle cx="12" cy="7.9" r="1" fill="currentColor" stroke="none"/>',
  upload: '<path d="M12 16V4.6"/><path d="m7.4 9.2 4.6-4.6 4.6 4.6"/><path d="M4.4 16.4v2.2a1.8 1.8 0 0 0 1.8 1.8h11.6a1.8 1.8 0 0 0 1.8-1.8v-2.2"/>',
  message: '<path d="M20.4 11.6a8 8 0 0 1-8.4 8 9 9 0 0 1-3.6-.8L3.6 20.4l1.6-4.6A8 8 0 1 1 20.4 11.6z"/><path d="M8.6 11.6h.01M12.4 11.6h.01M16.2 11.6h.01" stroke-width="2.4"/>',
  db: '<ellipse cx="12" cy="5.8" rx="7.6" ry="2.9"/><path d="M4.4 5.8v6.1c0 1.6 3.4 2.9 7.6 2.9s7.6-1.3 7.6-2.9V5.8"/><path d="M4.4 11.9v6c0 1.6 3.4 2.9 7.6 2.9s7.6-1.3 7.6-2.9v-6"/>',
  money: '<rect x="2.6" y="6" width="18.8" height="12" rx="2.6"/><circle cx="12" cy="12" r="2.8"/><path d="M6.4 9.6v4.8M17.6 9.6v4.8"/>'
};
function ico(name, cls) {
  return `<svg class="ico ${cls || ""}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${ICONS[name] || ""}</svg>`;
}
function avatarHue(name) {
  let h = 0;
  const s = String(name || "؟");
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) % 360;
  return h;
}
function avatarHtml(name) {
  const letter = esc((String(name || "؟").trim().charAt(0) || "؟"));
  return `<span class="av" style="--h:${avatarHue(name)}">${letter}</span>`;
}
function lastMonths(n) {
  const out = [];
  const d = new Date();
  for (let i = n - 1; i >= 0; i--) {
    const x = new Date(d.getFullYear(), d.getMonth() - i, 1);
    out.push(x.getFullYear() + "-" + String(x.getMonth() + 1).padStart(2, "0"));
  }
  return out;
}
function renderHeroChart() {
  const el = $("#heroChart");
  if (!el) return;
  const days = [];
  const base = new Date();
  for (let i = 13; i >= 0; i--) {
    const x = new Date(base.getFullYear(), base.getMonth(), base.getDate() - i);
    const key = x.getFullYear() + "-" + String(x.getMonth() + 1).padStart(2, "0") + "-" + String(x.getDate()).padStart(2, "0");
    const inc = state.payments.filter(p => p.date === key).reduce((a, p) => a + (Number(p.amount) || 0), 0);
    const out = state.orders.filter(o => o.date === key).reduce((a, o) => a + (Number(o.amount) || 0), 0);
    days.push({ key, inc, out });
  }
  const W = 320, H = 74, pad = 6;
  const max = Math.max(1, ...days.map(d => Math.max(d.inc, d.out)));
  const xAt = i => pad + (i * (W - pad * 2)) / (days.length - 1);
  const yAt = v => H - pad - (v / max) * (H - pad * 2);
  const path = key => days.map((d, i) => (i ? "L" : "M") + xAt(i).toFixed(1) + " " + yAt(d[key]).toFixed(1)).join(" ");
  const incP = path("inc"), outP = path("out");
  const area = incP + ` L ${xAt(days.length - 1).toFixed(1)} ${H - pad} L ${pad} ${H - pad} Z`;
  el.innerHTML = `<svg viewBox="0 0 ${W} ${H}" preserveAspectRatio="none" aria-hidden="true">
      <defs>
        <linearGradient id="hgIn" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stop-color="#22d3ee" stop-opacity=".45"/><stop offset="100%" stop-color="#22d3ee" stop-opacity="0"/>
        </linearGradient>
      </defs>
      <path d="${area}" fill="url(#hgIn)"/>
      <path d="${outP}" fill="none" stroke="rgba(255,255,255,.28)" stroke-width="1.6" stroke-linejoin="round"/>
      <path d="${incP}" fill="none" stroke="#22d3ee" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/>
    </svg>
    <div class="hero-legend"><span class="lg lg-in">دفعات (14 يوم)</span><span class="lg lg-out">اوردرات</span></div>`;
}
function renderHero(o, p, due) {
  const m = $("#monthFilter").value;
  const hide = !!state.settings.hideAmounts;
  const mval = hide ? "••••" : fmtMoney(o);
  const set = (sel, v) => { const e = $(sel); if (e) e.textContent = v; };
  set("#heroVal", mval);
  set("#heroLbl", m === "all" || !m ? "💼 إجمالي كل الفترات" : "💼 إجمالي أوردرات " + monthLabel(m));
  // مقارنة بالشهر السابق
  const ms = lastMonths(2);
  const curM = ms[1], prevM = ms[0];
  const inM = (arr, k) => arr.filter(x => monthOf(x.date) === k).reduce((a, x) => a + (Number(x.amount) || 0), 0);
  const curO = inM(state.orders, curM), prevO = inM(state.orders, prevM);
  if (!hide && (m === "all" || !m || m === curM) && curO > 0) {
    const diff = curO - prevO;
    const pct = prevO ? Math.round((diff / prevO) * 100) : 0;
    set("#heroSub", prevO
      ? (diff >= 0 ? "▲ " + pct + "% عن الشهر الماضي" : "▼ " + Math.abs(pct) + "% عن الشهر الماضي")
      : "أول شهر مسجّل — ابدأ بتسجيل أوردراتك");
  } else {
    set("#heroSub", state.orders.length + " اوردر · " + state.payments.length + " دفعة");
  }
  set("#heroPaid", hide ? "••••" : fmtMoney(p));
  set("#heroDue", hide ? "••••" : fmtMoney(due > 0 ? due : 0));
  const goal = Number(state.settings.targetGoal) || 0;
  set("#heroGoal", goal ? (hide ? "••••" : fmtMoney(goal)) : "غير محدد");
  renderHeroChart();
}
function renderHome() {
  const o = totals("orders");
  const p = totals("payments");
  const due = o - p;
  const m = $("#monthFilter").value;
  const pb = $("#privacyBtn");
  if (pb) pb.innerHTML = ico(state.settings.hideAmounts ? "eyeOff" : "eye");
  const cnt = filtered("orders").length;
  const avg = cnt ? o / cnt : 0;
  let html = `
    <div class="stat orders"><div class="lbl">${ico("box")} عدد الأوردرات</div><div class="val">${cnt}</div></div>
    <div class="stat ok"><div class="lbl">${ico("money")} متوسط الفاتورة</div><div class="val" style="font-size:17px;">${privMoney(avg)}</div></div>
    <div class="stat due"><div class="lbl">${ico("target")} المتبقي للتحصيل</div><div class="val" style="font-size:17px;">${privMoney(due > 0 ? due : 0)}</div></div>`;
  if (due < 0) {
    html += `<div class="stat note">ملاحظة: مدفوعات أكثر من الاوردرات بمقدار ${privMoney(Math.abs(due))}</div>`;
  }
  $("#homeStats").innerHTML = html;
  renderHero(o, p, due);

  const mm = m;
  const pickArr = arr => (mm === "all" || !mm ? arr : arr.filter(x => inMonth(x.date, mm)));
  const items = [];
  pickArr(state.payments).slice().reverse().forEach(x => items.push({ t: "💰", d: x.date, client: x.client, amount: x.amount, extra: x.method || "", cls: "pay" }));
  pickArr(state.orders).slice().reverse().forEach(x => items.push({ t: "📦", d: x.date, client: x.client, amount: x.amount, extra: x.service || "", cls: "orders" }));
  items.sort((a, b) => (a.d < b.d ? 1 : a.d > b.d ? -1 : 0));
  $("#recentCount").textContent = items.length;
  $("#recentList").innerHTML = items.length ? items.slice(0, 10).map(i => `
    <div class="item ${i.cls}">
      <div class="top">
        <div class="row-av">
          ${avatarHtml(i.client)}
          <div>
            <div class="name">${esc(i.client)}</div>
            <div class="meta">${fmtDate(i.d)}${i.extra ? " · " + esc(i.extra) : ""}</div>
          </div>
        </div>
        <div class="right">
          <div class="amt">${state.settings.hideAmounts ? "••••" : ((i.cls === "pay" ? "" : "") + fmtMoney(Math.abs(i.amount)))}</div>
          <span class="dir ${i.cls === "pay" ? "in" : "out"}">${i.cls === "pay" ? "↓ وارد" : "↑ طلب"}</span>
        </div>
      </div>
    </div>`).join("")
    : `<div class="empty">لا توجد عمليات${mm === "all" ? "" : " لهذا الشهر"}.</div>`;
}

/* ---------- Global instant search ---------- */
function renderGlobalSearch() {
  const box = $("#globalSearchResults");
  if (!box) return;
  const q = ($("#globalSearch") && $("#globalSearch").value || "").trim();
  if (!q) { box.style.display = "none"; box.innerHTML = ""; return; }
  const low = q.toLowerCase();
  const hits = [];
  const matches = (...fields) => fields.some(f => String(f == null ? "" : f).toLowerCase().includes(low));

  state.clients.forEach(c => {
    if (matches(c.name, c.phone, c.details))
      hits.push({ kind: "client", id: c.id, t: "👥", title: c.name,
        meta: [c.phone || "", ` ${clientTotals(c.id).count} اوردر`].filter(Boolean).join(" · ") });
  });
  state.orders.forEach(o => {
    if (matches(o.client, o.service, o.details))
      hits.push({ kind: "order", id: o.id, t: "📦", title: o.client,
        meta: [fmtDate(o.date), o.service || ""].filter(Boolean).join(" · ") });
  });
  state.payments.forEach(p => {
    if (matches(p.client, p.method, p.details))
      hits.push({ kind: "payment", id: p.id, t: "💰", title: p.client,
        meta: [fmtDate(p.date), p.method || ""].filter(Boolean).join(" · ") });
  });
  (state.bookings || []).forEach(b => {
    if (matches(b.title, b.client, b.details))
      hits.push({ kind: "booking", id: b.id, t: "📅", title: b.title || "حجز",
        meta: [fmtDate(b.date), b.client || ""].filter(Boolean).join(" · ") });
  });
  (state.photographerDues || []).forEach(d => {
    if (matches(d.name, d.type, d.details))
      hits.push({ kind: "due", id: d.id, t: "🤝", title: d.name,
        meta: [fmtDate(d.date), d.type || ""].filter(Boolean).join(" · ") });
  });

  if (!hits.length) {
    box.style.display = "block";
    box.innerHTML = `<div class="empty">لا توجد نتائج لـ «${esc(q)}»</div>`;
    return;
  }
  box.style.display = "block";
  box.innerHTML = hits.slice(0, 40).map(h => `
    <div class="item tappable pressable" onclick='globalSearchOpen("${h.kind}", "${h.id}")'>
      <div class="top">
        <div>
          <div class="name">${h.t} ${esc(h.title)}</div>
          <div class="meta">${esc(h.meta)}</div>
        </div>
        <div style="color:var(--muted);font-size:12px;font-weight:800;">فتح ›</div>
      </div>
    </div>`).join("");
}
function globalSearchOpen(kind, id) {
  if (kind === "client") showClientDetail(id);
  else if (kind === "order") showOrderModal(id);
  else if (kind === "payment") showPaymentModal("", "", id);
  else if (kind === "booking") showBookingModal(id);
  else if (kind === "due") showPhotographerDueModal(id);
}

function renderOrders() {
  let list = filtered("orders");
  const q = ($("#orderSearch") && $("#orderSearch").value || "").trim();
  if (q) list = list.filter(o => (o.client || "").includes(q) || (o.service || "").includes(q) || (o.details || "").includes(q));
  $("#selectModeBtn").innerHTML = selectMode ? "✕ جاهز" : "تحديد متعدد";
  renderSelectBar();
  $("#ordersList").innerHTML = list.length ? list.slice().reverse().map(o => {
    const paid = paidForOrder(o.id);
    const remain = Number(o.amount) - paid;
    const isSel = selected.has(o.id);
    const side = selectMode
      ? `<div class="check">✓</div>`
      : `<span class="more" title="خيارات">⋯</span>`;
    return `
    <div class="item pressable ${selectMode ? "selectable" : "tappable"} ${isSel ? "selecting" : ""}" onpointerdown='pressStart(event,"order","${o.id}")' onpointerup='pressEnd(event)' onpointercancel='pressEnd(event)' onpointerleave='pressCancel()' onclick='pressTap(event,"order","${o.id}")' oncontextmenu='return false'>
      <div class="top">
        <div>
          <div class="name">${ico("box")} ${esc(o.client)}</div>
          <div class="meta">
            <span>${fmtDate(o.date)}</span>
            ${o.service ? `<span class="badge">${esc(o.service)}</span>` : ""}
          </div>
        </div>
        <div style="display:flex;align-items:center;gap:8px;">
          <div class="amt">${fmtMoney(o.amount)}</div>
          ${side}
        </div>
      </div>
      ${o.details ? `<div class="details">${esc(o.details)}</div>` : ""}
      <div class="meta" style="margin-top:6px;">
        ${paid > 0 ? `<span>تم تحصيل ${fmtMoney(paid)}</span>` : ""}
        ${remain > 0
          ? `<span style="color:var(--accent)">متبقي ${fmtMoney(remain)}</span>`
          : `<span style="color:var(--ok)">✓ مدفوع كامل</span>`}
      </div>
    </div>`;
  }).join("") : `<div class="empty">${ico("box", "big")}<br>لا توجد اوردرات.</div>`;
}

function renderPayments() {
  const list = filtered("payments");
  $("#paymentsList").innerHTML = list.length ? list.slice().reverse().map(p => {
    const order = state.orders.find(o => o.id === p.orderId);
    return `
    <div class="item pay">
      <div class="top">
        <div>
          <div class="name">${ico("wallet")} ${esc(p.client)}</div>
          <div class="meta">
            <span>${fmtDate(p.date)}</span>
            ${p.method ? `<span class="badge">${esc(p.method)}</span>` : ""}
            ${order ? `<span class="badge">اوردر: ${esc(order.client)}</span>` : ""}
          </div>
        </div>
        <div class="amt">${fmtMoney(p.amount)}</div>
      </div>
      ${p.details ? `<div class="details">${esc(p.details)}</div>` : ""}
      <div class="actions-inline">
        <button class="btn btn-dark btn-slim" onclick='showPaymentModal("", "", "${p.id}")'>✏️ تعديل</button>
        <button class="rm" onclick='delPayment("${p.id}")'>حذف</button>
      </div>
    </div>`;
  }).join("") : `<div class="empty">${ico("wallet", "big")}<br>لا توجد مدفوعات مسجلة.</div>`;
}

function renderClients() {
  let list = state.clients.slice().sort((a, b) => a.name.localeCompare(b.name, "ar"));
  const q = ($("#clientSearch") && $("#clientSearch").value || "").trim();
  if (q) list = list.filter(c => (c.name || "").includes(q) || (c.phone || "").includes(q));
  $("#clientsList").innerHTML = list.length ? list.map(c => {
    const t = clientTotals(c.id);
    return `
    <div class="item tappable pressable" onpointerdown='pressStart(event,"client","${c.id}")' onpointerup='pressEnd(event)' onpointercancel='pressEnd(event)' onpointerleave='pressCancel()' onclick='pressTap(event,"client","${c.id}")' oncontextmenu='return false'>
      <div class="top">
        <div>
          <div class="name">${ico("users")} ${esc(c.name)}</div>
          <div class="meta">
            <span>${t.count} اوردر</span>
            ${c.phone ? `<span class="badge">${ico("file")} ${esc(c.phone)}</span>` : ""}
          </div>
        </div>
        <div style="text-align:left;">
          <div class="amt" style="font-size:13px;">${fmtMoney(t.total)}</div>
          ${t.remaining > 0 ? `<div style="font-size:11px;color:var(--accent);font-weight:700;">متبقي ${fmtMoney(t.remaining)}</div>` : `<div style="font-size:11px;color:var(--ok);font-weight:700;">مصفّى ✓</div>`}
        </div>
      </div>
    </div>`;
  }).join("") : `<div class="empty">لا يوجد عملاء بعد. اضغط «+ عميل» أو أضف اوردر باسم عميل.</div>`;
}

function fillSettings() {
  const s = state.settings;
  const sa = $("#setAccountant"); if (sa) sa.value = s.accountant || "";
  const sc = $("#setCompany"); if (sc) sc.value = s.company || "";
  const sg = $("#setGoal"); if (sg) sg.value = s.targetGoal || "";
  const scr = $("#setCurrency");
  const scrO = $("#setCurrencyOther");
  if (scr) {
    const cv = s.currency || "ر.س";
    const known = [...scr.options].some(o => o.value === cv);
    scr.value = known ? cv : "__other";
    if (scrO) {
      scrO.style.display = scr.value === "__other" ? "block" : "none";
      scrO.value = known ? "" : cv;
    }
  }
  const tg = $("#themeSeg");
  if (tg) {
    $$("#themeSeg button").forEach(b => b.classList.toggle("active", b.dataset.theme === "dark"));
  }
  const pt = $("#pinOnToggle"); if (pt) pt.checked = !!s.pinOn;
  const rt = $("#dailyRemindToggle"); if (rt) rt.checked = !!s.dailyRemind;
  renderServices();
  renderBinCount();
  fillNotifyBox();
  const tip = $("#lastBackupTip");
  if (tip) {
    if (s.lastBackup) {
      const d = new Date(s.lastBackup);
      const days = Math.floor((Date.now() - s.lastBackup) / 86400000);
      tip.textContent = `💾 آخر نسخة احتياطية: ${d.toLocaleDateString("ar-EG-u-nu-latn", { day: "numeric", month: "short", year: "numeric" })} (منذ ${days} يوم)`;
      tip.style.color = days > 7 ? "var(--bad)" : "var(--muted)";
    } else {
      tip.textContent = "⚠️ لم تأخذ نسخة احتياطية بعد — خذ واحدة الآن لحماية بياناتك.";
      tip.style.color = "var(--bad)";
    }
  }
}

let backupReminded = false;
function maybeBackupReminder() {
  if (backupReminded) return;
  backupReminded = true;
  const last = state.settings.lastBackup || 0;
  if (Date.now() - last > 7 * 86400000) {
    setTimeout(() => toast("💾 تذكير: خذ نسخة احتياطية من تبويب التقرير"), 2500);
  }
}

/* ---------- Auto cloud backup via WhatsApp ---------- */
function buildBackupTxt() {
  const now = new Date().toLocaleString("ar-EG-u-nu-latn", { dateStyle: "long", timeStyle: "short" });
  return `💾 نسخة احتياطية — 📸 دفتر التصوير\n🕓 ${now}\n\n` + JSON.stringify(state, null, 1);
}
function fillBackupSettings() {
  const bn = $("#setBackupNum");
  if (bn) bn.value = state.settings.autoBackupNum || "";
  const tg = $("#autoBackupToggle");
  if (tg) tg.checked = !!state.settings.autoBackup;
}
function saveBackupSettings() {
  const bn = $("#setBackupNum");
  if (bn) state.settings.autoBackupNum = bn.value.replace(/\D/g, "");
  const tg = $("#autoBackupToggle");
  if (tg) state.settings.autoBackup = !!tg.checked;
  save();
  toast("تم حفظ إعدادات النسخة الاحتياطية");
}
function backupNum() {
  return (state.settings.autoBackupNum || "").replace(/\D/g, "");
}
function sendAutoBackup(manual) {
  const num = backupNum();
  if (!num) return toast("أدخل رقم واتسابك أولاً في الإعدادات → تصدير (النسخة الاحتياطية)");
  state.settings.lastBackup = Date.now();
  if (manual) state.settings.lastAutoBackup = Date.now();
  save();
  openWhatsApp(num, buildBackupTxt(), "النسخة الاحتياطية");
  const tip = $("#lastBackupTip");
  if (tip) tip.textContent = "💾 تم الإرسال قبل لحظات";
  if (!manual) toast("💾 أُرسلت النسخة الاحتياطية اليومية");
  refresh();
}
function maybeAutoBackup() {
  if (autoBackupRan) return;
  autoBackupRan = true;
  if (!state.settings.autoBackup) return;
  if (!backupNum()) return;
  const last = state.settings.lastAutoBackup || 0;
  if (Date.now() - last >= 86400000) {
    setTimeout(() => sendAutoBackup(false), 4000);
  }
}
let autoBackupRan = false;

/* ---------- Sub-Tabs & Dashboard ---------- */
function setSubTab(tab) {
  $$(".sub-tab-btn").forEach(b => b.classList.toggle("active", b.dataset.sub === tab));
  $$(".sub-tab-content").forEach(s => s.classList.toggle("active", s.id === "sub-tab-" + tab));
  renderDashboard();
  if (tab === "about") renderAbout();
}

function renderDashboard() {
  const s = state.settings;
  const target = Number(s.targetGoal) || 0;
  const m = $("#monthFilter").value;
  const pList = m === "all" || !m ? state.payments : state.payments.filter(p => inMonth(p.date, m));
  const collected = pList.reduce((a, x) => a + (Number(x.amount) || 0), 0);
  
  const fill = $("#goalCircleFill");
  const percentText = $("#goalPercentText");
  const colVal = $("#goalCollectedVal");
  const tarVal = $("#goalTargetVal");
  const msg = $("#goalStatusMsg");
  
  if (colVal) colVal.textContent = fmtMoney(collected);
  if (tarVal) tarVal.textContent = target > 0 ? fmtMoney(target) : "لم يحدد";
  
  if (target > 0) {
    const pct = Math.min(100, Math.round((collected / target) * 100));
    if (fill) fill.setAttribute("stroke-dasharray", `${pct}, 100`);
    if (percentText) percentText.textContent = `${pct}%`;
    
    if (msg) {
      if (pct >= 100) {
        msg.innerHTML = "🏆 <b>مبروك!</b> لقد تجاوزت هدفك المالي لهذا الشهر! استمر في التقدم.";
        msg.style.color = "var(--ok)";
      } else if (pct >= 75) {
        msg.innerHTML = "💪 أوشكت على الوصول! أنت قريب جداً من تحقيق الهدف.";
        msg.style.color = "var(--accent)";
      } else if (pct >= 50) {
        msg.innerHTML = "📈 لقد قطعت نصف الطريق! واصل كفاحك للأيام القادمة.";
        msg.style.color = "var(--accent-2)";
      } else {
        msg.innerHTML = `🎯 يتبقى لك <b>${fmtMoney(target - collected)}</b> للوصول لهدفك الشهري.`;
        msg.style.color = "var(--muted)";
      }
    }
  } else {
    if (fill) fill.setAttribute("stroke-dasharray", "0, 100");
    if (percentText) percentText.textContent = "0%";
    if (msg) msg.innerHTML = "💡 يمكنك تحديد هدف مالي شهري من تبويب الإعدادات لمتابعة تقدمك.";
  }

  const oList = m === "all" || !m ? state.orders : state.orders.filter(o => inMonth(o.date, m));
  const totalOrders = oList.length;
  const chart = $("#servicesChartWrap");
  if (!chart) return;
  
  if (!totalOrders) {
    chart.innerHTML = `<div class="empty" style="padding:15px 0;">لا توجد أوردرات مسجلة لهذه الفترة للتحليل.</div>`;
    return;
  }
  
  const counts = {};
  oList.forEach(o => {
    const svc = (o.service || "أخرى").trim();
    counts[svc] = (counts[svc] || 0) + 1;
  });
  
  const sorted = Object.entries(counts).sort((a, b) => b[1] - a[1]);
  chart.innerHTML = sorted.map(([svc, count]) => {
    const pct = Math.round((count / totalOrders) * 100);
    return `
      <div class="svc-row">
        <div class="svc-top">
          <span>🎬 ${esc(svc)}</span>
          <span class="svc-meta">${count} طلب (${pct}%)</span>
        </div>
        <div class="svc-bar">
          <div class="svc-fill" style="width: ${pct}%;"></div>
        </div>
      </div>
    `;
  }).join("");
}

function saveSettings(silent) {
  const sa = $("#setAccountant"); if (sa) state.settings.accountant = sa.value.replace(/\D/g, "");
  const sc = $("#setCompany"); if (sc) state.settings.company = sc.value.trim();
  const scr = $("#setCurrency");
  if (scr) {
    const v = scr.value;
    const o = $("#setCurrencyOther");
    state.settings.currency = v === "__other" ? ((o ? o.value : "") || "ر.س").trim() : v;
  }
  const sg = $("#setGoal"); if (sg) state.settings.targetGoal = sg.value.replace(/\D/g, "");
  save();
  if (!silent) toast("تم حفظ الإعدادات");
  refresh();
}

/* ---------- Theme (dark / light) ---------- */
function hydrateIcons(root) {
  const scope = root || document;
  (scope.querySelectorAll ? scope.querySelectorAll("[data-ico]") : []).forEach(el => {
    if (el.dataset.icoDone) return;
    el.innerHTML = ico(el.dataset.ico);
    el.dataset.icoDone = "1";
  });
}
function applyTheme() {
  document.documentElement.dataset.theme = "dark";
}
function setTheme(th) {
  state.settings.theme = "dark";
  save();
  applyTheme();
  $$("#themeSeg button").forEach(b => b.classList.toggle("active", b.dataset.theme === "dark"));
  toast("🌙 الوضع الليلي");
}

/* ---------- Quick services (الخدمات السريعة) ---------- */
function appServices() {
  if (!Array.isArray(state.settings.services)) state.settings.services = [];
  return state.settings.services;
}
function renderServices() {
  const el = $("#svcList");
  if (!el) return;
  const list = appServices();
  el.innerHTML = list.length
    ? list.map(s => `<span class="svc-tag">🏷️ ${esc(s)}<button class="rm-mini" onclick='delService("${esc(s)}")'>✕</button></span>`).join("")
    : `<span class="tip" style="margin:0;">لا توجد خدمات مخصصة بعد — أضف أول خدمة لتصبح زراً سريعاً.</span>`;
}
function addService() {
  const inp = $("#svcInput");
  if (!inp) return;
  const v = inp.value.trim();
  if (!v) return toast("اكتب اسم الخدمة");
  const list = appServices();
  if (list.includes(v)) return toast("الخدمة موجودة بالفعل");
  list.push(v);
  save();
  inp.value = "";
  refresh();
  toast("تمت إضافة الخدمة 🏷️");
}
function delService(name) {
  appServices();
  state.settings.services = state.settings.services.filter(x => x !== name);
  save();
  refresh();
  toast("تم حذف الخدمة");
}
function serviceListWithBase() {
  const list = [];
  appServices().forEach(s => { if (s && !list.includes(s)) list.push(s); });
  SERVICE_OPTIONS.forEach(s => { if (!list.includes(s)) list.push(s); });
  return list;
}
function svcChipsHtml() {
  return `<div class="svc-tags" style="margin:-4px 0 12px;">${serviceListWithBase().map(s => `<button class="svc-chip" onclick="fillService('${esc(s)}')">🏷️ ${esc(s)}</button>`).join("")}</div>`;
}
function fillService(name) {
  const sv = $("#oService");
  const wrap = $("#oServiceOtherWrap");
  if (!sv || !wrap) return;
  const exists = [...sv.options].some(o => o.value === name);
  if (exists) {
    sv.value = name;
    wrap.style.display = "none";
  } else {
    sv.value = "other";
    const oo = $("#oServiceOther");
    if (oo) oo.value = name;
    wrap.style.display = "block";
  }
}

/* ---------- PIN lock (قفل التطبيق) ---------- */
let pinBuf = "", pinMsgT = null, pendingDaily = false;
function hashPin(s) {
  let h = 5381;
  for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) >>> 0;
  return "x" + h;
}
function togglePinEnable() {
  const el = $("#pinOnToggle");
  if (!el) return;
  if (el.checked && !state.settings.pinHash) {
    el.checked = false;
    return toast("اكتب الرقم السري أولاً ثم اضغط «تعيين»");
  }
  state.settings.pinOn = !!el.checked;
  save();
  toast(el.checked ? "🔒 القفل مفعّل" : "القفل متوقف");
}
function savePin() {
  const inp = $("#pinNew");
  if (!inp) return;
  const v = inp.value.replace(/\D/g, "");
  if (v.length < 4 || v.length > 6) return toast("الرقم السري يجب أن يكون من 4 إلى 6 أرقام");
  state.settings.pinHash = hashPin(v);
  state.settings.pinLen = v.length;
  state.settings.pinOn = true;
  const tg = $("#pinOnToggle"); if (tg) tg.checked = true;
  save();
  inp.value = "";
  toast("🔐 تم تعيين القفل وتفعيله");
}
function maybeLock() {
  if (!state.settings.pinOn || !state.settings.pinHash) return;
  hydrateIcons($("#pinLock"));
  if ($("#pinLock")) {
    pinBuf = "";
    renderPinDots();
    $("#pinLock").style.display = "flex";
  }
}
function renderPinDots() {
  const dots = $("#pinDots");
  if (!dots) return;
  const len = state.settings.pinLen || 4;
  dots.innerHTML = Array.from({ length: len }, (_, i) =>
    `<span class="pin-dot ${i < pinBuf.length ? "on" : ""}"></span>`).join("");
}
function pinDigit(d) {
  if (pinBuf.length >= (state.settings.pinLen || 6)) return;
  pinBuf += String(d);
  renderPinDots();
  if (pinBuf.length >= (state.settings.pinLen || 6)) setTimeout(pinCheck, 150);
}
function pinBack() {
  pinBuf = pinBuf.slice(0, -1);
  renderPinDots();
}
function pinCheck() {
  if (hashPin(pinBuf) === state.settings.pinHash) {
    const l = $("#pinLock");
    if (l) l.style.display = "none";
    pinBuf = "";
    if (pendingDaily) {
      pendingDaily = false;
      setTimeout(showDailySummary, 300);
    }
    return;
  }
  pinBuf = "";
  renderPinDots();
  const msg = $("#pinMsg");
  if (msg) {
    msg.textContent = "الرقم السري غير صحيح — حاول مجدداً";
    msg.style.opacity = 1;
    clearTimeout(pinMsgT);
    pinMsgT = setTimeout(() => { msg.style.opacity = 0; }, 1800);
  }
  const box = $("#pinBox");
  if (box) {
    box.classList.remove("shake");
    void box.offsetWidth;
    box.classList.add("shake");
  }
}

/* ---------- Smart daily reminder (التذكير اليومي) ---------- */
function saveDailyRemind() {
  const el = $("#dailyRemindToggle");
  if (!el) return;
  state.settings.dailyRemind = !!el.checked;
  save();
  toast(el.checked ? "⚡ التذكير اليومي مفعّل" : "التذكير اليومي متوقف");
}
function maybeDailyRemind() {
  if (!state.settings.dailyRemind) return;
  const today = todayStr();
  if (state.settings.lastRemindDay === today) return;
  if (state.settings.pinOn && state.settings.pinHash) {
    pendingDaily = true;
    return;
  }
  setTimeout(showDailySummary, 600);
}
function showDailySummary() {
  state.settings.lastRemindDay = todayStr();
  save();
  const t = todayStr();
  const todayOrders = state.orders.filter(o => o.date === t);
  const oSum = todayOrders.reduce((a, o) => a + (Number(o.amount) || 0), 0);
  const todayBookings = (state.bookings || []).filter(b => b.date === t && !b.done);
  const lateBookings = (state.bookings || []).filter(b => !b.done && b.date < t);
  const pending = state.orders.filter(o => Number(o.amount) - paidForOrder(o.id) > 0)
    .sort((a, b) => (a.date < b.date ? -1 : 1));
  const pendSum = pending.reduce((a, o) => a + (Number(o.amount) - paidForOrder(o.id)), 0);
  let pendList = "";
  if (pending.length) {
    pendList = `<div class="mini-list">${pending.slice(0, 3).map(o => {
      const rem = Number(o.amount) - paidForOrder(o.id);
      return `<div class="mini-item"><span>👥 ${esc(o.client)} · ${esc(o.service || "اوردر")}</span><b>${fmtMoney(rem)}</b></div>`;
    }).join("")}${pending.length > 3 ? `<div class="mini-more">+${pending.length - 3} أخرى…</div>` : ""}</div>`;
  }
  openSheet(`<h2>${ico("sparkle")} ملخص يومك</h2>
    <p class="tip">${fmtDate(t)} — لنبدأ يوم جديد بتركيز!</p>
    <div class="daily-wrap">
      <div class="daily-row"><span>${ico("box")} اوردرات اليوم</span><b>${todayOrders.length} · ${fmtMoney(oSum)}</b></div>
      <div class="daily-row"><span>${ico("calendar")} حجوزات اليوم</span><b>${todayBookings.length}</b></div>
      <div class="daily-row"><span>${ico("clock")} حجوزات فائتة/مستحقة</span><b>${lateBookings.length}</b></div>
      <div class="daily-row"><span>${ico("file")} إجمالي المتأخرات</span><b>${pending.length} · ${fmtMoney(pendSum)}</b></div>
    </div>
    ${pendList}
    <div class="actions" style="margin-top:14px;">
      <button class="btn btn-primary" onclick="closeSheet();go('orders')">${ico("box")} عرض الاوردرات</button>
      <button class="btn btn-dark" onclick="closeSheet()">حسناً</button>
    </div>`);
}

/* ---------- Recycle bin (سلة المحذوفات) ---------- */
function putInBin(type, item) {
  if (!Array.isArray(state.bin)) state.bin = [];
  state.bin.push({ id: uid(), type, item, at: Date.now() });
  if (state.bin.length > 100) state.bin.shift();
}
function binList() {
  if (!Array.isArray(state.bin)) state.bin = [];
  const cutoff = Date.now() - 30 * 86400000;
  return state.bin.filter(b => (b.at || 0) >= cutoff);
}
function renderBinCount() {
  const el = $("#binCount");
  if (el) el.textContent = binList().length;
}
function binLabel(b) {
  const it = b.item || {};
  if (b.type === "order") return { icon: "📦", title: `${it.client || "عميل"} · ${it.service || "اوردر"}${it.amount ? " · " + fmtMoney(it.amount) : ""}` };
  if (b.type === "payment") return { icon: "💰", title: `${it.client || "عميل"} · ${fmtMoney(it.amount)}${it.method ? " · " + it.method : ""}` };
  if (b.type === "client") return { icon: "👥", title: it.name || "عميل" };
  if (b.type === "ledger") return { icon: "📒", title: `${it.title || "بند"} · ${it.client || ""}` };
  if (b.type === "booking") return { icon: "📅", title: it.title || "حجز" };
  if (b.type === "due") return { icon: "🤝", title: `${it.name || "مصور"} · ${fmtMoney(it.amount)}` };
  return { icon: "🗂️", title: "عنصر" };
}
function openBinSheet() {
  let list = binList();
  if (!Array.isArray(state.bin)) state.bin = [];
  state.bin = state.bin.filter(b => list.some(x => x.id === b.id));
  list = binList();
  if (!list.length) return toast("السلة فارغة");
  openSheet(`<h2>${ico("trashBin")} سلة المحذوفات</h2>
    <p class="tip">عناصر حذفت خلال آخر 30 يوم. اضغط «استرجاع» لإرجاعها لمكانها.</p>
    ${list.map(b => {
      const lb = binLabel(b);
      const d = new Date(b.at || Date.now()).toISOString().slice(0, 10);
      return `<div class="item">
        <div class="top">
          <div>
            <div class="name">${lb.icon} ${esc(lb.title)}</div>
            <div class="meta"><span>🗑️ حذف: ${fmtDate(d)}</span></div>
          </div>
        </div>
        <div class="actions-inline">
          <button class="btn btn-green btn-slim" onclick='restoreFromBin("${b.id}")'>↩️ استرجاع</button>
        </div>
      </div>`;
    }).join("")}
    <button class="btn btn-danger btn-block" style="margin-top:10px;" onclick="emptyBin()">🗑️ تفريغ السلة</button>`);
}
function restoreFromBin(binId) {
  const b = state.bin.find(x => x.id === binId);
  if (!b) return;
  if (b.type === "order") state.orders.push(b.item);
  else if (b.type === "payment") state.payments.push(b.item);
  else if (b.type === "client") { if (!clientById(b.item.id)) state.clients.push(b.item); }
  else if (b.type === "ledger") { if (!Array.isArray(state.ledger)) state.ledger = []; state.ledger.push(b.item); }
  else if (b.type === "booking") { if (!Array.isArray(state.bookings)) state.bookings = []; state.bookings.push(b.item); }
  else if (b.type === "due") { if (!Array.isArray(state.photographerDues)) state.photographerDues = []; state.photographerDues.push(b.item); }
  state.bin = state.bin.filter(x => x.id !== binId);
  save();
  closeSheet();
  refresh();
  toast("تم الاسترجاع ✔");
}
function emptyBin() {
  if (!confirm("تفريغ السلة نهائياً؟ لا يمكن التراجع.")) return;
  state.bin = [];
  save();
  closeSheet();
  refresh();
  toast("تم تفريغ السلة");
}

/* --- Modals sheet stack: back returns to previous --- */
let sheetStack = [];

/* ---------- الرسم: الشاشة النشطة فقط ---------- */
const SCREENS = {};
let currentScreen = "home";
function updateBadges() {
  const badge = $("#bookingBadge");
  if (badge) {
    const t = todayStr();
    const n = (state.bookings || []).filter(b => !b.done && b.date <= t).length;
    badge.style.display = n ? "flex" : "none";
    badge.textContent = n > 9 ? "9+" : n;
  }
  renderBinCount();
}
function renderActive() {
  const fn = SCREENS[currentScreen];
  if (fn) { try { fn(); } catch (e) { console.error(e); } }
  updateBadges();
}
function refresh() {
  buildMonths();
  renderActive();
  rebuildSheets();
}
function renderAll() {
  buildMonths();
  Object.keys(SCREENS).forEach(k => { try { SCREENS[k](); } catch (e) { console.error(e); } });
  updateBadges();
  rebuildSheets();
}
let searchT = null;
function onSearchInput() {
  if (searchT) clearTimeout(searchT);
  searchT = setTimeout(() => {
    searchT = null;
    renderGlobalSearch();
    renderOrders();
    renderClients();
  }, 180);
}
SCREENS.home = renderHome;
SCREENS.orders = renderOrders;
SCREENS.clients = renderClients;
SCREENS.payments = renderPayments;
SCREENS.bookings = renderBookings;
SCREENS.dues = renderPhotographerDues;
SCREENS.settings = () => {
  renderReport();
  renderDashboard();
  fillSettings();
  fillBackupSettings();
  renderBinCount();
  renderAbout();
  updateDiag();
};
renderAll();
hydrateIcons();
applyTheme();
maybeBackupReminder();
maybeAutoBackup();
maybeDailyRemind();
setTimeout(() => checkBookingAlerts(false), 2500);
maybeLock();
const curSelEl = $("#setCurrency");
if (curSelEl) {
  curSelEl.addEventListener("change", () => {
    const o = $("#setCurrencyOther");
    if (o) o.style.display = curSelEl.value === "__other" ? "block" : "none";
  });
}

/* ---------- Modals (sheet stack: back returns to previous) ---------- */
let sheetHist = 0;
function openSheet(html, tag) {
  const wasEmpty = sheetStack.length === 0;
  sheetStack.push({ html, tag: tag || null });
  renderSheetTop();
  if (wasEmpty) {
    try { history.pushState({ dlSheet: 1 }, ""); sheetHist++; } catch (_) {}
  }
}
function renderSheetTop() {
  const top = sheetStack[sheetStack.length - 1];
  if (!top) { $("#overlay").classList.remove("show"); return; }
  hydrateIcons($("#sheet"));
  $("#sheet").innerHTML = `
    <div class="sheet-top">
      <button class="sheet-close" onclick="closeSheet()">✕ إغلاق</button>
    </div>
    ${top.html}`;
  $("#overlay").classList.add("show");
}
function closeSheet(skipHist) {
  if (sheetStack.length) sheetStack.pop();
  if (!skipHist && !sheetStack.length && sheetHist > 0) {
    sheetHist--;
    try { history.back(); } catch (_) {}
  }
  renderSheetTop();
}
/* إغلاق النافذة: لمس الخلفية، زر Escape، وزر الرجوع في أندرويد */
$("#overlay").addEventListener("click", e => {
  if (e.target.id === "overlay") closeSheet();
});
document.addEventListener("keydown", e => {
  if (e.key === "Escape" && sheetStack.length) closeSheet();
});
window.addEventListener("popstate", () => {
  if (sheetHist > 0) sheetHist--;
  if (sheetStack.length) { sheetStack.length = 0; renderSheetTop(); }
});
function buildSheetByTag(tag) {
  if (!tag) return null;
  if (tag.kind === "clientDetail") {
    if (!clientById(tag.id)) return null;
    return clientDetailHtml(tag.id);
  }
  if (tag.kind === "orderActions") {
    if (!state.orders.find(x => x.id === tag.id)) return null;
    return orderActionsHtml(tag.id);
  }
  if (tag.kind === "clientActions") {
    if (!clientById(tag.id)) return null;
    return clientActionsHtml(tag.id);
  }
  return null;
}
function rebuildSheets() {
  let changed = false;
  for (let i = sheetStack.length - 1; i >= 0; i--) {
    const s = sheetStack[i];
    if (!s.tag) continue;
    const html = buildSheetByTag(s.tag);
    if (html == null) { sheetStack.splice(i, 1); changed = true; }
    else if (html !== s.html) { s.html = html; changed = true; }
  }
  if (changed) renderSheetTop();
}

/* ---------- Press: long-hold opens actions, single tap enters directly ---------- */
let pressTimer = null, pressHeld = false;
function pressStart(e, kind, id) {
  if (e && e.button > 0) return;
  pressCancel();
  pressHeld = false;
  pressTimer = setTimeout(() => {
    pressTimer = null;
    pressHeld = true;
    try { if (navigator.vibrate) navigator.vibrate(25); } catch (_) {}
    if (kind === "client") showClientActions(id);
    else if (kind === "order" && !selectMode) showOrderActions(id);
  }, 550);
}
function pressCancel() {
  if (pressTimer) { clearTimeout(pressTimer); pressTimer = null; }
}
function pressEnd() { pressCancel(); }
function pressTap(e, kind, id) {
  pressCancel();
  if (pressHeld) { pressHeld = false; return; }
  if (e && e.preventDefault) e.preventDefault();
  if (kind === "client") showClientDetail(id);
  else if (kind === "order") {
    if (selectMode) toggleSelect(id);
    else showOrderModal(id);
  }
}function orderSelectOptions(selId) {
  const remaining = o => Number(o.amount) - paidForOrder(o.id);
  const list = state.orders.filter(o => remaining(o) > 0 || (selId && o.id === selId));
  return `<option value="">— اختياري: ربط باوردر —</option>` +
    list.map(o => `<option value="${o.id}" ${selId === o.id ? "selected" : ""}>${esc(o.details || o.service || "اوردر")}</option>`).join("");
}

const SERVICE_OPTIONS = ["تصوير فوتو", "تصوير فيديو", "مونتاج"];

function showClientModal(id) {
  const c = id ? clientById(id) : null;
  openSheet(`
    <h2>${ico("user")} ${c ? "تعديل العميل" : "عميل جديد"}</h2>
    <div class="field"><label>اسم العميل *</label><input id="cName" value="${esc(c ? c.name : "")}" placeholder="مثال: أم محمد"></div>
    <div class="field"><label>رقم الجوال (اختياري)</label><input id="cPhone" type="tel" inputmode="tel" value="${esc(c ? c.phone : "")}" placeholder="05xxxxxxxx" dir="ltr"></div>
    <div class="field"><label>ملاحظات</label><textarea id="cDetails" placeholder="ملاحظات عن العميل...">${esc(c ? c.details : "")}</textarea></div>
    <button class="btn btn-primary btn-block" onclick="saveClient('${id || ""}')">${c ? "حفظ التعديل" : "حفظ العميل"}</button>
  `);
}

function saveClient(id) {
  const name = $("#cName").value.trim();
  if (!name) return toast("اكتب اسم العميل");
  const data = { name, phone: $("#cPhone").value.trim(), details: $("#cDetails").value.trim() };
  if (id) {
    const c = clientById(id);
    if (c) {
      c.name = name;
      c.phone = data.phone;
      c.details = data.details;
      state.orders.filter(o => o.clientId === id).forEach(o => { o.client = name; });
      (state.ledger || []).filter(l => l.clientId === id).forEach(l => { l.client = name; });
    }
  } else {
    const c = { id: uid(), ...data };
    state.clients.push(c);
  }
  save();
  closeSheet();
  refresh();
  toast("تم حفظ العميل");
}

function showClientDetail(id) {
  const html = clientDetailHtml(id);
  if (!html) return;
  openSheet(html, { kind: "clientDetail", id });
}
function clientDetailHtml(id) {
  const c = clientById(id);
  if (!c) return null;
  const t = clientTotals(id);
  const ledgers = ledgerOfClient(id).slice().sort((a, b) => (a.date < b.date ? 1 : -1));
  const lt = ledgerTotals(id);
  const orders = ordersOfClient(id).slice().sort((a, b) => (a.date < b.date ? 1 : -1));
  const listHtml = orders.length ? orders.map(o => {
    const paid = paidForOrder(o.id);
    const remain = Number(o.amount) - paid;
    return `
    <div class="item">
      <div class="top">
        <div>
          <div class="name">📦 ${esc(o.service || "اوردر")}</div>
          <div class="meta">
            <span>${fmtDate(o.date)}</span>
            ${o.details ? `<span class="badge">${esc(o.details.length > 30 ? o.details.slice(0, 30) + "…" : o.details)}</span>` : ""}
          </div>
        </div>
        <div style="text-align:left;">
          <div class="amt" style="font-size:13px;">${fmtMoney(o.amount)}</div>
          ${remain > 0 ? `<div style="font-size:11px;color:var(--accent);font-weight:700;">متبقي ${fmtMoney(remain)}</div>` : `<div style="font-size:11px;color:var(--ok);font-weight:700;">مدفوع ✓</div>`}
        </div>
      </div>
      <div class="actions-inline">
        <button class="btn btn-dark btn-slim" onclick='showPaymentModal("${o.id}")'>${ico("wallet")} تحصيل</button>
        <button class="btn btn-dark btn-slim" onclick='sendOrderWhatsApp("${o.id}")'>${ico("send")} إرسال اوردر</button>
        <button class="btn btn-dark btn-slim" onclick='showOrderModal("${o.id}")'>✏️ تعديل</button>
        <button class="rm" onclick='delOrder("${o.id}")'>حذف</button>
      </div>
    </div>`;
  }).join("") : `<div class="empty">لا يوجد اوردرات لهذا العميل.</div>`;
  const ledgerHtml = ledgers.length ? ledgers.map(l => {
    const lpaid = Number(l.paid) || 0;
    const lrem = Number(l.amount) - lpaid;
    return `
    <div class="item ledger-item">
      <div class="top">
        <div>
          <div class="name">📒 ${esc(l.title || "بند")}</div>
          <div class="meta">
            <span>${fmtDate(l.date)}</span>
            ${l.details ? `<span class="badge">${esc(l.details.length > 30 ? l.details.slice(0, 30) + "…" : l.details)}</span>` : ""}
          </div>
        </div>
        <div style="text-align:left;">
          <div class="amt" style="font-size:13px;">${fmtMoney(l.amount)}</div>
          ${lrem > 0 ? `<div style="font-size:11px;color:#b45309;font-weight:700;">متبقي ${fmtMoney(lrem)}</div>` : `<div style="font-size:11px;color:#047857;font-weight:700;">مسدد ✓</div>`}
        </div>
      </div>
      <div class="meta" style="margin-top:6px;">مسدد: ${fmtMoney(lpaid)} من ${fmtMoney(l.amount)}${l.lastPaid ? ` · آخر تسديد: ${fmtDate(l.lastPaid)}` : ""}</div>
      <div class="actions-inline">
        ${lrem > 0 ? `<button class="btn btn-dark btn-slim" onclick='showLedgerPayModal("${l.id}")'>${ico("wallet")} تسديد</button>` : ""}
        <button class="btn btn-dark btn-slim" onclick='showLedgerModal("${id}","${l.id}")'>✏️ تعديل</button>
        <button class="rm" onclick='delLedger("${l.id}")'>حذف</button>
      </div>
    </div>`;
  }).join("") : `<div class="ledger-empty">لا توجد بنود مديونية لهذا العميل.</div>`;

  return `
    <div style="display:flex;align-items:center;justify-content:space-between;">
      <h2>${ico("users")} ${esc(c.name)}</h2>
    </div>
    ${c.phone ? `<div class="meta" style="margin-bottom:8px;">${ico("file")} ${esc(c.phone)}</div>` : ""}
    ${c.details ? `<div class="details" style="margin-bottom:8px;">${esc(c.details)}</div>` : ""}
    <div class="stats" style="margin-bottom:4px;">
      <div class="stat"><div class="lbl">${ico("box")} الاوردرات</div><div class="val" style="font-size:18px;">${t.count}</div></div>
      <div class="stat orders"><div class="lbl">${ico("wallet")} المطلوب</div><div class="val" style="font-size:18px;">${fmtMoney(t.total)}</div></div>
      <div class="stat ok"><div class="lbl">💵 المدفوع</div><div class="val" style="font-size:18px;">${fmtMoney(t.paid)}</div></div>
      <div class="stat due"><div class="lbl">${ico("target")} المتبقي</div><div class="val" style="font-size:18px;">${fmtMoney(t.remaining > 0 ? t.remaining : 0)}</div></div>
    </div>
    <div class="actions" style="margin-top:6px;">
      <button class="btn btn-primary" onclick="showOrderModal('','${id}')">${ico("plus")} اوردر</button>
      <button class="btn btn-dark" onclick="showPaymentModal('','${id}')">${ico("wallet")} دفعة</button>
      <button class="btn btn-green" onclick="sendClientWhatsApp('${id}')">${ico("send")} إرسال اوردراته</button>
    </div>
    <div class="actions" style="margin-top:8px;">
      <button class="btn btn-dark" onclick="exportClientPDF('${id}')">${ico("file")} PDF اوردرات العميل</button>
      <button class="btn btn-dark" onclick="showClientModal('${id}')">✏️ بيانات العميل</button>
    </div>
    <div class="ledger-box">
      <div class="ledger-title">📒 سجل المديونية <span class="count">${ledgers.length}</span></div>
      <div class="ledger-stats">
        <div class="lstat lstat-total"><div class="lbl">${ico("wallet")} إجمالي البنود</div><div class="val">${fmtMoney(lt.total)}</div></div>
        <div class="lstat lstat-paid"><div class="lbl">💵 المسدد</div><div class="val">${fmtMoney(lt.paid)}</div></div>
        <div class="lstat lstat-due"><div class="lbl">${ico("target")} المتبقي</div><div class="val">${fmtMoney(lt.remaining > 0 ? lt.remaining : 0)}</div></div>
      </div>
      <div class="actions" style="margin-top:6px;">
        <button class="btn btn-primary btn-slim" onclick="showLedgerModal('${id}')">${ico("plus")} بند مديونية</button>
      </div>
      ${ledgerHtml}
    </div>
    <div class="section-title">اوردرات العميل <span class="count">${orders.length}</span></div>
    ${listHtml}
    <button class="btn btn-danger btn-block" style="margin-top:8px;" onclick="delClient('${id}')">🗑️ حذف العميل</button>
  `;
}

function showLedgerModal(clientId, entryId) {
  const e = entryId ? (state.ledger || []).find(x => x.id === entryId) : null;
  openSheet(`
    <h2>${ico("file")} ${e ? "تعديل البند" : "بند مديونية جديد"}</h2>
    <div class="field"><label>العميل</label><input value="${esc(clientName(clientId))}" disabled></div>
    <div class="field"><label>البيان *</label><input id="lTitle" value="${esc(e ? e.title : "")}" placeholder="مثال: سلفة نقدية"></div>
    <div class="field-row">
      <div class="field"><label>المبلغ *</label><input id="lAmount" type="number" inputmode="decimal" min="0" step="0.01" value="${e ? e.amount : ""}" placeholder="0"></div>
      <div class="field"><label>التاريخ</label><input id="lDate" type="date" value="${e ? e.date : todayStr()}"></div>
    </div>
    <div class="field"><label>ملاحظات</label><input id="lDetails" value="${esc(e ? e.details : "")}" placeholder="تفاصيل البند..."></div>
    <button class="btn btn-primary btn-block" onclick="saveLedger('${clientId}','${entryId || ""}')">حفظ البند</button>
  `);
}

function saveLedger(clientId, entryId) {
  const title = $("#lTitle").value.trim();
  const amount = parseFloat($("#lAmount").value);
  if (!title) return toast("اكتب بيان البند");
  if (!(amount > 0)) return toast("اكتب مبلغ صحيح");
  const data = {
    clientId,
    client: clientName(clientId),
    title,
    amount,
    date: $("#lDate").value || todayStr(),
    details: $("#lDetails").value.trim()
  };
  if (entryId) {
    const e = (state.ledger || []).find(x => x.id === entryId);
    if (e) Object.assign(e, data);
  } else {
    state.ledger.push(Object.assign({ id: uid(), paid: 0 }, data));
  }
  save();
  closeSheet();
  refresh();
  toast("تم حفظ البند");
}

function showLedgerPayModal(entryId) {
  const e = (state.ledger || []).find(x => x.id === entryId);
  if (!e) return;
  const rem = Number(e.amount) - (Number(e.paid) || 0);
  openSheet(`
    <h2>${ico("wallet")} تسديد بند</h2>
    <div class="meta" style="margin-bottom:8px;">${esc(e.title)} · المتبقي ${fmtMoney(rem > 0 ? rem : 0)}</div>
    <div class="field"><label>مبلغ التسديد *</label><input id="lpAmount" type="number" inputmode="decimal" min="0" step="0.01" placeholder="0"></div>
    <div class="field"><label>التاريخ</label><input id="lpDate" type="date" value="${todayStr()}"></div>
    <button class="btn btn-primary btn-block" onclick="saveLedgerPayment('${entryId}')">حفظ التسديد</button>
  `);
}

function saveLedgerPayment(entryId) {
  const e = (state.ledger || []).find(x => x.id === entryId);
  if (!e) return;
  const amount = parseFloat($("#lpAmount").value);
  if (!(amount > 0)) return toast("اكتب مبلغ صحيح");
  const rem = Number(e.amount) - (Number(e.paid) || 0);
  if (amount > rem) return toast("المبلغ أكبر من المتبقي (" + fmtMoney(rem) + ")");
  e.paid = (Number(e.paid) || 0) + amount;
  const d = $("#lpDate") ? $("#lpDate").value : "";
  if (d) e.lastPaid = d;
  save();
  closeSheet();
  refresh();
  toast("تم تسجيل التسديد ✓");
}

function delLedger(entryId) {
  const e = (state.ledger || []).find(x => x.id === entryId);
  if (!e) return;
  if (!confirm("حذف هذا البند نهائياً؟")) return;
  putInBin("ledger", e);
  const cid = e.clientId;
  state.ledger = state.ledger.filter(x => x.id !== entryId);
  save();
  refresh();
  toast("تم حذف البند");
}

function showClientActions(id) {
  const html = clientActionsHtml(id);
  if (!html) return;
  openSheet(html, { kind: "clientActions", id });
}
function clientActionsHtml(id) {
  const c = clientById(id);
  if (!c) return null;
  const t = clientTotals(id);
  const lt = ledgerTotals(id);
  const lrem = lt.remaining > 0 ? lt.remaining : 0;
  return `
    <div class="sheet-header-card">
      <h2>${ico("users")} ${esc(c.name)}</h2>
      ${c.phone ? `<div class="sheet-phone">${ico("file")} ${esc(c.phone)}</div>` : ""}
      <div class="sheet-stats">
        <span class="stat-chip">📦 <b>${t.count}</b> اوردر</span>
        <span class="stat-chip highlighted">${ico("wallet")} متبقي: <b>${fmtMoney(t.remaining > 0 ? t.remaining : 0)}</b></span>
        ${lt.count > 0 ? `<span class="stat-chip ledger-chip">📒 مديونية: <b>${fmtMoney(lrem)}</b></span>` : ""}
      </div>
    </div>
    <div class="sheet-grid">
      <button class="btn btn-primary" onclick="closeSheet();showClientDetail('${id}')">${ico("users")} فتح بطاقة العميل</button>
      <button class="btn btn-dark" onclick="showLedgerModal('${id}')">📒 بند مديونية</button>
      <button class="btn btn-green" onclick="closeSheet();sendClientWhatsApp('${id}')">${ico("send")} واتساب</button>
      <button class="btn btn-dark" onclick="closeSheet();exportClientPDF('${id}')">${ico("file")} PDF</button>
      <button class="btn btn-dark" onclick="showClientModal('${id}')">✏️ بيانات العميل</button>
      <button class="btn btn-danger" onclick="closeSheet();delClient('${id}')">🗑️ حذف</button>
    </div>
  `;
}

function sendClientWhatsApp(id) {
  const c = clientById(id);
  if (!c) { toast("العميل غير موجود"); return; }
  const num = clientPhone(id) || accountantNum();
  const ids = ordersOfClient(id).map(o => o.id);
  if (!ids.length) { toast("لا يوجد اوردرات لهذا العميل"); return; }
  let msg = buildOrdersReport(ids, "اوردرات العميل: " + c.name);
  const lt = ledgerTotals(id);
  if (lt.count > 0) {
    msg += "\n\n📒 سجل المديونية (" + lt.count + "): إجمالي " + fmtMoney(lt.total) + " · مسدد " + fmtMoney(lt.paid) + " · متبقي " + fmtMoney(lt.remaining > 0 ? lt.remaining : 0);
    ledgerOfClient(id).slice().sort((a, b) => (a.date < b.date ? 1 : -1)).forEach(l => {
      const lrem = Number(l.amount) - (Number(l.paid) || 0);
      msg += "\n- " + l.title + " (" + fmtDate(l.date) + "): " + fmtMoney(l.amount) + (lrem > 0 ? " · متبقي " + fmtMoney(lrem) : " · مسدد ✓");
    });
  }
  sendOrShare(num, "اوردرات العميل: " + c.name, msg, c.name);
}

function delClient(id) {
  const cnt = ordersOfClient(id).length + ledgerOfClient(id).length;
  if (cnt > 0) { toast("لا يمكن حذف عميل لديه اوردرات أو بنود مديونية"); return; }
  if (!confirm("حذف هذا العميل نهائياً؟")) return;
  const c = state.clients.find(x => x.id === id);
  if (c) putInBin("client", c);
  state.clients = state.clients.filter(x => x.id !== id);
  save();
  closeSheet();
  refresh();
  toast("تم حذف العميل");
}

function exportClientPDF(id) {
  const c = clientById(id);
  if (!c) { toast("العميل غير موجود"); return; }
  const ids = ordersOfClient(id).map(o => o.id);
  if (!ids.length) { toast("لا يوجد اوردرات لهذا العميل"); return; }
  exportOrdersPDF(ids, "اوردرات العميل: " + c.name);
}

function showOrderModal(id, clientId) {
  const o = id ? state.orders.find(x => x.id === id) : null;
  const svcList = serviceListWithBase();
  const isCustom = o && !svcList.includes(o.service);
  const selClientId = o ? o.clientId : (clientId || "");
  const clientOpts = `
    <option value="__new">${ico("plus")} عميل جديد...</option>
    ${state.clients.slice().sort((a, b) => a.name.localeCompare(b.name, "ar")).map(c =>
      `<option value="${c.id}" ${selClientId === c.id ? "selected" : ""}>${esc(c.name)}${c.phone ? " · " + esc(c.phone) : ""}</option>`).join("")}`;
  openSheet(`
    <h2>${ico("box")} ${o ? "تعديل الاوردر" : "اوردر جديد"}</h2>
    <div class="field"><label>العميل *</label><select id="oClient">${clientOpts}</select></div>
    <div class="field" id="newClientWrap" style="display:none;">
      <div class="field"><label>اسم العميل الجديد *</label><input id="oNewClient" placeholder="مثال: أم محمد"></div>
      <div class="field"><label>رقم الجوال (اختياري)</label><input id="oNewPhone" type="tel" inputmode="tel" placeholder="05xxxxxxxx" dir="ltr"></div>
    </div>
    <div class="field" id="oClientInfoWrap" style="display:${selClientId ? "block" : "none"};">
      <label>العميل الحالي</label>
      <div class="details" id="oClientInfo"></div>
    </div>
    <div class="field"><label>المبلغ *</label><input id="oAmount" type="number" inputmode="decimal" min="0" step="0.01" value="${o ? o.amount : ""}" placeholder="0"></div>
    <div class="field"><label>نوع الخدمة</label><select id="oService">
      <option value="">— اختر —</option>
      ${svcList.map(s => `<option ${o && o.service === s ? "selected" : ""}>${s}</option>`).join("")}
      <option value="other" ${isCustom ? "selected" : ""}>أخرى</option>
    </select></div>
    <div class="field" id="oServiceOtherWrap" style="display:${isCustom ? "block" : "none"}">
      <label>اكتب الخدمة</label><input id="oServiceOther" value="${isCustom ? esc(o.service) : ""}" placeholder="اسم الخدمة">
    </div>
    ${svcChipsHtml()}
    <div class="field"><label>التاريخ</label><input id="oDate" type="date" value="${o ? o.date : todayStr()}"></div>
    <div class="field"><label>تفاصيل</label><textarea id="oDetails" placeholder="المكان، عدد الصور، الملاحظات...">${esc(o ? o.details : "")}</textarea></div>
    <button class="btn btn-primary btn-block" onclick="saveOrder('${id || ""}')">${o ? "حفظ التعديل" : "حفظ الاوردر"}</button>
  `);
  function updateClientInfo() {
    const c = clientById($("#oClient").value);
    if (c && $("#oClient").value !== "__new") {
      $("#oClientInfoWrap").style.display = "block";
      $("#oClientInfo").textContent = "رقم الجوال: " + (c.phone || "غير محدد") + (c.details ? " · " + c.details : "");
    } else {
      $("#oClientInfoWrap").style.display = "none";
    }
  }
  const sv = $("#oService");
  const wrap = $("#oServiceOtherWrap");
  const oc = $("#oClient");
  const ncw = $("#newClientWrap");
  const toggle = () => { wrap.style.display = sv.value === "other" ? "block" : "none"; };
  const toggleNew = () => {
    ncw.style.display = oc.value === "__new" ? "block" : "none";
    updateClientInfo();
  };
  sv.addEventListener("change", toggle);
  oc.addEventListener("change", toggleNew);
  toggle();
  toggleNew();
}

function showPaymentModal(orderId, clientId, payId) {
  const ex = payId ? state.payments.find(x => x.id === payId) : null;
  const order = ex ? state.orders.find(x => x.id === ex.orderId) : (orderId ? state.orders.find(x => x.id === orderId) : null);
  const prefill = ex ? ex.client : (order ? order.client : (clientId ? clientName(clientId) : ""));
  const methods = ["نقدي", "تحويل بنكي", "شبكة", "آبل باي", "تحصيلات"];
  const mSel = ex ? ex.method : "";
  const oSel = ex ? ex.orderId : (order ? order.id : "");
  const prefillCid = clientId || (ex ? ((state.orders.find(x => x.id === (ex.orderId || "")) || {}).clientId || "") : "");
  openSheet(`
    <h2>${ico("wallet")} ${ex ? "تعديل الدفعة" : "تسجيل دفعة"}</h2>
    <div class="field"><label>اسم العميل *</label><input id="pClient" value="${esc(prefill)}" placeholder="مثال: أم محمد"></div>
    <div class="field"><label>المبلغ *</label><input id="pAmount" type="number" inputmode="decimal" min="0" step="0.01" value="${ex ? ex.amount : ""}" placeholder="0"></div>
    <div class="field-row">
      <div class="field"><label>طريقة الدفع</label><select id="pMethod">
        <option value="">— اختر —</option>
        ${methods.map(s => `<option ${mSel === s ? "selected" : ""}>${s}</option>`).join("")}
      </select></div>
      <div class="field"><label>التاريخ</label><input id="pDate" type="date" value="${ex ? ex.date : todayStr()}"></div>
    </div>
    ${oSel && order
      ? `<input type="hidden" id="pOrder" value="${oSel}">`
      : `<div class="field"><label>ربط باوردر (اختياري)</label><select id="pOrder">${orderSelectOptions(oSel)}</select></div>`}
    <input type="hidden" id="pClientId" value="${prefillCid}">
    ${prefillCid && !oSel && !ex
      ? `<div class="field"><label class="autoapply"><input type="checkbox" id="pAutoApply" checked> خصم الدفعة من «متبقي» اوردرات العميل تلقائيًا</label></div>`
      : ""}
    <div class="field"><label>ملاحظات</label><input id="pDetails" value="${esc(ex ? ex.details : "")}" placeholder="دفعة مقدمة، دفعة شفهية..."></div>
    <button class="btn btn-primary btn-block" onclick="savePayment('${ex ? ex.id : ""}')">${ex ? "حفظ التعديل" : "حفظ الدفعة"}</button>
  `);
}

/* ---------- Save / Delete ---------- */
function saveOrder(id) {
  const ocSel = $("#oClient").value;
  let cid = "";
  let client = "";
  if (ocSel === "__new") {
    const nm = $("#oNewClient").value.trim();
    if (!nm) return toast("اكتب اسم العميل الجديد");
    const c = { id: uid(), name: nm, phone: $("#oNewPhone").value.trim(), details: "" };
    state.clients.push(c);
    cid = c.id;
    client = nm;
  } else {
    const c = clientById(ocSel);
    if (!c) return toast("اختر العميل");
    cid = c.id;
    client = c.name;
  }
  const amount = parseFloat($("#oAmount").value);
  if (!(amount > 0)) return toast("اكتب مبلغ صحيح");
  let service = $("#oService").value;
  if (service === "other") service = $("#oServiceOther").value.trim();
  const data = {
    client,
    clientId: cid,
    amount,
    service,
    date: $("#oDate").value || todayStr(),
    details: $("#oDetails").value.trim()
  };
  if (id) {
    const o = state.orders.find(x => x.id === id);
    if (o) Object.assign(o, data);
  } else {
    state.orders.push(Object.assign({ id: uid() }, data));
  }
  save();
  closeSheet();
  refresh();
  toast("تم حفظ الاوردر");
}

function savePayment(id) {
  const client = $("#pClient").value.trim();
  const amount = parseFloat($("#pAmount").value);
  if (!client) return toast("اكتب اسم العميل");
  if (!(amount > 0)) return toast("اكتب مبلغ صحيح");
  const orderId = $("#pOrder") ? $("#pOrder").value : "";
  const details = $("#pDetails").value.trim();
  const date = $("#pDate").value || todayStr();
  const method = $("#pMethod").value;
  const finalize = n => { save(); closeSheet(); refresh(); toast(n); };
  if (id) {
    const p = state.payments.find(x => x.id === id);
    if (p) Object.assign(p, { client, amount, method, date, orderId: orderId || "", details });
    return finalize("تم حفظ التعديل");
  }
  const cid = $("#pClientId") ? $("#pClientId").value : "";
  const autoApply = !!($("#pAutoApply") && $("#pAutoApply").checked && cid && !orderId);
  if (autoApply) {
    const open = state.orders
      .filter(o => o.clientId === cid)
      .map(o => ({ o, paid: paidForOrder(o.id) }))
      .filter(x => x.paid < Number(x.o.amount))
      .sort((a, b) => (a.o.date > b.o.date ? 1 : -1));
    let rem = amount;
    const created = [];
    for (const x of open) {
      if (rem <= 0) break;
      const need = Number(x.o.amount) - x.paid;
      const take = Math.min(need, rem);
      created.push({ id: uid(), client, amount: take, method, date, orderId: x.o.id, details });
      rem -= take;
    }
    state.payments.push(...created);
    if (rem > 0) state.payments.push({ id: uid(), client, amount: rem, method, date, orderId: "", details });
    return finalize(created.length
      ? (created.length === 1 ? "✅ تم تسجيل الدفعة وتخفيض متبقي الاوردر" : `✅ وزّعت الدفعة على ${created.length} اوردرات`)
      : "تم تسجيل الدفعة");
  }
  state.payments.push({ id: uid(), client, amount, method, date, orderId: orderId || "", details });
  finalize("تم تسجيل الدفعة");
}

function showOrderActions(id) {
  const html = orderActionsHtml(id);
  if (!html) return;
  openSheet(html, { kind: "orderActions", id });
}
function orderActionsHtml(id) {
  const o = state.orders.find(x => x.id === id);
  if (!o) return null;
  const paid = paidForOrder(o.id);
  const remain = Number(o.amount) - paid;
  return `
    <div class="sheet-header-card">
      <h2>${ico("box")} ${esc(o.client)}</h2>
      <div class="sheet-stats">
        <span class="stat-chip">${ico("calendar")} ${fmtDate(o.date)}</span>
        ${o.service ? `<span class="stat-chip">${ico("camera")} ${esc(o.service)}</span>` : ""}
        <span class="stat-chip highlighted">${ico("wallet")} الإجمالي: <b>${fmtMoney(o.amount)}</b></span>
        <span class="stat-chip ${remain > 0 ? 'due-chip' : 'ok-chip'}">${remain > 0 ? ico("target") + " متبقي: <b>" + fmtMoney(remain) + "</b>" : ico("check") + " مدفوع كامل"}</span>
      </div>
    </div>
    <div class="sheet-grid">
      <button class="btn btn-primary" onclick="showPaymentModal('${id}')">${ico("wallet")} تحصيل</button>
      <button class="btn btn-dark" onclick="showOrderModal('${id}')">✏️ تعديل</button>
      <button class="btn btn-green" onclick="closeSheet();sendOrderWhatsApp('${id}')">${ico("send")} واتساب</button>
      <button class="btn btn-dark" onclick="closeSheet();exportOrdersPDF(['${id}'],'اوردر')">${ico("file")} PDF</button>
      <button class="btn btn-danger full-width" onclick="closeSheet();delOrder('${id}')">🗑️ حذف الاوردر</button>
    </div>
  `;
}

function delOrder(id) {
  if (!confirm("حذف هذا الاوردر؟")) return;
  const o = state.orders.find(x => x.id === id);
  if (o) putInBin("order", o);
  state.orders = state.orders.filter(x => x.id !== id);
  state.payments.forEach(p => { if (p.orderId === id) p.orderId = ""; });
  save();
  refresh();
  toast("تم الحذف");
}
function delPayment(id) {
  if (!confirm("حذف هذه الدفعة؟")) return;
  const p = state.payments.find(x => x.id === id);
  if (p) putInBin("payment", p);
  state.payments = state.payments.filter(x => x.id !== id);
  save();
  refresh();
  toast("تم الحذف");
}
/* ---------- Bookings (حجوزات التصوير) ---------- */
/* ---------- تنبيهات الحجوزات (إشعارات حقيقية) ---------- */
function notifPerm() {
  return typeof Notification === "undefined" ? "unsupported" : Notification.permission;
}
function notifyLabel() {
  const p = notifPerm();
  return p === "granted" ? "مفعّلة" : p === "denied" ? "مرفوضة من المتصفح" : p === "unsupported" ? "غير مدعومة" : "غير مفعّلة";
}
function toggleNotify() {
  const el = $("#notifyToggle");
  if (!el) return;
  if (typeof Notification === "undefined") { el.checked = false; return toast("متصفحك ما يدعم الإشعارات"); }
  if (Notification.permission === "granted") {
    state.settings.notify = el.checked;
    save();
    fillNotifyBox();
    toast(el.checked ? "تم تفعيل تنبيهات الحجوزات" : "تم إيقاف تنبيهات الحجوزات");
    if (el.checked) checkBookingAlerts(true);
    return;
  }
  if (el.checked) {
    Notification.requestPermission().then(p => {
      state.settings.notify = p === "granted";
      el.checked = p === "granted";
      save();
      fillNotifyBox();
      toast(p === "granted" ? "تم تفعيل تنبيهات الحجوزات" : "لم يُسمح بالإشعارات — فعّلها من إعدادات المتصفح");
      if (p === "granted") checkBookingAlerts(true);
    });
  } else {
    state.settings.notify = false;
    save();
  }
}
function fireNotify(title, body, tag) {
  if (!state.settings.notify || notifPerm() !== "granted") return false;
  try {
    const n = new Notification(title, { body: body, tag: tag || "", icon: "icons/icon-192.png", badge: "icons/icon-192.png", dir: "rtl", lang: "ar" });
    n.onclick = () => { try { window.focus(); go("bookings"); } catch (_) {} n.close(); };
    return true;
  } catch (e) { return false; }
}
function fillNotifyBox() {
  const el = $("#notifyToggle");
  if (el) el.checked = !!state.settings.notify && notifPerm() === "granted";
  const tip = $("#notifyTip");
  if (!tip) return;
  const p = notifPerm();
  let msg = "الحالة: " + notifyLabel();
  if (p === "denied") msg += " — افتح إعدادات الموقع في المتصفح واسمح بالإشعارات.";
  else if (p === "unsupported") msg += " — استخدم كروم، أو سفاري بعد تثبيت التطبيق على الشاشة الرئيسية.";
  else if (p === "granted") msg += " — يصلك إشعار عند اقتراب موعد الحجز (يفتح الحجوزات عند الضغط).";
  else msg += " — فعّل المفتاح واسمح بالإذن من المتصفح.";
  tip.textContent = msg;
}
function checkBookingAlerts(force) {
  const due = (state.bookings || []).filter(b => !b.done && b.date && bookingDue(b));
  if (!due.length) return 0;
  const day = todayStr();
  const key = "n" + day + "|";
  const seen = new Set((state.settings.notifiedBookings || []).filter(k => k.indexOf(key) === 0).map(k => k.slice(key.length)));
  const fresh = force ? due : due.filter(b => !seen.has(b.id));
  if (!fresh.length) return 0;
  state.settings.notifiedBookings = [...new Set((state.settings.notifiedBookings || []).concat(fresh.map(b => key + b.id)))].slice(-80);
  save();
  const n = fresh.length;
  const lines = fresh.slice(0, 3).map(b => "• " + b.title + " — " + fmtDate(b.date) + (b.time ? " · " + b.time : "") + (b.client ? " (" + b.client + ")" : ""));
  const body = (n === 1 ? lines[0] : n + " حجوزات:\n" + lines.join("\n")) + (n > 3 ? "\n…" : "");
  const ok = fireNotify("📅 تذكير بحجز", body, "bookings-" + day);
  if (!ok) toast("⏰ " + (n === 1 ? fresh[0].title + " · " + daysLabel(daysUntil(fresh[0].date)) : n + " حجوزات تحتاج مراجعتك"));
  return n;
}
document.addEventListener("visibilitychange", () => {
  if (document.visibilityState === "visible") setTimeout(() => checkBookingAlerts(false), 900);
});
function daysUntil(dstr) {
  const t = new Date(todayStr() + "T12:00:00");
  const x = new Date(((dstr || todayStr())) + "T12:00:00");
  return Math.round((x - t) / 86400000);
}
function daysLabel(n) {
  if (n < 0) return `فات موعدها (منذ ${-n} يوم)`;
  if (n === 0) return "اليوم 📍";
  if (n === 1) return "بكرة ⏰";
  return `بعد ${n} أيام`;
}
function bookingDue(b) {
  if (b.done) return null;
  const n = daysUntil(b.date);
  if (n < 0) return "overdue";
  if (b.remind === "day" && n <= 1) return "soon";
  if (b.remind === "sameday" && n === 0) return "today";
  return null;
}
function bookingsSorted() {
  const t = todayStr();
  const rank = b => (b.done ? 2 : (b.date < t ? 0 : 1));
  return (state.bookings || []).slice().sort((a, b) =>
    rank(a) - rank(b) ||
    (a.date < b.date ? -1 : a.date > b.date ? 1 : 0) ||
    ((a.time || "") < (b.time || "") ? -1 : 1));
}
function renderBookings() {
  const list = bookingsSorted();
  const t = todayStr();
  const urgent = list.filter(b => !b.done && b.date <= t);
  const badge = $("#bookingBadge");
  if (badge) {
    badge.style.display = urgent.length ? "flex" : "none";
    badge.textContent = urgent.length;
  }
  let html = "";
  if (urgent.length) {
    html += `<div class="item" style="border-color:var(--accent);">⏰ <b>تنبيه:</b> لديك ${urgent.length} حجوزات ${urgent.some(b => b.date < t) ? "فائتة أو " : ""}مستحقة اليوم</div>`;
  }
  html += list.length ? list.map(b => {
    const n = daysUntil(b.date);
    const due = bookingDue(b);
    return `
    <div class="item" style="${b.done ? "opacity:.65;" : (b.date < t ? "border-color:var(--danger);" : (due ? "border-color:var(--accent);" : ""))}">
      <div class="top">
        <div>
          <div class="name">📅 ${esc(b.title || "حجز تصوير")}${b.done ? " ✓" : ""}</div>
          <div class="meta">
            <span>${fmtDate(b.date)}${b.time ? " · " + esc(b.time) : ""}</span>
            ${b.client ? `<span class="badge">${ico("users")} ${esc(b.client)}</span>` : ""}
          </div>
        </div>
        <div class="amt" style="font-size:13px;${b.done ? "color:var(--ok);" : (b.date < t ? "color:var(--danger);" : "")}">${b.done ? "تم ✓" : esc(daysLabel(n))}</div>
      </div>
      ${b.details ? `<div class="details">${esc(b.details)}</div>` : ""}
      <div class="actions-inline">
        ${b.done ? `<button class="btn btn-dark btn-slim" onclick='toggleBookingDone("${b.id}")'>↩️ إعادة فتح</button>` : `<button class="btn btn-dark btn-slim" onclick='toggleBookingDone("${b.id}")'>${ico("check")} تم</button>`}
        <button class="btn btn-dark btn-slim" onclick='sendBookingWhatsApp("${b.id}")'>${ico("send")} واتساب</button>
        <button class="btn btn-dark btn-slim" onclick='showBookingModal("${b.id}")'>✏️ تعديل</button>
        <button class="rm" onclick='delBooking("${b.id}")'>حذف</button>
      </div>
    </div>`;
  }).join("") : `<div class="empty">لا توجد حجوزات. اضغط «+ حجز» لإضافة حجز مستقبلي مع تنبيه.</div>`;
  $("#bookingsList").innerHTML = html;
}
function showBookingModal(id) {
  const b = id ? (state.bookings || []).find(x => x.id === id) : null;
  const selCid = b ? (b.clientId || "") : "";
  openSheet(`
    <h2>${ico("calendar")} ${b ? "تعديل الحجز" : "حجز تصوير جديد"}</h2>
    <div class="field"><label>العميل (اختياري)</label><select id="bClient">
      <option value="">— بدون ربط بعميل —</option>
      ${state.clients.slice().sort((a, c) => a.name.localeCompare(c.name, "ar")).map(c => `<option value="${c.id}" ${selCid === c.id ? "selected" : ""}>${esc(c.name)}</option>`).join("")}
    </select></div>
    <div class="field"><label>عنوان الحجز *</label><input id="bTitle" value="${esc(b ? b.title : "")}" placeholder="مثال: تصوير زفاف"></div>
    <div class="field-row">
      <div class="field"><label>التاريخ *</label><input id="bDate" type="date" value="${b ? b.date : todayStr()}"></div>
      <div class="field"><label>الوقت</label><input id="bTime" type="time" value="${b ? (b.time || "") : ""}"></div>
    </div>
    <div class="field"><label>التنبيه</label><select id="bRemind">
      <option value="day" ${!b || b.remind === "day" ? "selected" : ""}>${ico("clock")} قبل الموعد بيوم</option>
      <option value="sameday" ${b && b.remind === "sameday" ? "selected" : ""}>📍 يوم الموعد</option>
      <option value="none" ${b && b.remind === "none" ? "selected" : ""}>🔕 بدون تنبيه</option>
    </select></div>
    <div class="field"><label>ملاحظات</label><textarea id="bDetails" placeholder="المكان، تفاصيل الجلسة...">${esc(b ? b.details : "")}</textarea></div>
    <button class="btn btn-primary btn-block" onclick="saveBooking('${id || ""}')">${b ? "حفظ التعديل" : "حفظ الحجز"}</button>
  `);
}
function saveBooking(id) {
  const title = $("#bTitle").value.trim();
  const date = $("#bDate").value;
  if (!title) return toast("اكتب عنوان الحجز");
  if (!date) return toast("اختر تاريخ الحجز");
  const cid = $("#bClient").value;
  const c = cid ? clientById(cid) : null;
  const data = {
    clientId: cid || "",
    client: c ? c.name : "",
    title,
    date,
    time: $("#bTime").value || "",
    remind: $("#bRemind").value || "day",
    details: $("#bDetails").value.trim()
  };
  if (id) {
    const b = (state.bookings || []).find(x => x.id === id);
    if (b) Object.assign(b, data);
  } else {
    state.bookings.push(Object.assign({ id: uid(), done: false }, data));
  }
  save();
  closeSheet();
  refresh();
  go("bookings");
  toast("تم حفظ الحجز");
  setTimeout(() => checkBookingAlerts(false), 500);
}
function toggleBookingDone(id) {
  const b = (state.bookings || []).find(x => x.id === id);
  if (!b) return;
  b.done = !b.done;
  save();
  refresh();
  toast(b.done ? "تم إنجاز الحجز ✓" : "أُعيد فتح الحجز");
}
function delBooking(id) {
  if (!confirm("حذف هذا الحجز؟")) return;
  const b = (state.bookings || []).find(x => x.id === id);
  if (b) putInBin("booking", b);
  state.bookings = (state.bookings || []).filter(x => x.id !== id);
  save();
  refresh();
  toast("تم حذف الحجز");
}
function sendBookingWhatsApp(id) {
  const b = (state.bookings || []).find(x => x.id === id);
  if (!b) return;
  const num = (b.clientId && clientPhone(b.clientId)) || accountantNum();
  let txt = `📅 حجز تصوير — ${b.title}\n📅 ${fmtDate(b.date)}${b.time ? " · ⏰ " + b.time : ""}\n`;
  if (b.client) txt += `👥 العميل: ${b.client}\n`;
  if (b.details) txt += `📝 ${b.details}\n`;
  txt += "— أُرسل عبر 📸 دفتر التصوير —";
  sendOrShare(num, "حجز تصوير", txt, b.client || b.title);
}

/* ---------- Photographer dues (مستحقات المصورين) ---------- */
function renderPhotographerDues() {
  const list = filtered("photographerDues").slice().sort((a, b) => (a.date < b.date ? 1 : -1));
  const total = list.reduce((a, x) => a + (Number(x.amount) || 0), 0);
  const t = $("#duesTotal");
  if (t) t.textContent = fmtMoney(total);
  const c = $("#duesCount");
  if (c) c.textContent = list.length ? `${list.length} بند مسجّل` : "لا يوجد مستحقات";
  const el = $("#duesList");
  if (!el) return;
  el.innerHTML = list.length ? list.map(d => `
    <div class="due-card">
      <div class="due-top">
        <div>
          <div class="due-name">${esc(d.name || "مصور")}</div>
          <div class="due-meta">
            <span>${ico("calendar")} ${fmtDate(d.date)}</span>
            ${d.type ? `<span class="due-type">🎬 ${esc(d.type)}</span>` : ""}
          </div>
        </div>
        <div class="due-amt">${fmtMoney(d.amount)}</div>
      </div>
      ${d.details ? `<div class="due-notes">${esc(d.details)}</div>` : ""}
      <div class="actions-inline">
        <button class="btn btn-dark btn-slim" onclick='showPhotographerDueModal("${d.id}")'>✏️ تعديل</button>
        <button class="rm" onclick='delPhotographerDue("${d.id}")'>حذف</button>
      </div>
    </div>`).join("") : `<div class="empty">لا توجد مستحقات. اضغط «+ مستحق» لتسجيل مبلغ مستحق لمصور.</div>`;
}
function showPhotographerDueModal(id) {
  const d = id ? (state.photographerDues || []).find(x => x.id === id) : null;
  openSheet(`
    <h2>${ico("hand")} ${d ? "تعديل المستحق" : "مستحق جديد لمصور"}</h2>
    <div class="field"><label>اسم المصور *</label><input id="pdName" value="${esc(d ? d.name : "")}" placeholder="مثال: أبو خالد"></div>
    <div class="field"><label>نوع التصوير</label><input id="pdType" value="${esc(d ? d.type : "")}" placeholder="مثال: فوتو / فيديو / مونتاج"></div>
    <div class="field-row">
      <div class="field"><label>تاريخ التصوير *</label><input id="pdDate" type="date" value="${d ? d.date : todayStr()}"></div>
      <div class="field"><label>المبلغ المستحق *</label><input id="pdAmount" type="number" inputmode="decimal" min="0" step="0.01" value="${d ? d.amount : ""}" placeholder="0"></div>
    </div>
    <div class="field"><label>ملاحظات</label><textarea id="pdDetails" placeholder="تفاصيل الفعالية، عدد الصور، ملاحظات أخرى...">${esc(d ? d.details : "")}</textarea></div>
    <button class="btn btn-primary btn-block" onclick="savePhotographerDue('${id || ""}')">${d ? "حفظ التعديل" : "حفظ المستحق"}</button>
  `);
}
function savePhotographerDue(id) {
  const name = $("#pdName").value.trim();
  if (!name) return toast("اكتب اسم المصور");
  const amount = parseFloat($("#pdAmount").value);
  if (!(amount > 0)) return toast("اكتب مبلغ صحيح");
  const data = {
    name,
    type: $("#pdType").value.trim(),
    date: $("#pdDate").value || todayStr(),
    amount,
    details: $("#pdDetails").value.trim()
  };
  if (!Array.isArray(state.photographerDues)) state.photographerDues = [];
  if (id) {
    const d = state.photographerDues.find(x => x.id === id);
    if (d) Object.assign(d, data);
  } else {
    state.photographerDues.push(Object.assign({ id: uid() }, data));
  }
  save();
  closeSheet();
  refresh();
  toast(id ? "تم حفظ التعديل" : "تم تسجيل المستحق");
}
function delPhotographerDue(id) {
  if (!confirm("حذف هذا المستحق؟")) return;
  const d = (state.photographerDues || []).find(x => x.id === id);
  if (d) putInBin("due", d);
  state.photographerDues = (state.photographerDues || []).filter(x => x.id !== id);
  save();
  refresh();
  toast("تم الحذف");
}

/* ---------- Selection mode ---------- */
function toggleSelectMode() {
  selectMode = !selectMode;
  if (!selectMode) selected.clear();
  renderOrders();
  renderSelectBar();
}
function cancelSelect() {
  selectMode = false;
  selected.clear();
  renderOrders();
  renderSelectBar();
}
function toggleSelect(id) {
  if (!selectMode) return;
  selected.has(id) ? selected.delete(id) : selected.add(id);
  renderOrders();
  renderSelectBar();
}
function renderSelectBar() {
  const bar = $("#selectBar");
  $("#selectCount").textContent = selected.size;
  bar.classList.toggle("show", selectMode && selected.size > 0);
}

/* ---------- WhatsApp: single & selected orders ---------- */
function accountantNum() {
  return (state.settings.accountant || "").replace(/\D/g, "");
}
function clientPhone(clientId) {
  const c = clientById(clientId);
  return c ? (c.phone || "").replace(/\D/g, "") : "";
}
async function shareText(title, text, label) {
  const plain = String(text || "");
  try {
    if (navigator.share) {
      await navigator.share({ title: title, text: plain });
      return true;
    }
  } catch (e) {
    if (e && e.name === "AbortError") return true;
  }
  try {
    if (navigator.clipboard) {
      await navigator.clipboard.writeText(plain);
      toast("تم نسخ النص — الصقه في واتساب أو أي تطبيق");
      return true;
    }
  } catch (_) {}
  const ta = document.createElement("textarea");
  ta.value = plain;
  ta.style.cssText = "position:fixed;opacity:0";
  document.body.appendChild(ta);
  ta.select();
  try { document.execCommand("copy"); toast("تم نسخ النص"); }
  catch (_) { toast("تعذر النسخ"); }
  document.body.removeChild(ta);
  return true;
}
/* واتساب إن توفّر رقم، وإلا مشاركة عامة */
function sendOrShare(num, title, text, label) {
  if (num) return openWhatsApp(num, text, label);
  return shareText(title, text, label);
}
function openWhatsApp(num, text, label) {
  toast(label ? "الذهاب لواتساب: " + label : "يتم فتح واتساب...");
  saveSettings(true);
  const url = "https://wa.me/" + num + "?text=" + encodeURIComponent(text);
  setTimeout(() => window.open(url, "_blank"), 250);
}

function buildOrdersReport(orderIds, title) {
  const orders = orderIds.map(id => state.orders.find(o => o.id === id)).filter(Boolean);
  if (!orders.length) return "";
  const s = state.settings;
  const company = s.company || "دفتر التصوير";
  const oSum = orders.reduce((a, x) => a + (Number(x.amount) || 0), 0);
  const pSum = orders.reduce((a, x) => a + paidForOrder(x.id), 0);
  const due = oSum - pSum;
  let txt = "";
  txt += `📸 ${title} — ${company}\n`;
  txt += `🕓 ${new Date().toLocaleString("ar-EG-u-nu-latn", { dateStyle: "long", timeStyle: "short" })}\n`;
  txt += "━━━━━━━━━━━━━━\n";
  txt += `📦 عدد الاوردرات: ${orders.length}\n`;
  txt += `💰 المطلوب: ${fmtMoney(oSum)}\n`;
  txt += `💵 المدفوع: ${fmtMoney(pSum)}\n`;
  txt += `📌 المتبقي: ${fmtMoney(due > 0 ? due : 0)}\n`;
  if (due < 0) txt += `⚠️ مدفوع أكبر من المطلوب: ${fmtMoney(Math.abs(due))}\n`;
  txt += "━━━━━━━━━━━━━━\n\n";
  orders.forEach((o, i) => {
    const paid = paidForOrder(o.id);
    const remain = Number(o.amount) - paid;
    txt += `${i + 1}) ${o.client} — ${fmtMoney(o.amount)}\n`;
    if (paid > 0) txt += `   💰 تم دفع ${fmtMoney(paid)}\n`;
    txt += `   📌 ${remain > 0 ? `متبقي ${fmtMoney(remain)}` : "مدفوع كامل ✓"}\n`;
    txt += `   📅 ${fmtDate(o.date)}`;
    if (o.service) txt += ` · ${o.service}`;
    txt += "\n";
    if (o.details) txt += `   📝 ${o.details}\n`;
    txt += "\n";
  });
  txt += "— أُرسل عبر 📸 دفتر التصوير —";
  return txt;
}

function sendOrderWhatsApp(id) {
  const o = state.orders.find(x => x.id === id);
  if (!o) return;
  const num = clientPhone(o.clientId) || accountantNum();
  sendOrShare(num, "اوردر", buildOrdersReport([id], "اوردر"), o.client);
}

function sendWhatsAppSelected() {
  if (!selected.size) { toast("اختر اوردرات أولاً"); return; }
  const ids = state.orders.filter(o => selected.has(o.id)).map(o => o.id);
  const phones = new Set(ids.map(id => {
    const o = state.orders.find(x => x.id === id);
    return o ? clientPhone(o.clientId) : "";
  }).filter(Boolean));
  let num, label;
  if (phones.size === 1) {
    num = [...phones][0];
    const o = state.orders.find(x => x.id === ids[0]);
    label = o ? o.client : "عميل";
  } else {
    num = accountantNum();
    label = "المحاسب";
  }
  sendOrShare(num, "مراجعة اوردرات", buildOrdersReport(ids, "مراجعة اوردرات"), label);
  cancelSelect();
}

/* ---------- PDF export ---------- */
function ordersForExport(orderIds) {
  return orderIds.map(id => state.orders.find(o => o.id === id)).filter(Boolean);
}

function wrapText(ctx, text, maxW) {
  const words = String(text).split(" ");
  const lines = [];
  let cur = "";
  for (const w of words) {
    const t = cur ? cur + " " + w : w;
    if (ctx.measureText(t).width > maxW && cur) {
      lines.push(cur);
      cur = w;
    } else {
      cur = t;
    }
  }
  if (cur) lines.push(cur);
  return lines;
}

/* ---------- الخط: تحميل خط ثمانية قبل الرسم ---------- */
const INVOICE_FONT = '"Thmanyah Sans", -apple-system, "SF Arabic", "Segoe UI", Arial, sans-serif';
function ensureInvoiceFont() {
  if (!document.fonts || !document.fonts.load) return Promise.resolve();
  const specs = ['400 24px "Thmanyah Sans"', '700 24px "Thmanyah Sans"', '900 34px "Thmanyah Sans"'];
  return Promise.all(specs.map(s => document.fonts.load(s).catch(() => null)))
    .then(() => (document.fonts.ready ? document.fonts.ready : null))
    .catch(() => null);
}
function rrPath(ctx, x, y, w, h, r) {
  const rr = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + rr, y);
  ctx.arcTo(x + w, y, x + w, y + h, rr);
  ctx.arcTo(x + w, y + h, x, y + h, rr);
  ctx.arcTo(x, y + h, x, y, rr);
  ctx.arcTo(x, y, x + w, y, rr);
  ctx.closePath();
}
function roundRect(ctx, x, y, w, h, r) {
  rrPath(ctx, x, y, w, h, r);
  ctx.fill();
}
function pill(ctx, x, y, w, h, text, fg, bg) {
  rrPath(ctx, x, y, w, h, h / 2);
  ctx.fillStyle = bg;
  ctx.fill();
  ctx.fillStyle = fg;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.font = '700 20px ' + INVOICE_FONT;
  ctx.fillText(text, x + w / 2, y + h / 2 + 1);
}

function buildInvoiceCanvas(orders, title) {
  const s = state.settings;
  const company = s.company || "دفتر التصوير";
  const oSum = orders.reduce((a, x) => a + (Number(x.amount) || 0), 0);
  const pSum = orders.reduce((a, x) => a + paidForOrder(x.id), 0);
  const due = oSum - pSum;

  const W = 1240;
  const LM = 64;
  const RM = 64;
  const contentW = W - LM - RM;
  const INK = "#0f172a", MUT = "#64748b", LINE = "#e8edf5", ALT = "#f7f9fc";
  const IND = "#4f46e5", VIO = "#7c3aed", CYA = "#0891b2", GRN = "#059669", AMB = "#b45309";

  const cols = [
    { key: "num", label: "#", w: 62, align: "center" },
    { key: "date", label: "التاريخ", w: 190, align: "center" },
    { key: "service", label: "الخدمة", w: 250, align: "right" },
    { key: "details", label: "التفاصيل", w: 0, align: "right" },
    { key: "amount", label: "المبلغ", w: 210, align: "center" },
    { key: "status", label: "الحالة", w: 210, align: "center" }
  ];
  const fixedW = cols.reduce((a, c) => a + c.w, 0);
  cols.find(c => c.key === "details").w = contentW - fixedW;
  const padX = 16;
  const headerH = 58;
  const bodyFontPx = 24;
  const lineH = bodyFontPx + 12;
  const cellPadV = 12;
  const bandH = 210;

  const singleClient = orders.every(o => o.clientId === orders[0].clientId) ? orders[0].client : null;

  const temp = document.createElement("canvas");
  temp.width = 2; temp.height = 2;
  const tctx = temp.getContext("2d");
  const setFont = (ctx, px, bold) => { ctx.font = (bold ? "700 " : "400 ") + px + "px " + INVOICE_FONT; };

  function cellLines(ctx, text, colW) {
    setFont(ctx, bodyFontPx, false);
    const maxW = colW - padX * 2;
    const words = String(text).split(" ");
    const lines = [];
    let cur = "";
    for (const w of words) {
      const t = cur ? cur + " " + w : w;
      if (ctx.measureText(t).width > maxW && cur) { lines.push(cur); cur = w; }
      else cur = t;
    }
    if (cur) lines.push(cur);
    return lines;
  }

  const statusOf = o => {
    const remain = Number(o.amount) - paidForOrder(o.id);
    return { text: remain <= 0 ? "مدفوع" : "غير مدفوع", paidOut: remain <= 0 };
  };

  const rows = orders.map((o, i) => {
    const st = statusOf(o);
    const cells = {
      num: [String(i + 1)],
      date: [fmtDate(o.date)],
      service: cellLines(tctx, o.service || "—", cols.find(c => c.key === "service").w),
      details: o.details ? cellLines(tctx, o.details, cols.find(c => c.key === "details").w) : ["—"],
      amount: [fmtMoney(o.amount)],
      status: [st.text],
      paidOut: st.paidOut
    };
    const maxLines = Math.max(1, ...cols.map(c => cells[c.key].length));
    return { cells, h: maxLines * lineH + cellPadV * 2, maxLines };
  });

  const sumH = 108;
  const rowsH = rows.reduce((a, r) => a + r.h, 0);
  const estH = bandH + 46 + sumH + 52 + 44 + headerH + rowsH + 150;
  const totalH = Math.max(estH, Math.floor(W * 297 / 210));

  const canvas = document.createElement("canvas");
  canvas.width = W;
  canvas.height = totalH;
  const ctx = canvas.getContext("2d");
  ctx.direction = "rtl";

  // خلفية
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, W, totalH);

  /* ===== ترويسة متدرّجة ===== */
  const g = ctx.createLinearGradient(0, 0, W, bandH);
  g.addColorStop(0, "#4f46e5");
  g.addColorStop(0.55, "#7c3aed");
  g.addColorStop(1, "#0891b2");
  rrPath(ctx, 0, 0, W, bandH + 38, 34);
  ctx.fillStyle = g;
  ctx.fill();
  ctx.fillRect(0, 0, W, 34);
  // توهج دائري خفيف
  const gl = ctx.createRadialGradient(W - 160, 40, 10, W - 160, 40, 260);
  gl.addColorStop(0, "rgba(255,255,255,.18)");
  gl.addColorStop(1, "rgba(255,255,255,0)");
  ctx.fillStyle = gl;
  ctx.fillRect(0, 0, W, bandH + 38);

  // العنوان
  ctx.textAlign = "right";
  ctx.textBaseline = "top";
  ctx.fillStyle = "#ffffff";
  setFont(ctx, 46, true);
  ctx.fillText(title + " — " + company, W - RM, 62);
  ctx.globalAlpha = 0.9;
  setFont(ctx, 24, false);
  ctx.fillText("دفتر التصوير · مستند مالي", W - RM, 118);
  ctx.globalAlpha = 1;

  // شريحة التاريخ (يسار)
  const dateTxt = new Date().toLocaleDateString("ar-EG-u-nu-latn", { day: "numeric", month: "long", year: "numeric" });
  setFont(ctx, 24, true);
  const dw = ctx.measureText(dateTxt).width + 46;
  rrPath(ctx, LM, 58, dw, 48, 24);
  ctx.fillStyle = "rgba(255,255,255,.18)";
  ctx.fill();
  ctx.strokeStyle = "rgba(255,255,255,.32)";
  ctx.lineWidth = 1;
  ctx.stroke();
  ctx.fillStyle = "#ffffff";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(dateTxt, LM + dw / 2, 83);

  let y = bandH + 46;

  // شريحة العميل
  if (singleClient) {
    const c2 = clientById(orders[0].clientId);
    const txt = "العميل: " + singleClient + (c2 && c2.phone ? "  ·  " + c2.phone : "");
    setFont(ctx, 28, true);
    const w2 = ctx.measureText(txt).width + 44;
    rrPath(ctx, W - RM - w2, y - 6, w2, 52, 26);
    ctx.fillStyle = "#eef2ff";
    ctx.fill();
    ctx.strokeStyle = "#c7d2fe";
    ctx.lineWidth = 2;
    ctx.stroke();
    ctx.fillStyle = IND;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(txt, W - RM - w2 / 2, y + 20);
    y += 62;
  }

  /* ===== بطاقات الملخّص ===== */
  const boxW = (contentW - 32) / 3;
  const summary = [
    { t: "إجمالي المطلوب", v: fmtMoney(oSum), c: IND, bar: "#4f46e5", bg: "#f5f7ff" },
    { t: "المدفوع", v: fmtMoney(pSum), c: GRN, bar: "#059669", bg: "#f2fdf7" },
    { t: "المتبقي", v: fmtMoney(due > 0 ? due : 0), c: due > 0 ? AMB : GRN, bar: due > 0 ? "#f59e0b" : "#059669", bg: due > 0 ? "#fffbeb" : "#f2fdf7" }
  ];
  summary.forEach((sm, i) => {
    const bx = W - RM - boxW - i * (boxW + 16);
    rrPath(ctx, bx, y, boxW, sumH, 20);
    ctx.fillStyle = sm.bg;
    ctx.fill();
    ctx.strokeStyle = "#e9eef6";
    ctx.lineWidth = 2;
    ctx.stroke();
    // شريط لوني جانبي
    rrPath(ctx, bx + boxW - 8, y + 14, 6, sumH - 28, 3);
    ctx.fillStyle = sm.bar;
    ctx.fill();
    ctx.textAlign = "right";
    ctx.textBaseline = "top";
    ctx.fillStyle = MUT;
    setFont(ctx, 23, false);
    ctx.fillText(sm.t, bx + boxW - 26, y + 20);
    ctx.fillStyle = sm.c;
    setFont(ctx, 32, true);
    ctx.fillText(sm.v, bx + boxW - 26, y + 52);
  });

  y += sumH + 46;

  /* ===== عنوان القسم ===== */
  ctx.textAlign = "right";
  ctx.textBaseline = "middle";
  ctx.fillStyle = INK;
  setFont(ctx, 32, true);
  ctx.fillText("تفاصيل الأوردرات (" + orders.length + ")", W - RM, y + 14);
  rrPath(ctx, W - RM - 8, y, 6, 30, 3);
  ctx.fillStyle = "#4f46e5";
  ctx.fill();
  ctx.fillStyle = "#a5b4fc";
  ctx.fillRect(W - RM - 210, y + 13, 194, 4);

  y += 46;
  const tableY = y;

  /* ===== الجدول ===== */
  let x = W - RM;
  const colRect = {};
  cols.forEach(c => {
    colRect[c.key] = { x: x - c.w, w: c.w };
    x -= c.w;
  });

  // ترويسة الجدول
  const gh = ctx.createLinearGradient(LM, 0, LM + contentW, 0);
  gh.addColorStop(0, IND);
  gh.addColorStop(1, VIO);
  rrPath(ctx, LM, tableY, contentW, headerH, 14);
  ctx.fillStyle = gh;
  ctx.fill();
  ctx.fillRect(LM, tableY + headerH - 14, contentW, 14);
  cols.forEach(c => {
    const r = colRect[c.key];
    ctx.fillStyle = "#ffffff";
    setFont(ctx, 25, true);
    ctx.textAlign = c.align === "center" ? "center" : "right";
    ctx.textBaseline = "middle";
    ctx.fillText(c.label, c.align === "center" ? r.x + r.w / 2 : r.x + r.w - padX, tableY + headerH / 2);
  });

  // الصفوف
  let ry = tableY + headerH;
  rows.forEach((r, idx) => {
    const bg = idx % 2 === 0 ? "#ffffff" : ALT;
    ctx.fillStyle = bg;
    ctx.fillRect(LM, ry, contentW, r.h);
    for (const k of cols.map(c => c.key)) {
      const rr = colRect[k];
      const align = cols.find(c => c.key === k).align;
      const lines = r.cells[k];
      if (k === "status") {
        const pw = 130;
        pill(ctx, rr.x + (rr.w - pw) / 2, ry + (r.h - 38) / 2, pw, 38, lines[0],
          r.cells.paidOut ? GRN : AMB,
          r.cells.paidOut ? "#dcfce7" : "#fef3c7");
        continue;
      }
      lines.forEach((ln, li) => {
        ctx.textBaseline = "top";
        if (k === "amount") ctx.fillStyle = IND;
        else if (k === "details") ctx.fillStyle = MUT;
        else if (k === "service") ctx.fillStyle = INK;
        else ctx.fillStyle = "#334155";
        setFont(ctx, bodyFontPx, k === "service" || k === "amount");
        if (align === "center") { ctx.textAlign = "center"; ctx.fillText(ln, rr.x + rr.w / 2, ry + cellPadV + li * lineH); }
        else { ctx.textAlign = "right"; ctx.fillText(ln, rr.x + rr.w - padX, ry + cellPadV + li * lineH); }
      });
    }
    ctx.strokeStyle = LINE;
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(LM, ry + r.h - 0.5);
    ctx.lineTo(LM + contentW, ry + r.h - 0.5);
    ctx.stroke();
    ry += r.h;
  });

  // إطار خارجي ناعم
  ctx.strokeStyle = "#e2e8f5";
  ctx.lineWidth = 2;
  ctx.strokeRect(LM, tableY, contentW, headerH + rowsH);

  /* ===== التذييل (يوضع بعد آخر صف حتى يظهر في صفحة الإخراج) ===== */
  const fy = ry + 46;
  const lg = ctx.createLinearGradient(LM, 0, LM + contentW, 0);
  lg.addColorStop(0, "#4f46e5");
  lg.addColorStop(0.5, "#7c3aed");
  lg.addColorStop(1, "#0891b2");
  rrPath(ctx, LM + contentW / 2 - 70, fy, 140, 5, 3);
  ctx.fillStyle = lg;
  ctx.fill();
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillStyle = "#94a3b8";
  setFont(ctx, 22, false);
  ctx.fillText("تم الإنشاء بواسطة دفتر التصوير", W / 2, fy + 34);
  ctx.fillStyle = "#cbd5e1";
  setFont(ctx, 20, false);
  ctx.fillText("هذا المستند مُولّد آلياً ولا يحتاج توقيع", W / 2, fy + 66);

  return {
    canvas,
    W,
    LM,
    RM,
    tableHeaderTop: tableY,
    headerH,
    rows,
    pagePxW: canvas.width,
    pagePxH: Math.floor(canvas.width * 297 / 210)
  };
}
function doExportPDF(orders, title) {
  const info = buildInvoiceCanvas(orders, title);
  const canvas = info.canvas;
  const { jsPDF } = window.jspdf;
  const doc = new jsPDF({ unit: "mm", format: "a4" });
  const pw = 210, ph = 297;
  const pagePxW = info.pagePxW;
  const pagePxH = info.pagePxH;
  const tableHeaderTop = info.tableHeaderTop;
  const headerH = info.headerH;
  const rows = info.rows;

  // Region above the body rows: title + dates + summary + table header
  const topBlockH = tableHeaderTop + headerH;

  // Where each body row starts on the tall canvas
  const rowT = [];
  let rt = topBlockH;
  rows.forEach(r => { rowT.push(rt); rt += r.h; });
  const lastRowBottom = rt;

  // Paginate at ROW boundaries (never split a row mid-way)
  const pageNumBandPx = Math.floor(pagePxW * 40 / pw);
  const pages = [];
  let i = 0;
  while (i < rows.length) {
    const isFirst = pages.length === 0;
    const avail = pagePxH - pageNumBandPx - (isFirst ? topBlockH : headerH) - 6;
    let used = 0, j = i;
    while (j < rows.length && used + rows[j].h <= avail) { used += rows[j].h; j++; }
    if (j === i) j = i + 1; // oversized single row: place alone
    pages.push({ start: i, end: j, isFirst });
    i = j;
  }
  if (pages.length === 0) pages.push({ start: 0, end: 0, isFirst: true });

  const FF = '"Thmanyah Sans", -apple-system, "SF Arabic", Arial, sans-serif';
  pages.forEach((p, idx) => {
    const tmp = document.createElement("canvas");
    tmp.width = pagePxW;
    tmp.height = pagePxH;
    const tc = tmp.getContext("2d");
    tc.fillStyle = "#ffffff";
    tc.fillRect(0, 0, pagePxW, pagePxH);
    let cy = 0;

    if (p.isFirst) {
      // page 1: title/summary/table header block + first rows
      tc.drawImage(canvas, 0, 0, pagePxW, topBlockH, 0, 0, pagePxW, topBlockH);
      cy = topBlockH;
    } else {
      // continuation pages: repeat the table header band at the top
      tc.drawImage(canvas, 0, tableHeaderTop, pagePxW, headerH, 0, 0, pagePxW, headerH);
      cy = headerH;
    }

    if (p.end > p.start) {
      const srcY = rowT[p.start];
      const srcH = rowT[p.end - 1] + rows[p.end - 1].h - srcY;
      tc.drawImage(canvas, 0, srcY, pagePxW, srcH, 0, cy, pagePxW, srcH);
    }

    // page number footer
    tc.textAlign = "center";
    tc.textBaseline = "middle";
    tc.font = "400 22px " + FF;
    tc.fillStyle = "#94a3b8";
    tc.fillText("صفحة " + (idx + 1) + " من " + pages.length, pagePxW / 2, pagePxH - 24);

    if (idx > 0) doc.addPage();
    doc.setFillColor(255, 255, 255);
    doc.rect(0, 0, pw, ph, "F");
    doc.addImage(tmp.toDataURL("image/jpeg", 0.95), "JPEG", 0, 0, pw, ph);
  });

  const name = "اوردر-" + (orders[0] ? orders[0].client : "فاتورة") + (orders.length > 1 ? "-x" + orders.length : "");
  toast("يتم إنشاء ملف PDF...");
  setTimeout(() => doc.save(name.replace(/\s+/g, "")), 120);
}

function exportOrdersPDF(orderIds, title) {
  const orders = ordersForExport(orderIds);
  if (!orders.length) { toast("لا يوجد اوردرات للتصدير"); return; }
  if (typeof window.jspdf === "undefined") {
    toast("جارٍ تحميل مكتبة PDF...");
    setTimeout(() => exportOrdersPDF(orderIds, title), 400);
    return;
  }
  // تقسيم تلقائي لتفادي تجاوز حد لوحة الرسم في المتصفح
  const CHUNK = 100;
  const chunks = [];
  for (let i = 0; i < orders.length; i += CHUNK) chunks.push(orders.slice(i, i + CHUNK));
  chunks.forEach((c, idx) => {
    const t = chunks.length > 1 ? title + " (" + (idx + 1) + "/" + chunks.length + ")" : title;
    setTimeout(() => {
      ensureInvoiceFont().then(() => {
        try { doExportPDF(c, t); }
        catch (e) { toast("تعذر إنشاء PDF: " + (e.message || "خطأ غير معروف")); }
      });
    }, idx * 800);
  });
}

function exportSelectedPDF() {
  if (!selected.size) { toast("اختر اوردرات أولاً"); return; }
  const ids = state.orders.filter(o => selected.has(o.id)).map(o => o.id);
  exportOrdersPDF(ids, "اوردرات مختارة");
}

/* ---------- Report & WhatsApp ---------- */
$("#reportRangeSeg").addEventListener("click", e => {
  const btn = e.target.closest("button");
  if (!btn) return;
  reportRange = btn.dataset.range;
  $$("#reportRangeSeg button").forEach(b => b.classList.toggle("active", b === btn));
  renderReport();
});

$("#reportStart").addEventListener("change", renderReport);
$("#reportEnd").addEventListener("change", renderReport);

function reportData() {
  if (reportRange === "custom") {
    const startVal = $("#reportStart").value;
    const endVal = $("#reportEnd").value;
    if (!startVal || !endVal) {
      return { orders: [], payments: [], label: "حدد التاريخين للفترة المخصصة" };
    }
    return {
      orders: state.orders.filter(o => o.date >= startVal && o.date <= endVal),
      payments: state.payments.filter(p => p.date >= startVal && p.date <= endVal),
      label: `من ${fmtDate(startVal)} إلى ${fmtDate(endVal)}`
    };
  }
  if (reportRange === "all") {
    return { orders: state.orders.slice(), payments: state.payments.slice(), label: "كل الفترات" };
  }
  const m = $("#monthFilter").value;
  if (!m || m === "all") {
    return { orders: state.orders.slice(), payments: state.payments.slice(), label: "كل الفترات" };
  }
  return {
    orders: state.orders.filter(o => inMonth(o.date, m)),
    payments: state.payments.filter(p => inMonth(p.date, m)),
    label: monthLabel(m)
  };
}

function inReportRange(dateStr) {
  if (reportRange === "custom") {
    const startVal = $("#reportStart").value;
    const endVal = $("#reportEnd").value;
    if (!startVal || !endVal) return true;
    return dateStr >= startVal && dateStr <= endVal;
  }
  if (reportRange === "all") return true;
  const m = $("#monthFilter").value;
  if (!m || m === "all") return true;
  return inMonth(dateStr, m);
}

function buildReport() {
  const d = reportData();
  const s = state.settings;
  const company = s.company || "دفتر التصوير";
  const oSum = d.orders.reduce((a, x) => a + (Number(x.amount) || 0), 0);
  const pSum = d.payments.reduce((a, x) => a + (Number(x.amount) || 0), 0);
  const due = oSum - pSum;

  let txt = "";
  txt += `📸 تقرير ${company}\n`;
  txt += `📅 الفترة: ${d.label}\n`;
  txt += `🕓 ${new Date().toLocaleString("ar-EG-u-nu-latn", { dateStyle: "long", timeStyle: "short" })}\n\n`;
  txt += "━━━━━━━━━━━━━━\n";
  txt += `📦 اجمالي الاوردرات: ${fmtMoney(oSum)}\n`;
  txt += `💰 المدفوعات: ${fmtMoney(pSum)}\n`;
  txt += `📌 المتبقي للتحصيل: ${fmtMoney(due > 0 ? due : 0)}\n`;
  if (due < 0) txt += `⚠️ مدفوعات زائدة عن الاوردرات: ${fmtMoney(Math.abs(due))}\n`;
  txt += "━━━━━━━━━━━━━━\n\n";

  if (oSum > 0 || d.orders.length) {
    let oLine = "";
    d.orders.forEach((o, i) => {
      const paid = state.payments.filter(p => p.orderId === o.id).reduce((a, p) => a + (Number(p.amount) || 0), 0);
      oLine += `${i + 1}) ${o.client} — ${fmtMoney(o.amount)}`;
      if (paid > 0) {
        oLine += paid >= Number(o.amount) ? " ✓ مدفوع" : ` (تدفع ${fmtMoney(paid)})`;
      }
      oLine += `\n   📅 ${fmtDate(o.date)}`;
      if (o.service) oLine += ` · ${o.service}`;
      if (o.details) oLine += `\n   📝 ${o.details}`;
      oLine += "\n";
    });
    if (oLine) txt += `📦 الاوردرات (${d.orders.length}):\n${oLine}\n`;
  }

  if (d.payments.length) {
    let pLine = "";
    d.payments.forEach((p, i) => {
      pLine += `${i + 1}) ${p.client}`;
      if (p.method) pLine += ` · ${p.method}`;
      pLine += ` — ${fmtMoney(p.amount)}`;
      pLine += `\n   📅 ${fmtDate(p.date)}`;
      if (p.details) pLine += ` · ${p.details}`;
      pLine += "\n";
    });
    txt += `💰 المدفوعات (${d.payments.length}):\n${pLine}\n`;
  }

  if (!d.orders.length && !d.payments.length) {
    txt += "لا توجد بيانات في هذه الفترة.\n";
  }
  txt += "\n— أُرسل عبر 📸 دفتر التصوير —";
  return txt;
}

function renderReport() {
  const wrap = $("#customDateRangeWrap");
  if (wrap) wrap.style.display = reportRange === "custom" ? "flex" : "none";
  const d = reportData();
  const oSum = d.orders.reduce((a, x) => a + (Number(x.amount) || 0), 0);
  const pSum = d.payments.reduce((a, x) => a + (Number(x.amount) || 0), 0);
  const due = oSum - pSum;
  const net = pSum;
  const rate = oSum > 0 ? Math.min(100, Math.round((pSum / oSum) * 100)) : 0;

  let html = `<div class="stats">
    <div class="stat total orders"><div class="lbl">📦 إجمالي الأوردرات · ${d.orders.length}</div><div class="val">${fmtMoney(oSum)}</div></div>
    <div class="stat ok"><div class="lbl">💰 المحصّل · ${d.payments.length}</div><div class="val">${fmtMoney(pSum)}</div></div>
    <div class="stat due"><div class="lbl">${ico("target")} المتبقي للتحصيل</div><div class="val">${fmtMoney(due > 0 ? due : 0)}</div></div>
    <div class="stat ${net >= 0 ? "ok" : "exp"}"><div class="lbl">${ico("chart")} صافي الربح</div><div class="val">${fmtMoney(net)}</div></div>
    <div class="stat"><div class="lbl">🎯 نسبة التحصيل</div><div class="val">${rate}<small>%</small></div></div>
  </div>`;

  const bySvc = {};
  d.orders.forEach(o => {
    const k = (o.service || "بدون تصنيف").trim() || "بدون تصنيف";
    if (!bySvc[k]) bySvc[k] = { n: 0, sum: 0 };
    bySvc[k].n++;
    bySvc[k].sum += Number(o.amount) || 0;
  });
  const keys = Object.keys(bySvc).sort((a, b) => bySvc[b].sum - bySvc[a].sum);
  if (keys.length) {
    const max = Math.max(...keys.map(k => bySvc[k].sum), 1);
    html += `<div class="section-title">🗂️ حسب نوع الخدمة</div><div class="rep-card">` +
      keys.map(k => {
        const pct = Math.round((bySvc[k].sum / max) * 100);
        return `<div class="svc-row">
          <div class="svc-top"><span>${esc(k)}</span><span class="svc-meta">${bySvc[k].n} · ${fmtMoney(bySvc[k].sum)}</span></div>
          <div class="svc-bar"><div class="svc-fill" style="width:${pct}%"></div></div>
        </div>`;
      }).join("") + `</div>`;
  }

  $("#reportSummary").innerHTML = html;
}

async function copyReport() {
  try {
    await navigator.clipboard.writeText(buildReport());
    toast("تم نسخ التقرير");
  } catch (e) {
    const ta = document.createElement("textarea");
    ta.value = buildReport();
    document.body.appendChild(ta);
    ta.select();
    document.execCommand("copy");
    document.body.removeChild(ta);
    toast("تم نسخ التقرير");
  }
}

function sendWhatsApp() {
  const num = accountantNum();
  sendOrShare(num, "تقرير دفتر التصوير", buildReport(), "التقرير");
}
function shareReport() {
  shareText("تقرير دفتر التصوير", buildReport(), "التقرير");
}

/* ---------- الوضع التجريبي (بيانات وهمية) ---------- */
const DEMO_NAMES = ["أم محمد", "خالد الحربي", "نورة القحطاني", "عبدالله المطيري", "سارة الزهراني", "فهد العتيبي", "مريم الدوسري", "ياسر الشمري"];
const DEMO_SVC = ["تصوير زفاف", "جلسة عائلية", "تصوير منتجات", "تغطية فعالية", "باقة تصوير"];
function isoOffset(days) {
  const d = new Date();
  d.setDate(d.getDate() - days);
  return d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0");
}
function seedDemoData() {
  const clients = DEMO_NAMES.map((n, i) => ({ id: uid(), name: n, phone: "05" + String(10000000 + i * 1357), details: i % 3 === 0 ? "عميل دائم" : "", demo: true }));
  const orders = [], payments = [], bookings = [], dues = [], ledger = [];
  for (let i = 0; i < 26; i++) {
    const c = clients[i % clients.length];
    const days = i * 4 + (i % 3);
    const amount = 900 + ((i * 617) % 2400);
    const oid = uid();
    orders.push({ id: oid, client: c.name, clientId: c.id, amount, service: DEMO_SVC[i % DEMO_SVC.length], date: isoOffset(days), details: i % 2 ? "" : "تفاصيل تجريبية — موقع التصوير", demo: true });
    if (i % 3 !== 2) {
      const pay = Math.round(amount * (i % 4 === 0 ? 1 : 0.5) / 50) * 50;
      if (pay > 0) payments.push({ id: uid(), client: c.name, amount: pay, method: ["نقدي", "تحويل بنكي", "شبكة", "آبل باي"][i % 4], date: isoOffset(Math.max(0, days - 3)), orderId: oid, details: "", demo: true });
    }
  }
  for (let i = 0; i < 5; i++) {
    const c = clients[i % clients.length];
    bookings.push({ id: uid(), clientId: c.id, client: c.name, title: ["حفل زفاف", "جلسة عائلية", "تصوير منتجات", "تغطيةogramas", "معرض صور"][i], date: isoOffset(-(i * 3)), time: ["10:00", "14:30", "17:00", "19:00", "12:00"][i], remind: "day", done: i > 2, details: "", demo: true });
  }
  for (let i = 0; i < 4; i++) {
    dues.push({ id: uid(), name: ["مصوّر者がك", "مصوّر فيديو", "محرّر صور", "مصوّر منتجات"][i], type: ["فوتو", "فيديو", "مونتاج", "منتجات"][i], amount: 400 + i * 250, date: isoOffset(i * 6), details: "", demo: true });
  }
  for (let i = 0; i < 3; i++) {
    const c = clients[i];
    ledger.push({ id: uid(), clientId: c.id, client: c.name, title: ["سلفة نقدية", "معدات", "أجرة مصور مساعد"][i], amount: 300 + i * 400, paid: i === 0 ? 300 : 0, date: isoOffset(i * 9), details: "", demo: true });
  }
  state.clients = state.clients.concat(clients);
  state.orders = state.orders.concat(orders);
  state.payments = state.payments.concat(payments);
  state.bookings = state.bookings.concat(bookings);
  state.photographerDues = state.photographerDues.concat(dues);
  state.ledger = state.ledger.concat(ledger);
  if (!state.settings.targetGoal) state.settings.targetGoal = 25000;
  state.settings.demoSeen = true;
  saveNow();
  renderAll();
  toast("تم تحميل بيانات تجريبية للتجربة");
}
function clearDemoData() {
  const n = ["clients", "orders", "payments", "bookings", "photographerDues", "ledger"].reduce((a, k) => a + (state[k] || []).filter(x => x.demo).length, 0);
  if (!n) return toast("لا توجد بيانات تجريبية");
  if (!confirm("حذف البيانات التجريبية (" + n + " سجل)؟ بياناتك الحقيقية لا تُمس.")) return;
  ["clients", "orders", "payments", "bookings", "photographerDues", "ledger"].forEach(k => {
    state[k] = (state[k] || []).filter(x => !x.demo);
  });
  state.bin = (state.bin || []).filter(b => !b.item || !b.item.demo);
  saveNow();
  renderAll();
  toast("تم حذف البيانات التجريبية");
}
function renderAbout() {
  const box = $("#aboutBox");
  if (!box) return;
  const counts = {
    clients: state.clients.length, orders: state.orders.length, payments: state.payments.length,
    bookings: state.bookings.length, dues: (state.photographerDues || []).length, ledger: (state.ledger || []).length
  };
  const hasDemo = ["clients", "orders", "payments", "bookings", "photographerDues", "ledger"].some(k => (state[k] || []).some(x => x.demo));
  const firstSeen = state.settings.firstSeen || (state.settings.firstSeen = todayStr());
  box.innerHTML = `
    <div class="about-hero">
      <div class="about-logo">${ico("camera")}</div>
      <div>
        <div class="about-name">دفتر التصوير</div>
        <div class="about-ver">الإصدار ${APP_VER} · يعمل بدون إنترنت</div>
      </div>
    </div>
    <div class="about-sec">
      <div class="about-h">${ico("sparkle")} ماذا يقدّم؟</div>
      <ul class="about-list">
        <li>تسجيل الاوردرات والتحصيل وربط الدفعات تلقائياً بالمتبقي.</li>
        <li>بطاقة عميل كاملة: اوردرات، مديونية، PDF، ومشاركة مباشرة.</li>
        <li>حجوزات مع تنبيهات على الجوال قبل الموعد بيوم.</li>
        <li>مستحقات المصورين، تقارير لكل فترة، وتصدير Excel.</li>
        <li>نسخ احتياطي يومي داخل الجهاز + نسخة مشفّرة اختيارية.</li>
        <li>قفل برقم سري، هدف شهري، ومخططات تحليلية.</li>
      </ul>
    </div>
    <div class="about-sec">
      <div class="about-h">${ico("shield")} الخصوصية والأمان</div>
      <p class="about-p">${ico("check")} كل بياناتك تُحفظ <b>محلياً على جهازك فقط</b> — لا خادم ولا حساب ولا تتبّع ولا تحليلات.</p>
      <p class="about-p">${ico("check")} لا يخرج أي بيان من جهازك إلا بضغطة منك (مشاركة أو نسخة احتياطية).</p>
      <p class="about-p">${ico("check")} نسخة التشفير (AES-256) اختيارية وت ملف النسخة بكلمة مرور.</p>
      <p class="about-p">${ico("check")} الصلاحيات المستخدمة: <b>الإشعارات</b> (اختياري لحجوزاتك) و<b>التخزين</b> لحفظ بياناتك. الخط يُحمّل من شبكة خارجية للخطوط فقط.</p>
      <p class="about-p about-warn">${ico("bell")} على آيفون: ثبّت التطبيق على الشاشة الرئيسية وإلا قد يمنع سفاري التخزين والإشعارات.</p>
    </div>
    <div class="about-sec">
      <div class="about-h">${ico("download")} بياناتك</div>
      <div class="about-mini">${ico("box")} ${counts.orders} اوردر · ${ico("wallet")} ${counts.payments} دفعة · ${ico("users")} ${counts.clients} عميل · ${ico("calendar")} ${counts.bookings} حجز</div>
      <div class="about-mini">${ico("target")} ${counts.dues} مستحق · ${ico("file")} ${counts.ledger} بند مديونية · ${ico("clock")}تاريخ الاستخدام:  ${firstSeen}</div>
    </div>
    <div class="about-sec">
      <div class="about-h">${ico("sparkle")} جرّب قبل ما تستخدم</div>
      <p class="about-p">حمّل بيانات وهمية لتجربة كل الأقسام بدون  على بياناتك الحقيقية، وامسحها بضغطة.</p>
      <div class="actions">
        ${hasDemo
          ? `<button class="btn btn-danger" onclick="clearDemoData()">${ico("trashBin")} حذف البيانات التجريبية</button>`
          : `<button class="btn btn-primary" onclick="seedDemoData()">${ico("plus")} تحميل بيانات تجريبية</button>`}
      </div>
    </div>`;
  hydrateIcons(box);
}

/* ---------- نسخ مشفّرة (AES-GCM + PBKDF2) ---------- */
const ENC_TAG = "PLENC1:";
function b64(buf) {
  const b = new Uint8Array(buf);
  let s = "";
  for (let i = 0; i < b.length; i += 32768) s += String.fromCharCode.apply(null, b.subarray(i, i + 32768));
  return btoa(s);
}
function unb64(s) {
  const bin = atob(s);
  const a = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) a[i] = bin.charCodeAt(i);
  return a;
}
async function encKey(pass, salt) {
  const km = await crypto.subtle.importKey("raw", new TextEncoder().encode(pass), "PBKDF2", false, ["deriveKey"]);
  return crypto.subtle.deriveKey({ name: "PBKDF2", salt: salt, iterations: 200000, hash: "SHA-256" },
    km, { name: "AES-GCM", length: 256 }, false, ["encrypt", "decrypt"]);
}
async function encryptText(text, pass) {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const key = await encKey(pass, salt);
  const ct = await crypto.subtle.encrypt({ name: "AES-GCM", iv: iv }, key, new TextEncoder().encode(text));
  return ENC_TAG + b64(salt) + "." + b64(iv) + "." + b64(ct);
}
async function decryptText(payload, pass) {
  const parts = payload.trim().replace(ENC_TAG, "").split(".");
  if (parts.length !== 3) throw new Error("bad format");
  const key = await encKey(pass, unb64(parts[0]));
  const pt = await crypto.subtle.decrypt({ name: "AES-GCM", iv: unb64(parts[1]) }, key, unb64(parts[2]));
  return new TextDecoder().decode(pt);
}
async function exportEncrypted() {
  if (!window.crypto || !crypto.subtle) return toast("التشفير يحتاج اتصال HTTPS");
  const pass = ($("#encPass") && $("#encPass").value) || "";
  if (pass.length < 4) return toast("اكتب كلمة مرور من 4 أحرف على الأقل");
  flushSave();
  try {
    const blob = await encryptText(JSON.stringify(state), pass);
    exportFile("نسخة-مشفرة-دفتر-التصوير.txt", "text/plain;charset=utf-8", blob);
    toast("تم إنشاء نسخة مشفّرة ✓");
  } catch (e) {
    toast("تعذر التشفير: " + (e.message || "خطأ"));
  }
}
async function importEncrypted() {
  if (!window.crypto || !crypto.subtle) return toast("فك التشفير يحتاج اتصال HTTPS");
  const txt = ($("#importBox") && $("#importBox").value || "").trim();
  const pass = ($("#encPass") && $("#encPass").value) || "";
  if (!txt) return toast("الصق النسخة المشفّرة في صندوق الاسترجاع");
  if (txt.indexOf(ENC_TAG) !== 0) return toast("هذه ليست نسخة مشفّرة — استخدم «استرجاع البيانات» للنص العادي");
  if (!pass) return toast("اكتب كلمة المرور");
  try {
    applyImportedJSON(await decryptText(txt, pass));
  } catch (e) {
    toast("فشل فك التشفير — كلمة المرور غير صحيحة");
  }
}
function exportFile(name, mime, content) {
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  setTimeout(() => { URL.revokeObjectURL(url); a.remove(); }, 400);
}

function csvCell(v) {
  let s = String(v == null ? "" : v).replace(/\s+/g, " ");
  return /[",\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
}

function exportCSV() {
  const rows = [];
  rows.push(["النوع", "التاريخ", "الاسم/التصنيف", "الخدمة/الطريقة", "المبلغ", "ملاحظات"].map(csvCell).join(","));
  const d = reportData();
  d.orders.forEach(o => rows.push(["اوردر", o.date, o.client, o.service || "", o.amount, o.details || ""].map(csvCell).join(",")));
  d.payments.forEach(p => rows.push(["دفعة", p.date, p.client, p.method || "", p.amount, p.details || ""].map(csvCell).join(",")));
  (state.ledger || []).filter(l => inReportRange(l.date)).forEach(l => rows.push(["بند مديونية", l.date, l.client, l.title || "", l.amount, "مسدد: " + (Number(l.paid) || 0) + (l.details ? " · " + l.details : "")].map(csvCell).join(",")));
  (state.bookings || []).filter(b => inReportRange(b.date)).forEach(b => rows.push(["حجز", b.date + (b.time ? " " + b.time : ""), b.client || "", b.title || "", b.done ? "تم" : "مجدول", b.details || ""].map(csvCell).join(",")));
  const b = "\uFEFF" + rows.join("\r\n");
  exportFile("تقرير-الاوردرات.csv", "text/csv;charset=utf-8", b);
  toast("تم تصدير ملف Excel (CSV) حسب الفترة المحددة");
}

function exportJSON() {
  saveSettings();
  state.settings.lastBackup = Date.now();
  save();
  const txt = JSON.stringify(state, null, 1);
  exportFile("نسخة-احتياطية-دفتر-التصوير.txt", "text/plain;charset=utf-8", txt);
  toast("تم تصدير النسخة الاحتياطية");
}

function applyImportedJSON(d) {
  if (!d || !Array.isArray(d.orders) || !Array.isArray(d.payments)) {
    toast("ملف غير صالح");
    return false;
  }
  if (!confirm("سيتم استبدال البيانات الحالية. متابعة؟")) return false;
  state = migrate(d);
  saveNow();
  const box = $("#importBox");
  if (box) box.value = "";
  renderAll();
  toast("تم استرجاع البيانات ✓");
  return true;
}
function importJSON() {
  const txt = ($("#importBox") && $("#importBox").value || "").trim();
  if (!txt) return toast("الصق النص الاحتياطي أولاً");
  try {
    applyImportedJSON(JSON.parse(txt));
  } catch (e) {
    toast("النص غير صالح");
  }
}
function restorePreWipe() {
  const d = readKey(LS_PREWIPE);
  if (!d) return toast("لا توجد نسخة محفوظة قبل المسح");
  if (!confirm("استرجاع البيانات المحفوظة قبل آخر مسح؟")) return;
  state = migrate(d);
  saveNow();
  renderAll();
  toast("تمت استعادة البيانات قبل المسح ✓");
}

function confirmClear() {
  if (!confirm("حذف كل البيانات نهائياً؟ لا يمكن التراجع!")) return;
  if (!confirm("تأكيد أخير: هل أنت متأكد تماماً؟")) return;
  try {
    localStorage.setItem(LS_PREWIPE, JSON.stringify(state));
    exportFile("قبل-المسح-دفتر-التصوير.json", "application/json", JSON.stringify(state));
  } catch (_) {}
  state = { dataVer: DATA_VER, orders: [], payments: [], clients: [], ledger: [], bookings: [], photographerDues: [], bin: [], settings: state.settings };
  saveNow();
  renderAll();
  toast("تم مسح كل البيانات — نسخة احتياطية أُنشئت قبل المسح");
}

/* ---------- التثبيت + التحديث + التشخيص ---------- */
let deferredPrompt = null, reloading = false;
window.addEventListener("beforeinstallprompt", e => {
  e.preventDefault();
  deferredPrompt = e;
  const b = $("#installBtn");
  if (b) b.textContent = "📲 تثبيت التطبيق على الجهاز";
  updateDiag();
});
window.addEventListener("appinstalled", () => {
  deferredPrompt = null;
  toast("تم تثبيت التطبيق ✓");
  updateDiag();
});
function isStandalone() {
  return !!navigator.standalone || (window.matchMedia && window.matchMedia("(display-mode: standalone)").matches);
}
function showUpdateBanner() {
  const b = $("#updateBanner");
  if (b) b.style.display = "flex";
}
function applyUpdate() {
  const b = $("#updateBanner");
  if (b) b.style.display = "none";
  flushSave();
  if (navigator.serviceWorker && navigator.serviceWorker.getRegistration) {
    navigator.serviceWorker.getRegistration().then(reg => {
      if (reg && reg.waiting) reg.waiting.postMessage({ type: "SKIP_WAITING" });
      else if (reg) reg.update();
    }).catch(() => {});
  }
  setTimeout(() => location.reload(), 1500);
}
function installApp() {
  if (isStandalone()) return toast("التطبيق مثبت بالفعل ✓");
  if (deferredPrompt) {
    deferredPrompt.prompt();
    deferredPrompt.userChoice.finally(() => { deferredPrompt = null; updateDiag(); });
    return;
  }
  alert("للتثبيت: من سفاري اضغط زر المشاركة (⬆️) ثم «إضافة إلى الشاشة الرئيسية».\nومن كروم: اضغط ⋮ ثم «تثبيت التطبيق».");
}
function kb(n) {
  if (!n) return "0 KB";
  return n > 1048576 ? (n / 1048576).toFixed(1) + " MB" : Math.round(n / 1024) + " KB";
}
function updateDiag() {
  const box = $("#diagBox");
  if (!box) return;
  const snaps = snapshots();
  const lastSnap = snaps.length ? snaps[snaps.length - 1].replace(SNAP_PREFIX, "") : "—";
  const rows = [
    ["الإصدار", APP_VER],
    ["نسخة البيانات", "v" + (state.dataVer || 1)],
    ["السجلات", state.orders.length + " اوردر · " + state.payments.length + " دفعة · " + state.clients.length + " عميل"],
    ["اللقطات اليومية", snaps.length + " (" + lastSnap + ")"],
    ["آخر نسخة احتياطية", state.settings.lastBackup ? fmtDate(new Date(state.settings.lastBackup).toISOString().slice(0, 10)) : "لا يوجد"],
    ["التطبيق مثبت", isStandalone() ? "نعم" : "لا"],
    ["إشعارات الحجوزات", notifyLabel()],
    ["حجم البيانات", kb((JSON.stringify(state) || "").length)],
    ["أخطاء مسجلة", String(errorLog.length)]
  ];
  box.innerHTML = rows.map(r => `<div class="dk">${r[0]}</div><div class="dv">${esc(r[1])}</div>`).join("");
}
function copyDiagnostics() {
  const txt = "دفتر التصوير — تقرير فني\nالإصدار: " + APP_VER + "\nالبيانات: v" + (state.dataVer || 1) +
    "\nالسجلات: " + state.orders.length + " اوردر، " + state.payments.length + " دفعة، " + state.clients.length + " عميل" +
    "\nاللقطات: " + snapshots().length + "\nآخر نسخة: " + (state.settings.lastBackup || "لا يوجد") +
    "\nالأخطاء: " + (errorLog.length ? errorLog.map(e => e.t + " " + e.m).join(" | ") : "لا يوجد");
  navigator.clipboard ? navigator.clipboard.writeText(txt).then(() => toast("تم نسخ التقرير الفني ✓"), () => toast("تعذر النسخ"))
    : toast("غير مدعوم على هذا المتصفح");
}

/* ---------- Service worker / offline ---------- */
if ("serviceWorker" in navigator && location.protocol.indexOf("http") === 0) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("sw.js")
      .then(reg => { watchSW(reg); updateDiag(); })
      .catch(() => {});
  });
  navigator.serviceWorker.addEventListener("controllerchange", () => {
    if (reloading) return;
    reloading = true;
    location.reload();
  });
}