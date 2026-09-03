"""Notion（子育てイベント一覧・施設マスタ）から静的サイト用のJSONを生成する。

使い方:
    python fetch_data.py

出力: このスクリプトと同じディレクトリに data.json を生成する。
"""
import json
import os
import sys
from datetime import datetime, timezone, timedelta

from dotenv import load_dotenv
from notion_client import Client

load_dotenv(os.path.join(os.path.dirname(__file__), "..", ".env"))

EVENTS_DATA_SOURCE_ID = "8c2569b7-c5ed-4613-8625-005f7c28f7ba"
FACILITIES_DATA_SOURCE_ID = "869e3a2d-a9b9-4401-a948-f106eb9e4a55"
JST = timezone(timedelta(hours=9))


def _client() -> Client:
    token = os.environ.get("NOTION_TOKEN")
    if not token:
        sys.exit("NOTION_TOKEN が設定されていません（.env を確認してください）")
    return Client(auth=token)


def _query_all(client: Client, data_source_id: str) -> list[dict]:
    """データソースの全件をページネーションしながら取得する。"""
    results: list[dict] = []
    cursor = None
    while True:
        kwargs = {"data_source_id": data_source_id, "page_size": 100}
        if cursor:
            kwargs["start_cursor"] = cursor
        resp = client.data_sources.query(**kwargs)
        results.extend(resp["results"])
        if not resp.get("has_more"):
            break
        cursor = resp.get("next_cursor")
    return results


def _title(props: dict) -> str:
    prop = next((p for p in props.values() if p["type"] == "title"), None)
    if not prop:
        return ""
    return "".join(t["plain_text"] for t in prop["title"])


def _rich_text(props: dict, name: str) -> str:
    prop = props.get(name)
    if not prop or prop["type"] != "rich_text":
        return ""
    return "".join(t["plain_text"] for t in prop["rich_text"])


def _select(props: dict, name: str) -> str:
    prop = props.get(name)
    if not prop or prop["type"] != "select" or not prop["select"]:
        return ""
    return prop["select"]["name"]


def _checkbox(props: dict, name: str) -> bool:
    prop = props.get(name)
    if not prop or prop["type"] != "checkbox":
        return False
    return bool(prop["checkbox"])


def _url(props: dict, name: str) -> str:
    prop = props.get(name)
    if not prop or prop["type"] != "url":
        return ""
    return prop["url"] or ""


def _phone(props: dict, name: str) -> str:
    prop = props.get(name)
    if not prop or prop["type"] != "phone_number":
        return ""
    return prop["phone_number"] or ""


def _number(props: dict, name: str):
    prop = props.get(name)
    if not prop or prop["type"] != "number":
        return None
    return prop["number"]


def build_events(client: Client) -> list[dict]:
    pages = _query_all(client, EVENTS_DATA_SOURCE_ID)
    events = []
    for page in pages:
        props = page["properties"]
        title = _title(props)
        date_prop = props.get("日付", {}).get("date")
        if not date_prop or not date_prop.get("start"):
            continue  # 日付未設定のテンプレート的レコードは除外
        if _select(props, "確認状況") != "確認済み":
            continue  # 自動登録の未確認イベントは人がレビューするまで非公開
        age = _select(props, "対象年齢")
        events.append(
            {
                "title": title,
                "date": date_prop["start"][:10],
                "facility_name": _rich_text(props, "施設名"),
                "category": _select(props, "種別"),
                "age": age,
                "memo": _rich_text(props, "メモ"),
                "source": _rich_text(props, "情報源"),
            }
        )
    events.sort(key=lambda e: e["date"])
    return events


def build_facilities(client: Client) -> list[dict]:
    pages = _query_all(client, FACILITIES_DATA_SOURCE_ID)
    facilities = []
    for page in pages:
        props = page["properties"]
        facilities.append(
            {
                "name": _title(props),
                "type": _select(props, "施設種別"),
                "support_name": _rich_text(props, "子育て支援名称"),
                "salon_name": _rich_text(props, "子育てサロン名称"),
                "address": _rich_text(props, "住所"),
                "phone": _phone(props, "電話番号"),
                "furea_day": _rich_text(props, "親子ふれあい保育_曜日"),
                "furea_time": _rich_text(props, "親子ふれあい保育_時間"),
                "sono_day": _rich_text(props, "園庭開放_曜日"),
                "sono_time": _rich_text(props, "園庭開放_時間"),
                "sodan_day": _rich_text(props, "育児相談_曜日"),
                "sodan_time": _rich_text(props, "育児相談_時間"),
                "koala_day": _rich_text(props, "こあらクラブ_曜日"),
                "source_url": _url(props, "情報源URL"),
                "lat": _number(props, "緯度"),
                "lng": _number(props, "経度"),
            }
        )
    facilities.sort(key=lambda f: (f["type"] or "", f["name"]))
    return facilities


def main() -> None:
    client = _client()
    print("イベントを取得中...")
    events = build_events(client)
    print(f"  {len(events)}件")
    print("施設マスタを取得中...")
    facilities = build_facilities(client)
    print(f"  {len(facilities)}件")

    data = {
        "generated_at": datetime.now(JST).isoformat(),
        "events": events,
        "facilities": facilities,
    }

    out_path = os.path.join(os.path.dirname(__file__), "data.json")
    with open(out_path, "w", encoding="utf-8") as f:
        json.dump(data, f, ensure_ascii=False, indent=2)
    print(f"書き出し完了: {out_path}")


if __name__ == "__main__":
    main()
