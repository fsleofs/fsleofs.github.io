import { subscribeSeasonData } from "./shared.js";
import { computeLeaderboard, formatSeconds } from "../calc.js";
import { escapeHtml } from "../util.js";

const COLUMNS = [
  { key: "name", label: "선수", just: "flex-start" },
  { key: "position", label: "포지션", just: "flex-start" },
  { key: "appearances", label: "출전", just: "flex-end" },
  { key: "seconds", label: "출전시간", just: "flex-end" },
  { key: "goals", label: "득점", just: "flex-end" },
  { key: "assists", label: "어시스트", just: "flex-end" },
  { key: "shots", label: "슛", just: "flex-end" },
];

let state = { query: "", sortKey: "seconds", sortDir: "desc" };

export function render(main) {
  main.innerHTML = `
    <div class="pr-toolbar">
      <h1 class="page-title" style="margin:0">선수 기록</h1>
      <input class="search-input" type="text" placeholder="이름으로 검색" id="pr-search" value="${escapeHtml(state.query)}" />
    </div>
    <div class="panel">
      <div class="pt-head" id="pr-head"></div>
      <div id="pr-rows"></div>
    </div>
  `;

  let currentLeaderboard = [];

  document.getElementById("pr-search").addEventListener("input", (e) => {
    state.query = e.target.value;
    renderRows(currentLeaderboard);
  });

  const unsub = subscribeSeasonData((players, matches) => {
    currentLeaderboard = computeLeaderboard(players, matches);
    renderHead();
    renderRows(currentLeaderboard);
  });

  function renderHead() {
    document.getElementById("pr-head").innerHTML = COLUMNS.map((c) => {
      const active = state.sortKey === c.key;
      const arrow = active ? (state.sortDir === "desc" ? "▼" : "▲") : "▼";
      return `<button class="sort-btn ${active ? "active" : ""}" data-sort="${c.key}" style="justify-content:${c.just}">
        ${c.label}<span style="font-size:9px;opacity:${active ? 1 : 0.35}">${arrow}</span>
      </button>`;
    }).join("");
    document.querySelectorAll("[data-sort]").forEach((btn) => {
      btn.addEventListener("click", () => {
        const key = btn.dataset.sort;
        if (state.sortKey === key) {
          state.sortDir = state.sortDir === "desc" ? "asc" : "desc";
        } else {
          state.sortKey = key;
          state.sortDir = key === "name" || key === "position" ? "asc" : "desc";
        }
        renderHead();
        renderRows(currentLeaderboard);
      });
    });
  }

  function renderRows(leaderboard) {
    const q = state.query.trim().toLowerCase();
    let rows = leaderboard.filter((r) => r.name.toLowerCase().includes(q));
    rows.sort((a, b) => {
      const dir = state.sortDir === "asc" ? 1 : -1;
      const av = a[state.sortKey], bv = b[state.sortKey];
      if (typeof av === "string") return av.localeCompare(bv) * dir;
      return (av - bv) * dir;
    });

    const box = document.getElementById("pr-rows");
    if (!rows.length) {
      box.innerHTML = `<div class="empty-box">검색 결과가 없습니다.</div>`;
      return;
    }
    box.innerHTML = rows
      .map(
        (r) => `
        <div class="pt-row">
          <span class="n">${escapeHtml(r.name)}</span>
          <span class="p">${escapeHtml(r.position || "")}</span>
          <span class="num">${r.appearances}</span>
          <span class="num">${formatSeconds(r.seconds)}</span>
          <span class="num strong">${r.goals}</span>
          <span class="num strong">${r.assists}</span>
          <span class="num">${r.shots}</span>
        </div>
      `
      )
      .join("");
  }

  return unsub;
}
