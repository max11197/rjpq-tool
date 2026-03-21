let videoElement = null;
let canvasElement = null;
let ctx = null;
let detectionTimeout = null;
let isDetecting = false;
let isPaused = false;
let ocrWorker = null;

let roiConfig = { x: 0, y: 0.7, w: 0.4, h: 0.15 };
let lastDetectedStr = ""; // 記錄上次偵測到的數字序列，避免重複刷新

function togglePauseDetection() {
    isPaused = !isPaused;
    const btn = document.getElementById("btnPause");
    if (isPaused) {
        btn.innerText = "恢復輸入";
        setStatus("⏸️ 偵測已暫停輸入 (畫面仍在擷取中，可隨時恢復)。");
    } else {
        btn.innerText = "暫停輸入";
        lastDetectedStr = ""; // 清除舊紀錄以免瞬間更新
        const res = document.getElementById("resSelect") ? document.getElementById("resSelect").value : "當前";
        setStatus(`📸 已恢復 ${res} 偵測！每 150ms 監聽輸入...`);
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

function updateRoiBox() {
    roiConfig.x = document.getElementById("roi-x").value / 100;
    roiConfig.y = document.getElementById("roi-y").value / 100;
    roiConfig.w = document.getElementById("roi-w").value / 100;
    roiConfig.h = document.getElementById("roi-h").value / 100;
    
    document.getElementById("val-x").innerText = `${document.getElementById("roi-x").value}%`;
    document.getElementById("val-y").innerText = `${document.getElementById("roi-y").value}%`;
    document.getElementById("val-w").innerText = `${document.getElementById("roi-w").value}%`;
    document.getElementById("val-h").innerText = `${document.getElementById("roi-h").value}%`;

    const box = document.getElementById("roi-box");
    box.style.left = `${roiConfig.x * 100}%`;
    box.style.top = `${roiConfig.y * 100}%`;
    box.style.width = `${roiConfig.w * 100}%`;
    box.style.height = `${roiConfig.h * 100}%`;
}

async function startDetection() {
    if (selectedColor === -1) {
        alert("請先選擇一個玩家位置 (點擊玩家1~4按鈕) 再啟動偵測。");
        return;
    }

    if (isDetecting) return;

    const btn = document.getElementById("btnCapture");
    btn.innerText = "正在取得畫面...";
    btn.disabled = true;

    try {
        await initOCR();

        const stream = await navigator.mediaDevices.getDisplayMedia({
            video: { displaySurface: "window" },
            audio: false
        });

        videoElement = document.getElementById("previewVideo");
        videoElement.srcObject = stream;
        await videoElement.play();

        canvasElement = document.getElementById("screenCanvas");

        stream.getVideoTracks()[0].onended = () => stopDetection();

        // 顯示設定區域
        document.getElementById("ai-controls-main").style.display = "none";
        document.getElementById("roi-setup").style.display = "flex";
        
        // 初始化 ROI UI
        document.getElementById("roi-x").value = parseInt(roiConfig.x * 100);
        document.getElementById("roi-y").value = parseInt(roiConfig.y * 100);
        document.getElementById("roi-w").value = parseInt(roiConfig.w * 100);
        document.getElementById("roi-h").value = parseInt(roiConfig.h * 100);
        updateRoiBox();

        btn.disabled = false;
        setStatus("請設定框區。");

    } catch (err) {
        console.error("擷取畫面失敗:", err);
        btn.innerText = "偵測對話框輸入";
        btn.disabled = false;
        alert("無法讀取螢幕畫面，請確認是否已授權瀏覽器分享視窗。");
    }
}

function confirmRoiAndStart() {
    document.getElementById("roi-setup").style.display = "none";
    document.getElementById("ai-controls-main").style.display = "flex";
    
    isDetecting = true;
    lastDetectedStr = ""; // 重設緩存
    
    setStatus("📸 正在每 500ms 偵測對話框中...");
    const statusEl = document.getElementById("detect-status");
    if (statusEl) statusEl.className = "status-text detecting";

    const btn = document.getElementById("btnCapture");
    btn.innerText = "停止偵測";
    btn.classList.add("btn-danger");
    btn.onclick = stopDetection;

    startAnalysisLoop();
}

function stopDetection() {
    isDetecting = false;
    document.getElementById("roi-setup").style.display = "none";
    document.getElementById("ai-controls-main").style.display = "flex";

    if (detectionTimeout) {
        clearTimeout(detectionTimeout);
        detectionTimeout = null;
    }
    if (videoElement && videoElement.srcObject) {
        videoElement.srcObject.getTracks().forEach(t => t.stop());
        videoElement.srcObject = null;
    }

    const btn = document.getElementById("btnCapture");
    if(btn) {
        btn.innerText = "偵測對話框輸入";
        btn.classList.remove("btn-danger");
        btn.onclick = startDetection;
    }

    const statusEl = document.getElementById("detect-status");
    if (statusEl) statusEl.className = "status-text";
    setStatus("偵測已停止。");
}

/* =========================================================
   新增：利用固定解析度自動選擇擷取窗格 (免拖拉 UI) 
   ========================================================= */
const PRESET_ROIS = {
    "800x600": { x: 0.0, y: 0.75, w: 0.60, h: 0.25 },
    "1024x768": { x: 0.0, y: 0.80, w: 0.50, h: 0.20 },
    "1280x720": { x: 0.0, y: 0.80, w: 0.45, h: 0.20 },
    "1366x768": { x: 0.0, y: 0.80, w: 0.40, h: 0.20 },
    "1920x1080": { x: 0.0, y: 0.85, w: 0.30, h: 0.15 },
    "2560x1440": { x: 0.0, y: 0.88, w: 0.25, h: 0.12 }
};

async function startDetectionParams() {
    if (selectedColor === -1) {
        alert("請先選擇一個玩家位置 (點擊玩家1~4按鈕) 再啟動偵測。");
        return;
    }

    if (isDetecting) return;

    const res = document.getElementById("resSelect").value;
    if (PRESET_ROIS[res]) {
        // 設定寫死的 ROI
        roiConfig = PRESET_ROIS[res];
    }

    const btn = document.getElementById("btnCapture");
    btn.innerText = "正在取得畫面...";
    btn.disabled = true;

    try {
        await initOCR();

        const stream = await navigator.mediaDevices.getDisplayMedia({
            video: { displaySurface: "window" },
            audio: false
        });

        // 直接用隱藏的 screenVideo 擷取
        videoElement = document.getElementById("screenVideo");
        videoElement.srcObject = stream;
        await videoElement.play();

        canvasElement = document.getElementById("screenCanvas");

        stream.getVideoTracks()[0].onended = () => stopDetectionParams();

        isDetecting = true;
        isPaused = false;
        lastDetectedStr = ""; // 重設緩存
        
        btn.disabled = false;
        btn.innerText = "停止偵測";
        btn.classList.add("btn-danger");
        btn.onclick = stopDetectionParams;

        const btnP = document.getElementById("btnPause");
        if(btnP) {
            btnP.style.display = "inline-block";
            btnP.innerText = "暫停輸入";
        }

        setStatus(`📸 已啟動 ${res} 偵測！每 150ms 監聽輸入...`);
        const statusEl = document.getElementById("detect-status");
        if (statusEl) statusEl.className = "status-text detecting";

        startAnalysisLoop();

    } catch (err) {
        console.error("擷取畫面失敗:", err);
        btn.innerText = "直接開始偵測";
        btn.disabled = false;
        alert("無法讀取螢幕畫面，請確認是否已授權瀏覽器分享視窗。");
    }
}

function stopDetectionParams() {
    isDetecting = false;
    
    if (detectionTimeout) {
        clearTimeout(detectionTimeout);
        detectionTimeout = null;
    }
    if (videoElement && videoElement.srcObject) {
        videoElement.srcObject.getTracks().forEach(t => t.stop());
        videoElement.srcObject = null;
    }

    const btn = document.getElementById("btnCapture");
    if(btn) {
        btn.innerText = "直接開始偵測";
        btn.classList.remove("btn-danger");
        btn.onclick = startDetectionParams;
    }
    
    const btnP = document.getElementById("btnPause");
    if(btnP) btnP.style.display = "none";

    const statusEl = document.getElementById("detect-status");
    if (statusEl) statusEl.className = "status-text";
    setStatus("偵測已停止。");
}

async function startAnalysisLoop() {
    if (!isDetecting) return;

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
        detectionTimeout = setTimeout(startAnalysisLoop, 150);
    }
}

function processOcrText(text) {
    if (!text) return;

    // 依行切割
    const lines = text.split('\n').map(l => l.trim()).filter(l => l.length > 0);
    
    // 從最後一行往前算
    for (let i = lines.length - 1; i >= 0; i--) {
        let line = lines[i];
        
        // 若句子中有冒號(中英文皆可)，只取右邊部分做偵測，避免玩家名字中夾帶的 1-4 數字干擾
        const matchColon = line.match(/[:：]/);
        if (matchColon) {
            line = line.substring(line.indexOf(matchColon[0]) + 1);
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

    // 1. 僅清除該玩家自己現有的所有層數，不影響其他人
    for (let i = 0; i < 40; i++) {
        if (roomData[i] === playerColor) {
            roomData[i] = 4;
            changed = true;
        }
    }

    // 2. 套用新字串填入位置
    for (let layer = 0; layer < pathStr.length && layer < 10; layer++) {
        const col = parseInt(pathStr[layer], 10) - 1; // '1' 變 0
        const row = 9 - layer;
        const index = row * 4 + col;
        
        // 只有這格目前是空的，才填寫，遇到別人的位置則不覆蓋
        if (roomData[index] === 4) {
            roomData[index] = playerColor;
            changed = true;
        }
    }

    if (changed) {
        if (typeof renderPlatforms === 'function') renderPlatforms();
        
        const payload = { type: 'FULL_SYNC', data: roomData };
        if (isHost && typeof broadcast === 'function') {
            broadcast(payload);
        } else if (typeof hostConn !== 'undefined' && hostConn && hostConn.open) {
            hostConn.send(payload);
        }
    }
}
