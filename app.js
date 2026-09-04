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
  const filtered = events.filter(
    (e) =>
      inRange(e.date, range) &&
      (!filters.facility || e.facility_name === filters.facility) &&
      (!filters.age || e.age === filters.age)
  );

  if (filtered.length === 0) {
    container.innerHTML = `<p class="empty">この条件で登録されている特別企画はありません。</p>`;
    return;
  }

  const byDate = {};
  for (const e of filtered) {
    (byDate[e.date] ||= []).push(e);
  }

  const dates = Object.keys(byDate).sort();
  container.innerHTML = dates
    .map((date) => {
      const items = byDate[date]
        .map(
          (e) => `
        <div class="event-card">
          <div class="title-row">
            <span>${escapeHtml(e.title)}</span>
          </div>
          ${e.facility_name ? `<div class="facility">${escapeHtml(e.facility_name)}</div>` : ""}
          <div class="meta-row">
            ${ageBadge(e.age)}
            ${renderSource(e.source)}
          </div>
        </div>`
        )
        .join("");
      return `
        <div class="date-group">
          <h3>${formatDateLabel(date)}</h3>
          ${items}
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
          return `
            <div class="facility-card">
              <span class="fname">${displayName}</span>
              ${subNames ? `<span class="support-name">${subNames}</span>` : ""}
              ${f.address ? `<div class="address">📍 ${escapeHtml(f.address)}</div>` : ""}
              ${programs ? `<div class="programs">${programs}</div>` : ""}
              ${f.phone ? `<div class="phone"><a href="tel:${f.phone.replace(/-/g, "")}">📞 ${f.phone}</a></div>` : ""}
              ${sourceInfo}
              ${communityTips}
            </div>`;
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

  const state = { range: "today", facility: "", age: "" };
  const rerender = () => renderEvents(data.events, state.range, { facility: state.facility, age: state.age });

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

  const updatedAt = new Date(data.generated_at);
  document.getElementById("updated-at").textContent =
    `最終更新: ${updatedAt.getFullYear()}/${updatedAt.getMonth() + 1}/${updatedAt.getDate()} ${String(updatedAt.getHours()).padStart(2, "0")}:${String(updatedAt.getMinutes()).padStart(2, "0")}`;
}

main().catch((err) => {
  document.getElementById("event-list").innerHTML =
    `<p class="empty">データの読み込みに失敗しました。${escapeHtml(String(err))}</p>`;
  console.error(err);
});
