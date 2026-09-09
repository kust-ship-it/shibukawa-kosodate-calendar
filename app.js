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
    <a href="#facility-section">日頃から利用できる施設をさがす</a>
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
  const cleaned = str.replace(/曜/g, "");
  for (const part of cleaned.split("・")) {
    if (!part) continue;
    if (part.includes("〜")) {
      const [from, to] = part.split("〜");
      const fromIdx = WEEKDAY_RANGE_ORDER.indexOf(from);
      const toIdx = WEEKDAY_RANGE_ORDER.indexOf(to);
      if (fromIdx >= 0 && toIdx >= 0) {
        for (let i = fromIdx; i <= toIdx; i++) days.add(WEEKDAY_RANGE_ORDER[i]);
      }
    } else if (WEEKDAY_RANGE_ORDER.includes(part)) {
      days.add(part);
    }
  }
  return days;
}

function facilityOpenWeekdays(f) {
  const days = new Set();
  for (const raw of [f.furea_day, f.sono_day, f.sodan_day]) {
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
      const cls = FACILITY_GROUP_BADGE_CLASS[facilityGroupFor(f.type)];
      return `<button type="button" class="open-facility-chip type-badge ${cls}" data-facility="${escapeHtml(f.name)}">${escapeHtml(f.name)}</button>`;
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
  const labelColor = isOfficial ? "var(--river-mid-text)" : "var(--mtn-mid-text)";
  const titleColor = isOfficial ? "var(--river-deep)" : "var(--mtn-deep)";
  const placeLine = isOfficial
    ? e.facility_name
    : [e.organizer, e.location].filter(Boolean).join(" ／ ");
  // 施設一覧と同じロジック・同じ配色（タウプ3階調）を再利用し、二重管理を避ける
  const facilityGroup = isOfficial && e.facility_type ? facilityGroupFor(e.facility_type) : null;
  const placeClass = facilityGroup
    ? `type-badge type-badge-inline ${FACILITY_GROUP_BADGE_CLASS[facilityGroup]}`
    : "event-place";
  const hasMeta = Boolean(placeLine || e.age || e.source);
  return `
    <div class="event-row">
      <div class="event-row-main">
        <span class="event-dot ${dotClass}" aria-hidden="true"></span>
        <span class="event-label" style="color:${labelColor}">${escapeHtml(e.label || e.badge)}</span>
        <span class="event-title hw" style="color:${titleColor}">${escapeHtml(e.title)}</span>
      </div>
      ${
        hasMeta
          ? `<div class="event-row-meta">
        ${placeLine ? `<span class="${placeClass}">${escapeHtml(placeLine)}</span>` : ""}
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
  "支援センター": "#8e44ad",
};

function renderMap(facilities) {
  const el = document.getElementById("facility-map");
  const points = facilities.filter((f) => typeof f.lat === "number" && typeof f.lng === "number");
  if (points.length === 0 || typeof L === "undefined") {
    el.style.display = "none";
    return;
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
}

// 市の公式お知らせと同じ並び順（支援センター→保育園・幼稚園→公民館）に揃える。
// 私立・公立は「保育園・幼稚園」として統合表示する。
const FACILITY_GROUP_ORDER = ["支援センター", "保育園・幼稚園", "公民館"];
const FACILITY_GROUP_BADGE_CLASS = {
  "支援センター": "type-support",
  "保育園・幼稚園": "type-childcare",
  "公民館": "type-community",
};

function facilityGroupFor(type) {
  if (type === "支援センター" || type === "公民館") return type;
  return "保育園・幼稚園"; // 私立・公立
}

function facilityCardHtml(f) {
  const displayName = escapeHtml(f.name);
  const subNames = [f.support_name, f.salon_name].filter(Boolean).map(escapeHtml).join(" / ");
  const programs = [
    programRow("ふれあい保育", f.furea_day, f.furea_time),
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

// カテゴリごとのアコーディオン開閉状態。初期値は件数の少ない支援センターだけ開いておく。
const facilityAccordionOpen = { "支援センター": true, "保育園・幼稚園": false, "公民館": false };

function renderFacilities(facilities, filterState) {
  const container = document.getElementById("facility-groups");
  const groups = {};
  for (const f of facilities) {
    const g = facilityGroupFor(f.type);
    (groups[g] ||= []).push(f);
  }
  // 「保育園・幼稚園」は私立・公立を区別せず施設名順に混在させる
  Object.values(groups).forEach((list) => list.sort((a, b) => a.name.localeCompare(b.name, "ja")));

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
      // フィルター適用中は該当カテゴリを強制的に開き、結果を隠さない
      const isOpen = hasActiveFilter ? true : Boolean(facilityAccordionOpen[type]);
      const cards = list.map((f) => facilityCardHtml(f)).join("");
      return `
        <details class="facility-type-group" data-group="${type}"${isOpen ? " open" : ""}>
          <summary class="facility-group-summary type-badge ${FACILITY_GROUP_BADGE_CLASS[type]}">
            <span class="facility-group-label">${type}</span>
            <span class="facility-group-count">${list.length}件</span>
          </summary>
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
  renderMap(data.facilities);
  rerenderFacilities();
  populateFacilityFilter(data.events);

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

  // 「ほかに開いている場所」チップから施設カードへジャンプする。
  // 一覧側のフィルターで対象が隠れていれば解除し、アコーディオンが畳まれていれば開いてからスクロール＋ハイライトする。
  function jumpToFacility(name) {
    let filtersChanged = false;
    if (facilityFilterState.search) {
      facilityFilterState.search = "";
      document.getElementById("facility-search").value = "";
      filtersChanged = true;
    }
    if (facilityFilterState.type) {
      facilityFilterState.type = "";
      document.querySelectorAll(".facility-type-chip").forEach((b) => b.classList.toggle("is-active", b.dataset.type === ""));
      filtersChanged = true;
    }
    if (facilityFilterState.favoriteOnly) {
      facilityFilterState.favoriteOnly = false;
      favoriteToggle.classList.remove("is-active");
      favoriteToggle.setAttribute("aria-pressed", "false");
      filtersChanged = true;
    }

    const facility = data.facilities.find((f) => f.name === name);
    if (facility) {
      facilityAccordionOpen[facilityGroupFor(facility.type)] = true;
    }

    if (filtersChanged || facility) rerenderFacilities();

    const card = document.querySelector(`.facility-card[data-facility-name="${CSS.escape(name)}"]`);
    if (!card) return;
    card.scrollIntoView({ behavior: "smooth", block: "center" });
    card.classList.remove("is-highlighted");
    // 直前にも当てていた場合に再アニメーションさせるため一度リフローを挟む
    void card.offsetWidth;
    card.classList.add("is-highlighted");
    window.setTimeout(() => card.classList.remove("is-highlighted"), 1600);
  }

  document.getElementById("event-list").addEventListener("click", (e) => {
    const chip = e.target.closest(".open-facility-chip");
    if (!chip) return;
    jumpToFacility(chip.dataset.facility);
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
