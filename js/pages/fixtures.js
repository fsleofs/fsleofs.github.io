import { subscribeSeasonData } from "./shared.js";
import { computeMatchScore } from "../calc.js";
import { navigate } from "../router.js";
import { escapeHtml, weekdayLabel } from "../util.js";

export function render(main, params) {
  const now = new Date();
  const year = params.year || now.getFullYear();
  const month = params.month || now.getMonth() + 1; // 1-12

  main.innerHTML = `
    <h1 class="page-title">경기 일정</h1>
    <div class="month-nav">
      <button class="month-btn" id="prev-month">‹</button>
      <div class="month-label">${year}년 ${month}월</div>
      <button class="month-btn" id="next-month">›</button>
    </div>
    <div id="fixture-groups"></div>
  `;

  document.getElementById("prev-month").addEventListener("click", () => {
    const d = new Date(year, month - 2, 1);
    navigate(`fixtures/${d.getFullYear()}-${d.getMonth() + 1}`);
  });
  document.getElementById("next-month").addEventListener("click", () => {
    const d = new Date(year, month, 1);
    navigate(`fixtures/${d.getFullYear()}-${d.getMonth() + 1}`);
  });

  return subscribeSeasonData((players, matches) => {
    renderGroups(matches, year, month);
  });
}

function renderGroups(matches, year, month) {
  const prefix = `${year}-${String(month).padStart(2, "0")}`;
  const inMonth = matches.filter((m) => (m.date || "").startsWith(prefix));
  inMonth.sort((a, b) => (a.date + (a.time || "")).localeCompare(b.date + (b.time || "")));

  const box = document.getElementById("fixture-groups");
  if (!inMonth.length) {
    box.innerHTML = `<div class="empty-box">이 달에는 등록된 경기가 없습니다.</div>`;
    return;
  }

  const byDate = new Map();
  for (const m of inMonth) {
    if (!byDate.has(m.date)) byDate.set(m.date, []);
    byDate.get(m.date).push(m);
  }

  box.innerHTML = [...byDate.entries()]
    .map(([date, rows]) => {
      const [, mm, dd] = date.split("-");
      const label = `${parseInt(mm, 10)}월 ${parseInt(dd, 10)}일 (${weekdayLabel(date)})`;
      return `
        <section class="date-group">
          <div class="date-group-label">${label}</div>
          <div class="panel">
            ${rows.map((m) => matchRow(m)).join("")}
          </div>
        </section>
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

function matchRow(m) {
  const score = (m.quarters || []).length ? computeMatchScore(m.quarters) : null;
  const scoreText = score ? `${score.gf} - ${score.ga}` : "예정";
  const hasYoutube = !!m.youtubeUrl;
  return `
    <div class="list-row fixtures-row${hasYoutube ? " has-yt" : ""}" data-match="${m.id}" role="button" tabindex="0">
      <span class="datecol">${escapeHtml((m.time || "").split("~")[0] || "")}</span>
      <span class="side-r">FS Leo</span>
      <span class="score">${scoreText}</span>
      <span class="side-l">${escapeHtml(m.opponentName || "상대팀")}</span>
      ${
        hasYoutube
          ? `<a class="yt-btn" href="${escapeHtml(m.youtubeUrl)}" target="_blank" rel="noopener" title="유튜브 영상 보기" onclick="event.stopPropagation()">
              <svg width="18" height="18" viewBox="0 0 20 20" fill="none"><path d="M7.8 6.6 14 10 7.8 13.4Z" fill="#fff"/></svg>
              <span class="yt-label">YouTube</span>
            </a>`
          : ""
      }
    </div>
  `;
}
