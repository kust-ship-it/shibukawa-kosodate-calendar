// 渋川子育てカレンダー - 静的サイト用スクリプト（フレームワークなし・vanilla JS）

const WEEKDAY_JA = ["日", "月", "火", "水", "木", "金", "土"];

function todayStr() {
  // ブラウザのローカル時刻をそのまま使う（想定利用者は日本国内）
  return toIsoDate(new Date());
}

function dateFromStr(s) {
  const [y, m, d] = s.split("-").map(Number);
  return new Date(y, m - 1, d);
}

function toIsoDate(d) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function formatDateLabel(s) {
  const d = dateFromStr(s);
  return `${d.getMonth() + 1}/${d.getDate()}（${WEEKDAY_JA[d.getDay()]}）`;
}

function rangeFor(kind) {
  const today = dateFromStr(todayStr());
  if (kind === "today") {
    return [today, today];
  }
  if (kind === "week") {
    // 月曜始まり
    const dow = today.getDay(); // 0=日
    const mondayOffset = dow === 0 ? -6 : 1 - dow;
    const monday = new Date(today);
    monday.setDate(today.getDate() + mondayOffset);
    const sunday = new Date(monday);
    sunday.setDate(monday.getDate() + 6);
    return [monday, sunday];
  }
  // month
  const first = new Date(today.getFullYear(), today.getMonth(), 1);
  const last = new Date(today.getFullYear(), today.getMonth() + 1, 0);
  return [first, last];
}

function inRange(dateStr, [start, end]) {
  const d = dateFromStr(dateStr);
  return d >= start && d <= end;
}

function renderSource(source) {
  if (!source) return "";
  if (source.startsWith("http")) {
    return `<a class="source-link" href="${escapeHtml(source)}" target="_blank" rel="noopener">情報源</a>`;
  }
  return `<span class="source-paper">📄 ${escapeHtml(source)}</span>`;
}

function escapeHtml(s) {
  return s.replace(/[&<>"']/g, (c) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
  }[c]));
}

const FAVORITES_KEY = "shibukawa_kosodate_favorite_facilities";

function getFavorites() {
  try {
    const raw = localStorage.getItem(FAVORITES_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch (err) {
    return [];
  }
}

function isFavorite(name) {
  return getFavorites().includes(name);
}

function toggleFavorite(name) {
  const favs = getFavorites();
  const idx = favs.indexOf(name);
  if (idx >= 0) {
    favs.splice(idx, 1);
  } else {
    favs.push(name);
  }
  localStorage.setItem(FAVORITES_KEY, JSON.stringify(favs));
}

function emptyState() {
  return `<div class="empty-state">
    <p>この条件に当てはまる予定はまだありません。</p>
    <button type="button" class="empty-state-link" data-goto-facilities>日頃から利用できる施設をさがす</button>
  </div>`;
}

const AGE_LABELS = {
  "🍼 0歳中心": "0歳中心",
  "👶 0〜2歳中心": "0〜2歳",
  "🧒 3歳〜就学前中心": "3歳〜就学前",
  "🌈 0歳〜就学前まで幅広く": "0歳〜就学前（幅広く対象）",
};

function ageBadge(age) {
  if (!age) return "";
  const label = AGE_LABELS[age] || age;
  return `<span class="age-badge">${escapeHtml(label)}</span>`;
}

// 施設マスタの「◯曜」「◯・◯」「◯〜◯」表記の曜日データを、実際の曜日集合に変換する。
// （こあらクラブは個別イベントとして日付ごとに登録済みのため、ここでは対象にしない）
const WEEKDAY_RANGE_ORDER = ["月", "火", "水", "木", "金", "土", "日"];

function parseWeekdaySet(str) {
  const days = new Set();
  if (!str) return days;
  // 「（毎週水曜休み等）」のような補足の丸カッコ書き（全角・半角）は曜日抽出の対象から除く
  const cleaned = str.replace(/[（(][^）)]*[）)]/g, "").replace(/曜/g, "");
  for (const part of cleaned.split("・")) {
    if (!part) continue;
    if (part.includes("〜")) {
      const [from, to] = part.split("〜");
      const fromIdx = WEEKDAY_RANGE_ORDER.indexOf(from);
      const toIdx = WEEKDAY_RANGE_ORDER.indexOf(to);
      if (fromIdx >= 0 && toIdx >= 0) {
        if (fromIdx <= toIdx) {
          for (let i = fromIdx; i <= toIdx; i++) days.add(WEEKDAY_RANGE_ORDER[i]);
        } else {
          // 週をまたぐ範囲（例：木〜火 = 木・金・土・日・月・火）
          for (let i = fromIdx; i < 7; i++) days.add(WEEKDAY_RANGE_ORDER[i]);
          for (let i = 0; i <= toIdx; i++) days.add(WEEKDAY_RANGE_ORDER[i]);
        }
      }
    } else if (WEEKDAY_RANGE_ORDER.includes(part)) {
      days.add(part);
    }
  }
  return days;
}

function facilityOpenWeekdays(f) {
  const days = new Set();
  for (const raw of [f.furea_day, f.sono_day, f.sodan_day, f.kaikan_day]) {
    for (const d of parseWeekdaySet(raw)) days.add(d);
  }
  return days;
}

// その日すでにカード表示されている施設は「ほかに開いている場所」に重複表示しない。
// カレンダー側イベントの「施設」relation IDと施設マスタのページIDを直接比較する
// （施設名テキストの部分一致には頼らない）。
function facilitiesOpenOn(dateStr, facilities, dayOfficialFacilityIds) {
  const weekday = WEEKDAY_JA[dateFromStr(dateStr).getDay()];
  return facilities
    .filter((f) => facilityOpenWeekdays(f).has(weekday))
    .filter((f) => !dayOfficialFacilityIds.has(f.id))
    .sort((a, b) => a.name.localeCompare(b.name, "ja"));
}

function openFacilitiesRow(list, hasEventsAbove) {
  if (list.length === 0) return "";
  const chips = list
    .map((f) => {
      const group = facilityGroupFor(f.type);
      const cls = FACILITY_GROUP_BADGE_CLASS[group];
      return `<button type="button" class="open-facility-chip type-badge ${cls}" data-facility-id="${escapeHtml(f.id)}">${facilityGroupIcon(group)}${escapeHtml(f.name)}</button>`;
    })
    .join("");
  return `
    <div class="open-facilities${hasEventsAbove ? " has-events-above" : ""}">
      <span class="open-facilities-label">ほかに開いている場所</span>
      <div class="open-facilities-list">${chips}</div>
    </div>`;
}

function renderEvents(events, facilities, rangeKind, filters) {
  const container = document.getElementById("event-list");
  const range = rangeFor(rangeKind);
  const favorites = getFavorites();
  const filtered = events.filter((e) => {
    if (!inRange(e.date, range)) return false;
    if (filters.facility && e.facility_name !== filters.facility) return false;
    if (filters.age && e.age !== filters.age) return false;
    if (filters.mode === "favorite") {
      return e.badge === "子育て支援" && favorites.includes(e.facility_name);
    }
    if (filters.mode === "event") {
      return e.badge === "イベント";
    }
    return true;
  });

  // 日付ごとに1つの枠でくくり、その日の予定は件数によらず同じ書式で並べる
  // （特定の施設・イベントだけを大きく見せる扱いの差をつけない）。
  const byDate = {};
  for (const e of filtered) {
    (byDate[e.date] ||= []).push(e);
  }

  // 特別企画がない日でも「常時開いている施設」は選択肢に出す（施設フィルタ・地域イベントモード時は対象外）
  const showOpenFacilities = filters.mode === "all" && !filters.facility;

  const entries = [];
  if (showOpenFacilities) {
    const [start, end] = range;
    const cursor = new Date(start);
    while (cursor <= end) {
      const date = toIsoDate(cursor);
      const dayEvents = byDate[date] || [];
      const officialIds = new Set(
        dayEvents.filter((e) => e.badge === "子育て支援" && e.facility_id).map((e) => e.facility_id)
      );
      const openFacilities = facilitiesOpenOn(date, facilities, officialIds);
      if (dayEvents.length > 0 || openFacilities.length > 0) {
        entries.push({ date, dayEvents, openFacilities });
      }
      cursor.setDate(cursor.getDate() + 1);
    }
  } else {
    for (const date of Object.keys(byDate).sort()) {
      entries.push({ date, dayEvents: byDate[date], openFacilities: [] });
    }
  }

  if (entries.length === 0) {
    container.innerHTML = emptyState();
    return;
  }

  container.innerHTML = entries
    .map(({ date, dayEvents, openFacilities }) => {
      const rows = dayEvents.map((e) => eventRow(e)).join("");
      return `
        <div class="date-group">
          <div class="date-group-header">${escapeHtml(formatDateLabel(date))}</div>
          ${rows ? `<div class="date-group-body">${rows}</div>` : ""}
          ${openFacilitiesRow(openFacilities, Boolean(rows))}
        </div>`;
    })
    .join("");
}

function eventRow(e) {
  const isOfficial = e.badge === "子育て支援";
  const dotClass = isOfficial ? "dot-official" : "dot-community";
  const labelClass = isOfficial ? "label-official" : "label-community";
  const titleColor = isOfficial ? "var(--river-deep)" : "var(--mtn-deep)";
  const placeLine = isOfficial
    ? e.facility_name
    : [e.organizer, e.location].filter(Boolean).join(" ／ ");
  // 施設一覧と同じロジック・同じ配色を再利用し、二重管理を避ける
  const facilityGroup = isOfficial && e.facility_type ? facilityGroupFor(e.facility_type) : null;
  const placeClass = facilityGroup
    ? `type-badge type-badge-inline ${FACILITY_GROUP_BADGE_CLASS[facilityGroup]}`
    : "event-place";
  const placeIcon = facilityGroup ? facilityGroupIcon(facilityGroup) : "";
  // 施設が特定できる場合のみ、ラベル自体を「ほかに開いている場所」と同じジャンプ機能のタップ対象にする
  const isJumpable = Boolean(facilityGroup && e.facility_id);
  const placeTag = isJumpable
    ? `<button type="button" class="${placeClass} facility-jump-chip" data-facility-id="${escapeHtml(e.facility_id)}">${placeIcon}${escapeHtml(placeLine)}</button>`
    : `<span class="${placeClass}">${placeIcon}${escapeHtml(placeLine)}</span>`;
  const hasMeta = Boolean(placeLine || e.age || e.source);
  return `
    <div class="event-row">
      <div class="event-row-main">
        <span class="event-dot ${dotClass}" aria-hidden="true"></span>
        <span class="event-label ${labelClass}">${escapeHtml(e.label || e.badge)}</span>
        <span class="event-title hw" style="color:${titleColor}">${escapeHtml(e.title)}</span>
      </div>
      ${
        hasMeta
          ? `<div class="event-row-meta">
        ${placeLine ? placeTag : ""}
        ${ageBadge(e.age)}
        ${renderSource(e.source)}
      </div>`
          : ""
      }
    </div>`;
}

function programRow(label, day, time) {
  if (!day && !time) return "";
  return `<div class="program-row"><span class="label">${label}</span>${escapeHtml(day)} ${escapeHtml(time)}</div>`;
}

const TYPE_COLOR = {
  "私立": "#e8836b",
  "公立": "#4a90a4",
  "公民館": "#f0a500",
  "公共の遊び場": "#8e44ad",
};

function renderMap(facilities) {
  const el = document.getElementById("facility-map");
  const points = facilities.filter((f) => typeof f.lat === "number" && typeof f.lng === "number");
  if (points.length === 0 || typeof L === "undefined") {
    el.style.display = "none";
    return null;
  }

  const map = L.map(el, { scrollWheelZoom: false });
  L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
    maxZoom: 19,
  }).addTo(map);

  const markers = points.map((f) => {
    const color = TYPE_COLOR[f.type] || "#888";
    const marker = L.circleMarker([f.lat, f.lng], {
      radius: 8,
      color,
      fillColor: color,
      fillOpacity: 0.85,
      weight: 2,
    }).addTo(map);
    const phone = f.phone ? `<br>📞 ${escapeHtml(f.phone)}` : "";
    marker.bindPopup(`<b>${escapeHtml(f.name)}</b>${escapeHtml(f.type || "")}${phone}`);
    return marker;
  });

  const group = L.featureGroup(markers);
  map.fitBounds(group.getBounds().pad(0.15));
  return map;
}

// 市の公式お知らせと同じ並び順（公共の遊び場→保育園・幼稚園→公民館）に揃える。
// 私立・公立は「保育園・幼稚園」として統合表示する。
const FACILITY_GROUP_ORDER = ["公共の遊び場", "保育園・幼稚園", "公民館"];
const FACILITY_GROUP_BADGE_CLASS = {
  "公共の遊び場": "type-support",
  "保育園・幼稚園": "type-childcare",
  "公民館": "type-community",
};

function facilityGroupFor(type) {
  if (type === "私立" || type === "公立") return "保育園・幼稚園";
  if (type === "公民館") return "公民館";
  // 公共の遊び場（子育て支援センター・キッズランド・だれでも広場等）はここに合流する
  return "公共の遊び場";
}

// 色だけに頼らず種別を判別できるよう、各ラベルの先頭に添えるアイコン（Tabler Icons outline）。
// stroke="currentColor"でラベルの文字色を継承する。
const FACILITY_GROUP_ICON = {
  "公共の遊び場": `<svg class="type-badge-icon" viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3 21l18 0" /><path d="M9 8l1 0" /><path d="M9 12l1 0" /><path d="M9 16l1 0" /><path d="M14 8l1 0" /><path d="M14 12l1 0" /><path d="M14 16l1 0" /><path d="M5 21v-16a2 2 0 0 1 2 -2h10a2 2 0 0 1 2 2v16" /></svg>`,
  "保育園・幼稚園": `<svg class="type-badge-icon" viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 12l-2 0l9 -9l9 9l-2 0" /><path d="M5 12v7a2 2 0 0 0 2 2h10a2 2 0 0 0 2 -2v-7" /><path d="M9 21v-6a2 2 0 0 1 2 -2h2a2 2 0 0 1 2 2v6" /></svg>`,
  "公民館": `<svg class="type-badge-icon" viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 7a4 4 0 1 0 8 0a4 4 0 1 0 -8 0" /><path d="M3 21v-2a4 4 0 0 1 4 -4h4a4 4 0 0 1 4 4v2" /><path d="M16 3.13a4 4 0 0 1 0 7.75" /><path d="M21 21v-2a4 4 0 0 0 -3 -3.85" /></svg>`,
};

function facilityGroupIcon(group) {
  return FACILITY_GROUP_ICON[group] || "";
}

// 「親子ふれあい保育」プログラムを実施している確認が取れなかった施設は、
// 曜日・時間データが「開館時間_曜日/時間」に入っている。どちらにデータが
// あるかでラベルを自動的に切り替える（両方に同時にデータが入ることは想定しない）。
function primaryProgramRow(f) {
  if (f.furea_day || f.furea_time) {
    return programRow("ふれあい保育", f.furea_day, f.furea_time);
  }
  if (f.kaikan_day || f.kaikan_time) {
    return programRow("開館時間", f.kaikan_day, f.kaikan_time);
  }
  return "";
}

function facilityCardHtml(f) {
  const displayName = escapeHtml(f.name);
  const subNames = [f.support_name, f.salon_name].filter(Boolean).map(escapeHtml).join(" / ");
  const programs = [
    primaryProgramRow(f),
    programRow("園庭開放", f.sono_day, f.sono_time),
    programRow("育児相談", f.sodan_day, f.sodan_time),
    programRow("こあらクラブ", f.koala_day, ""),
  ].join("");
  const communityTips = (f.community_tips || [])
    .map(
      (t) => `
        <div class="community-tip">
          📢 ${escapeHtml(t.info)}
          ${t.photo_url ? ` <a href="${escapeHtml(t.photo_url)}" target="_blank" rel="noopener">📷写真</a>` : ""}
        </div>`
    )
    .join("");
  const sourceInfo =
    f.source_type === "Web" && f.source_url
      ? `<div class="source"><a href="${escapeHtml(f.source_url)}" target="_blank" rel="noopener">🔗 詳しくはこちら</a></div>`
      : f.source_type === "紙媒体" && !communityTips
        ? `<div class="source-note">Web上に情報はありません。ご存じの方はお知らせください</div>`
        : "";
  const fav = isFavorite(f.name);
  const favLabel = fav ? "お気に入り登録済み" : "お気に入りに追加";
  return `
    <div class="facility-card" data-facility-name="${escapeHtml(f.name)}">
      <div class="facility-card-body">
        <div class="facility-head">
          <div class="facility-head-main">
            <span class="fname hw">${displayName}</span>
            ${subNames ? `<span class="support-name">${subNames}</span>` : ""}
          </div>
        </div>
        ${f.address ? `<div class="address">📍 ${escapeHtml(f.address)}</div>` : ""}
        ${programs ? `<div class="programs">${programs}</div>` : ""}
        ${f.phone ? `<div class="phone"><a href="tel:${f.phone.replace(/-/g, "")}">📞 ${f.phone}</a></div>` : ""}
        ${sourceInfo}
        ${communityTips}
        <button type="button" class="favorite-btn${fav ? " is-active" : ""}" data-facility="${escapeHtml(f.name)}" aria-label="${favLabel}（${displayName}）">
          <span class="star" aria-hidden="true">${fav ? "★" : "☆"}</span><span>${favLabel}</span>
        </button>
      </div>
    </div>`;
}

// カテゴリごとのアコーディオン開閉状態。初期状態はすべて閉じておく。
const facilityAccordionOpen = { "公共の遊び場": false, "保育園・幼稚園": false, "公民館": false };

function renderFacilities(facilities, filterState) {
  const container = document.getElementById("facility-groups");
  const groups = {};
  for (const f of facilities) {
    const g = facilityGroupFor(f.type);
    (groups[g] ||= []).push(f);
  }
  // 「公共の遊び場」は施設マスタの「表示順」昇順（未設定は末尾）、それ以外は施設名順に並べる。
  // 「保育園・幼稚園」は私立・公立を区別せず施設名順に混在させる。
  Object.entries(groups).forEach(([group, list]) => {
    if (group === "公共の遊び場") {
      list.sort((a, b) => {
        const orderA = a.display_order ?? Infinity;
        const orderB = b.display_order ?? Infinity;
        return orderA !== orderB ? orderA - orderB : a.name.localeCompare(b.name, "ja");
      });
    } else {
      list.sort((a, b) => a.name.localeCompare(b.name, "ja"));
    }
  });

  const query = (filterState.search || "").trim();
  const hasActiveFilter = Boolean(query) || Boolean(filterState.type) || Boolean(filterState.favoriteOnly);

  const sections = FACILITY_GROUP_ORDER.filter((type) => groups[type])
    .map((type) => {
      if (filterState.type && filterState.type !== type) return "";
      let list = groups[type];
      if (query) {
        list = list.filter(
          (f) => f.name.includes(query) || (f.support_name || "").includes(query) || (f.salon_name || "").includes(query)
        );
      }
      if (filterState.favoriteOnly) {
        list = list.filter((f) => isFavorite(f.name));
      }
      if (list.length === 0) return "";
      const cards = list.map((f) => facilityCardHtml(f)).join("");
      const heading = `
            <span class="facility-group-label">${facilityGroupIcon(type)}${type}</span>
            <span class="facility-group-count">${list.length}件</span>`;

      // フィルター適用中は該当カテゴリを強制的に開き、結果を隠さない
      const isOpen = hasActiveFilter ? true : Boolean(facilityAccordionOpen[type]);
      return `
        <details class="facility-type-group" data-group="${type}"${isOpen ? " open" : ""}>
          <summary class="facility-group-summary type-badge ${FACILITY_GROUP_BADGE_CLASS[type]}">${heading}</summary>
          <div class="facility-group-body">${cards}</div>
        </details>`;
    })
    .join("");

  container.innerHTML =
    sections.trim() || `<div class="empty-state"><p>この条件に当てはまる施設は見つかりませんでした。</p></div>`;

  container.querySelectorAll("details.facility-type-group").forEach((el) => {
    el.addEventListener("toggle", () => {
      facilityAccordionOpen[el.dataset.group] = el.open;
    });
  });
}

function populateFacilityFilter(events) {
  const select = document.getElementById("facility-filter");
  const names = [...new Set(events.map((e) => e.facility_name).filter(Boolean))].sort((a, b) =>
    a.localeCompare(b, "ja")
  );
  select.innerHTML =
    `<option value="">すべての施設</option>` +
    names.map((n) => `<option value="${escapeHtml(n)}">${escapeHtml(n)}</option>`).join("");
}

async function main() {
  const res = await fetch("data.json", { cache: "no-store" });
  const data = await res.json();

  const state = { range: "today", facility: "", age: "", mode: "all" };
  const rerender = () =>
    renderEvents(data.events, data.facilities, state.range, {
      facility: state.facility,
      age: state.age,
      mode: state.mode,
    });

  const facilityFilterState = { search: "", type: "", favoriteOnly: false };
  const rerenderFacilities = () => renderFacilities(data.facilities, facilityFilterState);

  rerender();
  const map = renderMap(data.facilities);
  rerenderFacilities();
  populateFacilityFilter(data.events);

  // 「予定を見る」／「施設をさがす」の画面切り替え。
  // 地図は非表示（display:none）の間に初期化されているため、施設タブを開くたびに
  // invalidateSize()でLeafletにコンテナサイズを再計算させないと表示が崩れる。
  function switchView(name) {
    document.getElementById("view-tab-events").classList.toggle("is-active", name === "events");
    document.getElementById("view-tab-facilities").classList.toggle("is-active", name === "facilities");
    document.getElementById("panel-events").classList.toggle("is-active", name === "events");
    document.getElementById("panel-facilities").classList.toggle("is-active", name === "facilities");
    if (name === "facilities" && map) {
      requestAnimationFrame(() => map.invalidateSize());
    }
  }
  document.getElementById("view-tab-events").addEventListener("click", () => switchView("events"));
  document.getElementById("view-tab-facilities").addEventListener("click", () => switchView("facilities"));

  document.querySelectorAll(".tab").forEach((btn) => {
    btn.addEventListener("click", () => {
      document.querySelectorAll(".tab").forEach((b) => b.classList.remove("is-active"));
      btn.classList.add("is-active");
      state.range = btn.dataset.range;
      rerender();
    });
  });

  document.querySelectorAll(".mode-btn").forEach((btn) => {
    btn.addEventListener("click", () => {
      document.querySelectorAll(".mode-btn").forEach((b) => b.classList.remove("is-active"));
      btn.classList.add("is-active");
      state.mode = btn.dataset.mode;
      rerender();
    });
  });

  document.getElementById("facility-filter").addEventListener("change", (e) => {
    state.facility = e.target.value;
    rerender();
  });

  document.querySelectorAll(".age-filter-btn").forEach((btn) => {
    btn.addEventListener("click", () => {
      const isActive = btn.classList.contains("is-active");
      document.querySelectorAll(".age-filter-btn").forEach((b) => b.classList.remove("is-active"));
      state.age = isActive ? "" : btn.dataset.age;
      if (!isActive) btn.classList.add("is-active");
      rerender();
    });
  });

  document.getElementById("facility-search").addEventListener("input", (e) => {
    facilityFilterState.search = e.target.value;
    rerenderFacilities();
  });

  document.querySelectorAll(".facility-type-chip").forEach((btn) => {
    btn.addEventListener("click", () => {
      document.querySelectorAll(".facility-type-chip").forEach((b) => b.classList.remove("is-active"));
      btn.classList.add("is-active");
      facilityFilterState.type = btn.dataset.type;
      rerenderFacilities();
    });
  });

  const favoriteToggle = document.getElementById("facility-favorite-toggle");
  favoriteToggle.addEventListener("click", () => {
    facilityFilterState.favoriteOnly = !facilityFilterState.favoriteOnly;
    favoriteToggle.classList.toggle("is-active", facilityFilterState.favoriteOnly);
    favoriteToggle.setAttribute("aria-pressed", String(facilityFilterState.favoriteOnly));
    rerenderFacilities();
  });

  // 「ほかに開いている場所」チップ・特別企画カードの施設ラベルから施設カードへジャンプする共通処理。
  // 「施設」relationのページIDで対象を特定するため、施設名テキストの合成表記に依存しない。
  // 一覧側のフィルターで対象が隠れていれば解除し、アコーディオンが畳まれていれば開いてからスクロール＋ハイライトする。
  function jumpToFacility(facilityId) {
    const facility = data.facilities.find((f) => f.id === facilityId);
    if (!facility) return;

    switchView("facilities");

    facilityFilterState.search = "";
    document.getElementById("facility-search").value = "";
    facilityFilterState.type = "";
    document.querySelectorAll(".facility-type-chip").forEach((b) => b.classList.toggle("is-active", b.dataset.type === ""));
    facilityFilterState.favoriteOnly = false;
    favoriteToggle.classList.remove("is-active");
    favoriteToggle.setAttribute("aria-pressed", "false");

    facilityAccordionOpen[facilityGroupFor(facility.type)] = true;
    rerenderFacilities();

    const card = document.querySelector(`.facility-card[data-facility-name="${CSS.escape(facility.name)}"]`);
    if (!card) return;
    card.scrollIntoView({ behavior: "smooth", block: "center" });
    card.classList.remove("is-highlighted");
    // 直前にも当てていた場合に再アニメーションさせるため一度リフローを挟む
    void card.offsetWidth;
    card.classList.add("is-highlighted");
    window.setTimeout(() => card.classList.remove("is-highlighted"), 1900);
  }

  document.getElementById("event-list").addEventListener("click", (e) => {
    if (e.target.closest("[data-goto-facilities]")) {
      switchView("facilities");
      return;
    }
    const target = e.target.closest("[data-facility-id]");
    if (!target) return;
    jumpToFacility(target.dataset.facilityId);
  });

  document.getElementById("facility-groups").addEventListener("click", (e) => {
    const btn = e.target.closest(".favorite-btn");
    if (!btn) return;
    const name = btn.dataset.facility;
    toggleFavorite(name);
    const fav = isFavorite(name);
    const favLabel = fav ? "お気に入り登録済み" : "お気に入りに追加";
    btn.classList.toggle("is-active", fav);
    btn.setAttribute("aria-label", `${favLabel}（${name}）`);
    btn.innerHTML = `<span class="star" aria-hidden="true">${fav ? "★" : "☆"}</span><span>${favLabel}</span>`;
    if (state.mode === "favorite") rerender();
    if (facilityFilterState.favoriteOnly) rerenderFacilities();
  });

  const updatedAt = new Date(data.generated_at);
  document.getElementById("updated-at").textContent =
    `最終更新: ${updatedAt.getFullYear()}/${updatedAt.getMonth() + 1}/${updatedAt.getDate()} ${String(updatedAt.getHours()).padStart(2, "0")}:${String(updatedAt.getMinutes()).padStart(2, "0")}`;
}

main().catch((err) => {
  document.getElementById("event-list").innerHTML =
    `<div class="empty-state"><p>データの読み込みに失敗しました。${escapeHtml(String(err))}</p></div>`;
  console.error(err);
});
