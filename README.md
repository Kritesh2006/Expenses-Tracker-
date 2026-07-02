# ⚡ SpendSight

**A premium, frontend-only personal expense analytics dashboard.**
No backend. No login. No cloud. Your data never leaves your browser.

Light-glass fintech UI with a living red plasma-orb brand visual, real analytics, an end-of-month spending predictor, and a built-in rule-based assistant — all in vanilla HTML/CSS/JS.

---

## ✨ Features

- **Dashboard** — 9 live summary cards: this month, last month, difference, % change, average per day, predicted end-of-month, highest category, largest expense, transaction count
- **Add / edit expenses** — validated form with shiny category chips (10 default categories)
- **Transactions** — search, month filter, category filter, 4 sort modes, edit & animated delete with confirmation
- **Analytics** — monthly comparison bar chart, category doughnut, daily trend line, weekday breakdown, top-5 expenses, animated category ranking bars (Chart.js, vendored locally so it works offline)
- **SpendSight Assistant** — rule-based local chatbot with typing animation and quick-command chips. Understands: *this month, last month, predict, highest category, largest expense, food spending, show insights, help*
- **Insights** — auto-generated, rule-based reading of your patterns (spend up/down, food trend, forecast, most expensive weekday…)
- **Data controls** — one-click demo data, export JSON, import JSON, clear-all with confirmation
- **Design** — light iOS-style glassmorphism, red lightning accent, animated canvas plasma orb, page transitions, card entrance stagger, toasts, empty states, `prefers-reduced-motion` respected
- **Responsive** — desktop glass sidebar layout; mobile feels like a native iPhone app with a floating bottom tab bar

## 🔒 Privacy

Everything is stored in `localStorage`:

| Key | Contents |
|---|---|
| `spendsight_expenses` | your expense list |
| `spendsight_user_name` | your display name |
| `spendsight_preferences` | app preferences |

Export a JSON backup anytime. Clearing browser data clears the app.

## 🚀 Run it

No build step. No dependencies to install.

```bash
git clone https://github.com/YOUR_USERNAME/spendsight.git
cd spendsight
# open index.html in a browser, or:
npx serve .
```

### Deploy to GitHub Pages

1. Push this repo to GitHub
2. **Settings → Pages → Source: Deploy from a branch → main / (root)**
3. Your app is live at `https://YOUR_USERNAME.github.io/spendsight/`

## 🧠 Prediction math

```
avgPerDay      = currentMonthTotal / currentDayOfMonth
predictedEOM   = avgPerDay × daysInCurrentMonth
daysInMonth    = new Date(year, month + 1, 0).getDate()
pctChange      = ((current − last) / last) × 100   // "New spending data." if last = 0
```

## 📁 Structure

```
index.html              app shell (welcome, dashboard, add, analytics, transactions, assistant)
style.css               design system: glass tokens, components, animations, responsive
main.js                 storage · formatters · calculations · plasma orb engine ·
                        router · dashboard · form · transactions · charts · assistant
chart.umd.min.js        Chart.js 4 (bundled in root — works offline)
LICENSE                 MIT
```

## 🛠 Stack

Vanilla JS (ES2020) · CSS custom properties + backdrop-filter · Canvas 2D (plasma orb) · Chart.js 4 · localStorage

---

Built as a portfolio piece by **[NxtLevelKD](https://github.com/Kritesh2006)** — full-stack developer & AI systems builder.
