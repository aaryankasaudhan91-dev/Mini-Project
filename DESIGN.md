# Stitch Design System Specification: Grand Horizon Hotel

## 1. Visual Theme & Philosophy
- **Identity:** Clean, minimalist, and luxury coastal hospitality.
- **Color Mode:** `LIGHT`
- **Theme Color Scheme:** Coastal Light Blue-Green (Teal & Sky Blue)
- **Geometry & Roundness:** `ROUND_TWELVE` (12px card borders) with `ROUND_FULL` (pill badges).
- **Elevation System:** Soft diffusion with teal-tinted ambient shadows (`0 4px 16px -2px rgba(13, 148, 136, 0.08)`).

---

## 2. Design Tokens

### Color Palette
- **Primary (Deep Coastal Teal):** `#0f766e` (Hover: `#115e59`, Light Wash: `#f0fdfa`)
- **Accent (Ice Sky Blue):** `#0284c7` (Hover: `#0369a1`, Light Wash: `#f0f9ff`)
- **Surface (Clean Card Background):** `#ffffff`
- **Canvas / Background:** `#f8fafc`
- **Border Light:** `#e2e8f0`
- **Border Teal Accent:** `rgba(13, 148, 136, 0.2)`
- **Success:** `#059669` (Bg: `#d1fae5`)
- **Warning / Maintenance:** `#d97706` (Bg: `#fef3c7`)
- **Danger:** `#dc2626` (Bg: `#fee2e2`)

### Typography
- **Headline Font:** `Plus Jakarta Sans` (Weights: 500, 600, 700, 800)
- **Body Font:** `Inter` (Weights: 400, 500, 600)
- **Scale:**
  - Hero Title: `3rem` (Weight: 800, tracking: `-0.03em`)
  - Section Headers: `1.8rem` (Weight: 800, tracking: `-0.02em`)
  - Card Titles: `1.25rem` (Weight: 700)
  - Body Text: `0.92rem` (Weight: 400, line-height: `1.5`)
  - Labels & Chips: `0.78rem` (Weight: 700, uppercase, tracking: `0.05em`)

---

## 3. Core Component Architectures

### 1. Navigation Header
- Glassmorphic backdrop (`rgba(255, 255, 255, 0.92)`, `backdrop-filter: blur(12px)`).
- Sticky positioning with brand logo icon badge and pill-shaped user badges.

### 2. Demo Account Quick-Fill Cards
- Designed for instant review and testing.
- Features one-click auto-fill for:
  - **👑 Hotel Staff / Admin:** `admin@horizon.com` / `admin123`
  - **🧳 Guest / Customer:** `customer@horizon.com` / `guest123`

### 3. Room Inventory Cards
- Aspect ratio media container with floating pill category badges.
- Dynamic nightly rate counter formatted with currency symbols.
- Direct booking triggers opening modal workflows.

### 4. KPI Metric Cards (Operations Console)
- Clean rectangular cards with color-coded accent indicators.
- Live PostgreSQL aggregated calculations (Total Rooms, Active Bookings, Occupancy %, Revenue).
