"""Install pinned English Tesseract language data locally, without admin rights."""
import hashlib
from pathlib import Path
import urllib.request

URL = "https://raw.githubusercontent.com/tesseract-ocr/tessdata_fast/87416418657359cb625c412a48b6e1d6d41c29bd/eng.traineddata"
SHA256 = "7d4322bd2a7749724879683fc3912cb542f19906c83bcc1a52132556427170b2"


def main():
    destination = Path(__file__).resolve().parents[1] / "tools" / "tessdata" / "eng.traineddata"
    if destination.is_file() and hashlib.sha256(destination.read_bytes()).hexdigest() == SHA256:
        print("Pinned English OCR language data is already installed.")
        return
    with urllib.request.urlopen(URL, timeout=60) as response:
        content = response.read(8 * 1024 * 1024)
    if hashlib.sha256(content).hexdigest() != SHA256:
        raise RuntimeError("OCR language-data checksum mismatch; existing files were not changed")
    destination.parent.mkdir(parents=True, exist_ok=True)
    temporary = destination.with_suffix(".tmp")
    temporary.write_bytes(content)
    temporary.replace(destination)
    print(f"Installed verified English OCR data at {destination}")


if __name__ == "__main__":
    main()
