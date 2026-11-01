"""DEV-187 deterministic final-text scoring. Offline; reports never contain source text."""

import argparse
import json
import re
import unicodedata
from collections import Counter
from pathlib import Path
from typing import Annotated, Literal

from pydantic import BaseModel, ConfigDict, Field, ValidationError, model_validator

from app.source_analysis.corpus_score import FORMATS, canonical_bytes, normalize, sha256
from app.source_analysis.schemas import SECTION_MODULES, SectionId
from app.source_analysis.text_safety import MONEY, SAFETY_LISTS

# Evaluation aliases explicitly requested by DEV-187; do not change product modules.
MODULE_SECTIONS = {
    module: section for section, modules in SECTION_MODULES.items() for module in modules
}
MODULE_SECTIONS.update(name="intro", historicalSales="farm")
TEXT_MODULES = set(MODULE_SECTIONS) - {
    "sizePhoto",
    "crossSectionPhoto",
    "packagePhoto",
    "farmPhotos",
}
# 금액 식과 금지어 목록은 제품 2단계(DEV-186)와 같은 text_safety_lists.json 하나에서 읽는다.
MONEY_RE = MONEY
PHONE_RE = re.compile(
    r"(?<!\d)(?:(?:\+82[ .-]?(?:0)?|0)(?:1[016789]|2|[3-6][1-5]|70|80|50\d)"
    r"\)?\s*[ .\-–]?\s*\d{3,4}\s*[ .\-–]?\s*\d{4}"
    # 대표번호(1588-1234)만 1500-2000g·해발 1600-1800m 같은 범위와 모양이 같아 단위가 붙으면 뺀다.
    r"|1[568]\d{2}\s*[ .\-–]?\s*\d{4}"
    r"(?!(?:원|년|개|상자|박스)|\s*(?:kg|mg|g|ml|cm|mm|m)(?![a-zA-Z])|\s*%))"
    r"(?!\d)"
)
EMAIL_RE = re.compile(r"[\w.+-]+@[\w.-]+\.[a-zA-Z]{2,}")
NUMBER_RE = re.compile(
    r"[+-]?\d[\d,]*(?:\.\d+)?(?:\s*[~–-]\s*[+-]?\d[\d,]*(?:\.\d+)?)?"
    r"\s*(?:(?:kg|mg|[μµ]g|g|brix|cm|mm|ml|l|m|톤|리터|년|개월|월|일|시간|분|초|"
    r"과|개|상자|박스|%|도|회|명|배)(?![a-z]))?",
    re.I,
)
CERTIFICATIONS = ("GAP", "HACCP", "무농약", "유기농", "친환경", "인증")
FORBIDDEN_WORDS = {kind: tuple(SAFETY_LISTS[kind]) for kind in ("health", "platform")}
VALIDATION_DIR = Path(__file__).resolve().parents[3] / "docs/spec/validation"
DEV_MANIFEST = VALIDATION_DIR / "source-final-dev-manifest.json"
HOLDOUT_LOCK = VALIDATION_DIR / "source-final-holdout-i3-lock.json"
LOCAL_GOLD_SHA256 = {
    "holdout": "5a906044cd642a4f40e52961cc9613de27901b5e719f7714d156e4e9a8fe338b",
    "development": "3ed465971fb5579d10d8ee338e21c01c5d06c324d942acd8d36aba2635cf786f",
}
CULTIVARS = (
    "온주밀감",
    "궁천",
    "흥진",
    "유라조생",
    "일남1호",
    "하례조생",
    "타이벡",
    "한라봉",
    "천혜향",
    "레드향",
    "황금향",
    "카라향",
    "청견",
    "진지향",
    "세토카",
    "베니마돈나",
    "설향",
    "금실",
    "죽향",
    "장희",
    "샤인머스캣",
    "거봉",
    "캠벨",
    "홍로",
    "부사",
    "아리수",
)
ID = Annotated[str, Field(pattern=r"^[A-Za-z0-9][A-Za-z0-9_.-]{0,63}$")]
Nonempty = Annotated[str, Field(min_length=1)]
Digest = Annotated[str, Field(pattern=r"^[a-f0-9]{64}$")]
Format = Literal["text", "image", "long_image", "pdf"]


def normalize_final(text: str) -> str:
    value = unicodedata.normalize("NFC", text)
    # 당도 단위는 앞뒤 글자와 상관없이 같은 표기로 맞춘다("13.5Brix가", 토큰 "브릭스" 단독).
    value = re.sub(r"°\s*bx|brix|브릭스", "brix", value, flags=re.IGNORECASE)
    # Explicit counting units remain recognizable before Korean particles/endings.
    for word, number in (("한", "1"), ("두", "2"), ("세", "3"), ("네", "4")):
        value = re.sub(rf"(?<!\w){word}\s*(개|상자|박스)(?![a-zA-Z]|월|인)", rf"{number}\1", value)
    value = re.sub(
        r"(?<![\d,])\d{1,3}(?:,\d{3})+(?![\d,])",
        lambda match: match[0].replace(",", ""),
        value,
    )
    return normalize(value)


def compact(text: str) -> str:
    return re.sub(r"\s", "", normalize_final(text))


def contains(tokens: list[str], text: str) -> bool:
    value = compact(text)
    return all(compact(token) in value for token in tokens)


class StrictModel(BaseModel):
    model_config = ConfigDict(extra="forbid", strict=True)


class Fact(StrictModel):
    id: ID
    statement: Nonempty
    mustContain: Annotated[list[Nonempty], Field(min_length=1, max_length=3)]
    critical: bool


class Sentence(StrictModel):
    section: SectionId
    module: Literal[
        "name",
        "hero",
        "summary",
        "composition",
        "pieceCount",
        "taste",
        "specification",
        "qualityEvidence",
        "productionProcess",
        "delivery",
        "storage",
        "appearanceFaq",
        "support",
        "farmStory",
        "historicalSales",
        "farmUpdates",
    ]
    text: Nonempty
    where: Nonempty | None = None
    facts: Annotated[list[Fact], Field(min_length=1)]

    @model_validator(mode="after")
    def valid(self):
        if self.module not in TEXT_MODULES or MODULE_SECTIONS[self.module] != self.section:
            raise ValueError("Invalid section/module")
        if MONEY_RE.search(self.text) or PHONE_RE.search(self.text) or EMAIL_RE.search(self.text):
            raise ValueError("Unsafe gold sentence")
        # 채점기가 출력에서 위반으로 세는 건강·운영 단어는 정답 문장에도 둘 수 없다.
        if any(forbidden_words(self.text).values()):
            raise ValueError("Gold sentence contains a forbidden word")
        for fact in self.facts:
            if any(not re.sub(r"\s", "", token) for token in fact.mustContain):
                raise ValueError("Empty fact token")
            # Gold authors must copy verbatim; scoring additionally normalizes outputs.
            if not all(
                re.sub(r"\s", "", t) in re.sub(r"\s", "", self.text) for t in fact.mustContain
            ):
                raise ValueError("Fact token is not verbatim in gold sentence")
            if not contains(fact.mustContain, self.text):
                raise ValueError("Fact token does not match normalized gold sentence")
        return self


class Forbidden(StrictModel):
    kind: Literal[
        "price",
        "pii",
        "ui",
        "watermark",
        "other_product",
        "unsupported",
        "platform",
        "health",
        "other",
    ]
    text: Nonempty

    @model_validator(mode="after")
    def valid(self):
        if not compact(self.text):
            raise ValueError("Empty forbidden text")
        return self


class Source(StrictModel):
    id: ID
    format: Format
    product: Nonempty
    sentences: list[Sentence]
    forbidden: list[Forbidden]

    @model_validator(mode="after")
    def valid(self):
        ids = [f.id for s in self.sentences for f in s.facts]
        if len(set(ids)) != len(ids):
            raise ValueError("Duplicate fact ID")
        # 금지 구절이 정답 문장 안에 있으면 정답을 그대로 낸 출력도 위반이 된다.
        texts = [compact(s.text) for s in self.sentences]
        for item in self.forbidden:
            if any(compact(distinctive(item.text)) in t for t in texts):
                raise ValueError("Forbidden text appears in a gold sentence")
        return self


class Gold(StrictModel):
    schemaVersion: Literal[1]
    split: Literal["development", "holdout"]
    sources: list[Source]

    @model_validator(mode="after")
    def valid(self):
        if len({s.id for s in self.sources}) != len(self.sources):
            raise ValueError("Duplicate source ID")
        return self


class Module(StrictModel):
    module: Nonempty
    texts: list[str]

    @model_validator(mode="after")
    def valid(self):
        if self.module not in TEXT_MODULES:
            raise ValueError("Unknown text module")
        return self


class SupportJudgment(StrictModel):
    sentenceIndex: Annotated[int, Field(ge=0)]
    sentenceSha256: Digest
    supported: bool


class Run(StrictModel):
    id: ID
    format: Format
    status: Literal["EVALUATED", "PARTIAL", "FAILED", "EMPTY", "REJECTED", "NOT_RUN"] = "EVALUATED"
    modules: list[Module] = Field(default_factory=list)
    supportJudgments: list[SupportJudgment] = Field(default_factory=list)


def split_sentences(value: str) -> list[str]:
    # Protect decimal points and email/URL dots; periods split at whitespace/end, !? also inline.
    return [
        s.strip()
        for s in re.split(
            r"\n+|(?<=[!?。])\s*|(?<!\d)\.(?!\w)|(?<=\d)(?<!^\d)(?<!\n\d)\.(?!\d|\w|\s)", value
        )
        if s.strip()
    ]


def distinctive(text: str) -> str:
    return (
        re.sub(
            r"^(?:워터마크|watermark|연락처|전화|이메일|가격|버튼|UI)\s*[:：]\s*",
            "",
            text,
            flags=re.I,
        ).strip()
        or text
    )


def sensitive_tokens(text: str, cultivar_words=CULTIVARS) -> dict[str, set[str]]:
    # 줄 머리 번호 목록 표지(1. / 2))는 사실 숫자가 아니다.
    value = normalize_final(re.sub(r"(?m)^\s*\d{1,2}[.)]\s+", "", text))
    folded = compact(text).casefold()
    return {
        "number": {compact(m[0]).casefold() for m in NUMBER_RE.finditer(value)},
        "cultivar": {
            compact(w).casefold() for w in cultivar_words if compact(w).casefold() in folded
        },
        "certification": {w.casefold() for w in CERTIFICATIONS if w.casefold() in folded},
    }


def forbidden_words(text: str) -> dict[str, int]:
    value = compact(text)
    return {
        kind: sum(value.count(w) for w in {compact(x) for x in words})
        for kind, words in FORBIDDEN_WORDS.items()
    }


def _rate(hit: int, total: int) -> dict:
    return {"hit": hit, "total": total, "rate": hit / total if total else None}


def _bucket(rows: list[dict]) -> dict:
    counts = Counter()
    forbidden, unsupported = Counter(), Counter()
    for row in rows:
        counts.update(row["counts"])
        forbidden.update(row["forbidden"])
        unsupported.update(row["unsupported"])
    recall = _rate(counts["factHit"], counts["facts"])
    critical = _rate(counts["criticalHit"], counts["criticalFacts"])
    failed = (
        counts["failedRuns"]
        or counts["criticalHit"] < counts["criticalFacts"]
        or sum(forbidden.values())
        or sum(unsupported.values())
    )
    return {
        "sources": len(rows),
        "contractCases": sum(r["caseType"] == "contract" for r in rows),
        "extractionCases": sum(r["caseType"] == "extraction" for r in rows),
        "failedRuns": counts["failedRuns"],
        "factRecall": recall,
        "criticalFactRecall": critical,
        "misplacement": _rate(counts["misplaced"], counts["facts"]),
        "precisionProxy": _rate(counts["supportedSentences"], counts["outputSentences"]),
        "forbidden": dict(sorted(forbidden.items())),
        "forbiddenViolations": sum(forbidden.values()),
        "unsupported": dict(sorted(unsupported.items())),
        "unsupportedTokens": sum(unsupported.values()),
        "criticalGate": "FAIL" if failed else "PASS" if rows else "N/A",
    }


def score(
    gold: dict, records: list[dict], safe_texts: dict[str, str], *, cultivar_words=CULTIVARS
) -> dict:
    """Score one split. Safe texts are required for every gold ID, including absent runs.

    Invalid input raises a redacted ValueError. Human judgments are optional local inputs,
    bound to split_sentences() indices and SHA-256 of the stripped UTF-8 sentence.
    """
    try:
        parsed = Gold.model_validate(gold)
        runs = [Run.model_validate(r) for r in records]
        if len({r.id for r in runs}) != len(runs):
            raise ValueError
        sources = {s.id: s for s in parsed.sources}
        if set(safe_texts) != set(sources) or any(
            not isinstance(t, str) for t in safe_texts.values()
        ):
            raise ValueError
        if any(r.id not in sources or r.format != sources[r.id].format for r in runs):
            raise ValueError
    except (ValidationError, ValueError, TypeError, AttributeError):
        raise ValueError("Invalid final-score input (details redacted)") from None
    by_id = {r.id: r for r in runs}
    rows = []
    for source in parsed.sources:
        run = by_id.get(source.id)
        modules = run.modules if run else []
        sections = {
            section: "\n".join(
                t for m in modules if MODULE_SECTIONS[m.module] == section for t in m.texts
            )
            for section in SECTION_MODULES
        }
        sentences = [s for m in modules for t in m.texts for s in split_sentences(t)]
        all_text = "\n".join(t for m in modules for t in m.texts)
        failed = not run or run.status not in {"EVALUATED", "PARTIAL"} or not all_text.strip()
        counts = Counter(failedRuns=int(failed), outputSentences=len(sentences))
        section_rows = {}
        for section in SECTION_MODULES:
            sc = Counter()
            for sentence in source.sentences:
                if sentence.section != section:
                    continue
                for fact in sentence.facts:
                    hit = not failed and contains(fact.mustContain, sections[section])
                    misplaced = (
                        not failed
                        and not hit
                        and any(
                            contains(fact.mustContain, text)
                            for key, text in sections.items()
                            if key != section
                        )
                    )
                    sc.update(
                        facts=1,
                        factHit=int(hit),
                        criticalFacts=int(fact.critical),
                        criticalHit=int(hit and fact.critical),
                        misplaced=int(misplaced),
                    )
            counts.update(sc)
            section_rows[section] = {
                "counts": dict(sc),
                "factRecall": _rate(sc["factHit"], sc["facts"]),
                "criticalFactRecall": _rate(sc["criticalHit"], sc["criticalFacts"]),
                "misplacement": _rate(sc["misplaced"], sc["facts"]),
            }
        violations = Counter(
            {
                "price": 0,
                "phone": 0,
                "email": 0,
            }
        )
        # 모든 탐지는 출력 문구 하나씩 본다. 이어 붙이면 경계를 넘어 없는 위반이 생긴다.
        raw_texts = [t for m in modules for t in m.texts]
        for t in raw_texts:
            violations["price"] += len(MONEY_RE.findall(t))
            violations["phone"] += len(PHONE_RE.findall(t))
            violations["email"] += len(EMAIL_RE.findall(t))
        texts = [compact(t) for t in raw_texts]
        violations.update({kind: 0 for kind in FORBIDDEN_WORDS})
        for t in raw_texts:
            violations.update(forbidden_words(t))
        for entry in source.forbidden:
            if any(compact(distinctive(entry.text)) in t for t in texts):
                violations[f"gold_{entry.kind}"] += 1
        actual = {"number": set(), "cultivar": set(), "certification": set()}
        for t in raw_texts:
            for kind, tokens in sensitive_tokens(t, cultivar_words).items():
                actual[kind] |= tokens
        safe = sensitive_tokens(safe_texts[source.id], cultivar_words)
        unsupported = {kind: len(tokens - safe[kind]) for kind, tokens in actual.items()}
        judgments = {}
        for judgment in run.supportJudgments if run else []:
            index = judgment.sentenceIndex
            if (
                index in judgments
                or index >= len(sentences)
                or sha256(sentences[index].encode()) != judgment.sentenceSha256
            ):
                raise ValueError("Invalid support judgment (details redacted)")
            judgments[index] = judgment.supported
        facts = [fact for sentence in source.sentences for fact in sentence.facts]
        for index, sentence in enumerate(sentences):
            # Never award support to a sentence containing detected unsafe/unsupported tokens.
            token_sets = sensitive_tokens(sentence, cultivar_words)
            unsafe = (
                MONEY_RE.search(sentence)
                or PHONE_RE.search(sentence)
                or EMAIL_RE.search(sentence)
                or any(forbidden_words(sentence).values())
                or any(compact(distinctive(f.text)) in compact(sentence) for f in source.forbidden)
                or any(token_sets[k] - safe[k] for k in token_sets)
            )
            supported = (
                any(contains(f.mustContain, sentence) for f in facts)
                or compact(sentence) in compact(safe_texts[source.id])
                or judgments.get(index) is True
            )
            counts["supportedSentences"] += int(bool(supported and not unsafe))
        row = {
            "id": source.id,
            "format": source.format,
            "caseType": "extraction" if source.sentences else "contract",
            "goldSha256": sha256(canonical_bytes(source.model_dump())),
            "safeTextSha256": sha256(safe_texts[source.id].encode()),
            "outputSha256": sha256(canonical_bytes(run.model_dump())) if run else None,
            "counts": dict(counts),
            "forbidden": dict(violations),
            "unsupported": unsupported,
            "bySection": section_rows,
        }
        row.update(_bucket([row]))
        rows.append(row)
    return {
        "schemaVersion": 1,
        "split": parsed.split,
        "sources": rows,
        "byFormat": {fmt: _summary([r for r in rows if r["format"] == fmt]) for fmt in FORMATS},
        "overall": _summary(rows),
        "byCaseType": {
            kind: _summary([r for r in rows if r["caseType"] == kind])
            for kind in ("extraction", "contract")
        },
    }


def _summary(rows: list[dict]) -> dict:
    result = _bucket(rows)
    result["bySection"] = {}
    for section in SECTION_MODULES:
        counts = Counter()
        for row in rows:
            counts.update(row["bySection"][section]["counts"])
        result["bySection"][section] = {
            "factRecall": _rate(counts["factHit"], counts["facts"]),
            "criticalFactRecall": _rate(counts["criticalHit"], counts["criticalFacts"]),
            "misplacement": _rate(counts["misplaced"], counts["facts"]),
        }
    return result


def markdown(report: dict) -> str:
    def fraction(metric):
        return f"{metric['hit']}/{metric['total']}" if metric["total"] else "N/A"

    lines = [
        "| Group | Sources | Extraction | Contract | Facts | Critical | Misplaced | Forbidden | "
        "Unsupported | Proxy | Gate |",
        "|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---|",
    ]
    for label, row in [
        *report["byFormat"].items(),
        *report["byCaseType"].items(),
        ("overall", report["overall"]),
    ]:
        lines.append(
            f"| {label} | {row['sources']} | {row['extractionCases']} | {row['contractCases']} | "
            f"{fraction(row['factRecall'])} | "
            f"{fraction(row['criticalFactRecall'])} | {fraction(row['misplacement'])} | "
            f"{row['forbiddenViolations']} | {row['unsupportedTokens']} | "
            f"{fraction(row['precisionProxy'])} | {row['criticalGate']} |"
        )
    return "\n".join(lines) + "\n"


class FileSource(StrictModel):
    id: ID
    format: Format | None = None
    safeTextPath: Nonempty
    outputPath: Nonempty | None = None


class LocalGold(StrictModel):
    path: Nonempty
    split: Literal["development", "holdout"]
    lockPath: Nonempty | None = None


class FileEnvelope(StrictModel):
    schemaVersion: Literal[1]
    sources: list[FileSource]
    gold: list[LocalGold] = Field(default_factory=list)


def _read_json(path: Path):
    return json.loads(path.read_text(encoding="utf-8"))


def load_local_gold(reference: LocalGold, base: Path, formats: dict[str, str]) -> Gold:
    """Validate pinned private list gold without exposing text in errors."""
    try:
        raw = (base / reference.path).read_bytes()
        expected = LOCAL_GOLD_SHA256[reference.split]
        if sha256(raw) != expected:
            raise ValueError
        if reference.split == "holdout" and reference.lockPath is None:
            raise ValueError
        if reference.lockPath is not None:
            lock = _read_json(base / reference.lockPath)
            if lock["sha256"] != expected:
                raise ValueError
        if reference.split == "holdout":
            pinned = {(s["id"], s["format"]) for s in _read_json(HOLDOUT_LOCK)["sources"]}
        else:
            manifest = _read_json(DEV_MANIFEST)
            pinned = {
                (c["id"], c["format"])
                for c in manifest["cases"]
                if c.get("status") == "LOCAL_PRIVATE"
            }
        sources = json.loads(raw)
        if not isinstance(sources, list):
            raise ValueError
        enriched = []
        for source in sources:
            fmt = formats[source["id"]]
            if "format" in source:
                raise ValueError
            enriched.append({**source, "format": fmt})
        # 봉투의 format이 잠근 기록(lock·dev manifest)과 다르면 형식별 집계가 틀어진다.
        if {(s["id"], s["format"]) for s in enriched} != pinned:
            raise ValueError
        return Gold.model_validate(
            {"schemaVersion": 1, "split": reference.split, "sources": enriched}
        )
    except (ValueError, OSError, KeyError, TypeError, AttributeError):
        raise ValueError("Invalid local gold or lock (details redacted)") from None


def main(argv=None) -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--gold", type=Path, nargs="+", default=[])
    parser.add_argument(
        "--runs", type=Path, required=True, help="Local file envelope; relative paths to it"
    )
    parser.add_argument("--report", type=Path, required=True)
    parser.add_argument("--markdown", type=Path, required=True)
    parser.add_argument(
        "--cultivar", action="append", default=[], help="Additional audited cultivar word"
    )
    args = parser.parse_args(argv)
    try:
        envelope = FileEnvelope.model_validate(_read_json(args.runs))
        if len({s.id for s in envelope.sources}) != len(envelope.sources):
            raise ValueError
        golds = [Gold.model_validate(_read_json(p)) for p in args.gold]
        # holdout은 SHA·lock·형식을 고정하는 runs.json `gold` 배열로만 받는다.
        if any(g.split == "holdout" for g in golds):
            raise ValueError
        golds.extend(
            load_local_gold(
                reference,
                args.runs.parent,
                {s.id: s.format for s in envelope.sources if s.format is not None},
            )
            for reference in envelope.gold
        )
        if not golds or len({g.split for g in golds}) != 1:
            raise ValueError
        gold = {
            "schemaVersion": 1,
            "split": golds[0].split,
            "sources": [s.model_dump() for g in golds for s in g.sources],
        }
        safe_texts, records = {}, []
        gold_formats = {s["id"]: s["format"] for s in gold["sources"]}
        for source in envelope.sources:
            # 봉투에 적은 format이 gold와 다르면 형식별 집계가 틀어지므로 거절한다.
            if source.format is not None and gold_formats.get(source.id) != source.format:
                raise ValueError
            safe_texts[source.id] = (args.runs.parent / source.safeTextPath).read_text(
                encoding="utf-8"
            )
            if source.outputPath is not None:
                record = _read_json(args.runs.parent / source.outputPath)
                if record.get("id") != source.id:
                    raise ValueError
                records.append(record)
        report = score(gold, records, safe_texts, cultivar_words=(*CULTIVARS, *args.cultivar))
        # Reports must never replace any local gold, safe text or output inputs.
        inputs = [
            *args.gold,
            *(args.runs.parent / g.path for g in envelope.gold),
            *(args.runs.parent / g.lockPath for g in envelope.gold if g.lockPath),
            args.runs,
            *(args.runs.parent / s.safeTextPath for s in envelope.sources),
            *(args.runs.parent / s.outputPath for s in envelope.sources if s.outputPath),
            HOLDOUT_LOCK,
            DEV_MANIFEST,
        ]
        destinations = [args.report.resolve(), args.markdown.resolve()]
        if len(set(destinations)) != 2 or set(destinations) & {p.resolve() for p in inputs}:
            raise ValueError
        args.report.write_text(
            json.dumps(report, ensure_ascii=False, indent=2) + "\n", encoding="utf-8"
        )
        args.markdown.write_text(markdown(report), encoding="utf-8")
    except (ValueError, OSError, TypeError, AttributeError):
        print("Invalid final-score input or report destination (details redacted)")
        return 2
    print(markdown(report), end="")
    return 0 if report["overall"]["criticalGate"] == "PASS" else 1


if __name__ == "__main__":
    raise SystemExit(main())
