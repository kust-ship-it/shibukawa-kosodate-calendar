"""渋川市 子育てサロン8地区PDFの自動取得・パース・Notion差分登録。

情報源: https://www.city.shibukawa.lg.jp/kosodate-site/kosodate/000454/000456/p015023.html

毎月10日・20日・30日にGitHub Actionsから実行される（.github/workflows/sync-events.yml）。
新規イベントは「確認状況＝未確認」でNotionに仮登録し、人がレビューして「確認済み」に
変更するまで公開サイトには表示されない（fetch_data.py 側でフィルタ）。

対象は施設マスタの情報源URL監査で「直接パース可能」と確認できた8地区の公民館サロンのみ。
スキャン画像PDFのおたより等、OCRが必要なものは対象外（誤登録リスクが高いため）。

使い方:
    python sync_events.py          # 抽出結果と、Notion既存データとの差分（新規/重複）を表示するだけ
    python sync_events.py --apply  # 新規分のみNotionに書き込む
"""
import io
import os
import re
import sys
import unicodedata
from dataclasses import dataclass

import pdfplumber
import requests
from dotenv import load_dotenv
from notion_client import Client

load_dotenv(os.path.join(os.path.dirname(__file__), "..", ".env"))

LIST_PAGE_URL = "https://www.city.shibukawa.lg.jp/kosodate-site/kosodate/000454/000456/p015023.html"
EVENTS_DATA_SOURCE_ID = "8c2569b7-c5ed-4613-8625-005f7c28f7ba"  # 子育てイベント一覧
DEFAULT_AGE = "🌈 0歳〜就学前まで幅広く"

# 地区名 → (施設マスタDB内の該当ページID, 施設名表示用テキスト)（既存レコードを手動で確認して対応付け）
DISTRICT_TO_FACILITY = {
    "あじさい": ("3c3882af-a4c1-81e4-9848-ecf0f7e2c4c9", "渋川中央公民館"),
    "せいぶ": ("3c3882af-a4c1-81ac-9f53-c464106aa920", "渋川西部公民館"),
    "ふるまき": ("3c3882af-a4c1-8122-b737-d44050f9734f", "古巻公民館"),
    "とよあき": ("3c3882af-a4c1-815d-9058-fc210caf2c30", "豊秋公民館"),
    "かなしま": ("3c3882af-a4c1-81d8-8d08-d4e01e96547c", "金島公民館"),
    "すくすく広場": ("3c3882af-a4c1-81d2-a771-d1dac698501f", "赤城公民館ほか"),
    "こもち": ("3c3882af-a4c1-810b-bf50-e94041f277aa", "子持公民館"),
    "きたたちばな": ("3c3882af-a4c1-817c-81a3-eff608c5519a", "北橘公民館"),
}

_MONTH_LINE = re.compile(r"^(\d{1,2})\s*月\s*(?:(\d{1,2})\s*日(?:\((.)\))?)?\s*(.*)$")
_HOLIDAY_WORDS = ("お休み", "おやすみ")
_STOP_MARKERS = ("【問合せ】", "【問い合わせ】", "【主催】", "【主 催】")


@dataclass
class SalonEvent:
    district: str
    facility_page_id: str
    facility_name: str
    date: str  # ISO YYYY-MM-DD
    name: str
    source_url: str

    @property
    def key(self) -> tuple[str, str]:
        """Notion上の重複判定キー（情報源URL, 日付）。"""
        return (self.source_url, self.date)


def _to_halfwidth(text: str) -> str:
    return unicodedata.normalize("NFKC", text)


def list_district_pdfs() -> list[dict]:
    """PDF一覧ページから地区名とPDFの絶対URLを取得する。"""
    resp = requests.get(LIST_PAGE_URL, timeout=30)
    resp.raise_for_status()
    resp.encoding = "utf-8"  # サーバーがCharsetヘッダーを返さずrequestsの自動判定が化けるため明示指定
    html = resp.text

    pattern = re.compile(
        r'href="([^"]*?\.pdf)"[^>]*>\s*(?:<img[^>]*>)?\s*([^<]*)'
    )
    results = []
    for href, label in pattern.findall(html):
        m = re.search(r"子育てサロン・(\S+?)\(pdf", label)
        if not m:
            continue  # ガイドPDFなど地区別以外は除外
        district = m.group(1)
        if district not in DISTRICT_TO_FACILITY:
            continue
        abs_url = requests.compat.urljoin(LIST_PAGE_URL, href)
        results.append({"district": district, "url": abs_url})
    return results


def fetch_fiscal_year(text: str) -> int:
    """PDF本文の「令和N年度」から西暦の年度開始年を返す（例: 令和8年度→2026）。"""
    m = re.search(r"令和\s*(\d+)\s*年度", text)
    if not m:
        raise ValueError("年度表記が見つかりませんでした")
    return 2018 + int(m.group(1))


def parse_events(text: str, district: str, source_url: str) -> list[SalonEvent]:
    facility_page_id, facility_name = DISTRICT_TO_FACILITY[district]
    fiscal_year = fetch_fiscal_year(text)
    normalized = _to_halfwidth(text)

    events: list[SalonEvent] = []
    current = None  # (month, day, name_parts)
    in_schedule = False

    for raw_line in normalized.splitlines():
        line = raw_line.strip()
        if not line:
            continue

        if line.startswith("【開催日】"):
            in_schedule = True
            continue
        if any(line.startswith(marker) for marker in _STOP_MARKERS):
            in_schedule = False
            if current:
                events.append(_finalize(current, district, facility_page_id, facility_name, fiscal_year, source_url))
                current = None
            continue
        if not in_schedule:
            continue

        m = _MONTH_LINE.match(line)
        if m:
            if current:
                events.append(_finalize(current, district, facility_page_id, facility_name, fiscal_year, source_url))
                current = None
            month, day, _weekday, rest = m.groups()
            if day is None or any(w in rest for w in _HOLIDAY_WORDS):
                continue  # お休みの月、または日付なしの月は行事なし
            current = [int(month), int(day), [rest] if rest else []]
        elif current:
            current[2].append(line)

    if current:
        events.append(_finalize(current, district, facility_page_id, facility_name, fiscal_year, source_url))

    return events


def _finalize(current, district, facility_page_id, facility_name, fiscal_year, source_url) -> SalonEvent:
    month, day, name_parts = current
    year = fiscal_year if month >= 4 else fiscal_year + 1
    name = " ".join(p.strip() for p in name_parts if p.strip()) or "子育てサロン"
    return SalonEvent(
        district=district,
        facility_page_id=facility_page_id,
        facility_name=facility_name,
        date=f"{year:04d}-{month:02d}-{day:02d}",
        name=f"子育てサロン {district}：{name}",
        source_url=source_url,
    )


def fetch_and_parse_all() -> list[SalonEvent]:
    all_events: list[SalonEvent] = []
    for entry in list_district_pdfs():
        resp = requests.get(entry["url"], timeout=30)
        resp.raise_for_status()
        with pdfplumber.open(io.BytesIO(resp.content)) as pdf:
            text = "\n".join(page.extract_text() or "" for page in pdf.pages)
        all_events.extend(parse_events(text, entry["district"], entry["url"]))
    return all_events


def _client() -> Client:
    token = os.environ.get("NOTION_TOKEN")
    if not token:
        sys.exit("NOTION_TOKEN が設定されていません（.env を確認してください）")
    return Client(auth=token)


def fetch_existing_keys(client: Client) -> set[tuple[str, str]]:
    """Notion「子育てイベント一覧」に既に登録済みの(情報源, 日付)の組を全件取得する。"""
    keys: set[tuple[str, str]] = set()
    cursor = None
    while True:
        kwargs = {"data_source_id": EVENTS_DATA_SOURCE_ID, "page_size": 100}
        if cursor:
            kwargs["start_cursor"] = cursor
        resp = client.data_sources.query(**kwargs)
        for page in resp["results"]:
            props = page["properties"]
            source = _plain_text(props.get("情報源"))
            date = (props.get("日付") or {}).get("date") or {}
            start = date.get("start")
            if source and start:
                keys.add((source, start[:10]))
        if not resp.get("has_more"):
            break
        cursor = resp.get("next_cursor")
    return keys


def _plain_text(prop) -> str:
    if not prop:
        return ""
    return "".join(t["plain_text"] for t in prop.get("rich_text", []))


def create_event_page(client: Client, event: SalonEvent) -> None:
    client.pages.create(
        parent={"type": "data_source_id", "data_source_id": EVENTS_DATA_SOURCE_ID},
        properties={
            "イベント名": {"title": [{"text": {"content": event.name}}]},
            "日付": {"date": {"start": event.date}},
            "施設": {"relation": [{"id": event.facility_page_id}]},
            "施設名": {"rich_text": [{"text": {"content": event.facility_name}}]},
            "種別": {"select": {"name": "サロン(乳幼児対象)"}},
            "対象年齢": {"select": {"name": DEFAULT_AGE}},
            "情報源": {"rich_text": [{"text": {"content": event.source_url}}]},
            "確認状況": {"select": {"name": "未確認"}},
        },
    )


def sync_new_events(apply: bool) -> None:
    parsed = fetch_and_parse_all()
    client = _client()
    existing_keys = fetch_existing_keys(client)

    new_events = [e for e in parsed if e.key not in existing_keys]
    skipped = len(parsed) - len(new_events)

    print(f"抽出イベント数: {len(parsed)}件（うちNotion既存と重複: {skipped}件 / 新規: {len(new_events)}件）\n")
    for e in sorted(new_events, key=lambda x: x.date):
        print(f"{'[追加]' if apply else '[新規・未登録]'} {e.date}  [{e.district}]  {e.name}")

    if not new_events:
        print("\n新規イベントはありません。")
        return

    if not apply:
        print("\n実際にNotionへ書き込むには --apply を付けて実行してください。")
        return

    for e in new_events:
        create_event_page(client, e)
    print(f"\n{len(new_events)}件を「確認状況＝未確認」でNotionに登録しました。公開サイトには反映されません。Notion側で内容を確認し「確認済み」に変更してください。")


if __name__ == "__main__":
    sync_new_events(apply="--apply" in sys.argv)
