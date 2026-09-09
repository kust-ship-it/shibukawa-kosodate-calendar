// 渋川子育てカレンダー - 静的サイト用スクリプト（フレームワークなし・vanilla JS）

const WEEKDAY_JA = ["日", "月", "火", "水", "木", "金", "土"];

function todayStr() {
  // ブラウザのローカル時刻をそのまま使う（想定利用者は日本国内）
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function dateFromStr(s) {
  const [y, m, d] = s.split("-").map(Number);
  return new Date(y, m - 1, d);
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

const BADGE_CLASS = {
  "子育て支援": "badge-official",
  "イベント": "badge-community",
};

function categoryBadge(badge) {
  if (!badge) return "";
  const cls = BADGE_CLASS[badge] || "";
  return `<span class="category-badge ${cls}">${escapeHtml(badge)}</span>`;
}

// 手描き風の歪んだ輪郭（wobbly path）。border-radius の代わりに使う。
// preserveAspectRatio="none" で要素の実サイズに合わせて伸縮させる。
const BENTO_LARGE_PATH = "M8,4 C120,0 260,8 334,2 C338,30 336,70 336,92 C220,98 100,94 6,96 C2,64 4,30 8,4 Z";
const BENTO_SMALL_PATHS = [
  { d: "M6,6 C60,0 120,10 158,4 C162,26 160,52 156,72 C100,78 50,74 4,70 C2,50 3,26 6,6 Z", rotate: -1 },
  { d: "M5,5 C58,10 118,2 159,7 C161,28 159,50 158,70 C102,76 48,72 6,68 C4,48 3,26 5,5 Z", rotate: 1 },
];
const FACILITY_OUTLINE_PATHS = [
  "M6,4 C120,0 260,6 334,2 C336,20 335,38 334,54 C220,58 100,56 6,55 C4,38 5,18 6,4 Z",
  "M4,4 C120,8 260,2 336,5 C334,20 335,38 336,54 C220,56 100,58 4,55 C6,38 5,18 4,4 Z",
  "M6,5 C120,1 260,7 334,3 C336,20 335,38 334,53 C220,57 100,55 6,54 C4,37 5,19 6,5 Z",
];

function bentoBg(isLarge, index, fillColor) {
  if (isLarge) {
    return `<svg class="bento-bg" viewBox="0 0 340 90" preserveAspectRatio="none" aria-hidden="true"><path d="${BENTO_LARGE_PATH}" fill="${fillColor}"/></svg>`;
  }
  const variant = BENTO_SMALL_PATHS[index % BENTO_SMALL_PATHS.length];
  return `<svg class="bento-bg" viewBox="0 0 164 78" preserveAspectRatio="none" aria-hidden="true" style="transform: rotate(${variant.rotate}deg);"><path d="${variant.d}" fill="${fillColor}"/></svg>`;
}

function facilityOutline(index) {
  const d = FACILITY_OUTLINE_PATHS[index % FACILITY_OUTLINE_PATHS.length];
  return `<svg class="facility-card-outline" viewBox="0 0 340 58" preserveAspectRatio="none" aria-hidden="true"><path d="${d}" fill="none" stroke="var(--border)" stroke-width="1.5"/></svg>`;
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

function renderEvents(events, rangeKind, filters) {
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

  if (filtered.length === 0) {
    container.innerHTML = emptyState();
    return;
  }

  // ベントグリッド：直近（先頭）の1件だけを大きいブロックにし、
  // 残りは小さいブロックで並べる（今日・直近の予定を目立たせるため）。
  const cards = filtered
    .map((e, i) => {
      const isLarge = i === 0;
      const isOfficial = e.badge === "子育て支援";
      const fillColor = isOfficial ? "var(--river-pale)" : "var(--mtn-pale)";
      const deepColor = isOfficial ? "var(--river-deep)" : "var(--mtn-deep)";
      const midTextColor = isOfficial ? "var(--river-mid-text)" : "var(--mtn-mid-text)";
      const placeLine = isOfficial
        ? escapeHtml(e.facility_name)
        : [e.organizer, e.location].filter(Boolean).map(escapeHtml).join(" ／ ");
      return `
        <div class="bento-card ${isLarge ? "is-large" : "is-small"}">
          ${bentoBg(isLarge, i, fillColor)}
          <div class="bento-body">
            <p class="bento-label">${categoryBadge(e.badge)} <span class="bento-date" style="color:${midTextColor}">${escapeHtml(formatDateLabel(e.date))}</span></p>
            <p class="bento-title hw" style="color:${deepColor}">${escapeHtml(e.title)}</p>
            ${
              isLarge
                ? `${placeLine ? `<p class="bento-place" style="color:${deepColor}">${placeLine}</p>` : ""}
            <div class="bento-meta">
              ${ageBadge(e.age)}
              ${renderSource(e.source)}
            </div>`
                : ""
            }
          </div>
        </div>`;
    })
    .join("");

  container.innerHTML = `<div class="bento-grid">${cards}</div>`;
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

function renderFacilities(facilities) {
  const container = document.getElementById("facility-groups");
  const order = ["私立", "公立", "公民館", "支援センター"];
  const groups = {};
  for (const f of facilities) {
    (groups[f.type || "その他"] ||= []).push(f);
  }

  let cardIndex = 0;
  container.innerHTML = order
    .filter((type) => groups[type])
    .map((type) => {
      const cards = groups[type]
        .map((f) => {
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
          const html = `
            <div class="facility-card">
              ${facilityOutline(cardIndex)}
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
          cardIndex += 1;
          return html;
        })
        .join("");
      return `
        <div class="facility-type-group">
          <h3>${type}</h3>
          ${cards}
        </div>`;
    })
    .join("");
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
    renderEvents(data.events, state.range, {
      facility: state.facility,
      age: state.age,
      mode: state.mode,
    });

  rerender();
  renderMap(data.facilities);
  renderFacilities(data.facilities);
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
