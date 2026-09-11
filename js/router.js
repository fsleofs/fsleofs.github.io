import { onAuthChange } from "./firebase.js";
import { YOUTUBE_CHANNEL_URL } from "./pages/shared.js";
import * as Dashboard from "./pages/dashboard.js";
import * as Squad from "./pages/squad.js";
import * as Fixtures from "./pages/fixtures.js";
import * as MatchDetail from "./pages/matchDetail.js";
import * as Standings from "./pages/standings.js";
import * as PlayerRecords from "./pages/playerRecords.js";
import * as Admin from "./pages/admin.js";

const ROUTES = [
  { test: (h) => h === "" || h === "dashboard", key: "dashboard", mod: Dashboard },
  { test: (h) => h === "squad", key: "squad", mod: Squad },
  { test: (h) => h === "fixtures" || h.startsWith("fixtures/"), key: "fixtures", mod: Fixtures },
  { test: (h) => h.startsWith("match/"), key: "match", mod: MatchDetail },
  { test: (h) => h === "standings", key: "standings", mod: Standings },
  { test: (h) => h === "players", key: "players", mod: PlayerRecords },
  { test: (h) => h === "admin", key: "admin", mod: Admin },
];

let currentCleanup = null;
export let isAdminAuthed = false;

export function navigate(hash) {
  window.location.hash = hash;
}

function iconDashboard() {
  return `<svg width="21" height="21" viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"><path d="M3 8.7 10 3.2l7 5.5V16.4a1.1 1.1 0 0 1-1.1 1.1H4.1A1.1 1.1 0 0 1 3 16.4z"></path><path d="M7.9 17.5v-5.1h4.2v5.1"></path></svg>`;
}
function iconSquad() {
  return `<svg width="21" height="21" viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"><rect x="2.4" y="4.6" width="15.2" height="10.8" rx="1.6"></rect><path d="M10 4.6v10.8"></path><circle cx="10" cy="10" r="2.1"></circle><path d="M2.4 7.6h1.9v4.8H2.4M17.6 7.6h-1.9v4.8h1.9"></path></svg>`;
}
function iconFixtures() {
  return `<svg width="21" height="21" viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"><rect x="2.7" y="4.4" width="14.6" height="12.9" rx="2.1"></rect><path d="M2.7 8.2h14.6M6.8 2.7v3M13.2 2.7v3"></path><path d="M6.6 11.6h2.2M11.2 11.6h2.2M6.6 14.4h2.2M11.2 14.4h2.2"></path></svg>`;
}
function iconTable() {
  return `<svg width="21" height="21" viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"><path d="M3.2 16.8h13.6"></path><path d="M5.8 16.8V11M10 16.8V6.4M14.2 16.8V8.6"></path></svg>`;
}
function iconPlayers() {
  return `<svg width="21" height="21" viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"><circle cx="7" cy="7.1" r="2.7"></circle><path d="M2.7 16.6c0-2.6 1.9-4.4 4.3-4.4s4.3 1.8 4.3 4.4"></path><path d="M13.6 7.4h3.7M13.6 11h3.7M13.6 14.6h3.7"></path></svg>`;
}
function iconIg() {
  return `<svg width="18" height="18" viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.7"><rect x="2.5" y="2.5" width="15" height="15" rx="4.5"></rect><circle cx="10" cy="10" r="3.7"></circle><circle cx="14.6" cy="5.4" r="0.95" fill="currentColor" stroke="none"></circle></svg>`;
}
function iconYt() {
  return `<svg width="18" height="18" viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.7"><rect x="1.5" y="4" width="17" height="12" rx="3.5"></rect><path d="M8.4 7.6 L13 10 L8.4 12.4 Z" fill="currentColor" stroke="none"></path></svg>`;
}
function iconAdmin() {
  return `<svg width="18" height="18" viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.7"><rect x="3.8" y="8.6" width="12.4" height="8.4" rx="2.4"></rect><path d="M6.8 8.6V6.6a3.2 3.2 0 0 1 6.4 0v2"></path></svg>`;
}

const NAV_ITEMS = [
  { key: "dashboard", label: "Dashboard", icon: iconDashboard },
  { key: "squad", label: "FS Leo 스쿼드", icon: iconSquad },
  { key: "fixtures", label: "경기 일정", icon: iconFixtures },
  { key: "standings", label: "총 승점 현황", icon: iconTable },
  { key: "players", label: "선수 기록", icon: iconPlayers },
];

const SOCIAL_LINKS = {
  instagram: "https://instagram.com/",
  youtube: YOUTUBE_CHANNEL_URL,
};

function applyTheme(theme) {
  document.documentElement.dataset.theme = theme;
  localStorage.setItem("fsleo-theme", theme);
  const knob = document.querySelector(".theme-knob");
  const label = document.querySelector(".theme-label");
  if (knob) knob.style.transform = theme === "light" ? "translateX(15px)" : "translateX(0)";
  if (label) label.textContent = theme === "light" ? "라이트 모드" : "다크 모드";
}

function renderShell() {
  const root = document.getElementById("app");
  root.innerHTML = `
    <div class="app-shell">
      <aside class="sidebar">
        <div class="sidebar-logo">
          <div class="mark">FS</div>
          <div>
            <div class="title">FS Leo</div>
            <div class="sub">FUTSAL RECORDS</div>
          </div>
        </div>
        <nav class="nav">
          ${NAV_ITEMS.map(
            (item) => `<button class="nav-btn" data-nav="${item.key}">${item.icon()}${item.label}</button>`
          ).join("")}
        </nav>
        <div class="sidebar-spacer"></div>
        <div class="sidebar-bottom">
          <a class="link-row" href="${SOCIAL_LINKS.instagram}" target="_blank" rel="noopener">${iconIg()}인스타그램</a>
          <a class="link-row" href="${SOCIAL_LINKS.youtube}" target="_blank" rel="noopener">${iconYt()}유튜브</a>
          <div class="divider"></div>
          <button class="link-row theme-btn" id="theme-toggle">
            <span class="theme-label">다크 모드</span>
            <span class="theme-switch"><span class="theme-knob"></span></span>
          </button>
          <button class="link-row" data-nav="admin">${iconAdmin()}관리자 로그인</button>
        </div>
      </aside>
      <main class="main" id="main"></main>
    </div>
  `;

  root.querySelectorAll("[data-nav]").forEach((btn) => {
    btn.addEventListener("click", () => navigate(btn.dataset.nav));
  });
  document.getElementById("theme-toggle").addEventListener("click", () => {
    const cur = document.documentElement.dataset.theme === "light" ? "light" : "dark";
    applyTheme(cur === "light" ? "dark" : "light");
  });
}

function setActiveNav(key) {
  document.querySelectorAll(".nav-btn").forEach((btn) => {
    btn.classList.toggle("active", btn.dataset.nav === key);
  });
}

async function renderRoute() {
  const hash = window.location.hash.replace(/^#\/?/, "");
  const route = ROUTES.find((r) => r.test(hash)) || ROUTES[0];
  setActiveNav(route.key);

  if (typeof currentCleanup === "function") {
    try { currentCleanup(); } catch (e) { /* ignore */ }
  }
  currentCleanup = null;

  const main = document.getElementById("main");
  main.innerHTML = `<div class="loading">불러오는 중…</div>`;

  const params = parseParams(route.key, hash);
  const cleanup = await route.mod.render(main, params);
  currentCleanup = typeof cleanup === "function" ? cleanup : null;
}

function parseParams(routeKey, hash) {
  if (routeKey === "match") {
    return { matchId: hash.slice("match/".length) };
  }
  if (routeKey === "fixtures") {
    const rest = hash.slice("fixtures".length).replace(/^\//, "");
    const [year, month] = rest.split("-").map((n) => parseInt(n, 10));
    return { year: Number.isFinite(year) ? year : null, month: Number.isFinite(month) ? month : null };
  }
  return {};
}

export function startApp() {
  renderShell();
  applyTheme(localStorage.getItem("fsleo-theme") || "dark");
  onAuthChange((user) => {
    isAdminAuthed = !!user;
  });
  window.addEventListener("hashchange", renderRoute);
  renderRoute();
}
