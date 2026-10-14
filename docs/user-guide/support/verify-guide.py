"""Check local guide references and the final portable PDF."""
from html.parser import HTMLParser
import json
from pathlib import Path
from urllib.parse import unquote, urlsplit
import markdown
import pymupdf


class References(HTMLParser):
    def __init__(self):
        super().__init__()
        self.targets = []
        self.identifiers = set()

    def handle_starttag(self, tag, attributes):
        attributes = dict(attributes)
        if attributes.get('id'):
            self.identifiers.add(attributes['id'])
        if tag in {'a', 'img'}:
            target = attributes.get('href' if tag == 'a' else 'src')
            if target:
                self.targets.append(target)


root = Path(__file__).resolve().parents[3]
source = root / 'docs/user-guide.md'
parser = References()
parser.feed(markdown.markdown(source.read_text(encoding='utf-8'), extensions=['tables', 'toc', 'sane_lists']))
errors = []
for target in parser.targets:
    url = urlsplit(target)
    if url.scheme or url.netloc:
        continue
    file = (source.parent / unquote(url.path)).resolve() if url.path else source
    if not file.is_file():
        errors.append(f'Missing file: {target}')
    if url.fragment and file.suffix == '.md' and file.is_file():
        referenced = parser if file == source else References()
        if file != source:
            referenced.feed(markdown.markdown(file.read_text(encoding='utf-8'), extensions=['tables', 'toc', 'sane_lists']))
        if unquote(url.fragment) not in referenced.identifiers:
            errors.append(f'Missing section: {target}')

document = pymupdf.open(root / 'docs/user-guide.pdf')
local_links = [link for page in document for link in page.get_links() if link['kind'] in {pymupdf.LINK_LAUNCH, pymupdf.LINK_GOTOR}]
if local_links:
    errors.append('PDF contains local filesystem links')
blank = [index+1 for index, page in enumerate(document) if len(page.get_text().strip()) < 60 and not page.get_images()]
if blank:
    errors.append(f'Blank PDF pages: {blank}')
internal = sum(link['kind'] == pymupdf.LINK_GOTO for page in document for link in page.get_links())
if internal < 13:
    errors.append('PDF is missing process navigation links')
print(json.dumps({'localReferences': len(parser.targets), 'pdfPages': len(document), 'internalPdfLinks': internal, 'errors': errors}, indent=2))
if errors:
    raise SystemExit(1)
