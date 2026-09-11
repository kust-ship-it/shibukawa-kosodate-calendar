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

// 線画SVGアイコン（絵文字の代わりに使用）。stroke="currentColor"で呼び出し側の文字色を継承する。
const ICON_EXTERNAL_LINK = `<svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" style="display:inline-block;vertical-align:-1px;margin-right:2px;" aria-hidden="true"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/><polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/></svg>`;
const ICON_MAP_PIN = `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" style="display:inline-block;vertical-align:-1px;margin-right:3px;" aria-hidden="true"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 1 1 18 0z"/><circle cx="12" cy="10" r="3"/></svg>`;
const ICON_PHONE = `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" style="display:inline-block;vertical-align:-1px;margin-right:3px;" aria-hidden="true"><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72c.127.96.361 1.903.7 2.81a2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45c.907.339 1.85.573 2.81.7A2 2 0 0 1 22 16.92z"/></svg>`;

function starIcon(filled, size) {
  const common = `width="${size}" height="${size}" viewBox="0 0 24 24" stroke="currentColor" stroke-linejoin="round" style="display:inline-block;vertical-align:-1px;" aria-hidden="true"`;
  const points = `12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2`;
  return filled
    ? `<svg ${common} fill="currentColor" stroke-width="1.5"><polygon points="${points}"/></svg>`
    : `<svg ${common} fill="none" stroke-width="1.8"><polygon points="${points}"/></svg>`;
}

function renderSource(source) {
  if (!source) return "";
  if (source.startsWith("http")) {
    return `<a class="source-link" href="${escapeHtml(source)}" target="_blank" rel="noopener">${ICON_EXTERNAL_LINK}情報源</a>`;
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

function emptyMessage(text) {
  return `<div class="empty-state"><p>${escapeHtml(text)}</p></div>`;
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

function openFacilitiesRow(list) {
  if (list.length === 0) return "";
  const chips = list
    .map(
      (f) =>
        `<button type="button" class="facility-jump-chip" data-facility-id="${escapeHtml(f.id)}">${escapeHtml(f.name)}</button>`
    )
    .join("");
  return `
    <div class="open-facilities">
      <span class="open-facilities-label">ほかに開いている場所</span>
      <div class="open-facilities-list">${chips}</div>
    </div>`;
}

function eventRow(e) {
  const isOfficial = e.badge === "子育て支援";
  const dotClass = isOfficial ? "dot-official" : "dot-community";
  const labelClass = isOfficial ? "label-official" : "label-community";
  const titleColor = isOfficial ? "var(--river-deep)" : "var(--mtn-deep)";
  const placeLine = isOfficial
    ? e.facility_name
    : [e.organizer, e.location].filter(Boolean).join(" ／ ");
  // 施設が特定できる場合のみ、ラベル自体を「ほかに開いている場所」と同じジャンプ機能のタップ対象にする
  const isJumpable = Boolean(isOfficial && e.facility_id);
  const placeTag = isJumpable
    ? `<button type="button" class="event-place-link facility-jump-chip" data-facility-id="${escapeHtml(e.facility_id)}">${escapeHtml(placeLine)}</button>`
    : `<span class="event-place">${escapeHtml(placeLine)}</span>`;
  const hasMeta = Boolean(placeLine || e.source);
  return `
    <div class="event-row">
      <div class="event-row-main">
        <span class="event-dot ${dotClass}" aria-hidden="true"></span>
        <span class="event-label ${labelClass}">${escapeHtml(e.label || e.badge)}</span>
        ${ageBadge(e.age)}
      </div>
      <span class="event-title hw" style="color:${titleColor}">${escapeHtml(e.title)}</span>
      ${
        hasMeta
          ? `<div class="event-row-meta">
        ${placeLine ? placeTag : ""}
        ${renderSource(e.source)}
      </div>`
          : ""
      }
    </div>`;
}

function dayCardHtml(dateStr, dayEvents, openFacilities) {
  const rows = dayEvents.map((e) => eventRow(e)).join("");
  const isEmpty = dayEvents.length === 0 && openFacilities.length === 0;
  return `
    <div class="day-card">
      <div class="day-card-date hw">${escapeHtml(formatDateLabel(dateStr))}</div>
      ${
        isEmpty
          ? emptyMessage("この条件に当てはまる予定はまだありません。")
          : `${rows}${openFacilitiesRow(openFacilities)}`
      }
    </div>`;
}

function upcomingHtml(effectiveDate, events) {
  const upcoming = events
    .filter((e) => e.date > effectiveDate)
    .sort((a, b) => a.date.localeCompare(b.date))
    .slice(0, 4);
  if (upcoming.length === 0) return "";
  const rows = upcoming
    .map((e) => {
      const isOfficial = e.badge === "子育て支援";
      const placeText = isOfficial ? e.facility_name : [e.organizer, e.location].filter(Boolean).join(" ／ ");
      return `
        <div class="upcoming-row">
          <span class="upcoming-date">${escapeHtml(formatDateLabel(e.date))}</span>
          <span class="upcoming-body">
            <span class="upcoming-title">${escapeHtml(e.title)}</span>
            ${placeText ? `<span class="upcoming-place">${escapeHtml(placeText)}</span>` : ""}
          </span>
        </div>`;
    })
    .join("");
  return `<div class="upcoming"><h3>今後の予定</h3>${rows}</div>`;
}

function weekStripHtml(today, todayIso, effectiveDate, events, selectedDate) {
  const weekEndIso = toIsoDate(new Date(today.getFullYear(), today.getMonth(), today.getDate() + 6));
  const outsideWeek = selectedDate && (selectedDate < todayIso || selectedDate > weekEndIso);
  const anchor = outsideWeek ? dateFromStr(selectedDate) : today;
  const days = [];
  for (let n = 0; n < 7; n++) {
    const d = new Date(anchor.getFullYear(), anchor.getMonth(), anchor.getDate() + n);
    const isoDate = toIsoDate(d);
    const active = effectiveDate === isoDate;
    const isToday = isoDate === todayIso;
    const hasEvent = events.some((e) => e.date === isoDate);
    days.push(`
      <button type="button" class="week-day${active ? " is-active" : ""}${isToday ? " is-today" : ""}" data-select-date="${isoDate}">
        <span class="week-day-label">${isToday ? "今日" : WEEKDAY_JA[d.getDay()]}</span>
        <span class="week-day-num${isToday ? " hw" : ""}">${d.getDate()}</span>
        <span class="week-day-dot" style="visibility:${hasEvent ? "visible" : "hidden"}"></span>
      </button>`);
  }
  return `<div class="week-strip" role="tablist" aria-label="日付を選ぶ">${days.join("")}</div>`;
}

function categoryChipsHtml(category) {
  const cats = [
    { key: "子育て支援", color: "var(--primary-support-bg)" },
    { key: "イベント", color: "var(--primary-event-bg)" },
  ];
  return cats
    .map((c) => {
      const active = category === c.key;
      return `<button type="button" class="category-chip${active ? " is-active" : ""}" data-select-category="${escapeHtml(c.key)}" style="--chip-color:${c.color}">${escapeHtml(c.key)}</button>`;
    })
    .join("");
}

function ageChipsHtml(age) {
  return Object.entries(AGE_LABELS)
    .map(([raw, label]) => {
      const active = age === raw;
      return `<button type="button" class="age-filter-btn${active ? " is-active" : ""}" data-select-age="${escapeHtml(raw)}">${escapeHtml(label)}</button>`;
    })
    .join("");
}

function monthGridHtml(monthDate, events, effectiveDate, todayIso, matchesCommon) {
  const year = monthDate.getFullYear();
  const month = monthDate.getMonth();
  const firstDay = new Date(year, month, 1);
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const leading = (firstDay.getDay() + 6) % 7; // 月曜始まり
  const totalCells = Math.ceil((leading + daysInMonth) / 7) * 7;
  const headers = WEEKDAY_RANGE_ORDER.map((w) => `<div class="weekday-header">${w}</div>`).join("");
  const cells = [];
  for (let i = 0; i < totalCells; i++) {
    const dayNum = i - leading + 1;
    if (dayNum < 1 || dayNum > daysInMonth) {
      cells.push(`<div class="calendar-cell is-empty" aria-hidden="true"></div>`);
      continue;
    }
    const cellDate = new Date(year, month, dayNum);
    const isoDate = toIsoDate(cellDate);
    const isToday = isoDate === todayIso;
    const isSelected = effectiveDate === isoDate;
    const hasEvent = events.some((e) => e.date === isoDate && matchesCommon(e));
    cells.push(`
      <button type="button" class="calendar-cell${isToday ? " is-today" : ""}${isSelected ? " is-selected" : ""}" data-select-date="${isoDate}">
        <span class="calendar-cell-num">${dayNum}</span>
        <span class="calendar-cell-dot" style="visibility:${hasEvent ? "visible" : "hidden"}"></span>
      </button>`);
  }
  return `
    <div class="weekday-headers">${headers}</div>
    <div class="calendar-grid">${cells.join("")}</div>`;
}

// 検索結果（月間モードで絞り込み中）の行は、施設・情報源のメタ情報は表示せず
// ドット・分類ラベル・年齢・タイトルのみの軽量表示にする
function searchResultEventRow(e) {
  const isOfficial = e.badge === "子育て支援";
  const dotClass = isOfficial ? "dot-official" : "dot-community";
  const labelClass = isOfficial ? "label-official" : "label-community";
  const titleColor = isOfficial ? "var(--river-deep)" : "var(--mtn-deep)";
  return `
    <div class="event-row">
      <div class="event-row-main">
        <span class="event-dot ${dotClass}" aria-hidden="true"></span>
        <span class="event-label ${labelClass}">${escapeHtml(e.label || e.badge)}</span>
        ${ageBadge(e.age)}
      </div>
      <span class="event-title hw" style="color:${titleColor}">${escapeHtml(e.title)}</span>
    </div>`;
}

function searchResultsHtml(monthDate, events, matchesCommon) {
  const monthStart = new Date(monthDate.getFullYear(), monthDate.getMonth(), 1);
  const monthEnd = new Date(monthDate.getFullYear(), monthDate.getMonth() + 1, 0);
  const matches = events.filter((e) => {
    const d = dateFromStr(e.date);
    return d >= monthStart && d <= monthEnd && matchesCommon(e);
  });
  if (matches.length === 0) {
    return emptyMessage("この条件に当てはまる予定はまだありません。");
  }
  const byDate = {};
  for (const e of matches) (byDate[e.date] ||= []).push(e);
  return Object.keys(byDate)
    .sort()
    .map((date) => {
      const rows = byDate[date].map((e) => searchResultEventRow(e)).join("");
      return `
        <div class="search-result-group">
          <button type="button" class="search-result-date hw" data-jump-date="${date}">${escapeHtml(formatDateLabel(date))}</button>
          ${rows}
        </div>`;
    })
    .join("");
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
  const bounds = group.getBounds().pad(0.15);
  map.fitBounds(bounds);
  return { map, bounds };
}

// 私立・公立は「保育園・幼稚園」として統合表示する。
const FACILITY_GROUP_ORDER = ["公共の遊び場", "保育園・幼稚園", "公民館"];
const FACILITY_GROUP_COLOR = {
  "公共の遊び場": "#4E6260",
  "保育園・幼稚園": "#6B6248",
  "公民館": "#7A5A44",
};

function facilityGroupFor(type) {
  if (type === "私立" || type === "公立") return "保育園・幼稚園";
  if (type === "公民館") return "公民館";
  // 公共の遊び場（子育て支援センター・キッズランド・だれでも広場等）はここに合流する
  return "公共の遊び場";
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
      ? `<div class="source"><a href="${escapeHtml(f.source_url)}" target="_blank" rel="noopener">${ICON_EXTERNAL_LINK} 詳しくはこちら</a></div>`
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
        ${f.address ? `<div class="address">${ICON_MAP_PIN}${escapeHtml(f.address)}</div>` : ""}
        ${programs ? `<div class="programs">${programs}</div>` : ""}
        ${f.phone ? `<div class="phone"><a href="tel:${f.phone.replace(/-/g, "")}">${ICON_PHONE}${f.phone}</a></div>` : ""}
        ${sourceInfo}
        ${communityTips}
        <button type="button" class="favorite-btn${fav ? " is-active" : ""}" data-facility="${escapeHtml(f.name)}" aria-label="${favLabel}（${displayName}）">
          ${starIcon(fav, 12)}<span>${favLabel}</span>
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
      const heading = `<span class="facility-group-label">${escapeHtml(type)} ${list.length}件</span>`;

      // フィルター適用中は該当カテゴリを強制的に開き、結果を隠さない
      const isOpen = hasActiveFilter ? true : Boolean(facilityAccordionOpen[type]);
      return `
        <details class="facility-type-group" data-group="${type}"${isOpen ? " open" : ""}>
          <summary class="facility-group-summary" style="--group-color:${FACILITY_GROUP_COLOR[type]}">${heading}</summary>
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

async function main() {
  const res = await fetch("data.json", { cache: "no-store" });
  const data = await res.json();

  const eventsState = {
    displayMode: "list", // "list" | "calendar"
    selectedDate: null, // null = 当日
    monthOffset: 0,
    category: "",
    age: "",
    legendOpen: false,
  };

  function matchesCommon(e) {
    if (eventsState.category && e.badge !== eventsState.category) return false;
    if (eventsState.age && e.age !== eventsState.age) return false;
    return true;
  }

  function renderEventsPanel() {
    const container = document.getElementById("events-panel-body");
    const today = dateFromStr(todayStr());
    const todayIso = todayStr();
    const effectiveDate = eventsState.selectedDate || todayIso;
    const hasActiveFilter = Boolean(eventsState.category) || Boolean(eventsState.age);

    const legendHtml = `
      <details class="legend"${eventsState.legendOpen ? " open" : ""}>
        <summary>見方のご案内</summary>
        <ul><li>情報源が📄のものはリンクがなく、紙のおたより等が元になっています</li></ul>
      </details>`;

    const dayCardFor = (dateStr) => {
      const dayEvents = data.events.filter((e) => e.date === dateStr && matchesCommon(e));
      const officialIds = new Set(
        dayEvents.filter((e) => e.badge === "子育て支援" && e.facility_id).map((e) => e.facility_id)
      );
      // 絞り込み中は「ほかに開いている場所」を出さない
      const openFacilities = hasActiveFilter ? [] : facilitiesOpenOn(dateStr, data.facilities, officialIds);
      return dayCardHtml(dateStr, dayEvents, openFacilities);
    };

    let body;
    if (eventsState.displayMode === "list") {
      body = `
        ${legendHtml}
        ${weekStripHtml(today, todayIso, effectiveDate, data.events, eventsState.selectedDate)}
        <div class="week-strip-links">
          <button type="button" class="link-btn" data-show-calendar>月間カレンダーで見る</button>
          ${effectiveDate !== todayIso ? `<button type="button" class="link-btn is-muted" data-today-link>今日に戻る</button>` : ""}
        </div>
        ${dayCardFor(effectiveDate)}
        ${upcomingHtml(effectiveDate, data.events)}`;
    } else {
      const monthDate = new Date(today.getFullYear(), today.getMonth() + eventsState.monthOffset, 1);
      const mainSection = hasActiveFilter
        ? searchResultsHtml(monthDate, data.events, matchesCommon)
        : dayCardFor(effectiveDate);
      body = `
        <div class="filters">
          <div class="chip-row">${categoryChipsHtml(eventsState.category)}</div>
          <div class="chip-row">${ageChipsHtml(eventsState.age)}</div>
          ${hasActiveFilter ? `<button type="button" class="link-btn is-muted" data-clear-filters>絞り込みを解除</button>` : ""}
        </div>
        <div class="month-nav">
          <button type="button" class="month-nav-btn" data-prev-month aria-label="前の月">‹</button>
          <span class="month-label hw">${monthDate.getFullYear()}年${monthDate.getMonth() + 1}月</span>
          <button type="button" class="month-nav-btn" data-next-month aria-label="次の月">›</button>
        </div>
        ${monthGridHtml(monthDate, data.events, effectiveDate, todayIso, matchesCommon)}
        <button type="button" class="link-btn" data-show-list>週間ビューに戻る</button>
        <div style="margin-top: 1rem;">${mainSection}</div>`;
    }

    container.innerHTML = body;
    container.querySelectorAll("details.legend").forEach((el) => {
      el.addEventListener("toggle", () => {
        eventsState.legendOpen = el.open;
      });
    });
  }

  const facilityFilterState = { search: "", type: "", favoriteOnly: false };
  const rerenderFacilities = () => renderFacilities(data.facilities, facilityFilterState);

  renderEventsPanel();
  const mapResult = renderMap(data.facilities);
  rerenderFacilities();

  // 「予定を見る」／「施設をさがす」の画面切り替え。
  // 地図は非表示（display:none）の間に初期化されているため、コンテナサイズが0で
  // fitBoundsのズーム計算が狂い、世界地図表示になってしまう。施設タブを開くたびに
  // invalidateSize()でサイズを再認識させたうえで、同じ範囲へfitBoundsをやり直す。
  function switchView(name) {
    document.getElementById("view-tab-events").classList.toggle("is-active", name === "events");
    document.getElementById("view-tab-facilities").classList.toggle("is-active", name === "facilities");
    document.getElementById("panel-events").classList.toggle("is-active", name === "events");
    document.getElementById("panel-facilities").classList.toggle("is-active", name === "facilities");
    if (name === "facilities" && mapResult) {
      requestAnimationFrame(() => {
        mapResult.map.invalidateSize();
        mapResult.map.fitBounds(mapResult.bounds);
      });
    }
  }
  document.getElementById("view-tab-events").addEventListener("click", () => switchView("events"));
  document.getElementById("view-tab-facilities").addEventListener("click", () => switchView("facilities"));

  document.getElementById("events-panel-body").addEventListener("click", (e) => {
    const dateBtn = e.target.closest("[data-select-date]");
    if (dateBtn) {
      eventsState.selectedDate = dateBtn.dataset.selectDate;
      renderEventsPanel();
      return;
    }
    const jumpDateBtn = e.target.closest("[data-jump-date]");
    if (jumpDateBtn) {
      eventsState.selectedDate = jumpDateBtn.dataset.jumpDate;
      eventsState.displayMode = "list";
      renderEventsPanel();
      return;
    }
    if (e.target.closest("[data-show-calendar]")) {
      eventsState.displayMode = "calendar";
      renderEventsPanel();
      return;
    }
    if (e.target.closest("[data-show-list]")) {
      eventsState.displayMode = "list";
      renderEventsPanel();
      return;
    }
    if (e.target.closest("[data-today-link]")) {
      eventsState.selectedDate = null;
      renderEventsPanel();
      return;
    }
    if (e.target.closest("[data-prev-month]")) {
      eventsState.monthOffset -= 1;
      renderEventsPanel();
      return;
    }
    if (e.target.closest("[data-next-month]")) {
      eventsState.monthOffset += 1;
      renderEventsPanel();
      return;
    }
    const catBtn = e.target.closest("[data-select-category]");
    if (catBtn) {
      const val = catBtn.dataset.selectCategory;
      eventsState.category = eventsState.category === val ? "" : val;
      renderEventsPanel();
      return;
    }
    const ageBtn = e.target.closest("[data-select-age]");
    if (ageBtn) {
      const val = ageBtn.dataset.selectAge;
      eventsState.age = eventsState.age === val ? "" : val;
      renderEventsPanel();
      return;
    }
    if (e.target.closest("[data-clear-filters]")) {
      eventsState.category = "";
      eventsState.age = "";
      renderEventsPanel();
      return;
    }
    const facilityTarget = e.target.closest("[data-facility-id]");
    if (facilityTarget) {
      jumpToFacility(facilityTarget.dataset.facilityId);
    }
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
  const favoriteToggleIcon = document.getElementById("facility-favorite-toggle-icon");
  favoriteToggleIcon.innerHTML = starIcon(false, 13);
  favoriteToggle.addEventListener("click", () => {
    facilityFilterState.favoriteOnly = !facilityFilterState.favoriteOnly;
    favoriteToggle.classList.toggle("is-active", facilityFilterState.favoriteOnly);
    favoriteToggle.setAttribute("aria-pressed", String(facilityFilterState.favoriteOnly));
    favoriteToggleIcon.innerHTML = starIcon(facilityFilterState.favoriteOnly, 13);
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

  document.getElementById("facility-groups").addEventListener("click", (e) => {
    const btn = e.target.closest(".favorite-btn");
    if (!btn) return;
    const name = btn.dataset.facility;
    toggleFavorite(name);
    const fav = isFavorite(name);
    const favLabel = fav ? "お気に入り登録済み" : "お気に入りに追加";
    btn.classList.toggle("is-active", fav);
    btn.setAttribute("aria-label", `${favLabel}（${name}）`);
    btn.innerHTML = `${starIcon(fav, 12)}<span>${favLabel}</span>`;
    if (facilityFilterState.favoriteOnly) rerenderFacilities();
  });

  const updatedAt = new Date(data.generated_at);
  document.getElementById("updated-at").textContent =
    `最終更新: ${updatedAt.getFullYear()}/${updatedAt.getMonth() + 1}/${updatedAt.getDate()} ${String(updatedAt.getHours()).padStart(2, "0")}:${String(updatedAt.getMinutes()).padStart(2, "0")}`;
}

main().catch((err) => {
  document.getElementById("events-panel-body").innerHTML =
    `<div class="empty-state"><p>データの読み込みに失敗しました。${escapeHtml(String(err))}</p></div>`;
  console.error(err);
});
