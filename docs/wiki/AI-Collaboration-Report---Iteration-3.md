# AI Collaboration Report – Iteration 3

**Team 6 — Farmclub | 28 October–6 November 2026, Asia/Seoul**

**Contributors:** Minsun Kim, Hyun Park, Jinwoo Jang and Zahra Gholami.

**Tools:** Codex (recorded GPT-6 Luna, GPT-6 Sol and GPT-6.1 Sol); Claude Code (Opus 5.5 and Fable). Product AI models are separate systems under evaluation. [Member evidence and selected input prompts](AI-Collaboration-Report---Iteration-3---Evidence).

## 1. Where AI Was Used

Minsun used agents for planning, reassignment, evaluation protocols, chat regression, fixes and documentation. Hyun delegated consumer features, heuristic follow-up and CI coordination. Jinwoo used agents for producer workflows, factual preservation and evaluation diagnostics. Zahra used them for support evaluation, safety fixes and demo preparation. Agents wrote code, tests and drafts; people retained scope and acceptance decisions. Production variables, signing credentials and account operations stayed with people; Hyun and Zahra report reviewing and authorizing their merges.

## 2. Actual Prompts and Revisions

Zahra narrowed an AI support README review: “forget about it. can you edit the readme i sent and ONLY add the missing scope of the evaluation?” She then asked the agent to identify the exact lines added. This constrained the revision to supported evaluation scope and made the changes reviewable, while leaving the final decision with her.

For testing she required: “Please carefully review everything stated in the linear task first, before going on with implementation. All requirements should be directly, correctly resolved”. She then requested full scenario execution and diagnosis before splitting fixes into tasks. These revisions made completion observable. Longer original-language inputs and separate translations are in the linked evidence; agent responses and private teammate text are excluded.

## 3. What AI Did Well

The agents connected failures across layers. Minsun’s paid-order entry and reading-position defects became nine scoped tasks. [PR #482](https://github.com/snuhcs-course/swpp-2026-project-team-06/pull/482) records seven API scenarios and 57 browser cases passing on `4c57556`, including ten zero-drift round trips. These are regression results, not physical-device assurance.

Zahra’s support rerun improved from 141/180 to 180/180 synthetic trials, with five guards passing. Its 72 model calls, 99 rule responses and nine injected faults make the denominator interpretable. Jinwoo’s frozen-candidate draft comparison improved fact hits from 683 to 699/1062; it remains development-set evidence. Hyun’s journey runs retained failures and linked them to fix issues rather than rewriting the original verdicts.

## 4. Errors and Limitations

Agents sometimes accepted an issue’s diagnosis too readily: Hyun’s Brix investigation found a missing data path rather than the stated regex cause. Zahra’s conflict fix missed numbers-versus-no-numbers evidence until another review exposed it. Jinwoo found provider failures and rule-only answers could make quality scores misleading; semantic review also caught an upper bound becoming an approximation despite improved scores.

Minsun’s first evaluation stopped at environment blockers too early; supporting checks did not execute the five complete journeys. Later runs corrected that gap. Test fixtures also assumed wrong labels, pagination and order/farm pairing. Failures and corrections remain in the [testing record](Testing-Documentation). No defensible time-saving estimate follows from these counts. Human sign-off and post-fix reruns remain incomplete for some evaluation cohorts, as the member records state.

## 5. Manual Fixes and Human Accountability

Minsun’s documented corrections changed instructions, ownership and verification scope; no specific hand-written product-code patch is established. We do not relabel agent-authored fixes as manual edits. Hyun caught a removed forwarding label and required restoration; Zahra checked the production timeout herself. These are human review and operational actions, distinct from writing the implementation. Agent-hour figures in PRs are estimates; overlapping sessions are not summed as measured work.

## 6. Takeaway

Next iteration, freeze criteria before execution, check root causes against code, and ask independent reviewers to challenge fixes. Keep rule/model paths, development/holdout results and human decisions separate. Passing automation does not replace semantic review, user evaluation or accountable acceptance.
