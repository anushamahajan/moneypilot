// MoneyPilot onboarding funnel — router, product-flow state, and screens.
// The scoring/classification engine and card-rendering primitives live in
// app.js and are untouched; this file is the "product experience" wrapper
// around them: connect → scan → reveal → select → details → review → offer
// → plans → trust → faq.
//
// Nothing here talks to a real backend. Every simulated step (Google
// connect, PDF filing, payment) is called out below and in the dev-note on
// the FAQ screen, matching this project's existing "flag, don't silently
// fake" convention from app.js and the original claims feed.

// --- Product-flow state (in-memory only, not persisted) --------------------

const state = {
  connectedEmail: null,
  feed: [],                 // set once by #/scanning, frozen after that
  selectedIds: new Set(),
  remindedIds: new Set(),
  textedIds: new Set(),
  searchQuery: "",
  claimant: { firstName: "", lastName: "", address: "", country: "United States", city: "", region: "", zip: "", email: "" },
  reviewIndex: 0,
  selectedPlan: null,
};

function selectedClaims() {
  return state.feed.filter((c) => state.selectedIds.has(c.claim_id));
}

// --- Router ------------------------------------------------------------------
// Hash-based: this is served via a plain static file server with no rewrite
// rules, so a hard refresh on a real path like /claims would 404. Hash
// routes always resolve to the same index.html, so refresh/back/forward all
// work without any server config.

const SCREENS = {
  "/": renderHero1,
  "/2": renderHero2,
  "/3": renderHero3,
  "/connect": renderConnect,
  "/scanning": renderScanning,
  "/reveal": renderReveal,
  "/claims": renderClaimsScreen,
  "/details": renderDetails,
  "/review": renderReview,
  "/offer": renderOffer,
  "/plans": renderPlans,
  "/dashboard": renderDashboard,
  "/trust": renderTrust,
  "/faq": renderFaq,
};

// Routes at or past claims selection require a scanned feed — deep-linking
// or refreshing into them without that state redirects to the start rather
// than crashing on missing data.
const REQUIRES_FEED = new Set(["/claims", "/details", "/review", "/offer", "/plans", "/dashboard", "/trust", "/faq"]);

function currentRoute() {
  const hash = location.hash.replace(/^#/, "");
  return hash || "/";
}

function navigate(route) {
  if (currentRoute() === route) {
    render(); // same-route re-render (e.g. after a state mutation)
  } else {
    location.hash = route;
  }
}

function render() {
  const route = currentRoute();
  if (REQUIRES_FEED.has(route) && state.feed.length === 0) {
    location.hash = "/";
    return;
  }
  const screenFn = SCREENS[route] || renderHero1;
  window.scrollTo(0, 0);
  screenFn();
}

window.addEventListener("hashchange", render);

// --- Shared UI helpers --------------------------------------------------------

function mount(html) {
  const app = document.getElementById("app");
  app.innerHTML = html;
  return app;
}

function topBar({ back } = {}) {
  return `
    <header class="flow-topbar">
      ${back ? `<button type="button" class="back-btn" data-nav="${back}" aria-label="Back">‹</button>` : '<span class="back-btn-spacer"></span>'}
      <div class="logo">
        <span class="logo-mark">$</span>
        <span class="logo-word">Money<span class="logo-word-accent">Pilot</span></span>
      </div>
      <span class="back-btn-spacer"></span>
    </header>
  `;
}

// Wires up every element with a data-nav attribute to navigate() on click.
// Call after mount() on every screen that uses topBar()/ctaButton() output.
function wireNav(root) {
  root.querySelectorAll("[data-nav]").forEach((el) => {
    el.addEventListener("click", () => navigate(el.dataset.nav));
  });
}

// Recognizable companies used purely as illustrative examples on marketing
// screens (name-dropped per product feedback), separate from BRAND_STYLE
// above which drives real claim matching. Not every brand shown here has a
// claim in claims.json — this row is "the kind of company we cover," not a
// promise every one is eligible right now.
const EXAMPLE_BRANDS = [
  { name: "Instagram", color: "#E1306C", mono: "IG" },
  { name: "Adobe", color: "#DA1F26", mono: "AD" },
  { name: "Amazon", color: "#00A8E1", mono: "AM" },
  { name: "Netflix", color: "#E50914", mono: "NF" },
  { name: "Spotify", color: "#1DB954", mono: "SP" },
  { name: "Uber", color: "#141414", mono: "UB" },
  { name: "T-Mobile", color: "#E20074", mono: "TM" },
  { name: "Google", color: "#4285F4", mono: "GO" },
];

function brandStrip(label) {
  return `
    <div class="brand-strip">
      <p class="brand-strip-label">${label}</p>
      <div class="brand-strip-row">
        ${EXAMPLE_BRANDS.map((b) => `
          <span class="brand-chip">
            <span class="brand-chip-dot" style="background:${b.color}">${b.mono}</span>
            ${b.name}
          </span>
        `).join("")}
      </div>
    </div>
  `;
}

function howItWorks() {
  const steps = [
    { icon: "1", title: "Connect your inbox", body: "Takes about 10 seconds. Read-only access to sender and subject lines only." },
    { icon: "2", title: "We scan for proof you were a customer", body: "Receipts, renewal notices, price-increase emails — the same evidence a lawyer would ask for." },
    { icon: "3", title: "Get matched to real claims", body: "Every match is scored and explained in plain language, not just a generic \"you may be eligible.\"" },
    { icon: "4", title: "File in one click, track your payout", body: "We prepare the paperwork. You watch it move from filed to paid on your personal dashboard." },
  ];
  return `
    <div class="how-it-works">
      <p class="how-it-works-title">How MoneyPilot works</p>
      <div class="how-it-works-steps">
        ${steps.map((s) => `
          <div class="how-step">
            <span class="how-step-num">${s.icon}</span>
            <div class="how-step-copy">
              <h3>${s.title}</h3>
              <p>${s.body}</p>
            </div>
          </div>
        `).join("")}
      </div>
    </div>
  `;
}

function problemSolution() {
  return `
    <div class="problem-solution">
      <div class="ps-card ps-problem">
        <h3>😤 The problem</h3>
        <p>
          Companies like Meta, Equifax, T-Mobile, and dozens of others settle
          lawsuits worth billions every year. Most of that money goes
          unclaimed — not because people aren't eligible, but because nobody
          tells them they are, and the claim forms are confusing.
        </p>
      </div>
      <div class="ps-card ps-solution">
        <h3>✅ The MoneyPilot fix</h3>
        <p>
          Your inbox already has proof of what you've paid for — receipts,
          renewal notices, price-hike emails. MoneyPilot reads that evidence
          (never the message body) and matches you to claims automatically,
          instead of making you guess through a generic quiz.
        </p>
      </div>
    </div>
  `;
}

function heroScreen({ back, eyebrow, headline, subtext, ctaLabel, ctaNav, extra }) {
  mount(`
    ${topBar({ back })}
    <main class="hero-screen">
      <div class="hero-copy">
        ${eyebrow ? `<p class="hero-eyebrow">${eyebrow}</p>` : ""}
        <h1 class="hero-headline">${headline}</h1>
        <p class="hero-subtext">${subtext}</p>
        <button type="button" class="btn-pill btn-pill-black" data-nav="${ctaNav}">${ctaLabel} →</button>
      </div>
      ${extra || ""}
    </main>
  `);
  wireNav(document);
}

// --- Screens: landing (reused/trimmed hero pattern) --------------------------

function renderHero1() {
  heroScreen({
    headline: `There's <span class="hl">cash out</span> there with <span class="hl">your name on it</span>.`,
    subtext: "Companies owe people money from lawsuits all the time. Most never claim it — MoneyPilot reads your inbox and finds it for you, automatically.",
    ctaLabel: "Next",
    ctaNav: "/2",
    extra: brandStrip("We've already found matches for customers of:"),
  });
}

function renderHero2() {
  heroScreen({
    back: "/",
    headline: `We find the <span class="hl">payouts</span>. You get the <span class="hl">cash</span>`,
    subtext: "We scan your inbox for claims you're eligible for — no 9-question quiz, no guessing. Just real evidence from real emails.",
    ctaLabel: "Next",
    ctaNav: "/3",
    extra: problemSolution(),
  });
}

function renderHero3() {
  heroScreen({
    back: "/2",
    headline: `<span class="hl">$1.2B</span> went unclaimed last year alone! 🚨`,
    subtext: "Most customers forget to claim their settlements. Here's exactly how we make sure you don't:",
    ctaLabel: "Next",
    ctaNav: "/connect",
    extra: howItWorks(),
  });
}

// --- Screen: connect inbox (replaces the real product's 9-question quiz) -----
// The "Continue with Google" button uses the standard multi-color G mark and
// label — the normal, widely-used "Sign in with Google" pattern. It does NOT
// show a fake Google login/password form: clicking it goes straight to an
// app-side "Connecting…" spinner and then the mock dataset. A cloned Google
// credential page would read as a phishing surface; this doesn't.

const COLLAGE_POSITIONS = [
  { top: "0px", left: "6%", rotate: "-8deg" },
  { top: "10px", left: "30%", rotate: "6deg" },
  { top: "0px", left: "54%", rotate: "-4deg" },
  { top: "14px", left: "78%", rotate: "9deg" },
  { top: "40px", left: "18%", rotate: "4deg" },
  { top: "44px", left: "64%", rotate: "-6deg" },
];

function brandCollageVisual() {
  const icons = EXAMPLE_BRANDS.slice(0, 6).map((b, i) => {
    const p = COLLAGE_POSITIONS[i];
    return `<span class="collage-icon" style="top:${p.top};left:${p.left};background:${b.color};transform:rotate(${p.rotate})">${b.mono}</span>`;
  }).join("");
  return `
    <div class="visual-card">
      <p class="visual-card-title">📥 Your inbox is full of unclaimed money</p>
      <div class="collage">
        <div class="collage-icons">${icons}</div>
        <div class="collage-folder">Unclaimed money</div>
      </div>
    </div>
  `;
}

function scanAnimationVisual() {
  return `
    <div class="visual-card">
      <p class="visual-card-title">🔍 We scan for the emails that matter</p>
      <div class="scan-illustration">
        <span class="scan-mail">📧</span>
        <span class="scan-mail">🧾</span>
        <span class="scan-mail">📧</span>
        <span class="scan-glass">🔎</span>
      </div>
    </div>
  `;
}

function readCompareVisual() {
  return `
    <div class="visual-card">
      <p class="visual-card-title">🔐 What we read vs. what we never touch</p>
      <div class="read-compare">
        <div class="read-col yes">
          <strong>✅ We read</strong>
          Sender address<br />Subject line<br />Date
        </div>
        <div class="read-col no">
          <strong>❌ We never read</strong>
          Email body<br />Attachments<br />Contacts
        </div>
      </div>
    </div>
  `;
}

function trustBadgesVisual() {
  return `
    <div class="visual-card">
      <p class="visual-card-title">🛡️ Why people trust us with this</p>
      <div class="trust-badges">
        <span class="trust-badge">🔒 Bank-level encryption</span>
        <span class="trust-badge">🚫 We never sell your data</span>
        <span class="trust-badge">⚡ Takes about 10 seconds</span>
        <span class="trust-badge">↩️ Disconnect anytime</span>
      </div>
    </div>
  `;
}

// --- Screen: connect inbox (replaces the real product's 9-question quiz) -----
// The "Continue with Google" button uses the standard multi-color G mark and
// label — the normal, widely-used "Sign in with Google" pattern. It does NOT
// show a fake Google login/password form: clicking it goes straight to an
// app-side "Connecting…" spinner and then the mock dataset. A cloned Google
// credential page would read as a phishing surface; this doesn't.
// Five illustrative blocks below the CTA (collage, scan animation, read/never
// -read comparison, trust badges, how-it-works) per product feedback that
// this screen especially needed more visual explanation of what's happening.

function renderConnect() {
  const app = mount(`
    ${topBar({ back: "/3" })}
    <main class="hero-screen">
      <div class="hero-copy">
        <h1 class="hero-headline">Connect your inbox and we'll find it for you</h1>
        <p class="hero-subtext">
          Somewhere in your inbox is proof you paid for Netflix, Amazon Prime,
          Adobe, or a dozen other things you forgot about — and that proof is
          exactly what a real settlement claim needs. We read the sender and
          subject line only, never the body, and we never share or sell
          anything. Connect once and we'll do the matching for you.
        </p>
        <button type="button" id="google-connect-btn" class="google-btn">
          <span class="google-g">
            <span></span><span></span><span></span><span></span>
          </span>
          Continue with Google
        </button>
        <p class="hero-finetext">This demo connects to a fixed sample inbox, not your real Gmail.</p>
      </div>

      <div class="visual-grid">
        ${brandCollageVisual()}
        ${scanAnimationVisual()}
        ${readCompareVisual()}
        ${trustBadgesVisual()}
      </div>

      ${howItWorks()}
    </main>
  `);
  wireNav(document);

  app.querySelector("#google-connect-btn").addEventListener("click", () => {
    state.connectedEmail = "demo.user@gmail.com";
    navigate("/scanning");
  });
}

// --- Screen: scanning ---------------------------------------------------------

function renderScanning() {
  mount(`
    ${topBar()}
    <main class="scanning-screen">
      <div class="scanning-spinner"></div>
      <h1 class="scanning-headline">Scanning your inbox<span class="dots"></span></h1>
      <p class="scanning-subtext">Matching your emails to claims</p>
      <div id="scan-error" class="scan-error" hidden></div>
    </main>
  `);

  loadMockData()
    .then(({ claims, emails }) => {
      state.feed = computeFeed(claims, emails);
      state.feed.forEach((c) => state.selectedIds.add(c.claim_id)); // default all selected
      setTimeout(() => navigate("/reveal"), 1400); // brief, deliberate pause — not a real scan duration
    })
    .catch((err) => {
      const el = document.getElementById("scan-error");
      el.hidden = false;
      el.innerHTML =
        `Couldn't load claims.json / mock_emails.json. If you opened this file ` +
        `directly in the browser, run a local server instead, e.g. ` +
        `<code>python3 -m http.server</code> in this folder, then reopen it over ` +
        `http://localhost.`;
      console.error(err);
    });
}

// --- Screen: reveal ------------------------------------------------------------

function renderReveal() {
  const total = state.feed.reduce((sum, c) => sum + parsePayout(c.estimated_payout).high, 0);
  mount(`
    ${topBar()}
    <main class="hero-screen">
      <div class="hero-copy">
        <p class="hero-eyebrow">Based on your inbox</p>
        <h1 class="hero-headline">You might be owed up to <span class="hl">$${total}</span></h1>
        <p class="reveal-disclaimer">
          * This estimate is based on the receipts, renewals, and price-change
          emails matched to your inbox above. It is not a guarantee of payment.
          Actual results depend on eligibility, settlement or arbitration
          outcomes, and other factors, and may be lower, higher, or zero.
        </p>
        <button type="button" class="btn-pill btn-pill-black" data-nav="/claims">Next →</button>
      </div>
    </main>
  `);
  wireNav(document);
}

// --- Screen: claims picker -----------------------------------------------------
// Reuses app.js's renderCard() and scoring output as-is; adds the checkbox
// selection / search / sticky-total UI that was previously the whole app.

const TIER_SECTION = {
  High: { label: "⭐ Your top matches", className: "section-divider-high" },
  Medium: { label: "Good matches, worth a look", className: "section-divider-medium" },
  Low: { label: "Lower confidence, still worth checking", className: "section-divider-low" },
};

function renderClaimsScreen() {
  mount(`
    ${topBar({ back: "/reveal" })}
    <main class="page claims-page page-with-bar">
      <div class="feed-header">
        <h1 class="section-title">Choose From These Claims</h1>
        <p class="section-subtitle">
          Claim opportunities are matched from your inbox and may include active
          settlements or pending arbitration matters. Eligibility, timelines, and
          payouts vary by claim, and compensation is never guaranteed.
        </p>
      </div>

      <div class="search-row">
        <div class="search-box">
          <span class="search-icon">🔍</span>
          <input id="search-input" type="text" placeholder="Search claims by brand" />
        </div>
        <button type="button" id="rescan-btn" class="rescan-btn" title="Re-read claims.json / mock_emails.json">🔄 Rescan inbox</button>
      </div>

      <div id="status" class="status-banner" hidden></div>
      <div id="feed" class="feed" aria-live="polite"></div>
      <div id="empty-state" class="empty-state" hidden>
        <p>No claims found in your inbox right now.</p>
      </div>

      <footer class="dev-note">
        <details>
          <summary>For engineering — how this screen works</summary>
          <div class="dev-note-body">
            <p>
              Scored exactly per <code>algorithm_spec.md</code> §4 using the live
              current date for recency. The mock inbox includes extra recent,
              in-window emails for Amazon Prime (→ High) and Peloton / Adobe
              Creative Cloud (→ Medium) so all three confidence tiers are visible;
              Netflix, Spotify, and Planet Fitness are left as honest Low-tier
              "lapsed subscriber" cases. Formula itself is unmodified.
            </p>
            <p>
              "Rescan inbox" re-reads <code>claims.json</code> /
              <code>mock_emails.json</code> from disk on demand — edits there are
              reflected without a rebuild. It's manual rather than automatic here
              (unlike the original single-screen build) so editing the files
              mid-checkout can't silently pull a claim out from under a filled-in
              form on a later screen.
            </p>
            <p>
              "Continue with Google," the PDF review screen, and the plan picker
              are all simulated — no real OAuth, no real filing, no real payment
              processing happens anywhere in this build.
            </p>
          </div>
        </details>
      </footer>
    </main>

    <div id="action-bar" class="action-bar">
      <div class="action-bar-inner">
        <div class="action-bar-copy">
          <span id="action-count" class="action-count">0 selected</span>
          <span id="action-total" class="action-total"></span>
        </div>
        <button type="button" id="action-cta" class="btn-pill btn-pill-black">Next →</button>
      </div>
    </div>
  `);
  wireNav(document);
  renderClaimsList();

  document.getElementById("search-input").addEventListener("input", (ev) => {
    state.searchQuery = ev.target.value;
    renderClaimsList();
  });

  document.getElementById("action-cta").addEventListener("click", () => {
    if (state.selectedIds.size === 0) return;
    navigate("/details");
  });

  document.getElementById("rescan-btn").addEventListener("click", async () => {
    try {
      const { claims, emails } = await loadMockData();
      const freshFeed = computeFeed(claims, emails);
      const freshIds = new Set(freshFeed.map((c) => c.claim_id));
      // Newly-appeared claims default to selected; claims the user removed
      // stay removed; claims no longer matched drop out of the selection.
      const knownIds = new Set(state.feed.map((c) => c.claim_id));
      for (const id of freshIds) if (!knownIds.has(id)) state.selectedIds.add(id);
      for (const id of [...state.selectedIds]) if (!freshIds.has(id)) state.selectedIds.delete(id);
      state.feed = freshFeed;
      renderClaimsList();
      flashBanner("Updated from claims.json / mock_emails.json");
    } catch (err) {
      console.warn("Rescan failed:", err.message);
      toast("Couldn't re-read the JSON files — check they're valid.");
    }
  });
}

function renderClaimsList() {
  const q = state.searchQuery.trim().toLowerCase();
  const filtered = q
    ? state.feed.filter((c) => c.brand.toLowerCase().includes(q) || c.title.toLowerCase().includes(q))
    : state.feed;

  const feedEl = document.getElementById("feed");
  const emptyEl = document.getElementById("empty-state");
  feedEl.innerHTML = "";

  if (filtered.length === 0) {
    feedEl.hidden = true;
    emptyEl.hidden = false;
  } else {
    feedEl.hidden = false;
    emptyEl.hidden = true;
    let lastTier = null;
    for (const claim of filtered) {
      if (claim.tier !== lastTier) {
        const section = TIER_SECTION[claim.tier];
        const divider = document.createElement("p");
        divider.className = `section-divider ${section.className}`;
        divider.textContent = section.label;
        feedEl.appendChild(divider);
        lastTier = claim.tier;
      }
      feedEl.appendChild(renderCard(claim, {
        isSelected: state.selectedIds.has(claim.claim_id),
        isReminded: state.remindedIds.has(claim.claim_id),
        isTexted: state.textedIds.has(claim.claim_id),
        onToggleSelect: (checked) => {
          if (checked) state.selectedIds.add(claim.claim_id);
          else state.selectedIds.delete(claim.claim_id);
          renderClaimsList();
        },
        onToggleRemind: () => {
          const nowOn = !state.remindedIds.has(claim.claim_id);
          if (nowOn) state.remindedIds.add(claim.claim_id); else state.remindedIds.delete(claim.claim_id);
          toast(nowOn ? `We'll ping your phone about your ${claim.brand} claim.` : `Turned off phone reminders for ${claim.brand}.`);
          renderClaimsList();
        },
        onToggleText: () => {
          const nowOn = !state.textedIds.has(claim.claim_id);
          if (nowOn) state.textedIds.add(claim.claim_id); else state.textedIds.delete(claim.claim_id);
          toast(nowOn ? `We'll text you updates on your ${claim.brand} claim.` : `Turned off text updates for ${claim.brand}.`);
          renderClaimsList();
        },
      }));
    }
  }

  updateClaimsFooter();
}

function updateClaimsFooter() {
  const selected = selectedClaims();
  const count = selected.length;
  const total = selected.reduce((sum, c) => sum + parsePayout(c.estimated_payout).high, 0);
  const goal = state.feed.reduce((sum, c) => sum + parsePayout(c.estimated_payout).high, 0);

  document.getElementById("action-count").textContent = `${count} selected`;
  document.getElementById("action-total").textContent = goal > 0 ? `$${total} / $${goal}` : "";
  document.getElementById("action-cta").disabled = count === 0;
}

function flashBanner(message) {
  const el = document.getElementById("status");
  if (!el) return;
  el.textContent = message;
  el.hidden = false;
  el.style.opacity = "1";
  clearTimeout(flashBanner._t);
  flashBanner._t = setTimeout(() => {
    el.style.opacity = "0";
    setTimeout(() => { el.hidden = true; }, 400);
  }, 1600);
}

// --- Screen: claimant details form ---------------------------------------------

function renderDetails() {
  const claims = selectedClaims();
  const c = state.claimant;
  if (!c.email && state.connectedEmail) c.email = state.connectedEmail;

  const app = mount(`
    ${topBar({ back: "/claims" })}
    <main class="page page-with-bar">
      <h1 class="form-title">Fill out your details</h1>
      <p class="hero-subtext">We'll reuse these details for ${claims.length} claim${claims.length === 1 ? "" : "s"}.</p>

      <p class="form-label">Selected claims</p>
      <div class="claim-chip-row">
        ${claims.map((claim) => {
          const style = brandStyleFor(claim);
          return `<span class="claim-chip"><span class="claim-chip-dot" style="background:${style.color}"></span>${escapeHtml(claim.brand)}</span>`;
        }).join("")}
      </div>

      <h2 class="form-subheading">Claimant information</h2>
      ${formField("firstName", "First Name", c.firstName, true)}
      ${formField("lastName", "Last Name", c.lastName, true)}
      ${formField("address", "Street Address", c.address, true)}
      ${formField("city", "City", c.city, true)}
      ${formField("region", "State / Region", c.region, false)}
      ${formField("zip", "ZIP / Postal Code", c.zip, true)}
      ${formField("email", "Email Address", c.email, true)}
    </main>

    <div class="action-bar">
      <div class="action-bar-inner two-btn">
        <button type="button" class="btn-pill btn-pill-outline" data-nav="/review">Skip for now</button>
        <button type="button" id="details-next" class="btn-pill btn-pill-green">Next →</button>
      </div>
    </div>
  `);
  wireNav(document);

  app.querySelectorAll("[data-field]").forEach((input) => {
    input.addEventListener("input", (ev) => {
      state.claimant[ev.target.dataset.field] = ev.target.value;
    });
  });

  document.getElementById("details-next").addEventListener("click", () => {
    state.reviewIndex = 0;
    navigate("/review");
  });
}

function formField(field, label, value, required) {
  return `
    <label class="form-field">
      <span class="form-field-label">${label}${required ? ' <span class="req">*</span>' : ""}</span>
      <input type="text" data-field="${field}" value="${escapeHtml(value || "")}" placeholder="${label}" />
    </label>
  `;
}

// --- Screen: per-claim review (mock "auto-filled form") ------------------------
// Deliberately fictional case numbers / processor name and a visible "sample"
// footer, so this can't be mistaken for a real settlement authorization
// document — unlike the reference screenshot's real-looking case number and
// processor name, which this intentionally does not reproduce.

function renderReview() {
  const claims = selectedClaims();
  const i = state.reviewIndex;
  const claim = claims[i];
  if (!claim) { navigate("/offer"); return; }

  const c = state.claimant;
  const fullName = [c.firstName, c.lastName].filter(Boolean).join(" ") || "Your Name";
  const isLast = i === claims.length - 1;

  mount(`
    ${topBar({ back: "/details" })}
    <main class="page review-page page-with-bar">
      <div class="review-progress"><div class="review-progress-fill" style="width:${((i + 1) / claims.length) * 100}%"></div></div>
      <h1 class="form-title">Claim ${i + 1} of ${claims.length}: ${escapeHtml(claim.title)}</h1>
      <p class="hero-subtext">The claim form has been automatically filled with the information you provided.</p>

      <div class="pdf-mock">
        <div class="pdf-mock-header">${escapeHtml(claim.brand.toUpperCase())} CLAIM FORM<span>PAGE 1 OF 1</span></div>
        <div class="pdf-mock-body">
          <p class="pdf-mock-title">Claim Filing Authorization (Sample)</p>
          <p class="pdf-mock-case">Demo Case No. DEMO-${claim.claim_id.slice(0, 6).toUpperCase()}</p>
          <table class="pdf-mock-table">
            <tr><td>Name</td><td>${escapeHtml(fullName)}</td></tr>
            <tr><td>Address</td><td>${escapeHtml(c.address || "—")}, ${escapeHtml(c.city || "—")} ${escapeHtml(c.zip || "")}</td></tr>
            <tr><td>Email</td><td>${escapeHtml(c.email || "—")}</td></tr>
          </table>
          <p class="pdf-mock-text">
            By continuing, I confirm I may be affected by proceedings involving
            ${escapeHtml(claim.brand)} and authorize a claims-preparation agent to
            research, prepare, and file this claim on my behalf.
          </p>
          <p class="pdf-mock-watermark">Sample preview — not a real legal filing.</p>
        </div>
      </div>
    </main>

    <div class="action-bar">
      <div class="action-bar-inner three-btn">
        <button type="button" class="btn-pill btn-pill-outline" data-nav="/details">Edit form</button>
        <button type="button" id="review-skip" class="btn-pill btn-pill-outline">Skip for now</button>
        <button type="button" id="review-next" class="btn-pill btn-pill-green">${isLast ? "Continue →" : "Next PDF →"}</button>
      </div>
    </div>
  `);
  wireNav(document);

  const advance = () => {
    state.reviewIndex += 1;
    navigate(state.reviewIndex >= claims.length ? "/offer" : "/review");
  };
  document.getElementById("review-skip").addEventListener("click", advance);
  document.getElementById("review-next").addEventListener("click", advance);
}

// --- Screen: offer / paywall -----------------------------------------------------

let countdownSeconds = 5 * 60;
let countdownStarted = false;
function ensureCountdown() {
  if (countdownStarted) return;
  countdownStarted = true;
  setInterval(() => {
    if (countdownSeconds > 0) countdownSeconds -= 1;
    const el = document.getElementById("countdown-clock");
    if (el) el.textContent = formatCountdown(countdownSeconds);
  }, 1000);
}
function formatCountdown(total) {
  const m = String(Math.floor(total / 60)).padStart(2, "0");
  const s = String(total % 60).padStart(2, "0");
  return `${m}:${s}`;
}

function countdownPill() {
  return `<span class="countdown-pill">⏰ Grab your offer in <span id="countdown-clock">${formatCountdown(countdownSeconds)}</span></span>`;
}

function renderOffer() {
  ensureCountdown();
  const claims = selectedClaims();
  const total = claims.reduce((sum, c) => sum + parsePayout(c.estimated_payout).high, 0);

  mount(`
    <header class="flow-topbar offer-topbar">
      <div class="logo"><span class="logo-mark">$</span><span class="logo-word">Money<span class="logo-word-accent">Pilot</span></span></div>
      ${countdownPill()}
    </header>
    <main class="page">
      <h1 class="hero-headline center">Start <span class="hl">Receiving Money</span> in The Next Few <span class="hl">Minutes</span></h1>
      <p class="hero-subtext center">You matched ${claims.length} claim${claims.length === 1 ? "" : "s"} worth up to $${total}</p>

      <ul class="feature-list">
        <li><span class="feature-icon">🏦</span>Find unclaimed money across different companies and platforms automatically.</li>
        <li><span class="feature-icon">🔔</span>Get notified the moment you're eligible for a payout or refund.</li>
        <li><span class="feature-icon">✒️</span>Auto-filled and ready to submit — no paperwork, no stress.</li>
        <li><span class="feature-icon">🏛️</span>Monitor every claim's status, from detected to filed.</li>
      </ul>

      <div class="how-it-works">
        <p class="how-it-works-title">What happens after you subscribe</p>
        <div class="how-it-works-steps">
          <div class="how-step">
            <span class="how-step-num">1</span>
            <div class="how-step-copy"><h3>We finish preparing your forms</h3><p>Every claim you reviewed gets filed with the details you gave us.</p></div>
          </div>
          <div class="how-step">
            <span class="how-step-num">2</span>
            <div class="how-step-copy"><h3>You land on your personal Claims Dashboard</h3><p>One place to see every claim's status — no more digging through email.</p></div>
          </div>
          <div class="how-step">
            <span class="how-step-num">3</span>
            <div class="how-step-copy"><h3>We track it and notify you</h3><p>When a settlement pays out, you're notified and the money is sent directly to you.</p></div>
          </div>
        </div>
      </div>

      <div class="offer-summary">
        <span class="guarantee-ribbon">GUARANTEE</span>
        <div class="offer-summary-avatars">
          ${claims.slice(0, 5).map((c) => {
            const style = brandStyleFor(c);
            return `<span class="mini-avatar" style="background:${style.color}">${style.mono}</span>`;
          }).join("")}
        </div>
        <p class="offer-summary-title">${claims.length} claim${claims.length === 1 ? "" : "s"} waiting to be filed</p>
        <p class="offer-summary-sub">${claims.map((c) => c.brand).join(", ") || "None selected"}</p>
        <div class="offer-summary-divider"></div>
        <div class="offer-summary-total"><span>Total potential claim value</span><strong>$${total}</strong></div>
      </div>

      <button type="button" class="btn-pill btn-pill-green full-width" data-nav="/plans">START NOW</button>
    </main>
  `);
  wireNav(document);
}

// --- Screen: plan picker -----------------------------------------------------

const PLANS = [
  { id: "1mo", label: "1 MONTH", price: "17.99", was: "19.99", note: "Flexible month-to-month", billedNow: "17.99", badge: null },
  { id: "3mo", label: "3 MONTHS", price: "13.49", was: "14.99", note: "Great balance of commitment & savings", billedNow: "40.47", badge: { text: "MOST POPULAR", className: "badge-orange" } },
  { id: "6mo", label: "6 MONTHS", price: "8.99", was: "9.99", note: "Best price per month", billedNow: "53.94", badge: { text: "BEST VALUE", className: "badge-blue" } },
];

function renderPlans() {
  ensureCountdown();
  mount(`
    <header class="flow-topbar offer-topbar">
      <div class="logo"><span class="logo-mark">$</span><span class="logo-word">Money<span class="logo-word-accent">Pilot</span></span></div>
      ${countdownPill()}
    </header>
    <main class="page page-with-bar">
      <h1 class="hero-headline center">Choose your plan</h1>
      <p class="hero-subtext center">Cancel anytime. All plans include full access.</p>

      <div class="plan-list">
        ${PLANS.map((p) => `
          <label class="plan-card ${state.selectedPlan === p.id ? "is-selected" : ""}">
            <input type="radio" name="plan" value="${p.id}" ${state.selectedPlan === p.id ? "checked" : ""} />
            <div class="plan-card-top">
              <span class="plan-label">${p.label}</span>
              ${p.badge ? `<span class="plan-badge ${p.badge.className}">${p.badge.text}</span>` : ""}
            </div>
            <div class="plan-price">$${p.price}<span>/mo</span> <s>$${p.was}</s></div>
            <p class="plan-billed">$${p.billedNow} billed now</p>
            <p class="plan-note">✓ ${p.note}</p>
          </label>
        `).join("")}
      </div>
    </main>
    <div class="action-bar">
      <div class="action-bar-inner">
        <div class="action-bar-copy"><span class="action-count">${state.selectedPlan ? "Plan selected" : "Choose a plan to continue"}</span></div>
        <button type="button" id="plan-continue" class="btn-pill btn-pill-green" ${state.selectedPlan ? "" : "disabled"}>Continue →</button>
      </div>
    </div>
  `);
  wireNav(document);

  document.querySelectorAll('input[name="plan"]').forEach((input) => {
    input.addEventListener("change", (ev) => {
      state.selectedPlan = ev.target.value;
      renderPlans();
    });
  });

  document.getElementById("plan-continue").addEventListener("click", () => {
    if (!state.selectedPlan) return;
    toast("This demo doesn't process real payments — no charge was made.");
    navigate("/dashboard");
  });
}

// --- Screen: post-payment dashboard -----------------------------------------------
// The direct answer to "what do I actually get after I pay" — a real screen,
// not just a description of one. Claim statuses here are illustrative
// (assigned round-robin below), since there's no real filing pipeline behind
// this demo to report real statuses from.

function renderDashboard() {
  const claims = selectedClaims();
  const total = claims.reduce((sum, c) => sum + parsePayout(c.estimated_payout).high, 0);
  const statuses = ["filed", "review", "filed", "paid"];

  mount(`
    ${topBar()}
    <main class="page">
      <div class="dashboard-welcome">
        <h1 class="hero-headline center small">🎉 Welcome to your <span class="hl">Claims Dashboard</span></h1>
        <p class="hero-subtext center">This is what you land on right after checkout — everything in one place, updated as your claims move.</p>
      </div>

      <div class="dashboard-stats">
        <div class="dashboard-stat"><strong>${claims.length}</strong><span>Claims filed</span></div>
        <div class="dashboard-stat"><strong>$${total}</strong><span>Potential value</span></div>
        <div class="dashboard-stat"><strong>${PLANS.find((p) => p.id === state.selectedPlan)?.label || "—"}</strong><span>Your plan</span></div>
      </div>

      <div class="dashboard-list">
        ${claims.map((c, i) => {
          const style = brandStyleFor(c);
          const status = statuses[i % statuses.length];
          const label = status === "filed" ? "Filed" : status === "review" ? "Under review" : "Paid";
          return `
            <div class="dashboard-row">
              <div class="card-avatar" style="background:${style.color}">${style.mono}</div>
              <div class="dashboard-row-info">
                <strong>${escapeHtml(c.title)}</strong>
                <span>Up to $${parsePayout(c.estimated_payout).high}</span>
              </div>
              <span class="status-pill status-${status}">${label}</span>
            </div>
          `;
        }).join("") || `<p class="hero-subtext">No claims were selected — head back and pick a few.</p>`}
      </div>

      <div class="dashboard-next">
        <h3>What we're doing right now</h3>
        <p>
          We're preparing and submitting each claim above with the details you
          gave us. "Under review" means the settlement administrator has it;
          "Paid" means the money is on its way to you. You'll get a
          notification the moment any status changes — nothing to check
          manually.
        </p>
      </div>

      <button type="button" class="btn-pill btn-pill-black full-width" data-nav="/claims">Find more claims</button>

      <div class="dashboard-links">
        <a data-nav="/trust">Why people trust us</a>
        <a data-nav="/faq">Got a question?</a>
      </div>
    </main>
  `);
  wireNav(document);
}

// --- Screen: trust / testimonials -----------------------------------------------
// Testimonial copy reproduced from the reference screenshots (the user's own
// existing site) for visual fidelity in this local prototype — not new
// fabricated reviews.

const TESTIMONIALS = [
  { title: "Great insights…", name: "Sarah K.", body: "The information provided here, especially about unclaimed refunds and benefits, has truly been a revelation for me." },
  { title: "Found money I didn't know existed 💰", name: "Michael", body: "MoneyPilot helped me discover over $800 in unclaimed refunds from old subscriptions and class actions." },
  { title: "Best service ever 🏠", name: "Jennifer", body: "I was worried about giving my information, but MoneyPilot's security measures gave me confidence." },
];

function renderTrust() {
  mount(`
    ${topBar({ back: "/dashboard" })}
    <main class="page">
      <div class="guarantee-block">
        <span class="guarantee-shield">🛡️</span>
        <h2>Your Satisfaction Is Guaranteed</h2>
        <p>Try it risk-free. If you don't love the results, you can get a refund within 30 days, no questions asked.</p>
      </div>

      <h2 class="hero-headline center small">Why People Trust <span class="hl">MoneyPilot</span> 🤩</h2>
      <div class="testimonial-list">
        ${TESTIMONIALS.map((t) => `
          <div class="testimonial-card">
            <div class="testimonial-top"><strong>${escapeHtml(t.title)}</strong><span>${escapeHtml(t.name)}</span></div>
            <div class="stars">★★★★★</div>
            <p>${escapeHtml(t.body)}</p>
          </div>
        `).join("")}
      </div>

      <button type="button" class="btn-pill btn-pill-black full-width" data-nav="/faq">Next →</button>
    </main>
  `);
  wireNav(document);
}

// --- Screen: FAQ -----------------------------------------------------------------

const FAQS = [
  { q: "What exactly does MoneyPilot do?", a: "It scans your inbox for receipts, renewals, and price-change emails, matches them to known settlement claims, and helps you file the ones you're eligible for." },
  { q: "Is MoneyPilot free to use?", a: "The inbox scan and claim matching are free. Filing support is a paid plan — see the plans screen for pricing." },
  { q: "How does MoneyPilot find my payouts?", a: "By reading the sender and subject line of matching emails (never the body) and scoring them against each claim's eligibility window, per our published scoring formula." },
  { q: "Will I actually get paid?", a: "Payouts depend on the settlement or arbitration outcome and are never guaranteed — this is a claims-preparation tool, not a law firm or the party deciding payouts." },
];

function renderFaq() {
  const app = mount(`
    ${topBar({ back: "/dashboard" })}
    <main class="page">
      <h1 class="hero-headline center small">Got a <span class="hl">Question</span>?</h1>
      <p class="hero-subtext center">We've answered the most common questions to help you feel confident.</p>

      <div class="faq-list">
        ${FAQS.map((f, i) => `
          <div class="faq-item">
            <button type="button" class="faq-question" data-i="${i}">${escapeHtml(f.q)}<span class="faq-caret">⌄</span></button>
            <div class="faq-answer" hidden>${escapeHtml(f.a)}</div>
          </div>
        `).join("")}
      </div>

      <button type="button" class="btn-pill btn-pill-outline full-width" data-nav="/dashboard">← Back to my dashboard</button>

      <footer class="dev-note">
        <details>
          <summary>For engineering — end-to-end summary of what's simulated</summary>
          <div class="dev-note-body">
            <p>This entire funnel runs against the mock dataset, in the browser, with no backend:</p>
            <p>• "Continue with Google" (Connect step) — no real OAuth; loads mock_emails.json after a short delay.</p>
            <p>• Claim scoring/reasoning (Claims screen) — real, per algorithm_spec.md, unchanged from the original build.</p>
            <p>• PDF review screens — cosmetic mock with fictional case numbers, clearly labeled "not a real legal filing."</p>
            <p>• Plan picker / "START NOW" — no real payment processing anywhere; confirmed via toast on selection.</p>
            <p>• Testimonials — reproduced from the reference screenshots for visual fidelity, not newly fabricated.</p>
          </div>
        </details>
      </footer>
    </main>
  `);
  wireNav(document);

  app.querySelectorAll(".faq-question").forEach((btn) => {
    btn.addEventListener("click", () => {
      const answer = btn.nextElementSibling;
      answer.hidden = !answer.hidden;
      btn.classList.toggle("is-open", !answer.hidden);
    });
  });
}

// --- Boot ------------------------------------------------------------------------

render();
