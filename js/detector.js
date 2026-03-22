let videoElement = null;
let canvasElement = null;
let ctx = null;
let detectionTimeout = null;
let isDetecting = false;
let isPaused = false;
let ocrWorker = null;

let roiConfig = { x: 0, y: 0.75, w: 0.4, h: 0.2 };
let lastDetectedStr = ""; // 記錄上次偵測到的數字序列，避免重複刷新

function togglePauseDetection() {
    isPaused = !isPaused;
    const btn = document.getElementById("btnPause");
    if (isPaused) {
        btn.innerText = "恢復(P)";
        setStatus("⏸️ 偵測已暫停輸入 (畫面仍在擷取中，可隨時恢復)。");
    } else {
        btn.innerText = "暫停(P)";
        lastDetectedStr = ""; // 清除舊紀錄以免瞬間更新
        const res = document.getElementById("resSelect") ? document.getElementById("resSelect").value : "當前";
        const interval = document.getElementById("intervalInput") ? document.getElementById("intervalInput").value : 150;
        setStatus(`📸 已恢復 ${res} 偵測！每 ${interval}ms 監聽輸入...`);
    }
}

async function initOCR() {
    if (!ocrWorker) {
        setStatus("正在載入 Tesseract.js 與中文識別模型...");
        ocrWorker = await Tesseract.createWorker("chi_tra");
        await ocrWorker.setParameters({
            tessedit_pageseg_mode: Tesseract.PSM.SPARSE_TEXT,
        });
    }
}

function setStatus(msg) {
    const el = document.getElementById("detect-status");
    if (el) el.innerText = msg;
}

/* =========================================================
   手動 ROI 拖拉/縮放邏輯
   ========================================================= */
let isDraggingRoi = false;
let dragType = ''; // 'move', 'tl', 'tc', 'tr', 'ml', 'mr', 'bl', 'bc', 'br'
let dragStartX = 0;
let dragStartY = 0;
let initialRoi = null;

function setupRoiInteractive() {
    const box = document.getElementById('roi-box-interactive');
    if (!box) return;
    const container = box.parentElement;

    if (!box._hasDragEvent) {
        box._hasDragEvent = true;

        box.addEventListener('mousedown', (e) => {
            if (e.target.classList.contains('resize-handle')) {
                dragType = e.target.getAttribute('data-resize');
            } else {
                dragType = 'move';
            }
            isDraggingRoi = true;
            dragStartX = e.clientX;
            dragStartY = e.clientY;
            initialRoi = { ...roiConfig };
            e.preventDefault();
        });

        window.addEventListener('mousemove', (e) => {
            if (!isDraggingRoi) return;

            const rect = container.getBoundingClientRect();
            const dx = (e.clientX - dragStartX) / rect.width;
            const dy = (e.clientY - dragStartY) / rect.height;

            let newRoi = { ...initialRoi };

            if (dragType === 'move') {
                newRoi.x = Math.max(0, Math.min(1 - newRoi.w, initialRoi.x + dx));
                newRoi.y = Math.max(0, Math.min(1 - newRoi.h, initialRoi.y + dy));
            } else {
                if (dragType.includes('t')) {
                    newRoi.y = Math.max(0, Math.min(initialRoi.y + initialRoi.h - 0.05, initialRoi.y + dy));
                    newRoi.h = initialRoi.h + (initialRoi.y - newRoi.y);
                }
                if (dragType.includes('b')) {
                    newRoi.h = Math.max(0.05, Math.min(1 - initialRoi.y, initialRoi.h + dy));
                }
                if (dragType.includes('l')) {
                    newRoi.x = Math.max(0, Math.min(initialRoi.x + initialRoi.w - 0.05, initialRoi.x + dx));
                    newRoi.w = initialRoi.w + (initialRoi.x - newRoi.x);
                }
                if (dragType.includes('r')) {
                    newRoi.w = Math.max(0.05, Math.min(1 - initialRoi.x, initialRoi.w + dx));
                }
            }

            roiConfig = newRoi;
            updateRoiPreview();
        });

        window.addEventListener('mouseup', () => {
            isDraggingRoi = false;
        });
    }
}

function updateRoiPreview() {
    const box = document.getElementById("roi-box-interactive");
    if (box) {
        box.style.left = `${roiConfig.x * 100}%`;
        box.style.top = `${roiConfig.y * 100}%`;
        box.style.width = `${roiConfig.w * 100}%`;
        box.style.height = `${roiConfig.h * 100}%`;
    }

    const valX = document.getElementById("val-x");
    if (valX) valX.innerText = Math.round(roiConfig.x * 100);
    const valY = document.getElementById("val-y");
    if (valY) valY.innerText = Math.round(roiConfig.y * 100);
    const valW = document.getElementById("val-w");
    if (valW) valW.innerText = Math.round(roiConfig.w * 100);
    const valH = document.getElementById("val-h");
    if (valH) valH.innerText = Math.round(roiConfig.h * 100);
}

/* =========================================================
   利用固定解析度自動選擇擷取窗格
   ========================================================= */
const PRESET_ROIS = {
    "1920x1080": { x: 0.0, y: 0.85, w: 0.30, h: 0.15 },
    "1680x1050": { x: 0.0, y: 0.80, w: 0.40, h: 0.20 },
    "1600x1200": { x: 0.0, y: 0.80, w: 0.45, h: 0.20 },
    "1600x1024": { x: 0.0, y: 0.80, w: 0.40, h: 0.20 },
    "1600x900": { x: 0.0, y: 0.80, w: 0.40, h: 0.20 },
    "1440x1080": { x: 0.0, y: 0.80, w: 0.45, h: 0.20 },
    "1440x900": { x: 0.0, y: 0.80, w: 0.40, h: 0.20 },
    "1366x768": { x: 0.0, y: 0.80, w: 0.40, h: 0.20 },
    "1360x768": { x: 0.0, y: 0.80, w: 0.40, h: 0.20 },
    "1280x1024": { x: 0.0, y: 0.75, w: 0.50, h: 0.25 },
    "1280x960": { x: 0.0, y: 0.75, w: 0.50, h: 0.25 },
    "1280x800": { x: 0.0, y: 0.80, w: 0.45, h: 0.20 },
    "1280x768": { x: 0.0, y: 0.80, w: 0.45, h: 0.20 },
    "1280x720": { x: 0.0, y: 0.80, w: 0.45, h: 0.20 },
    "1024x768": { x: 0.0, y: 0.80, w: 0.50, h: 0.20 },
    "800x600": { x: 0.0, y: 0.75, w: 0.60, h: 0.25 }
};

async function startDetectionParams(isManual = false) {
    if (selectedColor === -1) {
        alert("請先選擇一個玩家位置 (點擊玩家1~4按鈕) 再啟動偵測。");
        return;
    }

    if (isDetecting) return;

    const res = document.getElementById("resSelect").value;
    if (!isManual && PRESET_ROIS[res]) {
        // 設定寫死的 ROI
        roiConfig = { ...PRESET_ROIS[res] };
    }

    const btn = document.getElementById(isManual ? "btnManualRoi" : "btnCapture");
    const originalText = btn.innerText;
    btn.innerText = "正在取得畫面...";
    btn.disabled = true;

    try {
        await initOCR();

        const stream = await navigator.mediaDevices.getDisplayMedia({
            video: { displaySurface: "window" },
            audio: false
        });

        if (isManual) {
            // 顯示選擇介面 (附帶 previewVideo)
            videoElement = document.getElementById("previewVideo");
            videoElement.srcObject = stream;
            await videoElement.play();

            stream.getVideoTracks()[0].onended = () => stopDetectionParams();

            document.getElementById("ai-controls-main").style.display = "none";
            document.getElementById("roi-setup").style.display = "flex";

            setupRoiInteractive();
            updateRoiPreview();

            btn.disabled = false;
            btn.innerText = originalText;
            setStatus("請拖曳設定框區。");
        } else {
            // 自動偵測模式，直接執行
            videoElement = document.getElementById("screenVideo");
            videoElement.srcObject = stream;
            await videoElement.play();

            stream.getVideoTracks()[0].onended = () => stopDetectionParams();

            confirmRoiAndStart(true);
            btn.disabled = false;
        }

    } catch (err) {
        console.error("擷取畫面失敗:", err);
        btn.innerText = originalText;
        btn.disabled = false;
        alert("無法讀取螢幕畫面，請確認是否已授權瀏覽器分享視窗。");
    }
}

function confirmRoiAndStart(isAuto = false) {
    document.getElementById("roi-setup").style.display = "none";
    document.getElementById("ai-controls-main").style.display = "flex";

    // 如果是手動設定完成，需要把 video 切換給 screenVideo，避免重複開授權
    if (!isAuto) {
        const preview = document.getElementById("previewVideo");
        const screen = document.getElementById("screenVideo");
        if (preview && preview.srcObject) {
            screen.srcObject = preview.srcObject;
            screen.play();
            videoElement = screen; // 將目標切換到 screenVideo
        }
    }

    canvasElement = document.getElementById("screenCanvas");

    isDetecting = true;
    isPaused = false;
    lastDetectedStr = ""; // 重設緩存

    const btn = document.getElementById("btnCapture");
    btn.innerText = "停止偵測";
    btn.classList.add("btn-danger");
    btn.onclick = stopDetectionParams;

    const btnM = document.getElementById("btnManualRoi");
    btnM.style.display = "none"; // 偵測時隱藏手動按鈕

    const btnP = document.getElementById("btnPause");
    if (btnP) {
        btnP.style.display = "inline-block";
        btnP.innerText = "暫停(P)";
    }

    const interval = document.getElementById("intervalInput") ? document.getElementById("intervalInput").value : 150;
    setStatus(`📸 已啟動偵測！每 ${interval}ms 監聽輸入...`);
    const statusEl = document.getElementById("detect-status");
    if (statusEl) statusEl.className = "status-text detecting";

    startAnalysisLoop();
}

function stopDetectionParams() {
    isDetecting = false;

    document.getElementById("roi-setup").style.display = "none";
    document.getElementById("ai-controls-main").style.display = "flex";

    if (detectionTimeout) {
        clearTimeout(detectionTimeout);
        detectionTimeout = null;
    }

    // 停止所有的視訊串流
    const streams = [
        document.getElementById("previewVideo"),
        document.getElementById("screenVideo")
    ];
    streams.forEach(vid => {
        if (vid && vid.srcObject) {
            vid.srcObject.getTracks().forEach(t => t.stop());
            vid.srcObject = null;
        }
    });
    videoElement = null;

    const btn = document.getElementById("btnCapture");
    if (btn) {
        btn.innerText = "自動偵測";
        btn.classList.remove("btn-danger");
        btn.onclick = () => startDetectionParams(false);
    }

    const btnM = document.getElementById("btnManualRoi");
    if (btnM) btnM.style.display = "inline-block";

    const btnP = document.getElementById("btnPause");
    if (btnP) btnP.style.display = "none";

    const statusEl = document.getElementById("detect-status");
    if (statusEl) statusEl.className = "status-text";
    setStatus("偵測已停止。");
}

async function startAnalysisLoop() {
    if (!isDetecting || !videoElement) return;

    if (videoElement.videoWidth > 0 && videoElement.videoHeight > 0) {
        // 設定 Canvas 符合 ROI 的解析度，增強辨識
        const vw = videoElement.videoWidth;
        const vh = videoElement.videoHeight;

        const cropX = Math.floor(vw * roiConfig.x);
        const cropY = Math.floor(vh * roiConfig.y);
        const cropW = Math.max(1, Math.floor(vw * roiConfig.w));
        const cropH = Math.max(1, Math.floor(vh * roiConfig.h));

        // 兩倍放大有利於 OCR
        canvasElement.width = cropW * 2;
        canvasElement.height = cropH * 2;
        ctx = canvasElement.getContext("2d", { willReadFrequently: true });

        // 將畫面部分畫進 Canvas，黑底白字高反差
        ctx.filter = "invert(1) contrast(2) brightness(1.2)";
        ctx.drawImage(videoElement,
            cropX, cropY, cropW, cropH,
            0, 0, canvasElement.width, canvasElement.height
        );

        try {
            const { data: { text } } = await ocrWorker.recognize(canvasElement);
            processOcrText(text);
        } catch (e) {
            console.error("OCR 錯誤:", e);
        }
    }

    if (isDetecting) {
        const interval = document.getElementById("intervalInput") ? parseInt(document.getElementById("intervalInput").value) : 150;
        detectionTimeout = setTimeout(startAnalysisLoop, isNaN(interval) ? 150 : Math.max(50, interval));
    }
}

function processOcrText(text) {
    if (!text) return;

    // 依行切割
    const lines = text.split('\n').map(l => l.trim()).filter(l => l.length > 0);

    const chkFilter = document.getElementById('chkFilterPlayer');
    const playerNameEl = document.getElementById('playerNameInput');
    const isNameFilterEnabled = (chkFilter && chkFilter.checked && playerNameEl && playerNameEl.value.trim() !== '');
    const filterName = isNameFilterEnabled ? playerNameEl.value.trim() : "";

    // 從最後一行往前算
    for (let i = lines.length - 1; i >= 0; i--) {
        let line = lines[i];

        if (isNameFilterEnabled) {
            // 由於 OCR 可能對字元辨識有些微誤差，這裡我們做相對精確的名稱偵測
            const nameIdx = line.indexOf(filterName);
            if (nameIdx === -1) {
                continue; // 該行沒有指定玩家的名字，直接跳過
            }
            // 擷取玩家名字後面的部分
            const afterName = line.substring(nameIdx + filterName.length).trim();
            // 檢查後面是否緊連著冒號
            const matchColon = afterName.match(/^[:：]/);
            if (matchColon) {
                line = afterName.substring(matchColon[0].length);
            } else {
                continue; // 雖然有名字，但不是發言模式 (如: 玩家名稱加入遊戲)
            }
        } else {
            // 原裝邏輯：若句子中有冒號(中英文皆可)，只取右邊部分做偵測，避免玩家名字中夾帶的 1-4 數字干擾
            const matchColon = line.match(/[:：]/);
            if (matchColon) {
                line = line.substring(line.indexOf(matchColon[0]) + 1);
            }
        }

        // 抓出所有由 1-4 和空格組成的結果
        const matches = line.match(/[1-4][1-4\s]*[1-4]|[1-4]/g);
        if (matches) {
            for (let j = matches.length - 1; j >= 0; j--) {
                const s = matches[j].replace(/\s+/g, '');

                // 長度只能 1~10，且要跟前一次不同
                if (s.length >= 1 && s.length <= 10) {
                    if (s !== lastDetectedStr) {
                        lastDetectedStr = s;
                        if (!isPaused) {
                            console.log(`[OCR 偵測到變化] -> 新的: ${s}`);
                            setStatus(`✅ 偵測到更新: [ ${s} ]`);
                            applyPathToRoom(selectedColor, s);
                        } else {
                            console.log(`[OCR 暫停中] 忽略: ${s}`);
                        }
                    }
                    return; // 只要找到一組最新的，後面就不必看了
                }
            }
        }
    }
}

function applyPathToRoom(playerColor, pathStr) {
    if (playerColor === -1) return;

    let changed = false;
    const isX = typeof isXMarkMode !== 'undefined' ? isXMarkMode[playerColor] : false;

    if (isX) {
        // 1. 僅清除該玩家自己現有的所有 X 標記
        for (let i = 0; i < 40; i++) {
            if (typeof xMarkData !== 'undefined' && (xMarkData[i] & (1 << playerColor))) {
                xMarkData[i] &= ~(1 << playerColor);
                changed = true;
            }
        }

        // 2. 套用新字串填入 X 標記位置
        for (let layer = 0; layer < pathStr.length && layer < 10; layer++) {
            const col = parseInt(pathStr[layer], 10) - 1; // '1' 變 0
            const row = 9 - layer;
            const index = row * 4 + col;

            // X標記不可覆蓋已經標記是正解的平台
            // 只有在這格目前沒有正解標示 (roomData === 4) 時，才填入 X 標記
            if (roomData[index] === 4) {
                if (typeof xMarkData !== 'undefined') {
                    xMarkData[index] |= (1 << playerColor);
                    changed = true;
                }
            }
        }
    } else {
        // 1. 一般模式：僅清除該玩家自己現有的所有正解標記，不影響其他人
        for (let i = 0; i < 40; i++) {
            if (roomData[i] === playerColor) {
                roomData[i] = 4;
                changed = true;
            }
        }

        // 2. 套用新字串填入正解位置
        for (let layer = 0; layer < pathStr.length && layer < 10; layer++) {
            const col = parseInt(pathStr[layer], 10) - 1; // '1' 變 0
            const row = 9 - layer;
            const index = row * 4 + col;

            // 只有這格目前沒有正解標記，才填寫，遇到別人的正解位置則不覆蓋
            if (roomData[index] === 4) {
                if (typeof xMarkData !== 'undefined') xMarkData[index] = 0; // 一般標記會清空這格的 X 標記
                roomData[index] = playerColor;
                changed = true;
            }
        }
    }

    if (changed) {
        if (typeof renderPlatforms === 'function') renderPlatforms();

        const payload = { type: 'FULL_SYNC', data: roomData, xData: typeof xMarkData !== 'undefined' ? xMarkData : [] };
        if (isHost && typeof broadcast === 'function') {
            broadcast(payload);
        } else if (typeof hostConn !== 'undefined' && hostConn && hostConn.open) {
            hostConn.send(payload);
        }
    }
}
