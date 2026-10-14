"""Convert Chromium's local section links into portable PDF destinations."""
from html.parser import HTMLParser
from pathlib import Path
import re
import pymupdf


class Headings(HTMLParser):
    def __init__(self):
        super().__init__()
        self.headings = {}
        self.current = None

    def handle_starttag(self, tag, attrs):
        if tag in {'h1', 'h2', 'h3'}:
            self.current = dict(attrs).get('id')
            if self.current:
                self.headings[self.current] = ''

    def handle_data(self, text):
        if self.current:
            self.headings[self.current] += text

    def handle_endtag(self, tag):
        if tag in {'h1', 'h2', 'h3'}:
            self.current = None


root = Path(__file__).resolve().parents[3]
parser = Headings()
parser.feed((root / 'workspace/user-guide-print.html').read_text(encoding='utf-8'))
pdf = root / 'docs/user-guide.pdf'
document = pymupdf.open(pdf)
destinations = {}
for identifier, text in parser.headings.items():
    for index, page in enumerate(document):
        matches = page.search_for(re.sub(r'\s+', ' ', text).strip())
        if matches:
            destinations[identifier] = (index, matches[0].tl)
            break
converted = 0
for page in document:
    for link in page.get_links():
        local = link.get('file', '')
        if link['kind'] in {pymupdf.LINK_GOTOR, pymupdf.LINK_LAUNCH} and '#' in local:
            identifier = local.split('#')[-1]
            if identifier not in destinations:
                raise ValueError(f'Missing PDF destination: {identifier}')
            index, point = destinations[identifier]
            page.delete_link(link)
            page.insert_link({'kind': pymupdf.LINK_GOTO, 'from': link['from'], 'page': index, 'to': point})
            converted += 1
temporary = root / 'workspace/user-guide-final.pdf'
document.save(temporary, garbage=4, deflate=True)
document.close()
temporary.replace(pdf)
print(f'Finalized {converted} section links in {pdf}')
