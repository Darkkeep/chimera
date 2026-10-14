"""Render the guide source to print HTML; Chromium produces the PDF."""
import argparse
from pathlib import Path
import markdown

parser = argparse.ArgumentParser()
parser.add_argument('--output', type=Path, default=Path('workspace/user-guide-print.html'))
args = parser.parse_args()
root = Path(__file__).resolve().parents[3]
source = root / 'docs/user-guide.md'
body = markdown.markdown(source.read_text(encoding='utf-8'), extensions=['tables', 'toc', 'sane_lists'])
args.output.parent.mkdir(parents=True, exist_ok=True)
args.output.write_text('''<!doctype html><html lang="en"><head><meta charset="utf-8">
<title>Chimera user guide</title><base href="''' + (root / 'docs').as_uri() + '''/">
<style>
@page { size: A4 landscape; margin: 14mm 14mm 17mm; }
body { font: 10pt/1.42 Arial,sans-serif; color: #202c36; }
h1 { font-size: 26pt; color: #16364d; margin: 0 0 12pt; }
h2 { font-size: 19pt; color: #16364d; break-before: page; margin: 0 0 12pt; }
h3 { font-size: 13pt; color: #16364d; margin: 18pt 0 8pt; }
h1,h2,h3 { break-after: avoid; }
p,li { orphans: 3; widows: 3; }
table { width:100%; border-collapse:collapse; table-layout:fixed; margin:10pt 0 16pt; }
th,td { border:1px solid #cbd3d9; padding:7pt; text-align:left; vertical-align:top; overflow-wrap:anywhere; }
th { background:#eef2f5; font-weight:bold; }
thead { display:table-header-group; }
tr { break-inside:avoid; }
table:has(th:nth-child(4)) th:first-child { width:5%; }
table:has(th:nth-child(4)) th:nth-child(2) { width:35%; }
table:has(th:nth-child(4)) th:nth-child(3) { width:29%; }
table:has(th:nth-child(4)) th:nth-child(4) { width:25%; }
img { max-width:100%; height:auto; object-fit:contain; }
p > img { display:block; margin:12pt auto; max-width:230mm; max-height:125mm; }
td img { width:auto; max-height:28mm; }
a { color:#175477; text-decoration:underline; }
code { font:9pt Consolas,monospace; overflow-wrap:anywhere; }
blockquote { border-left:3px solid #829ba9; margin:10pt 0; padding-left:12pt; }
</style></head><body>''' + body + '</body></html>', encoding='utf-8')
print(args.output.resolve())
