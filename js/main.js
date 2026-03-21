// --- 全域變數 ---
const urlParams = new URLSearchParams(window.location.search);
let roomCode = urlParams.get("code");
const isObserver = urlParams.get("obs") === "1";

let roomData = Array(40).fill(4); // 40 個平台 (10x4)，預設顏色為 4 (灰色)
let selectedColor = -1;
let isHost = false;

// --- 初始化 ---
document.addEventListener("DOMContentLoaded", () => {
    if (!roomCode) {
        // 顯示建立/加入房間介面
        document.getElementById('room-setup-overlay').style.display = 'flex';
        document.getElementById('main-content').style.display = 'none';

        // 綁定輸入框 Enter 事件
        document.getElementById('roomInput').addEventListener('keypress', (e) => {
            if (e.key === 'Enter') joinRoom();
        });
    } else {
        // 已有房號，顯示主介面並啟動
        document.getElementById('room-setup-overlay').style.display = 'none';
        document.getElementById('main-content').style.display = 'block';

        if (document.getElementById('roomCodeDisplay')) {
            document.getElementById('roomCodeDisplay').textContent = roomCode;
        }

        if (isObserver) {
            const controls = document.querySelector('.controls');
            if (controls) {
                controls.innerHTML = `<button class="capture-btn" onclick="openStatusWindow()" title="開啟置頂小視窗">開啟即時燈號窗</button>`;
            }
            document.querySelectorAll('.ai-controls').forEach(el => el.style.display = 'none');
            document.querySelectorAll('.instruction-section').forEach(el => el.style.display = 'none');
        }

        // 啟動 P2P 與渲染
        if (typeof initP2P === 'function') initP2P();
        if (typeof renderPlatforms === 'function') renderPlatforms();
    }
});

// 加入房間
function joinRoom() {
    const input = document.getElementById('roomInput');
    let code = input.value.trim();

    if (!code) {
        showError("請輸入房間代碼");
        return;
    }

    // 清洗房號 (移除空格與 URL 特殊字元)
    code = filterRoomCode(code);

    if (!code) {
        showError("房間代碼無效 (僅限英文字母與數字)");
        return;
    }

    // 跳轉
    const obsChecked = document.getElementById('chkObserver').checked;
    window.location.search = `?code=${encodeURIComponent(code)}` + (obsChecked ? "&obs=1" : "");
}

// 建立房間 (產生隨機 ID)
function createRoom() {
    const randomCode = Math.random().toString(36).substring(2, 8).toUpperCase();
    window.location.search = `?code=${randomCode}`;
}

// 過濾房間代碼：只保留大小寫英文字母與數字
function filterRoomCode(code) {
    return code.replace(/[^A-Za-z0-9]/g, "");
}

function showError(msg) {
    const errEl = document.getElementById('setup-error');
    errEl.textContent = msg;
    errEl.style.opacity = 1;
    setTimeout(() => { errEl.style.opacity = 0; }, 3000);
}

// 重設所有平台
function requestReset() {
    if (confirm("確定要重設所有位置嗎？")) {
        if (typeof handleData === 'function') handleData({ type: 'RESET' }); // 自己先重設

        const payload = { type: 'RESET' };
        if (isHost) {
            if (typeof broadcast === 'function') broadcast(payload);
        } else if (typeof hostConn !== 'undefined' && hostConn && hostConn.open) {
            hostConn.send(payload);
        }
    }
}
