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
    // 若彈出視窗存在，同步更新
    if (typeof window._syncPopup === 'function') window._syncPopup();
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
    if (typeof isObserver !== 'undefined' && isObserver) {
        return; // 觀察模式無效
    }
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
        const pCount = connections.filter(c => !(c.metadata && c.metadata.isObserver)).length + 1;
        const obsCount = connections.filter(c => c.metadata && c.metadata.isObserver).length;
        count.innerText = `● ${pCount} 位玩家在線` + (obsCount > 0 ? ` (+${obsCount}觀看)` : "");
    } else if (!isHost && typeof hostConn !== 'undefined' && hostConn) {
        count.innerText = (typeof isObserver !== 'undefined' && isObserver) ? `● 觀察中` : `● 連線中`;
    } else {
        count.innerText = "";
    }
}

// --- 鍵盤快速鍵點亮平台 (Ctrl + 層數 + 平台) ---
let shortcutBuffer = [];
let shortcutTimer = null;

document.addEventListener('keydown', (e) => {
    if (typeof isObserver !== 'undefined' && isObserver) return;
    
    // 只在按下 Ctrl 且為數字鍵時處理 (支援大鍵盤與小鍵盤數字)
    const isDigit = /^[0-9]$/.test(e.key);
    
    if (e.ctrlKey && isDigit) {
        e.preventDefault(); // 避免瀏覽器切換標籤頁 (Ctrl+1~Ctrl+9)
        
        const digit = parseInt(e.key);
        shortcutBuffer.push(digit);
        
        // 清除舊的計時器
        if (shortcutTimer) clearTimeout(shortcutTimer);
        
        if (shortcutBuffer.length === 1) {
            // 第一位數：層數 (1-9 為第 1-9 層, 0 為第 10 層)
            console.log(`快捷鍵輸入中: 層數 = ${digit === 0 ? 10 : digit}, 請輸入平台編號 (1-4)...`);
            
            // 2 秒內沒輸入第二位則失效
            shortcutTimer = setTimeout(() => {
                shortcutBuffer = [];
                console.log("快捷鍵輸入超時");
            }, 2000);
        } 
        else if (shortcutBuffer.length === 2) {
            // 第二位數：平台 (1-4)
            const rowDigit = shortcutBuffer[0];
            const colDigit = shortcutBuffer[1];
            
            // 計算實際索引
            // rowDigit: 1->row=9 (第1層), 0->row=0 (第10層), 2->row=8 (第2層)...
            const rowIndex = (rowDigit === 0) ? 0 : (10 - rowDigit);
            const colIndex = colDigit - 1;
            
            if (colDigit >= 1 && colDigit <= 4 && rowIndex >= 0 && rowIndex <= 9) {
                const targetIndex = rowIndex * 4 + colIndex;
                console.log(`快速鍵觸發: 第 ${rowDigit === 0 ? 10 : rowDigit} 層, 第 ${colDigit} 平台 (索引: ${targetIndex})`);
                
                // 執行點選行為 (使用目前選定的顏色)
                simulatePlatformClick(targetIndex);
            } else {
                console.log("快捷鍵無效: 平台編號需在 1-4 之間");
            }
            
            // 重設
            shortcutBuffer = [];
        }
    }
});

// --- 即時燈號視窗 (Popup Window) ---
let statusWindow = null;

function openStatusWindow() {
    if (statusWindow && !statusWindow.closed) {
        statusWindow.focus();
        return;
    }

    statusWindow = window.open("", "RJPQStatus", "width=300,height=450,menubar=no,toolbar=no,location=no,status=no");
    if (!statusWindow) {
        alert("請允許彈出視窗以啟動即時燈號窗。");
        return;
    }

    const html = `
        <!DOCTYPE html>
        <html>
        <head>
            <meta charset="UTF-8">
            <title>RJPQ 即時燈號</title>
            <style>
                body { background: #0f172a; color: white; font-family: sans-serif; padding: 10px; margin: 0; overflow: hidden; }
                .grid { display: flex; flex-direction: column; gap: 4px; }
                .row { display: flex; gap: 4px; align-items: center; }
                .label { width: 20px; font-size: 10px; color: #64748b; text-align: right; }
                .cell { flex: 1; height: 30px; border-radius: 4px; background: #334155; }
                .cell.active-0 { background: #f87171; box-shadow: 0 0 8px #f87171; }
                .cell.active-1 { background: #4ade80; box-shadow: 0 0 8px #4ade80; }
                .cell.active-2 { background: #60a5fa; box-shadow: 0 0 8px #60a5fa; }
                .cell.active-3 { background: #c084fc; box-shadow: 0 0 8px #c084fc; }
                h3 { font-size: 14px; margin: 0 0 10px 0; color: #38bdf8; text-align: center; }
            </style>
        </head>
        <body>
            <h3>即時燈號窗</h3>
            <div id="grid" class="grid"></div>
            <script>
                function update(data) {
                    const container = document.getElementById("grid");
                    container.innerHTML = "";
                    for (let r = 0; r < 10; r++) {
                        const row = document.createElement("div");
                        row.className = "row";
                        const lbl = document.createElement("div");
                        lbl.className = "label";
                        lbl.innerText = 10 - r;
                        row.appendChild(lbl);
                        for (let c = 0; c < 4; c++) {
                            const cell = document.createElement("div");
                            const val = data[r * 4 + c];
                            cell.className = "cell" + (val < 4 ? " active-" + val : "");
                            row.appendChild(cell);
                        }
                        container.appendChild(row);
                    }
                }
                // 接收來自父視窗的訊息
                let windowRoomData = [];
                window.addEventListener("message", (e) => {
                    if (e.data.type === "UPDATE") {
                        windowRoomData = e.data.roomData;
                        update(windowRoomData);
                    }
                });

                // 快捷鍵邏輯 (與母視窗同步)
                let sb = [];
                let st = null;
                window.addEventListener("keydown", (e) => {
                    if (e.ctrlKey && e.key >= "0" && e.key <= "9") {
                        e.preventDefault();
                        const digit = parseInt(e.key);
                        sb.push(digit);
                        if (st) clearTimeout(st);
                        if (sb.length === 1) {
                            st = setTimeout(() => { sb = []; }, 2000);
                        } else if (sb.length === 2) {
                            const rD = sb[0];
                            const cD = sb[1];
                            const rIdx = (rD === 0) ? 0 : (10 - rD);
                            const cIdx = cD - 1;
                            if (cD >= 1 && cD <= 4 && rIdx >= 0 && rIdx <= 9) {
                                const targetIdx = rIdx * 4 + cIdx;
                                if (window.opener && !window.opener.closed) {
                                    window.opener.simulatePlatformClick(targetIdx);
                                }
                            }
                            sb = [];
                        }
                    }
                });
            </script>
        </body>
        </html>
    `;
    statusWindow.document.write(html);
    statusWindow.document.close();

    // 初始同步一次
    setTimeout(() => {
        statusWindow.postMessage({ type: "UPDATE", roomData: roomData }, "*");
    }, 200);
}

// 修改 renderPlatforms 最後一行以同步彈出視窗
const originalRenderPlatforms = renderPlatforms;
renderPlatforms = function() {
    originalRenderPlatforms();
    if (statusWindow && !statusWindow.closed) {
        statusWindow.postMessage({ type: "UPDATE", roomData: roomData }, "*");
    }
};
