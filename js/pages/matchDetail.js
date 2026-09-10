import { listenMatch, listenQuarters, listenPlayers } from "../data.js";
import { computeMatchScore, computeGoalTimeline, computePlayerRows, formatSeconds, EVENT_TYPES } from "../calc.js";
import { navigate } from "../router.js";
import { escapeHtml, formatDate } from "../util.js";
import { playerAvatarSvg } from "./shared.js";

const state = {
  tab: "lineup", // lineup | records | quarterProgress | quarterRecords
  recordsSub: "team", // team | player
  quarter: 1,
};

const EVENT_KIND_INFO = {
  [EVENT_TYPES.GOAL_FOR]: { label: "득점", color: "var(--win)" },
  [EVENT_TYPES.GOAL_AGAINST]: { label: "실점", color: "var(--lose)" },
  [EVENT_TYPES.SHOT_FOR]: { label: "슛", color: "var(--acc)" },
  [EVENT_TYPES.SHOT_AGAINST]: { label: "허용한 슈팅", color: "var(--ink-2)" },
};
const PROGRESS_EVENT_TYPES = new Set(Object.keys(EVENT_KIND_INFO));

function playerName(players, id) {
  const p = players.find((pl) => pl.id === id);
  return p ? p.name : "(삭제된 선수)";
}
function playerById(players, id) {
  return players.find((pl) => pl.id === id) || null;
}

export function render(main, { matchId }) {
  main.innerHTML = `<div class="loading">불러오는 중…</div>`;

  let match = null;
  let players = [];
  let quarters = [];
  let ready = { match: false, players: false, quarters: false };

  const draw = () => {
    if (!ready.match || !ready.players || !ready.quarters) return;
    if (!match) {
      main.innerHTML = `<div class="empty-box">경기를 찾을 수 없습니다.</div>`;
      return;
    }
    if (state.quarter > (match.quarterCount || quarters.length || 1)) state.quarter = 1;
    renderMatch(main, match, players, quarters);
  };

  const unsubMatch = listenMatch(matchId, (m) => {
    match = m;
    ready.match = true;
    draw();
  });
  const unsubPlayers = listenPlayers((p) => {
    players = p;
    ready.players = true;
    draw();
  });
  const unsubQuarters = listenQuarters(matchId, (q) => {
    quarters = q;
    ready.quarters = true;
    draw();
  });

  return () => {
    unsubMatch();
    unsubPlayers();
    unsubQuarters();
  };
}

function renderMatch(main, match, players, quarters) {
  const score = quarters.length ? computeMatchScore(quarters) : null;
  const timeline = computeGoalTimeline(quarters);
  const ourGoals = timeline.filter((e) => e.type === EVENT_TYPES.GOAL_FOR);
  const oppGoals = timeline.filter((e) => e.type === EVENT_TYPES.GOAL_AGAINST);

  const resultLabel = !score ? "예정" : score.result === "W" ? "승리" : score.result === "L" ? "패배" : "무승부";
  const resultColor = !score ? "var(--ink-3)" : score.result === "W" ? "var(--win)" : score.result === "L" ? "var(--lose)" : "var(--draw)";
  const quarterCount = match.quarterCount || quarters.length || 1;

  main.innerHTML = `
    <div class="match-header">
      <button class="back-btn" id="back-fix">‹ 경기 일정</button>
      <h1>${escapeHtml(match.date ? formatDate(match.date) : "")} vs ${escapeHtml(match.opponentName || "상대팀")}</h1>
      <span style="width:96px"></span>
    </div>

    <div class="match-card">
      <div class="dateline">${escapeHtml(formatDate(match.date))} ${escapeHtml(match.time || "")}</div>
      <div class="venue">${escapeHtml(match.venue || "")}</div>
      <div class="score-grid">
        <div class="side-right">
          <div class="team-name">FS Leo</div>
          ${ourGoals.map((g) => `<div class="goal-line">${formatSeconds(g.time)} · ${escapeHtml(playerName(players, g.playerId))}${g.assistPlayerId ? ` (도움: ${escapeHtml(playerName(players, g.assistPlayerId))})` : ""}</div>`).join("") || `<div class="goal-line" style="color:var(--ink-3)">-</div>`}
        </div>
        <div class="center">
          <div class="score-big">${score ? `${score.gf} - ${score.ga}` : "vs"}</div>
          <div class="result-label" style="color:${resultColor}">${resultLabel.toUpperCase()}</div>
        </div>
        <div>
          <div class="team-name">${escapeHtml(match.opponentName || "상대팀")}</div>
          ${oppGoals.map((g) => `<div class="goal-line">${formatSeconds(g.time)}</div>`).join("") || `<div class="goal-line" style="color:var(--ink-3)">-</div>`}
        </div>
      </div>
    </div>

    <div class="tabs">
      <button class="tab-btn" data-tab="lineup">라인업</button>
      <button class="tab-btn" data-tab="records">기록</button>
      <button class="tab-btn" data-tab="quarterProgress">쿼터별 진행사항</button>
      <button class="tab-btn" data-tab="quarterRecords">쿼터별 기록</button>
    </div>
    <div id="match-tab-body"></div>
  `;

  document.getElementById("back-fix").addEventListener("click", () => navigate("fixtures"));
  main.querySelectorAll("[data-tab]").forEach((btn) => {
    btn.classList.toggle("active", btn.dataset.tab === state.tab);
    btn.addEventListener("click", () => {
      state.tab = btn.dataset.tab;
      renderMatch(main, match, players, quarters);
    });
  });

  const body = document.getElementById("match-tab-body");
  if (state.tab === "lineup") renderLineup(body, match, players, quarters);
  else if (state.tab === "records") renderRecords(body, match, players, quarters, score, timeline);
  else if (state.tab === "quarterProgress") renderQuarterProgress(body, players, quarters, quarterCount);
  else if (state.tab === "quarterRecords") renderQuarterRecords(body, players, quarters, quarterCount);
}

// The admin's "02 출전 선수 선택" step saves lineupPlayerIds onto the match doc, but that only
// persists if "경기 정보 저장" is clicked again after checking it — easy to miss when the admin's
// next action is "쿼터 저장" instead. So fall back to whoever actually shows up in the saved
// quarters (starting lineups + substitutions) if lineupPlayerIds is empty or missing someone.
function deriveLineupIds(match, quarters) {
  const ids = new Set(match.lineupPlayerIds || []);
  for (const q of quarters || []) {
    for (const pid of q.startingLineup || []) ids.add(pid);
    for (const s of q.substitutions || []) {
      if (s.playerInId) ids.add(s.playerInId);
      if (s.playerOutId) ids.add(s.playerOutId);
    }
  }
  return [...ids];
}

function renderLineup(body, match, players, quarters) {
  const ids = deriveLineupIds(match, quarters);
  if (!ids.length) {
    body.innerHTML = `<div class="empty-box">등록된 출전 명단이 없습니다.</div>`;
    return;
  }
  body.innerHTML = `
    <div class="squad-grid">
      ${ids
        .map((id) => {
          const p = playerById(players, id);
          if (!p) return "";
          return `
          <div class="player-card">
            <div class="player-photo small">
              ${p.photoUrl ? `<img src="${escapeHtml(p.photoUrl)}" alt="">` : playerAvatarSvg(54)}
              <div class="player-no-badge small">${escapeHtml(p.number ?? "-")}</div>
            </div>
            <div class="player-card-body">
              <div class="name">${escapeHtml(p.name)}</div>
              <div class="pos">${escapeHtml(p.position || "")}</div>
            </div>
          </div>
        `;
        })
        .join("")}
    </div>
  `;
}

function renderRecords(body, match, players, quarters, score, timeline) {
  body.innerHTML = `
    <div class="radio-row" id="rec-subtabs">
      <button class="radio-btn" data-sub="team"><span class="radio-dot"><span class="radio-fill"></span></span>팀 기록</button>
      <button class="radio-btn" data-sub="player"><span class="radio-dot"><span class="radio-fill"></span></span>선수 기록</button>
    </div>
    <div id="rec-body"></div>
  `;
  body.querySelectorAll("[data-sub]").forEach((btn) => {
    btn.classList.toggle("active", btn.dataset.sub === state.recordsSub);
    btn.addEventListener("click", () => {
      state.recordsSub = btn.dataset.sub;
      renderRecords(body, match, players, quarters, score, timeline);
    });
  });

  const rbody = document.getElementById("rec-body");
  if (state.recordsSub === "team") {
    const s = score || { gf: 0, ga: 0, shotsFor: 0, shotsAgainst: 0 };
    const maxG = Math.max(s.gf, s.ga, 1);
    const maxS = Math.max(s.shotsFor, s.shotsAgainst, 1);
    rbody.innerHTML = `
      <div class="two-col">
        <div class="panel panel-pad">
          <div class="section-label">득점 타임라인</div>
          ${
            timeline.length
              ? timeline
                  .map(
                    (t) => `
              <div class="timeline-row">
                <span class="t">${formatSeconds(t.time)}</span>
                <span>
                  <span class="scorer">${t.type === "득점" ? escapeHtml(playerName(players, t.playerId)) : "(상대팀 득점)"}</span>
                  ${t.assistPlayerId ? `<span class="assist">도움: ${escapeHtml(playerName(players, t.assistPlayerId))}</span>` : ""}
                </span>
              </div>
            `
                  )
                  .join("")
              : `<div style="color:var(--ink-3);font-size:13px;padding:8px 0">기록된 득점이 없습니다.</div>`
          }
        </div>
        <div class="panel panel-pad">
          <div class="section-label">양 팀 비교</div>
          <div class="compare-row">
            <div class="compare-top"><span class="compare-num">${s.gf}</span><span class="compare-label">득점</span><span class="compare-num dim">${s.ga}</span></div>
            <div class="compare-bar"><span class="a" style="flex:${s.gf}">&nbsp;</span><span class="b" style="flex:${maxG * 2 - s.gf}">&nbsp;</span></div>
          </div>
          <div class="compare-row">
            <div class="compare-top"><span class="compare-num">${s.shotsFor}</span><span class="compare-label">슛</span><span class="compare-num dim">${s.shotsAgainst}</span></div>
            <div class="compare-bar"><span class="a" style="flex:${s.shotsFor}">&nbsp;</span><span class="b" style="flex:${maxS * 2 - s.shotsFor}">&nbsp;</span></div>
          </div>
        </div>
      </div>
    `;
  } else {
    const rows = computePlayerRows(players, quarters);
    rbody.innerHTML = playerRowsTable(rows);
  }
}

function playerRowsTable(rows) {
  if (!rows.length) return `<div class="empty-box">기록이 없습니다.</div>`;
  return `
    <div class="rows-table">
      <div class="rt-head">
        <span>선수</span><span>포지션</span><span class="num">출전시간</span><span class="num">득점</span><span class="num">어시스트</span><span class="num">슛</span>
      </div>
      ${rows
        .map(
          (r) => `
        <div class="rt-row">
          <span class="n">${escapeHtml(r.name)}</span>
          <span class="p">${escapeHtml(r.position || "")}</span>
          <span class="num">${formatSeconds(r.seconds)}</span>
          <span class="num" style="color:${r.goals ? "var(--acc)" : "inherit"}">${r.goals}</span>
          <span class="num" style="color:${r.assists ? "var(--acc)" : "inherit"}">${r.assists}</span>
          <span class="num" style="color:${r.shots ? "var(--acc)" : "inherit"}">${r.shots}</span>
        </div>
      `
        )
        .join("")}
    </div>
  `;
}

function quarterButtons(quarterCount, onPick) {
  let html = `<div class="qbtn-row">`;
  for (let i = 1; i <= quarterCount; i++) {
    html += `<button class="qbtn ${state.quarter === i ? "active" : ""}" data-q="${i}">${i}</button>`;
  }
  html += `</div>`;
  return html;
}

function bindQuarterButtons(container, rerender) {
  container.querySelectorAll("[data-q]").forEach((btn) => {
    btn.addEventListener("click", () => {
      state.quarter = parseInt(btn.dataset.q, 10);
      rerender();
    });
  });
}

function renderQuarterProgress(body, players, quarters, quarterCount) {
  const q = quarters.find((qq) => qq.quarterNumber === state.quarter);
  body.innerHTML = `
    ${quarterButtons(quarterCount)}
    <div class="two-col">
      <div class="panel panel-pad">
        <div class="section-label">득점 / 실점 / 슛</div>
        ${
          q && (q.events || []).some((e) => PROGRESS_EVENT_TYPES.has(e.type))
            ? q.events
                .filter((e) => PROGRESS_EVENT_TYPES.has(e.type))
                .sort((a, b) => a.time - b.time)
                .map((e) => {
                  const info = EVENT_KIND_INFO[e.type];
                  const who =
                    e.type === EVENT_TYPES.GOAL_FOR || e.type === EVENT_TYPES.SHOT_FOR
                      ? escapeHtml(playerName(players, e.playerId)) +
                        (e.type === EVENT_TYPES.GOAL_FOR && e.assistPlayerId
                          ? ` (도움: ${escapeHtml(playerName(players, e.assistPlayerId))})`
                          : "")
                      : "-";
                  return `
              <div class="qevent-row">
                <span class="t mono" style="color:var(--ink-3)">${formatSeconds(e.time)}</span>
                <span class="kind" style="color:${info.color}">${info.label}</span>
                <span>${who}</span>
              </div>
            `;
                })
                .join("")
            : `<div style="padding:18px 0;color:var(--ink-3);font-size:13px">기록된 득점·실점·슛이 없습니다.</div>`
        }
      </div>
      <div class="panel panel-pad">
        <div class="section-label">교체 내역</div>
        <div class="qstart-block">
          <div class="lab">시작 멤버</div>
          <div style="font-size:13.5px;line-height:1.6">${
            q && (q.startingLineup || []).length
              ? q.startingLineup.map((id) => escapeHtml(playerName(players, id))).join(", ")
              : "-"
          }</div>
        </div>
        ${
          q && (q.substitutions || []).length
            ? [...q.substitutions]
                .sort((a, b) => a.time - b.time)
                .map(
                  (s) => `
              <div class="qsub-row">
                <span class="t mono" style="color:var(--ink-3)">${formatSeconds(s.time)}</span>
                <span>
                  <span style="color:var(--win)">▲</span> ${escapeHtml(playerName(players, s.playerInId))}
                  <span style="color:var(--ink-3);margin:0 6px">/</span>
                  <span style="color:var(--lose)">▼</span> ${escapeHtml(playerName(players, s.playerOutId))}
                </span>
              </div>
            `
                )
                .join("")
            : `<div style="padding:10px 0;color:var(--ink-3);font-size:13px">교체 기록이 없습니다.</div>`
        }
      </div>
    </div>
    ${
      q && !q.events?.some((e) => e.type === EVENT_TYPES.QUARTER_END)
        ? `<div class="warn-box" style="margin-top:16px">이 쿼터에는 "쿼터 종료" 이벤트가 입력되지 않아 출전시간 계산에서 제외됩니다.</div>`
        : ""
    }
  `;
  bindQuarterButtons(body, () => renderQuarterProgress(body, players, quarters, quarterCount));
}

function renderQuarterRecords(body, players, quarters, quarterCount) {
  const q = quarters.find((qq) => qq.quarterNumber === state.quarter);
  const rows = q ? computePlayerRows(players, quarters, state.quarter) : [];
  body.innerHTML = `
    ${quarterButtons(quarterCount)}
    ${playerRowsTable(rows)}
  `;
  bindQuarterButtons(body, () => renderQuarterRecords(body, players, quarters, quarterCount));
}
