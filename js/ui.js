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

            // 加入滑鼠事件用於長按偵測
            cell.onmousedown = (e) => handlePlatformMouseDown(e, index);
            cell.onmouseup = (e) => handlePlatformMouseUp(e, index);
            cell.onmouseleave = (e) => handlePlatformMouseLeave(e, index);
            cell.onclick = (e) => {
                if (longPressActive) return; // 如果是長按誘發的，不觸發普通點擊
                onPlatformClick(index);
            };

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
                    for (let i = 0; i < players.length; i++) {
                        gradientStr.push(`var(--color-${players[i]}) ${i * step}% ${(i + 1) * step}%`);
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
    if (typeof syncPopupControls === 'function') syncPopupControls();
}

function toggleXMode(idx) {
    if (typeof isXMarkMode !== 'undefined') {
        isXMarkMode[idx] = !isXMarkMode[idx];
        const chk = document.getElementById('chkXMode' + idx);
        if (chk) chk.checked = isXMarkMode[idx];
        if (typeof syncPopupControls === 'function') syncPopupControls();
    }
}

function syncPopupControls() {
    if (!statusWindow) return;
    if (isPiPMode) {
        const colors = [];
        for (let j = 0; j < 4; j++) {
            colors.push(getComputedStyle(document.documentElement).getPropertyValue(`--color-${j}`).trim());
        }
        for (let i = 0; i < 4; i++) {
            const btn = statusWindow.document.getElementById('pip-btn' + i);
            if (btn) {
                if (i === selectedColor) btn.style.background = colors[i];
                else btn.style.background = "transparent";
            }
            const chk = statusWindow.document.getElementById('pip-chk' + i);
            if (chk) chk.checked = !!isXMarkMode[i];
        }
    } else if (!statusWindow.closed) {
        statusWindow.postMessage({ type: "SYNC_CONTROLS", selectedColor: selectedColor, isXMarkMode: isXMarkMode }, "*");
    }
}

// 供 detector 自動化的點選邏輯 (不重新賦值 selectedColor 但傳入指定顏色)
// 這邊將原有的 onPlatformClick 拆分，以便程式調用不會被 selectedColor 卡住
function showCustomConfirm(msg, win = window) {
    return new Promise(resolve => {
        const doc = win.document;
        const overlay = doc.createElement('div');
        overlay.style.cssText = "position: fixed; top: 0; left: 0; right: 0; bottom: 0; background: rgba(0,0,0,0.6); display: flex; align-items: center; justify-content: center; z-index: 10000; font-family: sans-serif;";
        const box = doc.createElement('div');
        box.style.cssText = "background: #1e293b; border: 1px solid #38bdf8; padding: 20px; border-radius: 8px; text-align: center; color: white; max-width: 80%; box-shadow: 0 4px 15px rgba(0,0,0,0.8);";
        const text = doc.createElement('div');
        text.innerText = msg;
        text.style.marginBottom = "20px";
        text.style.fontSize = "14px";
        text.style.lineHeight = "1.5";
        const btnRow = doc.createElement('div');
        btnRow.style.cssText = "display: flex; gap: 15px; justify-content: center;";
        const btnYes = doc.createElement('button');
        btnYes.innerText = "確定";
        btnYes.style.cssText = "padding: 8px 16px; border-radius: 4px; border: none; background: #38bdf8; color: #0f172a; cursor: pointer; font-weight: bold; font-size: 14px;";
        const btnNo = doc.createElement('button');
        btnNo.innerText = "取消";
        btnNo.style.cssText = "padding: 8px 16px; border-radius: 4px; border: 1px solid #94a3b8; background: transparent; color: #cbd5e1; cursor: pointer; font-size: 14px;";

        const cleanup = () => {
            win.removeEventListener('keydown', handleKeyDown, true);
            overlay.remove();
        };

        const handleKeyDown = (e) => {
            if (e.key === 'Enter') {
                e.preventDefault();
                cleanup();
                resolve(true);
            } else if (e.key === 'Escape') {
                e.preventDefault();
                cleanup();
                resolve(false);
            }
        };

        btnYes.onclick = () => { cleanup(); resolve(true); };
        btnNo.onclick = () => { cleanup(); resolve(false); };

        btnRow.appendChild(btnYes);
        btnRow.appendChild(btnNo);
        box.appendChild(text);
        box.appendChild(btnRow);
        overlay.appendChild(box);
        doc.body.appendChild(overlay);

        win.addEventListener('keydown', handleKeyDown, true);
        btnYes.focus();
    });
}

async function simulatePlatformClick(index, forceColor, clickWindow = window) {
    let colorToUse = forceColor !== undefined ? forceColor : selectedColor;

    if (colorToUse === -1) {
        if (clickWindow.alert) clickWindow.alert("請先選擇一個玩家位置");
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
                if (forceColor === undefined) {
                    const ans = await showCustomConfirm("此平台已經有一般模式的正解標記，確定要用X標記覆蓋嗎？", clickWindow);
                    if (!ans) return;
                }
                roomData[index] = 4;
            }
            if (typeof xMarkData !== 'undefined') xMarkData[index] = currentX | pBit;
        }
    } else {
        if (roomData[index] === colorToUse) {
            roomData[index] = 4;
        } else {
            // 如果是使用者手動點擊才需要確認，程式自動點擊跳過確認
            if (forceColor === undefined && roomData[index] !== 4) {
                const ans = await showCustomConfirm("確定要覆蓋其他玩家的位置嗎？", clickWindow);
                if (!ans) return;
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

window.showShortcutBubble = function (text) {
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

window.hideShortcutBubble = function () {
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

    const key = e.key.toLowerCase();

    if (key === 'c') {
        shortcutBuffer = [];
        if (shortcutTimer) clearTimeout(shortcutTimer);
        window.hideShortcutBubble();
        return;
    }


    if (['a', 's', 'd', 'f'].includes(key)) {
        const idx = ['a', 's', 'd', 'f'].indexOf(key);
        setSelectedColor(idx);
        return;
    }

    if (key === 'p') {
        if (typeof isDetecting !== 'undefined' && isDetecting) {
            if (typeof togglePauseDetection === 'function') togglePauseDetection();
        }
        return;
    }

    if (key === 'x') {
        if (selectedColor !== -1) {
            toggleXMode(selectedColor);
        }
        return;
    }

    if (key === 'r') {
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
            const index = r * 4 + c;
            cell.onclick = () => {
                if (typeof simulatePlatformClick === 'function') simulatePlatformClick(index, undefined, statusWindow);
            };
            const val = data[index];
            const xMask = xData ? (xData[index] || 0) : 0;

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
                    for (let i = 0; i < players.length; i++) {
                        gradientStr.push(`var(--color-${players[i]}) ${i * step}% ${(i + 1) * step}%`);
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
    if (typeof isObserver !== 'undefined' && isObserver) {
        return; // 觀察模式無效
    }

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
                width: 300,
                height: 520,
            });
            isPiPMode = true;

            statusWindow.addEventListener("pagehide", () => {
                statusWindow = null;
                isPiPMode = false;
            });

            // 寫入變數與樣式
            const style = statusWindow.document.createElement('style');
            style.textContent = `
                :root {
                    --color-0: #f87171;
                    --color-1: #4ade80;
                    --color-2: #60a5fa;
                    --color-3: #c084fc;
                }
                body { background: #0f172a; color: white; font-family: sans-serif; padding: 10px; margin: 0; overflow: hidden; }
                .grid { display: flex; flex-direction: column; gap: 4px; }
                .row { display: flex; gap: 4px; align-items: center; }
                .label { width: 20px; font-size: 10px; color: #64748b; text-align: right; }
                .cell { flex: 1; height: 30px; border-radius: 4px; background: #334155; cursor: pointer; }
                .cell.active-0 { background: var(--color-0, #f87171); box-shadow: 0 0 8px var(--color-0, #f87171); }
                .cell.active-1 { background: var(--color-1, #4ade80); box-shadow: 0 0 8px var(--color-1, #4ade80); }
                .cell.active-2 { background: var(--color-2, #60a5fa); box-shadow: 0 0 8px var(--color-2, #60a5fa); }
                .cell.active-3 { background: var(--color-3, #c084fc); box-shadow: 0 0 8px var(--color-3, #c084fc); }
                h3 { font-size: 14px; margin: 0 0 10px 0; color: #38bdf8; text-align: center; }
            `;
            statusWindow.document.head.appendChild(style);

            const title = statusWindow.document.createElement('h3');
            title.innerText = "懸浮視窗";
            statusWindow.document.body.appendChild(title);

            const controls = statusWindow.document.createElement('div');
            controls.style.cssText = "display: flex; gap: 4px; justify-content: center; margin-bottom: 10px;";
            for (let i = 0; i < 4; i++) {
                const pDiv = statusWindow.document.createElement('div');
                pDiv.style.cssText = "display: flex; flex-direction: column; align-items: center; gap: 2px;";
                const btn = statusWindow.document.createElement('button');
                btn.id = "pip-btn" + i;
                btn.innerText = `P${i + 1}`;
                const cArr = ["#f87171", "#4ade80", "#60a5fa", "#c084fc"];
                btn.style.cssText = `padding: 2px 6px; border-radius: 4px; border: 1px solid ${cArr[i]}; background: transparent; color: white; cursor: pointer; font-size: 12px; transition: background 0.2s;`;
                btn.onclick = () => {
                    setSelectedColor(i);
                };
                const lbl = statusWindow.document.createElement('label');
                lbl.style.cssText = "font-size: 10px; color: #94a3b8; cursor: pointer; display: flex; align-items: center;";
                const chk = statusWindow.document.createElement('input');
                chk.type = "checkbox";
                chk.id = "pip-chk" + i;
                chk.checked = typeof isXMarkMode !== 'undefined' ? !!isXMarkMode[i] : false;
                chk.onchange = () => toggleXMode(i);
                lbl.appendChild(chk);
                lbl.appendChild(statusWindow.document.createTextNode("X標記"));
                pDiv.appendChild(btn);
                pDiv.appendChild(lbl);
                controls.appendChild(pDiv);
            }
            statusWindow.document.body.appendChild(controls);

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
                if (e.key.toLowerCase() === "x") {
                    if (typeof selectedColor !== "undefined" && selectedColor !== -1) {
                        if (typeof toggleXMode === "function") toggleXMode(selectedColor);
                    }
                    return;
                }

                const key = e.key.toLowerCase();
                if (['a', 's', 'd', 'f'].includes(key)) {
                    const idx = ['a', 's', 'd', 'f'].indexOf(key);
                    if (typeof setSelectedColor === "function") setSelectedColor(idx);
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
                            simulatePlatformClick(targetIdx, undefined, statusWindow);
                        }
                        sb = [];
                    }
                }
            });

            statusWindow.addEventListener("load", () => {
                syncPopupColors();
            });

            // 初始同步一次
            updatePiPStatusWindow(roomData, typeof xMarkData !== 'undefined' ? xMarkData : []);
            if (typeof syncPopupControls === 'function') syncPopupControls();
            return;
        } catch (e) {
            console.warn("無法開啟 Document PiP，退回普通視窗", e);
            isPiPMode = false;
        }
    }

    // fallback: 傳統 window.open
    statusWindow = window.open("", "RJPQStatus", "width=300,height=520,menubar=no,toolbar=no,location=no,status=no");
    if (!statusWindow) {
        alert("請允許彈出視窗以啟動即時燈號窗。");
        return;
    }

    const currentColors = [];
    for (let i = 0; i < 4; i++) {
        const c = getComputedStyle(document.documentElement).getPropertyValue(`--color-${i}`).trim();
        currentColors.push(c || colorTemplates['standard'][i]);
    }

    const html = `
        <!DOCTYPE html>
        <html>
        <head>
            <meta charset="UTF-8">
            <title>RJPQ 懸浮視窗</title>
            <style>
                :root {
                    --color-0: ${currentColors[0]};
                    --color-1: ${currentColors[1]};
                    --color-2: ${currentColors[2]};
                    --color-3: ${currentColors[3]};
                }
                body { background: #0f172a; color: white; font-family: sans-serif; padding: 10px; margin: 0; overflow: hidden; }
                .grid { display: flex; flex-direction: column; gap: 4px; }
                .row { display: flex; gap: 4px; align-items: center; }
                .label { width: 20px; font-size: 10px; color: #64748b; text-align: right; }
                .cell { flex: 1; height: 30px; border-radius: 4px; background: #334155; cursor: pointer; }
                .controls-row { display: flex; gap: 4px; justify-content: center; margin-bottom: 10px; }
                .p-col { display: flex; flex-direction: column; align-items: center; gap: 2px; }
                .p-btn { padding: 2px 6px; border-radius: 4px; border: 1px solid #64748b; background: transparent; color: white; cursor: pointer; font-size: 12px; }
                .p-btn.active { background: #64748b; }
                .p-btn.c0 { border-color: #f87171; } .p-btn.active.c0 { background: #f87171; }
                .p-btn.c1 { border-color: #4ade80; } .p-btn.active.c1 { background: #4ade80; }
                .p-btn.c2 { border-color: #60a5fa; } .p-btn.active.c2 { background: #60a5fa; }
                .p-btn.c3 { border-color: var(--color-3); } .p-btn.active.c3 { background: var(--color-3); }
                .cell.active-0 { background: var(--color-0); box-shadow: 0 0 8px var(--color-0); }
                .cell.active-1 { background: var(--color-1); box-shadow: 0 0 8px var(--color-1); }
                .cell.active-2 { background: var(--color-2); box-shadow: 0 0 8px var(--color-2); }
                .cell.active-3 { background: var(--color-3); box-shadow: 0 0 8px var(--color-3); }
                h3 { font-size: 14px; margin: 0 0 10px 0; color: #38bdf8; text-align: center; }
            </style>
        </head>
        <body>
            <h3>懸浮視窗</h3>
            <div class="controls-row" id="pip-controls">
                <div class="p-col"><button class="p-btn c0" id="pip-btn0" onclick="window.opener && window.opener.setSelectedColor(0)">P1</button><label style="font-size:10px;color:#94a3b8;"><input type="checkbox" id="pip-chk0" onchange="window.opener && window.opener.toggleXMode(0)"> X標記</label></div>
                <div class="p-col"><button class="p-btn c1" id="pip-btn1" onclick="window.opener && window.opener.setSelectedColor(1)">P2</button><label style="font-size:10px;color:#94a3b8;"><input type="checkbox" id="pip-chk1" onchange="window.opener && window.opener.toggleXMode(1)"> X標記</label></div>
                <div class="p-col"><button class="p-btn c2" id="pip-btn2" onclick="window.opener && window.opener.setSelectedColor(2)">P3</button><label style="font-size:10px;color:#94a3b8;"><input type="checkbox" id="pip-chk2" onchange="window.opener && window.opener.toggleXMode(2)"> X標記</label></div>
                <div class="p-col"><button class="p-btn c3" id="pip-btn3" onclick="window.opener && window.opener.setSelectedColor(3)">P4</button><label style="font-size:10px;color:#94a3b8;"><input type="checkbox" id="pip-chk3" onchange="window.opener && window.opener.toggleXMode(3)"> X標記</label></div>
            </div>
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
                            const index = r * 4 + c;
                            cell.onclick = () => window.opener && window.opener.simulatePlatformClick(index, undefined, window);
                            const val = data[index];
                            const xMask = xData ? (xData[index] || 0) : 0;
                            
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
                    } else if (e.data.type === "SYNC_CONTROLS") {
                        for(let i=0; i<4; i++) {
                            const btn = document.getElementById('pip-btn' + i);
                            if(btn) {
                                if(i === e.data.selectedColor) btn.classList.add('active');
                                else btn.classList.remove('active');
                            }
                            const chk = document.getElementById('pip-chk' + i);
                            if(chk) chk.checked = e.data.isXMarkMode[i];
                        }
                    } else if (e.data.type === "COLOR_UPDATE") {
                        e.data.colors.forEach((c, i) => {
                            document.documentElement.style.setProperty("--color-" + i, c);
                            const btn = document.getElementById('pip-btn' + i);
                            if (btn) btn.style.borderColor = c;
                        });
                    }
                });

                let sb = [];
                let st = null;
                window.addEventListener("keydown", (e) => {
                    const key = e.key.toLowerCase();

                    if (!window.opener || window.opener.closed) {
                        return;
                    }

                    if (key === "p") {
                        if (typeof window.opener.isDetecting !== "undefined" && window.opener.isDetecting) {
                            if (typeof window.opener.togglePauseDetection === "function") window.opener.togglePauseDetection();
                        }
                        return;
                    }

                    if (key === "r") {
                        if (typeof window.opener.requestReset === "function") window.opener.requestReset();
                        return;
                    }

                    if (key === "c") {
                        sb = [];
                        if (st) clearTimeout(st);
                        if (typeof window.opener.hideShortcutBubble === "function") window.opener.hideShortcutBubble();
                        return;
                    }

                    if (key === 'x') {
                        if (typeof window.opener.selectedColor !== "undefined" && window.opener.selectedColor !== -1) {
                            if (typeof window.opener.toggleXMode === "function") window.opener.toggleXMode(window.opener.selectedColor);
                        }
                        return;
                    }

                    if (['a', 's', 'd', 'f'].includes(key)) {
                        const idx = ['a', 's', 'd', 'f'].indexOf(key);
                        if (window.opener && window.opener.setSelectedColor) window.opener.setSelectedColor(idx);
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
                                    window.opener.simulatePlatformClick(targetIdx, undefined, window);
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
        if (typeof syncPopupControls === 'function') syncPopupControls();
    }, 200);
}

// 修改 renderPlatforms 以同步彈出視窗/PiP
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

function copyRoomCode() {
    const code = document.getElementById('roomCodeDisplay').innerText;
    if (code === '------') return;

    navigator.clipboard.writeText(code).then(() => {
        const label = document.querySelector('.room-label');
        const originalText = label.innerText;
        label.innerText = "已複製！";
        label.style.color = "#4ade80";
        setTimeout(() => {
            label.innerText = originalText;
            label.style.color = "";
        }, 1500);
    }).catch(err => {
        console.error('無法複製房號: ', err);
    });
}

// --- 顏色與無障礙功能 ---
function openColorSettings() {
    document.getElementById('color-settings-modal').style.display = 'flex';
    // 初始化 Pickers
    const styles = getComputedStyle(document.documentElement);
    for (let i = 0; i < 4; i++) {
        const color = styles.getPropertyValue(`--color-${i}`).trim();
        if (color) document.getElementById(`color-picker-${i}`).value = color;
    }
}

function closeColorSettings() {
    document.getElementById('color-settings-modal').style.display = 'none';
}

const colorTemplates = {
    'standard': ['#f87171', '#4ade80', '#60a5fa', '#c084fc'],
    'protanopia': ['#9ea160', '#9ea160', '#60a5fa', '#c084fc'],
    'deuteranopia': ['#a29d66', '#a29d66', '#60a5fa', '#c084fc'],
    'tritanopia': ['#f87171', '#00b1b9', '#00b1b9', '#c084fc']
};

function setColorTemplate(type) {
    const colors = colorTemplates[type] || colorTemplates['standard'];
    for (let i = 0; i < 4; i++) {
        document.getElementById(`color-picker-${i}`).value = colors[i];
    }
}

function applyColors() {
    for (let i = 0; i < 4; i++) {
        const color = document.getElementById(`color-picker-${i}`).value;
        document.documentElement.style.setProperty(`--color-${i}`, color);

        // 同步更新玩家按鈕背景
        const btn = document.getElementById('btn' + i);
        if (btn) btn.style.backgroundColor = color;
    }

    // 同步到懸浮視窗
    syncPopupColors();
    renderPlatforms();
    closeColorSettings();
}

function syncPopupColors() {
    if (!statusWindow) return;
    const colors = [];
    for (let i = 0; i < 4; i++) {
        colors.push(getComputedStyle(document.documentElement).getPropertyValue(`--color-${i}`).trim());
    }

    if (isPiPMode) {
        // PiP 視窗直接更新樣式
        for (let i = 0; i < 4; i++) {
            statusWindow.document.documentElement.style.setProperty(`--color-${i}`, colors[i]);
            const btn = statusWindow.document.getElementById('pip-btn' + i);
            if (btn) {
                btn.style.borderColor = colors[i];
                if (i === selectedColor) btn.style.backgroundColor = colors[i];
                else btn.style.backgroundColor = "transparent";
            }
        }
    } else if (!statusWindow.closed) {
        statusWindow.postMessage({ type: "COLOR_UPDATE", colors: colors }, "*");
    }
}

// --- 長按 O/X 功能 ---
let longPressTimer = null;
let longPressActive = false;
let currentLongPressIndex = -1;

function handlePlatformMouseDown(e, index) {
    if (typeof isObserver !== 'undefined' && isObserver) return;
    if (e.button !== 0 || selectedColor === -1) return; // 僅限左鍵

    longPressActive = false;
    currentLongPressIndex = index;

    // 綁定全域 mouseup 確保滑鼠移出格子也能正確放開
    window.addEventListener('mouseup', handleGlobalMouseUp);

    longPressTimer = setTimeout(() => {
        showOXPanel(e.clientX, e.clientY);
        longPressActive = true;
    }, 150); // 150ms 長按
}

function handleGlobalMouseUp(e) {
    if (longPressTimer) clearTimeout(longPressTimer);
    if (!longPressActive) return;

    // 檢查滑鼠是否在 O 或 X 上
    const oBtn = document.getElementById('ox-o');
    const xBtn = document.getElementById('ox-x');
    if (!oBtn || !xBtn) return;

    const mouseX = e.clientX;
    const mouseY = e.clientY;

    const rectO = oBtn.getBoundingClientRect();
    const rectX = xBtn.getBoundingClientRect();

    // 稍微增加判定的 Padding (10px) 讓點選更容易
    const p = 10;
    if (mouseX >= rectO.left - p && mouseX <= rectO.right + p && mouseY >= rectO.top - p && mouseY <= rectO.bottom + p) {
        handleOXSelection('O');
    } else if (mouseX >= rectX.left - p && mouseX <= rectX.right + p && mouseY >= rectX.top - p && mouseY <= rectX.bottom + p) {
        handleOXSelection('X');
    }

    hideOXPanel();
    longPressActive = false;
    window.removeEventListener('mouseup', handleGlobalMouseUp);
}

function handlePlatformMouseUp(e, index) {
    // 這裡改由 handleGlobalMouseUp 處理
    if (longPressTimer) clearTimeout(longPressTimer);
}

function handlePlatformMouseLeave(e, index) {
    if (longPressTimer && !longPressActive) {
        clearTimeout(longPressTimer);
    }
    // 長按成功後，隨便滑鼠移去哪面板都不消失，直到 mouseup
}

function showOXPanel(x, y) {
    const panel = document.getElementById('ox-panel');
    if (!panel) {
        console.error("找不到 ox-panel 元素！");
        return;
    }
    panel.style.display = 'block';
    // 稍微向上位移，避免被手指或滑鼠擋住
    panel.style.left = `${x - 75}px`;
    panel.style.top = `${y - 120}px`;
    console.log(`面版已顯示在: x=${x}, y=${y}`);
}

function hideOXPanel() {
    document.getElementById('ox-panel').style.display = 'none';
}

async function handleOXSelection(type) {
    if (currentLongPressIndex === -1 || selectedColor === -1) return;

    if (type === 'O') {
        // 直接輸入正解 (不受 X 模式影響)
        // 暫時修改 isXMarkMode 以利用現有的 simulatePlatformClick
        const oldX = isXMarkMode[selectedColor];
        isXMarkMode[selectedColor] = false;
        await simulatePlatformClick(currentLongPressIndex);
        isXMarkMode[selectedColor] = oldX;
    } else if (type === 'X') {
        // 直接輸入 X (不受 X 模式影響)
        const oldX = isXMarkMode[selectedColor];
        isXMarkMode[selectedColor] = true;
        await simulatePlatformClick(currentLongPressIndex);
        isXMarkMode[selectedColor] = oldX;
    }

    currentLongPressIndex = -1;
}

