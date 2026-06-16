import argparse
import json
import math
import os
import shutil
import sys
import tempfile

import cv2


def ensure_even(value: int) -> int:
    value = max(2, int(value))
    return value if value % 2 == 0 else value - 1


def compute_scaled_dimensions(src_width: int, src_height: int, max_width: int) -> tuple[int, int]:
    if src_width <= max_width:
      width = src_width
      height = src_height
    else:
      scale = max_width / float(src_width)
      width = int(src_width * scale)
      height = int(src_height * scale)
    return ensure_even(width), ensure_even(height)


def encode_profile(input_path: str, output_path: str, max_width: int, target_fps: float) -> dict:
    capture = cv2.VideoCapture(input_path)
    if not capture.isOpened():
        raise RuntimeError("Cannot open input video")

    src_width = int(capture.get(cv2.CAP_PROP_FRAME_WIDTH) or 0) or 1280
    src_height = int(capture.get(cv2.CAP_PROP_FRAME_HEIGHT) or 0) or 720
    src_fps = float(capture.get(cv2.CAP_PROP_FPS) or 0.0) or 24.0
    frame_count = int(capture.get(cv2.CAP_PROP_FRAME_COUNT) or 0)
    duration_sec = (frame_count / src_fps) if frame_count > 0 and src_fps > 0 else None

    out_width, out_height = compute_scaled_dimensions(src_width, src_height, max_width)
    frame_step = max(1, int(round(src_fps / target_fps))) if src_fps > target_fps else 1
    output_fps = src_fps / frame_step if frame_step > 1 else min(src_fps, target_fps)
    output_fps = max(6.0, min(output_fps, target_fps))

    fourcc = cv2.VideoWriter_fourcc(*"mp4v")
    writer = cv2.VideoWriter(output_path, fourcc, output_fps, (out_width, out_height))

    if not writer.isOpened():
        capture.release()
        raise RuntimeError("Cannot open output video writer")

    written_frames = 0
    frame_index = 0

    while True:
        ok, frame = capture.read()
        if not ok:
            break

        if frame_step > 1 and frame_index % frame_step != 0:
            frame_index += 1
            continue

        resized = cv2.resize(frame, (out_width, out_height), interpolation=cv2.INTER_AREA)
        writer.write(resized)
        written_frames += 1
        frame_index += 1

    capture.release()
    writer.release()

    if written_frames == 0:
        raise RuntimeError("No frames were written during compression")

    size_bytes = os.path.getsize(output_path)
    return {
        "width": out_width,
        "height": out_height,
        "fps": output_fps,
        "size_bytes": size_bytes,
        "duration_sec": math.ceil(duration_sec) if duration_sec else None,
    }


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--input", required=True)
    parser.add_argument("--output", required=True)
    parser.add_argument("--target-size-mb", type=float, default=4.0)
    args = parser.parse_args()

    input_path = os.path.abspath(args.input)
    output_path = os.path.abspath(args.output)
    target_size_bytes = int(max(args.target_size_mb, 1.0) * 1024 * 1024)

    os.makedirs(os.path.dirname(output_path), exist_ok=True)

    temp_dir = tempfile.mkdtemp(prefix="ecohub-compress-")
    profiles = [
        (960, 12.0),
        (854, 10.0),
        (640, 10.0),
        (480, 8.0),
    ]

    chosen = None
    chosen_path = None

    try:
        for index, (max_width, fps) in enumerate(profiles):
            temp_output = os.path.join(temp_dir, f"profile-{index}.mp4")
            result = encode_profile(input_path, temp_output, max_width, fps)

            if chosen is None or result["size_bytes"] < chosen["size_bytes"]:
                chosen = result
                chosen_path = temp_output

            if result["size_bytes"] <= target_size_bytes:
                chosen = result
                chosen_path = temp_output
                break

        if chosen is None or chosen_path is None:
            raise RuntimeError("Compression did not produce an output")

        shutil.copyfile(chosen_path, output_path)

        payload = {
            "output_path": output_path,
            "size_bytes": os.path.getsize(output_path),
            "duration_sec": chosen.get("duration_sec"),
            "width": chosen.get("width"),
            "height": chosen.get("height"),
            "fps": chosen.get("fps"),
        }
        print(json.dumps(payload))
        return 0
    except Exception as exc:
        print(str(exc), file=sys.stderr)
        return 1
    finally:
        shutil.rmtree(temp_dir, ignore_errors=True)


if __name__ == "__main__":
    raise SystemExit(main())
