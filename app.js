"use strict";
const LS_KEY = "photographer_ledger_v1";
const $ = s => document.querySelector(s);
const $$ = s => [...document.querySelectorAll(s)];

let state = load();
let reportRange = "month";
let selectMode = false;
let selected = new Set();

function load() {
  let base = { orders: [], payments: [], expenses: [], clients: [], ledger: [], bookings: [], settings: {} };
  try {
    const raw = localStorage.getItem(LS_KEY);
    if (raw) {
      const d = JSON.parse(raw);
      base = Object.assign(base, d);
    }
  } catch (e) {}
  if (!Array.isArray(base.clients)) base.clients = [];
  if (!Array.isArray(base.ledger)) base.ledger = [];
  if (!Array.isArray(base.bookings)) base.bookings = [];
  base.clients.forEach(c => {
    c.name = (c.name || "").trim();
    if (!c.name) c.name = "عميل";
    if (!c.phone) c.phone = "";
    if (!c.details) c.details = "";
  });
  const nameToId = {};
  base.clients.forEach(c => { nameToId[c.name] = c.id; });
  base.orders.forEach(o => {
    if (!o.clientId) {
      const nm = (o.client || "").trim() || "عميل";
      let cid = nameToId[nm];
      if (!cid) {
        cid = uid();
        base.clients.push({ id: cid, name: nm, phone: "", details: "" });
        nameToId[nm] = cid;
      }
      o.clientId = cid;
    }
    if (!o.client) {
      const c = base.clients.find(x => x.id === o.clientId);
      o.client = c ? c.name : "عميل";
    }
  });
  return base;
}
function save() {
  localStorage.setItem(LS_KEY, JSON.stringify(state));
}
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
const APP_VER = "v16";
try {
  const av = document.querySelector("#appVer");
  if (av) av.textContent = "الإصدار " + APP_VER;
} catch (_) {}
window.addEventListener("error", e => {
  try {
    const m = "⚠️ خطأ: " + (e.message || "غير معروف");
    const av = document.querySelector("#appVer");
    if (av) av.textContent = m;
    toast(m);
  } catch (_) {}
});

/* ---------- Navigation ---------- */
function go(which) {
  if (which !== "orders") {
    selectMode = false;
    selected.clear();
  }
  $$("nav button").forEach(b => b.classList.toggle("active", b.dataset.nav === which));
  $$(".screen").forEach(s => s.classList.toggle("active", s.id === "screen-" + which));
  refresh();
  window.scrollTo({ top: 0 });
}
$$("nav button").forEach(b => b.addEventListener("click", () => go(b.dataset.nav)));

/* ---------- Month filter ---------- */
function buildMonths() {
  const set = new Set();
  ["orders", "payments", "expenses"].forEach(k => state[k].forEach(x => set.add(monthOf(x.date))));
  set.add(currentMonth());
  const months = [...set].filter(Boolean).sort().reverse();
  const sel = $("#monthFilter");
  if (!months.length) months.push(currentMonth());
  sel.innerHTML = months.map(m => `<option value="${m}">${monthLabel(m)}</option>`).join("") +
    `<option value="all">كل الفترات</option>`;
  if (!sel.value) sel.value = currentMonth();
}
function monthLabel(m) {
  try {
    const d = new Date(m + "-01T12:00:00");
    return d.toLocaleDateString("ar-EG-u-nu-latn", { month: "long", year: "numeric" });
  } catch (e) { return m; }
}
$("#monthFilter").addEventListener("change", refresh);

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

function renderHome() {
  const o = totals("orders");
  const p = totals("payments");
  const e = totals("expenses");
  const due = o - p;
  const m = $("#monthFilter").value;
  const pb = $("#privacyBtn");
  if (pb) pb.textContent = state.settings.hideAmounts ? "🙈" : "👁️";
  let html = `
    <div class="stat total orders"><div class="lbl">📦 اجمالي الاوردرات</div><div class="val">${privMoney(o)}</div></div>
    <div class="stat ok"><div class="lbl">💰 المدفوعات</div><div class="val">${privMoney(p)}</div></div>
    <div class="stat exp"><div class="lbl">🧾 المصروفات</div><div class="val">${privMoney(e)}</div></div>
    <div class="stat due"><div class="lbl">📌 المتبقي للتحصيل</div><div class="val">${privMoney(due > 0 ? due : 0)}</div></div>`;
  if (due < 0) {
    html += `<div class="stat note">ملاحظة: مدفوعات أكثر من الاوردرات بمقدار ${privMoney(Math.abs(due))}</div>`;
  }
  $("#homeStats").innerHTML = html;

  const mm = m;
  const pickArr = arr => (mm === "all" || !mm ? arr : arr.filter(x => inMonth(x.date, mm)));
  const items = [];
  pickArr(state.payments).forEach(x => items.push({ t: "💰", d: x.date, client: x.client, amount: x.amount, extra: x.method || "", cls: "pay" }));
  pickArr(state.orders).forEach(x => items.push({ t: "📦", d: x.date, client: x.client, amount: x.amount, extra: x.service || "", cls: "orders" }));
  pickArr(state.expenses).forEach(x => items.push({ t: "🧾", d: x.date, client: x.category, amount: -x.amount, extra: x.details || "", cls: "exp" }));
  items.sort((a, b) => (a.d < b.d ? 1 : -1));
  $("#recentCount").textContent = items.length;
  $("#recentList").innerHTML = items.length ? items.slice(0, 10).map(i => `
    <div class="item ${i.cls}">
      <div class="top">
        <div>
          <div class="name">${i.t} ${esc(i.client)}</div>
          <div class="meta">${fmtDate(i.d)}${i.extra ? " · " + esc(i.extra) : ""}</div>
        </div>
        <div class="amt">${state.settings.hideAmounts ? "••••" : ((i.amount < 0 ? "-" : "") + fmtMoney(Math.abs(i.amount)))}</div>
      </div>
    </div>`).join("")
    : `<div class="empty">لا توجد عمليات${mm === "all" ? "" : " لهذا الشهر"}.</div>`;
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
    <div class="item pressable ${selectMode ? "selectable" : "tappable"} ${isSel ? "selecting" : ""}" ontouchstart='pressStart(event,"order","${o.id}")' ontouchend='pressEnd(event)' ontouchmove='pressCancel()' onmousedown='pressStart(event,"order","${o.id}")' onmouseup='pressEnd(event)' onmouseleave='pressCancel()' onclick='pressTap(event,"order","${o.id}")' oncontextmenu='return false'>
      <div class="top">
        <div>
          <div class="name">📦 ${esc(o.client)}</div>
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
  }).join("") : `<div class="empty">لا توجد اوردرات.</div>`;
}

function renderPayments() {
  const list = filtered("payments");
  $("#paymentsList").innerHTML = list.length ? list.slice().reverse().map(p => {
    const order = state.orders.find(o => o.id === p.orderId);
    return `
    <div class="item pay">
      <div class="top">
        <div>
          <div class="name">💰 ${esc(p.client)}</div>
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
  }).join("") : `<div class="empty">لا توجد مدفوعات مسجلة.</div>`;
}

function renderExpenses() {
  const list = filtered("expenses");
  $("#expensesList").innerHTML = list.length ? list.slice().reverse().map(x => `
    <div class="item exp">
      <div class="top">
        <div>
          <div class="name">🧾 ${esc(x.category)}</div>
          <div class="meta">
            <span>${fmtDate(x.date)}</span>
            ${x.paidBy ? `<span class="badge">دفعها: ${esc(x.paidBy)}</span>` : ""}
          </div>
        </div>
        <div class="amt">${fmtMoney(x.amount)}</div>
      </div>
      ${x.details ? `<div class="details">${esc(x.details)}</div>` : ""}
      <div class="actions-inline">
        <button class="btn btn-dark btn-slim" onclick='showExpenseModal("${x.id}")'>✏️ تعديل</button>
        <button class="rm" onclick='delExpense("${x.id}")'>حذف</button>
      </div>
    </div>`).join("") : `<div class="empty">لا توجد مصروفات مسجلة.</div>`;
}

function renderClients() {
  let list = state.clients.slice().sort((a, b) => a.name.localeCompare(b.name, "ar"));
  const q = ($("#clientSearch") && $("#clientSearch").value || "").trim();
  if (q) list = list.filter(c => (c.name || "").includes(q) || (c.phone || "").includes(q));
  $("#clientsList").innerHTML = list.length ? list.map(c => {
    const t = clientTotals(c.id);
    return `
    <div class="item tappable pressable" ontouchstart='pressStart(event,"client","${c.id}")' ontouchend='pressEnd(event)' ontouchmove='pressCancel()' onmousedown='pressStart(event,"client","${c.id}")' onmouseup='pressEnd(event)' onmouseleave='pressCancel()' onclick='pressTap(event,"client","${c.id}")' oncontextmenu='return false'>
      <div class="top">
        <div>
          <div class="name">👥 ${esc(c.name)}</div>
          <div class="meta">
            <span>${t.count} اوردر</span>
            ${c.phone ? `<span class="badge">📱 ${esc(c.phone)}</span>` : ""}
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
  $("#setAccountant").value = s.accountant || "";
  $("#setCompany").value = s.company || "";
  $("#setCurrency").value = s.currency || "ر.س";
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

function saveSettings() {
  state.settings.accountant = $("#setAccountant").value.replace(/\D/g, "");
  state.settings.company = $("#setCompany").value.trim();
  state.settings.currency = $("#setCurrency").value.trim() || "ر.س";
  save();
  toast("تم حفظ الإعدادات");
  refresh();
}

/* --- Modals sheet stack: back returns to previous --- */
let sheetStack = [];

function refresh() {
  buildMonths();
  renderHome();
  renderClients();
  renderOrders();
  renderPayments();
  renderExpenses();
  renderBookings();
  renderReport();
  fillSettings();
  renderSelectBar();
  rebuildSheets();
}
refresh();
maybeBackupReminder();

/* ---------- Modals (sheet stack: back returns to previous) ---------- */
function openSheet(html, tag) {
  sheetStack.push({ html, tag: tag || null });
  renderSheetTop();
}
function renderSheetTop() {
  const top = sheetStack[sheetStack.length - 1];
  if (!top) { $("#overlay").classList.remove("show"); return; }
  $("#sheet").innerHTML = `
    <div class="sheet-top">
      <button class="sheet-close" onclick="closeSheet()">✕ إغلاق</button>
    </div>
    ${top.html}`;
  $("#overlay").classList.add("show");
}
function closeSheet() {
  if (sheetStack.length) sheetStack.pop();
  renderSheetTop();
}
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

/* ---------- Press: tap enters, long-press shows options ---------- */
let pressTimer = null, pressHeld = false, pressLastFire = 0;
const PRESS_MS = 550, PRESS_COOLDOWN = 600;
function pressStart(e, kind, id) {
  if (e && e.button > 0) return;
  if (Date.now() - pressLastFire < PRESS_COOLDOWN) return;
  if (pressTimer) { clearTimeout(pressTimer); }
  pressHeld = false;
  pressTimer = setTimeout(() => {
    pressTimer = null;
    pressHeld = true;
    try { if (navigator.vibrate) navigator.vibrate(25); } catch (_) {}
    if (kind === "client") showClientActions(id);
    else if (kind === "order" && !selectMode) showOrderActions(id);
  }, PRESS_MS);
}
function pressCancel() {
  if (pressTimer) { clearTimeout(pressTimer); pressTimer = null; }
}
function pressEnd(e, kind, id) {
  pressCancel();
  if (pressHeld) { pressHeld = false; return; }
  if (Date.now() - pressLastFire < PRESS_COOLDOWN) return;
  pressLastFire = Date.now();
  if (kind === "client") showClientDetail(id);
  else if (kind === "order") {
    if (selectMode) toggleSelect(id);
    else showOrderModal(id);
  }
}
$("#overlay").addEventListener("click", e => { if (e.target === $("#overlay")) closeSheet(); });

function orderSelectOptions(selId) {
  const remaining = o => Number(o.amount) - paidForOrder(o.id);
  const list = state.orders.filter(o => remaining(o) > 0 || (selId && o.id === selId));
  return `<option value="">— اختياري: ربط باوردر —</option>` +
    list.map(o => `<option value="${o.id}" ${selId === o.id ? "selected" : ""}>${esc(o.details || o.service || "اوردر")}</option>`).join("");
}

const SERVICE_OPTIONS = ["تصوير فوتو", "تصوير فيديو", "مونتاج"];

function showClientModal(id) {
  const c = id ? clientById(id) : null;
  openSheet(`
    <h2>${c ? "✏️ تعديل عميل" : "➕ عميل جديد"}</h2>
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
        <button class="btn btn-dark btn-slim" onclick='showPaymentModal("${o.id}")'>💳 تحصيل</button>
        <button class="btn btn-dark btn-slim" onclick='sendOrderWhatsApp("${o.id}")'>📤 إرسال اوردر</button>
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
      <div class="meta" style="margin-top:6px;">مسدد: ${fmtMoney(lpaid)} من ${fmtMoney(l.amount)}</div>
      <div class="actions-inline">
        ${lrem > 0 ? `<button class="btn btn-dark btn-slim" onclick='showLedgerPayModal("${l.id}")'>💳 تسديد</button>` : ""}
        <button class="btn btn-dark btn-slim" onclick='showLedgerModal("${id}","${l.id}")'>✏️ تعديل</button>
        <button class="rm" onclick='delLedger("${l.id}")'>حذف</button>
      </div>
    </div>`;
  }).join("") : `<div class="ledger-empty">لا توجد بنود مديونية لهذا العميل.</div>`;

  return `
    <div style="display:flex;align-items:center;justify-content:space-between;">
      <h2>👥 ${esc(c.name)}</h2>
    </div>
    ${c.phone ? `<div class="meta" style="margin-bottom:8px;">📱 ${esc(c.phone)}</div>` : ""}
    ${c.details ? `<div class="details" style="margin-bottom:8px;">${esc(c.details)}</div>` : ""}
    <div class="stats" style="margin-bottom:4px;">
      <div class="stat"><div class="lbl">📦 الاوردرات</div><div class="val" style="font-size:18px;">${t.count}</div></div>
      <div class="stat orders"><div class="lbl">💰 المطلوب</div><div class="val" style="font-size:18px;">${fmtMoney(t.total)}</div></div>
      <div class="stat ok"><div class="lbl">💵 المدفوع</div><div class="val" style="font-size:18px;">${fmtMoney(t.paid)}</div></div>
      <div class="stat due"><div class="lbl">📌 المتبقي</div><div class="val" style="font-size:18px;">${fmtMoney(t.remaining > 0 ? t.remaining : 0)}</div></div>
    </div>
    <div class="actions" style="margin-top:6px;">
      <button class="btn btn-primary" onclick="showOrderModal('','${id}')">➕ اوردر</button>
      <button class="btn btn-dark" onclick="showPaymentModal('','${id}')">💰 دفعة</button>
      <button class="btn btn-green" onclick="sendClientWhatsApp('${id}')">📤 إرسال اوردراته</button>
    </div>
    <div class="actions" style="margin-top:8px;">
      <button class="btn btn-dark" onclick="exportClientPDF('${id}')">📄 PDF اوردرات العميل</button>
      <button class="btn btn-dark" onclick="showClientModal('${id}')">✏️ بيانات العميل</button>
    </div>
    <div class="ledger-box">
      <div class="ledger-title">📒 سجل المديونية <span class="count">${ledgers.length}</span></div>
      <div class="ledger-stats">
        <div class="lstat lstat-total"><div class="lbl">💰 إجمالي البنود</div><div class="val">${fmtMoney(lt.total)}</div></div>
        <div class="lstat lstat-paid"><div class="lbl">💵 المسدد</div><div class="val">${fmtMoney(lt.paid)}</div></div>
        <div class="lstat lstat-due"><div class="lbl">📌 المتبقي</div><div class="val">${fmtMoney(lt.remaining > 0 ? lt.remaining : 0)}</div></div>
      </div>
      <div class="actions" style="margin-top:6px;">
        <button class="btn btn-primary btn-slim" onclick="showLedgerModal('${id}')">➕ بند مديونية</button>
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
    <h2>${e ? "✏️ تعديل بند" : "➕ بند مديونية"}</h2>
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
    <h2>💳 تسديد بند</h2>
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
  save();
  closeSheet();
  refresh();
  toast("تم تسجيل التسديد ✓");
}

function delLedger(entryId) {
  const e = (state.ledger || []).find(x => x.id === entryId);
  if (!e) return;
  if (!confirm("حذف هذا البند نهائياً؟")) return;
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
    <h2>👥 ${esc(c.name)}</h2>
    ${c.phone ? `<div class="meta" style="margin-bottom:8px;">📱 ${esc(c.phone)}</div>` : ""}
    <div class="meta" style="margin-bottom:8px;">📦 ${t.count} اوردر · متبقي ${fmtMoney(t.remaining > 0 ? t.remaining : 0)}${lt.count > 0 ? " · 📒 مديونية متبقية " + fmtMoney(lrem) : ""}</div>
    <div class="actions" style="margin-top:6px;">
      <button class="btn btn-primary" onclick="closeSheet();showClientDetail('${id}')">👥 فتح بطاقة العميل</button>
      <button class="btn btn-dark" onclick="showLedgerModal('${id}')">📒 بند مديونية</button>
    </div>
    <div class="actions" style="margin-top:8px;">
      <button class="btn btn-green" onclick="closeSheet();sendClientWhatsApp('${id}')">📤 واتساب</button>
      <button class="btn btn-dark" onclick="closeSheet();exportClientPDF('${id}')">📄 PDF</button>
    </div>
    <div class="actions" style="margin-top:8px;">
      <button class="btn btn-dark" onclick="showClientModal('${id}')">✏️ بيانات العميل</button>
      <button class="btn btn-danger" onclick="closeSheet();delClient('${id}')">🗑️ حذف</button>
    </div>
  `;
}

function sendClientWhatsApp(id) {
  const c = clientById(id);
  if (!c) { toast("العميل غير موجود"); return; }
  const num = clientPhone(id) || accountantNum();
  if (!num) return;
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
  openWhatsApp(num, msg, c.name);
}

function delClient(id) {
  const cnt = ordersOfClient(id).length + ledgerOfClient(id).length;
  if (cnt > 0) { toast("لا يمكن حذف عميل لديه اوردرات أو بنود مديونية"); return; }
  if (!confirm("حذف هذا العميل نهائياً؟")) return;
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
  const isCustom = o && !SERVICE_OPTIONS.includes(o.service);
  const selClientId = o ? o.clientId : (clientId || "");
  const clientOpts = `
    <option value="__new">➕ عميل جديد...</option>
    ${state.clients.slice().sort((a, b) => a.name.localeCompare(b.name, "ar")).map(c =>
      `<option value="${c.id}" ${selClientId === c.id ? "selected" : ""}>${esc(c.name)}${c.phone ? " · " + esc(c.phone) : ""}</option>`).join("")}`;
  openSheet(`
    <h2>${o ? "✏️ تعديل اوردر" : "➕ اوردر جديد"}</h2>
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
      ${SERVICE_OPTIONS.map(s => `<option ${o && o.service === s ? "selected" : ""}>${s}</option>`).join("")}
      <option value="other" ${isCustom ? "selected" : ""}>أخرى</option>
    </select></div>
    <div class="field" id="oServiceOtherWrap" style="display:${isCustom ? "block" : "none"}">
      <label>اكتب الخدمة</label><input id="oServiceOther" value="${isCustom ? esc(o.service) : ""}" placeholder="اسم الخدمة">
    </div>
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
  openSheet(`
    <h2>${ex ? "✏️ تعديل دفعة" : "💰 تسجيل دفعة"}</h2>
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
    <div class="field"><label>ملاحظات</label><input id="pDetails" value="${esc(ex ? ex.details : "")}" placeholder="دفعة مقدمة، دفعة شفهية..."></div>
    <button class="btn btn-primary btn-block" onclick="savePayment('${ex ? ex.id : ""}')">${ex ? "حفظ التعديل" : "حفظ الدفعة"}</button>
  `);
}

function showExpenseModal(id) {
  const ex = id ? state.expenses.find(x => x.id === id) : null;
  const cats = ["بنزين", "طعام", "تصليح معدات", "طباعة صور", "شراء معدات", "أخرى"];
  const payers = ["أنا", "الشركة", "أخرى"];
  openSheet(`
    <h2>${ex ? "✏️ تعديل مصروف" : "🧾 تسجيل مصروف"}</h2>
    <div class="field"><label>نوع المصروف</label><select id="xCat">
      ${cats.map(s => `<option ${ex && ex.category === s ? "selected" : ""}>${s}</option>`).join("")}
    </select></div>
    <div class="field"><label>المبلغ *</label><input id="xAmount" type="number" inputmode="decimal" min="0" step="0.01" value="${ex ? ex.amount : ""}" placeholder="0"></div>
    <div class="field-row">
      <div class="field"><label>مَن دفعها</label><select id="xPaidBy">${payers.map(s => `<option ${ex && ex.paidBy === s ? "selected" : ""}>${s}</option>`).join("")}</select></div>
      <div class="field"><label>التاريخ</label><input id="xDate" type="date" value="${ex ? ex.date : todayStr()}"></div>
    </div>
    <div class="field"><label>تفاصيل</label><textarea id="xDetails" placeholder="وصف المصروف...">${esc(ex ? ex.details : "")}</textarea></div>
    <button class="btn btn-primary btn-block" onclick="saveExpense('${ex ? ex.id : ""}')">${ex ? "حفظ التعديل" : "حفظ المصروف"}</button>
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
  const data = {
    client,
    amount,
    method: $("#pMethod").value,
    date: $("#pDate").value || todayStr(),
    orderId: orderId || "",
    details: $("#pDetails").value.trim()
  };
  if (id) {
    const p = state.payments.find(x => x.id === id);
    if (p) Object.assign(p, data);
  } else {
    state.payments.push(Object.assign({ id: uid() }, data));
  }
  save();
  closeSheet();
  refresh();
  toast(id ? "تم حفظ التعديل" : "تم تسجيل الدفعة");
}

function saveExpense(id) {
  const amount = parseFloat($("#xAmount").value);
  if (!(amount > 0)) return toast("اكتب مبلغ صحيح");
  const data = {
    category: $("#xCat").value,
    amount,
    paidBy: $("#xPaidBy").value,
    date: $("#xDate").value || todayStr(),
    details: $("#xDetails").value.trim()
  };
  if (id) {
    const x = state.expenses.find(e => e.id === id);
    if (x) Object.assign(x, data);
  } else {
    state.expenses.push(Object.assign({ id: uid() }, data));
  }
  save();
  closeSheet();
  refresh();
  toast(id ? "تم حفظ التعديل" : "تم تسجيل المصروف");
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
    <h2>📦 ${esc(o.client)}</h2>
    <div class="meta" style="margin-bottom:8px;">${fmtDate(o.date)}${o.service ? " · " + esc(o.service) : ""} · ${fmtMoney(o.amount)}</div>
    <div class="meta" style="margin-bottom:8px;">${remain > 0 ? "متبقي " + fmtMoney(remain) : "مدفوع كامل ✓"}</div>
    <div class="actions" style="margin-top:6px;">
      <button class="btn btn-primary" onclick="showPaymentModal('${id}')">💳 تحصيل</button>
      <button class="btn btn-dark" onclick="showOrderModal('${id}')">✏️ تعديل</button>
    </div>
    <div class="actions" style="margin-top:8px;">
      <button class="btn btn-green" onclick="closeSheet();sendOrderWhatsApp('${id}')">📤 واتساب</button>
      <button class="btn btn-dark" onclick="closeSheet();exportOrdersPDF(['${id}'],'اوردر')">📄 PDF</button>
    </div>
    <button class="btn btn-danger btn-block" style="margin-top:8px;" onclick="closeSheet();delOrder('${id}')">🗑️ حذف الاوردر</button>
  `;
}

function delOrder(id) {
  if (!confirm("حذف هذا الاوردر؟")) return;
  state.orders = state.orders.filter(x => x.id !== id);
  state.payments.forEach(p => { if (p.orderId === id) p.orderId = ""; });
  save();
  refresh();
  toast("تم الحذف");
}
function delPayment(id) {
  if (!confirm("حذف هذه الدفعة؟")) return;
  state.payments = state.payments.filter(x => x.id !== id);
  save();
  refresh();
  toast("تم الحذف");
}
function delExpense(id) {
  if (!confirm("حذف هذا المصروف؟")) return;
  state.expenses = state.expenses.filter(x => x.id !== id);
  save();
  refresh();
  toast("تم الحذف");
}

/* ---------- Bookings (حجوزات التصوير) ---------- */
let remindedBookings = new Set();
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
            ${b.client ? `<span class="badge">👥 ${esc(b.client)}</span>` : ""}
          </div>
        </div>
        <div class="amt" style="font-size:13px;${b.done ? "color:var(--ok);" : (b.date < t ? "color:var(--danger);" : "")}">${b.done ? "تم ✓" : esc(daysLabel(n))}</div>
      </div>
      ${b.details ? `<div class="details">${esc(b.details)}</div>` : ""}
      <div class="actions-inline">
        ${b.done ? `<button class="btn btn-dark btn-slim" onclick='toggleBookingDone("${b.id}")'>↩️ إعادة فتح</button>` : `<button class="btn btn-dark btn-slim" onclick='toggleBookingDone("${b.id}")'>✅ تم</button>`}
        <button class="btn btn-dark btn-slim" onclick='sendBookingWhatsApp("${b.id}")'>📤 واتساب</button>
        <button class="btn btn-dark btn-slim" onclick='showBookingModal("${b.id}")'>✏️ تعديل</button>
        <button class="rm" onclick='delBooking("${b.id}")'>حذف</button>
      </div>
    </div>`;
  }).join("") : `<div class="empty">لا توجد حجوزات. اضغط «+ حجز» لإضافة حجز مستقبلي مع تنبيه.</div>`;
  $("#bookingsList").innerHTML = html;
  const dueNow = list.filter(b => bookingDue(b) && !remindedBookings.has(b.id));
  if (dueNow.length) {
    dueNow.forEach(b => remindedBookings.add(b.id));
    toast(`⏰ تذكير: ${dueNow.length} حجوزات قريبة/فائتة — راجع تبويب الحجوزات`);
  }
}
function showBookingModal(id) {
  const b = id ? (state.bookings || []).find(x => x.id === id) : null;
  const selCid = b ? (b.clientId || "") : "";
  openSheet(`
    <h2>${b ? "✏️ تعديل حجز" : "📅 حجز تصوير جديد"}</h2>
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
      <option value="day" ${!b || b.remind === "day" ? "selected" : ""}>⏰ قبل الموعد بيوم</option>
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
  toast("تم حفظ الحجز 📅");
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
  state.bookings = (state.bookings || []).filter(x => x.id !== id);
  save();
  refresh();
  toast("تم حذف الحجز");
}
function sendBookingWhatsApp(id) {
  const b = (state.bookings || []).find(x => x.id === id);
  if (!b) return;
  const num = (b.clientId && clientPhone(b.clientId)) || accountantNum();
  if (!num) return;
  let txt = `📅 حجز تصوير — ${b.title}\n📅 ${fmtDate(b.date)}${b.time ? " · ⏰ " + b.time : ""}\n`;
  if (b.client) txt += `👥 العميل: ${b.client}\n`;
  if (b.details) txt += `📝 ${b.details}\n`;
  txt += "— أُرسل عبر 📸 دفتر التصوير —";
  openWhatsApp(num, txt, b.client || b.title);
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
  const num = (state.settings.accountant || "").replace(/\D/g, "");
  if (!num) alert("أدخل رقم المحاسب أولاً في تبويب التقرير → الإعدادات");
  return num;
}
function clientPhone(clientId) {
  const c = clientById(clientId);
  return c ? (c.phone || "").replace(/\D/g, "") : "";
}
function openWhatsApp(num, text, label) {
  toast(label ? "الذهاب لواتساب: " + label : "يتم فتح واتساب...");
  saveSettings();
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
  if (!num) return;
  openWhatsApp(num, buildOrdersReport([id], "اوردر"), o.client);
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
  if (!num) return;
  openWhatsApp(num, buildOrdersReport(ids, "مراجعة اوردرات"), label);
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

function buildInvoiceCanvas(orders, title) {
  const s = state.settings;
  const company = s.company || "دفتر التصوير";
  const oSum = orders.reduce((a, x) => a + (Number(x.amount) || 0), 0);
  const pSum = orders.reduce((a, x) => a + paidForOrder(x.id), 0);
  const due = oSum - pSum;

  const W = 1240;
  const LM = 70;
  const RM = 70;
  const contentW = W - LM - RM;
  const FONT_FAMILY = "-apple-system, 'SF Arabic', 'Segoe UI', Arial, sans-serif";

  const cols = [
    { key: "num", label: "#", w: 60, align: "center" },
    { key: "date", label: "التاريخ", w: 185, align: "center" },
    { key: "service", label: "الخدمة", w: 245, align: "right" },
    { key: "details", label: "التفاصيل", w: 0, align: "right" },
    { key: "amount", label: "المبلغ", w: 205, align: "center" },
    { key: "status", label: "الحالة", w: 205, align: "center" }
  ];
  const fixedW = cols.reduce((a, c) => a + c.w, 0);
  cols.find(c => c.key === "details").w = contentW - fixedW;
  const padX = 14;
  const headerH = 54;
  const bodyFontPx = 24;
  const lineH = bodyFontPx + 11;
  const cellPadV = 11;

  const singleClient = orders.every(o => o.clientId === orders[0].clientId) ? orders[0].client : null;

  const temp = document.createElement("canvas");
  temp.width = 2;
  temp.height = 2;
  const tctx = temp.getContext("2d");
  const setFont = (ctx, px, bold) => { ctx.font = (bold ? "700 " : "400 ") + px + "px " + FONT_FAMILY; };

  function cellLines(ctx, text, colW, kind) {
    setFont(ctx, kind === "header" ? 24 : bodyFontPx, kind === "header");
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
      service: (o.service || "—") ? cellLines(tctx, o.service || "—", cols.find(c => c.key === "service").w) : [""],
      details: o.details ? cellLines(tctx, o.details, cols.find(c => c.key === "details").w) : ["—"],
      amount: [fmtMoney(o.amount)],
      status: cellLines(tctx, st.text, cols.find(c => c.key === "status").w),
      paidOut: st.paidOut
    };
    const maxLines = Math.max(1, ...Object.values(cells).filter(v => Array.isArray(v)).map(v => v.length));
    return { cells, h: maxLines * lineH + cellPadV * 2, maxLines };
  });

  const sumH = 96;
  const rowsH = rows.reduce((a, r) => a + r.h, 0);

  // Pre-calculate total height dynamically
  // Header: title(60) + date(35) + [client(40)] + spacing(30) + summary(sumH) + spacing(30) + sectionTitle(35) + tableHeader(headerH) + rowsH + footer(100)
  let estH = 62 + 60 + 35 + (singleClient ? 40 : 0) + 30 + sumH + 30 + 35 + headerH + rowsH + 120;
  const totalH = Math.max(estH, Math.floor(W * 297 / 210));

  const canvas = document.createElement("canvas");
  canvas.width = W;
  canvas.height = totalH;
  const ctx = canvas.getContext("2d");
  ctx.direction = "rtl";
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, W, totalH);

  // top/bottom accents
  ctx.fillStyle = "#f59e0b";
  ctx.fillRect(0, 0, W, 12);
  ctx.fillRect(0, totalH - 12, W, 12);

  // Title & Header (Dynamic running Y)
  let y = 62;
  ctx.textAlign = "right";
  ctx.textBaseline = "top";
  setFont(ctx, 44, true);
  ctx.fillStyle = "#0f172a";
  ctx.fillText(title + " — " + company, W - RM, y);
  y += 60;
  setFont(ctx, 24, false);
  ctx.fillStyle = "#64748b";
  ctx.fillText("تاريخ الإصدار: " + new Date().toLocaleString("ar-EG-u-nu-latn", { dateStyle: "long", timeStyle: "short" }), W - RM, y);
  y += 35;
  if (singleClient) {
    setFont(ctx, 26, true);
    ctx.fillStyle = "#1d4ed8";
    ctx.fillText("العميل: " + singleClient, W - RM, y);
    y += 40;
  }

  y += 20; // spacing before summary

  // Summary boxes
  const boxW = (contentW - 30) / 3;
  const summary = [
    { t: "اجمالي المطلوب", v: fmtMoney(oSum), c: "#1d4ed8", bg: "#dbeafe" },
    { t: "المدفوع", v: fmtMoney(pSum), c: "#047857", bg: "#d1fae5" },
    { t: "المتبقي", v: fmtMoney(due > 0 ? due : 0), c: due > 0 ? "#b45309" : "#047857", bg: due > 0 ? "#fef3c7" : "#d1fae5" }
  ];
  summary.forEach((sm, i) => {
    const bx = W - RM - boxW - i * (boxW + 15);
    ctx.fillStyle = sm.bg;
    roundRect(ctx, bx, y, boxW, sumH, 12);
    ctx.textAlign = "right";
    setFont(ctx, 22, false);
    ctx.fillStyle = "#475569";
    ctx.fillText(sm.t, bx + boxW - 18, y + 18);
    setFont(ctx, 30, true);
    ctx.fillStyle = sm.c;
    ctx.fillText(sm.v, bx + boxW - 18, y + (sumH / 2) + 8);
  });

  y += sumH + 30;

  // Section title
  ctx.textAlign = "right";
  setFont(ctx, 30, true);
  ctx.fillStyle = "#0f172a";
  ctx.fillText("الاوردرات (" + orders.length + ")", W - RM, y);

  y += 40;

  // Table
  const tableY = y;
  let x = W - RM;
  const colRect = {};
  cols.forEach(c => {
    colRect[c.key] = { x: x - c.w, w: c.w };
    x -= c.w;
  });

  function drawCellBg(columnKeyName, yy, hh, color) {
    const r = colRect[columnKeyName];
    ctx.fillStyle = color;
    ctx.fillRect(r.x + 1, yy + 1, r.w - 2, Math.max(0, hh - 2));
  }

  // header
  ctx.fillStyle = "#f59e0b";
  ctx.fillRect(LM, tableY, contentW, headerH);
  cols.forEach(c => {
    const r = colRect[c.key];
    ctx.fillStyle = "#111827";
    setFont(ctx, 25, true);
    ctx.textAlign = c.align === "center" ? "center" : "right";
    ctx.textBaseline = "middle";
    ctx.fillText(c.label, c.align === "center" ? r.x + r.w / 2 : r.x + r.w - padX, tableY + headerH / 2);
  });
  ctx.strokeStyle = "#0f172a";
  ctx.lineWidth = 1;
  ctx.strokeRect(LM, tableY, contentW, headerH);

  // body rows
  let ry = tableY + headerH;
  rows.forEach((r, idx) => {
    const bg = idx % 2 === 0 ? "#ffffff" : "#f8fafc";
    Object.keys(colRect).forEach(k => drawCellBg(k, ry, r.h, bg));
    for (const k of cols.map(c => c.key)) {
      const rr = colRect[k];
      const align = cols.find(c => c.key === k).align;
      const lines = r.cells[k];
      ctx.textBaseline = "top";
      lines.forEach((ln, li) => {
        if (k === "status") ctx.fillStyle = r.cells.paidOut ? "#047857" : "#b45309";
        else ctx.fillStyle = k === "details" ? "#475569" : "#0f172a";
        setFont(ctx, bodyFontPx, k === "service");
        if (align === "center") { ctx.textAlign = "center"; ctx.fillText(ln, rr.x + rr.w / 2, ry + cellPadV + li * lineH); }
        else { ctx.textAlign = "right"; ctx.fillText(ln, rr.x + rr.w - padX, ry + cellPadV + li * lineH); }
      });
    }
    ctx.strokeStyle = "#e2e8f0";
    ctx.lineWidth = 1;
    ctx.strokeRect(LM, ry, contentW, r.h);
    ry += r.h;
  });

  // footer
  ctx.textAlign = "center";
  setFont(ctx, 22, false);
  ctx.fillStyle = "#94a3b8";
  ctx.fillText("تم الإنشاء بواسطة 📸 دفتر التصوير", W / 2, totalH - 45);

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

function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
  ctx.fill();
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

  const FF = "-apple-system, 'SF Arabic', 'Segoe UI', Arial, sans-serif";
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
  try {
    doExportPDF(orders, title);
  } catch (e) {
    toast("تعذر إنشاء PDF: " + e.message);
  }
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

function reportData() {
  if (reportRange === "all") {
    return { orders: state.orders.slice(), payments: state.payments.slice(), expenses: state.expenses.slice(), label: "كل الفترات" };
  }
  const m = $("#monthFilter").value;
  if (!m || m === "all") {
    return { orders: state.orders.slice(), payments: state.payments.slice(), expenses: state.expenses.slice(), label: "كل الفترات" };
  }
  return {
    orders: state.orders.filter(o => inMonth(o.date, m)),
    payments: state.payments.filter(p => inMonth(p.date, m)),
    expenses: state.expenses.filter(x => inMonth(x.date, m)),
    label: monthLabel(m)
  };
}

function buildReport() {
  const d = reportData();
  const s = state.settings;
  const company = s.company || "دفتر التصوير";
  const oSum = d.orders.reduce((a, x) => a + (Number(x.amount) || 0), 0);
  const pSum = d.payments.reduce((a, x) => a + (Number(x.amount) || 0), 0);
  const eSum = d.expenses.reduce((a, x) => a + (Number(x.amount) || 0), 0);
  const due = oSum - pSum;

  let txt = "";
  txt += `📸 تقرير ${company}\n`;
  txt += `📅 الفترة: ${d.label}\n`;
  txt += `🕓 ${new Date().toLocaleString("ar-EG-u-nu-latn", { dateStyle: "long", timeStyle: "short" })}\n\n`;
  txt += "━━━━━━━━━━━━━━\n";
  txt += `📦 اجمالي الاوردرات: ${fmtMoney(oSum)}\n`;
  txt += `💰 المدفوعات: ${fmtMoney(pSum)}\n`;
  txt += `🧾 المصروفات: ${fmtMoney(eSum)}\n`;
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

  if (d.expenses.length) {
    let xLine = "";
    d.expenses.forEach((x, i) => {
      xLine += `${i + 1}) ${x.category}`;
      if (x.paidBy) xLine += ` · ${x.paidBy}`;
      xLine += ` — ${fmtMoney(x.amount)}\n   📅 ${fmtDate(x.date)}`;
      if (x.details) xLine += ` · ${x.details}`;
      xLine += "\n";
    });
    txt += `🧾 المصروفات (${d.expenses.length}):\n${xLine}\n`;
  }

  if (!d.orders.length && !d.payments.length && !d.expenses.length) {
    txt += "لا توجد بيانات في هذه الفترة.\n";
  }
  txt += "\n— أُرسل عبر 📸 دفتر التصوير —";
  return txt;
}

function renderReport() {
  const d = reportData();
  const oSum = d.orders.reduce((a, x) => a + (Number(x.amount) || 0), 0);
  const pSum = d.payments.reduce((a, x) => a + (Number(x.amount) || 0), 0);
  const eSum = d.expenses.reduce((a, x) => a + (Number(x.amount) || 0), 0);
  const due = oSum - pSum;
  const net = pSum - eSum;
  const rate = oSum > 0 ? Math.min(100, Math.round((pSum / oSum) * 100)) : 0;

  let html = `<div class="stats">
    <div class="stat total orders"><div class="lbl">📦 إجمالي الأوردرات · ${d.orders.length}</div><div class="val">${fmtMoney(oSum)}</div></div>
    <div class="stat ok"><div class="lbl">💰 المحصّل · ${d.payments.length}</div><div class="val">${fmtMoney(pSum)}</div></div>
    <div class="stat exp"><div class="lbl">🧾 المصروفات · ${d.expenses.length}</div><div class="val">${fmtMoney(eSum)}</div></div>
    <div class="stat due"><div class="lbl">📌 المتبقي للتحصيل</div><div class="val">${fmtMoney(due > 0 ? due : 0)}</div></div>
    <div class="stat ${net >= 0 ? "ok" : "exp"}"><div class="lbl">📊 صافي الربح</div><div class="val">${fmtMoney(net)}</div></div>
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
  if (!num) return;
  openWhatsApp(num, buildReport());
}

/* ---------- Export / Import ---------- */
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
  state.orders.forEach(o => rows.push(["اوردر", o.date, o.client, o.service || "", o.amount, o.details || ""].map(csvCell).join(",")));
  state.payments.forEach(p => rows.push(["دفعة", p.date, p.client, p.method || "", p.amount, p.details || ""].map(csvCell).join(",")));
  state.expenses.forEach(x => rows.push(["مصروف", x.date, x.category, x.paidBy || "", x.amount, x.details || ""].map(csvCell).join(",")));
  (state.ledger || []).forEach(l => rows.push(["بند مديونية", l.date, l.client, l.title || "", l.amount, "مسدد: " + (Number(l.paid) || 0) + (l.details ? " · " + l.details : "")].map(csvCell).join(",")));
  (state.bookings || []).forEach(b => rows.push(["حجز", b.date + (b.time ? " " + b.time : ""), b.client || "", b.title || "", b.done ? "تم" : "مجدول", b.details || ""].map(csvCell).join(",")));
  const b = "\uFEFF" + rows.join("\r\n");
  exportFile("تقرير-الاوردرات.csv", "text/csv;charset=utf-8", b);
  toast("تم تصدير ملف Excel (CSV)");
}

function exportJSON() {
  saveSettings();
  state.settings.lastBackup = Date.now();
  save();
  const txt = JSON.stringify(state, null, 1);
  exportFile("نسخة-احتياطية-دفتر-التصوير.txt", "text/plain;charset=utf-8", txt);
  toast("تم تصدير النسخة الاحتياطية");
}

function importJSON() {
  const txt = $("#importBox").value.trim();
  if (!txt) return toast("الصق النص الاحتياطي أولاً");
  try {
    const d = JSON.parse(txt);
    if (!d || !Array.isArray(d.orders) || !Array.isArray(d.payments) || !Array.isArray(d.expenses)) {
      return toast("ملف غير صالح");
    }
    if (!confirm("سيتم استبدال البيانات الحالية. متابعة؟")) return;
    state = {
      orders: d.orders,
      payments: d.payments,
      expenses: d.expenses,
      clients: Array.isArray(d.clients) ? d.clients : [],
      ledger: Array.isArray(d.ledger) ? d.ledger : [],
      bookings: Array.isArray(d.bookings) ? d.bookings : [],
      settings: Object.assign({}, state.settings, d.settings || {})
    };
    save();
    $("#importBox").value = "";
    refresh();
    toast("تم استرجاع البيانات");
  } catch (e) {
    toast("النص غير صالح");
  }
}

function confirmClear() {
  if (!confirm("حذف كل البيانات نهائياً؟ لا يمكن التراجع!")) return;
  if (!confirm("تأكيد أخير: هل أنت متأكد تماماً؟")) return;
  state = { orders: [], payments: [], expenses: [], clients: [], ledger: [], bookings: [], settings: state.settings };
  save();
  refresh();
  toast("تم مسح كل البيانات");
}

/* ---------- Install ---------- */
function installApp() {
  if (navigator.standalone) {
    toast("التطبيق مثبت بالفعل");
    return;
  }
  if (window.matchMedia && window.matchMedia("(display-mode: standalone)").matches) {
    toast("التطبيق يعمل بوضع التثبيت");
    return;
  }
  alert("من سفاري اضغط زر المشاركة (⬆️) ثم اختر «إضافة إلى الشاشة الرئيسية» لاستخدام التطبيق كتطبيق كامل.");
}

/* ---------- Service worker / offline ---------- */
if ("serviceWorker" in navigator && location.protocol.indexOf("http") === 0) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("sw.js").catch(() => {});
  });
}