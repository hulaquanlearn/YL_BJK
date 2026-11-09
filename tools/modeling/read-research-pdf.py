"""Read manufacturer PDFs locally; preserve page numbers and source evidence.

Use the bundled Python (pypdf) and Poppler. No uploads, OCR guesses or model
generation. Render selected dimension pages and inspect them before using a
number as a geometric constraint.
"""
from __future__ import annotations

import argparse
import hashlib
import json
from pathlib import Path
import shutil
import subprocess

from pypdf import PdfReader


def page_numbers(value: str | None, total: int) -> list[int]:
    if value is None:
        return list(range(1, total + 1))
    selected: set[int] = set()
    for section in value.split(","):
        ends = section.strip().split("-")
        if len(ends) == 1:
            first = last = int(ends[0])
        elif len(ends) == 2:
            first, last = map(int, ends)
        else:
            raise ValueError("Pages must look like 1,3-5")
        if first < 1 or last > total or last < first:
            raise ValueError(f"Page range outside 1-{total}: {section}")
        selected.update(range(first, last + 1))
    if not selected:
        raise ValueError("No pages selected")
    return sorted(selected)


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("pdf", type=Path)
    parser.add_argument("--out", type=Path, required=True, help="Private research output folder")
    parser.add_argument("--pages", help="One-based PDF pages, e.g. 1,3-5; default extracts all")
    parser.add_argument("--source-url", default="", help="Exact original public download URL")
    parser.add_argument("--render", action="store_true", help="Render the selected pages to PNG")
    parser.add_argument("--renderer", default=shutil.which("pdftoppm"))
    args = parser.parse_args()
    source = args.pdf.resolve(strict=True)
    data = source.read_bytes()
    if not data.startswith(b"%PDF-"):
        raise ValueError("File is not a PDF (possibly a blocked HTML download)")
    digest = hashlib.sha256(data).hexdigest()
    reader = PdfReader(source)
    if reader.is_encrypted and not reader.decrypt(""):
        raise ValueError("Encrypted PDF cannot be read without its password")
    selected = page_numbers(args.pages, len(reader.pages))
    if args.render and not args.pages:
        raise ValueError("Select dimension pages with --pages before rendering")
    output = args.out.resolve()
    output.mkdir(parents=True, exist_ok=True)
    metadata = output / "source.json"
    if metadata.exists() and json.loads(metadata.read_text(encoding="utf-8"))["sha256"] != digest:
        raise ValueError("Output folder contains a different source; choose a new folder")
    pages = []
    chunks = []
    for number in selected:
        page = reader.pages[number - 1]
        text = page.extract_text(extraction_mode="layout") or ""
        chunks.append(f"\n\n===== PDF PAGE {number} =====\n{text}")
        pages.append({"page": number, "characters": len(text), "hasExtractedText": bool(text.strip()), "requiresDrawingReview": True})
    (output / "pages.txt").write_text("".join(chunks), encoding="utf-8")
    images = []
    if args.render:
        if not args.renderer:
            raise ValueError("Poppler pdftoppm is unavailable; supply --renderer")
        for number in selected:
            prefix = output / f"page-{number:04d}"
            subprocess.run([args.renderer, "-f", str(number), "-l", str(number), "-singlefile", "-scale-to", "1800", "-png", str(source), str(prefix)], check=True, capture_output=True)
            image = prefix.with_suffix(".png")
            if not image.is_file():
                raise ValueError(f"Render did not produce {image}")
            images.append(str(image))
    evidence = {"sourcePath": str(source), "sourceUrl": args.source_url, "sha256": digest, "bytes": len(data), "totalPages": len(reader.pages), "selectedPages": pages, "images": images, "verification": "text extraction only; inspect dimension drawings and footnotes before modeling"}
    metadata.write_text(json.dumps(evidence, ensure_ascii=False, indent=2), encoding="utf-8")
    print(json.dumps({"pages": len(selected), "totalPages": len(reader.pages), "sha256": digest, "text": str(output / "pages.txt"), "images": images}, ensure_ascii=False))


if __name__ == "__main__":
    main()
