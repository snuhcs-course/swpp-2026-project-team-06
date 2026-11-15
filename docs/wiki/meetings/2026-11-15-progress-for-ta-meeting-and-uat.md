## 2026-11-15 — Progress check for the TA meeting and UAT

- **Contributors:** Jinwoo Jang, Minsun Kim, Zahra, Hyun Park
- **Record type:** Asynchronous coordination via KakaoTalk (about 1 hour)
- **Note taker:** Jinwoo Jang

### Agenda

- Share each member's Iteration 4 progress.
- Collect material for the TA meeting presentation on Wednesday, 18 November.
- Get ready for the in-class UAT on 16 and 18 November.

### Discussion

- Members shared progress for the TA meeting and the UAT.
- Jinwoo reported fixes based on feedback from the first farmers using the production producer app:
  - Merged: a default product photo when none is set ([#605](https://github.com/snuhcs-course/swpp-2026-project-team-06/pull/605)), save feedback in the sales-page editor ([#607](https://github.com/snuhcs-course/swpp-2026-project-team-06/pull/607)), less page lag across the apps ([#609](https://github.com/snuhcs-course/swpp-2026-project-team-06/pull/609)), smaller published product photos ([#611](https://github.com/snuhcs-course/swpp-2026-project-team-06/pull/611)), a link to the consumer page on the producer home ([#606](https://github.com/snuhcs-course/swpp-2026-project-team-06/pull/606)), and sold-out products that stay listed ([#608](https://github.com/snuhcs-course/swpp-2026-project-team-06/pull/608)).
  - In progress: Brix and size fields that accept input even while the sales page has unsaved edits.
- Minsun shared notes from a consumer walkthrough:
  - A Brix value such as "12 Brix" means little to most consumers. The product page could compare it with a familiar snack (for example, "about as sweet as a Mon Cher cream cake; recommended for people who love sweet fruit").
  - In chat, the difference between the news room and a 1:1 chat is not clear. Consumers need a short guide on which one to use, and the rooms where the AI customer-support feature answers should be clearly marked.
  - Pressing Enter does not send a chat message; only the arrow button does. Options: send on Enter, or show a placeholder hint ("Type a message and press the arrow") that disappears while typing.
  - Consumers should get an onboarding guide like the producer onboarding.
- Zahra asked how to use the AI evaluation sets. Jinwoo (PM) decided that she tunes on the existing development set and runs the holdout set once, at the end, on the final version.

### Decisions

- Jinwoo presents at the TA meeting on Wednesday, 18 November.
- Jinwoo (PM): tune the AI features on the development set and run the holdout only once, on the final version.

### Action Items

| Item | Owner |
| --- | --- |
| Prepare and give the TA meeting presentation (18 November) | Jinwoo |
| Finish the Brix and size input fix | Jinwoo |
| Tune the AI features on the development set; run the holdout once at the end | Zahra |
