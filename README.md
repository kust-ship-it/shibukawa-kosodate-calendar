# 渋川子育てカレンダー（閲覧用サイト）

Notionで管理している「子育てイベント一覧」「施設マスタ」を元に、
スマホでの閲覧に最適化した軽量な静的サイトを表示します。

データはNotion側を編集すると、GitHub Actionsが1日3回（6:00 / 12:00 / 18:00）
自動的に取り込んで反映します。今すぐ反映したい場合は、GitHubの
「Actions」タブから「Deploy site」ワークフローを手動実行（Run workflow）
してください。

## 構成

- `index.html` / `style.css` / `app.js` — 表示側（フレームワークなし）
- `fetch_data.py` — Notion APIからデータを取得し `data.json` を生成するスクリプト
- `.github/workflows/deploy.yml` — 自動取得・自動デプロイの設定

## ローカルで確認する場合

```
pip install -r requirements.txt
NOTION_TOKEN=xxxx python fetch_data.py
python -m http.server 8765
```

その後 `http://localhost:8765/` を開く。
