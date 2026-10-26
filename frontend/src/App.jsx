import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Activity, ArrowDownLeft, ArrowLeftRight, ArrowUpRight, Bell, Building2, CalendarDays,
  Check, ChevronDown, CircleHelp, Clock3, CreditCard, Download, FileBarChart2, Filter,
  Landmark, LayoutDashboard, LoaderCircle, Menu, MoreHorizontal, Plus, Search, Settings2,
  ShieldCheck, SlidersHorizontal, Sparkles, Users, WalletCards, X, CircleDollarSign, GraduationCap, Target, BookOpen, Pencil, Trash2
} from 'lucide-react';
import { api, rows } from './api.js';

const navItems = [
  { id: 'overview', label: 'Overview', icon: LayoutDashboard, section: 'WORKSPACE' },
  { id: 'customers', label: 'Students', icon: GraduationCap },
  { id: 'accounts', label: 'Accounts', icon: WalletCards },
  { id: 'transactions', label: 'Transactions', icon: ArrowLeftRight },
  { id: 'savings', label: 'Savings goals', icon: Target },
  { id: 'loans', label: 'Education loans', icon: Landmark },
  { id: 'reports', label: 'Reports', icon: FileBarChart2, section: 'INSIGHTS' }
];

const titles = {
  overview: ['Your campus money, at a glance', 'Track your balance, allowance, spending, and savings goals.'],
  customers: ['Student profiles', 'Manage student details and linked banking accounts.'],
  accounts: ['Accounts', 'Review balances and manage account status.'],
  transactions: ['Transactions', 'Track and manage account activity.'],
  savings: ['Savings goals', 'Set targets and follow progress using a linked account balance.'],
  loans: ['Education loan tracking', 'Review education loan records and linked repayments.'],
  reports: ['Reports & insights', 'A clear view of branch performance and portfolio health.']
};

const money = (value, compact = false) => new Intl.NumberFormat('en-US', {
  style: 'currency', currency: 'USD', maximumFractionDigits: 2,
  ...(compact ? { notation: 'compact', maximumSignificantDigits: 3 } : {})
}).format(Number(value || 0));
const dateTime = (value) => value ? new Date(value).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }) : '—';
const dateOnly = (value) => value ? new Date(`${String(value).slice(0, 10)}T00:00:00`).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : '—';
const fullName = (customer) => customer ? `${customer.first_name} ${customer.last_name}` : 'Unknown customer';
const initials = (value = '') => value.split(/\s+/).map((part) => part[0]).slice(0, 2).join('').toUpperCase();

function App() {
  const [page, setPage] = useState('overview');
  const [data, setData] = useState({ customers: [], branches: [], accounts: [], summary: [], transactions: [], loans: [], payments: [], reports: null, daily: [], categories: [], goals: [] });
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [apiError, setApiError] = useState('');
  const [toast, setToast] = useState('');
  const [modal, setModal] = useState(null);
  const [search, setSearch] = useState('');
  const [period, setPeriod] = useState('30 days');
  const [txType, setTxType] = useState('all');
  const [txStatus, setTxStatus] = useState('all');
  const [txCategory, setTxCategory] = useState('all');
  const [txMonth, setTxMonth] = useState('');
  const [selectedStudentId, setSelectedStudentId] = useState('');
  const [month, setMonth] = useState(new Date().toISOString().slice(0, 7));
  const [studentReport, setStudentReport] = useState(null);

  const loadData = useCallback(async (quiet = false) => {
    if (!quiet) setLoading(true); else setRefreshing(true);
    setApiError('');
    const requests = [
      ['customers', '/customers'], ['branches', '/branches'], ['accounts', '/accounts'],
      ['summary', '/account-summary'], ['transactions', '/transactions'], ['loans', '/loans'],
      ['payments', '/payments'], ['reports', '/reports/summary'], ['daily', `/reports/daily-transactions?days=${period === '30 days' ? 30 : 14}`],
      ['categories', '/expense-categories'], ['goals', '/savings-goals']
    ];
    const results = await Promise.allSettled(requests.map(([, path]) => api(path)));
    const next = {};
    let failed = 0;
    results.forEach((result, index) => {
      const [key] = requests[index];
      if (result.status === 'fulfilled') next[key] = key === 'reports' ? result.value?.data : rows(result.value);
      else { next[key] = key === 'reports' ? null : []; failed += 1; }
    });
    setData((previous) => ({ ...previous, ...next }));
    if (failed) setApiError(`Could not load ${failed} part${failed === 1 ? '' : 's'} of the workspace. Check that the API and MySQL database are running, then retry.`);
    setLoading(false);
    setRefreshing(false);
  }, [period]);

  useEffect(() => { loadData(); }, [loadData]);
  useEffect(() => { if (!selectedStudentId && data.customers[0]) setSelectedStudentId(String(data.customers[0].customer_id)); }, [data.customers, selectedStudentId]);
  useEffect(() => {
    if (!selectedStudentId) return;
    api(`/reports/students/${selectedStudentId}/monthly?month=${month}`).then((result) => setStudentReport(result.data)).catch(() => setStudentReport(null));
  }, [selectedStudentId, month, data.transactions]);
  useEffect(() => {
    if (!toast) return undefined;
    const timer = window.setTimeout(() => setToast(''), 3200);
    return () => window.clearTimeout(timer);
  }, [toast]);

  const customerMap = useMemo(() => new Map(data.customers.map((customer) => [customer.customer_id, customer])), [data.customers]);
  const branchMap = useMemo(() => new Map(data.branches.map((branch) => [branch.branch_id, branch])), [data.branches]);
  const accountMap = useMemo(() => new Map(data.accounts.map((account) => [account.account_id, account])), [data.accounts]);
  const summaryMap = useMemo(() => new Map(data.summary.map((account) => [account.account_id, account])), [data.summary]);
  const totalBalance = data.summary.reduce((sum, account) => sum + Number(account.current_balance || 0), 0);
  const activeAccounts = data.accounts.filter((account) => account.status === 'active').length;
  const activeLoans = data.loans.filter((loan) => loan.status === 'active').length;
  const postedTransactions = data.transactions.filter((tx) => tx.status === 'posted');
  const todayTransactions = postedTransactions.filter((tx) => new Date(tx.occurred_at).toDateString() === new Date().toDateString());
  const customerRows = data.customers.filter((customer) => `${customer.first_name} ${customer.last_name} ${customer.email} ${customer.student_id || ''} ${customer.institution || ''} ${customer.department || ''}`.toLowerCase().includes(search.toLowerCase()));
  const accountRows = data.accounts.filter((account) => {
    const owner = fullName(customerMap.get(account.customer_id));
    return `${account.account_number} ${owner} ${account.account_type} ${account.status}`.toLowerCase().includes(search.toLowerCase());
  });
  const transactionRows = data.transactions.filter((tx) => {
    const account = accountMap.get(tx.source_account_id);
    const destination = accountMap.get(tx.destination_account_id);
    const matchesText = `${tx.transaction_type} ${tx.category_name || ''} ${account?.account_number || ''} ${destination?.account_number || ''} ${tx.description || ''}`.toLowerCase().includes(search.toLowerCase());
    const matchesType = txType === 'all' || tx.transaction_type === txType;
    const matchesStatus = txStatus === 'all' || tx.status === txStatus;
    const matchesCategory = txCategory === 'all' || String(tx.expense_category_id || '') === txCategory;
    const matchesMonth = !txMonth || String(tx.occurred_at || '').slice(0, 7) === txMonth;
    const matchesStudent = !selectedStudentId || Number(account?.customer_id) === Number(selectedStudentId) || Number(destination?.customer_id) === Number(selectedStudentId);
    return matchesText && matchesType && matchesStatus && matchesCategory && matchesMonth && matchesStudent;
  });
  const loanRows = data.loans.filter((loan) => {
    const owner = fullName(customerMap.get(loan.customer_id));
    return `${loan.loan_number} ${owner} ${loan.status}`.toLowerCase().includes(search.toLowerCase());
  });

  const submitForm = async (type, payload, id) => {
    let path = '';
    let method = 'POST';
    let body = payload;
    if (type === 'customer') { path = `/customers${id ? `/${id}` : ''}`; if (id) method = 'PATCH'; }
    if (type === 'account') { path = `/accounts${id ? `/${id}` : ''}`; if (id) method = 'PATCH'; }
    if (type === 'loan') path = '/loans';
    if (type === 'deposit' || type === 'withdrawal') path = `/transactions/${type}`;
    if (type === 'transfer') path = '/transactions/transfer';
    if (type === 'payment') path = '/payments';
    if (type === 'goal') { path = `/savings-goals${id ? `/${id}` : ''}`; if (id) method = 'PATCH'; }
    if (type === 'account-status') { path = `/accounts/${id}`; method = 'PATCH'; body = { status: payload.status }; }
    await api(path, { method, body });
    setModal(null);
    setToast(type === 'account-status' ? 'Account status updated' : `${type === 'customer' ? 'Student' : type === 'goal' ? 'Savings goal' : type[0].toUpperCase() + type.slice(1)} ${id ? 'updated' : 'saved'} successfully`);
    await loadData(true);
  };
  const deleteGoal = async (id) => {
    if (!window.confirm('Delete this savings goal? This will not affect the linked account balance.')) return;
    try { await api(`/savings-goals/${id}`, { method: 'DELETE' }); setToast('Savings goal deleted'); await loadData(true); }
    catch (error) { setToast(error.message); }
  };

  const openAction = (type, record = null) => setModal({ type, record });
  const headerAction = () => {
    if (page === 'customers') openAction('customer');
    else if (page === 'accounts') openAction('account');
    else if (page === 'transactions') openAction('transaction');
    else if (page === 'loans') openAction('loan');
  };

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="brand-lockup"><div className="brand-mark"><Landmark size={19} strokeWidth={2.5} /></div><div><strong>CampusBank</strong><span>STUDENT FINANCE</span></div><button className="mobile-close icon-button" onClick={() => document.body.classList.remove('nav-open')} aria-label="Close menu"><X size={18} /></button></div>
        <div className="workspace-label">WORKSPACE <ChevronDown size={13} /></div>
        <div className="workspace-switch"><div className="workspace-avatar">C</div><div><strong>CampusBank</strong><span>Student workspace</span></div><MoreHorizontal size={18} /></div>
        <nav className="main-nav" aria-label="Main navigation">
          {navItems.map((item) => <div key={item.id}>
            {item.section && <div className="nav-section">{item.section}</div>}
            <button className={`nav-item ${page === item.id ? 'active' : ''}`} onClick={() => { setPage(item.id); setSearch(''); document.body.classList.remove('nav-open'); }}>
              <item.icon size={18} strokeWidth={1.8} /><span>{item.label}</span>{item.id === 'transactions' && <i className="nav-dot" />}
            </button>
          </div>)}
        </nav>
        <div className="sidebar-bottom">
          <div className="help-card"><div className="help-icon"><ShieldCheck size={18} /></div><strong>Academic demo</strong><p>Fictional records only. No real bank accounts or money.</p><button onClick={() => setToast('CampusBank is an academic simulation only.')}>About this project <span>↗</span></button></div>
          <button className="nav-item settings-item" onClick={() => setToast('Settings are not part of this project phase.')}><Settings2 size={18} /><span>Settings</span></button>
          <div className="profile-row"><div className="profile-avatar">CB</div><div className="profile-copy"><strong>CampusBank Demo</strong><span>Academic simulation</span></div><MoreHorizontal size={18} /></div>
        </div>
      </aside>

      <main className="main-content">
        <header className="topbar">
          <div className="breadcrumb"><button className="mobile-menu icon-button" onClick={() => document.body.classList.add('nav-open')} aria-label="Open menu"><Menu size={19} /></button><span>CampusBank</span><span className="crumb-slash">/</span><strong>{navItems.find((item) => item.id === page)?.label || 'Overview'}</strong></div>
          <div className="topbar-actions"><div className="status-pill"><span />{apiError ? 'Connection issue' : 'System operational'}</div><button className="icon-button" aria-label="Notifications" onClick={() => setToast('You’re all caught up.')}><Bell size={18} /><i className="notification-dot" /></button><div className="topbar-divider" /><button className="date-button"><CalendarDays size={16} /><span>{new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}</span></button></div>
        </header>

        <div className="page-wrap">
          {apiError && <div className="connection-banner"><div><span className="banner-indicator" /><strong>Database connection unavailable</strong><p>{apiError}</p></div><button className="button button-soft" onClick={() => loadData(true)} disabled={refreshing}>{refreshing ? <LoaderCircle className="spin" size={15} /> : 'Retry connection'}</button></div>}
          <div className="page-heading"><div><div className="eyebrow"><Sparkles size={13} /> STUDENT BANKING & FINANCE</div><h1>{titles[page][0]}</h1><p>{titles[page][1]}</p></div><div className="heading-actions"><button className="button button-soft" onClick={() => loadData(true)} disabled={refreshing}>{refreshing ? <LoaderCircle className="spin" size={16} /> : <Activity size={16} />} Refresh</button>{['customers', 'accounts', 'transactions', 'loans', 'savings'].includes(page) && <button className="button button-primary" onClick={page === 'savings' ? () => openAction('goal') : headerAction}><Plus size={17} />{page === 'customers' ? 'Add student' : page === 'accounts' ? 'Open account' : page === 'loans' ? 'New loan' : page === 'savings' ? 'New goal' : 'New transaction'}</button>}</div></div>

          {loading ? <LoadingState /> : <>
            {page === 'overview' && <Overview data={data} summaryMap={summaryMap} customerMap={customerMap} accountMap={accountMap} branchMap={branchMap} todayCount={todayTransactions.length} totalBalance={totalBalance} activeAccounts={activeAccounts} activeLoans={activeLoans} openAction={openAction} setPage={setPage} studentReport={studentReport} studentId={selectedStudentId} setStudentId={setSelectedStudentId} month={month} setMonth={setMonth} />}
            {page === 'customers' && <Customers customers={customerRows} accounts={data.accounts} openAction={openAction} search={search} setSearch={setSearch} />}
            {page === 'accounts' && <Accounts accounts={accountRows} summaryMap={summaryMap} customerMap={customerMap} branchMap={branchMap} search={search} setSearch={setSearch} openAction={openAction} />}
            {page === 'transactions' && <Transactions transactions={transactionRows} accountMap={accountMap} categories={data.categories} students={data.customers} studentId={selectedStudentId} setStudentId={setSelectedStudentId} search={search} setSearch={setSearch} txType={txType} setTxType={setTxType} txStatus={txStatus} setTxStatus={setTxStatus} txCategory={txCategory} setTxCategory={setTxCategory} txMonth={txMonth} setTxMonth={setTxMonth} />}
            {page === 'savings' && <SavingsGoals goals={data.goals} customers={data.customers} accounts={data.accounts} studentId={selectedStudentId} setStudentId={setSelectedStudentId} openAction={openAction} onDelete={deleteGoal} />}
            {page === 'loans' && <Loans loans={loanRows} customerMap={customerMap} branchMap={branchMap} payments={data.payments} openAction={openAction} search={search} setSearch={setSearch} />}
            {page === 'reports' && <Reports reports={data.reports} daily={data.daily} totalBalance={totalBalance} period={period} setPeriod={setPeriod} />}
          </>}
          <footer className="page-footer"><span>© {new Date().getFullYear()} CampusBank</span><span><CircleHelp size={14} /> Academic simulation · Fictional data only · No real money</span></footer>
        </div>
      </main>
      {modal && <ActionModal modal={modal} customers={data.customers} branches={data.branches} accounts={data.accounts} loans={data.loans} categories={data.categories} onClose={() => setModal(null)} onSubmit={submitForm} />}
      {toast && <div className="toast"><span><Check size={15} /></span>{toast}<button onClick={() => setToast('')} aria-label="Dismiss"><X size={15} /></button></div>}
    </div>
  );
}

function LoadingState() { return <div className="loading-state"><LoaderCircle className="spin" size={26} /><span>Loading banking workspace…</span></div>; }

function Overview({ data, summaryMap, customerMap, accountMap, branchMap, todayCount, totalBalance, activeAccounts, activeLoans, openAction, setPage, studentReport, studentId, setStudentId, month, setMonth }) {
  const max = Math.max(...data.daily.map((item) => Number(item.amount_total)), 1);
  const txCount = data.transactions.length;
  const posted = data.transactions.filter((tx) => tx.status === 'posted').length;
  const recent = [...data.transactions].sort((a, b) => new Date(b.occurred_at) - new Date(a.occurred_at)).slice(0, 5);
  const chartValues = Array.from({ length: 14 }, (_, index) => {
    const day = new Date(); day.setDate(day.getDate() - 13 + index);
    const record = data.daily.find((item) => new Date(item.transaction_date).toDateString() === day.toDateString());
    return { label: day.toLocaleDateString('en-US', { weekday: 'short' }), value: Number(record?.amount_total || 0), date: day.getDate() };
  });
  const loanTotal = data.loans.reduce((sum, loan) => sum + Number(loan.principal_amount || 0), 0);
  return <>
    <section className="metric-grid">
      <MetricCard label="Total account balances" value={money(totalBalance, true)} detail="Across all bank accounts" icon={WalletCards} tone="blue" trend="Live balance" />
      <MetricCard label="Transactions today" value={String(todayCount).padStart(2, '0')} detail="Posted activity" icon={ArrowLeftRight} tone="violet" trend={`${txCount} total`} />
      <MetricCard label="Active accounts" value={String(activeAccounts).padStart(2, '0')} detail={`${data.customers.length} student profiles`} icon={Users} tone="mint" trend="All branches" />
      <MetricCard label="Loan portfolio" value={money(loanTotal, true)} detail={`${activeLoans} active loans`} icon={CircleDollarSign} tone="amber" trend={`${data.payments.length} repayments`} />
    </section>

    <StudentFinanceSnapshot students={data.customers} report={studentReport} studentId={studentId} setStudentId={setStudentId} month={month} setMonth={setMonth} goals={data.goals} setPage={setPage} />

    <section className="overview-grid">
      <div className="panel chart-panel"><div className="panel-heading"><div><span className="panel-kicker">CASH FLOW</span><h2>Transaction volume</h2></div><button className="select-like" onClick={() => setPage('reports')}>Last 14 days <ChevronDown size={14} /></button></div><div className="chart-legend"><span><i className="legend-dot primary-dot" /> Transaction value</span><span className="chart-total">{money(chartValues.reduce((sum, item) => sum + item.value, 0), true)} <small>total volume</small></span></div><div className="bar-chart" role="img" aria-label="Transaction value over the last fourteen days">{chartValues.map((item, index) => <div className="bar-column" key={`${item.date}-${index}`}><div className="bar-track"><div className={`bar ${item.value === 0 ? 'bar-empty' : ''}`} style={{ height: `${Math.max(item.value ? (item.value / max) * 100 : 3, 3)}%` }} title={`${item.label} ${item.date}: ${money(item.value)}`} /></div><span>{item.label}</span></div>)}</div><div className="chart-axis"><span>{chartValues[0]?.date} {new Date().toLocaleDateString('en-US', { month: 'short' })}</span><span>Today</span></div></div>
      <div className="panel quick-panel"><div className="panel-heading"><div><span className="panel-kicker">QUICK ACTIONS</span><h2>What would you like to do?</h2></div><div className="small-orbit"><Sparkles size={16} /></div></div><div className="quick-actions"><button onClick={() => openAction('deposit')}><span className="quick-icon quick-green"><ArrowDownLeft size={18} /></span><span><strong>Record allowance</strong><small>Add categorized income</small></span><span className="quick-arrow">↗</span></button><button onClick={() => openAction('withdrawal')}><span className="quick-icon quick-orange"><ArrowUpRight size={18} /></span><span><strong>Record spending</strong><small>Categorize an expense</small></span><span className="quick-arrow">↗</span></button><button onClick={() => openAction('transfer')}><span className="quick-icon quick-blue"><ArrowLeftRight size={18} /></span><span><strong>Transfer funds</strong><small>Move money between accounts</small></span><span className="quick-arrow">↗</span></button><button onClick={() => openAction('customer')}><span className="quick-icon quick-purple"><Users size={18} /></span><span><strong>Add a student</strong><small>Create a student profile</small></span><span className="quick-arrow">↗</span></button></div></div>
    </section>

    <section className="bottom-grid"><div className="panel table-panel"><div className="panel-heading table-heading"><div><span className="panel-kicker">LATEST ACTIVITY</span><h2>Recent transactions</h2></div><button className="text-link" onClick={() => setPage('transactions')}>View all <span>→</span></button></div><TransactionTable transactions={recent} accountMap={accountMap} compact /></div><div className="panel branch-panel"><div className="panel-heading"><div><span className="panel-kicker">YOUR NETWORK</span><h2>Branch overview</h2></div><Building2 size={18} className="muted-icon" /></div><div className="branch-list">{(data.reports?.branches || []).slice(0, 4).map((branch, index) => <div className="branch-row" key={branch.branch_id}><div className={`branch-avatar branch-${index % 4}`}>{initials(branch.name)}</div><div className="branch-info"><strong>{branch.name}</strong><span>{branch.account_count} accounts · {branch.loan_count} loans</span></div><strong className="branch-balance">{money(branch.total_balance, true)}</strong></div>)}</div><button className="branch-footer" onClick={() => setPage('reports')}>Explore branch reports <span>→</span></button></div></section>
  </>;
}

function StudentFinanceSnapshot({ students, report, studentId, setStudentId, month, setMonth, goals, setPage }) {
  const studentGoals = goals.filter((goal) => String(goal.customer_id) === String(studentId) && goal.status === 'active');
  const biggest = studentGoals.reduce((best, goal) => Number(goal.progress_percent) > Number(best?.progress_percent || 0) ? goal : best, null);
  return <section className="panel student-snapshot"><div className="panel-heading"><div><span className="panel-kicker">STUDENT MONEY SNAPSHOT</span><h2>{report?.student ? `${report.student.first_name}’s monthly picture` : 'Monthly money picture'}</h2></div><div className="snapshot-controls"><select className="native-select" aria-label="Choose student" value={studentId} onChange={(event) => setStudentId(event.target.value)}><option value="">Choose student</option>{students.map((student) => <option key={student.customer_id} value={student.customer_id}>{fullName(student)}</option>)}</select><input aria-label="Choose report month" type="month" value={month} onChange={(event) => setMonth(event.target.value)} /></div></div><div className="snapshot-metrics"><div><span>Available balance</span><strong>{money(report?.available_balance)}</strong></div><div><span>Allowance & income</span><strong className="amount-positive">+{money(report?.income_total)}</strong></div><div><span>Categorized spending</span><strong className="amount-cell">−{money(report?.expense_total)}</strong></div><div><span>Loan repayments</span><strong>{money(report?.loan_repayment_total)}</strong></div><div><span>Active savings goals</span><strong>{studentGoals.length}</strong></div></div><div className="snapshot-bottom"><span>{(report?.categories || []).slice(0, 3).map((item) => `${item.category_name} ${money(item.amount_total)}`).join(' · ') || 'No categorized expenses in this month'}</span>{biggest && <span className="goal-mini">Top goal: {biggest.goal_name} · {Number(biggest.progress_percent).toFixed(0)}%</span>}<button className="text-link" onClick={() => setPage('savings')}>View savings goals →</button></div><p className="snapshot-note">Transfers are excluded from income and spending. Loan repayments are shown separately. Savings progress is estimated from the linked account balance; goal funds are not reserved.</p></section>;
}

function MetricCard({ label, value, detail, icon: Icon, tone, trend }) { return <article className="metric-card"><div className="metric-top"><span>{label}</span><div className={`metric-icon ${tone}`}><Icon size={18} /></div></div><strong className="metric-value">{value}</strong><div className="metric-bottom"><span>{detail}</span><span className="metric-trend">{trend}</span></div></article>; }

function TableToolbar({ search, setSearch, placeholder = 'Search records…', extra }) { return <div className="table-toolbar"><label className="search-box"><Search size={16} /><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder={placeholder} /><kbd>⌘ K</kbd></label>{extra}</div>; }

function Customers({ customers, accounts, openAction, search, setSearch }) {
  return <section className="panel page-panel"><div className="list-panel-head"><div><span className="panel-kicker">STUDENT DIRECTORY</span><h2>Student profiles <span className="count-badge">{customers.length}</span></h2><p>Institution, course, contact details, and linked accounts.</p></div><button className="button button-primary" onClick={() => openAction('customer')}><Plus size={16} /> Add student</button></div><TableToolbar search={search} setSearch={setSearch} placeholder="Search name, student ID, or institution…" /><div className="table-scroll"><table><thead><tr><th>STUDENT</th><th>STUDENT ID</th><th>INSTITUTION / COURSE</th><th>GRADUATION</th><th>ACCOUNTS</th><th>PHONE</th><th></th></tr></thead><tbody>{customers.map((customer, index) => <tr key={customer.customer_id}><td><div className="person-cell"><div className={`person-avatar avatar-${index % 5}`}>{initials(fullName(customer))}</div><div><strong>{fullName(customer)}</strong><span>{customer.email}</span></div></div></td><td><span className="mono">{customer.student_id || '—'}</span></td><td>{customer.institution || '—'}<div className="muted-copy">{customer.department || ''}</div></td><td>{customer.graduation_year || '—'}</td><td><span className="count-chip">{accounts.filter((item) => item.customer_id === customer.customer_id).length} accounts</span></td><td>{customer.phone || '—'}</td><td><button className="row-action" onClick={() => openAction('customer', customer)} aria-label={`Edit ${fullName(customer)}`}><MoreHorizontal size={18} /></button></td></tr>)}</tbody></table>{customers.length === 0 && <EmptyState title="No students found" text="Try another search or add your first student." />}</div><div className="table-foot"><span>Showing <b>{customers.length}</b> student profiles</span><span>Student profiles link to accounts and education loans</span></div></section>;
}

function Accounts({ accounts, summaryMap, customerMap, branchMap, search, setSearch, openAction }) {
  return <section className="panel page-panel"><div className="list-panel-head"><div><span className="panel-kicker">ACCOUNT REGISTER</span><h2>All accounts <span className="count-badge">{accounts.length}</span></h2><p>Account ownership, branch assignment, and current balance.</p></div><button className="button button-primary" onClick={() => openAction('account')}><Plus size={16} /> Open account</button></div><TableToolbar search={search} setSearch={setSearch} placeholder="Search account or owner…" extra={<button className="filter-button"><SlidersHorizontal size={15} /> Filters</button>} /><div className="table-scroll"><table><thead><tr><th>ACCOUNT</th><th>OWNER</th><th>BRANCH</th><th>TYPE</th><th>AVAILABLE BALANCE</th><th>STATUS</th><th></th></tr></thead><tbody>{accounts.map((account, index) => <tr key={account.account_id}><td><div className="account-cell"><div className={`account-icon account-icon-${index % 3}`}><CreditCard size={16} /></div><div><strong className="mono">{account.account_number}</strong><span>Opened {dateOnly(account.opened_on)}</span></div></div></td><td>{fullName(customerMap.get(account.customer_id))}</td><td>{branchMap.get(account.branch_id)?.name || '—'}</td><td><span className="type-label">{account.account_type.replace('_', ' ')}</span></td><td className="balance-cell">{money(summaryMap.get(account.account_id)?.current_balance)}</td><td><StatusBadge status={account.status} /></td><td><button className="row-action" onClick={() => openAction('account', account)} aria-label="Edit account"><MoreHorizontal size={18} /></button></td></tr>)}</tbody></table>{accounts.length === 0 && <EmptyState title="No accounts found" text="Try another search or open an account." />}</div><div className="table-foot"><span>Balances are calculated from posted account activity.</span><span>Account actions are recorded in the ledger</span></div></section>;
}

function Transactions({ transactions, accountMap, categories, students, studentId, setStudentId, search, setSearch, txType, setTxType, txStatus, setTxStatus, txCategory, setTxCategory, txMonth, setTxMonth }) {
  const extra = <div className="filter-group"><select value={studentId} onChange={(event) => setStudentId(event.target.value)} aria-label="Filter by student"><option value="">All students</option>{students.map((student) => <option value={student.customer_id} key={student.customer_id}>{fullName(student)}</option>)}</select><select value={txType} onChange={(event) => setTxType(event.target.value)} aria-label="Filter by transaction type"><option value="all">All types</option><option value="deposit">Deposits</option><option value="withdrawal">Withdrawals</option><option value="transfer">Transfers</option><option value="loan_repayment">Loan repayments</option></select><select value={txStatus} onChange={(event) => setTxStatus(event.target.value)} aria-label="Filter by status"><option value="all">All statuses</option><option value="posted">Posted</option><option value="pending">Pending</option><option value="failed">Failed</option><option value="reversed">Reversed</option></select><select value={txCategory} onChange={(event) => setTxCategory(event.target.value)} aria-label="Filter by category"><option value="all">All categories</option>{categories.map((category) => <option value={category.expense_category_id} key={category.expense_category_id}>{category.category_name}</option>)}</select><input aria-label="Filter by month" type="month" value={txMonth} onChange={(event) => setTxMonth(event.target.value)} /></div>;
  return <section className="panel page-panel"><div className="list-panel-head"><div><span className="panel-kicker">ALLOWANCE & SPENDING LEDGER</span><h2>Transaction history <span className="count-badge">{transactions.length}</span></h2><p>Filter income and eligible expenses by category and month. Account transfers are not spending.</p></div><button className="button button-soft" onClick={() => window.print()}><Download size={15} /> Export view</button></div><TableToolbar search={search} setSearch={setSearch} placeholder="Search account or description…" extra={extra} /><div className="table-scroll"><TransactionTable transactions={transactions} accountMap={accountMap} /></div><div className="table-foot"><span>{transactions.length} matching transactions</span><span>Times shown in your local timezone</span></div></section>;
}

function TransactionTable({ transactions, accountMap, compact = false }) {
  return <table><thead><tr><th>TRANSACTION</th><th>{compact ? 'ACCOUNT' : 'DATE & TIME'}</th>{!compact && <th>DESTINATION</th>}<th>TYPE / CATEGORY</th><th>AMOUNT</th><th>STATUS</th>{!compact && <th>DESCRIPTION</th>}</tr></thead><tbody>{transactions.map((tx) => { const account = accountMap.get(tx.source_account_id); const destination = accountMap.get(tx.destination_account_id); const positive = tx.transaction_type === 'deposit'; return <tr key={tx.transaction_id}><td><div className="transaction-id"><span className={`tx-icon tx-${tx.transaction_type}`}><TransactionIcon type={tx.transaction_type} /></span><div><strong>TXN-{String(tx.transaction_id).padStart(6, '0')}</strong><span>{compact ? dateTime(tx.occurred_at) : `Account ${account?.account_number || tx.source_account_id}`}</span></div></div></td><td>{compact ? <span className="mono">{account?.account_number || '—'}</span> : dateTime(tx.occurred_at)}</td>{!compact && <td className="mono">{destination?.account_number || '—'}</td>}<td><span className="type-label">{tx.transaction_type.replace('_', ' ')}</span>{tx.category_name && <div className="muted-copy">{tx.category_name}</div>}</td><td className={`amount-cell ${positive ? 'amount-positive' : ''}`}>{positive ? '+' : '−'}{money(tx.amount)}</td><td><StatusBadge status={tx.status} /></td>{!compact && <td className="description-cell">{tx.description || '—'}</td>}</tr>; })}</tbody></table>;
}
function TransactionIcon({ type }) { const Icon = type === 'deposit' ? ArrowDownLeft : type === 'withdrawal' ? ArrowUpRight : type === 'transfer' ? ArrowLeftRight : CircleDollarSign; return <Icon size={15} />; }

function SavingsGoals({ goals, customers, accounts, studentId, setStudentId, openAction, onDelete }) {
  const visibleGoals = goals.filter((goal) => !studentId || String(goal.customer_id) === String(studentId));
  return <section className="panel page-panel"><div className="list-panel-head"><div><span className="panel-kicker">STUDENT SAVINGS</span><h2>Savings goals <span className="count-badge">{visibleGoals.length}</span></h2><p>Goals are linked to real accounts. Progress is a balance-based estimate; funds are not reserved or moved.</p><select className="native-select" aria-label="Choose student goals" value={studentId} onChange={(event) => setStudentId(event.target.value)}><option value="">All students</option>{customers.map((student) => <option key={student.customer_id} value={student.customer_id}>{fullName(student)}</option>)}</select></div><button className="button button-primary" onClick={() => openAction('goal')}><Plus size={16} /> New goal</button></div><div className="goal-grid">{visibleGoals.map((goal) => { const student = customers.find((item) => Number(item.customer_id) === Number(goal.customer_id)); const account = accounts.find((item) => Number(item.account_id) === Number(goal.account_id)); const progress = Math.min(100, Number(goal.progress_percent || 0)); return <article className="goal-card" key={goal.goal_id}><div className="goal-card-head"><span className="goal-icon"><Target size={18} /></span><StatusBadge status={goal.status} /></div><h3>{goal.goal_name}</h3><p>{fullName(student)} · {account?.account_number || goal.account_number || 'Linked account'}</p><div className="goal-progress-label"><strong>{money(goal.progress_amount)}</strong><span>of {money(goal.target_amount)}</span></div><div className="progress-track"><span style={{ width: `${progress}%` }} /></div><div className="goal-meta"><span>{progress.toFixed(0)}% estimated progress</span><span>{goal.target_date ? `Target ${dateOnly(goal.target_date)}` : 'No target date'}</span></div><div className="goal-actions"><button className="filter-button" onClick={() => openAction('goal', goal)}><Pencil size={14} /> Edit</button><button className="filter-button danger-action" onClick={() => onDelete(goal.goal_id)}><Trash2 size={14} /> Delete</button></div></article>; })}{visibleGoals.length === 0 && <EmptyState title="No savings goals yet" text="Create a goal and link it to one of the student's accounts." />}</div></section>;
}

function Loans({ loans, customerMap, branchMap, payments, openAction, search, setSearch }) {
  const total = loans.reduce((sum, loan) => sum + Number(loan.principal_amount), 0);
  const repaid = payments.reduce((sum, payment) => sum + Number(payment.principal_paid || 0), 0);
  return <><section className="loan-metric-row"><div className="loan-summary-card"><span>Portfolio principal</span><strong>{money(total)}</strong><small>Across {loans.length} loan records</small></div><div className="loan-summary-card"><span>Principal repaid</span><strong>{money(repaid)}</strong><small>From {payments.length} recorded repayments</small></div><div className="loan-summary-card loan-summary-highlight"><span>Outstanding (estimate)</span><strong>{money(Math.max(total - repaid, 0))}</strong><small>Principal less recorded principal payments</small></div></section><section className="panel page-panel"><div className="list-panel-head"><div><span className="panel-kicker">LENDING PORTFOLIO</span><h2>Loans <span className="count-badge">{loans.length}</span></h2><p>Loan records, repayment tracking, and customer exposure.</p></div><div className="button-stack"><button className="button button-soft" onClick={() => openAction('payment')}><ArrowDownLeft size={15} /> Record payment</button><button className="button button-primary" onClick={() => openAction('loan')}><Plus size={16} /> New loan</button></div></div><TableToolbar search={search} setSearch={setSearch} placeholder="Search loan or borrower…" /><div className="table-scroll"><table><thead><tr><th>LOAN</th><th>BORROWER</th><th>BRANCH</th><th>PRINCIPAL</th><th>RATE</th><th>TERM</th><th>DUE DATE</th><th>STATUS</th><th></th></tr></thead><tbody>{loans.map((loan) => <tr key={loan.loan_id}><td><strong className="mono">{loan.loan_number}</strong></td><td>{fullName(customerMap.get(loan.customer_id))}</td><td>{branchMap.get(loan.branch_id)?.name || '—'}</td><td className="balance-cell">{money(loan.principal_amount)}</td><td>{Number(loan.annual_interest_rate).toFixed(2)}%</td><td>{loan.term_months} mo</td><td>{dateOnly(loan.due_on)}</td><td><StatusBadge status={loan.status} /></td><td><button className="row-action" onClick={() => openAction('payment', loan)} aria-label="Record loan payment"><Plus size={17} /></button></td></tr>)}</tbody></table>{loans.length === 0 && <EmptyState title="No loans found" text="Try another search or create a loan record." />}</div><div className="table-foot"><span>Payments post as linked loan and account ledger records.</span><span>Amounts are shown in USD</span></div></section></>;
}

function Reports({ reports, daily, totalBalance, period, setPeriod }) {
  const values = daily.map((item) => Number(item.amount_total || 0));
  const max = Math.max(...values, 1);
  const txTotal = (reports?.transactions || []).reduce((sum, item) => sum + Number(item.amount_total || 0), 0);
  const loanCount = (reports?.loans || []).reduce((sum, item) => sum + Number(item.loan_count || 0), 0);
  const principal = (reports?.loans || []).reduce((sum, item) => sum + Number(item.principal_total || 0), 0);
  return <><section className="report-kpis"><div className="report-kpi"><div className="report-kpi-icon"><WalletCards size={17} /></div><span>Network balances</span><strong>{money(totalBalance, true)}</strong><small>From account summary view</small></div><div className="report-kpi"><div className="report-kpi-icon violet"><ArrowLeftRight size={17} /></div><span>Posted volume</span><strong>{money(txTotal, true)}</strong><small>All posted transaction types</small></div><div className="report-kpi"><div className="report-kpi-icon amber"><Landmark size={17} /></div><span>Loan principal</span><strong>{money(principal, true)}</strong><small>{loanCount} total loan records</small></div></section><section className="reports-grid"><div className="panel report-chart-panel"><div className="panel-heading"><div><span className="panel-kicker">DAILY ACTIVITY</span><h2>Posted transaction volume</h2></div><select className="select-like native-select" value={period} onChange={(event) => setPeriod(event.target.value)}><option>14 days</option><option>30 days</option></select></div><div className="report-bars">{daily.map((item) => <div className="report-bar-col" key={String(item.transaction_date)}><div className="report-bar-wrap"><div className="report-bar" style={{ height: `${Math.max(Number(item.amount_total) / max * 100, 5)}%` }} title={money(item.amount_total)} /></div><span>{new Date(item.transaction_date).toLocaleDateString('en-US', { month: 'numeric', day: 'numeric' })}</span></div>)}{daily.length === 0 && <EmptyState title="No recent activity" text="Posted transaction data will appear here." />}</div><div className="chart-legend"><span><i className="legend-dot primary-dot" /> Daily posted amount</span><span className="chart-total">{money(values.reduce((a, b) => a + b, 0), true)} <small>period volume</small></span></div></div><div className="panel report-table-panel"><div className="panel-heading"><div><span className="panel-kicker">BRANCH PERFORMANCE</span><h2>Balances by branch</h2></div><Building2 size={17} className="muted-icon" /></div><div className="branch-report-list">{(reports?.branches || []).map((branch) => { const share = totalBalance ? Number(branch.total_balance) / totalBalance * 100 : 0; return <div className="branch-report" key={branch.branch_id}><div className="branch-report-head"><div><strong>{branch.name}</strong><span>{branch.account_count} accounts · {branch.loan_count} loans</span></div><b>{money(branch.total_balance, true)}</b></div><div className="progress-track"><span style={{ width: `${Math.max(share, 1)}%` }} /></div></div>; })}</div></div></section><section className="panel type-report-panel"><div className="panel-heading"><div><span className="panel-kicker">TRANSACTION MIX</span><h2>Volume by transaction type</h2></div><span className="db-report-label"><Activity size={14} /> Database report</span></div><div className="type-report-grid">{(reports?.transactions || []).map((item, index) => <div className="type-report" key={item.transaction_type}><div className={`type-report-icon type-tone-${index % 4}`}><TransactionIcon type={item.transaction_type} /></div><span>{item.transaction_type.replace('_', ' ')}</span><strong>{money(item.amount_total, true)}</strong><small>{item.transaction_count} transactions · avg {money(item.average_amount)}</small></div>)}</div></section></>;
}

function StatusBadge({ status }) { return <span className={`status-badge status-${String(status).toLowerCase()}`}><i />{status}</span>; }
function EmptyState({ title, text }) { return <div className="empty-state"><div className="empty-icon"><Search size={19} /></div><strong>{title}</strong><span>{text}</span></div>; }

function ActionModal({ modal, customers, branches, accounts, loans, categories, onClose, onSubmit }) {
  const { type, record } = modal;
  const editing = Boolean(record && ['customer', 'goal'].includes(type));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [values, setValues] = useState(() => {
    if (type === 'customer' && record) return { first_name: record.first_name, last_name: record.last_name, email: record.email, phone: record.phone || '', date_of_birth: record.date_of_birth?.slice(0, 10) || '', address: record.address || '', student_id: record.student_id || '', institution: record.institution || '', department: record.department || '', graduation_year: record.graduation_year || '' };
    if (type === 'account' && record) return { status: record.status };
    if (type === 'goal' && record) return { goal_name: record.goal_name, target_amount: record.target_amount, target_date: record.target_date?.slice(0, 10) || '', status: record.status };
    if (type === 'transaction') return { transactionType: 'deposit' };
    if (type === 'payment' && record) return { loanId: String(record.loan_id) };
    return {};
  });
  const set = (key) => (event) => setValues((current) => ({ ...current, [key]: event.target.value }));
  const submit = async (event) => {
    event.preventDefault(); setBusy(true); setError('');
    try {
      let payload = values;
      let submitType = type;
      if (type === 'customer') payload = { first_name: values.first_name, last_name: values.last_name, email: values.email, phone: values.phone || null, date_of_birth: values.date_of_birth || null, address: values.address || null, student_id: values.student_id, institution: values.institution || null, department: values.department || null, graduation_year: values.graduation_year ? Number(values.graduation_year) : null };
      if (type === 'transaction') {
        submitType = values.transactionType;
        payload = values.transactionType === 'transfer'
          ? { sourceAccountId: Number(values.sourceAccountId), destinationAccountId: Number(values.destinationAccountId), amount: values.amount, description: values.description || undefined }
          : { accountId: Number(values.accountId), amount: values.amount, expenseCategoryId: values.expenseCategoryId ? Number(values.expenseCategoryId) : undefined, description: values.description || undefined };
      }
      if (type === 'account' && record) { submitType = 'account-status'; payload = { status: values.status }; }
      if (type === 'account' && !record) payload = { customer_id: Number(values.customer_id), branch_id: Number(values.branch_id), account_number: values.account_number, account_type: values.account_type, opening_balance: values.opening_balance || '0.00' };
      if (type === 'loan') payload = { customer_id: Number(values.customer_id), branch_id: Number(values.branch_id), loan_number: values.loan_number, principal_amount: values.principal_amount, annual_interest_rate: values.annual_interest_rate || '0', term_months: Number(values.term_months), issued_on: values.issued_on, due_on: values.due_on };
      if (type === 'deposit' || type === 'withdrawal') payload = { accountId: Number(values.accountId), amount: values.amount, expenseCategoryId: values.expenseCategoryId ? Number(values.expenseCategoryId) : undefined, description: values.description || undefined };
      if (type === 'transfer') payload = { sourceAccountId: Number(values.sourceAccountId), destinationAccountId: Number(values.destinationAccountId), amount: values.amount, description: values.description || undefined };
      if (type === 'payment') payload = { loanId: Number(values.loanId), accountId: Number(values.accountId), principalPaid: values.principalPaid || '0', interestPaid: values.interestPaid || '0', description: values.description || undefined };
      if (type === 'goal') payload = editing
        ? { goal_name: values.goal_name, target_amount: values.target_amount, target_date: values.target_date || null, status: values.status }
        : { customer_id: Number(values.customer_id), account_id: Number(values.account_id), goal_name: values.goal_name, target_amount: values.target_amount, target_date: values.target_date || null };
      const recordId = type === 'goal' ? record?.goal_id : record?.customer_id || record?.account_id;
      await onSubmit(submitType, payload, recordId);
    } catch (cause) { setError(cause.message); setBusy(false); }
  };
  const heading = type === 'customer' ? (editing ? 'Edit student profile' : 'Add a student profile') : type === 'goal' ? (editing ? 'Edit savings goal' : 'Create a savings goal') : type === 'account' ? (record ? 'Manage account' : 'Open an account') : type === 'loan' ? 'Create an education loan record' : type === 'payment' ? 'Record loan payment' : type === 'transaction' ? 'New transaction' : type === 'transfer' ? 'Transfer funds' : type === 'deposit' ? 'Record an allowance or deposit' : 'Record spending';
  const description = type === 'customer' ? 'Student records extend the existing customer profiles used by accounts and loans.' : type === 'goal' ? 'Progress is estimated from the linked account balance; creating a goal never moves or reserves funds.' : type === 'account' ? (record ? `${record.account_number} · update account status.` : 'Create a new student account at a branch.') : type === 'loan' ? 'Track an education loan record; this does not approve or disburse a real loan.' : type === 'payment' ? 'The payment and linked debit post together.' : 'This operation will be recorded in the account ledger.';
  const effectiveType = type === 'transaction' ? values.transactionType : type;
  return <div className="modal-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}><section className="modal-card" role="dialog" aria-modal="true" aria-labelledby="modal-title"><div className="modal-header"><div className="modal-heading-icon"><CircleDollarSign size={19} /></div><div><h2 id="modal-title">{heading}</h2><p>{description}</p></div><button className="icon-button" onClick={onClose} aria-label="Close dialog"><X size={19} /></button></div><form onSubmit={submit}><div className="modal-body">
    {type === 'customer' && <div className="form-grid"><Field label="Student ID" required><input autoFocus maxLength="40" required value={values.student_id || ''} onChange={set('student_id')} placeholder="STU-24001" /></Field><Field label="Graduation year"><input type="number" min="2000" max="2200" step="1" value={values.graduation_year || ''} onChange={set('graduation_year')} placeholder="2027" /></Field><Field label="First name" required><input maxLength="80" required value={values.first_name || ''} onChange={set('first_name')} placeholder="e.g. Asha" /></Field><Field label="Last name" required><input maxLength="80" required value={values.last_name || ''} onChange={set('last_name')} placeholder="e.g. Patel" /></Field><Field label="College / institution" wide><input maxLength="180" value={values.institution || ''} onChange={set('institution')} placeholder="Campus University" /></Field><Field label="Department / course" wide><input maxLength="120" value={values.department || ''} onChange={set('department')} placeholder="Computer Science" /></Field><Field label="Email address" required wide><input type="email" maxLength="254" required value={values.email || ''} onChange={set('email')} placeholder="name@example.edu" /></Field><Field label="Phone number"><input value={values.phone || ''} onChange={set('phone')} placeholder="+1 (555) 000-0000" /></Field><Field label="Date of birth"><input type="date" value={values.date_of_birth || ''} onChange={set('date_of_birth')} /></Field><Field label="Address" wide><input value={values.address || ''} onChange={set('address')} placeholder="Street, city, state" /></Field></div>}
    {type === 'account' && record && <div className="form-grid"><div className="account-modal-info"><span>ACCOUNT NUMBER</span><strong>{record.account_number}</strong><small>Balance: {money(record.opening_balance)} opening balance</small></div><Field label="Account status" wide><select required value={values.status || record.status} onChange={set('status')}><option value="active">Active</option><option value="frozen">Frozen</option><option value="closed">Closed</option></select></Field></div>}
    {type === 'account' && !record && <div className="form-grid"><Field label="Student" required wide><select required value={values.customer_id || ''} onChange={set('customer_id')}><option value="">Choose a student</option>{customers.map((customer) => <option value={customer.customer_id} key={customer.customer_id}>{fullName(customer)}</option>)}</select></Field><Field label="Branch" required><select required value={values.branch_id || ''} onChange={set('branch_id')}><option value="">Choose a branch</option>{branches.map((branch) => <option value={branch.branch_id} key={branch.branch_id}>{branch.name}</option>)}</select></Field><Field label="Account type" required><select required value={values.account_type || 'checking'} onChange={set('account_type')}><option value="checking">Checking</option><option value="savings">Savings</option><option value="fixed_deposit">Fixed deposit</option></select></Field><Field label="Account number" required><input required maxLength="34" value={values.account_number || ''} onChange={set('account_number')} placeholder="ACCT-10012" /></Field><Field label="Opening balance" hint="USD"><input type="number" min="0" step="0.01" value={values.opening_balance || ''} onChange={set('opening_balance')} placeholder="0.00" /></Field></div>}
    {type === 'transaction' && <Field label="Choose operation"><select value={values.transactionType} onChange={(event) => { setValues((current) => ({ ...current, transactionType: event.target.value })); }}><option value="deposit">Deposit</option><option value="withdrawal">Withdrawal</option><option value="transfer">Transfer</option></select></Field>}
    {(effectiveType === 'deposit' || effectiveType === 'withdrawal') && <div className="form-grid"><Field label="Account" required wide><select required value={values.accountId || ''} onChange={set('accountId')}><option value="">Select an active account</option>{accounts.filter((account) => account.status === 'active').map((account) => <option value={account.account_id} key={account.account_id}>{account.account_number} · {fullName(customers.find((customer) => customer.customer_id === account.customer_id))}</option>)}</select></Field><Field label={effectiveType === 'deposit' ? 'Income type' : 'Spending category'}><select value={values.expenseCategoryId || ''} onChange={set('expenseCategoryId')}><option value="">Uncategorized</option>{categories.filter((category) => category.category_type === (effectiveType === 'deposit' ? 'income' : 'expense')).map((category) => <option value={category.expense_category_id} key={category.expense_category_id}>{category.category_name}</option>)}</select></Field><Field label="Amount" required hint="USD"><input type="number" min="0.01" step="0.01" required value={values.amount || ''} onChange={set('amount')} placeholder="0.00" /></Field><Field label="Description" wide><input maxLength="500" value={values.description || ''} onChange={set('description')} placeholder="Optional note" /></Field></div>}
    {effectiveType === 'transfer' && <div className="form-grid"><Field label="From account" required wide><select required value={values.sourceAccountId || ''} onChange={set('sourceAccountId')}><option value="">Choose source</option>{accounts.filter((account) => account.status === 'active').map((account) => <option value={account.account_id} key={account.account_id}>{account.account_number} · {fullName(customers.find((customer) => customer.customer_id === account.customer_id))}</option>)}</select></Field><div className="transfer-separator"><ArrowDownLeft size={16} /></div><Field label="To account" required wide><select required value={values.destinationAccountId || ''} onChange={set('destinationAccountId')}><option value="">Choose destination</option>{accounts.filter((account) => account.status === 'active' && String(account.account_id) !== String(values.sourceAccountId)).map((account) => <option value={account.account_id} key={account.account_id}>{account.account_number} · {fullName(customers.find((customer) => customer.customer_id === account.customer_id))}</option>)}</select></Field><Field label="Amount" required hint="USD"><input type="number" min="0.01" step="0.01" required value={values.amount || ''} onChange={set('amount')} placeholder="0.00" /></Field><Field label="Description"><input maxLength="500" value={values.description || ''} onChange={set('description')} placeholder="Optional note" /></Field></div>}
    {type === 'loan' && <div className="form-grid"><Field label="Borrower" required wide><select required value={values.customer_id || ''} onChange={set('customer_id')}><option value="">Choose customer</option>{customers.map((customer) => <option value={customer.customer_id} key={customer.customer_id}>{fullName(customer)}</option>)}</select></Field><Field label="Issuing branch" required><select required value={values.branch_id || ''} onChange={set('branch_id')}><option value="">Choose branch</option>{branches.map((branch) => <option value={branch.branch_id} key={branch.branch_id}>{branch.name}</option>)}</select></Field><Field label="Loan number" required><input required value={values.loan_number || ''} onChange={set('loan_number')} placeholder="LOAN-20005" /></Field><Field label="Principal amount" required hint="USD"><input type="number" min="0.01" step="0.01" required value={values.principal_amount || ''} onChange={set('principal_amount')} placeholder="0.00" /></Field><Field label="Annual interest rate" hint="%"><input type="number" min="0" step="0.0001" value={values.annual_interest_rate || ''} onChange={set('annual_interest_rate')} placeholder="6.2500" /></Field><Field label="Term" required hint="months"><input type="number" min="1" step="1" required value={values.term_months || ''} onChange={set('term_months')} placeholder="36" /></Field><Field label="Issue date" required><input type="date" required value={values.issued_on || ''} onChange={set('issued_on')} /></Field><Field label="Due date" required><input type="date" required value={values.due_on || ''} onChange={set('due_on')} /></Field></div>}
    {type === 'payment' && (() => {
      const currentLoan = loans.find((l) => String(l.loan_id) === String(values.loanId));
      const eligibleAccounts = accounts.filter((account) => account.status === 'active' && (!currentLoan || Number(account.customer_id) === Number(currentLoan.customer_id)));
      return <div className="form-grid"><Field label="Loan" required wide><select required value={values.loanId || ''} onChange={set('loanId')}><option value="">Choose loan</option>{loans.filter((loan) => ['active', 'pending'].includes(loan.status)).map((loan) => <option value={loan.loan_id} key={loan.loan_id}>{loan.loan_number} · {fullName(customers.find((customer) => customer.customer_id === loan.customer_id))} · {money(loan.principal_amount)}</option>)}</select></Field><Field label="Paying account" required wide><select required value={values.accountId || ''} onChange={set('accountId')}><option value="">Choose borrower account</option>{eligibleAccounts.map((account) => <option value={account.account_id} key={account.account_id}>{account.account_number} · {fullName(customers.find((customer) => customer.customer_id === account.customer_id))}</option>)}</select></Field><Field label="Principal paid" hint="USD"><input type="number" min="0" step="0.01" value={values.principalPaid || ''} onChange={set('principalPaid')} placeholder="0.00" /></Field><Field label="Interest paid" hint="USD"><input type="number" min="0" step="0.01" value={values.interestPaid || ''} onChange={set('interestPaid')} placeholder="0.00" /></Field><Field label="Description" wide><input maxLength="500" value={values.description || ''} onChange={set('description')} placeholder="Installment note" /></Field></div>;
    })()}
    {type === 'goal' && <div className="form-grid">{!editing && <><Field label="Student" required wide><select required value={values.customer_id || ''} onChange={set('customer_id')}><option value="">Choose student</option>{customers.map((student) => <option value={student.customer_id} key={student.customer_id}>{student.student_id || 'Student'} · {fullName(student)}</option>)}</select></Field><Field label="Linked account" required wide><select required value={values.account_id || ''} onChange={set('account_id')}><option value="">Choose account</option>{accounts.filter((account) => !values.customer_id || String(account.customer_id) === String(values.customer_id)).map((account) => <option value={account.account_id} key={account.account_id}>{account.account_number} · {account.account_type}</option>)}</select></Field></>}<Field label="Goal name" required wide><input required maxLength="120" value={values.goal_name || ''} onChange={set('goal_name')} placeholder="Laptop fund" /></Field><Field label="Target amount" required hint="USD"><input required type="number" min="0.01" step="0.01" value={values.target_amount || ''} onChange={set('target_amount')} placeholder="1200.00" /></Field><Field label="Target date"><input type="date" value={values.target_date || ''} onChange={set('target_date')} /></Field>{editing && <Field label="Status" wide><select value={values.status || 'active'} onChange={set('status')}><option value="active">Active</option><option value="completed">Completed</option><option value="cancelled">Cancelled</option></select></Field>}</div>}
    {error && <div className="form-error"><X size={15} />{error}</div>}
    {type !== 'customer' && type !== 'account' && <div className="form-note"><ShieldCheck size={16} /><span>Balances and account status are validated by the server before posting.</span></div>}
    </div><div className="modal-footer"><button type="button" className="button button-soft" onClick={onClose} disabled={busy}>Cancel</button><button className="button button-primary" disabled={busy}>{busy ? <LoaderCircle size={16} className="spin" /> : <Check size={16} />}{busy ? 'Saving…' : 'Confirm & save'}</button></div></form></section></div>;
}

function Field({ label, required, hint, wide, children }) { return <label className={`form-field ${wide ? 'field-wide' : ''}`}><span>{label}{required && <b> *</b>}{hint && <small>{hint}</small>}</span>{children}</label>; }

export default App;
