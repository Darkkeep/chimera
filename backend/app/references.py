import io
from pathlib import Path

import pymupdf
from docx import Document
from pptx import Presentation

from .models import ReferencePassage


SUPPORTED_REFERENCE_EXTENSIONS = {".pdf", ".docx", ".pptx", ".txt", ".md"}


def extract_reference_passages(filename: str, content: bytes) -> tuple[list[ReferencePassage], str, str | None]:
    extension = Path(filename).suffix.lower()
    if extension not in SUPPORTED_REFERENCE_EXTENSIONS:
        raise ValueError("Reference files must be PDF, DOCX, PPTX, TXT, or Markdown")
    if extension in {".pptx", ".docx"} and content.startswith(bytes.fromhex("d0cf11e0a1b11ae1")):
        encrypted = "EncryptedPackage".encode("utf-16le") in content
        message = (
            "This Office file is encrypted or protected. Open it in Office and save an unencrypted copy, then upload that copy."
            if encrypted else
            "This file uses the older binary Office format despite its filename. Open it in Office and save as PPTX or DOCX, then upload the new copy."
        )
        return [], "failed", message
    passages: list[ReferencePassage] = []
    def append_passage(locator: str, text: str) -> None:
        # Preserve every character; split long paragraphs/pages instead of
        # silently discarding everything beyond ReferencePassage's field limit.
        for offset in range(0, len(text), 50000):
            part_locator = locator if len(text) <= 50000 else f"{locator}:part:{offset // 50000 + 1}"
            passages.append(ReferencePassage(locator=part_locator, text=text[offset:offset + 50000]))
    try:
        if extension == ".pdf":
            document = pymupdf.open(stream=content, filetype="pdf")
            for page_number, page in enumerate(document, start=1):
                text = page.get_text("text").strip()
                if text:
                    append_passage(f"page:{page_number}", text)
            document.close()
        elif extension == ".docx":
            document = Document(io.BytesIO(content))
            for paragraph_number, paragraph in enumerate(document.paragraphs, start=1):
                text = paragraph.text.strip()
                if text:
                    append_passage(f"paragraph:{paragraph_number}", text)
            for table_index, table in enumerate(document.tables, start=1):
                for row_index, row in enumerate(table.rows, start=1):
                    text = " | ".join(cell.text.strip() for cell in row.cells if cell.text.strip())
                    if text:
                        append_passage(f"table:{table_index}:row:{row_index}", text)
        elif extension == ".pptx":
            presentation = Presentation(io.BytesIO(content))
            for slide_number, slide in enumerate(presentation.slides, start=1):
                lines = [shape.text.strip() for shape in slide.shapes if getattr(shape, "has_text_frame", False) and shape.text.strip()]
                if lines:
                    append_passage(f"slide:{slide_number}", "\n".join(lines))
        else:
            text = content.decode("utf-8-sig").strip()
            for paragraph_number, paragraph in enumerate((part.strip() for part in text.splitlines()), start=1):
                if paragraph:
                    append_passage(f"line:{paragraph_number}", paragraph)
    except Exception as error:
        return [], "failed", f"Could not extract readable text: {error}"
    if not passages:
        return [], "failed", "No readable text was extracted. Scanned PDFs require OCR before they can ground suggestions."
    return passages, "complete", None
