let currentUser = null;
let balance = 0;
let betHistory = [];
let withdrawHistory = [];

// BƯỚC QUAN TRỌNG: Thay link này bằng link "Web Service" Render cấp cho bạn
const PROD_API_URL = "https://hieubet-web-app.onrender.com";

// Tự động nhận diện địa chỉ API
const getApiUrl = () => {
    const { hostname, port, protocol } = window.location;

    // Nếu mở file trực tiếp (file://)
    if (protocol === 'file:') return "http://127.0.0.1:3000";

    // Nếu bạn đang ở trên GitHub Pages, bắt buộc phải trỏ về Render
    if (hostname.includes("github.io")) {
        return PROD_API_URL;
    }

    // Nếu đang chạy ở local (Live Server), trỏ về cổng 3000
    if (port !== "3000" && port !== "") {
        return `http://${hostname}:3000`;
    }
    return ""; // Dùng đường dẫn tương đối khi đã chạy đúng cổng server
};
const API_URL = getApiUrl();

async function fetchData(endpoint, options = {}) {
    const url = `${API_URL}${endpoint}`;
    console.log(`📡 Đang gọi API: ${url}`);
    return fetch(`${API_URL}${endpoint}`, {
        method: options.method || 'GET',
        headers: { 'Content-Type': 'application/json' },
        body: options.body ? JSON.stringify(options.body) : null
    })
        .then(res => {
            if (!res.ok) throw new Error("Server trả về lỗi");
            return res.json();
        })
        .catch(error => {
            console.error("Fetch Error:", error);
            showToast("❌ Không thể kết nối đến Server! Hãy chắc chắn bạn đã chạy 'node server.js' trong Terminal.", "error");
            return { success: false, message: "Lỗi kết nối server." };
        });
}

function toggleAuth(isRegister) {
    document.getElementById('loginForm').classList.toggle('hidden', isRegister);
    document.getElementById('registerForm').classList.toggle('hidden', !isRegister);
    document.getElementById('authTitle').textContent = isRegister ? "Tạo tài khoản mới miễn phí" : "Đăng nhập để bắt đầu trải nghiệm";
}

async function handleRegister() {
    const btn = document.querySelector('#registerForm button');
    const user = document.getElementById('regUser').value.trim();
    const pass = document.getElementById('regPass').value;
    const confirm = document.getElementById('regPassConfirm').value;

    if (!user || user.length < 4) return showToast("Tên đăng nhập tối thiểu 4 ký tự", "error");
    if (pass.length < 4) return showToast("Mật khẩu tối thiểu 4 ký tự", "error");
    if (pass !== confirm) return showToast("Mật khẩu nhập lại không khớp", "error");

    btn.disabled = true;
    btn.textContent = "ĐANG XỬ LÝ...";

    const res = await fetchData('/api/register', { method: 'POST', body: { username: user, password: pass } });

    btn.disabled = false;
    btn.textContent = "ĐĂNG KÝ TÀI KHOẢN";

    if (!res.success) return showToast(res.message, "error");

    showToast("🎉 Đăng ký thành công! Hãy đăng nhập.");
    toggleAuth(false);
}

async function handleLogin() {
    const user = document.getElementById('loginUser').value.trim();
    const pass = document.getElementById('loginPass').value;
    const btn = document.querySelector('#loginForm button');

    if (!user || !pass) return showToast("Vui lòng nhập đầy đủ!", "error");

    btn.disabled = true;
    btn.textContent = "ĐANG ĐĂNG NHẬP...";

    const res = await fetchData('/api/login', { method: 'POST', body: { username: user, password: pass } });

    btn.disabled = false;
    btn.textContent = "ĐĂNG NHẬP";

    if (res.success) {
        currentUser = res.user.username;
        balance = res.user.balance;
        betHistory = res.user.betHistory || [];
        withdrawHistory = res.user.withdrawHistory || [];
        localStorage.setItem('sunwin_session', currentUser);
        initGame();
    } else { showToast(res.message, "error"); }
}

function initGame() {
    document.getElementById('authContainer').classList.add('hidden');
    document.getElementById('gameContainer').classList.remove('hidden');
    updateBalanceDisplay();
    if (currentUser === '0708069602') {
        document.getElementById('adminBtn').classList.remove('hidden');
        renderAdminUserList(); renderAdminDepositList(); renderAdminWithdrawList();
    } else {
        document.getElementById('adminBtn').classList.add('hidden');
    }
    startTimer();
}

function handleLogout() { localStorage.removeItem('sunwin_session'); location.reload(); }

window.onload = async () => {
    const session = localStorage.getItem('sunwin_session');
    if (session) {
        const res = await fetchData(`/api/user/${session}`);
        if (res.success) {
            currentUser = res.user.username;
            balance = res.user.balance;
            betHistory = res.user.betHistory || [];
            withdrawHistory = res.user.withdrawHistory || [];
            initGame();
        }
    }

    // Tự động điền tài khoản Admin để tiện sử dụng
    if (document.getElementById('loginUser')) document.getElementById('loginUser').value = '0708069602';
    if (document.getElementById('loginPass')) document.getElementById('loginPass').value = '0708069602';

    document.getElementById('betAmount')?.addEventListener('keydown', (e) => { if (e.key === 'Enter') e.preventDefault(); });

    document.getElementById('playBtn')?.addEventListener('click', (e) => { e.preventDefault(); placeBet(); });
    document.getElementById('bowl')?.addEventListener('click', function () { if (isOpening) this.classList.add('open'); });
}

let timeLeft = 40, timerInterval = null, hasBet = false, sideBet = null, amountBet = 0, currentBetId = null, isOpening = false;

function startTimer() {
    if (timerInterval) clearInterval(timerInterval);
    timeLeft = 40; isOpening = false; hasBet = false; sideBet = null; selectedSide = null; currentBetId = null;
    const btn = document.getElementById('playBtn');
    btn.disabled = false; btn.textContent = "ĐẶT CƯỢC"; btn.classList.remove('opacity-50');
    document.getElementById('btnLeft').className = 'bet-button py-4 rounded-2xl font-black text-xl text-gray-400';
    document.getElementById('btnRight').className = 'bet-button py-4 rounded-2xl font-black text-xl text-gray-400';
    document.getElementById('result').textContent = "";
    ['dice1', 'dice2', 'dice3'].forEach(id => document.getElementById(id).style.transform = `rotateX(0deg) rotateY(0deg)`);
    document.getElementById('bowl').classList.remove('open');
    updateTimerDisplay();
    timerInterval = setInterval(() => {
        timeLeft--; updateTimerDisplay();
        if (timeLeft <= 0) { clearInterval(timerInterval); autoOpenPlates(); }
    }, 1000);
}

function updateTimerDisplay() {
    const el = document.getElementById('countdown');
    el.textContent = timeLeft; el.classList.toggle('text-red-500', timeLeft <= 5);
}

let selectedSide = null;
function selectSide(side) {
    if (isOpening || hasBet) return;
    const input = document.getElementById('betAmount');
    let currentBet = parseInt(input.value) || 10000;
    selectedSide = side;
    document.getElementById('btnLeft').className = side === 'left' ? 'bet-button active py-4 rounded-2xl font-black text-xl text-yellow-400' : 'bet-button py-4 rounded-2xl font-black text-xl text-gray-400';
    document.getElementById('btnRight').className = side === 'right' ? 'bet-button active py-4 rounded-2xl font-black text-xl text-yellow-400' : 'bet-button py-4 rounded-2xl font-black text-xl text-gray-400';
}

async function placeBet() {
    if (isOpening || timeLeft <= 3 || hasBet) return;
    const amount = parseInt(document.getElementById('betAmount').value);
    if (!selectedSide || isNaN(amount) || amount < 1000) return showToast("Kiểm tra lại lựa chọn!", "error");
    if (balance < amount) return showToast("Số dư không đủ!", "error");

    hasBet = true; sideBet = selectedSide; amountBet = amount;
    const res = await fetchData('/api/place-bet', { method: 'POST', body: { username: currentUser, side: selectedSide, amount } });
    if (res.success) {
        balance = res.balance; betHistory = res.betHistory; currentBetId = res.betId;
        updateBalanceDisplay();
        showToast("✅ Đặt cược thành công!");
    } else { hasBet = false; showToast(res.message, "error"); }
}

function autoOpenPlates() {
    isOpening = true;
    document.getElementById('mainPlate').classList.add('rolling');
    setTimeout(() => {
        document.getElementById('mainPlate').classList.remove('rolling');
        sendResolveBetToServer(currentBetId);
    }, 2000);
}

async function sendResolveBetToServer(bid) {
    const r = await fetchData('/api/resolve-bet', { method: 'POST', body: { username: currentUser, betId: bid } });
    if (r.success) {
        const { dice, total, balance: newBal, betHistory: newHist } = r;
        dice.forEach((v, i) => {
            let rX = 0, rY = 0;
            if (v === 1) { rX = 0; rY = 0; } else if (v === 2) { rX = 0; rY = -90; } else if (v === 3) { rX = -90; rY = 0; }
            else if (v === 4) { rX = 90; rY = 0; } else if (v === 5) { rX = 0; rY = 90; } else if (v === 6) { rX = 0; rY = 180; }
            document.getElementById(`dice${i + 1}`).style.transform = `rotateX(${rX + 720}deg) rotateY(${rY + 720}deg)`;
        });
        setTimeout(() => document.getElementById('bowl').classList.add('open'), 500);
        balance = newBal; betHistory = newHist; updateBalanceDisplay();

        const winnerSide = (total >= 4 && total <= 10) ? 'left' : 'right';
        const resultEl = document.getElementById('result');
        if (hasBet) {
            const lastBet = newHist.find(b => b.id === bid);
            if (lastBet && lastBet.result === 'Thắng') {
                resultEl.innerHTML = `<span class="text-green-400">🎉 THẮNG +${lastBet.winAmount.toLocaleString()}đ</span>`;
            } else {
                resultEl.innerHTML = `<span class="text-red-400 font-bold">THUA!</span>`;
            }
        } else {
            resultEl.innerHTML = `<span class="text-yellow-400 font-bold">TỔNG: ${total}</span>`;
        }

        setTimeout(startTimer, 5000);
    }
}

function updateBalanceDisplay() {
    document.getElementById('balance').textContent = balance.toLocaleString();
    document.getElementById('balance2').textContent = balance.toLocaleString();
}

function openModal(id) {
    document.getElementById(id).classList.remove('hidden');
    if (id === 'profileModal') loadProfileData();
    else if (id === 'historyModal') renderHistory();
    else if (id === 'adminModal') { renderAdminDepositList(); renderAdminUserList(); renderAdminWithdrawList(); }
}

function closeModal(id) { document.getElementById(id).classList.add('hidden'); }

function loadProfileData() {
    document.getElementById('profileUsername').textContent = currentUser;
    document.getElementById('profileBalance').textContent = balance.toLocaleString();
    fetchData(`/api/user/${currentUser}`).then(res => {
        if (res.success) {
            document.getElementById('profileFullName').value = res.user.fullName || "";
            document.getElementById('profilePhone').value = res.user.phone || "";
            if (res.user.avatar) {
                document.getElementById('profileAvatarPreview').src = res.user.avatar;
            }
        }
    });
}

function showTransferInfo() {
    const amount = document.getElementById('depositAmount').value;
    if (!amount || amount < 10000) return showToast("Số tiền tối thiểu 10,000đ", "error");
    document.getElementById('displayDepositAmount').textContent = parseInt(amount).toLocaleString() + "đ";
    document.getElementById('depositStep1').classList.add('hidden');
    document.getElementById('depositStep2').classList.remove('hidden');
}

async function confirmDeposit(btn) {
    const amount = document.getElementById('depositAmount').value;
    const code = document.getElementById('transferCode').textContent;
    const res = await fetchData('/api/deposit', { method: 'POST', body: { username: currentUser, amount, code } });
    if (res.success) {
        showToast(res.message);
        closeModal('depositModal');
    } else { showToast(res.message, "error"); }
}

function showToast(msg, type = 'success') {
    const t = document.getElementById('toast');
    t.textContent = msg;
    t.style.backgroundColor = type === 'success' ? '#10b981' : '#ef4444';
    t.classList.remove('hidden');
    t.classList.add('toast-active');
    setTimeout(() => {
        t.classList.add('hidden');
        t.classList.remove('toast-active');
    }, 3000);
}

let tempAvatarBase64 = null;
function previewAvatar(input) {
    if (input.files && input.files[0]) {
        const reader = new FileReader();
        reader.onload = function (e) {
            document.getElementById('profileAvatarPreview').src = e.target.result;
            tempAvatarBase64 = e.target.result;
        };
        reader.readAsDataURL(input.files[0]);
    }
}

async function saveProfile(btn) {
    const fullName = document.getElementById('profileFullName').value.trim();
    const phone = document.getElementById('profilePhone').value.trim();
    if (fullName.length < 2) return showToast("Họ tên quá ngắn!", "error");
    if (!/^\d{10,11}$/.test(phone)) return showToast("SĐT không hợp lệ!", "error");
    const res = await fetchData('/api/update-profile', { method: 'POST', body: { username: currentUser, fullName, phone, avatar: tempAvatarBase64 } });
    if (res.success) { showToast("✅ Thành công!"); closeModal('profileModal'); }
}

async function handleDeposit() {
    const amt = parseInt(document.getElementById('depositAmount').value);
    const code = document.getElementById('depositCode').value.trim();
    if (!amt || amt < 10000) return showToast("Tối thiểu 10.000đ", "error");
    if (!code) return showToast("Vui lòng nhập mã giao dịch", "error");

    const res = await fetchData('/api/deposit', { method: 'POST', body: { username: currentUser, amount: amt, code: code } });
    if (res.success) {
        showToast(res.message);
        closeModal('depositModal');
    } else { showToast(res.message, "error"); }
}

async function handleWithdraw() {
    const amt = parseInt(document.getElementById('withdrawAmount').value);
    const bank = document.getElementById('withdrawBank').value;
    const num = document.getElementById('withdrawNumber').value;
    const holder = document.getElementById('withdrawHolder').value;
    if (!amt || amt < 50000) return showToast("Tối thiểu 50k", "error");
    const res = await fetchData('/api/withdraw', { method: 'POST', body: { username: currentUser, amount: amt, bankName: bank, accountNumber: num, accountHolder: holder } });
    if (res.success) {
        balance = res.balance;
        withdrawHistory = res.withdrawHistory;
        updateBalanceDisplay();
        closeModal('withdrawModal');
        showToast("🚀 Đã gửi lệnh rút!");
    }
}

function switchHistoryTab(tab) {
    const isBet = tab === 'bet';
    document.getElementById('tabBet').className = isBet ? 'flex-1 py-3 text-sm font-bold border-b-2 border-yellow-400 text-yellow-400' : 'flex-1 py-3 text-sm font-bold border-b-2 border-transparent text-gray-500';
    document.getElementById('tabWithdraw').className = !isBet ? 'flex-1 py-3 text-sm font-bold border-b-2 border-yellow-400 text-yellow-400' : 'flex-1 py-3 text-sm font-bold border-b-2 border-transparent text-gray-500';
    document.getElementById('betHistoryList').classList.toggle('hidden', !isBet);
    document.getElementById('withdrawHistoryList').classList.toggle('hidden', isBet);
}

function renderHistory() {
    const bList = document.getElementById('betHistoryList');
    bList.innerHTML = betHistory.length ? '' : '<p class="text-center text-gray-500 py-4">Chưa có lịch sử</p>';
    betHistory.forEach(h => {
        const d = document.createElement('div');
        d.className = 'bg-black/40 p-3 rounded-xl border border-white/5 flex justify-between text-xs';
        const statusCls = h.result === 'Thắng' ? 'text-green-400' : 'text-red-400';
        d.innerHTML = `<div>${h.side === 'left' ? 'XỈU' : 'TÀI'} - ${h.amount.toLocaleString()}đ</div><div class="${statusCls}">${h.result}</div>`;
        bList.appendChild(d);
    });

    const wList = document.getElementById('withdrawHistoryList');
    wList.innerHTML = withdrawHistory.length ? '' : '<p class="text-center text-gray-500 py-4">Chưa có lịch sử</p>';
    withdrawHistory.forEach(h => {
        const d = document.createElement('div');
        d.className = 'bg-black/40 p-3 rounded-xl border border-white/5 flex justify-between text-xs';
        const sCls = h.status === 'Hoàn thành' ? 'text-green-400' : 'text-blue-400 animate-pulse';
        d.innerHTML = `<div>Rút ${h.amount.toLocaleString()}đ</div><div class="${sCls}">${h.status}</div>`;
        wList.appendChild(d);
    });
}

async function renderAdminDepositList() {
    const d = await fetchData('/api/admin/data');
    const el = document.getElementById('adminDepositList');
    el.innerHTML = d.requests.length ? '' : '<p class="text-gray-500 text-xs italic">Trống</p>';
    d.requests.forEach(r => {
        const dv = document.createElement('div');
        dv.className = 'bg-black p-3 rounded-xl flex justify-between border border-red-900/30 text-xs';
        dv.innerHTML = `<div>${r.user} - ${r.amount.toLocaleString()}đ</div><button onclick="approveDeposit('${r.id}')" class="text-green-400">Duyệt</button>`;
        el.appendChild(dv);
    });
}

async function approveDeposit(id) {
    const res = await fetchData('/api/admin/action', { method: 'POST', body: { type: 'approveDeposit', reqId: id } });
    if (res.success) {
        showToast("✅ Đã duyệt nạp!");
        renderAdminDepositList();
    }
}

function setAdminResult(mode) {
    fetchData('/api/admin/action', { method: 'POST', body: { type: 'setResult', mode } })
        .then(r => { if (r.success) showToast(`🎯 Admin: ${mode.toUpperCase()}`); });

    document.getElementById('ctrlLeft').className = mode === 'left' ? 'bg-red-600 py-3 rounded-xl text-xs font-bold border border-red-400' : 'bg-zinc-800 py-3 rounded-xl text-xs font-bold border border-zinc-700';
    document.getElementById('ctrlRight').className = mode === 'right' ? 'bg-red-600 py-3 rounded-xl text-xs font-bold border border-red-400' : 'bg-zinc-800 py-3 rounded-xl text-xs font-bold border border-zinc-700';
    document.getElementById('ctrlRandom').className = mode === 'random' ? 'bg-blue-600 py-3 rounded-xl text-xs font-bold border border-blue-400' : 'bg-zinc-800 py-3 rounded-xl text-xs font-bold border border-zinc-700';
}

async function renderAdminWithdrawList() {
    const d = await fetchData('/api/admin/data');
    const el = document.getElementById('adminWithdrawList');
    el.innerHTML = d.withdrawals.length ? '' : '<p class="text-gray-500 text-xs italic">Trống</p>';
    d.withdrawals.forEach(r => {
        const dv = document.createElement('div');
        dv.className = 'bg-black p-3 rounded-xl flex justify-between border border-blue-900/30 text-xs';
        const btnLabel = r.status === 'Đang xử lý' ? 'XÁC NHẬN' : 'HOÀN THÀNH';
        dv.innerHTML = `
            <div>
                <div class="font-bold text-blue-400">${r.user} - ${r.amount.toLocaleString()}đ</div>
                <div class="text-[10px] text-gray-500">${r.bankName} | ${r.accountNumber}</div>
            </div>
            <div class="flex gap-1">
                <button onclick="approveWithdraw('${r.id}')" class="text-green-400 font-bold">${btnLabel}</button>
            </div>`;
        el.appendChild(dv);
    });
}

async function approveWithdraw(id) {
    const res = await fetchData('/api/admin/action', { method: 'POST', body: { type: 'approveWithdraw', reqId: id } });
    if (res.success) { showToast("✅ Cập nhật trạng thái!"); renderAdminWithdrawList(); }
}

async function renderAdminUserList() {
    const d = await fetchData('/api/admin/data');
    const el = document.getElementById('adminUserList');
    el.innerHTML = '';
    Object.keys(d.users).forEach(u => {
        if (u === '0708069602') return;
        const usr = d.users[u];
        const dv = document.createElement('div');
        dv.className = 'bg-black p-3 rounded-xl flex justify-between border border-zinc-800 text-xs';
        dv.innerHTML = `
            <div>
                <div class="font-bold ${usr.isLocked ? 'text-red-500' : 'text-white'}">${u}</div>
                <div class="text-gray-500">${usr.balance.toLocaleString()}đ</div>
            </div>
            <button onclick="toggleLock('${u}', ${!usr.isLocked})" class="${usr.isLocked ? 'text-green-500' : 'text-red-500'}">
                <i class="fa-solid ${usr.isLocked ? 'fa-unlock' : 'fa-lock'}"></i>
            </button>`;
        el.appendChild(dv);
    });
}

async function toggleLock(t, l) {
    await fetchData('/api/admin/action', { method: 'POST', body: { type: 'lock', target: t, value: l } });
    showToast(`Đã ${l ? 'khóa' : 'mở'} tài khoản ${t}`);
    renderAdminUserList();
}
