#!/usr/bin/env python3
"""Measure what a Claude Code session actually cost, from its own transcript.

WHY THIS EXISTS. Until 15 Sep 2026 this build had no measurement of its own
build cost at all — the estimate for the work to date was a range spanning
$340 to $1,520, which is not a number you can act on. The data was there the
whole time: Claude Code writes a JSONL transcript per session and every
assistant message carries its `usage` block.

WHAT IT CANNOT DO, said up front. A cloud session gets a fresh container and
only the CURRENT session's transcript is on disk — every earlier one is gone.
So this measures a session exactly and the build only insofar as its sessions
were recorded. That is why `docs/token-ledger.md` exists: the script measures,
the committed ledger is what survives the container.

ON WHAT THE NUMBER MEANS. This reports **API-list-equivalent value**, not money
necessarily spent. Claude Code run on a subscription draws against plan limits
rather than per-token billing, in which case these figures are the notional
cost of the same work bought by the token. Both are worth knowing and they are
not the same claim; never quote one as the other.

Usage:
    python3 scripts/token_report.py                 # current session, auto-found
    python3 scripts/token_report.py --ledger-row    # one markdown row to paste
    python3 scripts/token_report.py path/to.jsonl
"""
from __future__ import annotations

import argparse
import collections
import glob
import json
import os
import sys

# ── Rate card ────────────────────────────────────────────────────────────────
#
# USD per million tokens. Verified 14 Sep 2026 against the published pricing
# table. Cache writes are priced BY TTL — 1.25x base input at the default
# 5-minute TTL, 2x at the 1-hour TTL — which is the same distinction the Phase 2
# cost model got wrong and PR #50 corrected. Keep the two apart here for exactly
# that reason: a single blended rate makes the cheaper one the silent default.
#
# Re-verify before trusting a report across a pricing change; the tooling layer
# turns over and a stale rate card produces confident wrong numbers.
RATES = {
    "claude-opus-5":   {"in": 5.00, "out": 25.00, "cache_read": 0.50},
    "claude-sonnet-5": {"in": 2.00, "out": 10.00, "cache_read": 0.20},
    "claude-haiku-4-5": {"in": 1.00, "out": 5.00, "cache_read": 0.10},
}
CACHE_WRITE_MULT_5M = 1.25
CACHE_WRITE_MULT_1H = 2.00
DEFAULT_MODEL = "claude-opus-5"
RATE_CARD_VERIFIED = "2026-09-14"


def find_transcript() -> str | None:
    """The newest transcript for this project, wherever Claude Code put it."""
    pats = [
        os.path.expanduser("~/.claude/projects/*/*.jsonl"),
        os.path.expanduser("~/.config/claude/projects/*/*.jsonl"),
    ]
    files = [f for p in pats for f in glob.glob(p)]
    return max(files, key=os.path.getmtime) if files else None


def read_usage(path: str) -> list[dict]:
    """Every billed assistant message, deduplicated.

    Transcripts replay: the same message id can appear many times as the file is
    appended to. Summing raw lines overcounts — measured at 619 records for 357
    real messages on the 15 Sep transcript, a 73% overstatement. Dedupe on the
    message id, falling back to the record uuid.
    """
    out, seen = [], set()
    with open(path, encoding="utf-8") as fh:
        for line in fh:
            line = line.strip()
            if not line:
                continue
            try:
                rec = json.loads(line)
            except json.JSONDecodeError:
                continue
            msg = rec.get("message") or {}
            usage = msg.get("usage")
            if not usage:
                continue
            key = msg.get("id") or rec.get("uuid")
            if key in seen:
                continue
            seen.add(key)

            # `cache_creation` splits the write by TTL; `cache_creation_input_tokens`
            # is the total. Prefer the split, and attribute the whole total to the
            # 5-minute bucket only when the split is absent — under-reporting a 1h
            # write is the safer error than inventing one.
            cc = usage.get("cache_creation") or {}
            has_split = "ephemeral_5m_input_tokens" in cc or "ephemeral_1h_input_tokens" in cc
            total_write = usage.get("cache_creation_input_tokens", 0)
            out.append({
                "ts": rec.get("timestamp") or "",
                "model": msg.get("model") or DEFAULT_MODEL,
                "in": usage.get("input_tokens", 0),
                "out": usage.get("output_tokens", 0),
                "cache_read": usage.get("cache_read_input_tokens", 0),
                "cw_5m": cc.get("ephemeral_5m_input_tokens", total_write if not has_split else 0),
                "cw_1h": cc.get("ephemeral_1h_input_tokens", 0),
                "thinking": (usage.get("output_tokens_details") or {}).get("thinking_tokens", 0),
            })
    return out


def cost(row: dict, model: str | None = None) -> float:
    r = RATES.get(model or row.get("model") or DEFAULT_MODEL)
    if r is None:                      # a model we have no rate for
        return 0.0
    return (
        row["in"] * r["in"]
        + row["out"] * r["out"]
        + row["cache_read"] * r["cache_read"]
        + row["cw_5m"] * r["in"] * CACHE_WRITE_MULT_5M
        + row["cw_1h"] * r["in"] * CACHE_WRITE_MULT_1H
    ) / 1e6


def total(rows: list[dict]) -> collections.Counter:
    t = collections.Counter()
    for r in rows:
        for k in ("in", "out", "cache_read", "cw_5m", "cw_1h", "thinking"):
            t[k] += r[k]
        t["msgs"] += 1
    return t


def uncached_cost(t: collections.Counter, model: str = DEFAULT_MODEL) -> float:
    """What the same work would have cost with no caching — the savings baseline."""
    r = RATES[model]
    all_input = t["in"] + t["cache_read"] + t["cw_5m"] + t["cw_1h"]
    return (all_input * r["in"] + t["out"] * r["out"]) / 1e6


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("transcript", nargs="?", help="path to a .jsonl transcript")
    ap.add_argument("--ledger-row", action="store_true",
                    help="emit one markdown row for docs/token-ledger.md")
    args = ap.parse_args()

    path = args.transcript or find_transcript()
    if not path or not os.path.exists(path):
        print("No transcript found. Pass one explicitly.", file=sys.stderr)
        return 1

    rows = read_usage(path)
    if not rows:
        print(f"No usage records in {path}", file=sys.stderr)
        return 1

    t = total(rows)
    spend = sum(cost(r) for r in rows)
    naive = uncached_cost(t)
    all_input = t["in"] + t["cache_read"] + t["cw_5m"] + t["cw_1h"]
    days = sorted({r["ts"][:10] for r in rows if r["ts"]})

    if args.ledger_row:
        # session | dates | msgs | output | cache read | cost | $/1M out | cached%
        print(
            f"| `{os.path.basename(path)[:8]}` | {days[0] if days else '?'} → {days[-1] if days else '?'} "
            f"| {t['msgs']:,} | {t['out']:,} | {t['cache_read']:,} | ${spend:,.2f} "
            f"| ${spend / t['out'] * 1e6:,.0f} | {t['cache_read'] / all_input * 100:.1f}% |"
        )
        return 0

    print(f"Transcript : {path}")
    print(f"Span       : {days[0] if days else '?'} → {days[-1] if days else '?'}  ({len(days)} active days)")
    print(f"Rate card  : verified {RATE_CARD_VERIFIED}\n")

    print("TOKENS")
    print(f"  fresh input        {t['in']:>14,}")
    print(f"  cache read         {t['cache_read']:>14,}   {t['cache_read'] / all_input * 100:5.1f}% of input")
    print(f"  cache write 5-min  {t['cw_5m']:>14,}")
    print(f"  cache write 1-hour {t['cw_1h']:>14,}")
    print(f"  output             {t['out']:>14,}   (thinking {t['thinking']:,})")
    print(f"  TOTAL              {all_input + t['out']:>14,}\n")

    print("COST  (API-list-equivalent — see the module docstring)")
    r = RATES[DEFAULT_MODEL]
    print(f"  input              ${t['in'] * r['in'] / 1e6:>10,.2f}")
    print(f"  cache read         ${t['cache_read'] * r['cache_read'] / 1e6:>10,.2f}")
    print(f"  cache write        ${(t['cw_5m'] * r['in'] * CACHE_WRITE_MULT_5M + t['cw_1h'] * r['in'] * CACHE_WRITE_MULT_1H) / 1e6:>10,.2f}")
    print(f"  output             ${t['out'] * r['out'] / 1e6:>10,.2f}")
    print(f"  TOTAL              ${spend:>10,.2f}\n")

    print("EFFICIENCY")
    print(f"  uncached this would be   ${naive:,.2f}  → caching saved ${naive - spend:,.2f} ({(1 - spend / naive) * 100:.0f}%)")
    print(f"  effective $/1M output    ${spend / t['out'] * 1e6:,.0f}   (list output alone: ${r['out']:.2f})")
    print(f"  cost per message         ${spend / t['msgs']:,.2f}")
    print(f"  input read per message   {all_input / t['msgs']:,.0f} tokens")
    # The multiplier IS the diagnostic. Output is the work; everything above it
    # is the cost of carrying the conversation to the point of producing it.
    mult = (spend / t["out"] * 1e6) / r["out"]
    print(f"  context multiplier       {mult:.1f}x")
    if mult > 10:
        print("    ↑ Most of the spend is re-reading context, not producing output.")
        print("      The lever is session LENGTH, not model choice: a long thread pays")
        print("      for its whole history on every turn. Split long sessions at natural")
        print("      boundaries and the multiplier falls without losing any work.")

    print("\nBY DAY")
    per_day: dict[str, list[dict]] = collections.defaultdict(list)
    for row in rows:
        if row["ts"]:
            per_day[row["ts"][:10]].append(row)
    for d in sorted(per_day):
        dr = per_day[d]
        dt = total(dr)
        print(f"  {d}   msgs {dt['msgs']:>4}   output {dt['out']:>8,}   ${sum(cost(x) for x in dr):>8,.2f}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
