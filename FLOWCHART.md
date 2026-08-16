# SilverInsight AI — Application Flowchart

A React + Vite single-page app on the **Base44** platform. It fetches silver/gold
price history, detects peaks/dips, runs spectral (PSD) analysis, generates
AI-driven forecasts and event explanations, and gates "Pro" features behind a
credit system.

---

## 1. Boot & Authentication Flow

```mermaid
flowchart TD
    A[main.jsx<br/>ReactDOM.render] --> B[App.jsx]
    B --> C[AuthProvider]
    C --> D[QueryClientProvider]
    D --> E[Router + ScrollToTop]
    E --> F[AuthenticatedApp]

    C -.on mount.-> G[checkAppState]
    G --> H[GET /public-settings/by-id/:appId]
    H -->|success + token| I[checkUserAuth<br/>base44.auth.me]
    H -->|success, no token| J[isAuthenticated = false]
    H -->|403 auth_required| K[authError: auth_required]
    H -->|403 user_not_registered| L[authError: user_not_registered]

    I -->|ok| M[user set,<br/>isAuthenticated = true]
    I -->|401/403| K

    F --> N{loading<br/>settings/auth?}
    N -->|yes| O[Spinner]
    N -->|no| P{authError?}
    P -->|user_not_registered| Q[UserNotRegisteredError]
    P -->|auth_required| R[navigateToLogin<br/>redirect]
    P -->|none| S[Render Routes]
```

## 2. Routing Map

```mermaid
flowchart LR
    S[Routes] --> R1["/  → Home"]
    S --> R2["/event → EventDetail"]
    S --> R3["/forecast-performance → ForecastPerformance"]
    S --> R4["/terms → Terms"]
    S --> A1["/login → Login"]
    S --> A2["/register → Register"]
    S --> A3["/forgot-password → ForgotPassword"]
    S --> A4["/reset-password → ResetPassword"]
    S --> A5["* → PageNotFound"]

    A1 -.->|loginViaEmailPassword<br/>loginWithProvider google| M[base44.auth]
    A2 -.->|register → verifyOtp → setToken| M
    A3 -.->|resetPasswordRequest| M
    A4 -.->|resetPassword| M
```

## 3. Home Page — Core Data & Analysis Flow

```mermaid
flowchart TD
    H[Home mount] --> LC[loadCache asset<br/>from localStorage]
    H --> ME{isAuthenticated?}
    ME -->|yes| CR[base44.auth.me → credits<br/>grant initial credits if new]

    subgraph Prices
      FP[fetchSilverPrices function<br/>asset, dateFrom, dateTo, interval] --> RAW[raw OHLC points]
      RAW --> RB[rebin points → binSize]
      RB --> PK[detectPeaks / detectDips<br/>peakDetection.js]
      RB --> PSD[Welch/periodogram PSD<br/>welchPsd.js]
      PK --> EV[allEvents list]
    end

    LC --> FP
    EV --> UI[SilverChart · PsdChart · PeakCards]

    UI --> USER{User action}
    USER -->|Analyze event| AS[analyzeSingle]
    USER -->|Analyze all| AB[analyze bulk]
    USER -->|Run forecast| HF[handleForecast]

    AS --> LLM1[base44.integrations.Core.InvokeLLM<br/>gemini_3_flash + web search<br/>→ JSON event explanation]
    LLM1 --> ST[analysisStore.set<br/>localStorage + sessionStorage]
    AB --> AS
    ST --> UI
```

The **analysisStore** (`src/lib/analysisStore.js`) is a module-level pub/sub cache
that survives component unmounts and persists per-asset to `localStorage`, so
in-flight and completed event analyses survive navigation and reloads.

## 4. Forecast Flow — Pro vs Lite (credit gating)

```mermaid
flowchart TD
    HF[handleForecast] --> CP[Build payload:<br/>asset, last 1260 points,<br/>currentPrice, forecastDays]
    CP --> AUTH{isAuthenticated?}

    AUTH -->|yes<br/>PRO path| PRO[functions.invoke<br/>runProAnalysis]
    PRO --> ERR{res.data.error?}
    ERR -->|No credits / 402| OUT[Show 'no Pro credits left'<br/>Lite still available]
    ERR -->|ok| CRED[Update credits from<br/>_creditsRemaining]
    CRED --> SAVE[UploadFile snapshot.json<br/>→ AnalysisReport.create tier=pro]
    SAVE --> RES[setForecastResult]

    AUTH -->|no<br/>LITE path| LITE[functions.invoke<br/>marketIntelligence lite=true]
    LITE --> RES

    RES --> FPANEL[ForecastPanel renders<br/>forecast + drivers]
```

**Credits are granted, never bought.** The Stripe purchase flow —
`stripeCreateCheckout`, `stripeWebhook` and `BuyCreditsModal` — was removed from
this build. The only source of credits is the initial grant of 3 to a
first-time authenticated user (`Home.jsx`, via `auth.updateMe`); the grant uses
`max(existing, 3)` so it never reduces a balance that is already higher.
Running out of Pro credits is therefore terminal for that account, and the UI
says so rather than offering a purchase that no longer exists. Lite forecasts
are unaffected.

`CreditLedger` keeps its `stripe_purchase` enum value and `stripeSessionId`
field so historical rows stay valid; nothing writes either any more.

## 5. Backend Functions & Entities (Base44 SDK surface)

```mermaid
flowchart LR
    subgraph Functions["base44.functions.invoke"]
      F1[fetchSilverPrices]
      F2[runProAnalysis]
      F3[marketIntelligence]
      F5[getForecastPerformance]
    end

    subgraph Integrations["base44.integrations.Core"]
      I1[InvokeLLM<br/>event/consensus/news]
      I2[UploadFile<br/>report snapshots]
    end

    subgraph Entities["base44.entities"]
      E1[AnalysisReport]
      E2[CreditLedger]
      E3[StructuralDriver]
    end

    subgraph Auth["base44.auth"]
      X1[me / updateMe]
      X2[login / register / OTP]
      X3[logout / redirectToLogin]
      X4[password reset]
    end
```

**Feature → API mapping**

| Feature | Component / Page | Base44 call |
|---|---|---|
| Price history | Home, EventDetail | `functions.fetchSilverPrices` |
| Pro forecast | Home | `functions.runProAnalysis` |
| Lite forecast | Home | `functions.marketIntelligence` (lite) |
| Event explanation | Home, EventDetail | `integrations.Core.InvokeLLM` |
| External consensus / live news | ExternalConsensus, LiveNewsDot | `integrations.Core.InvokeLLM` |
| Saved reports | SavedReports, Home | `entities.AnalysisReport`, `UploadFile` |
| Credit balance & history | CreditHistory, Home | `auth.updateMe` (initial grant), `entities.CreditLedger` (read-only) |
| Structural drivers (admin) | StructuralDriversPanel | `entities.StructuralDriver` |
| Forecast accuracy | ForecastPerformance | `functions.getForecastPerformance` |
| Auth | Login/Register/… | `base44.auth.*` |
