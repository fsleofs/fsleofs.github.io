import { subscribeSeasonData } from "./shared.js";
import { computeStandings } from "../calc.js";

const FORM_COLORS = {
  W: { bg: "var(--win)", fg: "var(--acc-ink)", label: "승" },
  D: { bg: "var(--draw)", fg: "var(--ink)", label: "무" },
  L: { bg: "var(--lose)", fg: "var(--acc-ink)", label: "패" },
};

export function render(main) {
  main.innerHTML = `
    <h1 class="page-title">총 승점 현황</h1>
    <p class="page-sub">누적 시즌 기록</p>
    <div class="panel table-scroll">
      <div class="standings-head">
        <span>팀명</span><span style="text-align:center">경기</span><span style="text-align:center">승</span>
        <span style="text-align:center">무</span><span style="text-align:center">패</span>
        <span style="text-align:center">+/-</span><span style="text-align:center">득실</span>
        <span style="text-align:center">승점</span><span>기록</span>
      </div>
      <div id="standings-row"></div>
    </div>
    <div class="legend-row">
      <span class="legend-dot"><span class="sw" style="background:var(--win)"></span>승</span>
      <span class="legend-dot"><span class="sw" style="background:var(--draw)"></span>무</span>
      <span class="legend-dot"><span class="sw" style="background:var(--lose)"></span>패</span>
      <span>· 최근 3경기, 왼쪽이 최신</span>
    </div>
  `;

  return subscribeSeasonData((players, matches) => {
    const st = computeStandings(matches);
    const gdColor = st.gd > 0 ? "var(--win)" : st.gd < 0 ? "var(--lose)" : "var(--ink-2)";
    document.getElementById("standings-row").innerHTML = `
      <div class="standings-row">
        <span class="team">FS Leo</span>
        <span class="c">${st.played}</span>
        <span class="c">${st.w}</span>
        <span class="c">${st.d}</span>
        <span class="c">${st.l}</span>
        <span class="c" style="color:${gdColor}">${st.gd > 0 ? "+" : ""}${st.gd}</span>
        <span class="c" style="color:var(--ink-2)">${st.gf}-${st.ga}</span>
        <span class="pts">${st.points}</span>
        <span class="form-badges">
          ${st.form
            .map((r) => {
              const c = FORM_COLORS[r];
              return `<span class="form-badge" style="background:${c.bg};color:${c.fg}">${c.label}</span>`;
            })
            .join("")}
        </span>
      </div>
    `;
  });
}
