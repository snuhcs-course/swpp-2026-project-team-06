"""Version development gold under the user-authorized, draft-first policy.

Offline only. Never discovers inputs or overwrites historical files. Source text and
generated artifacts belong in a private output directory, not this repository.
"""

import argparse
import copy
import hashlib
import json
import re
from collections import Counter
from pathlib import Path

VERSION = "draft-first-gold-v2"


def digest(value):
    return hashlib.sha256(
        json.dumps(
            value, ensure_ascii=False, sort_keys=True, separators=(",", ":")
        ).encode()
    ).hexdigest()


def migrate(original, overrides=None, formats=None):
    overrides = overrides or {}
    if original.get("split") != "development":
        raise ValueError("Only explicit development gold is supported")
    gold = copy.deepcopy(original)
    gold["schemaVersion"] = 1
    if set(overrides) - {s["id"] for s in gold["sources"]}:
        raise ValueError("Unknown source override")
    policy = {
        "schemaVersion": 1,
        "policyVersion": VERSION,
        "approval": "USER_AUTHORIZED_POLICY",
        "sources": {},
    }
    mapping, changes = [], []
    counts = Counter()
    for source in gold["sources"]:
        sid = source["id"]
        if formats is not None:
            if sid not in formats or formats[sid] not in {
                "text",
                "image",
                "long_image",
                "pdf",
            }:
                raise ValueError("Missing or invalid source format")
            if source.get("format", formats[sid]) != formats[sid]:
                raise ValueError("Source format mismatch")
            source["format"] = formats[sid]
        override = overrides.get(sid, {})
        fact_ids = {f["id"] for s in source["sentences"] for f in s["facts"]}
        if set(override) - {"facts", "forbidden", "additions"}:
            raise ValueError("Unknown override field")
        if set(override.get("facts", {})) - fact_ids:
            raise ValueError("Unknown fact override")
        if set(override.get("forbidden", {})) - {
            str(i) for i in range(len(source.get("forbidden", [])))
        }:
            raise ValueError("Unknown forbidden override")
        entry = {"facts": {}, "forbidden": {}}
        policy["sources"][sid] = entry
        for sentence in source["sentences"]:
            for fact in sentence["facts"]:
                fid = fact["id"]
                requirement = "essential" if fact["critical"] else "optional"
                reason = "Existing critical facts remain essential; other detail is optional."
                if re.search(
                    r"\d{4}\s*년|\d+\s*년\s*(?:전|차)|발송|배송|출고|택배|제철|수확\s*시기",
                    fact["statement"],
                ):
                    requirement = "review"
                    reason = "Time-sensitive/source-operating claim: preserve draft and ask owner."
                custom = override.get("facts", {}).get(fid, {})
                requirement = custom.get("requirement", requirement)
                reason = custom.get("reason", reason)
                aliases = custom.get("aliases", [])
                if requirement not in {"essential", "optional", "review"} or not reason:
                    raise ValueError("Invalid requirement override")
                if not isinstance(aliases, list) or any(
                    not isinstance(a, str) or not a.strip() for a in aliases
                ):
                    raise ValueError("Invalid aliases")
                if "statement" in custom:
                    fact["statement"] = custom["statement"]
                old_critical = fact["critical"]
                entry["facts"][fid] = {
                    "requirement": requirement,
                    "aliases": aliases,
                    "reason": reason,
                    "sourceRef": custom.get(
                        "sourceRef", f"original-development-gold:{sid}/{fid}"
                    ),
                }
                counts[requirement] += 1
                mapping.append(
                    {
                        "sourceId": sid,
                        "oldFactId": fid,
                        "newFactId": fid,
                        "oldCritical": old_critical,
                        "requirement": requirement,
                    }
                )
                if (old_critical and requirement != "essential") or aliases:
                    changes.append(
                        {
                            "sourceId": sid,
                            "factId": fid,
                            "requirement": requirement,
                            "aliasCount": len(aliases),
                        }
                    )
        # Source-specific additions/aliases are supplied privately, with provenance.
        for addition in override.get("additions", []):
            source["sentences"].append(copy.deepcopy(addition["sentence"]))
            for fact in addition["sentence"]["facts"]:
                fid = fact["id"]
                if fid in fact_ids or fact.get("critical") is not False:
                    raise ValueError("Addition must be new optional fact")
                fact_ids.add(fid)
                entry["facts"][fid] = {
                    "requirement": "optional",
                    "aliases": [],
                    "reason": addition["reason"],
                    "sourceRef": addition["sourceRef"],
                }
                counts["optional"] += 1
                mapping.append(
                    {
                        "sourceId": sid,
                        "oldFactId": None,
                        "newFactId": fid,
                        "oldCritical": None,
                        "requirement": "optional",
                    }
                )
        for index, item in enumerate(source.get("forbidden", [])):
            kind = item["kind"]
            disposition = "enforce"
            reason = "Retain actual privacy, unsupported facts and other-product constraints."
            if kind in {"price", "platform", "ui", "watermark"}:
                disposition = "review"
                reason = "Source text is private-draft review information; report separately from omission."
            custom = override.get("forbidden", {}).get(str(index), {})
            disposition = custom.get("disposition", disposition)
            reason = custom.get("reason", reason)
            if (
                disposition not in {"enforce", "review", "source_equivalent"}
                or not reason
            ):
                raise ValueError("Invalid forbidden disposition")
            entry["forbidden"][str(index)] = {
                "disposition": disposition,
                "reason": reason,
                "sourceRef": f"original-development-gold:{sid}/forbidden/{index}",
            }
        entry["sourceSha256"] = digest(source)
    report = {
        "version": VERSION,
        "approval": "USER_AUTHORIZED_POLICY",
        "originalGoldSha256": digest(original),
        "revisedGoldSha256": digest(gold),
        "sourceCount": len(gold["sources"]),
        "requirements": dict(counts),
        "factMap": mapping,
        "changes": changes,
        "limitations": [
            "Policy revision, not a full source-by-source human factual audit.",
            "Historical gold remains unchanged. No score gain is implied by this migration.",
            "Review classification does not remove text from private draft or approve publication.",
            "Original source facts/relations remain authoritative; aliases are source-specific.",
        ],
    }
    return gold, policy, report


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--gold", type=Path, required=True)
    parser.add_argument("--out", type=Path, required=True)
    parser.add_argument("--overrides", type=Path)
    parser.add_argument(
        "--manifest", type=Path, help="Explicit development format manifest"
    )
    args = parser.parse_args()
    overrides = json.loads(args.overrides.read_text()) if args.overrides else {}
    formats = None
    if args.manifest:
        manifest = json.loads(args.manifest.read_text())
        if manifest.get("split") != "development":
            raise ValueError("Development format manifest required")
        formats = {c["id"]: c["format"] for c in manifest["cases"]}
    result = migrate(json.loads(args.gold.read_text()), overrides, formats)
    args.out.mkdir(parents=True, exist_ok=False)
    for name, value in zip(
        ("gold-v2.json", "policy-v2.json", "migration.json"), result, strict=True
    ):
        (args.out / name).write_text(json.dumps(value, ensure_ascii=False, indent=2))
    print(
        json.dumps(
            {k: result[2][k] for k in ("version", "sourceCount", "requirements")}
        )
    )


if __name__ == "__main__":
    main()
