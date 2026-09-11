"""渋川市「子育て応援なび」イベント一覧ページの新着監視・Notion差分登録。

情報源: https://www.city.shibukawa.lg.jp/kosodate-site/kosodate/000437/000446/000448/index.html

毎月10日・20日・30日にGitHub Actionsから実行される（.github/workflows/sync-events.yml）。
このページは子育てサロンPDF（sync_events.py）と違い【開催日】のような構造化欄がなく、
日付が本文中に自由記述（期間表記・記載なし等）でばらつくため機械的な抽出は行わない。
新規に見つかった項目は「日付なし・確認状況＝未確認」でNotionに仮登録し、人が詳細ページを
確認して日付を入力し「確認済み」に変更するまで公開サイトには表示されない
（fetch_data.py 側で日付未設定のレコードを除外するため）。

使い方:
    python sync_city_events.py          # 抽出結果と、Notion既存データとの差分（新規/重複）を表示するだけ
    python sync_city_events.py --apply  # 新規分のみNotionに書き込む
"""
import os
import re
import sys
from dataclasses import dataclass
from urllib.parse import urljoin

import requests
from dotenv import load_dotenv
from notion_client import Client

load_dotenv(os.path.join(os.path.dirname(__file__), "..", ".env"))

LIST_PAGE_URL = "https://www.city.shibukawa.lg.jp/kosodate-site/kosodate/000437/000446/000448/index.html"
EVENTS_DATA_SOURCE_ID = "8c2569b7-c5ed-4613-8625-005f7c28f7ba"  # 子育てイベント一覧
DEFAULT_CATEGORY = "その他"

# 既に完了・終了したことを報告するだけの記事は「新着イベント」として登録する意味がないため除外する
_PAST_TENSE_MARKERS = ("を開催しました", "終了しました")

_UNIT_PATTERN = re.compile(
    r'<div class="genre-contents-unit[^"]*">.*?'
    r'<a class="genre-contents-title" href="([^"]+)"[^>]*><span>([^<]*)</span></a>'
    r'(?P<office>.*?)'
    r'<div class="genre-contents-headline">(?P<headline>.*?)</div>',
    re.DOTALL,
)
_TAG_PATTERN = re.compile(r"<[^>]+>")


@dataclass
class CityEvent:
    title: str
    url: str
    office: str
    headline: str

    @property
    def key(self) -> str:
        """Notion上の重複判定キー（情報源URL）。"""
        return self.url


def _strip_tags(html: str) -> str:
    return _TAG_PATTERN.sub("", html).strip()


def fetch_and_parse() -> list[CityEvent]:
    resp = requests.get(LIST_PAGE_URL, timeout=30)
    resp.raise_for_status()
    resp.encoding = "utf-8"
    html = resp.text

    events: list[CityEvent] = []
    for m in _UNIT_PATTERN.finditer(html):
        href, title, office_html, headline_html = m.group(1), m.group(2), m.group("office"), m.group("headline")
        if any(marker in title for marker in _PAST_TENSE_MARKERS):
            continue
        url = urljoin(LIST_PAGE_URL, href)
        # 部署名は division/section/charge のうち最後（最も具体的な係・担当）を優先
        office_names = re.findall(r"<a[^>]*>([^<]*)</a>", office_html)
        office = office_names[-1] if office_names else ""
        headline = _strip_tags(headline_html)
        events.append(CityEvent(title=title.strip(), url=url, office=office, headline=headline))
    return events


def _client() -> Client:
    token = os.environ.get("NOTION_TOKEN")
    if not token:
        sys.exit("NOTION_TOKEN が設定されていません（.env を確認してください）")
    return Client(auth=token)


def fetch_existing_sources(client: Client) -> set[str]:
    """Notion「子育てイベント一覧」に既に登録済みの情報源URLを全件取得する。"""
    sources: set[str] = set()
    cursor = None
    while True:
        kwargs = {"data_source_id": EVENTS_DATA_SOURCE_ID, "page_size": 100}
        if cursor:
            kwargs["start_cursor"] = cursor
        resp = client.data_sources.query(**kwargs)
        for page in resp["results"]:
            source = _plain_text(page["properties"].get("情報源"))
            if source:
                sources.add(source)
        if not resp.get("has_more"):
            break
        cursor = resp.get("next_cursor")
    return sources


def _plain_text(prop) -> str:
    if not prop:
        return ""
    return "".join(t["plain_text"] for t in prop.get("rich_text", []))


def create_event_page(client: Client, event: CityEvent) -> None:
    memo = event.headline or "（詳細ページの本文を確認してください）"
    client.pages.create(
        parent={"type": "data_source_id", "data_source_id": EVENTS_DATA_SOURCE_ID},
        properties={
            "イベント名": {"title": [{"text": {"content": event.title}}]},
            "施設名": {"rich_text": [{"text": {"content": event.office}}]},
            "種別": {"select": {"name": DEFAULT_CATEGORY}},
            "情報源": {"rich_text": [{"text": {"content": event.url}}]},
            "メモ": {"rich_text": [{"text": {"content": memo}}]},
            "確認状況": {"select": {"name": "未確認"}},
        },
    )


def sync_new_events(apply: bool) -> None:
    parsed = fetch_and_parse()
    client = _client()
    existing_sources = fetch_existing_sources(client)

    new_events = [e for e in parsed if e.key not in existing_sources]
    skipped = len(parsed) - len(new_events)

    print(f"抽出件数: {len(parsed)}件（うちNotion既存と重複: {skipped}件 / 新規: {len(new_events)}件）\n")
    for e in new_events:
        print(f"{'[追加]' if apply else '[新規・未登録]'} {e.title}  ({e.office})  {e.url}")

    if not apply:
        print("\n新規イベントはありません。" if not new_events else "\n実際にNotionへ書き込むには --apply を付けて実行してください。")
        return

    for e in new_events:
        create_event_page(client, e)

    if new_events:
        print(f"\n{len(new_events)}件を「日付なし・確認状況＝未確認」でNotionに登録しました。")
        print("公開サイトには反映されません。Notion側で詳細ページを確認のうえ日付を入力し「確認済み」に変更してください。")
    else:
        print("\n新規イベントはありません。")


if __name__ == "__main__":
    sync_new_events(apply="--apply" in sys.argv)
