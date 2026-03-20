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
    const conn = peer.connect(hostPeerId);
    
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
        // 第一位進房的是 Host，後續最多接受 3 個連線 (共 4 位使用者)
        if (connections.length >= 3) {
            console.log("連線被拒絕: 房間已滿 (4人)");
            conn.on('open', () => {
                conn.send({ type: 'FULL' });
                setTimeout(() => conn.close(), 500); 
            });
            return;
        }

        console.log("新參加者加入:", conn.peer);
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
    
    switch(payload.type) {
        case 'INIT':
            roomData = payload.data;
            renderPlatforms();
            break;
        case 'UPDATE':
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
