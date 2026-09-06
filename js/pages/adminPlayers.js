import { listenPlayers, addPlayer, updatePlayer, deletePlayer, uploadPlayerPhoto } from "../data.js";
import { POSITIONS, playerAvatarSvg } from "./shared.js";
import { escapeHtml } from "../util.js";

let editingId = null;
let pendingFile = null;
let currentPlayers = [];

export function render(main) {
  main.innerHTML = `
    <div class="panel panel-pad" style="margin-bottom:20px">
      <div class="section-label" id="form-title">선수 추가</div>
      <div class="form-grid">
        <label class="field"><span class="lab">이름</span><input type="text" id="p-name" /></label>
        <label class="field"><span class="lab">등번호</span><input type="number" id="p-number" /></label>
        <label class="field"><span class="lab">포지션</span>
          <select id="p-position">${POSITIONS.map((p) => `<option value="${escapeHtml(p)}">${escapeHtml(p)}</option>`).join("")}</select>
        </label>
        <label class="field"><span class="lab">사진</span><input type="file" id="p-photo" accept="image/*" /></label>
      </div>
      <div class="btn-row" style="margin-top:14px">
        <button class="btn btn-primary" id="p-submit">추가</button>
        <button class="btn" id="p-cancel" style="display:none">취소</button>
      </div>
      <div class="small-note" id="p-status"></div>
    </div>
    <div class="panel" id="player-list"></div>
  `;

  editingId = null;
  pendingFile = null;

  document.getElementById("p-photo").addEventListener("change", (e) => {
    pendingFile = e.target.files[0] || null;
  });
  document.getElementById("p-submit").addEventListener("click", submit);
  document.getElementById("p-cancel").addEventListener("click", resetForm);

  return listenPlayers((players) => {
    currentPlayers = players;
    renderList(players);
  });
}

function resetForm() {
  editingId = null;
  pendingFile = null;
  document.getElementById("form-title").textContent = "선수 추가";
  document.getElementById("p-name").value = "";
  document.getElementById("p-number").value = "";
  document.getElementById("p-position").value = POSITIONS[0];
  document.getElementById("p-photo").value = "";
  document.getElementById("p-submit").textContent = "추가";
  document.getElementById("p-cancel").style.display = "none";
  document.getElementById("p-status").textContent = "";
}

async function submit() {
  const name = document.getElementById("p-name").value.trim();
  const numberRaw = document.getElementById("p-number").value;
  const position = document.getElementById("p-position").value;
  const status = document.getElementById("p-status");

  if (!name) {
    status.textContent = "이름을 입력해 주세요.";
    return;
  }

  const submitBtn = document.getElementById("p-submit");
  submitBtn.disabled = true;
  status.textContent = "저장 중…";

  try {
    const data = {
      name,
      number: numberRaw === "" ? null : Number(numberRaw),
      position,
    };

    if (editingId) {
      if (pendingFile) {
        data.photoUrl = await uploadPlayerPhoto(editingId, pendingFile);
      }
      await updatePlayer(editingId, data);
    } else {
      data.photoUrl = null;
      const ref = await addPlayer(data);
      if (pendingFile) {
        const url = await uploadPlayerPhoto(ref.id, pendingFile);
        await updatePlayer(ref.id, { photoUrl: url });
      }
    }
    resetForm();
  } catch (e) {
    status.textContent = "저장에 실패했습니다: " + e.message;
  } finally {
    submitBtn.disabled = false;
  }
}

function startEdit(player) {
  editingId = player.id;
  pendingFile = null;
  document.getElementById("form-title").textContent = `${player.name} 수정`;
  document.getElementById("p-name").value = player.name || "";
  document.getElementById("p-number").value = player.number ?? "";
  document.getElementById("p-position").value = player.position || POSITIONS[0];
  document.getElementById("p-photo").value = "";
  document.getElementById("p-submit").textContent = "수정 저장";
  document.getElementById("p-cancel").style.display = "inline-block";
  document.getElementById("p-status").textContent = "";
  window.scrollTo({ top: 0, behavior: "smooth" });
}

async function remove(player) {
  if (!confirm(`${player.name} 선수를 삭제할까요? 이미 입력된 경기 기록의 출전/득점 이력은 유지됩니다.`)) return;
  await deletePlayer(player.id);
  if (editingId === player.id) resetForm();
}

function renderList(players) {
  const box = document.getElementById("player-list");
  if (!players.length) {
    box.innerHTML = `<div class="empty-box">등록된 선수가 없습니다.</div>`;
    return;
  }
  box.innerHTML = players
    .map(
      (p) => `
      <div class="list-row" style="grid-template-columns:56px 1fr 100px 140px;cursor:default">
        <span class="player-photo" style="height:44px;width:44px;border-radius:8px">
          ${p.photoUrl ? `<img src="${escapeHtml(p.photoUrl)}" alt="">` : playerAvatarSvg(24)}
        </span>
        <span>${escapeHtml(p.name)} <span class="mono" style="color:var(--ink-3);font-size:11px">#${escapeHtml(p.number ?? "-")}</span></span>
        <span style="color:var(--ink-3);font-size:12.5px">${escapeHtml(p.position || "")}</span>
        <span class="btn-row">
          <button class="btn btn-sm" data-edit="${p.id}">수정</button>
          <button class="btn btn-sm btn-danger" data-del="${p.id}">삭제</button>
        </span>
      </div>
    `
    )
    .join("");

  box.querySelectorAll("[data-edit]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const p = currentPlayers.find((pl) => pl.id === btn.dataset.edit);
      if (p) startEdit(p);
    });
  });
  box.querySelectorAll("[data-del]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const p = currentPlayers.find((pl) => pl.id === btn.dataset.del);
      if (p) remove(p);
    });
  });
}
