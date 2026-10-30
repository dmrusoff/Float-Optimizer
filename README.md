# ⚡ Float Optimizer — Algorithmic Credit Float & Cash-Flow Engine

An interactive quantitative credit-float and cash-flow optimization engine built with **React 18**, **TypeScript**, and **Tailwind CSS**.

**Float Optimizer** ranks credit cards in real time for upcoming purchases to maximize interest-free float days while protecting credit utilization, aligning due dates with incoming cash-flow streams, and preventing balance concentration.

---

## 🧠 Core Quantitative Engine (`src/lib/float/engine.ts`)

### 1. Multi-Factor Card Scoring Algorithm
Each card is dynamically evaluated for a hypothetical purchase amount $P$ using a normalized 4-factor composite score:

$$\text{Score} = 0.40 \cdot S_{\text{float}} + 0.30 \cdot S_{\text{headroom}} + 0.20 \cdot S_{\text{cashflow}} + 0.10 \cdot S_{\text{concentration}}$$

| Factor | Weight | Description |
| :--- | :--- | :--- |
| **Float Window ($S_{\text{float}}$)** | **40%** | Days between today, next statement close, and the payment due date ($\text{daysUntilClose} + \text{graceDays}$). |
| **Utilization Headroom ($S_{\text{headroom}}$)** | **30%** | Remaining credit limit before breaching the user's target utilization threshold (default `30%`), applying a `0.5x` penalty if breached. |
| **Cash-Flow Alignment ($S_{\text{cashflow}}$)** | **20%** | Proximity of the card's next payment due date to projected income deposits (bi-weekly paychecks, fixed-day distributions, or 4th-Wednesday schedules). |
| **Anti-Concentration ($S_{\text{concentration}}$)** | **10%** | Penalizes cards that already carry a disproportionate share of total revolving balances ($1 - \frac{B_i}{\sum B}$). |

### 2. 60-Day Cash-Outflow & Income Projection
- Simulates statement closes, grace periods, and payment due dates across rolling 30/60/90-day horizons.
- Models recurring bi-weekly, monthly fixed-day, and $n\text{th}$-weekday income streams to surface net liquidity windows.

### 3. Due-Date Stagger Analysis
- Evaluates clustering across card due dates and computes a **Stagger Score** (`0–100`).
- Automatically recommends optimal due-date adjustments when cards cluster within `< 5` days of each other.

### 4. Automated Risk Warnings
- ⚠️ **Payment Due Before Income**: Flags near-term card payments that fall before the next expected deposit.
- 📊 **High Utilization**: Warns when a card exceeds target utilization (`30%` warning, `70%` critical).
- ⚖️ **Concentration Risk**: Alerts when `> 60%` of total revolving balance sits on a single card.
- 📅 **Due-Date Clustering**: Highlights clustered due dates and suggests target dates to smooth cash outflows.
- 💸 **High 30-Day Outflows**: Alerts when upcoming 30-day obligations exceed `80%` of estimated monthly spend.

---

## 🛠️ Tech Stack

- **Frontend**: React 18, TypeScript, Tailwind CSS, Lucide Icons
- **State Persistence**: LocalStorage with JSON import/export + optional **Supabase** real-time sync
- **Build Tooling**: Vite 8

---

## 🚀 Getting Started

```bash
git clone https://github.com/dmrusoff/Float-Optimizer.git
cd Float-Optimizer
npm install
npm run dev
```
