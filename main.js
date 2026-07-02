/* ═══════════════════════════════════════════════════════════
   SpendSight — frontend-only expense analytics
   No backend. No API. No cloud. localStorage only.
   ═══════════════════════════════════════════════════════════ */
"use strict";

/* ─────────────── utils/storage.js ─────────────── */
const KEYS = {
  expenses: "spendsight_expenses",
  name: "spendsight_user_name",
  prefs: "spendsight_preferences",
};

const Storage = {
  getExpenses() {
    try {
      const raw = localStorage.getItem(KEYS.expenses);
      const arr = raw ? JSON.parse(raw) : [];
      return Array.isArray(arr) ? arr.filter(e => e && typeof e.amount === "number" && e.date) : [];
    } catch { return []; }
  },
  setExpenses(list) { localStorage.setItem(KEYS.expenses, JSON.stringify(list)); },
  getName() { return localStorage.getItem(KEYS.name) || ""; },
  setName(n) { localStorage.setItem(KEYS.name, n); },
  getPrefs() {
    try { return JSON.parse(localStorage.getItem(KEYS.prefs)) || {}; } catch { return {}; }
  },
  setPrefs(p) { localStorage.setItem(KEYS.prefs, JSON.stringify(p)); },
  clearAll() {
    localStorage.removeItem(KEYS.expenses);
    localStorage.removeItem(KEYS.prefs);
  },
};

/* ─────────────── utils/formatters.js ─────────────── */
const fmtCurrency = (n) =>
  new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 2 }).format(n || 0);

const fmtCurrencyShort = (n) => {
  if (Math.abs(n) >= 1000) return "$" + (n / 1000).toFixed(1).replace(/\.0$/, "") + "k";
  return "$" + Math.round(n);
};

const fmtDate = (iso) => {
  const d = new Date(iso + "T00:00:00");
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
};

const fmtMonthLabel = (ym) => {
  const [y, m] = ym.split("-").map(Number);
  return new Date(y, m - 1, 1).toLocaleDateString("en-US", { month: "long", year: "numeric" });
};

const todayISO = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};

const monthKeyOf = (iso) => iso.slice(0, 7);
const currentMonthKey = () => todayISO().slice(0, 7);
const prevMonthKey = () => {
  const d = new Date();
  const p = new Date(d.getFullYear(), d.getMonth() - 1, 1);
  return `${p.getFullYear()}-${String(p.getMonth() + 1).padStart(2, "0")}`;
};

const uid = () => "e_" + Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

/* ─────────────── utils/calculations.js ─────────────── */
const Calc = {
  inMonth(list, ym) { return list.filter(e => monthKeyOf(e.date) === ym); },
  total(list) { return list.reduce((s, e) => s + Number(e.amount || 0), 0); },

  currentMonthTotal(list) { return this.total(this.inMonth(list, currentMonthKey())); },
  lastMonthTotal(list) { return this.total(this.inMonth(list, prevMonthKey())); },

  diff(list) { return this.currentMonthTotal(list) - this.lastMonthTotal(list); },

  pctChange(list) {
    const last = this.lastMonthTotal(list);
    if (last <= 0) return null; // "New spending data."
    return ((this.currentMonthTotal(list) - last) / last) * 100;
  },

  avgPerDay(list) {
    const day = new Date().getDate();
    return this.currentMonthTotal(list) / day;
  },

  daysInCurrentMonth() {
    const d = new Date();
    return new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate();
  },

  predictedEOM(list) { return this.avgPerDay(list) * this.daysInCurrentMonth(); },

  categoryTotals(list, ym) {
    const map = {};
    this.inMonth(list, ym).forEach(e => { map[e.category] = (map[e.category] || 0) + Number(e.amount); });
    return Object.entries(map).sort((a, b) => b[1] - a[1]); // [ [cat,total], ... ]
  },

  highestCategory(list, ym) {
    const t = this.categoryTotals(list, ym);
    return t.length ? { category: t[0][0], total: t[0][1] } : null;
  },

  largestExpense(list, ym) {
    const m = this.inMonth(list, ym);
    if (!m.length) return null;
    return m.reduce((mx, e) => (Number(e.amount) > Number(mx.amount) ? e : mx), m[0]);
  },

  monthlySeries(list, count = 6) {
    const out = [];
    const now = new Date();
    for (let i = count - 1; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const ym = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
      out.push({ ym, label: d.toLocaleDateString("en-US", { month: "short" }), total: this.total(this.inMonth(list, ym)) });
    }
    return out;
  },

  dailySeries(list, ym) {
    const [y, m] = ym.split("-").map(Number);
    const days = new Date(y, m, 0).getDate();
    const arr = Array.from({ length: days }, (_, i) => ({ day: i + 1, total: 0 }));
    this.inMonth(list, ym).forEach(e => {
      const d = Number(e.date.slice(8, 10));
      if (arr[d - 1]) arr[d - 1].total += Number(e.amount);
    });
    return arr;
  },

  weekdaySeries(list, ym) {
    const names = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
    const arr = names.map(n => ({ name: n, total: 0 }));
    this.inMonth(list, ym).forEach(e => {
      const wd = new Date(e.date + "T00:00:00").getDay();
      arr[wd].total += Number(e.amount);
    });
    return arr;
  },

  topExpenses(list, ym, n = 5) {
    return [...this.inMonth(list, ym)].sort((a, b) => b.amount - a.amount).slice(0, n);
  },

  monthsAvailable(list) {
    const s = new Set(list.map(e => monthKeyOf(e.date)));
    s.add(currentMonthKey());
    return [...s].sort().reverse();
  },
};

/* ─────────────── categories + shiny icons ─────────────── */
const CATEGORIES = ["Rent", "Food", "Gas", "Tuition", "Phone", "Shopping", "Entertainment", "Debt", "Emergency", "Other"];

const CAT_ICONS = {
  Rent: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 11 12 3l9 8"/><path d="M5 10v10h14V10"/><path d="M10 20v-6h4v6"/></svg>',
  Food: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M7 3v8M5 3v5a2 2 0 0 0 4 0V3M7 11v10M17 3c-2 0-3 2.2-3 5 0 2 .8 3 2 3v10"/></svg>',
  Gas: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 21V5a2 2 0 0 1 2-2h6a2 2 0 0 1 2 2v16"/><path d="M2 21h14M14 9h2a2 2 0 0 1 2 2v5a1.5 1.5 0 0 0 3 0v-7l-2.5-2.5M6 7h6"/></svg>',
  Tuition: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m2 9 10-5 10 5-10 5L2 9Z"/><path d="M6 11.5V16c0 1.5 2.7 3 6 3s6-1.5 6-3v-4.5M22 9v5"/></svg>',
  Phone: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="7" y="2.5" width="10" height="19" rx="2.5"/><path d="M11 18.5h2"/></svg>',
  Shopping: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M6 7h12l1 14H5L6 7Z"/><path d="M9 10V6a3 3 0 0 1 6 0v4"/></svg>',
  Entertainment: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="2.5" y="6" width="19" height="13" rx="2.5"/><path d="m10 10 4 2.5-4 2.5v-5ZM8 3l3 3M16 3l-3 3"/></svg>',
  Debt: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="2.5" y="5.5" width="19" height="13" rx="2.5"/><path d="M2.5 10h19M6.5 14.5H10"/></svg>',
  Emergency: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3 3.5 18.5h17L12 3Z"/><path d="M12 9.5v4M12 16.5h.01"/></svg>',
  Other: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9"/><path d="M9.5 9.5a2.5 2.5 0 1 1 3.4 2.33c-.55.21-.9.72-.9 1.31V14M12 17h.01"/></svg>',
};
const catIcon = (c) => CAT_ICONS[c] || CAT_ICONS.Other;

/* ─────────────── PlasmaOrb (canvas) ───────────────
   A glass sphere on a light background with living red
   electric filaments inside. Energy, focus, control.   */
function createPlasmaOrb(canvas, opts = {}) {
  if (!canvas) return null;
  const ctx = canvas.getContext("2d");
  const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const W = canvas.width, H = canvas.height;
  const cx = W / 2, cy = H / 2;
  const R = Math.min(W, H) * 0.36;
  const boltCount = opts.bolts ?? 5;
  let t = Math.random() * 1000;
  let raf = null;

  const bolts = Array.from({ length: boltCount }, (_, i) => ({
    seed: Math.random() * 100,
    speed: 0.6 + Math.random() * 0.9,
    angle: (i / boltCount) * Math.PI * 2,
    spin: (Math.random() - 0.5) * 0.02,
  }));

  function jaggedPath(a1, a2, seed, segs = 9) {
    const p1 = { x: cx + Math.cos(a1) * R * 0.92, y: cy + Math.sin(a1) * R * 0.92 };
    const p2 = { x: cx + Math.cos(a2) * R * 0.92, y: cy + Math.sin(a2) * R * 0.92 };
    const pts = [p1];
    for (let i = 1; i < segs; i++) {
      const f = i / segs;
      const bx = p1.x + (p2.x - p1.x) * f;
      const by = p1.y + (p2.y - p1.y) * f;
      const wob = Math.sin(t * 2.1 + seed * 7 + i * 2.4) * R * 0.22 * Math.sin(f * Math.PI);
      const nx = -(p2.y - p1.y), ny = (p2.x - p1.x);
      const len = Math.hypot(nx, ny) || 1;
      pts.push({ x: bx + (nx / len) * wob, y: by + (ny / len) * wob });
    }
    pts.push(p2);
    return pts;
  }

  function draw() {
    ctx.clearRect(0, 0, W, H);

    // ambient halo (kept light)
    let halo = ctx.createRadialGradient(cx, cy, R * 0.3, cx, cy, R * 1.9);
    halo.addColorStop(0, "rgba(255,70,86,0.16)");
    halo.addColorStop(0.55, "rgba(255,90,105,0.06)");
    halo.addColorStop(1, "rgba(255,90,105,0)");
    ctx.fillStyle = halo;
    ctx.beginPath(); ctx.arc(cx, cy, R * 1.9, 0, 7); ctx.fill();

    // sphere body — frosted glass
    let body = ctx.createRadialGradient(cx - R * 0.35, cy - R * 0.4, R * 0.1, cx, cy, R);
    body.addColorStop(0, "rgba(255,255,255,0.95)");
    body.addColorStop(0.45, "rgba(255,240,242,0.82)");
    body.addColorStop(0.8, "rgba(255,214,219,0.75)");
    body.addColorStop(1, "rgba(255,190,197,0.85)");
    ctx.fillStyle = body;
    ctx.beginPath(); ctx.arc(cx, cy, R, 0, 7); ctx.fill();

    // clip to sphere for lightning
    ctx.save();
    ctx.beginPath(); ctx.arc(cx, cy, R * 0.97, 0, 7); ctx.clip();

    // inner core glow
    const pulse = 0.75 + Math.sin(t * 1.6) * 0.25;
    let core = ctx.createRadialGradient(cx, cy, 0, cx, cy, R * 0.75);
    core.addColorStop(0, `rgba(255,105,118,${0.55 * pulse})`);
    core.addColorStop(0.5, `rgba(255,60,78,${0.22 * pulse})`);
    core.addColorStop(1, "rgba(255,60,78,0)");
    ctx.fillStyle = core;
    ctx.beginPath(); ctx.arc(cx, cy, R, 0, 7); ctx.fill();

    // electric filaments
    ctx.lineCap = "round"; ctx.lineJoin = "round";
    bolts.forEach(b => {
      b.angle += b.spin;
      const a1 = b.angle + Math.sin(t * b.speed + b.seed) * 0.9;
      const a2 = a1 + Math.PI + Math.cos(t * b.speed * 0.8 + b.seed * 2) * 1.1;
      const pts = jaggedPath(a1, a2, b.seed);

      // outer glow stroke
      ctx.shadowColor = "rgba(255,45,66,0.9)";
      ctx.shadowBlur = 14;
      ctx.strokeStyle = "rgba(255,64,84,0.5)";
      ctx.lineWidth = 3.2;
      ctx.beginPath();
      pts.forEach((p, i) => (i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y)));
      ctx.stroke();

      // hot white core
      ctx.shadowBlur = 6;
      ctx.strokeStyle = "rgba(255,235,238,0.95)";
      ctx.lineWidth = 1.15;
      ctx.stroke();
    });
    ctx.shadowBlur = 0;
    ctx.restore();

    // glass rim
    ctx.strokeStyle = "rgba(255,255,255,0.85)";
    ctx.lineWidth = Math.max(1.5, R * 0.02);
    ctx.beginPath(); ctx.arc(cx, cy, R, 0, 7); ctx.stroke();

    // specular highlight
    let spec = ctx.createRadialGradient(cx - R * 0.42, cy - R * 0.5, 0, cx - R * 0.42, cy - R * 0.5, R * 0.5);
    spec.addColorStop(0, "rgba(255,255,255,0.85)");
    spec.addColorStop(1, "rgba(255,255,255,0)");
    ctx.fillStyle = spec;
    ctx.beginPath();
    ctx.ellipse(cx - R * 0.38, cy - R * 0.46, R * 0.4, R * 0.26, -0.6, 0, 7);
    ctx.fill();

    t += 0.016;
  }

  function loop() { draw(); raf = requestAnimationFrame(loop); }
  draw();
  if (!reduced) loop();

  return { stop() { if (raf) cancelAnimationFrame(raf); } };
}

/* ─────────────── tiny DOM helpers ─────────────── */
const $ = (sel) => document.querySelector(sel);
const $$ = (sel) => [...document.querySelectorAll(sel)];

/* ─────────────── toasts ─────────────── */
function toast(msg, type = "success") {
  const box = document.createElement("div");
  box.className = `toast ${type}`;
  const icon = type === "success"
    ? '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"><path d="m4.5 12.5 5 5 10-11"/></svg>'
    : '<svg viewBox="0 0 24 24" fill="none"><path d="M13 2 4.5 13.5H11L10 22l8.5-11.5H13L13 2Z" fill="currentColor"/></svg>';
  box.innerHTML = `<span class="t-icon">${icon}</span><span>${esc(msg)}</span>`;
  $("#toasts").appendChild(box);
  setTimeout(() => { box.classList.add("out"); setTimeout(() => box.remove(), 380); }, 2600);
}

/* ─────────────── modal ─────────────── */
function openModal(html) {
  const bd = $("#modalBackdrop");
  $("#modalBox").innerHTML = html;
  bd.classList.remove("hidden", "closing");
}
function closeModal() {
  const bd = $("#modalBackdrop");
  bd.classList.add("closing");
  setTimeout(() => bd.classList.add("hidden"), 260);
}
function confirmModal({ title, body, confirmLabel = "Delete", onConfirm }) {
  openModal(`
    <div class="modal-icon"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 6h18M8 6V4a1 1 0 0 1 1-1h6a1 1 0 0 1 1 1v2m2 0v14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2V6"/></svg></div>
    <h4>${esc(title)}</h4>
    <p>${esc(body)}</p>
    <div class="modal-actions">
      <button class="btn btn-ghost" id="mCancel">Cancel</button>
      <button class="btn btn-danger" id="mConfirm">${esc(confirmLabel)}</button>
    </div>`);
  $("#mCancel").onclick = closeModal;
  $("#mConfirm").onclick = () => { closeModal(); onConfirm(); };
}
$("#modalBackdrop").addEventListener("click", (e) => { if (e.target.id === "modalBackdrop") closeModal(); });

/* ─────────────── state ─────────────── */
let expenses = Storage.getExpenses();
let userName = Storage.getName();
let currentPage = "dashboard";
let editingId = null;
let selectedCategory = null;
const charts = {}; // Chart.js instances

function persist() { Storage.setExpenses(expenses); }

/* ─────────────── router ─────────────── */
function go(page) {
  if (page === currentPage && $("#page-" + page)?.classList.contains("active")) return;
  currentPage = page;
  $$(".page").forEach(p => p.classList.remove("active"));
  const el = $("#page-" + page);
  el.classList.remove("active");
  void el.offsetWidth; // restart animation
  el.classList.add("active");
  $$("#sideNav .nav-item, #bottomNav .bn-item").forEach(b =>
    b.classList.toggle("active", b.dataset.page === page));
  if (page === "dashboard") renderDashboard();
  if (page === "analytics") renderAnalytics();
  if (page === "transactions") renderTransactions();
  if (page === "assistant") $("#chatText")?.focus();
  window.scrollTo({ top: 0, behavior: "smooth" });
}
$$("#sideNav .nav-item, #bottomNav .bn-item").forEach(b =>
  b.addEventListener("click", () => go(b.dataset.page)));

/* ─────────────── empty state helper ─────────────── */
function emptyStateHTML(title, body, cta = true) {
  return `<div class="empty glass">
    <div class="empty-orb">${'<svg viewBox="0 0 24 24" fill="none" style="width:64px;height:64px;margin:0 auto;color:#e11d2e"><path d="M13 2 4.5 13.5H11L10 22l8.5-11.5H13L13 2Z" fill="currentColor" opacity=".9"/></svg>'}</div>
    <h4>${esc(title)}</h4>
    <p>${esc(body)}</p>
    ${cta ? '<button class="btn btn-primary" onclick="go(\'add\')">Add your first expense</button>' : ""}
  </div>`;
}

/* ═══════════════ DASHBOARD ═══════════════ */
const SUMMARY_ICONS = {
  wallet: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20 7H5a2 2 0 0 1 0-4h13v4"/><path d="M4 5v14a2 2 0 0 0 2 2h14V7"/><path d="M16 13.5h.01"/></svg>',
  history: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 12a9 9 0 1 0 3-6.7L3 8"/><path d="M3 3v5h5M12 7v5l3.5 2"/></svg>',
  delta: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m3 17 6-6 4 4 8-8"/><path d="M15 7h6v6"/></svg>',
  pct: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M19 5 5 19"/><circle cx="7" cy="7" r="2.6"/><circle cx="17" cy="17" r="2.6"/></svg>',
  day: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3.5" y="4.5" width="17" height="16" rx="2.5"/><path d="M3.5 9.5h17M8 2.8v3.4M16 2.8v3.4"/></svg>',
  predict: '<svg viewBox="0 0 24 24" fill="none"><path d="M13 2 4.5 13.5H11L10 22l8.5-11.5H13L13 2Z" fill="currentColor"/></svg>',
  crown: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m3 8 4.5 4L12 5l4.5 7L21 8l-1.5 10h-15L3 8Z"/></svg>',
  spark: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3v3M12 18v3M3 12h3M18 12h3M5.6 5.6l2.1 2.1M16.3 16.3l2.1 2.1M18.4 5.6l-2.1 2.1M7.7 16.3l-2.1 2.1"/></svg>',
  list: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M8 6h13M8 12h13M8 18h13"/><circle cx="4" cy="6" r="1.3" fill="currentColor" stroke="none"/><circle cx="4" cy="12" r="1.3" fill="currentColor" stroke="none"/><circle cx="4" cy="18" r="1.3" fill="currentColor" stroke="none"/></svg>',
};

function renderDashboard() {
  const ym = currentMonthKey();
  const cur = Calc.currentMonthTotal(expenses);
  const last = Calc.lastMonthTotal(expenses);
  const diff = Calc.diff(expenses);
  const pct = Calc.pctChange(expenses);
  const avg = Calc.avgPerDay(expenses);
  const pred = Calc.predictedEOM(expenses);
  const hiCat = Calc.highestCategory(expenses, ym);
  const largest = Calc.largestExpense(expenses, ym);
  const txCount = Calc.inMonth(expenses, ym).length;

  // hero
  $("#heroDate").textContent = new Date().toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric", year: "numeric" });
  $("#userNameHero").textContent = userName || "there";
  $("#heroMonthPill").textContent = `${fmtCurrency(cur)} this month`;
  $("#heroTxPill").textContent = `${txCount} transaction${txCount === 1 ? "" : "s"}`;

  const up = diff > 0;
  const pctStr = pct === null ? "New spending data." : `${pct >= 0 ? "+" : ""}${pct.toFixed(1)}%`;
  const trendSvg = up
    ? '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M6 18 18 6M9 6h9v9"/></svg>'
    : '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M6 6l12 12M18 9v9H9"/></svg>';

  const cards = [
    { label: "Spent this month", value: fmtCurrency(cur), sub: fmtMonthLabel(ym), icon: SUMMARY_ICONS.wallet },
    { label: "Spent last month", value: fmtCurrency(last), sub: fmtMonthLabel(prevMonthKey()), icon: SUMMARY_ICONS.history },
    { label: "Vs last month", value: `${diff >= 0 ? "+" : "−"}${fmtCurrency(Math.abs(diff))}`, subHTML: pct === null ? `<span class="scard-sub">New spending data.</span>` : `<span class="trend ${up ? "up" : "down"}">${trendSvg}${pctStr}</span>`, icon: SUMMARY_ICONS.delta },
    { label: "Change", value: pct === null ? "—" : pctStr, sub: pct === null ? "New spending data." : (up ? "Higher than last month" : "Lower than last month"), icon: SUMMARY_ICONS.pct },
    { label: "Average per day", value: fmtCurrency(avg), sub: `Across ${new Date().getDate()} day${new Date().getDate() === 1 ? "" : "s"} so far`, icon: SUMMARY_ICONS.day },
    { label: "Predicted end of month", value: fmtCurrency(pred), sub: `${Calc.daysInCurrentMonth()} days at current pace`, icon: SUMMARY_ICONS.predict },
    { label: "Highest category", value: hiCat ? hiCat.category : "—", sub: hiCat ? fmtCurrency(hiCat.total) : "No data yet", icon: SUMMARY_ICONS.crown },
    { label: "Largest expense", value: largest ? fmtCurrency(largest.amount) : "—", sub: largest ? `${largest.category}${largest.note ? " · " + largest.note : ""}` : "No data yet", icon: SUMMARY_ICONS.spark },
    { label: "Transactions", value: String(txCount), sub: "This month", icon: SUMMARY_ICONS.list },
  ];

  $("#summaryGrid").innerHTML = cards.map((c, i) => `
    <div class="scard glass" style="--i:${i}">
      <div class="scard-top"><span class="scard-label">${c.label}</span><span class="scard-icon">${c.icon}</span></div>
      <div class="scard-value">${esc(c.value)}</div>
      ${c.subHTML || `<div class="scard-sub">${esc(c.sub || "")}</div>`}
    </div>`).join("");

  renderInsights();
}

/* ─────────────── insights (rule-based) ─────────────── */
function buildInsights() {
  const ym = currentMonthKey();
  const out = [];
  const cur = Calc.currentMonthTotal(expenses);
  const last = Calc.lastMonthTotal(expenses);
  const pct = Calc.pctChange(expenses);

  if (!expenses.length) return out;

  if (pct === null) {
    out.push({ good: true, title: "Fresh start", body: `New spending data — ${fmtCurrency(cur)} recorded this month with no prior month to compare.` });
  } else if (pct >= 0) {
    out.push({ good: false, title: "Spending is up", body: `Total spending increased ${pct.toFixed(1)}% vs last month (${fmtCurrency(cur)} vs ${fmtCurrency(last)}).` });
  } else {
    out.push({ good: true, title: "Spending is down", body: `Total spending decreased ${Math.abs(pct).toFixed(1)}% vs last month (${fmtCurrency(cur)} vs ${fmtCurrency(last)}).` });
  }

  const foodNow = Calc.categoryTotals(expenses, ym).find(([c]) => c === "Food")?.[1] || 0;
  const foodLast = Calc.categoryTotals(expenses, prevMonthKey()).find(([c]) => c === "Food")?.[1] || 0;
  if (foodNow || foodLast) {
    if (foodLast > 0) {
      const fp = ((foodNow - foodLast) / foodLast) * 100;
      out.push({
        good: fp < 0,
        title: fp >= 0 ? "Food spending increased" : "Food spending decreased",
        body: `${fmtCurrency(foodNow)} this month vs ${fmtCurrency(foodLast)} last month (${fp >= 0 ? "+" : ""}${fp.toFixed(1)}%).`,
      });
    } else {
      out.push({ good: true, title: "Food spending", body: `${fmtCurrency(foodNow)} on Food so far this month.` });
    }
  }

  out.push({ good: true, title: "End-of-month forecast", body: `At the current pace you'll finish the month around ${fmtCurrency(Calc.predictedEOM(expenses))}.` });

  const hi = Calc.highestCategory(expenses, ym);
  if (hi) out.push({ good: false, title: "Largest category", body: `${hi.category} leads this month at ${fmtCurrency(hi.total)} — ${((hi.total / (cur || 1)) * 100).toFixed(0)}% of everything you spent.` });

  const lg = Calc.largestExpense(expenses, ym);
  if (lg) out.push({ good: false, title: "Largest single expense", body: `${fmtCurrency(lg.amount)} on ${lg.category}${lg.note ? ` (${lg.note})` : ""}, ${fmtDate(lg.date)}.` });

  out.push({ good: true, title: "Average daily burn", body: `You're averaging ${fmtCurrency(Calc.avgPerDay(expenses))} per day this month.` });

  const wk = Calc.weekdaySeries(expenses, ym);
  const maxW = wk.reduce((m, w) => (w.total > m.total ? w : m), wk[0]);
  if (maxW.total > 0) {
    const full = { Sun: "Sunday", Mon: "Monday", Tue: "Tuesday", Wed: "Wednesday", Thu: "Thursday", Fri: "Friday", Sat: "Saturday" }[maxW.name];
    out.push({ good: false, title: "Most expensive weekday", body: `${full}s hit hardest — ${fmtCurrency(maxW.total)} spent on ${full}s this month.` });
  }
  return out;
}

function renderInsights() {
  const list = buildInsights();
  const grid = $("#insightGrid");
  if (!list.length) {
    grid.innerHTML = emptyStateHTML("No insights yet", "Add a few expenses and SpendSight will start reading your patterns, sir.");
    return;
  }
  const up = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M6 18 18 6M9 6h9v9"/></svg>';
  const ok = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="m4.5 12.5 5 5 10-11"/></svg>';
  grid.innerHTML = list.map((ins, i) => `
    <div class="insight glass" style="--i:${i}">
      <span class="insight-icon ${ins.good ? "green" : ""}">${ins.good ? ok : up}</span>
      <div><b>${esc(ins.title)}</b><p>${esc(ins.body)}</p></div>
    </div>`).join("");
}

/* ═══════════════ ADD / EDIT FORM ═══════════════ */
function renderCatGrid() {
  $("#catGrid").innerHTML = CATEGORIES.map(c => `
    <button type="button" class="cat-chip ${selectedCategory === c ? "selected" : ""}" data-cat="${c}">
      <span class="ci">${catIcon(c)}</span>${c}
    </button>`).join("");
  $$("#catGrid .cat-chip").forEach(b => b.addEventListener("click", () => {
    selectedCategory = b.dataset.cat;
    $$("#catGrid .cat-chip").forEach(x => x.classList.toggle("selected", x.dataset.cat === selectedCategory));
    $("#errCategory").textContent = "";
  }));
}

function resetForm() {
  editingId = null;
  selectedCategory = null;
  $("#expenseForm").reset();
  $("#fDate").value = todayISO();
  $("#btnSaveLabel").textContent = "Save expense";
  $("#btnCancelEdit").classList.add("hidden");
  ["errAmount", "errDate", "errCategory"].forEach(id => $("#" + id).textContent = "");
  renderCatGrid();
}

function startEdit(id) {
  const e = expenses.find(x => x.id === id);
  if (!e) return;
  editingId = id;
  selectedCategory = e.category;
  $("#fAmount").value = e.amount;
  $("#fDate").value = e.date;
  $("#fNote").value = e.note || "";
  $("#btnSaveLabel").textContent = "Update expense";
  $("#btnCancelEdit").classList.remove("hidden");
  renderCatGrid();
  go("add");
}

$("#btnCancelEdit").addEventListener("click", () => { resetForm(); go("transactions"); });

$("#expenseForm").addEventListener("submit", (ev) => {
  ev.preventDefault();
  const amount = parseFloat($("#fAmount").value);
  const date = $("#fDate").value;
  const note = $("#fNote").value.trim();
  let ok = true;

  const fail = (errId, msg, inputSel) => {
    $("#" + errId).textContent = msg; ok = false;
    const f = $(inputSel).closest(".field");
    f.classList.remove("shake"); void f.offsetWidth; f.classList.add("shake");
  };

  $("#errAmount").textContent = ""; $("#errDate").textContent = ""; $("#errCategory").textContent = "";
  if ($("#fAmount").value === "" || isNaN(amount)) fail("errAmount", "Amount is required.", "#fAmount");
  else if (amount <= 0) fail("errAmount", "Amount must be greater than 0.", "#fAmount");
  if (!date) fail("errDate", "Date is required.", "#fDate");
  if (!selectedCategory) fail("errCategory", "Pick a category.", "#catGrid");
  if (!ok) return;

  const now = new Date().toISOString();
  if (editingId) {
    const e = expenses.find(x => x.id === editingId);
    Object.assign(e, { amount, date, note, category: selectedCategory, updatedAt: now });
    persist();
    toast("Expense updated");
  } else {
    expenses.push({ id: uid(), amount, category: selectedCategory, date, note, createdAt: now, updatedAt: now });
    persist();
    toast(`Saved ${fmtCurrency(amount)} — ${selectedCategory}`);
  }
  resetForm();
  renderDashboard();
  go("dashboard");
});

/* ═══════════════ TRANSACTIONS ═══════════════ */
function populateMonthSelect(sel, includeAll) {
  const months = Calc.monthsAvailable(expenses);
  sel.innerHTML =
    (includeAll ? `<option value="all">All months</option>` : "") +
    months.map(m => `<option value="${m}">${fmtMonthLabel(m)}</option>`).join("");
}

function populateCategorySelect(sel) {
  sel.innerHTML = `<option value="all">All categories</option>` +
    CATEGORIES.map(c => `<option value="${c}">${c}</option>`).join("");
}

function renderTransactions() {
  const mSel = $("#txMonth"), cSel = $("#txCategory");
  const prevM = mSel.value, prevC = cSel.value;
  populateMonthSelect(mSel, true);
  populateCategorySelect(cSel);
  if ([...mSel.options].some(o => o.value === prevM)) mSel.value = prevM;
  if ([...cSel.options].some(o => o.value === prevC)) cSel.value = prevC;

  const q = $("#txSearch").value.trim().toLowerCase();
  const month = mSel.value || "all";
  const cat = cSel.value || "all";
  const sort = $("#txSort").value;

  let list = [...expenses];
  if (month !== "all") list = list.filter(e => monthKeyOf(e.date) === month);
  if (cat !== "all") list = list.filter(e => e.category === cat);
  if (q) list = list.filter(e =>
    (e.note || "").toLowerCase().includes(q) || e.category.toLowerCase().includes(q));

  list.sort((a, b) => {
    if (sort === "newest") return b.date.localeCompare(a.date) || (b.createdAt || "").localeCompare(a.createdAt || "");
    if (sort === "oldest") return a.date.localeCompare(b.date) || (a.createdAt || "").localeCompare(b.createdAt || "");
    if (sort === "highest") return b.amount - a.amount;
    return a.amount - b.amount;
  });

  const box = $("#txList");
  if (!expenses.length) {
    $("#txSummary").innerHTML = "";
    box.innerHTML = emptyStateHTML("Nothing recorded yet", "Your ledger is a blank page, sir. Give me the first line.");
    return;
  }
  if (!list.length) {
    $("#txSummary").innerHTML = "";
    box.innerHTML = emptyStateHTML("No matches", "No expenses match these filters. Loosen the search and try again.", false);
    return;
  }

  $("#txSummary").innerHTML = `<b>${list.length}</b> expense${list.length === 1 ? "" : "s"} · total <b>${fmtCurrency(Calc.total(list))}</b>`;
  box.innerHTML = list.map((e, i) => `
    <div class="tx-row glass" style="--i:${Math.min(i, 12)}" id="tx-${e.id}">
      <span class="tx-icon">${catIcon(e.category)}</span>
      <div class="tx-main">
        <b>${esc(e.note || e.category)}</b>
        <small>${esc(e.category)} · ${fmtDate(e.date)}</small>
      </div>
      <span class="tx-amt">${fmtCurrency(e.amount)}</span>
      <div class="tx-actions">
        <button class="icon-btn" data-edit="${e.id}" aria-label="Edit">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17 3.5 20.5 7 8 19.5 3.5 20.5 4.5 16 17 3.5Z"/></svg>
        </button>
        <button class="icon-btn" data-del="${e.id}" aria-label="Delete">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 6h18M8 6V4a1 1 0 0 1 1-1h6a1 1 0 0 1 1 1v2m2 0v14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2V6"/></svg>
        </button>
      </div>
    </div>`).join("");

  $$("#txList [data-edit]").forEach(b => b.addEventListener("click", () => startEdit(b.dataset.edit)));
  $$("#txList [data-del]").forEach(b => b.addEventListener("click", () => {
    const e = expenses.find(x => x.id === b.dataset.del);
    confirmModal({
      title: "Delete this expense?",
      body: `${fmtCurrency(e.amount)} — ${e.category}${e.note ? ` (${e.note})` : ""}. This can't be undone.`,
      onConfirm: () => {
        const row = $("#tx-" + e.id);
        if (row) row.classList.add("removing");
        setTimeout(() => {
          expenses = expenses.filter(x => x.id !== e.id);
          persist();
          renderTransactions();
          renderDashboard();
          toast("Expense deleted");
        }, 320);
      },
    });
  }));
}
["txSearch", "txMonth", "txCategory", "txSort"].forEach(id =>
  $("#" + id).addEventListener("input", renderTransactions));

/* ═══════════════ ANALYTICS (Chart.js) ═══════════════ */
const CHART_RED = "#e11d2e";
const CHART_PALETTE = ["#e11d2e", "#ff6b76", "#14161d", "#66708a", "#f4a2a9", "#ffd3d7", "#98a1b8", "#b30f1f", "#dfe4ee", "#ff9aa3"];

function baseChartOpts() {
  return {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: { display: false },
      tooltip: {
        backgroundColor: "rgba(255,255,255,.95)",
        titleColor: "#14161d",
        bodyColor: "#66708a",
        borderColor: "rgba(20,24,34,.1)",
        borderWidth: 1,
        padding: 12,
        cornerRadius: 12,
        titleFont: { family: "Sora", weight: "700" },
        bodyFont: { family: "Inter" },
        displayColors: false,
        callbacks: { label: (c) => " " + fmtCurrency(c.parsed.y ?? c.parsed) },
      },
    },
    scales: {
      x: { grid: { display: false }, ticks: { color: "#98a1b8", font: { family: "Inter", size: 11 } }, border: { display: false } },
      y: { grid: { color: "rgba(20,24,34,.05)" }, border: { display: false }, ticks: { color: "#98a1b8", font: { family: "Inter", size: 11 }, callback: (v) => fmtCurrencyShort(v) } },
    },
    animation: { duration: 900, easing: "easeOutQuart" },
  };
}

function destroyChart(key) { if (charts[key]) { charts[key].destroy(); delete charts[key]; } }

function renderAnalytics() {
  const hasChartJs = typeof Chart !== "undefined";
  const sel = $("#anMonth");
  const prev = sel.value;
  populateMonthSelect(sel, false);
  sel.value = [...sel.options].some(o => o.value === prev) ? prev : currentMonthKey();
  const ym = sel.value || currentMonthKey();
  const label = fmtMonthLabel(ym);
  $("#chPieSub").textContent = label;
  $("#chLineSub").textContent = label;
  $("#topFiveSub").textContent = label;

  /* top 5 */
  const top = Calc.topExpenses(expenses, ym, 5);
  $("#topFive").innerHTML = top.length
    ? top.map((e, i) => `<li><span class="top-rank">${i + 1}</span>
        <div class="top-info"><b>${esc(e.note || e.category)}</b><small>${esc(e.category)} · ${fmtDate(e.date)}</small></div>
        <span class="top-amt">${fmtCurrency(e.amount)}</span></li>`).join("")
    : `<li style="justify-content:center;color:var(--slate-2);font-size:.85rem">No expenses in ${esc(label)} yet.</li>`;

  /* category ranking */
  const cats = Calc.categoryTotals(expenses, ym);
  const monthTotal = cats.reduce((s, [, t]) => s + t, 0);
  $("#rankList").innerHTML = cats.length
    ? cats.map(([c, t]) => {
        const pct = monthTotal ? (t / monthTotal) * 100 : 0;
        return `<div class="rank-row">
          <span class="rank-name"><span class="ci">${catIcon(c)}</span>${esc(c)}</span>
          <div class="rank-bar"><div class="rank-fill" data-w="${pct.toFixed(1)}"></div></div>
          <span class="rank-val"><b>${fmtCurrency(t)}</b> · ${pct.toFixed(1)}%</span>
        </div>`;
      }).join("")
    : `<p style="color:var(--slate-2);font-size:.85rem;text-align:center;padding:10px">Nothing to rank yet, sir.</p>`;
  requestAnimationFrame(() =>
    $$("#rankList .rank-fill").forEach(f => (f.style.width = f.dataset.w + "%")));

  if (!hasChartJs) {
    // Graceful fallback: lists above still render; chart canvases get a friendly note.
    $$(".chart-body").forEach(b => {
      if (b.querySelector("canvas") && !b.querySelector(".chart-fallback")) {
        const n = document.createElement("p");
        n.className = "chart-fallback";
        n.textContent = "Charts are unavailable — chart.umd.min.js didn't load. Your data and stats above are unaffected.";
        b.appendChild(n);
      }
    });
    return;
  }

  /* bar: monthly comparison */
  const series = Calc.monthlySeries(expenses, 6);
  destroyChart("bar");
  charts.bar = new Chart($("#chBar"), {
    type: "bar",
    data: {
      labels: series.map(s => s.label),
      datasets: [{
        data: series.map(s => s.total),
        backgroundColor: series.map(s => (s.ym === ym ? CHART_RED : "rgba(20,24,34,.10)")),
        hoverBackgroundColor: CHART_RED,
        borderRadius: 10,
        borderSkipped: false,
        maxBarThickness: 46,
      }],
    },
    options: baseChartOpts(),
  });

  /* pie: category breakdown */
  destroyChart("pie");
  const pieOpts = baseChartOpts();
  delete pieOpts.scales;
  pieOpts.plugins.legend = {
    display: true, position: "bottom",
    labels: { color: "#66708a", font: { family: "Inter", size: 11 }, boxWidth: 9, boxHeight: 9, borderRadius: 5, usePointStyle: true, padding: 12 },
  };
  pieOpts.plugins.tooltip.callbacks = { label: (c) => ` ${fmtCurrency(c.parsed)}` };
  pieOpts.cutout = "62%";
  charts.pie = new Chart($("#chPie"), {
    type: "doughnut",
    data: {
      labels: cats.map(([c]) => c),
      datasets: [{
        data: cats.map(([, t]) => t),
        backgroundColor: cats.map((_, i) => CHART_PALETTE[i % CHART_PALETTE.length]),
        borderColor: "rgba(255,255,255,.9)",
        borderWidth: 2.5,
        hoverOffset: 8,
      }],
    },
    options: pieOpts,
  });

  /* line: daily trend */
  const daily = Calc.dailySeries(expenses, ym);
  destroyChart("line");
  const lineOpts = baseChartOpts();
  charts.line = new Chart($("#chLine"), {
    type: "line",
    data: {
      labels: daily.map(d => d.day),
      datasets: [{
        data: daily.map(d => d.total),
        borderColor: CHART_RED,
        borderWidth: 2.4,
        pointRadius: 0,
        pointHoverRadius: 5,
        pointHoverBackgroundColor: CHART_RED,
        pointHoverBorderColor: "#fff",
        pointHoverBorderWidth: 2,
        tension: 0.38,
        fill: true,
        backgroundColor: (c) => {
          const { ctx, chartArea } = c.chart;
          if (!chartArea) return "rgba(225,29,46,.08)";
          const g = ctx.createLinearGradient(0, chartArea.top, 0, chartArea.bottom);
          g.addColorStop(0, "rgba(225,29,46,.22)");
          g.addColorStop(1, "rgba(225,29,46,0)");
          return g;
        },
      }],
    },
    options: lineOpts,
  });

  /* weekday bars */
  const wk = Calc.weekdaySeries(expenses, ym);
  const maxWk = Math.max(...wk.map(w => w.total));
  destroyChart("week");
  charts.week = new Chart($("#chWeek"), {
    type: "bar",
    data: {
      labels: wk.map(w => w.name),
      datasets: [{
        data: wk.map(w => w.total),
        backgroundColor: wk.map(w => (w.total === maxWk && maxWk > 0 ? CHART_RED : "rgba(225,29,46,.18)")),
        hoverBackgroundColor: CHART_RED,
        borderRadius: 9,
        borderSkipped: false,
        maxBarThickness: 34,
      }],
    },
    options: baseChartOpts(),
  });
}
$("#anMonth").addEventListener("change", renderAnalytics);

/* ═══════════════ ASSISTANT (rule-based, local only) ═══════════════ */
function botAnswer(qRaw) {
  const q = qRaw.toLowerCase();
  const sir = () => (userName ? `${userName} sir` : "sir");
  const ym = currentMonthKey();

  if (/help/.test(q)) {
    return `Here's what I can read from your saved data, ${sir()}:\n• "how much did I spend this month"\n• "last month"\n• "predict next month"\n• "highest category"\n• "largest expense"\n• "food spending"\n• "show insights"\nAll of it stays on this device.`;
  }
  if (/(this month|spend this|month so far|how much did i spend)/.test(q) && !/last/.test(q)) {
    const t = Calc.currentMonthTotal(expenses);
    const n = Calc.inMonth(expenses, ym).length;
    return n
      ? `You've spent ${fmtCurrency(t)} this month across ${n} transaction${n === 1 ? "" : "s"}, ${sir()}. That's ${fmtCurrency(Calc.avgPerDay(expenses))} per day on average.`
      : `Nothing recorded this month yet, ${sir()}. A clean slate — let's keep it deliberate.`;
  }
  if (/last month/.test(q)) {
    const t = Calc.lastMonthTotal(expenses);
    return t > 0
      ? `Last month closed at ${fmtCurrency(t)}, ${sir()}.`
      : `I have no expenses saved for last month, ${sir()}.`;
  }
  if (/predict|forecast|next month|end of month/.test(q)) {
    if (!Calc.inMonth(expenses, ym).length) return `I need at least one expense this month to project a forecast, ${sir()}.`;
    return `At your current pace of ${fmtCurrency(Calc.avgPerDay(expenses))}/day, I project roughly ${fmtCurrency(Calc.predictedEOM(expenses))} by the end of this month, ${sir()}. Assume next month runs similar unless you change the pattern.`;
  }
  if (/highest|top category|biggest category/.test(q)) {
    const hi = Calc.highestCategory(expenses, ym);
    if (!hi) return `No category data for this month yet, ${sir()}.`;
    const pct = (hi.total / (Calc.currentMonthTotal(expenses) || 1)) * 100;
    return `${hi.category} is your heaviest category this month — ${fmtCurrency(hi.total)}, about ${pct.toFixed(0)}% of total spend, ${sir()}.`;
  }
  if (/largest|biggest expense|max expense/.test(q)) {
    const lg = Calc.largestExpense(expenses, ym);
    return lg
      ? `Your largest single expense this month: ${fmtCurrency(lg.amount)} on ${lg.category}${lg.note ? ` — "${lg.note}"` : ""} (${fmtDate(lg.date)}), ${sir()}.`
      : `No expenses recorded this month yet, ${sir()}.`;
  }
  if (/food/.test(q)) {
    const f = Calc.categoryTotals(expenses, ym).find(([c]) => c === "Food")?.[1] || 0;
    const fl = Calc.categoryTotals(expenses, prevMonthKey()).find(([c]) => c === "Food")?.[1] || 0;
    if (!f && !fl) return `No Food expenses on record for this month or last, ${sir()}.`;
    let s = `Food this month: ${fmtCurrency(f)}, ${sir()}.`;
    if (fl > 0) {
      const p = ((f - fl) / fl) * 100;
      s += ` That's ${p >= 0 ? "up" : "down"} ${Math.abs(p).toFixed(1)}% from last month's ${fmtCurrency(fl)}.`;
    }
    return s;
  }
  if (/insight|summary|report|overview/.test(q)) {
    const ins = buildInsights();
    if (!ins.length) return `No data to analyze yet, ${sir()}. Feed me some expenses first.`;
    return ins.slice(0, 5).map(i => `• ${i.body}`).join("\n");
  }
  if (/^(hi|hello|hey|yo)\b/.test(q)) {
    return `Hello ${sir()}, I'm watching your spending patterns. Ask me about this month, a prediction, your highest category, or your largest expense.`;
  }
  return `I can only read your saved spending data for now, sir. Try asking about this month, prediction, category, or largest expense.`;
}

function addMsg(text, who) {
  const div = document.createElement("div");
  div.className = `msg ${who}`;
  div.textContent = text;
  $("#chatBody").appendChild(div);
  $("#chatBody").scrollTop = $("#chatBody").scrollHeight;
  return div;
}

let botBusy = false;
function askBot(q) {
  if (botBusy || !q.trim()) return;
  botBusy = true;
  addMsg(q, "user");
  const typing = document.createElement("div");
  typing.className = "msg bot typing";
  typing.innerHTML = "<i></i><i></i><i></i>";
  $("#chatBody").appendChild(typing);
  $("#chatBody").scrollTop = $("#chatBody").scrollHeight;
  setTimeout(() => {
    typing.remove();
    addMsg(botAnswer(q), "bot");
    botBusy = false;
  }, 650 + Math.random() * 550);
}

$("#chatForm").addEventListener("submit", (e) => {
  e.preventDefault();
  const v = $("#chatText").value;
  $("#chatText").value = "";
  askBot(v);
});
$$("#chatChips button").forEach(b => b.addEventListener("click", () => askBot(b.dataset.q)));

/* ═══════════════ DATA CONTROLS ═══════════════ */
function demoData() {
  const now = new Date();
  const rand = (a, b) => Math.round((a + Math.random() * (b - a)) * 100) / 100;
  const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];
  const notes = {
    Food: ["Groceries", "Chipotle", "Coffee run", "Late night pizza", "Meal prep haul"],
    Gas: ["Shell fill-up", "QT gas", "Road trip fuel"],
    Shopping: ["New hoodie", "Amazon order", "Sneakers", "Desk setup"],
    Entertainment: ["Movie night", "Spotify", "Game pass", "Concert ticket"],
    Phone: ["Phone bill"], Rent: ["Monthly rent"], Tuition: ["Tuition installment"],
    Debt: ["Card payment"], Emergency: ["Car repair", "Urgent care copay"], Other: ["Haircut", "Gift", "Laundry"],
  };
  const out = [];
  for (let m = 0; m < 3; m++) {
    const base = new Date(now.getFullYear(), now.getMonth() - m, 1);
    const days = m === 0 ? now.getDate() : new Date(base.getFullYear(), base.getMonth() + 1, 0).getDate();
    // fixed costs
    out.push(mk("Rent", rand(780, 820), base, 1));
    out.push(mk("Phone", rand(45, 65), base, Math.min(5, days)));
    // variable
    const n = 14 + Math.floor(Math.random() * 8);
    for (let i = 0; i < n; i++) {
      const cat = pick(["Food", "Food", "Food", "Gas", "Shopping", "Entertainment", "Other", "Debt"]);
      const ranges = { Food: [6, 62], Gas: [22, 58], Shopping: [12, 140], Entertainment: [8, 55], Other: [5, 45], Debt: [40, 120] };
      out.push(mk(cat, rand(...ranges[cat]), base, 1 + Math.floor(Math.random() * days)));
    }
  }
  function mk(category, amount, base, day) {
    const d = new Date(base.getFullYear(), base.getMonth(), day);
    const iso = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
    const ts = new Date().toISOString();
    return { id: uid(), amount, category, date: iso, note: pick(notes[category]), createdAt: ts, updatedAt: ts };
  }
  expenses = expenses.concat(out);
  persist();
  renderDashboard();
  toast(`${out.length} demo expenses loaded`);
}

$("#btnDemo").addEventListener("click", demoData);

$("#btnExport").addEventListener("click", () => {
  if (!expenses.length) return toast("Nothing to export yet", "info");
  const blob = new Blob([JSON.stringify({ app: "SpendSight", exportedAt: new Date().toISOString(), expenses }, null, 2)], { type: "application/json" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = `spendsight-export-${todayISO()}.json`;
  a.click();
  URL.revokeObjectURL(a.href);
  toast("Exported to JSON");
});

$("#btnImport").addEventListener("click", () => $("#importFile").click());
$("#importFile").addEventListener("change", (ev) => {
  const file = ev.target.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = () => {
    try {
      const data = JSON.parse(reader.result);
      const list = Array.isArray(data) ? data : data.expenses;
      if (!Array.isArray(list)) throw new Error();
      const clean = list
        .filter(e => e && Number(e.amount) > 0 && typeof e.date === "string" && /^\d{4}-\d{2}-\d{2}/.test(e.date))
        .map(e => ({
          id: e.id || uid(),
          amount: Number(e.amount),
          category: CATEGORIES.includes(e.category) ? e.category : "Other",
          date: e.date.slice(0, 10),
          note: String(e.note || "").slice(0, 80),
          createdAt: e.createdAt || new Date().toISOString(),
          updatedAt: e.updatedAt || new Date().toISOString(),
        }));
      if (!clean.length) throw new Error();
      const existing = new Set(expenses.map(e => e.id));
      const merged = clean.filter(e => !existing.has(e.id));
      expenses = expenses.concat(merged);
      persist();
      renderDashboard();
      toast(`Imported ${merged.length} expense${merged.length === 1 ? "" : "s"}`);
    } catch {
      toast("That file isn't valid SpendSight JSON", "info");
    }
    ev.target.value = "";
  };
  reader.readAsText(file);
});

$("#btnClear").addEventListener("click", () => {
  confirmModal({
    title: "Clear all data?",
    body: "Every expense saved on this device will be erased. Export a backup first if you want one. This cannot be undone.",
    confirmLabel: "Erase everything",
    onConfirm: () => {
      expenses = [];
      Storage.clearAll();
      renderDashboard();
      toast("All data cleared");
    },
  });
});

/* ═══════════════ WELCOME / INIT ═══════════════ */
function enterApp(firstTime) {
  $("#app").classList.remove("hidden");
  $("#userNameSide").textContent = userName;
  $("#userInitial").textContent = (userName[0] || "S").toUpperCase();
  createPlasmaOrb($("#orbHero"), { bolts: 5 });
  createPlasmaOrb($("#orbChat"), { bolts: 3 });
  renderCatGrid();
  $("#fDate").value = todayISO();
  renderDashboard();
  // seed assistant greeting
  if (!$("#chatBody").children.length) {
    addMsg(`Hello ${userName} sir, I'm watching your spending patterns. Ask me anything about your money — it never leaves this device.`, "bot");
  }
  if (firstTime) setTimeout(() => toast(`Welcome, ${userName} sir ⚡`), 400);
}

function showWelcome() {
  const w = $("#welcome");
  w.classList.remove("hidden");
  createPlasmaOrb($("#orbWelcome"), { bolts: 6 });
  const input = $("#nameInput");
  setTimeout(() => input.focus(), 400);
  const submit = () => {
    const name = input.value.trim();
    if (!name) {
      input.closest(".welcome-form").classList.remove("shake");
      void input.offsetWidth;
      input.closest(".welcome-form").classList.add("shake");
      input.focus();
      return;
    }
    userName = name;
    Storage.setName(name);
    const prefs = Storage.getPrefs();
    prefs.onboardedAt = new Date().toISOString();
    Storage.setPrefs(prefs);
    w.classList.add("leaving");
    setTimeout(() => { w.classList.add("hidden"); enterApp(true); }, 520);
  };
  $("#nameSubmit").addEventListener("click", submit);
  input.addEventListener("keydown", (e) => { if (e.key === "Enter") submit(); });
}

document.addEventListener("keydown", (e) => { if (e.key === "Escape") closeModal(); });

/* ─────────────── crash-proof startup ───────────────
   Guarantee: the page is never blank. Either the welcome
   screen or the dashboard becomes visible; if anything
   throws, a readable error panel is shown instead.      */
function showFatalError(err) {
  console.error("[SpendSight] startup failed:", err);
  const panel = document.createElement("div");
  panel.setAttribute("style",
    "position:fixed;inset:0;z-index:999;display:grid;place-items:center;padding:24px;" +
    "background:#f5f7fb;font-family:system-ui,sans-serif;color:#14161d;text-align:center;");
  panel.innerHTML =
    '<div style="max-width:440px;background:#fff;border:1px solid rgba(20,24,34,.1);' +
    'border-radius:22px;padding:30px;box-shadow:0 14px 38px rgba(22,28,45,.1);">' +
    '<div style="font-size:2rem;margin-bottom:10px;">⚡</div>' +
    '<h2 style="margin:0 0 8px;font-size:1.2rem;">SpendSight hit a snag</h2>' +
    '<p style="margin:0 0 14px;color:#66708a;font-size:.9rem;line-height:1.5;">' +
    "Something went wrong while starting the app. Refresh the page to try again. " +
    "Your saved data is untouched.</p>" +
    '<code style="display:block;background:#f2f4fa;border-radius:12px;padding:10px;' +
    'font-size:.72rem;color:#b30f1f;word-break:break-word;">' +
    String(err && err.message ? err.message : err).slice(0, 300) + "</code>" +
    '<button onclick="location.reload()" style="margin-top:16px;padding:11px 22px;border:0;' +
    'border-radius:14px;background:#e11d2e;color:#fff;font-weight:600;cursor:pointer;">Reload</button>' +
    "</div>";
  document.body.appendChild(panel);
}

(function init() {
  console.log("[SpendSight] starting…");
  try {
    if (typeof Chart === "undefined") {
      console.warn("[SpendSight] Chart.js not found — charts disabled, everything else works.");
    }
    if (userName) enterApp(false);
    else showWelcome();

    // Never-blank guarantee: if neither surface is visible, force the welcome screen.
    const welcomeHidden = $("#welcome").classList.contains("hidden");
    const appHidden = $("#app").classList.contains("hidden");
    if (welcomeHidden && appHidden) {
      console.warn("[SpendSight] no surface visible — forcing welcome screen.");
      showWelcome();
    }
    console.log("[SpendSight] ready. Data:", expenses.length, "expenses · user:", userName || "(new)");
  } catch (err) {
    showFatalError(err);
  }
})();
