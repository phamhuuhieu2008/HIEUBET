require('dotenv').config();
const express = require('express');
const cors = require('cors');
const fs = require('fs').promises;
const fsSync = require('fs');
const path = require('path');

const app = express();
app.use(cors({
    origin: '*', // Cho phép tất cả các nguồn truy cập (bao gồm GitHub Pages)
    methods: ['GET', 'POST', 'PUT', 'DELETE'],
    allowedHeaders: ['Content-Type']
}));
app.use(express.json());
app.use(express.static(path.join(__dirname, '.')));

// --- QUẢN LÝ CƠ SỞ DỮ LIỆU JSON ---
const DATA_DIR = path.join(__dirname, 'data');
const USERS_FILE = path.join(DATA_DIR, 'users.json');
const DEPOSITS_FILE = path.join(DATA_DIR, 'deposits.json');
const WITHDRAWS_FILE = path.join(DATA_DIR, 'withdraws.json');

if (!fsSync.existsSync(DATA_DIR)) fsSync.mkdirSync(DATA_DIR);

// --- TỰ ĐỘNG KHÔI PHỤC DỮ LIỆU CŨ (MIGRATION) ---
const oldFiles = ['users.json', 'deposits.json', 'withdraws.json'];
oldFiles.forEach(file => {
    const oldPath = path.join(__dirname, file);
    const newPath = path.join(DATA_DIR, file);
    // Nếu file tồn tại ở thư mục gốc nhưng chưa có trong thư mục data
    if (fsSync.existsSync(oldPath) && !fsSync.existsSync(newPath)) {
        fsSync.renameSync(oldPath, newPath);
        console.log(`✅ Đã khôi phục dữ liệu cũ: ${file} -> data/${file}`);
    }
});

function loadData(file, defaultVal = {}) {
    try {
        if (fsSync.existsSync(file)) {
            const content = fsSync.readFileSync(file, 'utf8').trim();
            const data = content ? JSON.parse(content) : defaultVal;

            // Đảm bảo Admin luôn có trong danh sách users khi load từ file
            if (file === USERS_FILE) {
                return { ...data, ...DEFAULT_ADMIN };
            }
            return data;
        }
        return defaultVal;
    } catch (e) {
        console.error(`Lỗi đọc file ${file}:`, e.message);
        return defaultVal;
    }
}

function saveData(file, data) {
    try {
        let dataToSave = data;
        // Nếu là file users, lọc bỏ tài khoản Admin trước khi lưu để không lưu vào JSON
        if (file === USERS_FILE) {
            dataToSave = { ...data };
            Object.keys(DEFAULT_ADMIN).forEach(key => delete dataToSave[key]);
        }

        const jsonData = JSON.stringify(dataToSave, null, 4); // Dùng 4 spaces để dễ đọc hơn

        // Ghi vào một file tạm trước, sau đó rename để đảm bảo tính nguyên tử (Atomic write)
        // Việc này giúp file JSON không bao giờ bị trống nếu server sập giữa chừng
        const tempFile = `${file}.tmp`;
        fsSync.writeFileSync(tempFile, jsonData, 'utf8');
        fsSync.renameSync(tempFile, file);

    } catch (e) {
        console.error(`❌ Lỗi nghiêm trọng khi ghi file ${file}:`, e.message);
    }
}

const DEFAULT_ADMIN = {
    "0708069602": { password: "0708069602", balance: 99999999, isLocked: false, betHistory: [], withdrawHistory: [] }
};
let users = loadData(USERS_FILE, DEFAULT_ADMIN);
let deposits = loadData(DEPOSITS_FILE, []);
let withdraws = loadData(WITHDRAWS_FILE, []);

let nextResultOverride = 'random';

// --- HỆ THỐNG THỜI GIAN TOÀN CỤC (GLOBAL GAME TIMER) ---
let globalTime = 40;
let gamePhase = 'betting'; // 'betting' hoặc 'rolling'

setInterval(() => {
    if (globalTime > 0) {
        globalTime--;
    } else {
        if (gamePhase === 'betting') {
            gamePhase = 'rolling';
            globalTime = 10; // 10 giây chờ mở bát và xem kết quả
        } else {
            gamePhase = 'betting';
            globalTime = 40;
        }
    }
}, 1000);

app.get('/api/game-state', (req, res) => {
    res.json({ timeLeft: globalTime, phase: gamePhase });
});

/**
 * API Nạp tiền
 */
app.post('/api/deposit', async (req, res) => {
    try {
        const { username, amount, code } = req.body;
        users = loadData(USERS_FILE, DEFAULT_ADMIN); // Đồng bộ lại từ JSON
        if (!users[username]) return res.json({ success: false, message: "Người dùng không tồn tại" });

        deposits.push({ id: Date.now(), user: username, amount: parseInt(amount), code, status: 'Pending', time: new Date() });
        saveData(DEPOSITS_FILE, deposits);
        res.json({ success: true, message: "Yêu cầu nạp đã gửi! Vui lòng chờ Admin xác nhận." });
    } catch (e) { res.json({ success: false, message: "Lỗi hệ thống" }); }
});

/**
 * API Rút tiền
 */
app.post('/api/withdraw', async (req, res) => {
    try {
        const { username, amount, bankName, accountNumber, accountHolder } = req.body;
        users = loadData(USERS_FILE, DEFAULT_ADMIN); // Đồng bộ lại từ JSON
        const user = users[username];

        if (user && user.balance >= amount) {
            user.balance -= parseInt(amount);
            const req = { id: Date.now(), user: username, amount: parseInt(amount), bankName, accountNumber, accountHolder, status: 'Đang xử lý', time: new Date() };
            user.withdrawHistory.unshift(req);
            withdraws.push(req);
            saveData(USERS_FILE, users);
            saveData(WITHDRAWS_FILE, withdraws);
            res.json({ success: true, balance: user.balance, withdrawHistory: user.withdrawHistory });
        } else { res.json({ success: false, message: "Số dư không đủ!" }); }
    } catch (e) { res.json({ success: false, message: "Lỗi hệ thống" }); }
});

/**
 * API Đăng ký & Đăng nhập
 */
app.post('/api/register', async (req, res) => {
    try {
        const { username, password } = req.body;
        if (!username || !password) return res.json({ success: false, message: "Thiếu thông tin!" });

        // Ngăn chặn việc đăng ký trùng với tài khoản Admin cố định
        if (DEFAULT_ADMIN[username]) return res.json({ success: false, message: "Tài khoản Admin đã tồn tại!" });

        // Đọc lại từ file để đảm bảo không trùng lặp dữ liệu mới nhất
        const currentUsers = loadData(USERS_FILE, DEFAULT_ADMIN);
        if (currentUsers[username]) return res.json({ success: false, message: "Tài khoản đã tồn tại!" });

        currentUsers[username] = { password, balance: 10000, isLocked: false, betHistory: [], withdrawHistory: [] };
        saveData(USERS_FILE, currentUsers);
        users = currentUsers; // Cập nhật bộ nhớ tạm
        res.json({ success: true, message: "Đăng ký thành công!" });
    } catch (e) { res.json({ success: false, message: "Lỗi hệ thống" }); }
});

app.post('/api/login', async (req, res) => {
    const { username, password } = req.body;
    const currentUsers = loadData(USERS_FILE, DEFAULT_ADMIN);
    users = currentUsers; // Đồng bộ bộ nhớ tạm từ file JSON và Admin cố định
    const user = currentUsers[username];

    if (user && user.password === password) {
        if (user.isLocked) return res.json({ success: false, message: "Tài khoản bị khóa!" });
        res.json({ success: true, user: { ...user, username } });
    } else { res.json({ success: false, message: "Sai tài khoản hoặc mật khẩu!" }); }
});

app.get('/api/user/:username', (req, res) => {
    const user = users[req.params.username];
    if (user) res.json({ success: true, user: { ...user, username: req.params.username } });
    else res.json({ success: false, message: "User not found" });
});

/**
 * API Cập nhật trang cá nhân
 */
app.post('/api/update-profile', async (req, res) => {
    try {
        let { username, fullName, phone, avatar } = req.body;
        const user = users[username];
        if (!user) return res.json({ success: false, message: "Người dùng không tồn tại" });

        // Validation cơ bản
        fullName = fullName?.trim();
        phone = phone?.trim();

        if (!fullName || fullName.length < 2) return res.json({ success: false, message: "Họ tên không hợp lệ" });
        if (!phone || !/^\d{10,11}$/.test(phone)) return res.json({ success: false, message: "Số điện thoại phải là 10-11 chữ số" });

        user.fullName = fullName;
        user.phone = phone;
        if (avatar) user.avatar = avatar; // Lưu base64

        saveData(USERS_FILE, users);
        res.json({ success: true, message: "Cập nhật thành công" });
    } catch (e) {
        res.json({ success: false, message: "Lỗi hệ thống" });
    }
});

/**
 * API Đặt cược & Giải quyết (Cập nhật logic bảo mật Server-side)
 */
app.post('/api/place-bet', async (req, res) => {
    const { username, side, amount } = req.body;
    const user = users[username];
    if (!user || user.balance < amount) return res.json({ success: false, message: "Lỗi đặt cược" });

    const betId = Date.now();
    user.balance -= amount;
    user.betHistory.unshift({ id: betId, side, amount, result: 'Đang chờ', time: new Date() });
    saveData(USERS_FILE, users);
    res.json({ success: true, balance: user.balance, betHistory: user.betHistory, betId });
});

app.post('/api/resolve-bet', async (req, res) => {
    const { username, betId } = req.body;
    const user = users[username];
    if (!user) return res.json({ success: false, message: "User không tồn tại" });

    const betIndex = user.betHistory.findIndex(b => b.id == betId);

    if (betIndex !== -1 && user.betHistory[betIndex].result === 'Đang chờ') {
        const bet = user.betHistory[betIndex];
        let d1, d2, d3;
        const roll = () => { d1 = Math.floor(Math.random() * 6) + 1; d2 = Math.floor(Math.random() * 6) + 1; d3 = Math.floor(Math.random() * 6) + 1; };

        if (nextResultOverride === 'left') { do { roll(); } while ((d1 + d2 + d3) < 4 || (d1 + d2 + d3) > 10); }
        else if (nextResultOverride === 'right') { do { roll(); } while ((d1 + d2 + d3) < 11 || (d1 + d2 + d3) > 17); }
        else { roll(); }

        let total = d1 + d2 + d3;
        let winnerSide = (total >= 4 && total <= 10) ? 'left' : 'right';

        bet.dice = [d1, d2, d3];
        if (bet.side === winnerSide) {
            bet.result = 'Thắng';
            bet.winAmount = bet.amount * 2;
            user.balance += bet.winAmount;
        } else {
            bet.result = 'Thua';
            bet.winAmount = 0;
        }
        nextResultOverride = 'random';
        saveData(USERS_FILE, users);
        return res.json({ success: true, balance: user.balance, dice: [d1, d2, d3], total, betHistory: user.betHistory });
    }
    res.json({ success: false });
});

/**
 * API Admin
 */
app.get('/api/admin/data', async (req, res) => {
    // Đọc lại toàn bộ dữ liệu từ file để đảm bảo Admin thấy dữ liệu mới nhất
    const currentUsers = loadData(USERS_FILE, DEFAULT_ADMIN);
    const currentDeposits = loadData(DEPOSITS_FILE, []);
    const currentWithdraws = loadData(WITHDRAWS_FILE, []);
    res.json({ users: currentUsers, requests: currentDeposits.filter(d => d.status === 'Pending'), withdrawals: currentWithdraws });
});

app.post('/api/admin/action', async (req, res) => {
    const { type, target, value, reqId, mode } = req.body;
    if (type === 'setResult') { nextResultOverride = mode; return res.json({ success: true }); }

    if (type === 'approveDeposit') {
        const idx = deposits.findIndex(r => r.id == reqId);
        if (idx !== -1 && users[deposits[idx].user]) {
            users[deposits[idx].user].balance += deposits[idx].amount;
            deposits[idx].status = 'Success';
            saveData(USERS_FILE, users); saveData(DEPOSITS_FILE, deposits);
            return res.json({ success: true });
        }
    } else if (type === 'approveWithdraw') {
        const idx = withdraws.findIndex(r => r.id == reqId);
        if (idx !== -1 && users[withdraws[idx].user]) {
            const req = withdraws[idx]; const user = users[req.user];
            if (req.status === 'Đang xử lý') req.status = 'Đang chuyển';
            else if (req.status === 'Đang chuyển') { req.status = 'Hoàn thành'; withdraws.splice(idx, 1); }
            const hIdx = user.withdrawHistory.findIndex(h => h.id == reqId);
            if (hIdx !== -1) user.withdrawHistory[hIdx].status = req.status;
            saveData(USERS_FILE, users); saveData(WITHDRAWS_FILE, withdraws);
            return res.json({ success: true });
        }
    } else if (type === 'lock') {
        if (users[target]) { users[target].isLocked = value; saveData(USERS_FILE, users); return res.json({ success: true }); }
    } else if (type === 'delete') {
        delete users[target]; saveData(USERS_FILE, users); return res.json({ success: true });
    }

    res.json({ success: false });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, '0.0.0.0', () => {
    console.log(`-----------------------------------------`);
    console.log(`🚀 HIEUBET SERVER ĐANG CHẠY THÀNH CÔNG!`);
    console.log(`🔗 Truy cập ngay tại: http://127.0.0.1:${PORT}`);
    console.log(`💡 Lưu ý: Đừng đóng cửa sổ Terminal này khi chơi.`);
    console.log(`-----------------------------------------`);
});
