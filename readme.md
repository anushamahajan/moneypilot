# MoneyPilot inbox-based claims personalization, MVP build

Replaces the generic quiz with a claims feed driven by real signal pulled from
a mock inbox. No auth, no live email access, in scope for this build.

## What to build

1. Load `mock_emails.json` (24 emails, 6 brands) and `claims.json` (6 claims,
   each with an eligibility window) as the entire data layer. No database
   needed for the MVP.
2. Implement the classifier and scoring pipeline exactly as specified in
   `ALGORITHM_SPEC.md`. That file is the source of truth for the keyword
   rules, the weight table, and the formula, do not improvise variations on
   it without flagging the change.
3. Implement the claims feed screen per `UI_SPEC.md`, including the
   "why this claim" reason string per email set, not a generic label.
4. One magic moment to get right end to end: an email set with a receipt and
   a renewal for the same brand inside the eligibility window should produce
   a High-tier card with a specific, readable reason. That is the thing a
   stakeholder should look at and go "oh, this actually knows what I'd be
   eligible for."

## File map

| File | Purpose |
|---|---|
| `mock_emails.json` | The 24-email mock inbox, stand-in for real OAuth access |
| `claims.json` | The 6 claims, their brand, sender domain(s), payout range, eligibility window |
| `ALGORITHM_SPEC.md` | Keyword classifier rules, LLM fallback trigger, scoring formula, worked example |
| `UI_SPEC.md` | Claims feed layout, card anatomy, confidence pill states, brand color tokens |

## Explicitly out of scope for this MVP

- Real inbox access (OAuth, IMAP, or any live email provider)
- Reading email body content for classification (subject line and sender
  domain only, LLM fallback also receives subject line only)
- A calibrated ML scoring model (the formula in `ALGORITHM_SPEC.md` is a
  transparent rule-based scorecard, not a trained classifier)
- Verifying exact amount paid or plan tier against real billing data

## Known limitations to preserve, not silently fix

See `ALGORITHM_SPEC.md` section 7. In short: weights are an untested
hypothesis, the reminder/trial_reminder keyword collision is a known risk,
and duration tracking assumes a fully visible inbox history. Carry these
forward as documented limitations rather than papering over them with
made-up handling.