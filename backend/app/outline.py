"""Read explicit top-level Markdown outline items without counting subitems."""
import re


def outline_titles(text: str) -> list[str]:
    headings, items, ordered_items = [], [], []
    fenced = False
    for raw in text.splitlines():
        if raw.lstrip().startswith(("```", "~~~")):
            fenced = not fenced
            continue
        if fenced:
            continue
        line = raw.replace("**", "").replace("__", "")
        heading = re.match(r"^\s{0,3}(#{1,6})\s+(.+?)\s*#*\s*$", line)
        if heading:
            headings.append((len(heading[1]), heading[2]))
        item = re.match(r"^(\s*)(?:\d+[.)]|[A-Z][.)]|[-*+])\s+(.+)$", line)
        if item:
            bold = re.match(r"^\s*(?:\d+[.)]|[A-Z][.)]|[-*+])\s+(?:\*\*|__)(.+?)(?:\*\*|__)", raw)
            entry = (len(item[1].expandtabs(4)), bold[1] if bold else item[2])
            items.append(entry)
            if re.match(r"^\s*(?:\d+[.)]|[A-Z][.)])\s+", line):
                ordered_items.append(entry)
    # Expanded outlines commonly use numbered scene headings, with bullet
    # details beneath each heading. Those bullets are not additional scenes.
    numbered = [(level, title) for level, title in headings if re.match(r"(?:\d+[.)]|(?:Scene|Part|Module|Section)\s+\d+\b)", title, re.I)]
    root_ordered = ordered_items if items and ordered_items and min(depth for depth, _ in ordered_items) == min(depth for depth, _ in items) else []
    sections = []
    for level in sorted({level for level, _ in headings}):
        group = [(depth, title) for depth, title in headings if depth == level]
        if len(group) > 1:
            sections = group
            break
    candidates = numbered or root_ordered or sections or items
    if not candidates:
        return []
    depth = min(level for level, _ in candidates)
    titles = []
    for level, title in candidates:
        if level == depth:
            title = re.sub(r"^\d+[.)]\s+", "", title).strip()
            if not title or len(title) > 120:
                raise ValueError("Give each top-level outline item a nonempty title of at most 120 characters.")
            titles.append(title)
    return titles
