# UI spec: recommended claims feed

Replaces the flat quiz-result list. One scrollable feed, ranked High to Low,
each claim as its own card, each card stating in plain language why it was
recommended.

## Screen structure

```
[ Section label: "Recommended for you" ]
[ Section title: "Claims we found in your inbox" ]
[ Claim card ] High tier
[ Claim card ] High tier
[ Claim card ] Medium tier
[ Claim card ] Low tier   (visually slightly de-emphasized, not hidden)
```

Claims below the "not shown" threshold in ALGORITHM_SPEC.md section 4 are
excluded from the feed entirely, not shown as a zero-confidence card.

## Claim card anatomy

```
+--------------------------------------------------+
|  Claim title                     [ Confidence pill ] |
|  Estimated payout: $X to $Y                       |
|  ------------------------------------------------  |
|  Why this claim: <generated reason string>         |
+--------------------------------------------------+
```

- Title: brand + claim name, e.g. "Netflix price-increase settlement"
- Payout line: range, not a single number, pulled from `claims.json`
- Reason line: always present, generated per ALGORITHM_SPEC.md section 5.
  Never ships a card without a reason string. This line is the entire point
  of the feed, it is what replaces the quiz.
- Confidence pill: three states, see below

## Confidence pill states

| Tier | Label | Fill | Border | Text |
|---|---|---|---|---|
| High | "High match" | #F1FCF5 | #58B67D | #1C7359 |
| Medium | "Medium match" | #F7EFCC | #E9D98A | #7A6415 |
| Low | "Low match" | #F1EFE8 | #D3D1C7 | #5A5A5A |

Low-tier cards additionally render at ~85% opacity on the card body (not the
text inside it) to visually recede without being hard to read.

## Brand tokens to reuse from the existing MoneyPilot design system

| Token | Hex | Where it applies here |
|---|---|---|
| Page background | `#F8F6F1` | Feed screen background |
| Primary green | `#39725B` (also seen `#38715A`) | "Why this claim" label text, primary CTA |
| Card background | `#FFFFFF` | Claim card surface |
| Card border | `#E5E1D6` | Claim card hairline |
| Body text | `#282828` / `#3C3C3C` | Card title / body copy |
| Muted text | `#5A5A5A` | Section label, payout line, low-tier reason text |
| Amber chip | `#F7EFCC` | Medium confidence pill fill |
| Guarantee red | `#CA3A32` | Reserved -- do not use on this screen, it is already
  claimed by the payout guarantee badge elsewhere in the product and would
  visually conflict with the confidence system here |

Headline font: Protest Strike, per the existing MoneyPilot type system, used
for the section title only ("Claims we found in your inbox"). Card titles and
body copy stay in the standard sans body font used elsewhere in the product,
Protest Strike is a display face and does not hold up at card-title size.

## Copy rules for the reason string

- Plain language, no jargon ("payment receipt" not "transactional email
  classified as type=receipt")
- Never states a percentage or decimal confidence number in the UI copy, the
  pill label (High / Medium / Low) is the only confidence signal a user sees
- Low-tier reason strings should be honest about the weak signal rather than
  padded to sound more confident than the tier implies, e.g. "found an old
  receipt, but the most recent email was a win-back offer, suggesting the
  subscription may have lapsed" rather than a generic "you may be eligible"

## States not designed yet, flag before building

- Empty state (zero claims found across the whole mock inbox)
- A brand with a matching email but a claim outside the eligibility window
  entirely (currently just excluded, no distinct empty-adjacent state)
- Loading state while the mock inbox is being scanned