"""Read tool-generated reports and print weighted component counters as JSON.

Usage from repository root:
  python3 docs/submission/evidence/iteration-2/summarize-coverage.py > .artifacts/i2-coverage/component-counters.json
No source file is omitted because of a low result.
"""
import json
from pathlib import Path

root = Path(__file__).resolve().parents[4]
artifacts = root / '.artifacts/i2-coverage'
server = json.loads((artifacts / 'server-coverage.json').read_text())
client = json.loads((artifacts / 'client-html/coverage-summary.json').read_text())
result = {'python': {}, 'v8': {}}
for name, prefix in [('all', ''), ('accounts', 'app/accounts/'), ('orders', 'app/orders/'),
                     ('messaging', 'app/messaging/'), ('source_analysis', 'app/source_analysis/')]:
    files = [v['summary'] for k, v in server['files'].items() if k.startswith(prefix)]
    row = {k: sum(v[k] for v in files) for k in
           ['covered_lines', 'num_statements', 'covered_branches', 'num_branches']}
    row['statement_pct'] = round(100 * row['covered_lines'] / row['num_statements'], 2)
    row['branch_pct'] = round(100 * row['covered_branches'] / row['num_branches'], 2)
    result['python'][name] = row
for prefix in ['apps/consumer/src/', 'apps/producer/src/', 'packages/api/src/',
               'packages/ui/src/', 'packages/analytics/src/', 'scripts/admin-web/']:
    files = [v for k, v in client.items() if k.startswith(str(root / prefix))]
    row = {}
    for metric in ['lines', 'functions', 'branches']:
        total = sum(v[metric]['total'] for v in files)
        covered = sum(v[metric]['covered'] for v in files)
        row[metric] = {'covered': covered, 'total': total,
                       'pct': round(100 * covered / total, 2) if total else None}
    row['files'] = len(files)
    result['v8'][prefix] = row
print(json.dumps(result, indent=2))
