let peer = null;
let connections = []; // 作為 Host 時維護所有連線
let hostConn = null;  // 作為 Client 時維護與 Host 的連線

const PEER_PREFIX = "rjpq-room-v1-";
// 注意：roomCode 來自 main.js

function initP2P() {
    updateStatus("connecting", "嘗試建立通訊管道...");
    
    peer = new Peer();

    peer.on('open', (id) => {
        console.log('我的 Peer ID:', id);
        tryToBeHost();
    });

    peer.on('error', (err) => {
        console.error('Peer 錯誤:', err.type);
        if (err.type === 'peer-unavailable') {
            updateStatus("offline", "找不到該房號的主持人...");
        }
    });
}

function tryToBeHost() {
    const hostPeerId = PEER_PREFIX + roomCode;
    const conn = peer.connect(hostPeerId, { metadata: { isObserver: typeof isObserver !== 'undefined' ? isObserver : false } });
    
    let connectionTimeout = setTimeout(() => {
        if (!isHost && !hostConn) {
            console.log("未偵測到 Host，嘗試接管房間...");
            conn.close();
            setupAsHost(hostPeerId);
        }
    }, 2000);

    conn.on('open', () => {
        clearTimeout(connectionTimeout);
        console.log("連線到現有 Host 成功！");
        hostConn = conn;
        setupAsClient(conn);
    });
}

function setupAsHost(hostPeerId) {
    if (peer) peer.destroy();
    
    peer = new Peer(hostPeerId);
    
    peer.on('open', (id) => {
        isHost = true;
        updateStatus("online", "已成為房主 (等待參與者)");
        renderPlatforms();
    });

    peer.on('connection', (conn) => {
        const isConnObserver = conn.metadata && conn.metadata.isObserver;
        const playerCount = connections.filter(c => !(c.metadata && c.metadata.isObserver)).length;
        
        // Host 算 1 位，最多只能再接受 3 位非觀看玩家，觀察者不佔位
        if (!isConnObserver && playerCount >= 3) {
            console.log("連線被拒絕: 玩家名額已滿 (4人)");
            conn.on('open', () => {
                conn.send({ type: 'FULL' });
                setTimeout(() => conn.close(), 500); 
            });
            return;
        }

        console.log(`新參加者加入: ${conn.peer} (觀察者: ${!!isConnObserver})`);
        connections.push(conn);
        updatePeerCount();
        
        conn.on('open', () => {
            conn.send({ type: 'INIT', data: roomData });
        });

        conn.on('data', (data) => handleData(data, conn));
        
        conn.on('close', () => {
            connections = connections.filter(c => c !== conn);
            updatePeerCount();
        });
    });

    peer.on('error', (err) => {
        if (err.type === 'unavailable-id') {
            location.reload(); 
        }
    });
}

function setupAsClient(conn) {
    isHost = false;
    updateStatus("online", "已成功連接到房間");
    
    conn.on('data', (data) => handleData(data));
    
    conn.on('close', () => {
        // 只有不是因為滿員斷開的才 reload
        if (!window.isRoomFullExited) {
            updateStatus("offline", "與連線中心斷開，請重新整理");
            location.reload();
        }
    });
}

function handleData(payload, fromConn = null) {
    console.log("收到資料:", payload.type);
    
    // 防禦性驗證：確保 payload 是物件
    if (!payload || typeof payload !== 'object') return;
    
    switch(payload.type) {
        case 'INIT':
            // 驗證：必須是長度為 40 的陣列，值在 0~4 之間
            if (!Array.isArray(payload.data) || payload.data.length !== 40) return;
            if (!payload.data.every(v => Number.isInteger(v) && v >= 0 && v <= 4)) return;
            roomData = payload.data;
            renderPlatforms();
            break;
        case 'UPDATE':
            // 驗證：index 必須在 0~39，value 必須在 0~4
            if (!Number.isInteger(payload.index) || payload.index < 0 || payload.index > 39) return;
            if (!Number.isInteger(payload.value) || payload.value < 0 || payload.value > 4) return;
            roomData[payload.index] = payload.value;
            synchronizeColRules(payload.index, payload.value);
            renderPlatforms();
            
            if (isHost) {
                broadcast({ type: 'UPDATE', index: payload.index, value: payload.value }, fromConn);
            }
            break;
        case 'RESET':
            roomData = Array(40).fill(4);
            renderPlatforms();
            if (isHost) broadcast({ type: 'RESET' }, fromConn);
            break;
        case 'FULL_SYNC':
            if (!Array.isArray(payload.data) || payload.data.length !== 40) return;
            roomData = [...payload.data];
            if (typeof renderPlatforms === 'function') renderPlatforms();
            if (isHost && typeof broadcast === 'function') {
                broadcast({ type: 'FULL_SYNC', data: payload.data }, fromConn);
            }
            break;
        case 'FULL':
            window.isRoomFullExited = true;
            updateStatus("offline", "❌ 該房間已達 4 人上限，無法進入");
            alert("該房間已滿 (上限 4 人)，請嘗試更換房號或聯繫管理員。");
            if (hostConn) hostConn.close();
            break;
    }
}

function broadcast(msg, excludeConn = null) {
    connections.forEach(conn => {
        if (conn !== excludeConn && conn.open) {
            conn.send(msg);
        }
    });
}
