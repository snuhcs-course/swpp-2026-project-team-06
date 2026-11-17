# Prospective I3 journey oracle v1.1 — DEV-244

Status: proposed for PM review; not evidence of a completed UAT run or approval.

Inherit all prerequisites, denominators, verdict rules, evidence requirements and AI corpus controls from [v1.0 protocol](../../protocol.md). Its pinned digest is retained in this manifest. Root v1.0 files and all v1.0 execution results remain unchanged, including I3-CHAT-02's historical exact-tuple FAIL.

## Only behavioral assertion delta

I3-CHAT-02 uses persisted message sequence as the authoritative 1:1 display order and cursor boundary, as implemented by merged DEV-235 and specified in contracts-1.2. Question → reply remains causal even with identical timestamps, opposing lexical IDs or skewed timestamps. KST date labels still use createdAt. Cursor authorization remains scoped to the viewer/thread, with the message ID retained as cursor metadata. Read watermarks also use saved sequence. News rooms keep their distinct createdAt/ID pagination contract.

Only the version field changes in other rows. All 44 cases, priorities, planned denominators and result statuses remain unchanged. A new execution must record v1.1 and these digests; never relabel an old v1.0 result. Until PM review/adoption is recorded, this candidate does not resolve DEV-262's decision prerequisite.
