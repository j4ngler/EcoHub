"""
Tool tạo bộ âm thanh token tiếng Việt để ghép đọc số lượng sản phẩm.

- Input: danh sách token cố định (0..9, muoi, muoi2, tram, nghin, le, mot, lam, don_hang_co, san_pham)
- Output: các file mp3 theo đúng tên token trong thư mục output.

Chạy ví dụ:
  python number.py --out "static/audio/tts"
"""

from __future__ import annotations

import argparse
import os
from pathlib import Path

from gtts import gTTS


TOKEN_TEXT = {
    # Cụm cố định
    "don_hang_co": "Đơn hàng có",
    "san_pham": "sản phẩm",
    # Chữ số
    "0": "không",
    "1": "một",
    "2": "hai",
    "3": "ba",
    "4": "bốn",
    "5": "năm",
    "6": "sáu",
    "7": "bảy",
    "8": "tám",
    "9": "chín",
    # Hàng/đơn vị
    "muoi": "mười",
    "muoi2": "mươi",
    "tram": "trăm",
    "nghin": "nghìn",
    "le": "lẻ",
    # Biến thể phát âm
    "mot": "mốt",
    "lam": "lăm",
}


def generate_token_mp3(token: str, out_dir: Path, lang: str = "vi") -> Path:
    text = TOKEN_TEXT.get(token)
    if not text:
        raise ValueError(f"Unknown token: {token}")
    out_dir.mkdir(parents=True, exist_ok=True)
    out_path = out_dir / f"{token}.mp3"
    tts = gTTS(text=text, lang=lang)
    tts.save(str(out_path))
    return out_path


def main() -> int:
    p = argparse.ArgumentParser()
    p.add_argument("--out", default=str(Path(__file__).parent / "static" / "audio" / "tts"), help="Thư mục output mp3")
    p.add_argument("--lang", default="vi", help="Ngôn ngữ gTTS (mặc định vi)")
    p.add_argument("--force", action="store_true", help="Ghi đè nếu file đã tồn tại")
    args = p.parse_args()

    out_dir = Path(args.out)
    out_dir.mkdir(parents=True, exist_ok=True)

    created = 0
    skipped = 0
    for token in TOKEN_TEXT.keys():
        out_path = out_dir / f"{token}.mp3"
        if out_path.exists() and not args.force:
            skipped += 1
            continue
        generate_token_mp3(token, out_dir, lang=args.lang)
        created += 1

    print(f"Output folder: {out_dir}")
    print(f"Created: {created} file(s), Skipped: {skipped} file(s)")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())