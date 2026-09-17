import { getPlayersOnce, listenMatches, getMatch, getQuarters, setQuarter } from "../data.js";
import { EVENT_TYPES, getQuarterEndTime, formatSeconds } from "../calc.js";
import { escapeHtml, formatDate } from "../util.js";

// Event buttons shown on the "기록" tab. needsPlayer/needsAssist drive whether tapping
// the button immediately logs the event, or opens the player (then assist) picker first.
const EVENT_BUTTONS = [
  { type: EVENT_TYPES.GOAL_FOR, label: "득점", needsPlayer: true, needsAssist: true, color: "var(--info)", ink: "#fff" },
  { type: EVENT_TYPES.SHOT_FOR, label: "슛", needsPlayer: true, needsAssist: false, color: "var(--info)", ink: "#fff" },
  { type: EVENT_TYPES.KEY_DEFENSE, label: "결정적 수비", needsPlayer: true, needsAssist: false, color: "var(--win)", ink: "var(--acc-ink)" },
  { type: EVENT_TYPES.COUNTER_ATTACK, label: "역습", needsPlayer: false, needsAssist: false, color: "var(--win)", ink: "var(--acc-ink)" },
  { type: EVENT_TYPES.GOAL_AGAINST, label: "실점", needsPlayer: false, needsAssist: false, color: "var(--lose)", ink: "#fff" },
  { type: EVENT_TYPES.SHOT_AGAINST, label: "허용한 슛", needsPlayer: false, needsAssist: false, color: "var(--lose)", ink: "#fff" },
];

let players = [];
let matchesList = [];
let live = null;
let rootEl = null;
let tickInterval = null;

function emptyLive() {
  return {
    matchId: null,
    quarterCount: 5,
    lineupPlayerIds: [],
    quarterNumber: 1,
    phase: "pick-match", // pick-match | setup | running | ended | all-done
    startingLineup: [],
    onPitchSince: {}, // playerId -> elapsedSeconds when current stint started
    stintLog: {}, // playerId -> [{start,end}] completed stints this quarter
    substitutions: [], // {time, playerInId, playerOutId} — time is quarter-relative (0 = quarter start)
    events: [], // {time, type, playerId?, assistPlayerId?} — time is quarter-relative
    quarterStartOffset: 0, // added to quarter-relative times before saving, to match the continuous match clock
    elapsedSeconds: 0,
    lastOnPitch: [],
    pending: null,
    activeTab: "record", // record | playtime | feed
    expandedPlayerId: null,
    status: "",
  };
}

function byId(pid) {
  return players.find((p) => p.id === pid);
}
function nameOf(pid) {
  return byId(pid)?.name || "(알 수 없음)";
}
function eventLabel(type) {
  return EVENT_BUTTONS.find((b) => b.type === type)?.label || type;
}

export async function render(main) {
  rootEl = main;
  main.innerHTML = `<div class="loading">불러오는 중…</div>`;
  players = await getPlayersOnce();
  live = emptyLive();

  const unsubMatches = listenMatches((m) => {
    matchesList = m;
    updateMatchPickerOptions();
  });

  renderAll();

  return () => {
    stopTicker();
    unsubMatches();
    rootEl = null;
  };
}

// ---------- data loading ----------

async function loadMatch(matchId) {
  if (!matchId) {
    live = emptyLive();
    renderAll();
    return;
  }
  live.status = "";
  const match = await getMatch(matchId);
  const quarters = await getQuarters(matchId);
  if (!match) return;

  live.matchId = matchId;
  live.quarterCount = match.quarterCount || 5;
  live.lineupPlayerIds = match.lineupPlayerIds || [];

  let lastCompletedNumber = 0;
  let cursor = 0;
  const sorted = [...quarters].sort((a, b) => a.quarterNumber - b.quarterNumber);
  for (const q of sorted) {
    const endTime = getQuarterEndTime(q);
    if (endTime != null) {
      lastCompletedNumber = q.quarterNumber;
      cursor = endTime;
    }
  }
  const nextNumber = lastCompletedNumber + 1;
  const partial = quarters.find((q) => q.quarterNumber === nextNumber);

  live.quarterNumber = nextNumber;
  live.quarterStartOffset = cursor;
  live.activeTab = "record";
  live.expandedPlayerId = null;
  live.pending = null;

  if (nextNumber > live.quarterCount) {
    live.phase = "all-done";
    renderAll();
    return;
  }

  if (partial && ((partial.events || []).length || (partial.substitutions || []).length)) {
    resumePartialQuarter(partial);
  } else {
    live.startingLineup = (live.lastOnPitch || []).filter((id) => live.lineupPlayerIds.includes(id));
    live.onPitchSince = {};
    live.stintLog = {};
    live.substitutions = [];
    live.events = [];
    live.elapsedSeconds = 0;
    live.phase = "setup";
  }
  renderAll();
}

function resumePartialQuarter(partial) {
  live.startingLineup = partial.startingLineup || [];
  live.onPitchSince = {};
  for (const pid of live.startingLineup) live.onPitchSince[pid] = 0;
  live.stintLog = {};

  const subs = [...(partial.substitutions || [])].sort((a, b) => a.time - b.time).map((s) => ({ ...s, time: s.time - live.quarterStartOffset }));
  for (const s of subs) {
    if (live.onPitchSince[s.playerOutId] != null) {
      if (!live.stintLog[s.playerOutId]) live.stintLog[s.playerOutId] = [];
      live.stintLog[s.playerOutId].push({ start: live.onPitchSince[s.playerOutId], end: s.time });
      delete live.onPitchSince[s.playerOutId];
    }
    live.onPitchSince[s.playerInId] = s.time;
  }
  live.substitutions = subs;
  live.events = (partial.events || [])
    .filter((e) => e.type !== EVENT_TYPES.QUARTER_END)
    .map((e) => ({ ...e, time: e.time - live.quarterStartOffset }));

  const times = [0, ...live.events.map((e) => e.time), ...live.substitutions.map((s) => s.time)];
  live.elapsedSeconds = Math.max(...times);
  live.phase = "running";
  startTicker();
}

async function saveProgress() {
  if (!live.matchId) return;
  const payload = {
    quarterNumber: live.quarterNumber,
    startingLineup: live.startingLineup,
    substitutions: live.substitutions.map((s) => ({ ...s, time: s.time + live.quarterStartOffset })),
    events: live.events.map((e) => ({ ...e, time: e.time + live.quarterStartOffset })),
  };
  try {
    await setQuarter(live.matchId, live.quarterNumber, payload);
  } catch (e) {
    live.status = "저장 실패: " + e.message;
    renderAll();
  }
}

// ---------- export ----------

// Builds one chronological line per event/substitution. Quarter 2+ times are already
// stored as continuous match-clock seconds (see saveProgress's quarterStartOffset), so
// formatting the stored time directly gives times that keep adding onto the previous
// quarter's — no extra math needed here.
function eventLineText(e) {
  let line = eventLabel(e.type);
  if (e.playerId) {
    line += ` - ${nameOf(e.playerId)}`;
    if (e.assistPlayerId) line += ` (도움: ${nameOf(e.assistPlayerId)})`;
  }
  return line;
}

function buildExportText(match, quarters) {
  const sorted = [...quarters].sort((a, b) => a.quarterNumber - b.quarterNumber);
  let text = `FS Leo vs ${match.opponentName || "상대팀"} (${match.date || ""})\n\n`;
  for (const q of sorted) {
    text += `[${q.quarterNumber}쿼터]\n`;
    if ((q.startingLineup || []).length) {
      text += `시작: ${q.startingLineup.map((id) => nameOf(id)).join(", ")}\n`;
    }
    const items = [
      ...(q.events || []).map((e) => ({ time: e.time, text: eventLineText(e) })),
      ...(q.substitutions || []).map((s) => ({ time: s.time, text: `교체: ${nameOf(s.playerOutId)} → ${nameOf(s.playerInId)}` })),
    ].sort((a, b) => a.time - b.time);
    for (const it of items) {
      text += `${formatSeconds(it.time)} ${it.text}\n`;
    }
    text += `\n`;
  }
  return text;
}

function downloadTextFile(text, filename) {
  const blob = new Blob([text], { type: "text/plain;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

async function exportRecordTxt() {
  if (!live.matchId) return;
  const btn = document.getElementById("export-txt");
  if (btn) btn.disabled = true;
  try {
    const match = await getMatch(live.matchId);
    const quarters = await getQuarters(live.matchId);
    const text = buildExportText(match, quarters);
    const safe = (s) => (s || "").replace(/[\\/:*?"<>|]/g, "");
    downloadTextFile(text, `FSLeo_vs_${safe(match.opponentName) || "상대팀"}_${match.date || "날짜없음"}.txt`);
  } finally {
    if (btn) btn.disabled = false;
  }
}

// ---------- clock ----------

function startTicker() {
  stopTicker();
  tickInterval = setInterval(() => {
    live.elapsedSeconds += 1;
    const clockEl = document.getElementById("live-clock");
    if (clockEl) clockEl.textContent = formatSeconds(live.elapsedSeconds);
    if (live.activeTab === "playtime") renderTabBody();
  }, 1000);
}
function stopTicker() {
  if (tickInterval) clearInterval(tickInterval);
  tickInterval = null;
}

// ---------- playtime helpers ----------

function completedSecondsFor(pid) {
  return (live.stintLog[pid] || []).reduce((sum, s) => sum + (s.end - s.start), 0);
}
function totalSecondsFor(pid) {
  let total = completedSecondsFor(pid);
  if (live.onPitchSince[pid] != null) total += live.elapsedSeconds - live.onPitchSince[pid];
  return total;
}

function replayFromSubs() {
  live.onPitchSince = {};
  for (const pid of live.startingLineup) live.onPitchSince[pid] = 0;
  live.stintLog = {};
  const subs = [...live.substitutions].sort((a, b) => a.time - b.time);
  for (const s of subs) {
    if (live.onPitchSince[s.playerOutId] != null) {
      if (!live.stintLog[s.playerOutId]) live.stintLog[s.playerOutId] = [];
      live.stintLog[s.playerOutId].push({ start: live.onPitchSince[s.playerOutId], end: s.time });
      delete live.onPitchSince[s.playerOutId];
    }
    live.onPitchSince[s.playerInId] = s.time;
  }
}

// ---------- actions ----------

function toggleStarter(pid) {
  const idx = live.startingLineup.indexOf(pid);
  if (idx >= 0) live.startingLineup.splice(idx, 1);
  else live.startingLineup.push(pid);
  renderAll();
}

function startQuarter() {
  live.elapsedSeconds = 0;
  live.onPitchSince = {};
  for (const pid of live.startingLineup) live.onPitchSince[pid] = 0;
  live.stintLog = {};
  live.substitutions = [];
  live.events = [];
  live.phase = "running";
  live.status = "";
  startTicker();
  renderAll();
}

async function endQuarter() {
  stopTicker();
  const endingIds = Object.keys(live.onPitchSince);
  for (const pid of endingIds) {
    if (!live.stintLog[pid]) live.stintLog[pid] = [];
    live.stintLog[pid].push({ start: live.onPitchSince[pid], end: live.elapsedSeconds });
  }
  live.onPitchSince = {};
  live.events.push({ time: live.elapsedSeconds, type: EVENT_TYPES.QUARTER_END });
  live.lastOnPitch = endingIds;
  live.phase = "ended";
  live.status = "저장 중…";
  renderAll();
  await saveProgress();
  live.status = `${live.quarterNumber}쿼터 저장 완료`;
  renderAll();
}

function goToNextQuarter() {
  const prevEndAbsolute = live.quarterStartOffset + live.elapsedSeconds;
  const nextStarters = live.lastOnPitch.filter((id) => live.lineupPlayerIds.includes(id));

  live.quarterNumber += 1;
  live.quarterStartOffset = prevEndAbsolute;
  live.elapsedSeconds = 0;
  live.startingLineup = nextStarters;
  live.onPitchSince = {};
  live.stintLog = {};
  live.substitutions = [];
  live.events = [];
  live.pending = null;
  live.activeTab = "record";
  live.expandedPlayerId = null;
  live.status = "";
  live.phase = live.quarterNumber > live.quarterCount ? "all-done" : "setup";
  renderAll();
}

function onEventBtn(type) {
  const cfg = EVENT_BUTTONS.find((b) => b.type === type);
  if (!cfg.needsPlayer) {
    commitEvent(type, null, null);
    return;
  }
  live.pending = { kind: "event", eventType: type, needsAssist: cfg.needsAssist, stage: "player" };
  renderAll();
}

function onSubBtn() {
  live.pending = { kind: "sub", stage: "out" };
  renderAll();
}

function onCancelPending() {
  live.pending = null;
  renderAll();
}

function commitEvent(eventType, playerId, assistPlayerId) {
  const ev = { time: live.elapsedSeconds, type: eventType };
  if (playerId) ev.playerId = playerId;
  if (assistPlayerId) ev.assistPlayerId = assistPlayerId;
  live.events.push(ev);
  live.pending = null;
  saveProgress();
  renderAll();
}

function commitSub(outId, inId) {
  const start = live.onPitchSince[outId];
  if (start != null) {
    if (!live.stintLog[outId]) live.stintLog[outId] = [];
    live.stintLog[outId].push({ start, end: live.elapsedSeconds });
    delete live.onPitchSince[outId];
  }
  live.onPitchSince[inId] = live.elapsedSeconds;
  live.substitutions.push({ time: live.elapsedSeconds, playerInId: inId, playerOutId: outId });
  live.pending = null;
  saveProgress();
  renderAll();
}

function onPickPlayer(pid) {
  const p = live.pending;
  if (!p) return;
  if (p.kind === "event") {
    if (p.stage === "player") {
      if (p.needsAssist) {
        live.pending = { kind: "event", eventType: p.eventType, needsAssist: true, stage: "assist", playerId: pid };
        renderAll();
      } else {
        commitEvent(p.eventType, pid, null);
      }
    } else if (p.stage === "assist") {
      commitEvent(p.eventType, p.playerId, pid);
    }
  } else if (p.kind === "sub") {
    if (p.stage === "out") {
      live.pending = { kind: "sub", stage: "in", outId: pid };
      renderAll();
    } else {
      commitSub(p.outId, pid);
    }
  }
}

function undoItem(kind, idx) {
  if (kind === "event") {
    live.events.splice(idx, 1);
  } else if (kind === "sub") {
    live.substitutions.splice(idx, 1);
    replayFromSubs();
  }
  saveProgress();
  renderTabBody();
}

// ---------- rendering ----------

function matchPickerHtml() {
  return `
    <div class="panel panel-pad" style="margin-bottom:16px">
      <label class="field"><span class="lab">기록할 경기</span>
        <select id="live-match-picker"><option value="">경기를 선택하세요</option></select>
      </label>
      ${live.matchId ? `<div class="btn-row" style="margin-top:12px"><button class="btn" id="export-txt">TXT로 내보내기 (전체 쿼터)</button></div>` : ""}
      ${live.status ? `<div class="small-note">${escapeHtml(live.status)}</div>` : ""}
    </div>
  `;
}

function updateMatchPickerOptions() {
  const sel = document.getElementById("live-match-picker");
  if (!sel) return;
  const cur = live.matchId || "";
  sel.innerHTML =
    `<option value="">경기를 선택하세요</option>` +
    matchesList
      .map((m) => `<option value="${m.id}" ${m.id === cur ? "selected" : ""}>${escapeHtml(formatDate(m.date))} vs ${escapeHtml(m.opponentName || "상대팀")}</option>`)
      .join("");
}

function bindMatchPickerArea() {
  updateMatchPickerOptions();
  document.getElementById("live-match-picker").addEventListener("change", (e) => loadMatch(e.target.value));
  const exportBtn = document.getElementById("export-txt");
  if (exportBtn) exportBtn.addEventListener("click", exportRecordTxt);
}

function renderAll() {
  const main = rootEl;
  if (!main || !live) return;

  if (live.phase === "pick-match") {
    main.innerHTML = matchPickerHtml();
    bindMatchPickerArea();
    return;
  }

  if (live.phase === "all-done") {
    main.innerHTML = `${matchPickerHtml()}<div class="empty-box">이 경기의 모든 쿼터(${live.quarterCount}개) 기록이 끝났습니다.</div>`;
    bindMatchPickerArea();
    return;
  }

  main.innerHTML = `
    ${matchPickerHtml()}
    <div class="live-header">
      <div class="live-quarter">${live.quarterNumber}쿼터</div>
      <div class="live-clock mono" id="live-clock">${formatSeconds(live.elapsedSeconds)}</div>
      <div style="flex:1"></div>
      ${live.phase === "setup" ? `<button class="btn btn-primary" id="start-quarter" ${live.startingLineup.length ? "" : "disabled"}>쿼터 시작</button>` : ""}
      ${live.phase === "running" ? `<button class="btn btn-danger" id="end-quarter">쿼터 종료</button>` : ""}
      ${live.phase === "ended" ? `<button class="btn btn-primary" id="next-quarter">다음 쿼터로</button>` : ""}
    </div>
    ${live.phase === "setup" ? setupHtml() : ""}
    ${live.phase === "running" || live.phase === "ended" ? tabsHtml() : ""}
  `;

  bindMatchPickerArea();

  if (live.phase === "setup") {
    main.querySelectorAll("[data-starter]").forEach((btn) => {
      btn.addEventListener("click", () => toggleStarter(btn.dataset.starter));
    });
    const startBtn = document.getElementById("start-quarter");
    if (startBtn) startBtn.addEventListener("click", startQuarter);
  } else {
    const endBtn = document.getElementById("end-quarter");
    if (endBtn) endBtn.addEventListener("click", endQuarter);
    const nextBtn = document.getElementById("next-quarter");
    if (nextBtn) nextBtn.addEventListener("click", goToNextQuarter);
    bindTabs();
    renderTabBody();
  }
}

function setupHtml() {
  const rosterPlayers = live.lineupPlayerIds.map((id) => byId(id)).filter(Boolean);
  if (!rosterPlayers.length) {
    return `<div class="empty-box">이 경기에 등록된 출전 선수가 없습니다. 관리자 &gt; 경기 기록 입력에서 "02 출전 선수 선택"을 먼저 해주세요.</div>`;
  }
  return `
    <section class="panel panel-pad">
      <div class="section-label">시작 멤버 선택 (${live.startingLineup.length}명)</div>
      <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(90px,1fr));gap:8px">
        ${rosterPlayers
          .map((p) => {
            const on = live.startingLineup.includes(p.id);
            return `<button class="checkbox-item" data-starter="${p.id}" style="justify-content:center;${on ? "border-color:var(--acc);background:color-mix(in oklab, var(--acc) 18%, var(--panel-2))" : ""}">${escapeHtml(p.name)}</button>`;
          })
          .join("")}
      </div>
    </section>
  `;
}

function tabsHtml() {
  return `
    <div class="tabs" style="margin-top:16px">
      <button class="tab-btn" data-live-tab="record">기록</button>
      <button class="tab-btn" data-live-tab="playtime">출전시간</button>
      <button class="tab-btn" data-live-tab="feed">최근 기록 (${live.events.length + live.substitutions.length})</button>
    </div>
    <div id="live-tab-body"></div>
  `;
}

function bindTabs() {
  rootEl.querySelectorAll("[data-live-tab]").forEach((btn) => {
    btn.classList.toggle("active", btn.dataset.liveTab === live.activeTab);
    btn.addEventListener("click", () => {
      live.activeTab = btn.dataset.liveTab;
      live.expandedPlayerId = null;
      live.pending = null;
      renderAll();
    });
  });
}

function renderTabBody() {
  if (live.activeTab === "record") renderRecordTab();
  else if (live.activeTab === "playtime") renderPlaytimeTab();
  else renderFeedTab();
}

function playerGrid(ids) {
  if (!ids.length) return `<div class="small-note">선택 가능한 선수가 없습니다.</div>`;
  return `<div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(80px,1fr));gap:8px;margin-top:10px">
    ${ids.map((id) => `<button class="checkbox-item" style="justify-content:center" data-pick-player="${id}">${escapeHtml(nameOf(id))}</button>`).join("")}
  </div>`;
}

function renderRecordTab() {
  const body = document.getElementById("live-tab-body");
  if (!body) return;
  const onPitchIds = Object.keys(live.onPitchSince);
  const benchIds = live.lineupPlayerIds.filter((id) => !onPitchIds.includes(id));

  let pickerHtml = "";
  const p = live.pending;
  if (p?.kind === "event" && p.stage === "player") {
    pickerHtml = `
      <div class="warn-box" style="margin-top:14px">${escapeHtml(eventLabel(p.eventType))} — 선수를 선택하세요</div>
      ${playerGrid(onPitchIds)}
      <button class="btn" id="cancel-pending" style="margin-top:10px">취소</button>
    `;
  } else if (p?.kind === "event" && p.stage === "assist") {
    pickerHtml = `
      <div class="warn-box" style="margin-top:14px">도움 선수를 선택하세요 (없으면 아래 버튼)</div>
      ${playerGrid(onPitchIds.filter((id) => id !== p.playerId))}
      <button class="btn btn-primary" id="skip-assist" style="margin-top:10px">도움 없음 · 완료</button>
    `;
  } else if (p?.kind === "sub" && p.stage === "out") {
    pickerHtml = `
      <div class="warn-box" style="margin-top:14px">나갈 선수를 선택하세요</div>
      ${playerGrid(onPitchIds)}
      <button class="btn" id="cancel-pending" style="margin-top:10px">취소</button>
    `;
  } else if (p?.kind === "sub" && p.stage === "in") {
    pickerHtml = `
      <div class="warn-box" style="margin-top:14px">들어올 선수를 선택하세요</div>
      ${playerGrid(benchIds)}
      <button class="btn" id="cancel-pending" style="margin-top:10px">취소</button>
    `;
  }

  body.innerHTML = `
    <div class="live-event-grid">
      ${EVENT_BUTTONS.map((b) => `<button class="live-event-btn" data-event-btn="${b.type}" style="background:${b.color};color:${b.ink}">${escapeHtml(b.label)}</button>`).join("")}
      <button class="live-event-btn live-sub-btn" id="sub-btn">교체</button>
      <button class="live-event-btn live-endq-btn" id="endq-btn-grid">쿼터 종료</button>
    </div>
    ${pickerHtml}
  `;

  body.querySelectorAll("[data-event-btn]").forEach((btn) => {
    btn.addEventListener("click", () => onEventBtn(btn.dataset.eventBtn));
  });
  const subBtn = document.getElementById("sub-btn");
  if (subBtn) subBtn.addEventListener("click", onSubBtn);
  const endQGridBtn = document.getElementById("endq-btn-grid");
  if (endQGridBtn) endQGridBtn.addEventListener("click", endQuarter);
  body.querySelectorAll("[data-pick-player]").forEach((btn) => {
    btn.addEventListener("click", () => onPickPlayer(btn.dataset.pickPlayer));
  });
  const cancelBtn = document.getElementById("cancel-pending");
  if (cancelBtn) cancelBtn.addEventListener("click", onCancelPending);
  const skipAssistBtn = document.getElementById("skip-assist");
  if (skipAssistBtn) skipAssistBtn.addEventListener("click", () => commitEvent(p.eventType, p.playerId, null));
}

function stintDetailHtml(pid) {
  const stints = [...(live.stintLog[pid] || [])];
  if (live.onPitchSince[pid] != null) stints.push({ start: live.onPitchSince[pid], end: null });
  if (!stints.length) return `<div class="small-note" style="padding:2px 18px 10px">기록 없음</div>`;
  return `<div style="padding:2px 18px 10px;background:var(--panel-2)">
    ${stints
      .map((s, i) => {
        const dur = s.end != null ? s.end - s.start : live.elapsedSeconds - s.start;
        return `<div style="font-size:12px;color:var(--ink-2);padding:4px 0;border-top:${i === 0 ? "0" : "1px solid var(--line)"}">
          ${i + 1}번째: ${formatSeconds(s.start)}~${s.end != null ? formatSeconds(s.end) : ""} (${formatSeconds(dur)}${s.end == null ? ", 진행중" : ""})
        </div>`;
      })
      .join("")}
  </div>`;
}

function renderPlaytimeTab() {
  const body = document.getElementById("live-tab-body");
  if (!body) return;
  const onPitchIds = new Set(Object.keys(live.onPitchSince));
  const rows = live.lineupPlayerIds
    .map((id) => ({ id, name: nameOf(id), onPitch: onPitchIds.has(id), total: totalSecondsFor(id) }))
    .sort((a, b) => (b.onPitch === a.onPitch ? b.total - a.total : b.onPitch ? 1 : -1));

  if (!rows.length) {
    body.innerHTML = `<div class="empty-box">출전 선수가 없습니다.</div>`;
    return;
  }

  body.innerHTML = `
    <div class="rows-table">
      ${rows
        .map(
          (r) => `
        <div class="live-playtime-row" data-expand="${r.id}">
          <span class="n">${r.onPitch ? `<span style="color:var(--win)">●</span> ` : ""}${escapeHtml(r.name)}</span>
          <span class="num mono">${formatSeconds(r.total)}</span>
        </div>
        ${live.expandedPlayerId === r.id ? stintDetailHtml(r.id) : ""}
      `
        )
        .join("")}
    </div>
  `;
  body.querySelectorAll("[data-expand]").forEach((el) => {
    el.addEventListener("click", () => {
      live.expandedPlayerId = live.expandedPlayerId === el.dataset.expand ? null : el.dataset.expand;
      renderTabBody();
    });
  });
}

function renderFeedTab() {
  const body = document.getElementById("live-tab-body");
  if (!body) return;
  const items = [
    ...live.events.map((e, idx) => ({
      kind: "event",
      idx,
      time: e.time,
      text: `${eventLabel(e.type)}${e.playerId ? " · " + escapeHtml(nameOf(e.playerId)) : ""}${e.assistPlayerId ? ` (도움: ${escapeHtml(nameOf(e.assistPlayerId))})` : ""}`,
    })),
    ...live.substitutions.map((s, idx) => ({
      kind: "sub",
      idx,
      time: s.time,
      text: `교체: ${escapeHtml(nameOf(s.playerOutId))} → ${escapeHtml(nameOf(s.playerInId))}`,
    })),
  ].sort((a, b) => b.time - a.time);

  if (!items.length) {
    body.innerHTML = `<div class="empty-box">아직 기록된 내용이 없습니다.</div>`;
    return;
  }

  body.innerHTML = `
    <div class="rows-table">
      ${items
        .map(
          (it) => `
        <div class="live-feed-row">
          <span class="mono" style="color:var(--ink-3)">${formatSeconds(it.time)}</span>
          <span style="font-size:13.5px">${it.text}</span>
          <button class="btn btn-sm btn-danger" data-undo="${it.kind}:${it.idx}">취소</button>
        </div>
      `
        )
        .join("")}
    </div>
  `;
  body.querySelectorAll("[data-undo]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const [kind, idx] = btn.dataset.undo.split(":");
      undoItem(kind, Number(idx));
    });
  });
}
