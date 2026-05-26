from __future__ import annotations

import hashlib
import hmac
import json
import os
import sqlite3
import time
from dataclasses import dataclass
from typing import Any
from services.tiktok_auth_store import list_authorizations

class TikTokApiError(RuntimeError):
    pass


def _load_local_env_file() -> None:
    try:
        root_dir = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
        env_path = os.path.join(root_dir, ".env")
        if not os.path.exists(env_path):
            return
        with open(env_path, "r", encoding="utf-8") as f:
            for raw_line in f:
                line = (raw_line or "").strip()
                if not line or line.startswith("#") or "=" not in line:
                    continue
                key, value = line.split("=", 1)
                key = key.strip()
                value = value.strip()
                if (value.startswith('"') and value.endswith('"')) or (
                    value.startswith("'") and value.endswith("'")
                ):
                    value = value[1:-1]
                if key:
                    # Luôn ưu tiên giá trị ECOHUB_* trong .env để đồng bộ với app runtime.
                    if key.startswith("ECOHUB_"):
                        os.environ[key] = value
                    elif key not in os.environ:
                        os.environ[key] = value
    except Exception:
        # Không chặn app nếu .env lỗi format.
        return


def _env(name: str, default: str = "") -> str:
    return (os.environ.get(name) or default).strip()


def _env_required(*names: str) -> str:
    for name in names:
        value = _env(name)
        if value:
            return value
    raise RuntimeError(f"Thiếu biến môi trường bắt buộc: {' hoặc '.join(names)}")


def _get_latest_oauth_tokens_from_db() -> dict[str, str]:
    """
    Lấy token/cipher mới nhất từ DB ủy quyền TikTok nếu có.
    DB này được tạo bởi route /tiktok-auth/callback.
    """
    try:
        db_path = _env("ECOHUB_TIKTOK_AUTH_DB")
        if not db_path:
            root_dir = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
            db_path = os.path.join(root_dir, "tiktok_auth.db")
        if not os.path.exists(db_path):
            return {}
        conn = sqlite3.connect(db_path)
        conn.row_factory = sqlite3.Row
        try:
            row = conn.execute(
                """
                SELECT access_token, refresh_token, shop_cipher
                FROM tiktok_authorizations
                WHERE COALESCE(access_token, '') <> ''
                ORDER BY id DESC
                LIMIT 1
                """
            ).fetchone()
        finally:
            conn.close()
        if not row:
            return {}
        return {
            "access_token": str(row["access_token"] or "").strip(),
            "refresh_token": str(row["refresh_token"] or "").strip(),
            "shop_cipher": str(row["shop_cipher"] or "").strip(),
        }
    except Exception:
        return {}



def _get_authorized_oauth_tokens_from_db() -> list[dict[str, str]]:
    """
    Lấy danh sách credential TikTok đã được lưu trong DB ủy quyền.
    """
    try:
        records = list_authorizations(_env("ECOHUB_TIKTOK_AUTH_DB") or "")
    except Exception:
        return []
    out: list[dict[str, str]] = []
    for record in records:
        access_token = (record.access_token or "").strip()
        shop_cipher = (record.shop_cipher or "").strip()
        if not access_token or not shop_cipher:
            continue
        out.append(
            {
                "id": int(record.id),
                "access_token": access_token,
                "shop_cipher": shop_cipher,
                "shop_id": (record.shop_id or "").strip(),
                "merchant_id": (record.merchant_id or "").strip(),
            }
        )
    return out
def _parse_json_object(raw: str, env_name: str) -> dict[str, Any]:
    if not raw:
        return {}
    try:
        value = json.loads(raw)
    except Exception as e:
        raise RuntimeError(f"{env_name} phải là JSON object hợp lệ") from e
    if not isinstance(value, dict):
        raise RuntimeError(f"{env_name} phải là JSON object hợp lệ")
    return value


def _build_sign(params: dict[str, Any], app_secret: str, path: str, body_raw: str = "") -> str:
    """
    Tạo sign theo TikTok flow:
    AppSecret + Path + sorted(Key+Value, trừ sign/access_token) + BodyRaw + AppSecret
    """
    sign_params = {k: params[k] for k in params.keys() if k not in {"sign", "access_token"}}
    param_str = "".join(f"{k}{sign_params[k]}" for k in sorted(sign_params.keys()))
    payload = f"{app_secret}{path}{param_str}{body_raw}{app_secret}"
    return hmac.new(
        app_secret.encode("utf-8"),
        payload.encode("utf-8"),
        hashlib.sha256,
    ).hexdigest()


@dataclass
class TikTokClient:
    base_url: str
    app_key: str
    app_secret: str
    shop_cipher: str
    access_token: str
    auth_header: str = "x-tts-access-token"
    auth_scheme: str = ""
    timeout_sec: float = 20.0
    include_access_token_query: bool = False
    default_query_params: dict[str, Any] | None = None
    extra_headers: dict[str, Any] | None = None

    @classmethod
    def from_env(cls) -> "TikTokClient":
        _load_local_env_file()
        base_url = _env("ECOHUB_TIKTOK_BASE_URL") or _env_required("ECOHUB_ORDER_API_BASE_URL")
        app_key = _env("ECOHUB_TIKTOK_APP_KEY") or _env_required("ECOHUB_ORDER_API_APP_KEY")
        app_secret = _env("ECOHUB_TIKTOK_APP_SECRET") or _env_required("ECOHUB_ORDER_API_APP_SECRET")
        shop_cipher = _env("ECOHUB_TIKTOK_SHOP_CIPHER") or _env("ECOHUB_ORDER_API_SHOP_CIPHER")
        access_token = _env("ECOHUB_TIKTOK_ACCESS_TOKEN") or _env("ECOHUB_ORDER_API_TOKEN")
        latest_tokens = _get_latest_oauth_tokens_from_db()
        if latest_tokens.get("shop_cipher"):
            shop_cipher = latest_tokens["shop_cipher"]
        if latest_tokens.get("access_token"):
            access_token = latest_tokens["access_token"]
        auth_header = _env("ECOHUB_TIKTOK_AUTH_HEADER") or _env("ECOHUB_ORDER_API_AUTH_HEADER", "x-tts-access-token")
        auth_scheme = _env("ECOHUB_TIKTOK_AUTH_SCHEME") or _env("ECOHUB_ORDER_API_AUTH_SCHEME", "")
        timeout_raw = _env("ECOHUB_TIKTOK_TIMEOUT_SEC") or _env("ECOHUB_ORDER_API_TIMEOUT_SEC", "20")
        include_access_token_query = (_env("ECOHUB_TIKTOK_INCLUDE_ACCESS_TOKEN_QUERY") or "false").lower() in {
            "1",
            "true",
            "yes",
            "on",
        }
        default_query = _parse_json_object(
            _env("ECOHUB_TIKTOK_DEFAULT_QUERY_PARAMS") or _env("ECOHUB_ORDER_API_QUERY_PARAMS"),
            "ECOHUB_TIKTOK_DEFAULT_QUERY_PARAMS",
        )
        extra_headers = _parse_json_object(
            _env("ECOHUB_TIKTOK_EXTRA_HEADERS") or _env("ECOHUB_ORDER_API_EXTRA_HEADERS"),
            "ECOHUB_TIKTOK_EXTRA_HEADERS",
        )

        try:
            timeout_sec = float(timeout_raw)
        except Exception:
            timeout_sec = 20.0

        if not shop_cipher:
            raise RuntimeError("Thiếu shop_cipher trong env")
        if not access_token:
            raise RuntimeError("Thiếu access_token trong env")

        # version và shop_id thường dùng chung nhiều endpoint
        version = _env("ECOHUB_TIKTOK_VERSION")
        shop_id_env = _env("ECOHUB_TIKTOK_SHOP_ID")
        if version and "version" not in default_query:
            default_query["version"] = version
        if shop_id_env and "shop_id" not in default_query:
            default_query["shop_id"] = shop_id_env

        return cls(
            base_url=base_url.rstrip("/"),
            app_key=app_key,
            app_secret=app_secret,
            shop_cipher=shop_cipher,
            access_token=access_token,
            auth_header=auth_header or "x-tts-access-token",
            auth_scheme=auth_scheme,
            timeout_sec=timeout_sec,
            include_access_token_query=include_access_token_query,
            default_query_params=default_query,
            extra_headers=extra_headers,
        )

    def request(
        self,
        method: str,
        path: str,
        *,
        query_params: dict[str, Any] | None = None,
        body: Any = None,
        headers: dict[str, Any] | None = None,
    ) -> Any:
        try:
            import requests
        except Exception as e:
            raise RuntimeError("Thiếu thư viện 'requests'. Hãy cài: pip install requests") from e

        query: dict[str, Any] = {}
        if self.default_query_params:
            query.update(self.default_query_params)
        if query_params:
            query.update(query_params)

        query["app_key"] = self.app_key
        query["shop_cipher"] = self.shop_cipher
        query["timestamp"] = str(int(time.time()))
        if self.include_access_token_query:
            query["access_token"] = self.access_token
        req_path = path if path.startswith("/") else f"/{path}"

        body_raw = ""
        if method.strip().upper() != "GET" and body is not None:
            # Body khi ký phải là raw JSON minified (không whitespace thừa).
            body_raw = json.dumps(body, ensure_ascii=False, separators=(",", ":"))

        query["sign"] = _build_sign(query, self.app_secret, req_path, body_raw)

        req_headers: dict[str, str] = {"Accept": "application/json"}
        if method.strip().upper() != "GET":
            req_headers["Content-Type"] = "application/json"
        if self.auth_scheme:
            req_headers[self.auth_header] = f"{self.auth_scheme} {self.access_token}".strip()
        else:
            req_headers[self.auth_header] = self.access_token
        if self.extra_headers:
            req_headers.update({str(k): str(v) for k, v in self.extra_headers.items()})
        if headers:
            req_headers.update({str(k): str(v) for k, v in headers.items()})

        url = f"{self.base_url}{req_path}"
        response = requests.request(
            method=method.strip().upper(),
            url=url,
            params=query,
            json=body,
            headers=req_headers,
            timeout=self.timeout_sec,
        )

        if response.status_code >= 400:
            body_text = response.text or ""
            raise TikTokApiError(f"HTTP {response.status_code}: {body_text[:500]}")

        try:
            return response.json()
        except Exception:
            return response.text

    @classmethod
    def from_tokens(cls, *, access_token: str, shop_cipher: str) -> "TikTokClient":
        """Khởi tạo client từ access_token/shop_cipher riêng lẻ, dùng config chung từ env."""
        _load_local_env_file()
        base_url = _env("ECOHUB_TIKTOK_BASE_URL") or _env_required("ECOHUB_ORDER_API_BASE_URL")
        app_key = _env("ECOHUB_TIKTOK_APP_KEY") or _env_required("ECOHUB_ORDER_API_APP_KEY")
        app_secret = _env("ECOHUB_TIKTOK_APP_SECRET") or _env_required("ECOHUB_ORDER_API_APP_SECRET")
        auth_header = _env("ECOHUB_TIKTOK_AUTH_HEADER") or _env("ECOHUB_ORDER_API_AUTH_HEADER", "x-tts-access-token")
        auth_scheme = _env("ECOHUB_TIKTOK_AUTH_SCHEME") or _env("ECOHUB_ORDER_API_AUTH_SCHEME", "")
        timeout_raw = _env("ECOHUB_TIKTOK_TIMEOUT_SEC") or _env("ECOHUB_ORDER_API_TIMEOUT_SEC", "20")
        include_access_token_query = (_env("ECOHUB_TIKTOK_INCLUDE_ACCESS_TOKEN_QUERY") or "false").lower() in {
            "1",
            "true",
            "yes",
            "on",
        }
        default_query = _parse_json_object(
            _env("ECOHUB_TIKTOK_DEFAULT_QUERY_PARAMS") or _env("ECOHUB_ORDER_API_QUERY_PARAMS"),
            "ECOHUB_TIKTOK_DEFAULT_QUERY_PARAMS",
        )
        extra_headers = _parse_json_object(
            _env("ECOHUB_TIKTOK_EXTRA_HEADERS") or _env("ECOHUB_ORDER_API_EXTRA_HEADERS"),
            "ECOHUB_TIKTOK_EXTRA_HEADERS",
        )

        try:
            timeout_sec = float(timeout_raw)
        except Exception:
            timeout_sec = 20.0

        if not shop_cipher:
            raise RuntimeError("Thiếu shop_cipher")
        if not access_token:
            raise RuntimeError("Thiếu access_token")

        version = _env("ECOHUB_TIKTOK_VERSION")
        shop_id_env = _env("ECOHUB_TIKTOK_SHOP_ID")
        if version and "version" not in default_query:
            default_query["version"] = version
        if shop_id_env and "shop_id" not in default_query:
            default_query["shop_id"] = shop_id_env

        return cls(
            base_url=base_url.rstrip("/"),
            app_key=app_key,
            app_secret=app_secret,
            shop_cipher=shop_cipher,
            access_token=access_token,
            auth_header=auth_header or "x-tts-access-token",
            auth_scheme=auth_scheme,
            timeout_sec=timeout_sec,
            include_access_token_query=include_access_token_query,
            default_query_params=default_query,
            extra_headers=extra_headers,
        )
