import os
import shutil
import subprocess
import tempfile
from pathlib import Path


def find_libreoffice() -> str | None:
    executable = shutil.which("soffice") or shutil.which("libreoffice")
    if executable:
        return executable
    for variable in ("PROGRAMFILES", "PROGRAMFILES(X86)", "LOCALAPPDATA"):
        root = os.environ.get(variable)
        if not root:
            continue
        candidate = Path(root) / "LibreOffice" / "program" / "soffice.exe"
        if candidate.is_file():
            return str(candidate)
        candidate = Path(root) / "Programs" / "LibreOffice" / "program" / "soffice.exe"
        if candidate.is_file():
            return str(candidate)
    return None


def render_slides(source: Path, output_root: Path) -> tuple[dict[int, str], str | None]:
    executable = find_libreoffice()
    if not executable:
        return {}, "Slide preview unavailable: LibreOffice was not found."

    try:
        import pymupdf
    except ImportError:
        return {}, "Slide preview unavailable: install the backend PDF rendering dependency."

    try:
        with tempfile.TemporaryDirectory(prefix="chimera-render-") as temporary:
            temporary_path = Path(temporary)
            profile = (temporary_path / "lo-profile").as_uri()
            result = subprocess.run(
                [
                    executable,
                    "--headless",
                    f"-env:UserInstallation={profile}",
                    "--convert-to",
                    "pdf",
                    "--outdir",
                    str(temporary_path),
                    str(source),
                ],
                capture_output=True,
                check=False,
                text=True,
                timeout=180,
            )
            pdf_path = temporary_path / f"{source.stem}.pdf"
            if result.returncode != 0 or not pdf_path.is_file():
                return {}, "Slide preview unavailable: LibreOffice could not convert this presentation."

            render_dir = output_root / "renders"
            render_dir.mkdir(parents=True, exist_ok=True)
            paths: dict[int, str] = {}
            with pymupdf.open(pdf_path) as document:
                for index in range(len(document)):
                    page = document.load_page(index)
                    slide_number = index + 1
                    filename = f"slide-{slide_number:03d}.png"
                    page.get_pixmap(matrix=pymupdf.Matrix(1.5, 1.5), alpha=False).save(render_dir / filename)
                    paths[slide_number] = f"renders/{filename}"
            return paths, None
    except Exception:
        return {}, "Slide preview unavailable: rendering failed for this presentation."