// 세션/가구 멤버십 관련 공용 헬퍼

async function getSession() {
  const { data } = await sb.auth.getSession();
  return data.session;
}

async function requireSession(redirectTo) {
  const session = await getSession();
  if (!session) {
    location.href = redirectTo || 'login.html';
    return null;
  }
  return session;
}

// 로그인한 사용자가 속한 가구 멤버십(+가구 정보)을 가져옴. 없으면 null.
async function getMyMembership(userId) {
  const { data, error } = await sb
    .from('members')
    .select('id, household_id, nickname, color, households ( id, name, invite_code )')
    .eq('user_id', userId)
    .limit(1)
    .maybeSingle();
  if (error) {
    console.error('멤버십 조회 실패', error);
    return null;
  }
  return data;
}

// app.html 등 "가구가 있어야 볼 수 있는" 화면 진입 가드
async function guardApp() {
  const session = await requireSession('login.html');
  if (!session) return null;
  const membership = await getMyMembership(session.user.id);
  if (!membership) {
    location.href = 'household-setup.html';
    return null;
  }
  return { session, membership };
}

// household-setup.html 진입 가드 — 이미 가구가 있으면 app으로 보냄
async function guardHouseholdSetup() {
  const session = await requireSession('login.html');
  if (!session) return null;
  const membership = await getMyMembership(session.user.id);
  if (membership) {
    location.href = 'app.html';
    return null;
  }
  return { session };
}

async function logout() {
  await sb.auth.signOut();
  location.href = 'login.html';
}

// ---- 다크모드 (localStorage, 기기별) ----
function initTheme() {
  const saved = localStorage.getItem('hl_theme');
  if (saved === 'dark') document.body.classList.add('dark');
}
function toggleTheme() {
  document.body.classList.toggle('dark');
  localStorage.setItem('hl_theme', document.body.classList.contains('dark') ? 'dark' : 'light');
}
function isDark() {
  return document.body.classList.contains('dark');
}

function showToast(msg) {
  let el = document.getElementById('hlToast');
  if (!el) {
    el = document.createElement('div');
    el.id = 'hlToast';
    el.className = 'toast';
    document.body.appendChild(el);
  }
  el.textContent = msg;
  el.classList.add('show');
  clearTimeout(el._t);
  el._t = setTimeout(() => el.classList.remove('show'), 2200);
}
