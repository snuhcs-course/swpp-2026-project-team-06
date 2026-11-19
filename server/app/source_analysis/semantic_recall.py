"""DEV-264: semantic fact recall next to strict recall, for an existing final_eval output dir.

python -m app.source_analysis.semantic_recall --out DIR --gold FILE [--max-usd 1] [--self-check]

Strict recall is unchanged (final_score). Only facts that miss the strict token match in their
own section are sent to the frozen judge (`app.ai.fact_judge`). Unknown counts as a miss.
--self-check measures the judge before trusting it: on facts that already pass strictly it
should say yes; on facts taken from another source (absent here) it should say no.
Holdout outputs are refused unless --allow-holdout (needs the PM's approval: the judge sends
gold facts and drafts to the model provider).
"""

import argparse
import json
from collections import Counter
from pathlib import Path

from app.ai import fact_judge
from app.source_analysis import final_score as fs


def load_gold(path, metadata):
    raw = json.loads(Path(path).read_text())
    if isinstance(raw, list):
        fmt = {s["id"]: s["format"] for s in metadata["sources"]}
        raw = {
            "schemaVersion": 1,
            "split": metadata.get("split", "development"),
            "sources": [{**s, "format": s.get("format") or fmt[s["id"]]} for s in raw],
        }
    return fs.Gold.model_validate(raw)


def sections_for(out, sid):
    path = out / f"{sid}.output.json"
    if not path.exists():
        return None
    record = json.loads(path.read_text())
    if record.get("status") not in {"EVALUATED", "PARTIAL"}:
        return None
    return {
        section: "\n".join(
            t
            for m in record["modules"]
            if fs.MODULE_SECTIONS.get(m["module"]) == section
            for t in m["texts"]
        )
        for section in fs.SECTION_MODULES
    }


def _ask(judge, facts, sections, spent, max_usd):
    if not facts:
        return {}
    if spent["usd"] >= max_usd:
        return {f["id"]: "unknown" for f in facts}
    try:
        answers, usage = judge(facts, sections)
    except fact_judge.JudgeError:
        return {f["id"]: "unknown" for f in facts}
    cost = usage.get("cost")
    spent["usd"] += cost if isinstance(cost, (int, float)) else 0
    spent["calls"] += 1
    return answers


def score(out, gold, *, judge=fact_judge.judge, max_usd=1.0, self_check=False):
    spent = {"usd": 0.0, "calls": 0}
    rows, check = [], Counter()
    others = list(gold.sources)
    for i, src in enumerate(gold.sources):
        sections = sections_for(out, src.id)
        facts = [(sent.section, f) for sent in src.sentences for f in sent.facts]
        strict = {
            f.id: bool(sections) and fs.contains(f.mustContain, sections[sec]) for sec, f in facts
        }
        misses = [
            {"id": f.id, "section": sec, "statement": f.statement}
            for sec, f in facts
            if sections and not strict[f.id]
        ]
        answers = _ask(judge, misses, sections, spent, max_usd) if sections else {}
        for _sec, f in facts:
            rows.append(
                {
                    "source": src.id,
                    "format": src.format,
                    "fact": f.id,
                    "critical": f.critical,
                    "strict": strict[f.id],
                    "judge": answers.get(f.id),
                    "semantic": strict[f.id] or answers.get(f.id) == "yes",
                }
            )
        if self_check and sections:
            passed = [
                {"id": f.id, "section": sec, "statement": f.statement}
                for sec, f in facts
                if strict[f.id]
            ]
            for answer in _ask(judge, passed, sections, spent, max_usd).values():
                check["present_" + answer] += 1
            other = others[(i + 1) % len(others)]
            absent = [
                {"id": "absent-" + f.id, "section": sent.section, "statement": f.statement}
                for sent in other.sentences
                for f in sent.facts
            ][:10]
            for answer in _ask(judge, absent, sections, spent, max_usd).values():
                check["absent_" + answer] += 1
    return rows, spent, dict(check)


def summary(rows):
    def rate(rs, key):
        return {"hit": sum(r[key] for r in rs), "total": len(rs)}

    by_format = {}
    for fmt in fs.FORMATS:
        rs = [r for r in rows if r["format"] == fmt]
        if rs:
            by_format[fmt] = {
                "strict": rate(rs, "strict"),
                "semantic": rate(rs, "semantic"),
                "criticalStrict": rate([r for r in rs if r["critical"]], "strict"),
                "criticalSemantic": rate([r for r in rs if r["critical"]], "semantic"),
            }
    crit = [r for r in rows if r["critical"]]
    return {
        "judgeVersion": fact_judge.JUDGE_VERSION,
        "judgeModel": fact_judge.JUDGE_MODEL,
        "judgePromptSha256": fs.sha256(fact_judge.JUDGE_PROMPT.encode()),
        "overall": {
            "strict": rate(rows, "strict"),
            "semantic": rate(rows, "semantic"),
            "criticalStrict": rate(crit, "strict"),
            "criticalSemantic": rate(crit, "semantic"),
            "judgeAnswers": dict(Counter(r["judge"] for r in rows if r["judge"])),
        },
        "byFormat": by_format,
    }


def main(argv=None):
    parser = argparse.ArgumentParser()
    parser.add_argument("--out", type=Path, required=True)
    parser.add_argument("--gold", type=Path, required=True)
    parser.add_argument("--max-usd", type=float, default=1.0)
    parser.add_argument("--self-check", action="store_true")
    parser.add_argument("--allow-holdout", action="store_true")
    args = parser.parse_args(argv)
    metadata = json.loads((args.out / "metadata.json").read_text())
    if metadata.get("split") == "holdout" and not args.allow_holdout:
        raise SystemExit("Holdout needs --allow-holdout (PM approval)")
    gold = load_gold(args.gold, metadata)
    rows, spent, check = score(args.out, gold, max_usd=args.max_usd, self_check=args.self_check)
    report = {**summary(rows), "cost": spent, "selfCheck": check}
    (args.out / "semantic.json").write_text(json.dumps(report, ensure_ascii=False, indent=2))
    print(json.dumps({k: report[k] for k in ("overall", "cost", "selfCheck")}, ensure_ascii=False))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
