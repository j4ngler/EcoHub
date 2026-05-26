from __future__ import annotations

import argparse
import copy
import json
import os
from datetime import UTC, datetime
from typing import Any

from services.tiktok_client import TikTokApiError, TikTokClient


def _deep_get(data: Any, path: str, default: Any = None) -> Any:
    if not path:
        return data
    cur = data
    for part in path.split("."):
        if isinstance(cur, dict):
            if part not in cur:
                return default
            cur = cur.get(part)
        elif isinstance(cur, list):
            try:
                idx = int(part)
            except Exception:
                return default
            if idx < 0 or idx >= len(cur):
                return default
            cur = cur[idx]
        else:
            return default
    return cur


def _load_targets(config_path: str) -> dict[str, Any]:
    with open(config_path, "r", encoding="utf-8") as f:
        cfg = json.load(f)
    if not isinstance(cfg, dict):
        raise RuntimeError("tiktok_targets.json không hợp lệ")
    targets = cfg.get("targets")
    if not isinstance(targets, list):
        raise RuntimeError("tiktok_targets.json thiếu mảng targets")
    return cfg


def _run_target(client: TikTokClient, target: dict[str, Any], max_pages_default: int) -> dict[str, Any]:
    method = str(target.get("method") or "GET").upper()
    path = str(target.get("path") or "").strip()
    if not path:
        raise RuntimeError("Target thiếu field path")

    query_base = target.get("query") if isinstance(target.get("query"), dict) else {}
    body_base = target.get("body") if isinstance(target.get("body"), dict) else {}
    pagination = target.get("pagination") if isinstance(target.get("pagination"), dict) else {}
    pagination_enabled = bool(pagination.get("enabled"))
    max_pages = int(target.get("max_pages") or max_pages_default)

    results_pages: list[Any] = []
    token = None
    page_no = 0

    while True:
        page_no += 1
        if page_no > max_pages:
            break

        query = copy.deepcopy(query_base)
        body = copy.deepcopy(body_base)
        if pagination_enabled and token:
            token_in = str(pagination.get("request_token_in") or "query").lower()
            token_field = str(pagination.get("request_token_field") or "page_token")
            if token_in == "body":
                body[token_field] = token
            else:
                query[token_field] = token

        response = client.request(
            method=method,
            path=path,
            query_params=query,
            body=body if method != "GET" else None,
        )
        results_pages.append(response)

        if not pagination_enabled:
            break

        next_token_path = str(pagination.get("response_token_path") or "").strip()
        next_token = _deep_get(response, next_token_path) if next_token_path else None
        if not next_token:
            break
        if token and str(next_token) == str(token):
            break
        token = str(next_token)

    records_path = str(pagination.get("records_path") or "").strip()
    records_count = 0
    if records_path:
        for p in results_pages:
            rows = _deep_get(p, records_path, [])
            if isinstance(rows, list):
                records_count += len(rows)

    return {
        "target": {
            "id": target.get("id"),
            "name": target.get("name"),
            "group": target.get("group"),
            "method": method,
            "path": path,
        },
        "pages": len(results_pages),
        "records_count": records_count,
        "responses": results_pages,
    }


def main() -> None:
    parser = argparse.ArgumentParser(description="Sync nhiều nhóm API TikTok theo cấu hình targets.")
    parser.add_argument("--config", default="tiktok_targets.json", help="Đường dẫn file config targets")
    parser.add_argument("--groups", default="", help="Danh sách group, ngăn cách dấu phẩy")
    parser.add_argument("--targets", default="", help="Danh sách target id, ngăn cách dấu phẩy")
    parser.add_argument("--output", default="", help="File JSON output")
    parser.add_argument("--max-pages", type=int, default=10, help="Giới hạn số trang mỗi target")
    args = parser.parse_args()

    cfg = _load_targets(args.config)
    targets = cfg.get("targets") or []
    defaults = cfg.get("defaults") if isinstance(cfg.get("defaults"), dict) else {}
    default_max_pages = int(defaults.get("max_pages") or args.max_pages)

    groups = {x.strip() for x in args.groups.split(",") if x.strip()}
    target_ids = {x.strip() for x in args.targets.split(",") if x.strip()}

    selected: list[dict[str, Any]] = []
    for t in targets:
        if not isinstance(t, dict):
            continue
        if not t.get("enabled", True):
            continue
        if groups and str(t.get("group") or "").strip() not in groups:
            continue
        if target_ids and str(t.get("id") or "").strip() not in target_ids:
            continue
        selected.append(t)

    if not selected:
        raise RuntimeError("Không có target nào được chọn để sync")

    client = TikTokClient.from_env()
    started_at = datetime.now(UTC).isoformat().replace("+00:00", "Z")
    run_result: dict[str, Any] = {
        "started_at": started_at,
        "config": args.config,
        "selected_targets": [t.get("id") for t in selected],
        "results": [],
        "errors": [],
    }

    for target in selected:
        try:
            result = _run_target(client, target, default_max_pages)
            run_result["results"].append(result)
            print(f"[OK] {target.get('id')} pages={result['pages']} records={result['records_count']}")
        except TikTokApiError as e:
            run_result["errors"].append({"target": target.get("id"), "error": str(e)})
            print(f"[ERROR] {target.get('id')}: {e}")
        except Exception as e:
            run_result["errors"].append({"target": target.get("id"), "error": str(e)})
            print(f"[ERROR] {target.get('id')}: {e}")

    ended_at = datetime.now(UTC).isoformat().replace("+00:00", "Z")
    run_result["ended_at"] = ended_at

    output = args.output
    if not output:
        os.makedirs("data", exist_ok=True)
        stamp = datetime.now(UTC).strftime("%Y%m%d_%H%M%S")
        output = os.path.join("data", f"tiktok_sync_{stamp}.json")
    else:
        output_dir = os.path.dirname(output)
        if output_dir:
            os.makedirs(output_dir, exist_ok=True)

    with open(output, "w", encoding="utf-8") as f:
        json.dump(run_result, f, ensure_ascii=False, indent=2)
    print(f"Saved output: {output}")


if __name__ == "__main__":
    main()
