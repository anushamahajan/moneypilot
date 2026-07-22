# Algorithm spec: inbox-based claims personalization

This is the implementation spec for the matching and ranking engine. Data files
referenced: `mock_emails.json`, `claims.json`.

## 1. Pipeline

```
email -> sender domain match -> keyword classifier -> (LLM fallback if no keyword match) -> type
all typed emails per brand -> scoring formula -> ranked claim list
```

## 2. Sender matching

Match `email.sender` domain against `claims[].sender_domains`. No fuzzy matching in
the MVP: an unrecognized domain means the email is ignored entirely, and a brand
with zero matching emails never produces a claim recommendation. Case-insensitive,
exact domain (or known subdomain) match only.

## 3. Keyword classifier

Run against `email.subject`, case-insensitive substring match. Check categories in
this exact order and stop at the first match (first-match-wins, not a scoring
contest between lists). Order matters: cancellation must be checked before
renewal/receipt, since a subject can contain both.

```
1. cancellation
   cancelled, canceled, cancellation confirmed, we've cancelled,
   your membership has ended, your subscription has ended,
   sorry to see you go, account closed, membership terminated,
   we're sorry you're leaving

2. abandoned_cart
   complete your purchase, finish checking out, you left something,
   still interested?, your cart is waiting, items in your cart,
   complete your order

3. winback
   we miss you, still miss, come back, we haven't seen you,
   it's been a while, come back and save, your account is waiting,
   welcome back offer

4. receipt
   receipt, payment confirmed, payment successful, your invoice,
   order confirmation, order confirmed, thank you for your payment,
   payment received, your bill, bill for, billing confirmation, charge confirmation

5. renewal
   renews on, renewal confirmed, has renewed, your subscription renewed,
   automatically renewed, renewal receipt, annual renewal, your plan renewed

6. price_increase
   price is changing, price increase, new pricing, plan price update,
   your rate is changing, pricing update

7. reminder
   renews soon, renews next, upcoming renewal, your membership renews,
   renewal reminder, expiring soon (only when "membership" or "subscription"
   also appears in the subject, to avoid colliding with trial reminders)

8. trial_reminder
   trial ends, trial ending, free trial ends, your trial expires,
   days left in your trial, trial expiring

9. welcome
   welcome to, thanks for joining, you're all set, start your trial,
   welcome aboard, get started with, your account is ready

10. unsubscribe_marketing
    you've unsubscribed, unsubscribed from, you're off our list,
    email preferences updated, you won't receive
    (scored 0 -- exists so it is never misread as a cancellation)

11. promo   (fallback bucket, checked last)
    % off, save on, deal, limited time, exclusive offer, new shows,
    just for you, don't miss out, sale ends, special offer
```

If nothing matches, send only `email.subject` (not the body) to an LLM classifier
with the same 11 categories as valid outputs. This keeps the fallback cheap and
avoids reading email body content at all.

Known false-positive risk: `reminder` and `trial_reminder` both use
"expiring soon"-style language and can collide on real-world subject lines beyond
what the keyword guard above catches. Log these cases; do not silently resolve
them differently between environments.

## 4. Scoring formula

### Type weights

| type | weight |
|---|---|
| receipt | +10 |
| renewal | +9 |
| price_increase | +7 |
| reminder | +6 |
| welcome | +4 |
| trial_reminder | +3 |
| promo | +1 |
| unsubscribe_marketing | 0 |
| winback | -4 |
| cancellation | -6 |
| abandoned_cart | -8 |

### Per-email modifiers

```
window_match(e)   = 1.0 if e.date falls inside claim.eligibility_window
                   = 0.2 if e.date falls outside it
recency_weight(e) = max(0.5, 1 - months_since(e.date, today) / 48)
```

### Signal score

For claim C with brand B, let E = all emails whose sender domain matches
`C.sender_domains`. If E is empty, do not produce a recommendation for C.

```
signal_score = sum over e in E of:
  type_weight(e.type) * window_match(e) * recency_weight(e)
```

### Duration bonus

```
duration_months = count of distinct (year, month) pairs among emails in E
                   that have a positive type_weight
duration_bonus  = min(duration_months, 6) * 2
```

### Conflict multiplier

```
most_recent = email in E with the latest date
conflict_multiplier = 0.5 if type_weight(most_recent.type) < 0 else 1.0
```

### Final score

```
raw_score   = (signal_score + duration_bonus) * conflict_multiplier
final_score = clamp(raw_score, 0, 100)
```

### Confidence tiers

```
final_score >= 60            -> High
30 <= final_score < 60       -> Medium
1  <= final_score < 30        -> Low
final_score <= 0 or E empty  -> not shown
```

Sort the output list by tier (High, Medium, Low), then by `final_score`
descending within each tier.

## 5. "Why this claim" reason string

Generate the UI reason text from the two or three highest-weight emails in E,
not from the raw score. Rough template:

```
"found a {top_type_1} and a {top_type_2} from {brand}, {duration_months > 1 ?
'and N separate charges between {earliest_year} and {latest_year}' : ''}"
```

If `conflict_multiplier` is 0.5, append a qualifier, e.g. "though the most recent
email was a {most_recent.type}, suggesting the subscription may have lapsed."

## 6. Worked example (Netflix, from mock_emails.json ids 1-5)

Assuming eligibility window 2021-01-01 to 2023-12-31 and "today" = 2024-01-01:

- welcome (2022-01-15): 4 x 1.0 x 0.50 = 2.00
- receipt (2022-02-15): 10 x 1.0 x 0.52 = 5.20
- price_increase (2023-06-01): 7 x 1.0 x 0.85 = 5.95
- payment_confirmation, treat as receipt (2023-09-12): 10 x 1.0 x 0.92 = 9.17
- cancellation (2024-01-03, outside window, most recent): -6 x 0.2 x 1.0 = -1.20

signal_score = 21.12
duration_months = 4 -> duration_bonus = 8
conflict_multiplier = 0.5 (most recent email is negative-weight)
raw_score = (21.12 + 8) * 0.5 = 14.56
final_score ≈ 15 -> Low tier

## 7. Known limitations (do not silently work around these)

- No email body is read in the MVP, so exact amount paid and plan tier are
  approximated from a static per-brand pricing table, not verified per user.
- Weights above are a hypothesis, not a calibrated model. There is no labeled
  ground truth yet for what actually correlates with real settlement
  eligibility. Flag this in any output that claims a precise probability.
- `reminder` vs `trial_reminder` keyword collision noted in section 3.
- Duration and window logic assume emails are visible in full for the account's
  lifetime. A partially-synced or partially-granted inbox will under-count
  duration_months and should not be presented as a "no relationship found"
  result without that caveat.