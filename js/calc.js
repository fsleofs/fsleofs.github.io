// Pure calculation helpers derived from raw match/quarter data.
// Nothing here talks to Firestore — everything is plain data in, plain data out,
// which keeps this testable and keeps the time-tracking logic in one place.

export const EVENT_TYPES = {
  GOAL_FOR: "득점",
  GOAL_AGAINST: "실점",
  SHOT_FOR: "슛",
  SHOT_AGAINST: "허용한 슈팅",
  QUARTER_END: "쿼터 종료",
};

// Returns the "쿼터 종료" event's time, or null if the quarter is missing one
// (callers should treat null as "not enough data to compute playtime yet").
export function getQuarterEndTime(quarter) {
  const endEvent = (quarter.events || []).find((e) => e.type === EVENT_TYPES.QUARTER_END);
  return endEvent ? endEvent.time : null;
}

// Computes seconds-on-pitch per player for a single quarter.
// quarter: { startingLineup: [playerId], substitutions: [{time, playerInId, playerOutId}], events: [...] }
// quarterStartTime: the clock time this quarter's starting lineup takes the pitch at. Events/substitutions
// are recorded on a continuous match clock (not reset to 0 each quarter), so quarter 2+ starts wherever
// the previous quarter's "쿼터 종료" event left off, not at 0 — see computeQuartersWithOffsets.
// Returns a Map<playerId, seconds>, or null if the quarter has no "쿼터 종료" event yet.
export function computeQuarterPlaytime(quarter, quarterStartTime = 0) {
  const endTime = getQuarterEndTime(quarter);
  if (endTime == null) return null;

  const onPitchSince = new Map();
  for (const pid of quarter.startingLineup || []) {
    onPitchSince.set(pid, quarterStartTime);
  }

  const totals = new Map();
  const addTime = (pid, seconds) => {
    if (seconds <= 0) return;
    totals.set(pid, (totals.get(pid) || 0) + seconds);
  };

  const subs = [...(quarter.substitutions || [])].sort((a, b) => a.time - b.time);
  for (const sub of subs) {
    if (onPitchSince.has(sub.playerOutId)) {
      addTime(sub.playerOutId, sub.time - onPitchSince.get(sub.playerOutId));
      onPitchSince.delete(sub.playerOutId);
    }
    onPitchSince.set(sub.playerInId, sub.time);
  }

  for (const [pid, start] of onPitchSince.entries()) {
    addTime(pid, endTime - start);
  }

  return totals;
}

// Walks quarters in order, feeding each quarter's "쿼터 종료" time forward as the next quarter's
// start time (falling back to the last known boundary — or 0 for quarter 1 — when a quarter isn't
// finished yet). Returns [{ quarter, startTime, playtime }], playtime null if that quarter has no
// "쿼터 종료" event.
export function computeQuartersWithOffsets(quarters) {
  const sorted = [...(quarters || [])].sort((a, b) => a.quarterNumber - b.quarterNumber);
  let cursor = 0;
  return sorted.map((quarter) => {
    const startTime = cursor;
    const playtime = computeQuarterPlaytime(quarter, startTime);
    const endTime = getQuarterEndTime(quarter);
    if (endTime != null) cursor = endTime;
    return { quarter, startTime, playtime };
  });
}

// Sums playtime across every quarter of a match. Returns { totals: Map<playerId, seconds>, incomplete: boolean }
// incomplete=true means at least one quarter is missing its "쿼터 종료" event.
export function computeMatchPlaytime(quarters) {
  const totals = new Map();
  let incomplete = false;
  for (const { playtime } of computeQuartersWithOffsets(quarters)) {
    if (playtime == null) {
      incomplete = true;
      continue;
    }
    for (const [pid, secs] of playtime.entries()) {
      totals.set(pid, (totals.get(pid) || 0) + secs);
    }
  }
  return { totals, incomplete };
}

// Goals for/against + shot counts across all quarters of a match.
export function computeMatchScore(quarters) {
  let gf = 0, ga = 0, shotsFor = 0, shotsAgainst = 0;
  for (const q of quarters || []) {
    for (const e of q.events || []) {
      if (e.type === EVENT_TYPES.GOAL_FOR) gf++;
      else if (e.type === EVENT_TYPES.GOAL_AGAINST) ga++;
      else if (e.type === EVENT_TYPES.SHOT_FOR) shotsFor++;
      else if (e.type === EVENT_TYPES.SHOT_AGAINST) shotsAgainst++;
    }
  }
  const result = gf > ga ? "W" : gf < ga ? "L" : "D";
  return { gf, ga, shotsFor, shotsAgainst, result };
}

// Ordered list of goal events (with quarter + time) across the whole match, for the timeline view.
export function computeGoalTimeline(quarters) {
  const rows = [];
  for (const q of quarters || []) {
    for (const e of q.events || []) {
      if (e.type === EVENT_TYPES.GOAL_FOR || e.type === EVENT_TYPES.GOAL_AGAINST) {
        rows.push({ ...e, quarterNumber: q.quarterNumber });
      }
    }
  }
  rows.sort((a, b) => a.quarterNumber - b.quarterNumber || a.time - b.time);
  return rows;
}

// Per-player rows (minutes/goals/assists) for the whole match, or for a single quarter within it.
// players: full player list (for name/position lookup). quarters: ALL quarter docs of the match —
// even when isolating one quarter's stats, the full list is needed to correctly derive that
// quarter's start time from the ones before it (see computeQuartersWithOffsets).
// onlyQuarterNumber: when set, goals/assists/playtime are restricted to that one quarter.
export function computePlayerRows(players, quarters, onlyQuarterNumber = null) {
  const withOffsets = computeQuartersWithOffsets(quarters).filter(
    (w) => onlyQuarterNumber == null || w.quarter.quarterNumber === onlyQuarterNumber
  );

  const playtime = new Map();
  for (const { playtime: pt } of withOffsets) {
    if (!pt) continue;
    for (const [pid, secs] of pt.entries()) playtime.set(pid, (playtime.get(pid) || 0) + secs);
  }

  const goals = new Map();
  const assists = new Map();
  for (const { quarter: q } of withOffsets) {
    for (const e of q.events || []) {
      if (e.type === EVENT_TYPES.GOAL_FOR) {
        if (e.playerId) goals.set(e.playerId, (goals.get(e.playerId) || 0) + 1);
        if (e.assistPlayerId) assists.set(e.assistPlayerId, (assists.get(e.assistPlayerId) || 0) + 1);
      }
    }
  }

  const playerIds = new Set([...playtime.keys(), ...goals.keys(), ...assists.keys()]);
  const byId = new Map(players.map((p) => [p.id, p]));
  const rows = [...playerIds].map((pid) => {
    const p = byId.get(pid);
    return {
      playerId: pid,
      name: p ? p.name : "(삭제된 선수)",
      position: p ? p.position : "",
      seconds: playtime.get(pid) || 0,
      goals: goals.get(pid) || 0,
      assists: assists.get(pid) || 0,
    };
  });
  rows.sort((a, b) => b.seconds - a.seconds);
  return rows;
}

// mm:ss display for a seconds value.
export function formatSeconds(totalSeconds) {
  const s = Math.max(0, Math.round(totalSeconds || 0));
  const m = Math.floor(s / 60);
  const rem = s % 60;
  return `${m}:${String(rem).padStart(2, "0")}`;
}

const POINTS = { W: 3, D: 1, L: 0 };

// Season-wide standings row for FS Leo, built from matches (each with .quarters already attached).
export function computeStandings(matchesWithQuarters) {
  const finished = matchesWithQuarters.filter((m) => (m.quarters || []).length > 0);
  let w = 0, d = 0, l = 0, gf = 0, ga = 0;
  const resultsByDateDesc = [];

  for (const m of finished) {
    const score = computeMatchScore(m.quarters);
    if (score.result === "W") w++;
    else if (score.result === "D") d++;
    else l++;
    gf += score.gf;
    ga += score.ga;
    resultsByDateDesc.push({ date: m.date, result: score.result });
  }

  resultsByDateDesc.sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0));

  return {
    played: finished.length,
    w, d, l,
    gf, ga,
    gd: gf - ga,
    points: w * POINTS.W + d * POINTS.D + l * POINTS.L,
    form: resultsByDateDesc.slice(0, 3).map((r) => r.result),
  };
}

// Season-wide per-player leaderboard across every match.
export function computeLeaderboard(players, matchesWithQuarters) {
  const stats = new Map(
    players.map((p) => [p.id, { playerId: p.id, name: p.name, position: p.position, seconds: 0, goals: 0, assists: 0, appearances: 0 }])
  );

  for (const m of matchesWithQuarters) {
    const rows = computePlayerRows(players, m.quarters);
    for (const r of rows) {
      const s = stats.get(r.playerId);
      if (!s) continue; // player was deleted since
      s.seconds += r.seconds;
      s.goals += r.goals;
      s.assists += r.assists;
      if (r.seconds > 0) s.appearances += 1;
    }
  }

  return [...stats.values()];
}

export function findTop(leaderboard, key) {
  if (!leaderboard.length) return null;
  return leaderboard.reduce((best, cur) => (cur[key] > (best ? best[key] : -Infinity) ? cur : best), null);
}
