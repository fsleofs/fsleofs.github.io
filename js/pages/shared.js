import { listenPlayers, listenMatches, fetchAllMatchesWithQuarters } from "../data.js";

// Subscribes to players + matches; whenever either changes, re-fetches the full
// matches+quarters tree and invokes cb(players, matchesWithQuarters).
// Returns an unsubscribe function.
export function subscribeSeasonData(cb) {
  let players = [];
  let timer = null;

  function scheduleRefresh() {
    if (timer) clearTimeout(timer);
    timer = setTimeout(async () => {
      const matches = await fetchAllMatchesWithQuarters();
      cb(players, matches);
    }, 50);
  }

  const unsubPlayers = listenPlayers((p) => {
    players = p;
    scheduleRefresh();
  });
  const unsubMatches = listenMatches(() => {
    scheduleRefresh();
  });

  return () => {
    if (timer) clearTimeout(timer);
    unsubPlayers();
    unsubMatches();
  };
}

export function playerAvatarSvg(size = 64) {
  return `<svg width="${size}" height="${size}" viewBox="0 0 40 40" fill="none" stroke="var(--ink-3)" stroke-width="2.2" stroke-linecap="round"><circle cx="20" cy="14.6" r="6.4"></circle><path d="M7.4 34.2c0-6.5 5.6-10.8 12.6-10.8s12.6 4.3 12.6 10.8"></path></svg>`;
}

export const POSITIONS = ["Goleiro", "Fixo", "Ala", "Pivô", "미정"];
