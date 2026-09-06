import { loginAdmin, logoutAdmin, onAuthChange } from "../firebase.js";
import * as AdminPlayers from "./adminPlayers.js";
import * as AdminMatchForm from "./adminMatchForm.js";

const state = { tab: "match" }; // match | players

export function render(main) {
  let subCleanup = null;

  async function draw(user) {
    if (subCleanup) {
      subCleanup();
      subCleanup = null;
    }
    if (!user) {
      main.innerHTML = loginHtml();
      bindLogin();
      return;
    }
    main.innerHTML = authedShell();
    document.getElementById("admin-logout").addEventListener("click", () => logoutAdmin());
    main.querySelectorAll("[data-atab]").forEach((btn) => {
      btn.classList.toggle("active", btn.dataset.atab === state.tab);
      btn.addEventListener("click", () => {
        state.tab = btn.dataset.atab;
        draw(user);
      });
    });
    const body = document.getElementById("admin-tab-body");
    // AdminMatchForm.render is async (it awaits the player list) while
    // AdminPlayers.render is sync; await works for both since awaiting a
    // non-promise just resolves immediately with that value.
    subCleanup = await (state.tab === "match" ? AdminMatchForm.render(body) : AdminPlayers.render(body));
  }

  const unsubAuth = onAuthChange(draw);

  return () => {
    if (subCleanup) subCleanup();
    unsubAuth();
  };
}

function loginHtml() {
  return `
    <div class="admin-login">
      <h1>관리자 로그인</h1>
      <p>비밀번호를 입력하세요.</p>
      <div id="login-error" class="admin-error" style="display:none"></div>
      <input type="password" id="admin-pw" placeholder="비밀번호" />
      <button id="admin-login-btn">로그인</button>
    </div>
  `;
}

function bindLogin() {
  const doLogin = async () => {
    const pw = document.getElementById("admin-pw").value;
    const errBox = document.getElementById("login-error");
    errBox.style.display = "none";
    const btn = document.getElementById("admin-login-btn");
    btn.disabled = true;
    try {
      await loginAdmin(pw);
    } catch (e) {
      errBox.textContent = "로그인에 실패했습니다. 비밀번호를 확인해 주세요.";
      errBox.style.display = "block";
    } finally {
      btn.disabled = false;
    }
  };
  document.getElementById("admin-login-btn").addEventListener("click", doLogin);
  document.getElementById("admin-pw").addEventListener("keydown", (e) => {
    if (e.key === "Enter") doLogin();
  });
}

function authedShell() {
  return `
    <div class="admin-head">
      <div>
        <h1 class="page-title">관리자 모드</h1>
        <p class="page-sub" style="margin:0">경기 기록과 선수 명단을 관리합니다.</p>
      </div>
      <button class="btn" id="admin-logout">로그아웃</button>
    </div>
    <div class="tabs">
      <button class="tab-btn big" data-atab="match">경기 기록 입력</button>
      <button class="tab-btn big" data-atab="players">선수 관리</button>
    </div>
    <div id="admin-tab-body"></div>
  `;
}
