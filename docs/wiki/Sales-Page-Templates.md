# Sales page template prototypes

DEV-52 is an isolated design prototype for FEAT-03/04/07. It introduces three editable layouts: Farm Store, Field Journal, and A Letter from the Farm. The same user-supplied text and local photos are retained when switching layouts.

No product photos, people, farms, quality claims, or sales copy are generated. Missing optional content is omitted. Image generation is limited to a prebuilt abstract decorative background. Pretendard, Do Hyeon and Gowun Batang are distributed with their OFL licenses. Do Hyeon and Gowun Batang are converted from the official TTF files to WOFF2 without changing glyphs or font names.

The prototype does not call an AI or sales API, change existing product content, or publish anything. Uploads stay in browser memory; reloading discards them. JSON export contains text, template choice and photo filenames, not image data. Extraction and production persistence are separate follow-up work. See `docs/design/sales-templates/spec.md` for acceptance criteria and `tasks.md` for validation results.

An explicit demo button or `?demo=1` loads the repository's existing fictional farm copy and sample photographs. The studio and exported JSON identify the material as a design example, not actual sales evidence. Replacing existing content and clearing it require confirmation. The three layouts use different section order, typography, photo spacing and information hierarchy. Reference decisions and sources are recorded in the prototype README.
