# Chat emoticons (DEV-468)

Farmclub provides ten approved situation stickers: reservation, payment, packing, shipping, arrival, delicious, waiting, checking, thanks, and sorry. The original A-style orange idol and stone fan retain their rounded lettering and hold no objects. Original PNGs are retained; ten transparent 480px WebP display assets total 323,680 bytes.

Both apps share a + menu for photos and stickers in farm conversations and news rooms. Selection previews before sending. Tapping the same selection again or Send sends it on its own, preserving any text and photo draft. Failure retains selection and the idempotency key. Stickers render at 160px with vertical breathing room, without duplicate caption text. Producer news keeps the follower confirmation and displays the image centered in the new post card. Consumer replies remain private to their author and the farm producer, including the reply sheet.

The APIs accept an optional emoticonId; unknown values and mixed text/media payloads are rejected. Saved messages carry the ID and a fixed readable Korean body caption for lists, quotes, and existing clients. Sticker text is immutable. A consumer sticker does not call AI or request a human answer. Existing authorization, order context, follow rules, privacy, and deduplication remain in force. Operator support conversations do not offer stickers.

Deploy the server first: migration 0038 adds three nullable columns and runs via the existing startup migration command. Then deploy both apps. Images ship in the app bundle; no storage upload or new environment variable is required. Figma alignment is tracked by DEV-470. PR #820 includes the preceding DEV-467 card and private photo reply work.
