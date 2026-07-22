// MoneyPilot claims feed — classifier + scoring engine, per algorithm_spec.md.
// Data layer is claims.json / mock_emails.json, fetched live so manual edits
// to either file show up in the feed without touching this file.

const CLAIMS_URL = "claims.json";
const EMAILS_URL = "mock_emails.json";

// --- 3. Keyword classifier (algorithm_spec.md section 3) ---------------
// Checked in this exact order, first match wins.
const CATEGORIES = [
  ["cancellation", [
    "cancelled", "canceled", "cancellation confirmed", "we've cancelled",
    "your membership has ended", "your subscription has ended",
    "sorry to see you go", "account closed", "membership terminated",
    "we're sorry you're leaving",
  ]],
  ["abandoned_cart", [
    "complete your purchase", "finish checking out", "you left something",
    "still interested?", "your cart is waiting", "items in your cart",
    "complete your order",
  ]],
  ["winback", [
    "we miss you", "still miss", "come back", "we haven't seen you",
    "it's been a while", "come back and save", "your account is waiting",
    "welcome back offer",
  ]],
  ["receipt", [
    "receipt", "payment confirmed", "payment successful", "your invoice",
    "order confirmation", "order confirmed", "thank you for your payment",
    "payment received", "your bill", "bill for", "billing confirmation",
    "charge confirmation",
  ]],
  ["renewal", [
    "renews on", "renewal confirmed", "has renewed",
    "your subscription renewed", "automatically renewed", "renewal receipt",
    "annual renewal", "your plan renewed",
  ]],
  ["price_increase", [
    "price is changing", "price increase", "new pricing",
    "plan price update", "your rate is changing", "pricing update",
  ]],
  ["reminder", [
    "renews soon", "renews next", "upcoming renewal", "your membership renews",
    "renewal reminder",
  ]],
  ["trial_reminder", [
    "trial ends", "trial ending", "free trial ends", "your trial expires",
    "days left in your trial", "trial expiring",
  ]],
  ["welcome", [
    "welcome to", "thanks for joining", "you're all set", "start your trial",
    "welcome aboard", "get started with", "your account is ready",
  ]],
  ["unsubscribe_marketing", [
    "you've unsubscribed", "unsubscribed from", "you're off our list",
    "email preferences updated", "you won't receive",
  ]],
  ["promo", [
    "% off", "save on", "deal", "limited time", "exclusive offer",
    "new shows", "just for you", "don't miss out", "sale ends",
    "special offer",
  ]],
];

// --- 4. Type weights (algorithm_spec.md section 4) ----------------------
const WEIGHTS = {
  receipt: 10,
  renewal: 9,
  price_increase: 7,
  reminder: 6,
  welcome: 4,
  trial_reminder: 3,
  promo: 1,
  unsubscribe_marketing: 0,
  winback: -4,
  cancellation: -6,
  abandoned_cart: -8,
  // Fallback bucket for subjects the keyword table and LLM fallback both
  // miss. Per PRD: "defaults to the Low tier and is shown with its
  // reasoning visible, rather than silently hidden or silently promoted."
  unclassified: 1,
};

// Plain-language labels, used only in the dev-note trail and the lapsed
// caveat caption — the main reason copy no longer lists types directly,
// see buildReason() below.
const TYPE_LABELS = {
  receipt: "payment receipt",
  renewal: "renewal confirmation",
  price_increase: "price-increase notice",
  reminder: "renewal reminder",
  welcome: "welcome email",
  trial_reminder: "trial-ending reminder",
  promo: "promotional email",
  unsubscribe_marketing: "marketing unsubscribe notice",
  winback: "win-back offer",
  cancellation: "cancellation email",
  abandoned_cart: "abandoned cart email",
  unclassified: "email",
};

function classify(subject) {
  const s = subject.toLowerCase();
  for (const [category, keywords] of CATEGORIES) {
    for (const kw of keywords) {
      if (s.includes(kw)) return category;
    }
    // "expiring soon" belongs to the reminder category (checked in this same
    // priority slot) but only counts when paired with membership/subscription,
    // to avoid colliding with the trial_reminder category checked right after.
    if (category === "reminder" && s.includes("expiring soon") &&
        (s.includes("membership") || s.includes("subscription"))) {
      return "reminder";
    }
  }
  // No keyword rule matched. Spec calls for an LLM fallback here, sending
  // only the subject line. No live LLM is wired into this static build, so
  // this is a documented stub: emails that reach this point are labeled
  // "unclassified" and scored/shown per the PRD's fallback behavior
  // (Low tier, reasoning visible) rather than silently dropped.
  return "unclassified";
}

function domainOf(sender) {
  const at = sender.lastIndexOf("@");
  return sender.slice(at + 1).toLowerCase();
}

function domainMatches(emailDomain, claimDomains) {
  return claimDomains.some((raw) => {
    const cd = raw.toLowerCase();
    return emailDomain === cd || emailDomain.endsWith("." + cd);
  });
}

function monthsSince(dateStr, today) {
  const d = new Date(dateStr + "T00:00:00");
  return (today.getFullYear() - d.getFullYear()) * 12 + (today.getMonth() - d.getMonth());
}

// --- 5. "Why this claim" copy (algorithm_spec.md section 5) ---------------
// Generated per claim from the same signal (types present, duration, most
// recent email) the scoring formula uses — never from finalScore, and never
// hardcoded per brand. Rewritten in user-facing, benefit-first language
// instead of naming raw email types, per product feedback that the
// original "found a receipt and a renewal notice from X" copy read like a
// debug log rather than something a user would want to read.
const NEGATIVE_EVENT_PHRASE = {
  cancellation: "cancelled",
  winback: "got a win-back offer",
  abandoned_cart: "left a cart abandoned",
};

function withArticle(noun) {
  return (/^[aeiou]/i.test(noun) ? "an " : "a ") + noun;
}

function capitalizeFirst(str) {
  return str.charAt(0).toUpperCase() + str.slice(1);
}

// Tier-aware framing wrapped around the same underlying fact, so a High
// match reads like an invitation to act and a Low match stays honest about
// weak signal (per ui_spec.md's low-tier honesty rule) without being flat.
function frameForTier(tier, coreFact) {
  if (tier === "High") return `🎯 Strong match — ${coreFact}. This one's worth claiming now.`;
  if (tier === "Medium") return `👀 ${capitalizeFirst(coreFact)} — worth a few minutes to check.`;
  return `${capitalizeFirst(coreFact)}.`;
}

function buildReason(typedEmails, brand, durationMonths, conflictMultiplier, mostRecent, tier) {
  const positiveTypes = new Set(
    typedEmails.filter((t) => WEIGHTS[t.type] > 0).map((t) => t.type)
  );
  const hasReceipt = positiveTypes.has("receipt");
  const hasRenewal = positiveTypes.has("renewal");
  const hasPriceIncrease = positiveTypes.has("price_increase");
  const hasWelcome = positiveTypes.has("welcome");
  const hasTrial = positiveTypes.has("trial_reminder");

  const positiveYears = typedEmails
    .filter((t) => WEIGHTS[t.type] > 0)
    .map((t) => t.dateObj.getFullYear());
  const latestReceiptYear = typedEmails
    .filter((t) => t.type === "receipt")
    .reduce((max, t) => Math.max(max, t.dateObj.getFullYear()), 0);

  // Distinct months backed specifically by money-movement emails (receipt or
  // renewal), not just any positive-weight signal — so copy never calls a
  // promo or welcome email a "charge."
  const transactionalMonths = new Set(
    typedEmails
      .filter((t) => t.type === "receipt" || t.type === "renewal")
      .map((t) => t.date.slice(0, 7))
  ).size;

  // The underlying fact, plain and unframed — same signal the score uses,
  // just in second person instead of naming raw email types.
  let coreFact;
  if (hasPriceIncrease && (hasReceipt || hasRenewal)) {
    coreFact = `you were paying for ${brand} when they raised prices`;
  } else if (hasReceipt && hasRenewal) {
    coreFact = `you've paid for ${brand} and kept renewing, ${transactionalMonths} months of real billing history`;
  } else if (hasReceipt && transactionalMonths > 1) {
    coreFact = `we spotted ${transactionalMonths} separate ${brand} charges in your inbox`;
  } else if (hasReceipt && durationMonths > 1) {
    coreFact = `we found ${withArticle(brand)} payment plus other account activity across ${durationMonths} months`;
  } else if (hasReceipt) {
    coreFact = `we found a real ${brand} payment in your inbox from ${latestReceiptYear}`;
  } else if (hasRenewal) {
    coreFact = `your ${brand} subscription renewed at least once during the eligible window`;
  } else if (hasWelcome || hasTrial) {
    coreFact = `you signed up for ${brand} during the eligible window`;
  } else {
    coreFact = `we spotted ${brand} activity in your inbox`;
  }

  const headline = frameForTier(tier, coreFact);

  let caveat = null;
  if (conflictMultiplier === 0.5) {
    const eventPhrase = NEGATIVE_EVENT_PHRASE[mostRecent.type] || "moved on";
    caveat = `Heads up — you later ${eventPhrase}, so we're showing this as a lighter match, but the billing history is real.`;
  }

  return { headline, caveat, positiveYears };
}

function scoreClaim(claim, emails, today) {
  const E = emails.filter((e) => domainMatches(domainOf(e.sender), claim.sender_domains));
  if (E.length === 0) return null;

  const winStart = new Date(claim.eligibility_window.start + "T00:00:00");
  const winEnd = new Date(claim.eligibility_window.end + "T00:00:00");

  let signalScore = 0;
  const monthSet = new Set();

  const typedEmails = E.map((e) => {
    const type = classify(e.subject);
    const weight = WEIGHTS[type];
    const dateObj = new Date(e.date + "T00:00:00");
    const windowMatch = dateObj >= winStart && dateObj <= winEnd ? 1.0 : 0.2;
    const recency = Math.max(0.5, 1 - monthsSince(e.date, today) / 48);
    signalScore += weight * windowMatch * recency;
    if (weight > 0) monthSet.add(e.date.slice(0, 7));
    return { ...e, type, weight, windowMatch, recency, dateObj };
  });

  const durationMonths = monthSet.size;
  const durationBonus = Math.min(durationMonths, 6) * 2;

  const mostRecent = typedEmails.reduce((a, b) => (a.date >= b.date ? a : b));
  const conflictMultiplier = WEIGHTS[mostRecent.type] < 0 ? 0.5 : 1.0;

  const rawScore = (signalScore + durationBonus) * conflictMultiplier;
  const finalScore = Math.min(100, Math.max(0, rawScore));

  let tier = null;
  if (finalScore >= 60) tier = "High";
  else if (finalScore >= 30) tier = "Medium";
  else if (finalScore >= 1) tier = "Low";

  if (!tier) return null; // final_score <= 0 -> not shown

  const reason = buildReason(typedEmails, claim.brand, durationMonths, conflictMultiplier, mostRecent, tier);

  return { ...claim, tier, finalScore, reason, emailCount: E.length, durationMonths };
}

function computeFeed(claims, emails) {
  const today = new Date();
  const tierOrder = { High: 0, Medium: 1, Low: 2 };
  return claims
    .map((claim) => scoreClaim(claim, emails, today))
    .filter(Boolean)
    .sort((a, b) => {
      if (tierOrder[a.tier] !== tierOrder[b.tier]) return tierOrder[a.tier] - tierOrder[b.tier];
      return b.finalScore - a.finalScore;
    });
}

// --- Brand identity (avatar color + monogram) -----------------------------
// Visual only, does not affect matching or scoring. Approximate real brand
// colors so cards read the way the reference MoneyPilot screens do.
const BRAND_STYLE = {
  netflix_price_increase_2023: { color: "#E50914", mono: "NF" },
  spotify_premium_billing_claim: { color: "#1DB954", mono: "SP" },
  peloton_app_membership_claim: { color: "#DF3831", mono: "PE" },
  amazon_prime_membership_claim: { color: "#00A8E1", mono: "AP" },
  planet_fitness_membership_claim: { color: "#7B2382", mono: "PF" },
  adobe_creative_cloud_claim: { color: "#DA1F26", mono: "AC" },
};
const DEFAULT_BRAND_STYLE = { color: "#39725B", mono: "$$" };

function brandStyleFor(claim) {
  return BRAND_STYLE[claim.claim_id] || DEFAULT_BRAND_STYLE;
}

function parsePayout(str) {
  const m = str.match(/\$\s*([\d,]+)\s*to\s*\$\s*([\d,]+)/i);
  if (!m) return { low: 0, high: 0 };
  return { low: Number(m[1].replace(/,/g, "")), high: Number(m[2].replace(/,/g, "")) };
}

// --- Rendering primitives ----------------------------------------------------
// Reused by flow.js's #/claims screen. Selection/reminder/texted state and the
// tier-section dividers live in flow.js now (product-flow state, not engine).

function escapeHtml(str) {
  const div = document.createElement("div");
  div.textContent = str;
  return div.innerHTML;
}

function formatWindow(win) {
  const startYear = win.start.slice(0, 4);
  const endYear = win.end.slice(0, 4);
  return startYear === endYear ? startYear : `${startYear}–${endYear}`;
}

// `opts`: { isSelected, isReminded, isTexted, onToggleSelect(checked),
// onToggleRemind(nowOn), onToggleText(nowOn) }. Callbacks own state and
// re-render as needed — this function has no module-level state of its own,
// so flow.js's #/claims screen can call it directly.
function renderCard(claim, opts) {
  const el = document.createElement("article");
  const tierClass = claim.tier.toLowerCase();
  const isSelected = opts.isSelected;
  el.className = `claim-card tier-${tierClass}${isSelected ? " is-selected" : ""}`;
  el.dataset.claimId = claim.claim_id;

  const style = brandStyleFor(claim);
  const payout = parsePayout(claim.estimated_payout);
  const isReminded = opts.isReminded;
  const isTexted = opts.isTexted;

  el.innerHTML = `
    <label class="card-select">
      <input type="checkbox" class="card-checkbox" ${isSelected ? "checked" : ""} aria-label="Include ${escapeHtml(claim.title)} in my claims" />
      <span class="checkbox-box"></span>
    </label>

    <div class="card-avatar" style="background:${style.color}">${style.mono}</div>

    <div class="card-body">
      ${claim.tier === "High" ? '<span class="ribbon">⭐ Top pick</span>' : ""}
      <div class="card-top">
        <div>
          <p class="card-brand">${escapeHtml(claim.brand)}</p>
          <p class="card-subtitle">${escapeHtml(claim.title)}</p>
        </div>
        <span class="pill pill-${tierClass}">${claim.tier} match</span>
      </div>

      <div class="card-payout-row">
        <span class="payout-tag">🏷</span>
        <span class="card-payout">Up to $${payout.high}</span>
        <span class="card-payout-range">est. ${escapeHtml(claim.estimated_payout)}</span>
      </div>

      <div class="card-meta">
        <span class="meta-item">📧 ${claim.emailCount} email${claim.emailCount === 1 ? "" : "s"} found</span>
        <span class="meta-item">📅 Eligible ${formatWindow(claim.eligibility_window)}</span>
      </div>

      <p class="card-reason">${escapeHtml(claim.reason.headline)}</p>
      ${claim.reason.caveat ? `<p class="card-caveat">${escapeHtml(claim.reason.caveat)}</p>` : ""}

      <div class="card-actions">
        <button type="button" class="chip-btn chip-remind${isReminded ? " is-active" : ""}" data-role="remind">
          ${isReminded ? "🔔 Reminders on ✓" : "🔔 Remind me on phone"}
        </button>
        <button type="button" class="chip-btn chip-text${isTexted ? " is-active" : ""}" data-role="text">
          ${isTexted ? "💬 Texting updates ✓" : "💬 Text me this claim"}
        </button>
      </div>
    </div>
  `;

  const checkbox = el.querySelector(".card-checkbox");

  el.querySelector('[data-role="remind"]').addEventListener("click", (ev) => {
    ev.stopPropagation();
    opts.onToggleRemind();
  });

  el.querySelector('[data-role="text"]').addEventListener("click", (ev) => {
    ev.stopPropagation();
    opts.onToggleText();
  });

  // Clicking anywhere on the card toggles selection too; the checkbox
  // itself already fires its own "change" event, so skip double-toggling.
  checkbox.addEventListener("change", (ev) => opts.onToggleSelect(ev.target.checked));
  el.addEventListener("click", (ev) => {
    if (ev.target === checkbox) return;
    opts.onToggleSelect(!checkbox.checked);
  });

  return el;
}

function toast(message) {
  const el = document.getElementById("toast");
  el.textContent = message;
  el.classList.add("show");
  clearTimeout(toast._t);
  toast._t = setTimeout(() => el.classList.remove("show"), 2600);
}

// --- Data loading ------------------------------------------------------------
// Fetches both JSON files fresh (cache-busted) so manual edits to claims.json /
// mock_emails.json are picked up on the next call — no rebuild step. Requires
// the page to be served over http(s), not opened as a file:// URL. flow.js
// calls this once during the #/scanning screen, and again on demand if the
// user hits "Rescan inbox" from #/claims.

async function fetchJSON(url) {
  const res = await fetch(`${url}?t=${Date.now()}`, { cache: "no-store" });
  if (!res.ok) throw new Error(`Failed to load ${url}: ${res.status}`);
  return res.json();
}

async function loadMockData() {
  const [claims, emails] = await Promise.all([fetchJSON(CLAIMS_URL), fetchJSON(EMAILS_URL)]);
  return { claims, emails };
}
