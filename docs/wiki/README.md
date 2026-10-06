# Wiki workflow

`docs/wiki/` is the source of truth for the GitHub Wiki. On every push to `main` that touches this folder, `.github/workflows/wiki-sync.yml` mirrors it to the Wiki.

| In the repo | On the Wiki |
| -- | -- |
| `docs/wiki/<Page-Name>.md` | Page `<Page-Name>` (hyphens show as spaces in the title) |
| `docs/wiki/_Sidebar.md` | Sidebar on every page |
| `docs/wiki/images/*` | Images, referenced as `images/xxx.png` |
| `docs/wiki/meetings/YYYY-MM-DD-*.md` | Merged into one `Meeting-Logs` page, newest first |

Rules
- Write the wiki in English.
- Do not edit pages directly on the Wiki. The next sync overwrites them. Edit here and open a PR.
- Put related Linear keys in commit messages, e.g. `docs(meetings): 10/02 meeting notes (SWPP-71)`, so Linear links the commit.
- The wiki is visible to TAs. Keep company/legal/tax/equity matters, personal details, and personal data out of it.
