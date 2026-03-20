/**
 * 自動畫面偵測系統 v4
 * - 移除房間 OCR，使用者自行在 UI 選好房間後按下偵測
 * - 僅追蹤「層數面板兩數之和」上升 → 觸發點亮平台
 * - 血條像素偵測決定欄位 1~4（無需 OCR，即時）
 */

// ====================================================================
// Canvas / 媒體串流
// ====================================================================
let videoElement = null;
let canvasElement = null;
let ctx = null;
let detectionTimeout = null;
let isDetecting = false;
let ocrWorker = null;

// ====================================================================
// 遊戲平台 X 座標常數（基準解析度 1600x900）
// 根據影片觀察，4 個平台的橫向比例範圍（0.0 ~ 1.0）
// 若偵測偏移，請微調 min/max
// ====================================================================
const PLATFORM_COLS = [
    { min: 0.10, max: 0.32 },   // 平台 1
    { min: 0.32, max: 0.52 },   // 平台 2
    { min: 0.52, max: 0.73 },   // 平台 3
    { min: 0.73, max: 0.95 },   // 平台 4
];

// 層數面板 ROI：畫面左側顯示兩個層數數字的小型螢幕
const LAYER_PANEL_ROI = { x: 0.0, y: 0.15, w: 0.14, h: 0.75 };

// ====================================================================
// 追蹤狀態
// ====================================================================
let lastLayerSum = -1;      // 上一輪層數面板兩數之和
let lastKnownLayer = 0;     // 已確認通過的層數（0-indexed）
let stableColHistory = [];  // 最近幾幀血條所在的欄位，取眾數

// ====================================================================
// 初始化 OCR
// ====================================================================
async function initOCR() {
    if (!ocrWorker) {
        setStatus("正在載入 Tesseract.js 與中文識別模型（首次需要一點時間）...");
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

// ====================================================================
// 啟動 / 停止偵測
// ====================================================================
async function startDetection() {
    if (isDetecting) return;

    const btn = document.getElementById("btnCapture");
    btn.innerText = "正在初始化偵測環境...";
    btn.disabled = true;

    try {
        await initOCR();

        const stream = await navigator.mediaDevices.getDisplayMedia({
            video: { displaySurface: "window" },
            audio: false
        });

        videoElement = document.getElementById("screenVideo");
        videoElement.srcObject = stream;
        await videoElement.play();

        canvasElement = document.getElementById("screenCanvas");
        canvasElement.width = videoElement.videoWidth;
        canvasElement.height = videoElement.videoHeight;
        ctx = canvasElement.getContext("2d", { willReadFrequently: true });

        stream.getVideoTracks()[0].onended = () => stopDetection();

        isDetecting = true;
        resetState();

        setStatus("📸 偵測啟動！正在追蹤向上傳送事件...");
        const statusEl = document.getElementById("detect-status");
        if (statusEl) statusEl.className = "status-text detecting";

        btn.innerText = "停止偵測";
        btn.classList.add("btn-danger");
        btn.disabled = false;
        btn.onclick = stopDetection;

        startAnalysisLoop();

    } catch (err) {
        console.error("擷取畫面失敗:", err);
        btn.innerText = "偵測畫面輸入";
        btn.disabled = false;
        alert("無法讀取螢幕畫面，請確認是否已授權瀏覽器分享視窗。");
    }
}

function stopDetection() {
    if (!isDetecting) return;
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
    btn.innerText = "偵測畫面輸入";
    btn.classList.remove("btn-danger");
    btn.onclick = startDetection;

    const statusEl = document.getElementById("detect-status");
    if (statusEl) statusEl.className = "status-text";
    setStatus("偵測已停止。");
}

function resetState() {
    lastLayerSum = -1;
    lastKnownLayer = 0;
    stableColHistory = [];
}

// ====================================================================
// 主迴圈
// ====================================================================
async function startAnalysisLoop() {
    if (!isDetecting) return;

    if (videoElement.videoWidth > 0 && videoElement.videoHeight > 0) {
        if (canvasElement.width !== videoElement.videoWidth) {
            canvasElement.width = videoElement.videoWidth;
            canvasElement.height = videoElement.videoHeight;
        }
        ctx.drawImage(videoElement, 0, 0, canvasElement.width, canvasElement.height);

        try {
            await detectPlatformJumpState();
        } catch (e) {
            console.error("偵測錯誤:", e);
        }
    }

    if (isDetecting) {
        // 偵測通關後切成大間隔，平常 150ms 高速追蹤
        const delay = 150;
        detectionTimeout = setTimeout(startAnalysisLoop, delay);
    }
}

// ====================================================================
// 工具：紅色血條像素偵測
// 血條特徵：R > 170、G < 70、B < 70
// 掃描範圍：Y 軸 8%~88%（排除頂部 UI 與底部狀態欄）
// ====================================================================
function findRedHealthBar() {
    const cw = canvasElement.width;
    const ch = canvasElement.height;
    const scanY0 = Math.floor(ch * 0.08);
    const scanY1 = Math.floor(ch * 0.88);
    const scanH = scanY1 - scanY0;

    const imageData = ctx.getImageData(0, scanY0, cw, scanH);
    const data = imageData.data;

    let sumX = 0, count = 0, minX = cw, maxX = 0;

    for (let py = 0; py < scanH; py += 2) {
        for (let px = 0; px < cw; px += 2) {
            const idx = (py * cw + px) * 4;
            if (data[idx] > 170 && data[idx + 1] < 70 && data[idx + 2] < 70) {
                sumX += px;
                count++;
                if (px < minX) minX = px;
                if (px > maxX) maxX = px;
            }
        }
    }

    // 需要足夠寬（至少畫面 3%）才算血條，避免誤判技能特效
    if (count < 15 || (maxX - minX) < cw * 0.03) {
        return { found: false, cx: -1 };
    }

    return { found: true, cx: Math.floor(sumX / count) };
}

// 將血條 X 比對 PLATFORM_COLS，回傳欄位 0~3，找不到回 -1
function xToColumn(cx, cw) {
    const ratio = cx / cw;
    for (let i = 0; i < PLATFORM_COLS.length; i++) {
        if (ratio >= PLATFORM_COLS[i].min && ratio < PLATFORM_COLS[i].max) return i;
    }
    return -1;
}

// 取 stableColHistory 的眾數
function getModeColumn() {
    if (stableColHistory.length === 0) return -1;
    const freq = {};
    stableColHistory.forEach(c => { freq[c] = (freq[c] || 0) + 1; });
    return parseInt(Object.keys(freq).reduce((a, b) => freq[a] > freq[b] ? a : b));
}

// 防呆補缺：其他三格都亮了就補最後空格
function resolveTargetCol(logicRow, preferredCol) {
    const rowStart = logicRow * 4;
    let occupied = 0, emptyIdx = -1;
    for (let i = 0; i < 4; i++) {
        const v = roomData[rowStart + i];
        if (v !== 4 && v !== selectedColor) occupied++;
        else if (v === 4) emptyIdx = i;
    }
    if (occupied === 3 && emptyIdx !== -1) {
        console.log(`[防呆補位] row=${logicRow} → 欄位 ${emptyIdx + 1}`);
        return emptyIdx;
    }
    return preferredCol;
}

// ====================================================================
// 平台傳送偵測主函式
// ====================================================================
async function detectPlatformJumpState() {
    const cw = canvasElement.width;
    const ch = canvasElement.height;

    // ==== A. 偵測「通過」字樣（裁切畫面中央小塊）====
    const passCanvas = document.createElement("canvas");
    passCanvas.width = Math.floor(cw * 0.52);
    passCanvas.height = Math.floor(ch * 0.32);
    const pCtx = passCanvas.getContext("2d");
    pCtx.drawImage(canvasElement,
        Math.floor(cw * 0.24), Math.floor(ch * 0.28),
        passCanvas.width, passCanvas.height,
        0, 0, passCanvas.width, passCanvas.height
    );
    const { data: { text: centerText } } = await ocrWorker.recognize(passCanvas);

    if (centerText.includes("通過") || centerText.includes("過關") || centerText.includes("完成")) {
        setStatus("🎉 偵測到通關！自動重設平台，等待下一局...");
        if (typeof window.requestReset === 'function') window.requestReset();
        resetState();
        // 通關後大幅降低頻率（30 秒）直到下次手動重啟或偵測到新局
        if (isDetecting) {
            clearTimeout(detectionTimeout);
            detectionTimeout = setTimeout(startAnalysisLoop, 30000);
        }
        return;
    }

    // ==== B. 像素掃描：即時記錄血條所在欄位 ====
    const bar = findRedHealthBar();
    let currentCol = -1;
    if (bar.found) {
        currentCol = xToColumn(bar.cx, cw);
        if (currentCol >= 0) {
            stableColHistory.push(currentCol);
            if (stableColHistory.length > 8) stableColHistory.shift();
        }
    }

    // ==== C. OCR 偵測左側層數面板（小塊，速度快）====
    const panelCanvas = document.createElement("canvas");
    panelCanvas.width = Math.floor(cw * LAYER_PANEL_ROI.w * 2); // 放大 2 倍辨識
    panelCanvas.height = Math.floor(ch * LAYER_PANEL_ROI.h * 2);
    const panelCtx = panelCanvas.getContext("2d");
    panelCtx.filter = "invert(1) contrast(3) brightness(1.4)";
    panelCtx.drawImage(canvasElement,
        Math.floor(cw * LAYER_PANEL_ROI.x), Math.floor(ch * LAYER_PANEL_ROI.y),
        Math.floor(cw * LAYER_PANEL_ROI.w), Math.floor(ch * LAYER_PANEL_ROI.h),
        0, 0, panelCanvas.width, panelCanvas.height
    );
    const { data: { text: panelText } } = await ocrWorker.recognize(panelCanvas);

    // 取出 1~10 的數字，去重後取最小兩個
    const uniqueNums = [...new Set(
        (panelText.match(/\d+/g) || [])
            .map(Number)
            .filter(n => n >= 1 && n <= 10)
            .sort((a, b) => a - b)
    )].slice(0, 2);

    const currentSum = uniqueNums.reduce((a, b) => a + b, 0);

    // ==== D. 判斷傳送：兩數之和增加 ====
    if (lastLayerSum < 0) {
        // 初次進入，記錄基準值
        if (currentSum > 0) {
            lastLayerSum = currentSum;
            lastKnownLayer = uniqueNums[0] ? uniqueNums[0] - 1 : 0;
        }
        const colLabel = currentCol >= 0 ? `平台 ${currentCol + 1}` : "移動中";
        setStatus(`🔍 初始化 — 面板:[${uniqueNums.join(",")}] | 血條:${colLabel}`);
        return;
    }

    if (currentSum > lastLayerSum) {
        // 層數和增加 → 向上傳送
        const layersJumped = Math.round((currentSum - lastLayerSum) / 2);
        const jumpCol = getModeColumn() >= 0 ? getModeColumn() : 0;

        console.log(`[傳送] 層數和 ${lastLayerSum}→${currentSum}，上升 ${layersJumped} 層，欄位眾數:${jumpCol + 1}`);

        for (let j = 0; j < layersJumped; j++) {
            const passedLayer = lastKnownLayer + j;  // 0-indexed
            const logicRow = 9 - passedLayer;        // UI row（第1層=row9）
            if (logicRow < 0) continue;

            const finalCol = resolveTargetCol(logicRow, jumpCol);
            if (typeof window.simulatePlatformClick === 'function') {
                window.simulatePlatformClick(logicRow * 4 + finalCol);
            }
            console.log(`[🔴點燈] 第 ${passedLayer + 1} 層 row=${logicRow} col=${finalCol + 1}`);
        }

        lastKnownLayer += layersJumped;
        lastLayerSum = currentSum;
        stableColHistory = []; // 清空，重新累積下層軌跡

        setStatus(`✅ 傳送！已過第 ${lastKnownLayer} 層 — 面板:[${uniqueNums.join(",")}] 欄位:${jumpCol + 1}`);

    } else {
        // 等待傳送
        const colLabel = currentCol >= 0 ? `平台 ${currentCol + 1}` : "移動中";
        setStatus(`👀 等待傳送 — 面板:[${uniqueNums.join(",")}] 和=${currentSum} | 血條:${colLabel}`);

        // 層數和縮小 → 猜錯被傳回底層，重置
        if (currentSum > 0 && currentSum < lastLayerSum - 1) {
            console.warn("[警告] 層數和縮小，可能猜錯，重置追蹤");
            lastLayerSum = currentSum;
            lastKnownLayer = 0;
            stableColHistory = [];
        }
    }
}
