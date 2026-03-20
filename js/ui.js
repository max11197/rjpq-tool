function renderPlatforms() {
    const container = document.getElementById("platforms");
    if(!container) return;
    container.innerHTML = "";
    
    for (let row = 0; row < 10; row++) {
        const rowNum = 10 - row;
        const rowDiv = document.createElement("div");
        rowDiv.className = "row-group";
        
        const label = document.createElement("div");
        label.className = "row-label";
        label.innerText = rowNum;
        rowDiv.appendChild(label);
        
        const wrapper = document.createElement("div");
        wrapper.className = "platforms-wrapper";
        
        for (let col = 0; col < 4; col++) {
            const colNum = col + 1;
            const index = row * 4 + col;
            const val = roomData[index];
            
            const cell = document.createElement("div");
            cell.className = `platform-cell ${val < 4 ? 'active-' + val : ''}`;
            cell.innerText = colNum;
            cell.dataset.index = index;
            cell.onclick = (e) => onPlatformClick(index);
            
            wrapper.appendChild(cell);
        }
        
        rowDiv.appendChild(wrapper);
        container.appendChild(rowDiv);
    }
    renderPath();
}

function renderPath() {
    let path = new Array(10).fill("?");
    for (let i = 0; i < 40; i++) {
        if (selectedColor !== -1 && roomData[i] === selectedColor) {
            path[Math.floor(i / 4)] = (i % 4 + 1);
        }
    }
    let displayPath = [...path].reverse();
    displayPath.splice(5, 0, " ");
    
    const pathEl = document.getElementById("path");
    if(pathEl) pathEl.innerText = displayPath.join("");
}

function setSelectedColor(idx) {
    selectedColor = idx;
    document.querySelectorAll('.color-btn').forEach(btn => btn.classList.remove('active'));
    
    const targetBtn = document.getElementById('btn' + idx);
    if(targetBtn) targetBtn.classList.add('active');
    
    renderPath(); 
}

// 供 detector 自動化的點選邏輯 (不重新賦值 selectedColor 但傳入指定顏色)
// 這邊將原有的 onPlatformClick 拆分，以便程式調用不會被 selectedColor 卡住
function simulatePlatformClick(index, forceColor) {
    let colorToUse = forceColor !== undefined ? forceColor : selectedColor;
    
    if (colorToUse === -1) {
        alert("請先選擇一個玩家位置");
        return;
    }

    let newValue = 4;
    if (roomData[index] === colorToUse) {
        newValue = 4;
    } else {
        // 如果是使用者手動點擊才需要確認，程式自動點擊跳過確認
        if (forceColor === undefined && roomData[index] !== 4 && !confirm("確定要覆蓋其他玩家的位置嗎？")) {
            return;
        }
        newValue = colorToUse;
    }

    roomData[index] = newValue;
    synchronizeColRules(index, newValue);
    renderPlatforms();

    const payload = { type: 'UPDATE', index: index, value: newValue };
    if (isHost) {
        broadcast(payload);
    } else if (typeof hostConn !== 'undefined' && hostConn && hostConn.open) {
        hostConn.send(payload);
    }
}

function onPlatformClick(index) {
    simulatePlatformClick(index); // 使用者點擊，依據 selectedColor
}

function synchronizeColRules(index, color) {
    if (color === 4) return;
    const rowStart = Math.floor(index / 4) * 4;
    for (let i = rowStart; i < rowStart + 4; i++) {
        if (i !== index && roomData[i] === color) {
            roomData[i] = 4;
        }
    }
}

function updateStatus(state, text) {
    const dot = document.getElementById('status-dot');
    const txt = document.getElementById('status-text');
    if(dot) dot.className = "status-dot " + state;
    if(txt) txt.innerText = text;
}

function updatePeerCount() {
    const count = document.getElementById('peer-count');
    if(!count) return;
    if (isHost && connections.length > 0) {
        count.innerText = `● ${connections.length + 1} 位用戶在線`;
    } else if (!isHost && typeof hostConn !== 'undefined' && hostConn) {
        count.innerText = `● 連線中`;
    } else {
        count.innerText = "";
    }
}
