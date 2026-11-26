## 2026-11-26 — Beta farms, consumer recruitment and OneStore status

- **Record type** — Asynchronous standup via KakaoTalk

### Discussion

- **Beta farms.** Jinwoo reached the candidate farms by phone. Four agreed to join, one declined because its harvest is already sold out, and one has not answered yet. The team discussed whether six farms selling similar citrus would be too many for testers to choose between and for one person to support. It settled on onboarding everyone who agrees, with Jinwoo collecting farmer questions and passing them to the right teammate.
- **Real sales.** Testers are not required to buy, but real purchases are welcome. Consumers pay the farm directly by bank transfer, and Farmclub does not take the money, so a farm loses nothing if no one buys. Jinwoo completed one real transaction with a tester the same evening. Telemetry counts only completed purchases for the purchase measures.
- **Consumer recruitment.** Minsun proposed recruiting at least 12 consumers with an interest in buying: 6 from her network and 2 from each other member. The two Alpha testers she knows will be encouraged to try a real purchase.
- **Farmer onboarding message.** Jinwoo shared the message he sends to farmers. It covers registering the farm, the in-app guide and the bank account, creating a product with "AI로 채우기", requesting a sale, AI reply settings with a preview, posting in the news room, and confirming deposits and shipping.
- **OneStore.** The consumer app was approved and can be distributed. The farmer app needs changes and will be resubmitted (Hyun).
- **Feedback.** A farmer tester again found the news room and the 1:1 chat confusing.
- **Farmer QA (Jinwoo).** Two new findings on the farmer app: the farm profile has no way to upload a photo, and product photos are shown in a fixed aspect ratio, so images that do not match it are cropped.
- **Other.** Jinwoo will review Minsun's fan features PR (challenges and farm warmth, #814) once it is ready. Hyun will hand an Android test phone to Minsun in class.

### Decisions

- Onboard all farms that agree, up to six. Four are confirmed so far.
- Real purchases are allowed but not required. Consumers pay the farm directly.
- Target at least 12 consumer testers.

### Action Items

| Item | Owner |
| --- | --- |
| Approve farm applications and relay farmer questions | Jinwoo |
| Recruit 6 consumer testers | Minsun |
| Recruit 2 consumer testers each | Zahra, Jinwoo, Hyun |
| Fix and resubmit the farmer app to OneStore | Hyun |
| Review the fan features PR (#814) when ready | Jinwoo |
| Hand the Android test phone to Minsun in class | Hyun |
| Triage the farmer QA findings (farm profile photo upload, product photo cropping) into the pre-Beta fixes (DEV-416) | Jinwoo |
