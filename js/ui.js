function renderPlatforms() {
    const container = document.getElementById("platforms");
    if (!container) return;
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
            const xMask = typeof xMarkData !== 'undefined' ? (xMarkData[index] || 0) : 0;

            const cell = document.createElement("div");
            cell.className = `platform-cell`;
            cell.dataset.index = index;
            cell.onclick = (e) => onPlatformClick(index);

            if (val < 4) {
                cell.classList.add(`active-${val}`);
                cell.innerText = colNum;
            } else if (xMask > 0) {
                const players = [];
                for (let i = 0; i < 4; i++) {
                    if (xMask & (1 << i)) players.push(i);
                }
                if (players.length === 1) {
                    cell.classList.add(`active-${players[0]}`);
                } else {
                    let gradientStr = [];
                    let step = 100 / players.length;
                    for(let i = 0; i < players.length; i++) {
                        gradientStr.push(`var(--color-${players[i]}) ${i*step}% ${(i+1)*step}%`);
                    }
                    cell.style.background = `linear-gradient(135deg, ${gradientStr.join(', ')})`;
                    cell.style.boxShadow = `0 0 12px var(--color-${players[0]})`;
                    cell.style.color = "white";
                    cell.style.border = "none";
                }
                cell.innerText = "X";
            } else {
                cell.innerText = colNum;
            }

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
    if (pathEl) pathEl.innerText = displayPath.join("");
}

function setSelectedColor(idx) {
    selectedColor = idx;
    document.querySelectorAll('.color-btn').forEach(btn => btn.classList.remove('active'));

    const targetBtn = document.getElementById('btn' + idx);
    if (targetBtn) targetBtn.classList.add('active');

    renderPath();
}

function toggleXMode(idx) {
    if (typeof isXMarkMode !== 'undefined') {
        isXMarkMode[idx] = !isXMarkMode[idx];
        const chk = document.getElementById('chkXMode' + idx);
        if (chk) chk.checked = isXMarkMode[idx];
    }
}

// 供 detector 自動化的點選邏輯 (不重新賦值 selectedColor 但傳入指定顏色)
// 這邊將原有的 onPlatformClick 拆分，以便程式調用不會被 selectedColor 卡住
function simulatePlatformClick(index, forceColor) {
    let colorToUse = forceColor !== undefined ? forceColor : selectedColor;

    if (colorToUse === -1) {
        alert("請先選擇一個玩家位置");
        return;
    }

    const isX = typeof isXMarkMode !== 'undefined' ? isXMarkMode[colorToUse] : false;

    if (isX) {
        let currentX = typeof xMarkData !== 'undefined' ? (xMarkData[index] || 0) : 0;
        let pBit = (1 << colorToUse);

        if (currentX & pBit) {
            if (typeof xMarkData !== 'undefined') xMarkData[index] = currentX & ~pBit;
        } else {
            if (roomData[index] !== 4) {
                if (forceColor === undefined && !confirm("此平台已經有一般模式的正解標記，確定要用X標記覆蓋嗎？")) return;
                roomData[index] = 4;
            }
            if (typeof xMarkData !== 'undefined') xMarkData[index] = currentX | pBit;
        }
    } else {
        if (roomData[index] === colorToUse) {
            roomData[index] = 4;
        } else {
            // 如果是使用者手動點擊才需要確認，程式自動點擊跳過確認
            if (forceColor === undefined && roomData[index] !== 4 && !confirm("確定要覆蓋其他玩家的位置嗎？")) {
                return;
            }
            roomData[index] = colorToUse;
            if (typeof xMarkData !== 'undefined') xMarkData[index] = 0;
        }
        synchronizeColRules(index, colorToUse);
    }

    renderPlatforms();

    const payload = { 
        type: 'UPDATE', 
        index: index, 
        value: roomData[index],
        xValue: typeof xMarkData !== 'undefined' ? xMarkData[index] : 0
    };
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
    if (dot) dot.className = "status-dot " + state;
    if (txt) txt.innerText = text;
}

function updatePeerCount() {
    const count = document.getElementById('peer-count');
    if (!count) return;
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

window.showShortcutBubble = function(text) {
    const bubble = document.getElementById('shortcut-bubble');
    if (bubble) {
        bubble.innerText = text;
        bubble.style.display = 'block';
    }

    if (statusWindow && !statusWindow.closed) {
        if (isPiPMode) {
            const pipBubble = statusWindow.document.getElementById('pip-shortcut-bubble');
            if (pipBubble) {
                pipBubble.innerText = text;
                pipBubble.style.display = 'block';
            }
        } else {
            statusWindow.postMessage({ type: "BUBBLE_SHOW", text: text }, "*");
        }
    }
};

window.hideShortcutBubble = function() {
    const bubble = document.getElementById('shortcut-bubble');
    if (bubble) {
        bubble.style.display = 'none';
        bubble.innerText = '';
    }

    if (statusWindow && !statusWindow.closed) {
        if (isPiPMode) {
            const pipBubble = statusWindow.document.getElementById('pip-shortcut-bubble');
            if (pipBubble) {
                pipBubble.style.display = 'none';
                pipBubble.innerText = '';
            }
        } else {
            statusWindow.postMessage({ type: "BUBBLE_HIDE" }, "*");
        }
    }
};

document.addEventListener('keydown', (e) => {
    if (typeof isObserver !== 'undefined' && isObserver) return;

    // 若正在輸入文字，忽略快速鍵
    if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;

    if (e.key.toLowerCase() === 'c') {
        shortcutBuffer = [];
        if (shortcutTimer) clearTimeout(shortcutTimer);
        window.hideShortcutBubble();
        return;
    }

    if (e.key.toLowerCase() === 'p') {
        if (typeof isDetecting !== 'undefined' && isDetecting) {
            if (typeof togglePauseDetection === 'function') togglePauseDetection();
        }
        return;
    }

    if (e.key.toLowerCase() === 'x') {
        if (selectedColor !== -1) {
            toggleXMode(selectedColor);
        }
        return;
    }

    if (e.key.toLowerCase() === 'r') {
        if (typeof requestReset === 'function') requestReset();
        return;
    }

    // 只在按下數字鍵時處理 (支援大鍵盤與小鍵盤數字)
    const isDigit = /^[0-9]$/.test(e.key);

    if (isDigit) {
        // 避免一些預設功能 (只有在需要使用數字當快捷的情境)
        // e.preventDefault(); 

        const digit = parseInt(e.key);
        shortcutBuffer.push(digit);

        // 清除舊的計時器
        if (shortcutTimer) clearTimeout(shortcutTimer);

        if (shortcutBuffer.length === 1) {
            // 第一位數：層數 (1-9 為第 1-9 層, 0 為第 10 層)
            const rowStr = digit === 0 ? 10 : digit;
            console.log(`快捷鍵輸入中: 層數 = ${rowStr}, 請輸入平台編號 (1-4)...`);
            window.showShortcutBubble(`準備點選第 ${rowStr} 層，等待輸入 1~4 (按 C 取消)`);

            // 2 秒內沒輸入第二位則失效
            shortcutTimer = setTimeout(() => {
                shortcutBuffer = [];
                window.hideShortcutBubble();
                console.log("快捷鍵輸入超時");
            }, 2000);
        }
        else if (shortcutBuffer.length === 2) {
            window.hideShortcutBubble();
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

// --- 即時燈號視窗 (Popup Window / Document PiP) ---
let statusWindow = null;
let isPiPMode = false;

function updatePiPStatusWindow(data, xData) {
    if (!statusWindow || !isPiPMode) return;
    const container = statusWindow.document.getElementById("grid");
    if (!container) return;
    container.innerHTML = "";
    for (let r = 0; r < 10; r++) {
        const row = statusWindow.document.createElement("div");
        row.className = "row";
        const lbl = statusWindow.document.createElement("div");
        lbl.className = "label";
        lbl.innerText = 10 - r;
        row.appendChild(lbl);
        for (let c = 0; c < 4; c++) {
            const cell = statusWindow.document.createElement("div");
            const val = data[r * 4 + c];
            const xMask = xData ? (xData[r * 4 + c] || 0) : 0;
            
            if (val < 4) {
                cell.className = "cell active-" + val;
            } else if (xMask > 0) {
                const players = [];
                for (let i = 0; i < 4; i++) {
                    if (xMask & (1 << i)) players.push(i);
                }
                if (players.length === 1) {
                    cell.className = "cell active-" + players[0];
                } else {
                    let gradientStr = [];
                    let step = 100 / players.length;
                    for(let i=0; i<players.length; i++) {
                        gradientStr.push(`var(--color-${players[i]}) ${i*step}% ${(i+1)*step}%`);
                    }
                    cell.className = "cell";
                    cell.style.background = `linear-gradient(135deg, ${gradientStr.join(', ')})`;
                    cell.style.boxShadow = `0 0 8px var(--color-${players[0]})`;
                }
                cell.innerHTML = "<div style='color:white; display:flex; align-items:center; justify-content:center; height:100%; font-size:16px; font-weight:bold;'>X</div>";
            } else {
                cell.className = "cell";
            }
            row.appendChild(cell);
        }
        container.appendChild(row);
    }
}

async function openStatusWindow() {
    if (statusWindow && isPiPMode) {
        // 如果已經是 PiP 視窗，直接返回
        return;
    }
    if (statusWindow && !isPiPMode && !statusWindow.closed) {
        statusWindow.focus();
        return;
    }

    if (window.documentPictureInPicture) {
        try {
            statusWindow = await window.documentPictureInPicture.requestWindow({
                width: 320,
                height: 450,
            });
            isPiPMode = true;

            statusWindow.addEventListener("pagehide", () => {
                statusWindow = null;
                isPiPMode = false;
            });

            // 寫入樣式
            const style = statusWindow.document.createElement('style');
            style.textContent = `
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
            `;
            statusWindow.document.head.appendChild(style);

            const title = statusWindow.document.createElement('h3');
            title.innerText = "即時燈號窗 (置頂)";
            statusWindow.document.body.appendChild(title);

            const grid = statusWindow.document.createElement('div');
            grid.id = "grid";
            grid.className = "grid";
            statusWindow.document.body.appendChild(grid);

            const pipBubble = statusWindow.document.createElement('div');
            pipBubble.id = "pip-shortcut-bubble";
            pipBubble.style.cssText = "display: none; background: rgba(56, 189, 248, 0.95); color: #0f172a; padding: 10px; border-radius: 8px; font-weight: bold; font-size: 14px; text-align: center; margin-top: 10px; box-shadow: 0 4px 10px rgba(56, 189, 248, 0.4);";
            statusWindow.document.body.appendChild(pipBubble);

            // 綁定快捷鍵
            let sb = [];
            let st = null;
            statusWindow.addEventListener("keydown", (e) => {
                if (e.key.toLowerCase() === "p") {
                    if (typeof isDetecting !== "undefined" && isDetecting) {
                        if (typeof togglePauseDetection === "function") togglePauseDetection();
                    }
                    return;
                }
                if (e.key.toLowerCase() === "r") {
                    if (typeof requestReset === "function") requestReset();
                    return;
                }
                if (e.key.toLowerCase() === "c") {
                    sb = [];
                    if (st) clearTimeout(st);
                    if (typeof window.hideShortcutBubble === "function") window.hideShortcutBubble();
                    return;
                }
            
                const isDigit = /^[0-9]$/.test(e.key);
                if (isDigit) {
                    const digit = parseInt(e.key);
                    sb.push(digit);
                    if (st) clearTimeout(st);
                    if (sb.length === 1) {
                        const rowStr = digit === 0 ? 10 : digit;
                        if (typeof window.showShortcutBubble === "function") window.showShortcutBubble(`準備點選第 ${rowStr} 層，等待輸入 1~4 (按 C 取消)`);
                        st = setTimeout(() => { 
                            sb = []; 
                            if (typeof window.hideShortcutBubble === "function") window.hideShortcutBubble();
                        }, 2000);
                    } else if (sb.length === 2) {
                        if (typeof window.hideShortcutBubble === "function") window.hideShortcutBubble();
                        const rD = sb[0];
                        const cD = sb[1];
                        const rIdx = (rD === 0) ? 0 : (10 - rD);
                        const cIdx = cD - 1;
                        if (cD >= 1 && cD <= 4 && rIdx >= 0 && rIdx <= 9) {
                            const targetIdx = rIdx * 4 + cIdx;
                            simulatePlatformClick(targetIdx);
                        }
                        sb = [];
                    }
                }
            });

            // 初始同步一次
            updatePiPStatusWindow(roomData, typeof xMarkData !== 'undefined' ? xMarkData : []);
            return;
        } catch (e) {
            console.warn("無法開啟 Document PiP，退回普通視窗", e);
            isPiPMode = false;
        }
    }

    // fallback: 傳統 window.open
    statusWindow = window.open("", "RJPQStatus", "width=320,height=450,menubar=no,toolbar=no,location=no,status=no");
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
            <div id="pip-shortcut-bubble" style="display: none; background: rgba(56, 189, 248, 0.95); color: #0f172a; padding: 10px; border-radius: 8px; font-weight: bold; font-size: 14px; text-align: center; margin-top: 10px; transition: opacity 0.2s; box-shadow: 0 4px 10px rgba(56, 189, 248, 0.4);"></div>
            <script>
                function update(data, xData) {
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
                            const xMask = xData ? (xData[r * 4 + c] || 0) : 0;
                            
                            if (val < 4) {
                                cell.className = "cell active-" + val;
                            } else if (xMask > 0) {
                                const players = [];
                                for (let i = 0; i < 4; i++) {
                                    if (xMask & (1 << i)) players.push(i);
                                }
                                if (players.length === 1) {
                                    cell.className = "cell active-" + players[0];
                                } else {
                                    let gradientStr = [];
                                    let step = 100 / players.length;
                                    for(let i=0; i<players.length; i++) {
                                        gradientStr.push(\`var(--color-\${players[i]}) \${i*step}% \${(i+1)*step}%\`);
                                    }
                                    cell.className = "cell";
                                    cell.style.background = \`linear-gradient(135deg, \${gradientStr.join(', ')})\`;
                                    cell.style.boxShadow = \`0 0 8px var(--color-\${players[0]})\`;
                                }
                                cell.innerHTML = "<div style='color:white; display:flex; align-items:center; justify-content:center; height:100%; font-size:16px; font-weight:bold;'>X</div>";
                            } else {
                                cell.className = "cell";
                            }
                            row.appendChild(cell);
                        }
                        container.appendChild(row);
                    }
                }
                let windowRoomData = [];
                let windowXMarkData = [];
                window.addEventListener("message", (e) => {
                    if (e.data.type === "UPDATE") {
                        windowRoomData = e.data.roomData;
                        windowXMarkData = e.data.xMarkData;
                        update(windowRoomData, windowXMarkData);
                    } else if (e.data.type === "BUBBLE_SHOW") {
                        const bubble = document.getElementById("pip-shortcut-bubble");
                        if (bubble) {
                            bubble.innerText = e.data.text;
                            bubble.style.display = "block";
                        }
                    } else if (e.data.type === "BUBBLE_HIDE") {
                        const bubble = document.getElementById("pip-shortcut-bubble");
                        if (bubble) {
                            bubble.style.display = "none";
                            bubble.innerText = "";
                        }
                    }
                });

                let sb = [];
                let st = null;
                window.addEventListener("keydown", (e) => {
                    if (e.key.toLowerCase() === "p" && window.opener && !window.opener.closed) {
                        if (typeof window.opener.isDetecting !== "undefined" && window.opener.isDetecting) {
                            if (typeof window.opener.togglePauseDetection === "function") window.opener.togglePauseDetection();
                        }
                        return;
                    }
                    if (e.key.toLowerCase() === "r" && window.opener && !window.opener.closed) {
                        if (typeof window.opener.requestReset === "function") window.opener.requestReset();
                        return;
                    }
                    if (e.key.toLowerCase() === "c" && window.opener && !window.opener.closed) {
                        sb = [];
                        if (st) clearTimeout(st);
                        if (typeof window.opener.hideShortcutBubble === "function") window.opener.hideShortcutBubble();
                        return;
                    }
                
                    const isDigit = /^[0-9]$/.test(e.key);
                    if (isDigit) {
                        const digit = parseInt(e.key);
                        sb.push(digit);
                        if (st) clearTimeout(st);
                        if (sb.length === 1) {
                            const rowStr = digit === 0 ? 10 : digit;
                            if (window.opener && !window.opener.closed && typeof window.opener.showShortcutBubble === "function") {
                                window.opener.showShortcutBubble(\`準備點選第 \${rowStr} 層，等待輸入 1~4 (按 C 取消)\`);
                            }
                            st = setTimeout(() => { 
                                sb = []; 
                                if (window.opener && !window.opener.closed && typeof window.opener.hideShortcutBubble === "function") {
                                    window.opener.hideShortcutBubble();
                                }
                            }, 2000);
                        } else if (sb.length === 2) {
                            if (window.opener && !window.opener.closed && typeof window.opener.hideShortcutBubble === "function") {
                                window.opener.hideShortcutBubble();
                            }
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

    setTimeout(() => {
        statusWindow.postMessage({ type: "UPDATE", roomData: roomData, xMarkData: typeof xMarkData !== 'undefined' ? xMarkData : [] }, "*");
    }, 200);
}

// 修改 renderPlatforms 最後一行以同步彈出視窗
const originalRenderPlatforms = renderPlatforms;
renderPlatforms = function () {
    originalRenderPlatforms();
    if (statusWindow) {
        if (isPiPMode) {
            updatePiPStatusWindow(roomData, typeof xMarkData !== 'undefined' ? xMarkData : []);
        } else if (!statusWindow.closed) {
            statusWindow.postMessage({ type: "UPDATE", roomData: roomData, xMarkData: typeof xMarkData !== 'undefined' ? xMarkData : [] }, "*");
        }
    }
};

