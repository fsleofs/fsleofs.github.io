import {
  listenMatches,
  getMatch,
  getQuarters,
  addMatch,
  updateMatch,
  deleteMatch,
  setQuarter,
  getPlayersOnce,
} from "../data.js";
import { computeQuarterPlaytime, formatSeconds, EVENT_TYPES } from "../calc.js";
import { escapeHtml, parseTimeInput, formatDate } from "../util.js";

const EVENT_KIND_OPTIONS = [
  EVENT_TYPES.GOAL_FOR,
  EVENT_TYPES.GOAL_AGAINST,
  EVENT_TYPES.SHOT_FOR,
  EVENT_TYPES.SHOT_AGAINST,
  EVENT_TYPES.QUARTER_END,
];
const NEEDS_PLAYER = new Set([EVENT_TYPES.GOAL_FOR, EVENT_TYPES.SHOT_FOR]);
const NEEDS_ASSIST = new Set([EVENT_TYPES.GOAL_FOR]);

let players = [];
let matchesList = [];
let form = null;
let rootEl = null;
let status = "";

function emptyForm() {
  return {
    matchId: null,
    date: "",
    time: "",
    venue: "",
    opponentName: "",
    quarterCount: 5,
    lineupPlayerIds: [],
    activeQuarter: 1,
    quarterDrafts: {},
  };
}

function emptyDraft() {
  return { startingLineup: [], substitutions: [], events: [] };
}

function draft(qNum) {
  if (!form.quarterDrafts[qNum]) form.quarterDrafts[qNum] = emptyDraft();
  return form.quarterDrafts[qNum];
}

function playerName(id) {
  const p = players.find((pl) => pl.id === id);
  return p ? p.name : "(알 수 없음)";
}

export async function render(main) {
  rootEl = main;
  form = emptyForm();
  status = "";
  main.innerHTML = `<div class="loading">불러오는 중…</div>`;
  players = await getPlayersOnce();

  const unsubMatches = listenMatches((m) => {
    matchesList = m;
    updatePickerOptions();
  });

  renderAll();

  return () => {
    unsubMatches();
    rootEl = null;
  };
}

function updatePickerOptions() {
  const picker = document.getElementById("match-picker");
  if (!picker) return;
  const cur = form.matchId || "";
  picker.innerHTML =
    `<option value="">+ 새 경기</option>` +
    matchesList
      .map(
        (m) =>
          `<option value="${m.id}" ${m.id === cur ? "selected" : ""}>${escapeHtml(formatDate(m.date))} vs ${escapeHtml(m.opponentName || "상대팀")}</option>`
      )
      .join("");
}

async function loadMatch(matchId) {
  if (!matchId) {
    form = emptyForm();
    renderAll();
    return;
  }
  rootEl.innerHTML = `<div class="loading">불러오는 중…</div>`;
  const match = await getMatch(matchId);
  const quarters = await getQuarters(matchId);
  form = emptyForm();
  if (match) {
    form.matchId = matchId;
    form.date = match.date || "";
    form.time = match.time || "";
    form.venue = match.venue || "";
    form.opponentName = match.opponentName || "";
    form.quarterCount = match.quarterCount || 5;
    form.lineupPlayerIds = match.lineupPlayerIds || [];
    for (const q of quarters) {
      form.quarterDrafts[q.quarterNumber] = {
        startingLineup: q.startingLineup || [],
        substitutions: q.substitutions || [],
        events: q.events || [],
      };
    }
  }
  renderAll();
}

async function saveMatchInfo() {
  if (!form.date || !form.opponentName) {
    status = "날짜와 상대팀명은 필수입니다.";
    renderAll();
    return;
  }
  status = "저장 중…";
  renderAll();
  const payload = {
    date: form.date,
    time: form.time,
    venue: form.venue,
    opponentName: form.opponentName,
    quarterCount: Number(form.quarterCount) || 1,
    lineupPlayerIds: form.lineupPlayerIds,
  };
  try {
    if (form.matchId) {
      await updateMatch(form.matchId, payload);
    } else {
      const ref = await addMatch(payload);
      form.matchId = ref.id;
    }
    status = "경기 정보가 저장되었습니다.";
  } catch (e) {
    status = "저장 실패: " + e.message;
  }
  renderAll();
}

async function removeMatch() {
  if (!form.matchId) return;
  if (!confirm("이 경기를 삭제할까요? 모든 쿼터 기록이 함께 삭제됩니다.")) return;
  await deleteMatch(form.matchId);
  form = emptyForm();
  renderAll();
}

async function saveQuarter(qNum) {
  const d = draft(qNum);
  const payload = {
    quarterNumber: qNum,
    startingLineup: d.startingLineup,
    substitutions: d.substitutions,
    events: d.events,
  };
  status = "쿼터 저장 중…";
  renderAll();
  try {
    await setQuarter(form.matchId, qNum, payload);
    status = `${qNum}쿼터가 저장되었습니다.`;
  } catch (e) {
    status = "저장 실패: " + e.message;
  }
  renderAll();
}

function toggleLineup(playerId) {
  const idx = form.lineupPlayerIds.indexOf(playerId);
  if (idx >= 0) form.lineupPlayerIds.splice(idx, 1);
  else form.lineupPlayerIds.push(playerId);
  renderAll();
}

function toggleStarter(qNum, playerId) {
  const d = draft(qNum);
  const idx = d.startingLineup.indexOf(playerId);
  if (idx >= 0) d.startingLineup.splice(idx, 1);
  else d.startingLineup.push(playerId);
  renderAll();
}

function addEventRow(qNum) {
  draft(qNum).events.push({ time: 0, type: EVENT_TYPES.GOAL_FOR, playerId: "", assistPlayerId: "" });
  renderAll();
}
function removeEventRow(qNum, idx) {
  draft(qNum).events.splice(idx, 1);
  renderAll();
}
function addSubRow(qNum) {
  draft(qNum).substitutions.push({ time: 0, playerInId: "", playerOutId: "" });
  renderAll();
}
function removeSubRow(qNum, idx) {
  draft(qNum).substitutions.splice(idx, 1);
  renderAll();
}

function renderAll() {
  const main = rootEl;
  if (!main) return;

  const lineupPlayers = players.filter((p) => form.lineupPlayerIds.includes(p.id));
  const q = form.activeQuarter;
  const d = draft(q);

  main.innerHTML = `
    <div class="panel panel-pad" style="margin-bottom:16px">
      <div class="form-grid">
        <label class="field"><span class="lab">기존 경기 불러오기</span>
          <select id="match-picker"></select>
        </label>
      </div>
    </div>

    <section class="panel panel-pad" style="margin-bottom:16px">
      <div class="section-label">01 · 경기 정보</div>
      <div class="form-grid">
        <label class="field"><span class="lab">날짜</span><input type="date" id="f-date" value="${escapeHtml(form.date)}" /></label>
        <label class="field"><span class="lab">시간</span><input type="text" id="f-time" placeholder="20:00~22:00" value="${escapeHtml(form.time)}" /></label>
        <label class="field"><span class="lab">경기장</span><input type="text" id="f-venue" placeholder="예: 잠실 풋살파크 A코트" value="${escapeHtml(form.venue)}" /></label>
        <label class="field"><span class="lab">상대팀</span><input type="text" id="f-opp" placeholder="상대팀명" value="${escapeHtml(form.opponentName)}" /></label>
        <label class="field"><span class="lab">쿼터 수</span><input type="number" id="f-qcount" min="1" max="10" value="${form.quarterCount}" /></label>
      </div>
      <div class="btn-row" style="margin-top:14px">
        <button class="btn btn-primary" id="f-save">경기 정보 저장</button>
        ${form.matchId ? `<button class="btn btn-danger" id="f-delete">경기 삭제</button>` : ""}
      </div>
      ${status ? `<div class="small-note">${escapeHtml(status)}</div>` : ""}
    </section>

    <section class="panel panel-pad" style="margin-bottom:16px">
      <div style="display:flex;align-items:baseline;justify-content:space-between;margin-bottom:16px">
        <div class="section-label" style="margin:0">02 · 출전 선수 선택</div>
        <div class="mono" style="font-size:11.5px;color:var(--acc)">${form.lineupPlayerIds.length}명 선택됨</div>
      </div>
      <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(120px,1fr));gap:10px">
        ${players
          .map((p) => {
            const on = form.lineupPlayerIds.includes(p.id);
            return `
            <button class="checkbox-item" data-pick="${p.id}" style="display:block;text-align:left;${on ? "border-color:var(--acc);background:color-mix(in oklab, var(--acc) 18%, var(--panel-2))" : ""}">
              <div style="font-size:13px;font-weight:600">${escapeHtml(p.name)}</div>
              <div class="mono" style="font-size:9px;color:var(--ink-3);margin-top:2px">#${escapeHtml(p.number ?? "-")} · ${escapeHtml(p.position || "")}</div>
            </button>
          `;
          })
          .join("")}
      </div>
    </section>

    ${
      !form.matchId
        ? `<div class="warn-box">쿼터별 기록을 입력하려면 먼저 "경기 정보 저장"을 눌러 경기를 생성하세요.</div>`
        : renderQuarterSections(q, d, lineupPlayers)
    }
  `;

  document.getElementById("match-picker").addEventListener("change", (e) => loadMatch(e.target.value));
  updatePickerOptions();

  document.getElementById("f-date").addEventListener("change", (e) => (form.date = e.target.value));
  document.getElementById("f-time").addEventListener("change", (e) => (form.time = e.target.value));
  document.getElementById("f-venue").addEventListener("change", (e) => (form.venue = e.target.value));
  document.getElementById("f-opp").addEventListener("change", (e) => (form.opponentName = e.target.value));
  document.getElementById("f-qcount").addEventListener("change", (e) => {
    form.quarterCount = Math.max(1, Number(e.target.value) || 1);
    renderAll();
  });
  document.getElementById("f-save").addEventListener("click", saveMatchInfo);
  const delBtn = document.getElementById("f-delete");
  if (delBtn) delBtn.addEventListener("click", removeMatch);

  main.querySelectorAll("[data-pick]").forEach((btn) => {
    btn.addEventListener("click", () => toggleLineup(btn.dataset.pick));
  });

  if (form.matchId) bindQuarterSectionEvents(q, d);
}

function renderQuarterSections(q, d, lineupPlayers) {
  const playtime = computeQuarterPlaytime(d);

  return `
    <section class="panel panel-pad" style="margin-bottom:16px">
      <div class="section-label">03 · 쿼터 선택</div>
      <div style="display:flex;gap:6px;flex-wrap:wrap">
        ${Array.from({ length: form.quarterCount }, (_, i) => i + 1)
          .map(
            (n) =>
              `<button class="qbtn" data-qsel="${n}" style="min-width:64px;width:auto;padding:0 12px;${n === form.activeQuarter ? "background:var(--acc);border-color:var(--acc);color:var(--acc-ink)" : ""}">${n}쿼터</button>`
          )
          .join("")}
      </div>
    </section>

    <section class="panel panel-pad" style="margin-bottom:16px">
      <div style="display:flex;align-items:baseline;justify-content:space-between;margin-bottom:16px">
        <div class="section-label" style="margin:0">04 · ${q}쿼터 시작 멤버 선택</div>
        <div class="mono" style="font-size:11.5px;color:var(--acc)">${d.startingLineup.length}명 선택됨</div>
      </div>
      ${
        lineupPlayers.length
          ? `<div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(120px,1fr));gap:10px">
              ${lineupPlayers
                .map((p) => {
                  const on = d.startingLineup.includes(p.id);
                  return `
                  <button class="checkbox-item" data-starter="${p.id}" style="display:block;text-align:left;${on ? "border-color:var(--acc);background:color-mix(in oklab, var(--acc) 18%, var(--panel-2))" : ""}">
                    <div style="font-size:13px;font-weight:600">${escapeHtml(p.name)}</div>
                    <div class="mono" style="font-size:9px;color:var(--ink-3);margin-top:2px">#${escapeHtml(p.number ?? "-")} · ${escapeHtml(p.position || "")}</div>
                  </button>
                `;
                })
                .join("")}
            </div>`
          : `<div class="small-note">먼저 02에서 출전 선수를 선택하세요.</div>`
      }
    </section>

    <section class="panel panel-pad" style="margin-bottom:16px">
      <div style="display:flex;align-items:baseline;justify-content:space-between;margin-bottom:14px">
        <div class="section-label" style="margin:0">05-A · ${q}쿼터 이벤트 표</div>
        <button class="btn btn-sm" id="add-event">+ 행 추가</button>
      </div>
      <div style="overflow-x:auto"><div style="min-width:640px">
        ${
          d.events.length
            ? d.events
                .map((ev, idx) => eventRowHtml(ev, idx, lineupPlayers))
                .join("")
            : `<div class="small-note">"+ 행 추가"로 이벤트를 입력하세요.</div>`
        }
      </div></div>
      ${
        !d.events.some((e) => e.type === EVENT_TYPES.QUARTER_END)
          ? `<div class="warn-box" style="margin-top:12px">이 쿼터에 "쿼터 종료" 이벤트가 없습니다. 추가해야 출전시간이 계산됩니다.</div>`
          : ""
      }
    </section>

    <section class="panel panel-pad" style="margin-bottom:16px">
      <div style="display:flex;align-items:baseline;justify-content:space-between;margin-bottom:14px">
        <div class="section-label" style="margin:0">05-B · ${q}쿼터 교체내역 표</div>
        <button class="btn btn-sm" id="add-sub">+ 행 추가</button>
      </div>
      <div style="overflow-x:auto"><div style="min-width:520px">
        ${
          d.substitutions.length
            ? d.substitutions.map((s, idx) => subRowHtml(s, idx, lineupPlayers)).join("")
            : `<div class="small-note">교체 기록이 없으면 비워두세요.</div>`
        }
      </div></div>
      <div class="btn-row" style="margin-top:14px">
        <button class="btn btn-primary" id="save-quarter">${q}쿼터 저장</button>
      </div>
    </section>

    <section class="panel panel-pad">
      <div class="section-label">자동 계산 · 출전 시간 (${q}쿼터)</div>
      <p class="small-note" style="margin:0 0 14px">시작 멤버와 교체 시간을 근거로 계산됩니다.</p>
      <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(190px,1fr));gap:10px">
        ${
          playtime && playtime.size
            ? [...playtime.entries()]
                .map(
                  ([pid, secs]) => `
              <div style="display:flex;align-items:center;justify-content:space-between;gap:10px;padding:11px 14px;border:1px solid var(--line);border-radius:10px;background:var(--panel-2)">
                <span style="font-size:13px;font-weight:500">${escapeHtml(playerName(pid))}</span>
                <span class="mono" style="font-size:13px;color:var(--acc)">${formatSeconds(secs)}</span>
              </div>
            `
                )
                .join("")
            : `<span class="small-note">시작 멤버를 선택하고 "쿼터 종료" 이벤트를 입력하면 계산됩니다.</span>`
        }
      </div>
    </section>
  `;
}

function eventRowHtml(ev, idx, lineupPlayers) {
  const needsPlayer = NEEDS_PLAYER.has(ev.type);
  const needsAssist = NEEDS_ASSIST.has(ev.type);
  return `
    <div class="event-entry-row">
      <label class="field"><span class="lab">시간</span><input type="text" class="mono" placeholder="0:00" value="${formatSeconds(ev.time)}" data-ev-time="${idx}" /></label>
      <label class="field"><span class="lab">항목</span>
        <select data-ev-type="${idx}">
          ${EVENT_KIND_OPTIONS.map((k) => `<option value="${k}" ${k === ev.type ? "selected" : ""}>${k}</option>`).join("")}
        </select>
      </label>
      <label class="field"><span class="lab">이름</span>
        <select data-ev-player="${idx}" ${needsPlayer ? "" : "disabled"}>
          <option value="">${needsPlayer ? "선택" : "-"}</option>
          ${lineupPlayers.map((p) => `<option value="${p.id}" ${p.id === ev.playerId ? "selected" : ""}>${escapeHtml(p.name)}</option>`).join("")}
        </select>
      </label>
      <label class="field"><span class="lab">도움</span>
        <select data-ev-assist="${idx}" ${needsAssist ? "" : "disabled"}>
          <option value="">${needsAssist ? "없음" : "-"}</option>
          ${lineupPlayers.map((p) => `<option value="${p.id}" ${p.id === ev.assistPlayerId ? "selected" : ""}>${escapeHtml(p.name)}</option>`).join("")}
        </select>
      </label>
      <button class="btn btn-sm btn-danger" data-ev-del="${idx}" title="삭제">×</button>
    </div>
  `;
}

function subRowHtml(s, idx, lineupPlayers) {
  return `
    <div class="sub-entry-row">
      <label class="field"><span class="lab">시간</span><input type="text" class="mono" placeholder="0:00" value="${formatSeconds(s.time)}" data-sub-time="${idx}" /></label>
      <label class="field"><span class="lab">교체한 선수 (IN)</span>
        <select data-sub-in="${idx}">
          <option value="">선택</option>
          ${lineupPlayers.map((p) => `<option value="${p.id}" ${p.id === s.playerInId ? "selected" : ""}>${escapeHtml(p.name)}</option>`).join("")}
        </select>
      </label>
      <label class="field"><span class="lab">교체당한 선수 (OUT)</span>
        <select data-sub-out="${idx}">
          <option value="">선택</option>
          ${lineupPlayers.map((p) => `<option value="${p.id}" ${p.id === s.playerOutId ? "selected" : ""}>${escapeHtml(p.name)}</option>`).join("")}
        </select>
      </label>
      <button class="btn btn-sm btn-danger" data-sub-del="${idx}" title="삭제">×</button>
    </div>
  `;
}

function bindQuarterSectionEvents(q, d) {
  const main = rootEl;
  main.querySelectorAll("[data-qsel]").forEach((btn) => {
    btn.addEventListener("click", () => {
      form.activeQuarter = Number(btn.dataset.qsel);
      renderAll();
    });
  });
  main.querySelectorAll("[data-starter]").forEach((btn) => {
    btn.addEventListener("click", () => toggleStarter(q, btn.dataset.starter));
  });

  const addEventBtn = document.getElementById("add-event");
  if (addEventBtn) addEventBtn.addEventListener("click", () => addEventRow(q));
  const addSubBtn = document.getElementById("add-sub");
  if (addSubBtn) addSubBtn.addEventListener("click", () => addSubRow(q));
  const saveQBtn = document.getElementById("save-quarter");
  if (saveQBtn) saveQBtn.addEventListener("click", () => saveQuarter(q));

  main.querySelectorAll("[data-ev-time]").forEach((input) => {
    input.addEventListener("change", (e) => {
      const secs = parseTimeInput(e.target.value);
      d.events[Number(input.dataset.evTime)].time = secs == null ? 0 : secs;
      renderAll();
    });
  });
  main.querySelectorAll("[data-ev-type]").forEach((sel) => {
    sel.addEventListener("change", (e) => {
      d.events[Number(sel.dataset.evType)].type = e.target.value;
      renderAll();
    });
  });
  main.querySelectorAll("[data-ev-player]").forEach((sel) => {
    sel.addEventListener("change", (e) => {
      d.events[Number(sel.dataset.evPlayer)].playerId = e.target.value;
    });
  });
  main.querySelectorAll("[data-ev-assist]").forEach((sel) => {
    sel.addEventListener("change", (e) => {
      d.events[Number(sel.dataset.evAssist)].assistPlayerId = e.target.value;
    });
  });
  main.querySelectorAll("[data-ev-del]").forEach((btn) => {
    btn.addEventListener("click", () => removeEventRow(q, Number(btn.dataset.evDel)));
  });

  main.querySelectorAll("[data-sub-time]").forEach((input) => {
    input.addEventListener("change", (e) => {
      const secs = parseTimeInput(e.target.value);
      d.substitutions[Number(input.dataset.subTime)].time = secs == null ? 0 : secs;
      renderAll();
    });
  });
  main.querySelectorAll("[data-sub-in]").forEach((sel) => {
    sel.addEventListener("change", (e) => {
      d.substitutions[Number(sel.dataset.subIn)].playerInId = e.target.value;
    });
  });
  main.querySelectorAll("[data-sub-out]").forEach((sel) => {
    sel.addEventListener("change", (e) => {
      d.substitutions[Number(sel.dataset.subOut)].playerOutId = e.target.value;
    });
  });
  main.querySelectorAll("[data-sub-del]").forEach((btn) => {
    btn.addEventListener("click", () => removeSubRow(q, Number(btn.dataset.subDel)));
  });
}
