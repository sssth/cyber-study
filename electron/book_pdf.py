"""Convert selectable PDF text to Markdown without OCR."""
from contextlib import redirect_stdout
import io
import re
import sys

import pymupdf
import pymupdf4llm


CHAPTER = re.compile(r"^第[零〇一二三四五六七八九十百千两\d]+[卷篇章节回部]")
NUMBERED = re.compile(r"^(\d+(?:\.\d+)+)\s+\S")


def heading_detector(document):
    font_headers = pymupdf4llm.IdentifyHeaders(document, body_limit=float("inf"), max_levels=3)
    outline = {}
    for level, title, page in document.get_toc():
        if page > 0:
            outline.setdefault(page - 1, {})[re.sub(r"\s+", "", title)] = min(6, level + 1)

    def header(span, page=None):
        text = span["text"].strip()
        key = re.sub(r"\s+", "", text)
        level = outline.get(page.number if page is not None else -1, {}).get(key)
        if level:
            return "#" * level + " "
        if len(text) <= 100:
            match = CHAPTER.match(key)
            if match:
                return "### " if match[0].endswith("节") else "## "
            match = NUMBERED.match(text)
            if match and not re.search(r"[。！？!?；;]$", text):
                return "#" * min(6, match[1].count(".") + 2) + " "
        fallback = font_headers.get_header_id(span, page)
        return "#" + fallback if fallback else ""

    return header


def convert(filename):
    with pymupdf.open(filename, filetype="pdf") as document:
        if document.is_encrypted:
            raise ValueError("PDF 需要密码。")
        if not any(page.get_text().strip() for page in document):
            raise ValueError("PDF 没有可提取的文字。书库支持文字版 PDF。")
        with redirect_stdout(io.StringIO()):
            content = pymupdf4llm.to_markdown(
                document, hdr_info=heading_detector(document),
                ignore_images=True, ignore_graphics=True, ignore_code=True, show_progress=False,
            )
        return content.strip()


if __name__ == "__main__":
    try:
        content = convert(sys.argv[1])
        if not content:
            raise ValueError("PDF 没有可提取的正文。")
        sys.stdout.buffer.write(content.encode("utf-8"))
    except (ValueError, pymupdf.FileDataError) as error:
        message = "无法打开 PDF，文件可能已损坏。" if isinstance(error, pymupdf.FileDataError) else str(error)
        print(message, file=sys.stderr)
        sys.exit(2)
