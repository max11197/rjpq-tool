// --- 全域變數 ---
const urlParams = new URLSearchParams(window.location.search);
let roomCode = urlParams.get("code");

if (!roomCode) {
    alert("無效的房間代碼，請從首頁進入或提供 ?code=xxxx 參數。");
    document.body.innerHTML = "<div style='text-align:center; padding: 50px;'><h1>請輸入房號</h1><p>例如: ?code=1234</p></div>";
}

let roomData = Array(40).fill(4); // 40 個平台 (10x4)，預設顏色為 4 (灰色)
let selectedColor = -1;
let isHost = false;

// --- 初始化 ---
document.addEventListener("DOMContentLoaded", () => {
    if(document.getElementById('roomCodeDisplay')) {
        document.getElementById('roomCodeDisplay').textContent = roomCode;
    }
    
    // 啟動 P2P 與渲染
    if(typeof initP2P === 'function') initP2P();
    if(typeof renderPlatforms === 'function') renderPlatforms();
});

// 重設所有平台
function requestReset() {
    if (confirm("確定要重設所有位置嗎？")) {
        handleData({ type: 'RESET' }); // 自己先重設
        
        const payload = { type: 'RESET' };
        if (isHost) {
            broadcast(payload);
        } else if (typeof hostConn !== 'undefined' && hostConn && hostConn.open) {
            hostConn.send(payload);
        }
    }
}
