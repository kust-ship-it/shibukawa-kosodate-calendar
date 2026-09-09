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
FACILITY_TIPS_DATA_SOURCE_ID = "1ce82fc4-550e-428c-9ad5-9f3ebe8e5330"
COMMUNITY_EVENTS_DATA_SOURCE_ID = "2aa1ec50-6857-4287-bfba-c68f22e45609"
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


def build_events(client: Client, facility_types_by_id: dict[str, str] | None = None) -> list[dict]:
    # 施設名（テキスト）は「施設名（子育て支援名称）」のような合成表記のことが多く
    # 施設マスタのタイトルと文字列一致しないため、「施設」relationのページIDで引く。
    facility_types_by_id = facility_types_by_id or {}
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
        facility_name = _rich_text(props, "施設名")
        facility_relation = (props.get("施設") or {}).get("relation") or []
        facility_id = facility_relation[0]["id"] if facility_relation else None
        facility_type = facility_types_by_id.get(facility_id, "") if facility_id else ""
        category = _select(props, "種別")
        # 公民館の「子育てサロン」は民生委員児童委員協議会等が主催する公的な子育て支援活動で、
        # 施設が主催する他の「子育て支援」種別（こあらクラブ等）とは呼び分ける。色は変えない。
        label = "子育てサロン" if category == "サロン(乳幼児対象)" else "子育て支援"
        events.append(
            {
                "title": title,
                "date": date_prop["start"][:10],
                "facility_name": facility_name,
                "facility_id": facility_id,
                "facility_type": facility_type,
                "category": category,
                "age": age,
                "memo": _rich_text(props, "メモ"),
                "source": _rich_text(props, "情報源"),
                "badge": "子育て支援",
                "label": label,
            }
        )
    events.sort(key=lambda e: e["date"])
    return events


def build_community_events(client: Client) -> list[dict]:
    """主催者向け投稿フォーム経由のイベントのうち、レビュー状況＝承認済み・
    掲載種別＝イベントのものだけを公開用に整形する。お店情報は対象外
    （日付を持たずカレンダーに乗せられないため、別途の反映方法を検討中）。
    """
    pages = _query_all(client, COMMUNITY_EVENTS_DATA_SOURCE_ID)
    events = []
    for page in pages:
        props = page["properties"]
        if _select(props, "レビュー状況") != "承認済み":
            continue
        if _select(props, "掲載種別") != "イベント":
            continue
        date_prop = props.get("日付", {}).get("date")
        if not date_prop or not date_prop.get("start"):
            continue  # 開催日未記入のイベントはカレンダーに出せないため除外
        events.append(
            {
                "title": _title(props),
                "date": date_prop["start"][:10],
                "facility_name": "",
                "facility_id": None,
                "organizer": _rich_text(props, "主催者・店舗名"),
                "location": _rich_text(props, "開催場所"),
                "category": "",
                "age": "",
                "memo": _rich_text(props, "詳細"),
                "source": _rich_text(props, "連絡先・SNS"),
                "badge": "イベント",
                "label": "イベント",
            }
        )
    return events


def build_facility_types_by_id(client: Client) -> dict[str, str]:
    """施設マスタのページID→施設種別の対応表（イベント側の「施設」relationを引くため）。"""
    pages = _query_all(client, FACILITIES_DATA_SOURCE_ID)
    return {page["id"]: _select(page["properties"], "施設種別") for page in pages}


def build_facilities(client: Client) -> list[dict]:
    pages = _query_all(client, FACILITIES_DATA_SOURCE_ID)
    facilities = []
    for page in pages:
        props = page["properties"]
        facilities.append(
            {
                "id": page["id"],
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
                "source_type": _select(props, "情報源種別"),
                "lat": _number(props, "緯度"),
                "lng": _number(props, "経度"),
            }
        )
    facilities.sort(key=lambda f: (f["type"] or "", f["name"]))
    return facilities


def build_facility_tips(client: Client) -> dict[str, list[dict]]:
    """「施設情報提供」フォームの投稿のうち、レビュー状況＝反映済みのものだけを
    対象施設名ごとにまとめる。連絡先は運営者だけが見る情報なので公開データには含めない。
    """
    pages = _query_all(client, FACILITY_TIPS_DATA_SOURCE_ID)
    tips: dict[str, list[dict]] = {}
    for page in pages:
        props = page["properties"]
        if _select(props, "レビュー状況") != "反映済み":
            continue
        facility_name = _title(props)
        if not facility_name:
            continue
        tips.setdefault(facility_name, []).append(
            {
                "info": _rich_text(props, "提供情報"),
                "photo_url": _url(props, "写真URL"),
            }
        )
    return tips


def main() -> None:
    client = _client()
    print("施設マスタを取得中...")
    facilities = build_facilities(client)
    print(f"  {len(facilities)}件")
    facility_types_by_id = build_facility_types_by_id(client)

    print("イベントを取得中...")
    events = build_events(client, facility_types_by_id)
    print(f"  {len(events)}件")
    print("地域イベント（承認済み）を取得中...")
    community_events = build_community_events(client)
    events.extend(community_events)
    events.sort(key=lambda e: e["date"])
    print(f"  {len(community_events)}件")
    print("施設情報提供（反映済み）を取得中...")
    tips = build_facility_tips(client)
    for f in facilities:
        f["community_tips"] = tips.get(f["name"], [])
    print(f"  {sum(len(v) for v in tips.values())}件")

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
