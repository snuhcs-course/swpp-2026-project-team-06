# Relaxed source coverage contract — DEV-447/448

FEAT-03/04/07; AC-SRC-2/3/5/10; M-11/18. `dev448-relaxed-v1` is an opt-in offline diagnostic. Historical gold and scorers remain unchanged. No provider, holdout, DB, product persistence or adoption is involved.

`relaxed_score.score(gold, records, safe_texts, *, policy)` accepts legacy-shaped development gold dictionaries, legacy Run dictionaries/models, and a source-ID→safe-text dictionary. Raw gold is intentionally not passed through historical contradiction rejection. All original source facts remain present. Policy binds the canonical JSON SHA256 of each complete scored source version. Duplicate/unknown runs and stale/incomplete mappings raise ValueError. Missing/failed runs remain misses; residual failed output is still audited.

Policy shape:

```json
{
  "schemaVersion": 1,
  "policyVersion": "local-revision-id",
  "approval": "USER_AUTHORIZED_POLICY",
  "sources": {
    "source-id": {
      "sourceSha256": "canonical original source SHA256",
      "facts": {
        "original-fact-id": {
          "requirement": "essential",
          "aliases": ["Complete source-equivalent proposition, with its option and qualifiers."],
          "reason": "Source-linked reason for requirement/alias decision",
          "sourceRef": "Private source location reference"
        }
      },
      "forbidden": {
        "0": {
          "disposition": "enforce",
          "reason": "Source-linked disposition reason",
          "sourceRef": "Private source location reference"
        }
      }
    }
  }
}
```

Requirements are `essential`, `optional`, or `review`; each has its own denominator, including per-format counters. Original `critical` is retained separately and never silently reclassified. Forbidden keys are zero-based original list indexes, each with `enforce`, `source_equivalent`, or `review`. A source-equivalent disposition excludes only that historical forbidden rule; global price, PII, health and platform safety diagnostics remain. A review disposition stays visible as a review issue. Classification and aliases are policy author declarations, not human factual approval. SourceRef records traceability, which this code cannot independently adjudicate.

Page-wide coverage is the primary relaxed completeness view; placement never reduces it. Linked-clause coverage remains a separate relation warning diagnostic. Each scoped `source-id/fact-id` counts once despite duplicate output. `selectorCoverage` is the linked-clause **lexical diagnostic**: every original mustContain selector must occur within a single explicit clause, or an entire approved alias/reference must match mechanically. Tokens spread across disconnected clauses receive `AMBIGUOUS`; `pageWideSelectorCoverage` retains their raw observation separately. Neither diagnostic proves correct product/option association. A same-clause token coincidence can still be wrong; review remains necessary.

`boundedPreservation` credits only complete reference/explicit alias equivalence, under bounded normalization: whitespace, spelling of Brix, range punctuation, and exact kg↔g conversion with unit boundaries. No global synonym, numeric tolerance, rounding, limit-direction change, negation erasure or producer-authored free rewrite is trusted. Aliases must be complete, source-checked propositions preserving product/option, scope, numbers, polarity and qualifiers. Changing policy invalidates its report hash; changing original source invalidates policy binding.

Per-fact statuses are `PRESERVED`, `SELECTOR_MATCH` (diagnostic only), `AMBIGUOUS`, `CONFLICT`, `MISSING`, or `NOT_PROCESSED`. Narrow same-proposition numeric mutations and recognized same-subject property polarity reversals yield `CONFLICT`; this is deliberately incomplete. Unknown contradictions, headings, product associations and qualifier implications remain review work. Additional output clauses not exactly reference/alias-equivalent are exposed in `supportIssues` as UNKNOWN or narrow CONFLICT. Safe-text input supplies the historical API envelope and is not a semantic proof oracle.

Reports include hashes/IDs/counts, separate forbidden/safety/support issues, requirement and format denominators, and `acceptance=NOT_ASSESSED`. No automatic PASS or semantic accuracy claim is emitted. Private raw sources, aliases, output text, reasons and sourceRef values are not copied into reports. Agent-authored calibration and user policy authorization do not constitute a full human factual adjudication.
