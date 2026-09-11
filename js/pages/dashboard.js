import { subscribeSeasonData, YOUTUBE_CHANNEL_URL } from "./shared.js";
import { computeLeaderboard, findTop, computeMatchScore, formatSeconds } from "../calc.js";
import { navigate } from "../router.js";
import { escapeHtml, formatShortDate } from "../util.js";

function iconClock() {
  return `<svg width="16" height="16" viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.7"><circle cx="10" cy="11" r="6.6"></circle><path d="M10 11V7.4M10 11l2.8 1.7M7.6 2.4h4.8"></path></svg>`;
}
function iconGoal() {
  return `<svg width="16" height="16" viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.7"><circle cx="10" cy="10" r="7.2"></circle><circle cx="10" cy="10" r="2.6"></circle></svg>`;
}
function iconAssist() {
  return `<svg width="16" height="16" viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.7"><circle cx="5.4" cy="13.8" r="2.6"></circle><path d="M8 12.6 15.4 6.2M12.2 5.6h3.6v3.6"></path></svg>`;
}

function statCard(label, entry, valueFn, icon) {
  const name = entry ? escapeHtml(entry.name) : "-";
  const val = entry ? valueFn(entry) : "-";
  return `
    <div class="stat-card">
      <div class="stat-head">
        <span class="stat-icon">${icon}</span>
        <span class="stat-label">${label}</span>
      </div>
      <div class="stat-name">${name}</div>
      <div class="stat-val">${val}</div>
    </div>
  `;
}

export function render(main) {
  main.innerHTML = `
    <h1 class="page-title">Dashboard</h1>
    <p class="page-sub" id="dash-sub">불러오는 중…</p>
    <div class="stat-grid" id="dash-stats"></div>
    <div class="section-head">
      <h2>경기 일정</h2>
      <button class="text-btn" id="dash-see-all">전체 보기</button>
    </div>
    <div class="panel" id="dash-matches"></div>
  `;

  document.getElementById("dash-see-all").addEventListener("click", () => navigate("fixtures"));

  return subscribeSeasonData((players, matches) => {
    renderStats(players, matches);
    renderMatches(matches);
  });
}

function renderStats(players, matches) {
  const leaderboard = computeLeaderboard(players, matches);
  const topMin = findTop(leaderboard, "seconds");
  const topGoal = findTop(leaderboard, "goals");
  const topAst = findTop(leaderboard, "assists");

  document.getElementById("dash-sub").textContent = `${matches.length}경기 기록 기준`;
  document.getElementById("dash-stats").innerHTML =
    statCard("최다 출전 시간", topMin && topMin.seconds > 0 ? topMin : null, (v) => formatSeconds(v.seconds), iconClock()) +
    statCard("최다 득점", topGoal && topGoal.goals > 0 ? topGoal : null, (v) => `${v.goals}골`, iconGoal()) +
    statCard("최다 도움", topAst && topAst.assists > 0 ? topAst : null, (v) => `${v.assists}도움`, iconAssist());
}

function renderMatches(matches) {
  const box = document.getElementById("dash-matches");
  const recent = matches.slice(0, 6);
  if (!recent.length) {
    box.innerHTML = `<div class="empty-box">등록된 경기가 없습니다.</div>`;
    return;
  }
  box.innerHTML = recent
    .map((m) => {
      const score = (m.quarters || []).length ? computeMatchScore(m.quarters) : null;
      const scoreText = score ? `${score.gf} - ${score.ga}` : "예정";
      const homeColor = !score ? "var(--ink-2)" : score.result === "L" ? "var(--ink-2)" : "var(--ink)";
      const awayColor = !score ? "var(--ink-2)" : score.result === "W" ? "var(--ink-2)" : "var(--ink)";
      const youtubeHref = m.youtubeUrl || YOUTUBE_CHANNEL_URL;
      return `
        <div class="list-row fixtures-row has-yt" data-match="${m.id}" role="button" tabindex="0">
          <span class="datecol">${formatShortDate(m.date)}</span>
          <span class="side-r" style="color:${homeColor}">FS Leo</span>
          <span class="score">${scoreText}</span>
          <span class="side-l" style="color:${awayColor}">${escapeHtml(m.opponentName || "상대팀")}</span>
          <a class="yt-btn" href="${escapeHtml(youtubeHref)}" target="_blank" rel="noopener" title="유튜브 영상 보기" onclick="event.stopPropagation()">
            <svg width="22" height="22" viewBox="0 0 24 24"><path d="M23.5 6.2a3 3 0 0 0-2.1-2.1C19.5 3.5 12 3.5 12 3.5s-7.5 0-9.4.6A3 3 0 0 0 .5 6.2 31 31 0 0 0 0 12a31 31 0 0 0 .5 5.8 3 3 0 0 0 2.1 2.1c1.9.6 9.4.6 9.4.6s7.5 0 9.4-.6a3 3 0 0 0 2.1-2.1A31 31 0 0 0 24 12a31 31 0 0 0-.5-5.8Z" fill="#FF0000"/><path d="M9.6 15.6 15.8 12 9.6 8.4Z" fill="#fff"/></svg>
            <span class="yt-label">YouTube</span>
          </a>
        </div>
      `;
    })
    .join("");

  box.querySelectorAll("[data-match]").forEach((row) => {
    const go = () => navigate(`match/${row.dataset.match}`);
    row.addEventListener("click", go);
    row.addEventListener("keydown", (e) => {
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        go();
      }
    });
  });
}
