initTheme();

// ---------- 상태 ----------
let ctx = null;
let categories = [];
let accounts = [];
let members = [];
let currentMonth = new Date(currentDateOnly().getFullYear(), currentDateOnly().getMonth(), 1);
let monthTx = [];
let monthBudgets = [];
let activeTab = 'home';
let modalType = 'expense';
let selectedCategoryId = null;
let editingTxId = null;
let fixedExpenses = [];
let editingFixedId = null;
let selectedFixedCategoryId = null;

function currentDateOnly() { return new Date(); }

// ---------- 카테고리 색(라이트/다크) ----------
const CATEGORY_COLORS = {
  '식비/장보기': ['#F1E1B0', '#4A3E1E'],
  '외식/카페': ['#F3DCC0', '#4A331E'],
  '교통/차량': ['#EAD9BE', '#40331F'],
  '주거/공과금': ['#E9CBB0', '#43301E'],
  '통신비': ['#EDE0C0', '#423823'],
  '쇼핑/미용': ['#F0D3CE', '#452925'],
  '의료/건강': ['#F0CFC7', '#452420'],
  '보험': ['#D7DCC8', '#2E3327'],
  '문화/여가': ['#E9D6DE', '#3A2C33'],
  '육아/교육': ['#F3E7B8', '#423C1E'],
  '경조사/선물': ['#F2D7D0', '#442723'],
  '시댁용돈': ['#F0D7CE', '#452F28'],
  '친정용돈': ['#F2DCE0', '#452A30'],
  '남편용돈': ['#E3DAC0', '#3A3320'],
  '아내용돈': ['#F0D9DE', '#402B31'],
  '자녀용돈': ['#EEE0C5', '#3D3420'],
  '저축/예금/투자': ['#DCE3C0', '#2E331E'],
  '기타': ['#E7DED0', '#332C22'],
  '급여': ['#E4EBD3', '#33361E'],
  '부수입/용돈': ['#E4EBD3', '#33361E'],
  '이자/투자수익': ['#E4EBD3', '#33361E'],
  '기타수입': ['#E4EBD3', '#33361E'],
};
function catColor(name) {
  const pair = CATEGORY_COLORS[name] || CATEGORY_COLORS['기타'];
  return isDark() ? pair[1] : pair[0];
}

// ---------- 유틸 ----------
function fmtMoney(n) { return Math.round(n || 0).toLocaleString('ko-KR') + '원'; }
function fmtDate(d) { return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'); }
function ymKey(d) { return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0'); }
function monthLabel(d) { return d.getFullYear() + '년 ' + (d.getMonth() + 1) + '월'; }
function monthRange(d) {
  const start = new Date(d.getFullYear(), d.getMonth(), 1);
  const end = new Date(d.getFullYear(), d.getMonth() + 1, 0);
  return { start: fmtDate(start), end: fmtDate(end) };
}
function daysInMonth(d) { return new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate(); }
function escapeHtml(s) {
  return String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}
function capitalize(s) { return s[0].toUpperCase() + s.slice(1); }

// ---------- 초기화 ----------
async function init() {
  ctx = await guardApp();
  if (!ctx) return;

  document.getElementById('settingsHouseholdName').textContent = ctx.membership.households.name;
  document.getElementById('settingsInviteCode').textContent = ctx.membership.households.invite_code;

  await loadStaticData();
  await loadMembers();
  wireNav();
  wireAddModal();
  wireSettings();
  wireFixedModal();
  applyDarkUI();
  renderMembersCard();
  await loadFixedExpenses();
  await refreshMonth();
}

async function loadStaticData() {
  const [{ data: cats }, { data: accs }] = await Promise.all([
    sb.from('categories').select('*').eq('household_id', ctx.membership.household_id).order('sort_order'),
    sb.from('accounts').select('*').eq('household_id', ctx.membership.household_id).order('created_at'),
  ]);
  categories = cats || [];
  accounts = accs || [];
  populateAccountSelect();
  populateCategoryGrid();
  populateSettingsChips();
}

async function loadMembers() {
  const { data } = await sb.from('members').select('id, user_id, nickname').eq('household_id', ctx.membership.household_id);
  members = data || [];
}

// ---------- 탭/월 네비게이션 ----------
function wireNav() {
  document.getElementById('prevMonthBtn').addEventListener('click', () => shiftMonth(-1));
  document.getElementById('nextMonthBtn').addEventListener('click', () => shiftMonth(1));
  document.querySelectorAll('.monthPrevMirror').forEach(b => b.addEventListener('click', () => shiftMonth(-1)));
  document.querySelectorAll('.monthNextMirror').forEach(b => b.addEventListener('click', () => shiftMonth(1)));
  document.querySelectorAll('.tab').forEach(b => b.addEventListener('click', () => switchTab(b.dataset.tab)));
  document.querySelectorAll('.tabLink').forEach(b => b.addEventListener('click', () => switchTab(b.dataset.tab)));
}

function shiftMonth(delta) {
  currentMonth = new Date(currentMonth.getFullYear(), currentMonth.getMonth() + delta, 1);
  refreshMonth();
}

function switchTab(name) {
  activeTab = name;
  ['home', 'list', 'stats', 'budget', 'settings'].forEach(t => {
    document.getElementById('tab' + capitalize(t)).classList.toggle('hidden', t !== name);
  });
  document.querySelectorAll('.tab').forEach(b => b.classList.toggle('active', b.dataset.tab === name));
  renderActiveTab();
}

async function refreshMonth() {
  const ym = ymKey(currentMonth);
  const { start, end } = monthRange(currentMonth);
  document.getElementById('monthLabel').textContent = monthLabel(currentMonth);
  document.querySelectorAll('.monthLabelMirror').forEach(el => el.textContent = monthLabel(currentMonth));
  document.getElementById('budgetTitle').textContent = monthLabel(currentMonth) + ' 예산';

  const { data: txs } = await sb.from('transactions')
    .select('id, amount, type, memo, date, source, category_id, account_id, member_id, categories(name,icon,type), members(nickname)')
    .eq('household_id', ctx.membership.household_id)
    .gte('date', start).lte('date', end)
    .order('date', { ascending: false })
    .order('created_at', { ascending: false });
  monthTx = txs || [];

  const { data: budgetRows } = await sb.from('budgets')
    .select('*').eq('household_id', ctx.membership.household_id).eq('year_month', ym);
  monthBudgets = budgetRows || [];

  renderActiveTab();
}

function renderActiveTab() {
  if (activeTab === 'home') renderHome();
  else if (activeTab === 'list') renderList();
  else if (activeTab === 'stats') renderStats();
  else if (activeTab === 'budget') renderBudget();
  else if (activeTab === 'settings') { populateSettingsChips(); renderMembersCard(); }
}

// ---------- 집계 ----------
function aggregate() {
  let income = 0, expense = 0;
  const byCategory = {};
  const byMember = {};
  monthTx.forEach(t => {
    const amt = Number(t.amount);
    if (t.type === 'income') income += amt; else expense += amt;
    const cid = t.category_id || 'none';
    if (!byCategory[cid]) byCategory[cid] = { name: t.categories?.name || '미분류', icon: t.categories?.icon || '🗂️', type: t.type, sum: 0 };
    byCategory[cid].sum += amt;
    if (t.type === 'expense') {
      const mid = t.member_id;
      if (!byMember[mid]) byMember[mid] = { nickname: t.members?.nickname || '?', sum: 0 };
      byMember[mid].sum += amt;
    }
  });
  return { income, expense, byCategory, byMember };
}

// ---------- 홈 ----------
function renderHome() {
  const { income, expense, byCategory, byMember } = aggregate();
  document.getElementById('sumIncome').textContent = fmtMoney(income);
  document.getElementById('sumExpense').textContent = fmtMoney(expense);
  document.getElementById('sumNet').textContent = fmtMoney(income - expense);

  const totalBudget = monthBudgets.reduce((s, b) => s + Number(b.limit_amount), 0);
  const pct = totalBudget > 0 ? Math.round(expense / totalBudget * 100) : 0;
  document.getElementById('budgetPctLabel').textContent = pct + '%';
  const fill = document.getElementById('budgetBarFill');
  fill.style.width = Math.min(pct, 100) + '%';
  fill.style.background = pct >= 100 ? 'var(--danger)' : pct >= 80 ? 'var(--warn)' : 'var(--income)';
  document.getElementById('budgetSubLabel').textContent = totalBudget > 0
    ? `${fmtMoney(totalBudget)} 중 ${fmtMoney(expense)} 사용`
    : '아직 설정된 예산이 없어요 (예산 탭에서 설정해보세요)';

  const banners = [];
  monthBudgets.forEach(b => {
    if (Number(b.limit_amount) <= 0) return;
    const cat = categories.find(c => c.id === b.category_id);
    if (!cat) return;
    const spent = byCategory[b.category_id]?.sum || 0;
    const p = spent / Number(b.limit_amount) * 100;
    if (p >= 80) banners.push({ name: cat.name, icon: cat.icon, spent, limit: Number(b.limit_amount), pct: p });
  });
  banners.sort((a, b) => b.pct - a.pct);
  document.getElementById('alertBanners').innerHTML = banners.slice(0, 3).map(b => {
    const over = b.pct >= 100;
    const msg = over ? `예산을 ${Math.round(b.pct - 100)}% 초과했어요` : `예산의 ${Math.round(b.pct)}%를 사용했어요`;
    return `<div style="display:flex;align-items:center;gap:10px;border-radius:12px;background:${over ? 'var(--danger-soft)' : 'var(--warn-soft)'};padding:12px 14px;">
      <div style="font-size:15px;">${over ? '🔴' : '⚠️'}</div>
      <div style="font-size:12.5px;font-weight:600;line-height:1.4;">${b.icon} ${escapeHtml(b.name)} ${msg}<br><span style="color:var(--subtext);font-weight:500;">${fmtMoney(b.spent)} / ${fmtMoney(b.limit)}</span></div>
    </div>`;
  }).join('');

  const memberVals = Object.values(byMember);
  document.getElementById('memberSummary').innerHTML = memberVals.length ? memberVals.map(m => `
    <div class="card" style="flex:1;min-width:120px;display:flex;align-items:center;gap:10px;padding:14px;">
      <div style="width:34px;height:34px;border-radius:50%;background:var(--accent-soft);display:flex;align-items:center;justify-content:center;font-size:16px;">😊</div>
      <div><div style="font-size:12px;color:var(--subtext);font-weight:600;">${escapeHtml(m.nickname)}</div><div style="font-size:13.5px;font-weight:700;">${fmtMoney(m.sum)}</div></div>
    </div>`).join('') : `<div style="font-size:12.5px;color:var(--subtext);">이번 달 지출 내역이 없어요</div>`;

  document.getElementById('recentList').innerHTML = renderTxRows(monthTx.slice(0, 4), false);
}

function renderTxRows(list, showActions) {
  if (!list.length) return `<div style="font-size:12.5px;color:var(--subtext);">내역이 없어요</div>`;
  return list.map(t => {
    const icon = t.categories?.icon || '🗂️';
    const name = t.memo || t.categories?.name || '내역';
    const sign = t.type === 'income' ? '+' : '-';
    const color = t.type === 'income' ? 'var(--income)' : 'var(--expense)';
    const bg = catColor(t.categories?.name);
    const dateShort = t.date.slice(5).replace('-', '/');
    const actions = showActions ? `
      <button data-edit="${t.id}" style="background:none;border:none;color:var(--subtext);font-size:11px;">수정</button>
      <button data-del="${t.id}" style="background:none;border:none;color:var(--danger);font-size:11px;">삭제</button>` : '';
    return `<div style="display:flex;align-items:center;gap:12px;">
      <div style="width:40px;height:40px;border-radius:12px;background:${bg};display:flex;align-items:center;justify-content:center;font-size:18px;flex-shrink:0;">${icon}</div>
      <div style="flex:1;min-width:0;"><div style="font-size:13.5px;font-weight:700;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${escapeHtml(name)}</div><div style="font-size:11.5px;color:var(--subtext);overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${escapeHtml(t.members?.nickname || '')} · ${dateShort}</div></div>
      <div style="display:flex;flex-direction:column;align-items:flex-end;gap:4px;">
        <div style="font-size:13.5px;font-weight:700;color:${color};">${sign}${fmtMoney(t.amount)}</div>
        <div style="display:flex;gap:8px;">${actions}</div>
      </div>
    </div>`;
  }).join('');
}

// ---------- 내역 목록 ----------
function renderList() {
  const groups = {};
  monthTx.forEach(t => { (groups[t.date] = groups[t.date] || []).push(t); });
  const dates = Object.keys(groups).sort((a, b) => b.localeCompare(a));
  const dayNames = ['일', '월', '화', '수', '목', '금', '토'];
  const html = dates.map(d => {
    const label = d.slice(5).replace('-', '/') + ' (' + dayNames[new Date(d + 'T00:00:00').getDay()] + ')';
    return `<div style="font-size:12.5px;font-weight:700;color:var(--subtext);margin-top:20px;">${label}</div>
      <div style="margin-top:10px;display:flex;flex-direction:column;gap:12px;">${renderTxRows(groups[d], true)}</div>`;
  }).join('');
  document.getElementById('listContainer').innerHTML = html || `<div style="font-size:12.5px;color:var(--subtext);margin-top:20px;">이번 달 내역이 없어요</div>`;
  document.querySelectorAll('[data-del]').forEach(b => b.addEventListener('click', () => deleteTx(b.dataset.del)));
  document.querySelectorAll('[data-edit]').forEach(b => b.addEventListener('click', () => openAddModal(b.dataset.edit)));
}

async function deleteTx(id) {
  if (!confirm('삭제할까요?')) return;
  const { error } = await sb.from('transactions').delete().eq('id', id);
  if (error) { showToast('삭제 실패'); return; }
  await refreshMonth();
  showToast('삭제했어요');
}

// ---------- 통계 ----------
async function renderStats() {
  const { income, expense, byCategory, byMember } = aggregate();
  const expenseCats = Object.values(byCategory).filter(c => c.type === 'expense' && c.sum > 0).sort((a, b) => b.sum - a.sum);

  let acc = 0;
  const stops = expenseCats.map(c => {
    const pct = expense > 0 ? c.sum / expense * 100 : 0;
    const from = acc; acc += pct;
    return `${catColor(c.name)} ${from.toFixed(1)}% ${acc.toFixed(1)}%`;
  }).join(', ');
  const legend = expenseCats.map(c => {
    const pct = expense > 0 ? Math.round(c.sum / expense * 100) : 0;
    return `<div style="display:flex;align-items:center;gap:7px;font-size:11.5px;"><span style="width:9px;height:9px;border-radius:50%;background:${catColor(c.name)};flex-shrink:0;"></span>${c.icon} ${escapeHtml(c.name)} ${pct}%</div>`;
  }).join('');

  const catCard = `<div class="card"><div style="font-size:13.5px;font-weight:800;">카테고리별 지출</div>
    <div style="margin-top:16px;display:flex;align-items:center;gap:20px;">
      <div style="position:relative;width:132px;height:132px;flex-shrink:0;border-radius:50%;background:${expense > 0 ? `conic-gradient(${stops})` : 'var(--surface-alt)'};">
        <div style="position:absolute;inset:20px;border-radius:50%;background:var(--surface);display:flex;flex-direction:column;align-items:center;justify-content:center;">
          <div style="font-size:10.5px;color:var(--subtext);font-weight:600;">총 지출</div>
          <div style="font-size:13px;font-weight:800;">${fmtMoney(expense)}</div>
        </div>
      </div>
      <div style="display:flex;flex-direction:column;gap:8px;flex:1;">${legend || '<span style="font-size:11.5px;color:var(--subtext);">지출 내역이 없어요</span>'}</div>
    </div>
  </div>`;

  const trendCard = await renderTrendCard();

  const budgetRows = monthBudgets.filter(b => Number(b.limit_amount) > 0).map(b => {
    const cat = categories.find(c => c.id === b.category_id);
    if (!cat) return '';
    const spent = byCategory[b.category_id]?.sum || 0;
    const pct = Math.round(spent / Number(b.limit_amount) * 100);
    const color = pct >= 100 ? 'var(--danger)' : pct >= 80 ? 'var(--warn)' : 'var(--income)';
    return `<div>
      <div style="display:flex;justify-content:space-between;font-size:12px;margin-bottom:6px;"><span>${cat.icon} ${escapeHtml(cat.name)}</span><span style="font-weight:700;color:${color};">${pct}%</span></div>
      <div style="height:8px;border-radius:5px;background:var(--surface-alt);"><div style="width:${Math.min(pct, 100)}%;height:100%;border-radius:5px;background:${color};"></div></div>
    </div>`;
  }).join('');
  const budgetCard = `<div class="card"><div style="font-size:13.5px;font-weight:800;">카테고리별 예산 대비</div>
    <div style="margin-top:16px;display:flex;flex-direction:column;gap:14px;">${budgetRows || '<span style="font-size:11.5px;color:var(--subtext);">설정된 예산이 없어요</span>'}</div></div>`;

  const memberVals = Object.values(byMember);
  const maxM = Math.max(1, ...memberVals.map(m => m.sum));
  const memberRows = memberVals.map(m => `
    <div><div style="display:flex;justify-content:space-between;font-size:12px;margin-bottom:6px;"><span>😊 ${escapeHtml(m.nickname)}</span><span style="font-weight:700;">${fmtMoney(m.sum)}</span></div>
    <div style="height:10px;border-radius:6px;background:var(--surface-alt);"><div style="width:${(m.sum / maxM * 100).toFixed(0)}%;height:100%;border-radius:6px;background:var(--accent);"></div></div></div>`).join('');
  const memberCard = `<div class="card"><div style="font-size:13.5px;font-weight:800;">구성원별 지출 비교</div>
    <div style="margin-top:16px;display:flex;flex-direction:column;gap:12px;">${memberRows || '<span style="font-size:11.5px;color:var(--subtext);">데이터가 없어요</span>'}</div></div>`;

  document.getElementById('statsContainer').innerHTML = catCard + trendCard + budgetCard + memberCard;
}

async function renderTrendCard() {
  const months = [];
  for (let i = 5; i >= 0; i--) months.push(new Date(currentMonth.getFullYear(), currentMonth.getMonth() - i, 1));
  const start = monthRange(months[0]).start;
  const end = monthRange(months[5]).end;
  const { data } = await sb.from('transactions').select('amount,date')
    .eq('household_id', ctx.membership.household_id).eq('type', 'expense')
    .gte('date', start).lte('date', end);
  const sums = months.map(() => 0);
  (data || []).forEach(t => {
    const d = new Date(t.date + 'T00:00:00');
    const idx = months.findIndex(m => m.getFullYear() === d.getFullYear() && m.getMonth() === d.getMonth());
    if (idx >= 0) sums[idx] += Number(t.amount);
  });
  const max = Math.max(1, ...sums);
  const bars = months.map((m, i) => {
    const h = Math.round(sums[i] / max * 90);
    const isCur = i === 5;
    return `<div style="display:flex;flex-direction:column;align-items:center;gap:6px;"><div style="width:22px;height:${h || 2}px;border-radius:6px;background:${isCur ? 'var(--expense)' : 'var(--expense-soft)'};"></div><span style="font-size:10.5px;font-weight:${isCur ? 700 : 400};color:${isCur ? 'var(--text)' : 'var(--subtext)'};">${m.getMonth() + 1}월</span></div>`;
  }).join('');
  return `<div class="card"><div style="font-size:13.5px;font-weight:800;">월별 추이</div><div style="margin-top:18px;display:flex;align-items:flex-end;justify-content:space-between;height:90px;">${bars}</div></div>`;
}

// ---------- 예산 ----------
function renderBudget() {
  const expenseCats = categories.filter(c => c.type === 'expense').slice().sort((a, b) => a.sort_order - b.sort_order);
  const rows = expenseCats.map(cat => {
    const b = monthBudgets.find(x => x.category_id === cat.id);
    const val = b ? Number(b.limit_amount) : 0;
    return `<div>
      <div style="display:flex;align-items:center;gap:10px;">
        <div style="width:36px;height:36px;border-radius:11px;background:${catColor(cat.name)};display:flex;align-items:center;justify-content:center;font-size:16px;flex-shrink:0;">${cat.icon}</div>
        <div style="flex:1;min-width:0;font-size:13px;font-weight:600;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${escapeHtml(cat.name)}</div>
      </div>
      <input data-budget-cat="${cat.id}" type="number" inputmode="numeric" value="${val || ''}" placeholder="0" style="margin-top:8px;width:100%;box-sizing:border-box;text-align:right;border:1px solid var(--border);border-radius:10px;padding:9px 12px;font-size:13px;font-weight:700;background:var(--surface);color:var(--text);">
    </div>`;
  }).join('');
  document.getElementById('budgetRows').innerHTML = rows;
  document.querySelectorAll('[data-budget-cat]').forEach(inp => {
    inp.addEventListener('change', () => saveBudget(inp.dataset.budgetCat, inp.value));
  });
  const total = monthBudgets.reduce((s, b) => s + Number(b.limit_amount), 0);
  document.getElementById('budgetTotal').textContent = fmtMoney(total);
}

async function saveBudget(categoryId, value) {
  const ym = ymKey(currentMonth);
  const amount = Number(value) || 0;
  const { error } = await sb.from('budgets').upsert(
    { household_id: ctx.membership.household_id, category_id: categoryId, year_month: ym, limit_amount: amount },
    { onConflict: 'household_id,category_id,year_month' }
  );
  if (error) { showToast('저장 실패: ' + error.message); return; }
  await refreshMonth();
  showToast('저장했어요');
}

// ---------- 설정 ----------
function populateSettingsChips() {
  document.getElementById('accountsChips').innerHTML = accounts.map(a =>
    `<div class="card" style="padding:8px 14px;border-radius:20px;font-size:12.5px;">${escapeHtml(a.name)}</div>`
  ).join('');
  document.getElementById('categoriesChips').innerHTML = categories.map(c =>
    `<div style="width:34px;height:34px;border-radius:10px;background:${catColor(c.name)};display:flex;align-items:center;justify-content:center;font-size:15px;" title="${escapeHtml(c.name)}">${c.icon}</div>`
  ).join('');
}

function renderMembersCard() {
  const html = members.map(m => {
    const isMe = m.id === ctx.membership.id;
    return `<div style="display:flex;align-items:center;gap:10px;padding:14px 16px;border-bottom:1px solid var(--border);">
      <div style="width:30px;height:30px;border-radius:50%;background:var(--accent-soft);display:flex;align-items:center;justify-content:center;font-size:14px;">😊</div>
      <div style="flex:1;font-size:13.5px;">${escapeHtml(m.nickname)}${isMe ? ' (나)' : ''}</div>
      ${!isMe ? `<button data-remove-member="${m.id}" style="background:none;border:none;font-size:12px;font-weight:700;color:var(--subtext);">내보내기</button>` : ''}
    </div>`;
  }).join('');
  document.getElementById('membersCard').innerHTML = html;
  document.querySelectorAll('[data-remove-member]').forEach(b => b.addEventListener('click', async () => {
    if (!confirm('내보낼까요?')) return;
    await sb.from('members').delete().eq('id', b.dataset.removeMember);
    await loadMembers();
    renderMembersCard();
  }));
}

function wireSettings() {
  document.getElementById('reissueCodeBtn').addEventListener('click', async () => {
    const { data, error } = await sb.rpc('reissue_invite_code', { p_household_id: ctx.membership.household_id });
    if (error) { showToast('재발급 실패'); return; }
    document.getElementById('settingsInviteCode').textContent = data;
    showToast('새 초대코드가 발급됐어요');
  });
  document.getElementById('addAccountBtn').addEventListener('click', async () => {
    const name = prompt('계좌 이름 (예: 신한카드)');
    if (!name) return;
    await sb.from('accounts').insert({ household_id: ctx.membership.household_id, name, type: 'card' });
    await loadStaticData();
  });
  document.getElementById('addCategoryBtn').addEventListener('click', async () => {
    const name = prompt('카테고리 이름');
    if (!name) return;
    const icon = prompt('아이콘(이모지 1개)', '🗂️') || '🗂️';
    const type = confirm('지출 카테고리인가요? (취소를 누르면 수입으로 추가됩니다)') ? 'expense' : 'income';
    await sb.from('categories').insert({ household_id: ctx.membership.household_id, name, icon, type, sort_order: 99 });
    await loadStaticData();
  });
  document.getElementById('darkToggleBtn').addEventListener('click', () => {
    toggleTheme();
    applyDarkUI();
    renderActiveTab();
  });
  document.getElementById('copyLastMonthBtn').addEventListener('click', copyLastMonthBudget);
  document.getElementById('logoutBtn').addEventListener('click', logout);
}

function applyDarkUI() {
  const dark = isDark();
  document.getElementById('darkKnob').style.left = dark ? '22px' : '2px';
  document.getElementById('darkToggleBtn').style.background = dark ? 'var(--accent)' : 'var(--border)';
}

async function copyLastMonthBudget() {
  const prevMonth = new Date(currentMonth.getFullYear(), currentMonth.getMonth() - 1, 1);
  const prevYm = ymKey(prevMonth);
  const { data: prevBudgets } = await sb.from('budgets').select('*')
    .eq('household_id', ctx.membership.household_id).eq('year_month', prevYm);
  if (!prevBudgets || !prevBudgets.length) { showToast('지난달 예산이 없어요'); return; }
  const ym = ymKey(currentMonth);
  const rows = prevBudgets.map(b => ({ household_id: ctx.membership.household_id, category_id: b.category_id, year_month: ym, limit_amount: b.limit_amount }));
  const { error } = await sb.from('budgets').upsert(rows, { onConflict: 'household_id,category_id,year_month' });
  if (error) { showToast('복사 실패'); return; }
  await refreshMonth();
  showToast('지난달 예산을 복사했어요');
}

// ---------- 내역 추가/수정 모달 ----------
function wireAddModal() {
  document.getElementById('fabAdd').addEventListener('click', () => openAddModal());
  document.getElementById('closeAddBtn').addEventListener('click', closeAddModal);
  document.getElementById('typeExpenseBtn').addEventListener('click', () => setModalType('expense'));
  document.getElementById('typeIncomeBtn').addEventListener('click', () => setModalType('income'));
  document.getElementById('togglePasteBtn').addEventListener('click', () => {
    document.getElementById('pasteBox').classList.toggle('hidden');
  });
  document.getElementById('parseBtn').addEventListener('click', parsePastedMessage);
  document.getElementById('saveTxBtn').addEventListener('click', saveTransaction);
}

function openAddModal(editId) {
  editingTxId = editId || null;
  document.getElementById('addOverlay').classList.remove('hidden');
  document.getElementById('addModalTitle').textContent = editId ? '내역 수정' : '내역 추가';
  document.getElementById('pasteBox').classList.add('hidden');
  const resultEl = document.getElementById('parseResult');
  resultEl.classList.add('hidden');
  resultEl.style.background = 'var(--income-soft)';
  document.getElementById('pasteText').value = '';

  if (editId) {
    const t = monthTx.find(x => x.id === editId);
    if (t) {
      setModalType(t.type, t.category_id);
      document.getElementById('amountInput').value = t.amount;
      document.getElementById('dateInput').value = t.date;
      document.getElementById('memoInput').value = t.memo || '';
      document.getElementById('accountSelect').value = t.account_id || '';
      return;
    }
  }
  setModalType('expense', null);
  document.getElementById('amountInput').value = '';
  document.getElementById('dateInput').value = fmtDate(new Date());
  document.getElementById('memoInput').value = '';
}

function closeAddModal() {
  document.getElementById('addOverlay').classList.add('hidden');
  editingTxId = null;
}

function setModalType(type, keepCategoryId) {
  modalType = type;
  const expBtn = document.getElementById('typeExpenseBtn');
  const incBtn = document.getElementById('typeIncomeBtn');
  if (type === 'expense') {
    expBtn.style.background = 'var(--expense)'; expBtn.style.color = '#fff';
    incBtn.style.background = 'transparent'; incBtn.style.color = 'var(--subtext)';
  } else {
    incBtn.style.background = 'var(--income)'; incBtn.style.color = '#fff';
    expBtn.style.background = 'transparent'; expBtn.style.color = 'var(--subtext)';
  }
  selectedCategoryId = keepCategoryId !== undefined ? keepCategoryId : null;
  populateCategoryGrid();
}

function populateCategoryGrid() {
  const list = categories.filter(c => c.type === modalType);
  document.getElementById('categoryGrid').innerHTML = list.map(c => `
    <button type="button" class="cat-chip ${c.id === selectedCategoryId ? 'selected' : ''}" data-cat="${c.id}">
      <div class="icon" style="background:${catColor(c.name)};">${c.icon}</div>
      <span>${escapeHtml(c.name)}</span>
    </button>`).join('');
  document.querySelectorAll('#categoryGrid [data-cat]').forEach(b => b.addEventListener('click', () => {
    selectedCategoryId = b.dataset.cat;
    populateCategoryGrid();
  }));
}

function populateAccountSelect() {
  document.getElementById('accountSelect').innerHTML = accounts.map(a => `<option value="${a.id}">${escapeHtml(a.name)}</option>`).join('');
}

async function saveTransaction() {
  const amount = Number(document.getElementById('amountInput').value);
  if (!amount || amount <= 0) { showToast('금액을 입력해주세요'); return; }
  if (!selectedCategoryId) { showToast('카테고리를 선택해주세요'); return; }
  const payload = {
    household_id: ctx.membership.household_id,
    account_id: document.getElementById('accountSelect').value || null,
    category_id: selectedCategoryId,
    member_id: ctx.membership.id,
    amount, type: modalType,
    memo: document.getElementById('memoInput').value.trim() || null,
    date: document.getElementById('dateInput').value,
  };
  let error;
  if (editingTxId) {
    ({ error } = await sb.from('transactions').update(payload).eq('id', editingTxId));
  } else {
    payload.source = document.getElementById('pasteBox').classList.contains('hidden') ? 'manual' : 'paste';
    ({ error } = await sb.from('transactions').insert(payload));
  }
  if (error) { showToast('저장 실패: ' + error.message); return; }
  closeAddModal();
  await refreshMonth();
  showToast('저장했어요');
}

// ---------- 문자 붙여넣기 반자동 파싱 (기획서 6-1) ----------
function parsePastedMessage() {
  const raw = document.getElementById('pasteText').value;
  const resultEl = document.getElementById('parseResult');
  if (!raw.trim()) return;

  // 금액 추출: 숫자 바로 앞 문맥(최대 12자)에 "누적/잔액/한도/포인트"가 있으면 그 숫자는 건너뜀.
  // 줄바꿈 유무와 상관없이(문자 앱마다 한 줄로 붙는 경우가 많음) 숫자 위치 기준으로 판단.
  const excludeWords = ['누적', '잔액', '한도', '포인트'];
  const amountRe = /([\d,]{1,12})\s*원/g;
  let amount = null;
  let m;
  while ((m = amountRe.exec(raw)) !== null) {
    const context = raw.slice(Math.max(0, m.index - 12), m.index);
    if (excludeWords.some(w => context.includes(w))) continue;
    amount = Number(m[1].replace(/,/g, ''));
    break;
  }

  const expenseWords = ['승인', '결제', '출금', '일시불', '할부', '사용'];
  const incomeWords = ['입금', '이체입금', '급여', '환급', '캐시백'];
  const type = (incomeWords.some(w => raw.includes(w)) && !expenseWords.some(w => raw.includes(w))) ? 'income' : 'expense';

  const dateMatch = raw.match(/(\d{1,2})[\/.](\d{1,2})\s*(\d{1,2}):(\d{2})/);
  let dateStr = fmtDate(new Date());
  if (dateMatch) {
    const now = new Date();
    dateStr = `${now.getFullYear()}-${String(dateMatch[1]).padStart(2, '0')}-${String(dateMatch[2]).padStart(2, '0')}`;
  }

  const stripped = raw
    .replace(/\[[^\]]*\]/g, ' ')
    .replace(/([\d,]{1,12})\s*원/g, ' ')
    .replace(/\d{1,2}[\/.]\d{1,2}\s*\d{1,2}:\d{2}/g, ' ')
    .replace(/누적.*$/gm, ' ')
    .replace(/잔액.*$/gm, ' ')
    .replace(/(승인|결제|출금|일시불|할부|사용|입금|이체입금|급여|환급|캐시백|Web발신|카드|은행|님)/g, ' ');
  // 가맹점명 후보: 한글이 하나라도 포함된 토큰만 대상으로(숫자/기호만 남은 파편 배제), 가장 긴 것을 채택.
  const tokens = stripped.split(/\s+/).map(s => s.trim()).filter(s => s.length >= 2 && /[가-힣]/.test(s));
  const merchant = tokens.sort((a, b) => b.length - a.length)[0] || '';

  const bracketMatch = raw.match(/\[([^\]]+)\]/);
  const bracket = bracketMatch ? bracketMatch[1] : '';
  const matchedAccount = accounts.find(a => bracket && (bracket.includes(a.name) || a.name.includes(bracket)));

  if (amount) document.getElementById('amountInput').value = amount;
  document.getElementById('dateInput').value = dateStr;
  setModalType(type, selectedCategoryId);
  if (matchedAccount) document.getElementById('accountSelect').value = matchedAccount.id;
  if (merchant) document.getElementById('memoInput').value = merchant;

  resultEl.classList.remove('hidden');
  if (amount) {
    resultEl.style.background = 'var(--income-soft)';
    resultEl.innerHTML = `✅ 금액 <b>${fmtMoney(amount)}</b>${merchant ? ` · 가맹점 "<b>${escapeHtml(merchant)}</b>"` : ''}을 확인했어요.<br>카테고리를 골라주세요 →`;
  } else {
    resultEl.style.background = 'var(--danger-soft)';
    resultEl.innerHTML = `자동 인식에 실패했어요. 직접 입력해주세요.`;
    document.getElementById('memoInput').value = raw.slice(0, 200);
  }
}

// ---------- 고정지출 관리 ----------
async function loadFixedExpenses() {
  const { data } = await sb.from('fixed_expenses').select('*')
    .eq('household_id', ctx.membership.household_id).order('day_of_month');
  fixedExpenses = data || [];
  renderFixedList();
}

// 카테고리 이름 기준으로 고정지출을 용돈/보험/저축·예금/그 외로 묶어서 보여줌
function fixedGroupLabel(categoryName) {
  if (!categoryName) return '그 외';
  if (categoryName.includes('용돈')) return '용돈';
  if (categoryName === '보험') return '보험';
  if (categoryName === '저축/예금/투자') return '저축/예금';
  return '생활비 등';
}
const FIXED_GROUP_ORDER = ['용돈', '보험', '저축/예금', '생활비 등', '그 외'];

function renderFixedList() {
  const el = document.getElementById('fixedList');
  if (!fixedExpenses.length) {
    el.innerHTML = `<div style="padding:16px;font-size:12.5px;color:var(--subtext);">등록된 고정지출이 없어요</div>`;
    return;
  }

  const groups = {};
  fixedExpenses.forEach(f => {
    const cat = categories.find(c => c.id === f.category_id);
    const label = fixedGroupLabel(cat ? cat.name : null);
    (groups[label] = groups[label] || []).push(f);
  });

  const rowHtml = (f) => {
    const cat = categories.find(c => c.id === f.category_id);
    const iconBg = cat ? catColor(cat.name) : 'var(--surface-alt)';
    return `<div style="display:flex;align-items:center;gap:10px;padding:14px 16px;border-bottom:1px solid var(--border);opacity:${f.is_active ? 1 : 0.5};">
      <div data-edit-fixed="${f.id}" style="display:flex;align-items:center;gap:10px;flex:1;min-width:0;cursor:pointer;">
        <div style="width:34px;height:34px;border-radius:10px;background:${iconBg};display:flex;align-items:center;justify-content:center;font-size:15px;flex-shrink:0;">${cat ? cat.icon : '🗂️'}</div>
        <div style="min-width:0;">
          <div style="font-size:13px;font-weight:700;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${escapeHtml(f.name)}</div>
          <div style="font-size:11px;color:var(--subtext);overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">매월 ${f.day_of_month}일 · ${fmtMoney(f.amount)}</div>
        </div>
      </div>
      <button data-toggle-fixed="${f.id}" style="background:none;border:none;font-size:11px;font-weight:700;color:var(--subtext);">${f.is_active ? '끄기' : '켜기'}</button>
    </div>`;
  };

  el.innerHTML = FIXED_GROUP_ORDER.filter(label => groups[label]).map(label => {
    const items = groups[label];
    const groupTotal = items.filter(f => f.is_active).reduce((s, f) => s + Number(f.amount), 0);
    return `<div style="display:flex;justify-content:space-between;align-items:center;padding:10px 16px;background:var(--surface-alt);">
        <span style="font-size:11.5px;font-weight:700;color:var(--subtext);">${label}</span>
        <span style="font-size:11.5px;font-weight:700;color:var(--subtext);">${fmtMoney(groupTotal)}</span>
      </div>${items.map(rowHtml).join('')}`;
  }).join('');

  document.querySelectorAll('[data-edit-fixed]').forEach(elm => elm.addEventListener('click', () => openFixedModal(elm.dataset.editFixed)));
  document.querySelectorAll('[data-toggle-fixed]').forEach(elm => elm.addEventListener('click', async () => {
    const f = fixedExpenses.find(x => x.id === elm.dataset.toggleFixed);
    await sb.from('fixed_expenses').update({ is_active: !f.is_active }).eq('id', f.id);
    await loadFixedExpenses();
  }));
}

function wireFixedModal() {
  document.getElementById('addFixedBtn').addEventListener('click', () => openFixedModal());
  document.getElementById('closeFixedBtn').addEventListener('click', closeFixedModal);
  document.getElementById('saveFixedBtn').addEventListener('click', saveFixedExpense);
  document.getElementById('deleteFixedBtn').addEventListener('click', deleteFixedExpense);
  document.getElementById('applyFixedBtn').addEventListener('click', applyFixedExpensesThisMonth);
}

function openFixedModal(id) {
  editingFixedId = id || null;
  document.getElementById('fixedOverlay').classList.remove('hidden');
  document.getElementById('fixedModalTitle').textContent = id ? '고정지출 수정' : '고정지출 추가';
  document.getElementById('deleteFixedBtn').classList.toggle('hidden', !id);
  if (id) {
    const f = fixedExpenses.find(x => x.id === id);
    document.getElementById('fixedName').value = f.name;
    document.getElementById('fixedAmount').value = f.amount;
    document.getElementById('fixedDay').value = f.day_of_month;
    document.getElementById('fixedAccountSelect').value = f.account_id || '';
    selectedFixedCategoryId = f.category_id;
  } else {
    document.getElementById('fixedName').value = '';
    document.getElementById('fixedAmount').value = '';
    document.getElementById('fixedDay').value = '';
    document.getElementById('fixedAccountSelect').value = '';
    selectedFixedCategoryId = null;
  }
  populateFixedCategoryGrid();
}

function closeFixedModal() {
  document.getElementById('fixedOverlay').classList.add('hidden');
  editingFixedId = null;
}

function populateFixedCategoryGrid() {
  const list = categories.filter(c => c.type === 'expense');
  document.getElementById('fixedCategoryGrid').innerHTML = list.map(c => `
    <button type="button" class="cat-chip ${c.id === selectedFixedCategoryId ? 'selected' : ''}" data-fixed-cat="${c.id}">
      <div class="icon" style="background:${catColor(c.name)};">${c.icon}</div>
      <span>${escapeHtml(c.name)}</span>
    </button>`).join('');
  document.querySelectorAll('#fixedCategoryGrid [data-fixed-cat]').forEach(b => b.addEventListener('click', () => {
    selectedFixedCategoryId = b.dataset.fixedCat;
    populateFixedCategoryGrid();
  }));
}

async function saveFixedExpense() {
  const name = document.getElementById('fixedName').value.trim();
  const amount = Number(document.getElementById('fixedAmount').value);
  const day = Number(document.getElementById('fixedDay').value);
  if (!name) { showToast('이름을 입력해주세요'); return; }
  if (!amount || amount <= 0) { showToast('금액을 입력해주세요'); return; }
  if (!day || day < 1 || day > 28) { showToast('날짜는 1~28 사이로 입력해주세요'); return; }
  if (!selectedFixedCategoryId) { showToast('카테고리를 선택해주세요'); return; }
  const payload = {
    household_id: ctx.membership.household_id,
    category_id: selectedFixedCategoryId,
    account_id: document.getElementById('fixedAccountSelect').value || null,
    name, amount, day_of_month: day,
  };
  let error;
  if (editingFixedId) {
    ({ error } = await sb.from('fixed_expenses').update(payload).eq('id', editingFixedId));
  } else {
    ({ error } = await sb.from('fixed_expenses').insert(payload));
  }
  if (error) { showToast('저장 실패: ' + error.message); return; }
  closeFixedModal();
  await loadFixedExpenses();
  showToast('저장했어요');
}

async function deleteFixedExpense() {
  if (!editingFixedId) return;
  if (!confirm('삭제할까요? (이미 반영된 지난 내역은 그대로 남아요)')) return;
  const { error } = await sb.from('fixed_expenses').delete().eq('id', editingFixedId);
  if (error) { showToast('삭제 실패: ' + error.message); return; }
  closeFixedModal();
  await loadFixedExpenses();
  showToast('삭제했어요');
}

// 활성 고정지출을 이번 달 내역으로 생성(이미 반영된 항목은 건너뜀 — fixed_expense_id로 중복 방지)
async function applyFixedExpensesThisMonth() {
  const active = fixedExpenses.filter(f => f.is_active);
  if (!active.length) { showToast('등록된(켜져 있는) 고정지출이 없어요'); return; }

  const { start, end } = monthRange(currentMonth);
  const { data: existing } = await sb.from('transactions')
    .select('fixed_expense_id')
    .eq('household_id', ctx.membership.household_id)
    .gte('date', start).lte('date', end)
    .not('fixed_expense_id', 'is', null);
  const already = new Set((existing || []).map(e => e.fixed_expense_id));

  const toInsert = active.filter(f => !already.has(f.id)).map(f => {
    const day = Math.min(f.day_of_month, daysInMonth(currentMonth));
    const d = new Date(currentMonth.getFullYear(), currentMonth.getMonth(), day);
    return {
      household_id: ctx.membership.household_id,
      account_id: f.account_id, category_id: f.category_id,
      member_id: ctx.membership.id, amount: f.amount, type: 'expense',
      memo: f.name, date: fmtDate(d), source: 'fixed', fixed_expense_id: f.id,
    };
  });
  if (!toInsert.length) { showToast('이미 이번 달에 전부 반영됐어요'); return; }

  const { error } = await sb.from('transactions').insert(toInsert);
  if (error) { showToast('반영 실패: ' + error.message); return; }
  await refreshMonth();
  showToast(`${toInsert.length}건 반영했어요`);
}

init();
