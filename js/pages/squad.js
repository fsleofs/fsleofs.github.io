import { listenPlayers } from "../data.js";
import { POSITIONS as POSITION_ORDER, playerAvatarSvg } from "./shared.js";
import { escapeHtml } from "../util.js";

export function render(main) {
  main.innerHTML = `
    <h1 class="page-title">FS Leo 스쿼드</h1>
    <p class="page-sub" id="squad-sub"></p>
    <div id="squad-groups"></div>
  `;

  return listenPlayers((players) => renderSquad(players));
}

function renderSquad(players) {
  document.getElementById("squad-sub").textContent = `포지션별 구역 · 총 ${players.length}명`;

  const groups = POSITION_ORDER.map((pos) => ({
    pos,
    players: players.filter((p) => (p.position || "미정") === pos),
  })).filter((g) => g.players.length > 0);

  const box = document.getElementById("squad-groups");
  if (!groups.length) {
    box.innerHTML = `<div class="empty-box">등록된 선수가 없습니다. 관리자 &gt; 선수 관리에서 추가해 주세요.</div>`;
    return;
  }

  box.innerHTML = groups
    .map(
      (g) => `
      <section class="squad-section">
        <div class="squad-section-head">
          <h2>${escapeHtml(g.pos)}</h2>
          <span class="count">${g.players.length}</span>
          <span class="rule"></span>
        </div>
        <div class="squad-grid">
          ${g.players.map((p) => playerCard(p)).join("")}
        </div>
      </section>
    `
    )
    .join("");
}

function playerCard(p) {
  return `
    <div class="player-card">
      <div class="player-photo">
        ${p.photoUrl ? `<img src="${escapeHtml(p.photoUrl)}" alt="">` : playerAvatarSvg(64)}
        <div class="player-no-badge">${escapeHtml(p.number ?? "-")}</div>
      </div>
      <div class="player-card-body">
        <div class="name">${escapeHtml(p.name)}</div>
        <div class="no">NO.${escapeHtml(p.number ?? "-")}</div>
      </div>
    </div>
  `;
}
