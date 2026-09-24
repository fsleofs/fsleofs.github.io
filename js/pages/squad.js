import { listenPlayers } from "../data.js";
import { POSITIONS as POSITION_ORDER, playerAvatarSvg } from "./shared.js";
import { escapeHtml } from "../util.js";

const PITCH_ROWS = ["Pivô", "Ala", "Fixo", "Goleiro"];

let viewMode = "list"; // "list" | "pitch"
let players = [];
let rootEl = null;

export function render(main) {
  rootEl = main;
  renderShell();

  return listenPlayers((p) => {
    players = p;
    renderBody();
  });
}

function renderShell() {
  rootEl.innerHTML = `
    <h1 class="page-title">FS Leo 스쿼드</h1>
    <p class="page-sub" id="squad-sub"></p>
    <div style="display:flex;gap:22px;margin-bottom:22px">
      <button class="radio-btn ${viewMode === "list" ? "active" : ""}" data-view="list">
        <span class="radio-dot"><span class="radio-fill"></span></span>
        <span>목록 보기</span>
      </button>
      <button class="radio-btn ${viewMode === "pitch" ? "active" : ""}" data-view="pitch">
        <span class="radio-dot"><span class="radio-fill"></span></span>
        <span>라인업 보기</span>
      </button>
    </div>
    <div id="squad-groups"></div>
  `;
  rootEl.querySelectorAll("[data-view]").forEach((btn) => {
    btn.addEventListener("click", () => {
      if (viewMode === btn.dataset.view) return;
      viewMode = btn.dataset.view;
      renderShell();
    });
  });
  renderBody();
}

function renderBody() {
  const sub = document.getElementById("squad-sub");
  if (sub) sub.textContent = `포지션별 구역 · 총 ${players.length}명`;

  const box = document.getElementById("squad-groups");
  if (!box) return;

  if (!players.length) {
    box.innerHTML = `<div class="empty-box">등록된 선수가 없습니다. 관리자 &gt; 선수 관리에서 추가해 주세요.</div>`;
    return;
  }

  box.innerHTML = viewMode === "pitch" ? pitchViewHtml() : listViewHtml();
}

function listViewHtml() {
  const groups = POSITION_ORDER.map((pos) => ({
    pos,
    players: players.filter((p) => (p.position || "미정") === pos),
  })).filter((g) => g.players.length > 0);

  return groups
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

function pitchViewHtml() {
  const knownPositions = new Set(PITCH_ROWS);
  const others = players.filter((p) => !knownPositions.has(p.position || "미정"));

  return `
    <div class="pitch">
      <div class="pitch-center-circle"></div>
      <div class="pitch-center-line"></div>
      ${PITCH_ROWS.map((pos) => pitchRowHtml(pos)).join("")}
      <div class="pitch-goal-box"></div>
    </div>
    ${
      others.length
        ? `<section class="squad-section" style="margin-top:20px">
            <div class="squad-section-head">
              <h2>미정 / 임시</h2>
              <span class="count">${others.length}</span>
              <span class="rule"></span>
            </div>
            <div class="squad-grid">${others.map((p) => playerCard(p)).join("")}</div>
          </section>`
        : ""
    }
  `;
}

function pitchRowHtml(pos) {
  const list = players.filter((p) => (p.position || "미정") === pos);
  return `
    <div class="pitch-row">
      <div class="pitch-row-label">${escapeHtml(pos)}</div>
      <div class="pitch-row-players">
        ${list.length ? list.map((p) => pitchPlayerHtml(p)).join("") : `<span class="pitch-empty">-</span>`}
      </div>
    </div>
  `;
}

function pitchPlayerHtml(p) {
  return `
    <div class="pitch-player">
      <div class="pitch-avatar">
        ${p.photoUrl ? `<img src="${escapeHtml(p.photoUrl)}" alt="">` : `<span>${escapeHtml(p.number ?? "-")}</span>`}
      </div>
      <div class="pitch-name">${escapeHtml(p.name)}</div>
    </div>
  `;
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
