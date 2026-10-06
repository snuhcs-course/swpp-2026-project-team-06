# Risk Management

| ID | Risk | Likelihood | Impact | Mitigation | Owner | Status |
| -- | -- | -- | -- | -- | -- | -- |
| R1 | The I1 schedule is short for its scope | TBD | Demo is not finished | Follow the cut order in the release plan: protect S-2 (reservation order) and S-3 (communication and AI) first, then drop FEAT-14, then FEAT-11 | TBD | Open |
| R2 | Producers do not send photos and news regularly | TBD | Not enough consumer trust and content | Text-first input; check in producer interviews (SWPP-12) | TBD | Open |
| R3 | AI gives wrong information | TBD | Consumer complaints and disputes | AI rules M-05–M-08; forward to the farm when there is no evidence | TBD | Open |
| R4 | Card disputes because delivery is months after payment | TBD | Chargebacks once real payment starts | Show terms before payment (R-03, R-05) and progress updates | TBD | Open |
| R5 | Farms with loyal fans move to direct trade outside Farmclub | TBD | Platform loses value | Stage pricing; keep the communication channel inside the platform (Q-08) | TBD | Open |

## Assumptions

- A-01. Tangerines have a long enough pre-harvest period for stage pricing.
- A-02. Farms can measure sweetness themselves at harvest and enter it.
- A-03. We can use real text from beta farms in the demo (consent needed).
- A-04. In I1, one order holds one weight option, and the quantity is chosen within the producer's limit (Q-14, R-23).

## Constraints

- C-01. I1 is due Oct 9, 23:59, and the team has four members.
- C-02. Real payment is possible only after the company is set up and the payment gateway review (1–3 weeks) passes. Until then, payment is mocked.
- C-03. The wiki must be in English, and the repository is public.
- C-04. Produce is sold as harvested. No repacking into smaller units.

## Dependencies

- D-01. P13 decision (SWPP-17): feature priorities may change.
- D-02. Tech stack decision (P19): AI and analytics tools must be chosen before building FEAT-03, FEAT-13, and the success metrics.
- D-03. More research: producer interviews (SWPP-12) and an additional consumer survey (SWPP-13).

Source of truth: `docs/spec/prd.md` (Korean).
