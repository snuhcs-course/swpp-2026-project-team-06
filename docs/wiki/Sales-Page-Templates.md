# Sales page template prototypes

DEV-52 is an isolated design prototype for FEAT-03/04/07. It introduces three editable layouts: product essentials, editorial, and a farmer's letter. The same user-supplied text and local photos are retained when switching layouts.

No product photos, people, farms, quality claims, or sales copy are generated. Missing optional content is omitted. Image generation is limited to a prebuilt abstract decorative background. Pretendard is distributed with its OFL license.

The prototype does not call an AI or sales API, change existing product content, or publish anything. Uploads stay in browser memory; reloading discards them. JSON export contains text, template choice and photo filenames, not image data. Extraction and production persistence are separate follow-up work. See `docs/design/sales-templates/spec.md` for acceptance criteria and `tasks.md` for validation results.
