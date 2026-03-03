import json
import os
from typing import Any, Dict, Optional


# Defaults cho POC (dùng khi không có ENV và config.json)
DEFAULT_VIDEO_STORAGE_LIMIT_GB = 50.0  # tổng dung lượng tối đa cho video
DEFAULT_VIDEO_MAX_COUNT = 0            # 0 = không giới hạn số lượng video
DEFAULT_VIDEO_MAX_DURATION_MIN = 0     # 0 = không giới hạn tổng thời lượng (phút)


def _read_json_config_safe(config_file_path: str) -> Dict[str, Any]:
    if not config_file_path or not os.path.exists(config_file_path):
        return {}
    try:
        with open(config_file_path, "r", encoding="utf-8") as f:
            return json.load(f) or {}
    except Exception:
        return {}


def _get_env_video_limits(env: Optional[Dict[str, str]] = None) -> Dict[str, Any]:
    """
    Đọc giới hạn dung lượng video từ ENV (nếu có).

    Keys:
    - VIDEO_STORAGE_LIMIT_GB
    - VIDEO_MAX_COUNT
    - VIDEO_MAX_DURATION_MIN
    """
    if env is None:
        env = os.environ  # type: ignore[assignment]

    limit_gb = None
    max_count = None
    max_duration = None

    raw_limit = env.get("VIDEO_STORAGE_LIMIT_GB")
    if raw_limit:
        try:
            limit_gb = float(raw_limit)
        except ValueError:
            pass

    raw_count = env.get("VIDEO_MAX_COUNT")
    if raw_count:
        try:
            max_count = int(raw_count)
        except ValueError:
            pass

    raw_duration = env.get("VIDEO_MAX_DURATION_MIN")
    if raw_duration:
        try:
            max_duration = int(raw_duration)
        except ValueError:
            pass

    return {
        "storage_limit_gb": limit_gb,
        "max_count": max_count,
        "max_duration_min": max_duration,
    }


def get_global_video_limits(
    config_file_path: str = "config.json",
    env: Optional[Dict[str, str]] = None,
) -> Dict[str, Any]:
    """
    Lấy cấu hình giới hạn dung lượng video (global).

    Thứ tự ưu tiên:
    1) ENV
    2) config.json (key: "video_limits")
    3) DEFAULT_*
    """
    env_cfg = _get_env_video_limits(env=env)
    data = _read_json_config_safe(config_file_path)
    file_limits = data.get("video_limits") or {}

    def _pick_float(key: str, default_val: float) -> float:
        env_val = env_cfg.get(key)
        if isinstance(env_val, (float, int)):
            return float(env_val)
        try:
            raw = file_limits.get(key)
            if raw is None or raw == "":
                return float(default_val)
            return float(raw)
        except Exception:
            return float(default_val)

    def _pick_int(key: str, default_val: int) -> int:
        env_val = env_cfg.get(key)
        if isinstance(env_val, int):
            return env_val
        try:
            raw = file_limits.get(key)
            if raw is None or raw == "":
                return int(default_val)
            return int(raw)
        except Exception:
            return int(default_val)

    return {
        "storage_limit_gb": _pick_float("storage_limit_gb", DEFAULT_VIDEO_STORAGE_LIMIT_GB),
        "max_count": _pick_int("max_count", DEFAULT_VIDEO_MAX_COUNT),
        "max_duration_min": _pick_int("max_duration_min", DEFAULT_VIDEO_MAX_DURATION_MIN),
    }


def get_shop_video_limits(shop_id: Optional[str], config_file_path: str = "config.json") -> Dict[str, Any]:
    """
    POC hiện tại chưa có multi-shop thật → fallback về global.
    """
    _ = shop_id
    return get_global_video_limits(config_file_path=config_file_path)

