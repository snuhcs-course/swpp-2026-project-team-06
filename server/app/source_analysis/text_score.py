"""DEV-448 bounded, offline text evaluation; never a calibrated semantic judge.

Only complete source-bound clauses and mechanical equivalents receive automatic
support. Everything outside that envelope requires a hash-bound local judgment.
Reports contain hashes, IDs and counts, never source or output text.
"""

import re
from collections import Counter
from decimal import Decimal

from app.source_analysis import final_score as legacy
from app.source_analysis.corpus_score import FORMATS, canonical_bytes, sha256

VERSION = "dev448-text-v1"


def mechanical(text):
    """Small meaning-preserving envelope; no dictionary of broad synonyms."""
    value = legacy.normalize_final(text).casefold()
    value = re.sub(r"브릭\s+스", "brix", value)
    value = re.sub(r"(?<=\d)\s*[-–]\s*(?=\d)", "~", value)
    # Expand a shared range unit before converting either endpoint.
    value = re.sub(
        r"(?<![\d.])(\d+(?:\.\d+)?)\s*~\s*(\d+(?:\.\d+)?)\s*(kg|g)(?![a-z])", r"\1\3~\2\3", value
    )
    # Both endpoints of a range keep the same physical dimension.
    value = re.sub(
        r"(?<![\d.])(\d+(?:\.\d+)?)\s*(kg|g)(?![a-z])",
        lambda m: f"{Decimal(m[1]) * (1000 if m[2] == 'kg' else 1):f}g",
        value,
    )
    value = re.sub(r"(?<=\d)\.0+(?=g)", "", value)
    return re.sub(r"\s+", "", value).strip(".。!?;:")


def _clauses(text):
    # Split only explicit conjunctions. Keep qualifiers/subject/negation intact.
    chunks = re.split(r"\n+|[.!?。;]+(?!\d)|이고\s*|이며\s*|,\s*(?=[ABab][상품표본]|\S+상품)", text)
    result = []
    for chunk in chunks:
        value = mechanical(chunk)
        value = re.sub(r"(?:입니다|이에요|예요|이어요)$", "", value)
        if value:
            result.append(value)
    return result


def _equivalent(left, right):
    return mechanical(left) == mechanical(right) or _clauses(left) == _clauses(right)


def _source_bound(text, safe):
    clauses = _clauses(text)
    safe_clauses = _clauses(re.sub(r"\s*\n\s*", " ", safe))
    if not clauses or not all(clause in safe_clauses for clause in clauses):
        return False
    first = safe_clauses.index(clauses[0])
    if first:
        preceding = safe_clauses[first - 1]
        # A preceding short heading can qualify the following proposition. Its
        # scope cannot safely be discarded just because punctuation intervenes.
        scope_heading = re.search(
            r"작년|지난해|표본|샘플|측정결과|예상|추정|과거|\d{4}년|상품.*정보|다음.*정보",
            preceding,
        )
        independent_values = tuple(
            q for q in _quantities(preceding) if not re.fullmatch(r"\d{4}년", q)
        )
        context_only = re.search(r"(?:결과|정보)(?:입니다|예요)?$", preceding)
        if scope_heading and (not independent_values or context_only) and preceding not in clauses:
            return False
    return True


def _lexical_match(tokens, text):
    """Page-wide selector diagnostic only; never semantic support or truth."""
    value = mechanical(text)
    for token in tokens:
        normalized = mechanical(token)
        # Prevent a selector 4kg matching 14kg (including normalized g units).
        before = r"(?<![\d.])" if normalized[:1].isdigit() else ""
        after = r"(?![\d.])" if normalized[-1:].isdigit() else ""
        if not re.search(before + re.escape(normalized) + after, value):
            return False
    return True


def _quantities(text):
    return tuple(legacy.number_token(m[0]) for m in legacy.NUMBER_RE.finditer(mechanical(text)))


def _skeleton(text):
    return legacy.NUMBER_RE.sub("#", mechanical(text))


QUALIFIERS = (
    (r"없(?:어요|습니다|다)?|아니|않|못", "NEGATION"),
    (r"예상|추정|예정", "EXPECTED"),
    (r"실측|측정", "MEASURED"),
    (r"표본|샘플|평균", "SAMPLE"),
    (r"모든|전부|보장|반드시|정확히", "CERTAIN"),
    (r"약(?=\d)|대략|내외|정도|달라|수있", "APPROXIMATE"),
    (r"\d{4}년|지난해|작년|당시|였어요|이었", "HISTORICAL"),
    (r"현재|올해|이번", "CURRENT"),
)


def _qualifiers(text):
    value = mechanical(text)
    return {label for pattern, label in QUALIFIERS if re.search(pattern, value)}


def _source_alternative(output, safe):
    """Recognize exact complete source alternatives only to abstain from conflict.

    OCR option headings can occupy a numbered line without sentence punctuation.
    Treating such a line as an alternative never awards SUPPORT; preceding scope
    headings still use the existing conservative context check.
    """
    if _source_bound(output, safe):
        return True
    raw_lines = [line for line in safe.splitlines() if line.strip()]
    # A literal inventory output retains its original ordinal. Compare that full
    # line first; stripping only the source ordinal would manufacture a mismatch.
    # Never erase an ordinal from the output or equate different ordinal/value pairs.
    if any(_equivalent(output, line) for line in raw_lines) and _source_bound(
        output, ". ".join(raw_lines)
    ):
        return True
    lines = [re.sub(r"^\s*(?:\d{1,2}[.)]|0[1-9])\s+", "", line) for line in raw_lines]
    return any(_equivalent(output, line) for line in lines) and _source_bound(
        output, ". ".join(lines)
    )


def _presence_relations(text):
    """Only explicit same-subject presence properties have bounded polarity here.

    A negator about season, cosmetic appearance or another property cannot negate
    peelability or seeds. Unrecognized relations remain outside this envelope.
    """
    result = set()
    for clause in _clauses(text):
        for match in re.finditer(r"(씨|점|흠)(?:이|가|은|는)?(없|있)", clause):
            subject = re.sub(r"(?:에는|에서는|은|는|에|의|이|가)$", "", clause[:match.start()])
            result.add((subject, match[1], match[2]))
    return result


def _conflict(output, evidence, *, safe=None, source_alternative=None):
    """Detect only bounded relation/modifier changes, never global number unions."""
    out = mechanical(output)
    alternative = (
        safe is not None and _source_alternative(output, safe)
        if source_alternative is None else source_alternative
    )
    for reference in evidence:
        ref = mechanical(reference)
        if (not alternative and _skeleton(out) == _skeleton(ref)
                and _quantities(out) != _quantities(ref)):
            return "QUANTITY_RELATION_CHANGED"
        # Compare each typed subject/value clause, preserving option/product labels.
        for oc in _clauses(output):
            for rc in _clauses(reference):
                if (not alternative and _skeleton(oc) == _skeleton(rc)
                        and _quantities(oc) != _quantities(rc)):
                    return "QUANTITY_RELATION_CHANGED"
        output_measurements = tuple(
            q for q in _quantities(output) if not re.fullmatch(r"\d{4}년", q)
        )
        reference_measurements = tuple(
            q for q in _quantities(reference) if not re.fullmatch(r"\d{4}년", q)
        )
        if (
            output_measurements
            and reference_measurements
            and output_measurements != reference_measurements
        ):
            # Distinct measurements may legitimately have different qualifiers.
            # A removed year is temporal qualification, not a new measurement.
            continue
        oq, rq = _qualifiers(output), _qualifiers(reference)
        tokens = set(re.findall(r"[가-힣a-z]+|\d+(?:\.\d+)?", out))
        ref_tokens = set(re.findall(r"[가-힣a-z]+|\d+(?:\.\d+)?", ref))
        # Korean spacing is significant for topic comparison; retain lexical anchors.
        anchors = ("씨", "당도", "껍질", "과피", "수확분")
        related = any(a in out and a in ref for a in anchors) or len(tokens & ref_tokens) >= 2
        if not related:
            continue
        for left, right in (
            ("EXPECTED", "MEASURED"),
            ("SAMPLE", "CERTAIN"),
            ("APPROXIMATE", "CERTAIN"),
            ("HISTORICAL", "CURRENT"),
        ):
            if left in rq and right in oq:
                return "QUALIFIER_CHANGED"
        if any(
            os == rs and op == rp and polarity != reference_polarity
            for os, op, polarity in _presence_relations(output)
            for rs, rp, reference_polarity in _presence_relations(reference)
        ):
            return "NEGATION_CHANGED"
    return None


def _unsafe(sentence, source):
    return bool(
        legacy.MONEY_RE.search(sentence)
        or legacy.PHONE_RE.search(sentence)
        or legacy.EMAIL_RE.search(sentence)
        or any(legacy.forbidden_words(sentence).values())
        or any(
            legacy.compact(legacy.distinctive(f.text)) in legacy.compact(sentence)
            for f in source.forbidden
        )
    )


def _rate(hit, total):
    return {"hit": hit, "total": total, "rate": hit / total if total else None}


def _validate_judgments(mapping, sid, sentences, safe, gold_sha):
    result = {}
    for row in mapping.get(sid, []):
        if set(row) != {
            "sentenceIndex",
            "sentenceSha256",
            "safeTextSha256",
            "goldSha256",
            "supported",
        }:
            raise ValueError
        i = row["sentenceIndex"]
        if (
            type(i) is not int
            or i < 0
            or i >= len(sentences)
            or i in result
            or type(row["supported"]) is not bool
            or row["sentenceSha256"] != sha256(sentences[i].encode())
            or row["safeTextSha256"] != sha256(safe.encode())
            or row["goldSha256"] != gold_sha
        ):
            raise ValueError
        result[i] = row["supported"]
    return result


def _aggregate(rows):
    c = Counter()
    for row in rows:
        c.update(row["counts"])
    preservation = _rate(c["preserved"], c["facts"])
    critical = _rate(c["criticalPreserved"], c["criticalFacts"])
    correctness = _rate(c["supported"], c["sentences"])
    processing = _rate(c["processed"], len(rows))
    failure = bool(c["failed"] or c["criticalMissing"] or c["forbidden"] or c["unsupported"])
    # Lower/upper bounds distinguish confirmed defects from unresolved meaning.
    unknown = c["unknownSentences"] + c["unknownFacts"] + c["partial"]
    upper_preservation = _rate(c["preserved"] + c["unknownFacts"], c["facts"])
    upper_correctness = _rate(c["supported"] + c["unknownSentences"], c["sentences"])
    enough_possible = all(
        m["rate"] is None or m["rate"] >= 0.95
        for m in (upper_preservation, upper_correctness, processing)
    )
    accepted = (
        "N/A"
        if not rows
        else "FAIL"
        if failure or not enough_possible
        else "UNKNOWN"
        if unknown
        else "PASS"
    )
    return {
        "sources": len(rows),
        "counts": dict(c),
        "semanticPreservation": {
            **preservation,
            "upperBound": upper_preservation["rate"],
            "interpretation": "CONFIRMED_LOWER_BOUND_NOT_ACCURACY",
        },
        "semanticDecisionCoverage": _rate(c["facts"] - c["unknownFacts"], c["facts"]),
        "lexicalDiagnostics": {
            "interpretation": "SELECTOR_OR_REFERENCE_MATCH_NOT_SEMANTIC_CREDIT",
            "pagewideFactRecall": _rate(c["lexicalHit"], c["facts"]),
            "criticalPagewideFactRecall": _rate(c["lexicalCriticalHit"], c["criticalFacts"]),
            "primaryPlacement": _rate(c["lexicalPrimary"], c["facts"]),
            "permittedPlacement": _rate(c["lexicalPermitted"], c["facts"]),
            "fullReferenceMatch": _rate(c["referenceMatch"], c["facts"]),
        },
        "criticalPreservation": critical,
        "correctness": {
            **correctness,
            "upperBound": upper_correctness["rate"],
            "interpretation": "CONFIRMED_LOWER_BOUND_NOT_ACCURACY",
        },
        "unknownFacts": c["unknownFacts"],
        "unknownSentences": c["unknownSentences"],
        "unsupported": c["unsupported"],
        "forbiddenViolations": c["forbidden"],
        "placement": {
            "primary": _rate(c["primary"], c["facts"]),
            "permitted": _rate(c["permitted"], c["facts"]),
            "misplaced": _rate(c["misplaced"], c["facts"]),
        },
        "repetition": _rate(c["duplicates"], c["sentences"]),
        "processing": {
            **processing,
            "correctEmpty": c["correctEmpty"],
            "failed": c["failed"],
            "partial": c["partial"],
        },
        "reviewCoverage": _rate(c["reviewed"], c["sentences"]),
        "criticalGate": (
            "N/A"
            if not rows
            else "FAIL"
            if failure
            else "UNKNOWN"
            if c["unknownCritical"]
            else "PASS"
        ),
        "acceptance": accepted,
    }


def score(
    gold,
    records,
    safe_texts,
    *,
    cultivar_words=legacy.CULTIVARS,
    semantic_judgments=None,
    fact_judgments=None,
    placement_rules=None,
    correct_empty_ids=(),
):
    """Opt-in report wrapping an unchanged legacy report.

    ``semantic_judgments`` maps source IDs to sentenceIndex/sentenceSha256/
    safeTextSha256/goldSha256/supported objects. ``fact_judgments`` maps source IDs to
    factId/preserved/outputSentenceIndices/outputSha256/safeTextSha256/goldSha256 objects;
    outputSha256 hashes canonical_bytes of the split output sentence list.
    goldSha256 hashes canonical_bytes of the validated Source.model_dump().
    Placement rules map source IDs -> fact IDs -> permitted module lists.
    Correct-empty requires an explicit source ID and no gold facts.
    """
    try:
        historical = legacy.score(gold, records, safe_texts, cultivar_words=cultivar_words)
        return _score(
            gold,
            records,
            safe_texts,
            historical,
            cultivar_words,
            {} if semantic_judgments is None else semantic_judgments,
            {} if fact_judgments is None else fact_judgments,
            {} if placement_rules is None else placement_rules,
            correct_empty_ids,
        )
    except (ValueError, TypeError, KeyError, AttributeError, IndexError):
        raise ValueError("Invalid text-score input (details redacted)") from None


def _score(
    gold,
    records,
    safe_texts,
    historical,
    cultivar_words,
    semantic_judgments,
    fact_judgments,
    placement_rules,
    correct_empty_ids,
):
    parsed = legacy.Gold.model_validate(gold)
    runs = {r.id: r for r in (legacy.Run.model_validate(r) for r in records)}
    ids = {s.id for s in parsed.sources}
    if any(
        not isinstance(m, dict) or set(m) - ids
        for m in (semantic_judgments, fact_judgments, placement_rules)
    ):
        raise ValueError
    empty_ids = set(correct_empty_ids)
    if empty_ids - ids or any(s.sentences and s.id in empty_ids for s in parsed.sources):
        raise ValueError
    legacy_rows = {r["id"]: r for r in historical["sources"]}
    rows = []
    for source in parsed.sources:
        safe = safe_texts[source.id]
        run = runs.get(source.id)
        output = (
            [(m.module, s) for m in run.modules for t in m.texts for s in legacy.split_sentences(t)]
            if run
            else []
        )
        sentences = [s for _, s in output]
        gold_sha = sha256(canonical_bytes(source.model_dump()))
        reviewed = _validate_judgments(semantic_judgments, source.id, sentences, safe, gold_sha)
        negatives = (
            {j.sentenceIndex for j in run.supportJudgments if not j.supported} if run else set()
        )
        usable = bool(run and run.status in {"EVALUATED", "PARTIAL"})
        correct_empty = bool(
            run and run.status in {"EVALUATED", "EMPTY"} and not output and source.id in empty_ids
        )
        processed = bool((usable and output) or correct_empty)
        c = Counter(
            sentences=len(output),
            processed=int(processed),
            correctEmpty=int(correct_empty),
            failed=int(not processed),
            partial=int(bool(run and run.status == "PARTIAL")),
            forbidden=legacy_rows[source.id]["forbiddenViolations"],
        )
        sentence_rows = []
        evidence = legacy.split_sentences(safe)
        # Reuse only within this source/run. Never retain private source strings
        # in a global cache or repeat the full-source scan for every gold fact.
        alternatives = {s: _source_alternative(s, safe) for s in sentences}
        for i, (_, sentence) in enumerate(output):
            reason = None
            if _unsafe(sentence, source):
                state, reason = "UNSUPPORTED", "FORBIDDEN"
            elif i in negatives or reviewed.get(i) is False:
                state, reason = "UNSUPPORTED", "REVIEW_VETO"
            elif _source_bound(sentence, safe) and any(
                _equivalent(sentence, reference.text) for reference in source.sentences
            ):
                state, reason = "SUPPORTED", "SOURCE_MECHANICAL"
            elif conflict_reason := _conflict(
                sentence, evidence, source_alternative=alternatives[sentence]
            ):
                state, reason = "UNSUPPORTED", conflict_reason
            elif any(
                legacy.unsupported_tokens(
                    legacy.sensitive_tokens(sentence, cultivar_words),
                    legacy.sensitive_tokens(safe, cultivar_words),
                ).values()
            ):
                # Use normalized quantities so approved g/kg conversions are not rejected.
                extra = set(_quantities(sentence)) - set(_quantities(safe))
                nonnumeric = legacy.unsupported_tokens(
                    legacy.sensitive_tokens(sentence, cultivar_words),
                    legacy.sensitive_tokens(safe, cultivar_words),
                )
                if extra or nonnumeric["cultivar"] or nonnumeric["certification"]:
                    state, reason = "UNSUPPORTED", "NEW_SENSITIVE_VALUE"
                else:
                    state = "SUPPORTED" if reviewed.get(i) is True else "UNKNOWN"
            else:
                state = "SUPPORTED" if reviewed.get(i) is True else "UNKNOWN"
            c[
                {
                    "SUPPORTED": "supported",
                    "UNSUPPORTED": "unsupported",
                    "UNKNOWN": "unknownSentences",
                }[state]
            ] += 1
            c["reviewed"] += int(i in reviewed)
            sentence_rows.append(
                {
                    "sentenceIndex": i,
                    "sentenceSha256": sha256(sentence.encode()),
                    "status": state,
                    "reason": reason
                    or ("REVIEWED" if i in reviewed else "OUTSIDE_MECHANICAL_ENVELOPE"),
                }
            )
        normalized = [mechanical(s) for s in sentences]
        c["duplicates"] = len(normalized) - len(set(normalized))
        facts = {f.id: (s, f) for s in source.sentences for f in s.facts}
        permissions = placement_rules.get(source.id, {})
        if set(permissions) - set(facts):
            raise ValueError
        for allowed in permissions.values():
            if (
                not isinstance(allowed, list)
                or not allowed
                or any(m not in legacy.TEXT_MODULES for m in allowed)
            ):
                raise ValueError
        fj = {}
        for judgment in fact_judgments.get(source.id, []):
            if set(judgment) != {
                "factId",
                "preserved",
                "outputSentenceIndices",
                "outputSha256",
                "safeTextSha256",
                "goldSha256",
            }:
                raise ValueError
            fid = judgment["factId"]
            indices = judgment["outputSentenceIndices"]
            if (
                fid not in facts
                or fid in fj
                or type(judgment["preserved"]) is not bool
                or not isinstance(indices, list)
                or len(set(indices)) != len(indices)
                or any(type(i) is not int or i < 0 or i >= len(output) for i in indices)
                or (judgment["preserved"] and not indices)
                or judgment["outputSha256"] != sha256(canonical_bytes(sentences))
                or judgment["safeTextSha256"] != sha256(safe.encode())
                or judgment["goldSha256"] != gold_sha
            ):
                raise ValueError
            fj[fid] = judgment
        fact_rows = []
        for fid, (reference, fact) in facts.items():
            c["facts"] += 1
            c["criticalFacts"] += int(fact.critical)
            # Complete statement required: selector tokens alone cannot carry descriptors.
            target = fact.statement
            matched = [
                i
                for i, (_, s) in enumerate(output)
                if (_equivalent(target, s) or _equivalent(reference.text, s))
                and sentence_rows[i]["status"] == "SUPPORTED"
            ]
            allowed = permissions.get(
                fid,
                [m for m in legacy.TEXT_MODULES if legacy.MODULE_SECTIONS[m] == reference.section],
            )
            lexical = [
                i
                for i, (_, text) in enumerate(output)
                if usable and _lexical_match(fact.mustContain, text)
            ]
            pagewide_lexical = usable and _lexical_match(fact.mustContain, "\n".join(sentences))
            c["lexicalHit"] += int(pagewide_lexical)
            c["lexicalCriticalHit"] += int(pagewide_lexical and fact.critical)
            c["lexicalPrimary"] += int(any(output[i][0] == reference.module for i in lexical))
            c["lexicalPermitted"] += int(any(output[i][0] in allowed for i in lexical))
            reference_clauses = _clauses(reference.text)
            output_clauses = {clause for text in sentences for clause in _clauses(text)}
            c["referenceMatch"] += int(
                usable
                and bool(reference_clauses)
                and all(clause in output_clauses for clause in reference_clauses)
            )
            conflict = any(
                _conflict(s, [target], source_alternative=alternatives[s]) for _, s in output
            )
            judgment = fj.get(fid)
            if judgment is not None:
                matched = judgment["outputSentenceIndices"] if judgment["preserved"] else []
                if any(sentence_rows[i]["status"] == "UNSUPPORTED" for i in matched):
                    matched = []
            if not usable or not output:
                matched = []
                state = "MISSING"
            elif judgment is not None and not judgment["preserved"]:
                state = "MISSING"
            elif matched and not conflict:
                state = "PRESERVED"
            elif conflict:
                state = "CONTRADICTED"
            else:
                state = "UNKNOWN"
            if state == "PRESERVED":
                c["preserved"] += 1
                c["criticalPreserved"] += int(fact.critical)
                primary = any(output[i][0] == reference.module for i in matched)
                allowed = permissions.get(
                    fid,
                    [
                        m
                        for m in legacy.TEXT_MODULES
                        if legacy.MODULE_SECTIONS[m] == reference.section
                    ],
                )
                permitted = any(output[i][0] in allowed for i in matched)
                c["primary"] += int(primary)
                c["permitted"] += int(permitted)
                c["misplaced"] += int(not permitted)
                placement = "PRIMARY" if primary else "PERMITTED" if permitted else "MISPLACED"
            else:
                c["unknownFacts"] += int(state == "UNKNOWN")
                c["unknownCritical"] += int(state == "UNKNOWN" and fact.critical)
                c["criticalMissing"] += int(state in {"MISSING", "CONTRADICTED"} and fact.critical)
                placement = "NOT_PRESENT"
            fact_rows.append(
                {
                    "factId": fid,
                    "status": state,
                    "placement": placement,
                    "outputSentenceIndices": matched,
                }
            )
        row = {
            "id": source.id,
            "format": source.format,
            "counts": dict(c),
            "safeTextSha256": sha256(safe.encode()),
            "outputSha256": sha256(canonical_bytes(sentences)),
            "facts": fact_rows,
            "sentences": sentence_rows,
        }
        row.update(_aggregate([row]))
        rows.append(row)
    by_format = {fmt: _aggregate([r for r in rows if r["format"] == fmt]) for fmt in FORMATS}
    overall = _aggregate(rows)
    active = [b["acceptance"] for b in by_format.values() if b["sources"]]
    acceptance = (
        "N/A"
        if not active
        else "FAIL"
        if "FAIL" in active
        else "UNKNOWN"
        if "UNKNOWN" in active
        else "PASS"
    )
    return {
        "schemaVersion": 1,
        "evaluatorVersion": VERSION,
        "split": parsed.split,
        "semanticCalibration": "NOT_CALIBRATED_BOUNDED_MECHANICAL_AND_LOCAL_REVIEW",
        "limitations": [
            "Semantic rates are confirmed lower bounds, not measured semantic accuracy.",
            "Lexical diagnostics never establish correctness or acceptance.",
            "Unresolved reference-to-source paraphrases require source-bound review.",
        ],
        "legacy": historical,
        "sources": rows,
        "byFormat": by_format,
        "overall": overall,
        "acceptance": acceptance,
    }
