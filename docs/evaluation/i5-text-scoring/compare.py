"""DEV-448 opt-in offline text comparison. Explicit development inputs only."""

import argparse
import hashlib
import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[3]
sys.path.insert(0, str(ROOT / "server"))
from app.source_analysis import text_score


def compare(data):
    if (
        type(data) is not dict
        or set(data) != {"version", "gold", "arms"}
        or data["version"] != 1
    ):
        raise ValueError("Invalid comparison envelope")
    gold = data["gold"]
    if gold.get("split") != "development" or not gold.get("sources"):
        raise ValueError("Explicit development gold required")
    if not isinstance(data["arms"], list) or not data["arms"]:
        raise ValueError("Named saved arms required")
    reports, names = [], set()
    common_safe = None
    for arm in data["arms"]:
        if set(arm) != {"name", "records", "safeTexts"} or not isinstance(
            arm["name"], str
        ):
            raise ValueError("Invalid saved arm")
        if not arm["name"].strip() or arm["name"] in names:
            raise ValueError("Unique arm names required")
        names.add(arm["name"])
        if common_safe is not None and arm["safeTexts"] != common_safe:
            raise ValueError("Saved text comparison requires identical source evidence")
        common_safe = arm["safeTexts"]
        reports.append(
            {
                "name": arm["name"],
                "report": text_score.score(gold, arm["records"], arm["safeTexts"]),
            }
        )
    return {
        "version": 1,
        "purpose": "DEVELOPMENT_DIAGNOSTIC_NOT_RELEASE_ACCEPTANCE",
        "humanReview": "PENDING",
        "arms": reports,
    }


def main():
    p = argparse.ArgumentParser(description=__doc__)
    p.add_argument("--input", type=Path, required=True)
    p.add_argument("--out", type=Path, required=True)
    a = p.parse_args()
    if a.out.resolve().is_relative_to(ROOT):
        raise ValueError("Private report must be outside checkout")
    raw = a.input.read_bytes()
    report = compare(json.loads(raw))
    report["inputSha256"] = hashlib.sha256(raw).hexdigest()
    a.out.parent.mkdir(mode=0o700, parents=True, exist_ok=True)
    with a.out.open("x", encoding="utf-8") as f:
        a.out.chmod(0o600)
        json.dump(report, f, ensure_ascii=False, indent=2)
        f.write("\n")
    print(
        json.dumps(
            {"output": str(a.out), "arms": len(report["arms"]), "providerCalls": 0}
        )
    )


if __name__ == "__main__":
    main()
