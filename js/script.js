const canvas = document.getElementById("pipeCanvas");
const ctx = canvas.getContext("2d");

const depthInput = document.getElementById("depthInput");
const pipeDiameter = document.getElementById("pipeDiameter");
const saringanDepth = document.getElementById("saringanDepth");
const saringanSize = document.getElementById("saringanSize");
const openHoleDepth = document.getElementById("openHoleDepth");
const groundLevelInput = document.getElementById("groundLevelInput");
const matInput = document.getElementById("matInput");
const saringanList = document.getElementById("saringanList");
const pipeList = document.getElementById("pipeList");
const openHoleInfo = document.getElementById("openHoleInfo");
const openHoleStatus = document.getElementById("openHoleStatus");
const openHoleDetails = document.getElementById("openHoleDetails");
const detailInfo = document.getElementById("detailInfo");
const tooltip = document.getElementById("tooltip");
const hoverDetails = document.getElementById("hoverDetails");

const PIPE_WIDTH = 70;
const TOP_MARGIN = 50;
const BOTTOM_MARGIN = 40;
const SCALE_STEP = 5;

let currentDepth = 0;
let pipeSegments = [];
let saringanPosisi = [];
let openHole = null;
let components = [];
let groundLevel = 0;
let groundLevelSet = false;
let matLevel = null;
let matSet = false;
const inchToPixel = 6;

let notificationTimeout = null;

// Array untuk menyimpan gambar dokumentasi kegiatan per kategori
let activityImages = {
    doc1: [], // Papan Nama Lokasi Penyelidikan
    doc2: [], // Kenampakan Sumur Bor Produksi
    doc3: [], // Persiapan pengukuran borehole camera
    doc4: [], // Kegiatan pengukuran borehole camera
    doc5: [], // Ukuran pipa PVC casing sumur
    doc6: []  // Pompa submersible
};

function switchPage(pageId) {
    document.querySelectorAll('.page').forEach(page => {
        page.classList.remove('active');
    });
    
    document.getElementById(pageId).classList.add('active');
    
    document.querySelectorAll('.nav-btn').forEach(btn => {
        btn.classList.remove('active');
    });
    document.getElementById(`nav-${pageId}`).classList.add('active');
}

function formatNumber(num) {
    if (num === null || num === undefined || num === '-') return '-';
    if (typeof num === 'string') {
        if (num === '-') return '-';
        num = parseFloat(num);
        if (isNaN(num)) return '-';
    }
    const formatted = num.toFixed(2);
    return formatted.replace(/\.00$/, '').replace(/(\.[0-9]*[1-9])0+$/, '$1');
}

function showNotification(message, type = 'info', duration = 4000) {
    const existingNotification = document.querySelector('.modern-notification');
    if (existingNotification) {
        existingNotification.remove();
        clearTimeout(notificationTimeout);
    }
    
    const notification = document.createElement('div');
    notification.className = `modern-notification modern-notification-${type}`;
    
    let icon = 'ℹ️';
    if (type === 'success') icon = '✅';
    if (type === 'warning') icon = '⚠️';
    if (type === 'error') icon = '❌';
    
    notification.innerHTML = `
        <div class="notification-content">
            <span class="notification-icon">${icon}</span>
            <span class="notification-message">${message}</span>
        </div>
        <button class="notification-close" onclick="closeNotification(this)">×</button>
    `;
    
    notification.style.cssText = `
        position: fixed;
        top: 24px;
        right: 24px;
        background: white;
        padding: 16px 20px;
        border-radius: 14px;
        box-shadow: 0 10px 25px rgba(0, 0, 0, 0.15);
        display: flex;
        align-items: center;
        justify-content: space-between;
        min-width: 280px;
        max-width: 350px;
        transform: translateX(120%);
        opacity: 0;
        transition: all 0.4s cubic-bezier(0.68, -0.55, 0.265, 1.55);
        z-index: 1000;
        border-left: 4px solid ${type === 'success' ? '#10b981' : type === 'warning' ? '#f59e0b' : type === 'error' ? '#ef4444' : '#3b82f6'};
    `;
    
    document.body.appendChild(notification);
    
    setTimeout(() => {
        notification.style.transform = 'translateX(0)';
        notification.style.opacity = '1';
    }, 10);
    
    notificationTimeout = setTimeout(() => {
        closeNotification(notification.querySelector('.notification-close'));
    }, duration);
    
    const style = document.createElement('style');
    style.textContent = `
        .notification-content {
            display: flex;
            align-items: center;
            gap: 12px;
            flex: 1;
        }
        .notification-icon {
            font-size: 20px;
            flex-shrink: 0;
        }
        .notification-message {
            font-size: 14px;
            color: #1e293b;
            line-height: 1.4;
        }
        .notification-close {
            background: none;
            border: none;
            font-size: 24px;
            color: #64748b;
            cursor: pointer;
            padding: 0;
            width: 24px;
            height: 24px;
            display: flex;
            align-items: center;
            justify-content: center;
            border-radius: 6px;
            margin-left: 10px;
            transition: all 0.2s;
        }
        .notification-close:hover {
            background: #f1f5f9;
            color: #ef4444;
        }
    `;
    document.head.appendChild(style);
}

function closeNotification(button) {
    const notification = button.closest('.modern-notification');
    if (notification) {
        notification.style.transform = 'translateX(120%)';
        notification.style.opacity = '0';
        setTimeout(() => {
            notification.remove();
        }, 400);
    }
    clearTimeout(notificationTimeout);
}

function darkenColor(color, percent) {
    let r = parseInt(color.slice(1, 3), 16);
    let g = parseInt(color.slice(3, 5), 16);
    let b = parseInt(color.slice(5, 7), 16);
    
    r = Math.floor(r * (100 - percent) / 100);
    g = Math.floor(g * (100 - percent) / 100);
    b = Math.floor(b * (100 - percent) / 100);
    
    return `#${r.toString(16).padStart(2, '0')}${g.toString(16).padStart(2, '0')}${b.toString(16).padStart(2, '0')}`;
}

function drawPipaUtama(x, y, width, totalHeight, depth, options = {}) {
    const pipeGradient = ctx.createLinearGradient(x, 0, x + width, 0);
    pipeGradient.addColorStop(0, "#1f2937");
    pipeGradient.addColorStop(0.5, "#6b7280");
    pipeGradient.addColorStop(1, "#1f2937");

    ctx.fillStyle = pipeGradient;
    ctx.beginPath();
    ctx.roundRect(x, y, width, totalHeight, 0);
    ctx.fill();

    ctx.strokeStyle = "#0f172a";
    ctx.lineWidth = 2;
    ctx.stroke();

    ctx.strokeStyle = "rgba(255, 255, 255, 0.2)";
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(x + width/2, y);
    ctx.lineTo(x + width/2, y + totalHeight);
    ctx.stroke();

    ctx.textAlign = "left";
}

function drawSaringan(x, y, width, height, depth, size) {
    const saringanColor = "#8B5A2B";
    
    const gradient = ctx.createLinearGradient(x, y, x, y + height);
    gradient.addColorStop(0, saringanColor);
    gradient.addColorStop(1, darkenColor(saringanColor, 30));

    ctx.fillStyle = gradient;
    ctx.beginPath();
    ctx.rect(x, y, width, height);
    ctx.fill();

    ctx.strokeStyle = darkenColor(saringanColor, 40);
    ctx.lineWidth = 1.5;
    ctx.stroke();

    ctx.strokeStyle = "rgba(255, 255, 255, 0.2)";
    ctx.lineWidth = 0.8;

    const lineSpacing = Math.max(4, height / 15);
    for (let i = lineSpacing; i < height - lineSpacing; i += lineSpacing) {
        ctx.beginPath();
        ctx.moveTo(x + 8, y + i);
        ctx.lineTo(x + width - 8, y + i);
        ctx.stroke();
    }

    const saringanRightX = x + width;
    const lineStartX = saringanRightX + 2;
    const lineEndX = lineStartX + 20;
    const centerY = y + height / 2;

    ctx.strokeStyle = "#000000";
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(lineStartX, centerY);
    ctx.lineTo(lineEndX, centerY);
    ctx.stroke();

    ctx.fillStyle = "#000000";
    ctx.font = "bold 12px Inter";
    ctx.textAlign = "left";
    ctx.textBaseline = "middle";
    
    const labelText = `Saringan (${formatNumber(size)} m)`;
    ctx.fillText(labelText, lineEndX + 4, centerY);

    ctx.fillStyle = "#64748b";
    ctx.font = "10px Inter";
    const saringanEnd = depth + size;
    const detailText = `${formatNumber(depth)} - ${formatNumber(saringanEnd)} m`;
    ctx.fillText(detailText, lineEndX + 4, centerY + 15);

    ctx.fillStyle = "#8B5A2B";
    ctx.beginPath();
    ctx.arc(lineEndX, centerY, 3, 0, Math.PI * 2);
    ctx.fill();

    let info = `Saringan: ${formatNumber(depth)} m - ${formatNumber(saringanEnd)} m (${formatNumber(size)} m)`;
    if (groundLevelSet) {
        const relativeStart = depth - groundLevel;
        const relativeEnd = saringanEnd - groundLevel;
        info += `\nRelatif ke tanah: ${formatNumber(relativeStart)} m - ${formatNumber(relativeEnd)} m`;
    }
    
    components.push({
        type: "saringan",
        x, y, width, height, 
        depth, size,
        start: depth,
        end: depth + size,
        info: info
    });
}

function drawOpenHole(x, y, width, height) {
    const openHoleColor = "#10b981";
    
    ctx.fillStyle = openHoleColor;
    ctx.beginPath();
    ctx.rect(x, y, width, height);
    ctx.fill();

    ctx.fillStyle = "rgba(255, 255, 255, 0.2)";
    const patternSize = 4;
    
    for (let i = 0; i < width; i += patternSize * 2) {
        for (let j = 0; j < height; j += patternSize * 2) {
            if ((i + j) % (patternSize * 4) === 0) {
                ctx.beginPath();
                ctx.arc(x + i, y + j, 1, 0, Math.PI * 2);
                ctx.fill();
            }
        }
    }

    ctx.strokeStyle = "#047857";
    ctx.lineWidth = 2;
    ctx.stroke();

    ctx.strokeStyle = "#a7f3d0";
    ctx.lineWidth = 1;
    ctx.strokeRect(x + 2, y + 2, width - 4, height - 4);

    const lineStartX = x + width;
    const lineEndX = lineStartX + 20;
    const bottomY = y + height;
    
    ctx.strokeStyle = "#000000";
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(lineStartX, bottomY);
    ctx.lineTo(lineEndX, bottomY);
    ctx.stroke();

    ctx.fillStyle = "#000000";
    ctx.font = "bold 12px Inter";
    ctx.textAlign = "left";
    ctx.textBaseline = "middle";

    const labelText = `Open Hole (${formatNumber(openHole.size)} m)`;
    ctx.fillText(labelText, lineEndX + 4, bottomY);

    ctx.fillStyle = "#64748b";
    ctx.font = "10px Inter";
    const detailText = `${formatNumber(openHole.startDepth)} - ${formatNumber(openHole.endDepth)} m`;
    ctx.fillText(detailText, lineEndX + 4, bottomY + 15);

    ctx.fillStyle = "#10b981";
    ctx.beginPath();
    ctx.arc(lineEndX, bottomY, 3, 0, Math.PI * 2);
    ctx.fill();

    let info = `Open Hole: ${formatNumber(openHole.startDepth)} m - ${formatNumber(openHole.endDepth)} m (${formatNumber(openHole.size)} m)`;
    if (groundLevelSet) {
        const relativeStart = openHole.startDepth - groundLevel;
        const relativeEnd = openHole.endDepth - groundLevel;
        info += `\nRelatif ke tanah: ${formatNumber(relativeStart)} m - ${formatNumber(relativeEnd)} m`;
    }
    
    components.push({
        type: "openhole",
        x, y, width, height,
        info: info
    });
}

function drawGroundLevelLine(groundY) {
    if (!groundLevelSet) return;
    
    ctx.setLineDash([5, 5]);
    ctx.strokeStyle = "#d97706";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(20, groundY);
    ctx.lineTo(canvas.width - 20, groundY);
    ctx.stroke();
    
    ctx.setLineDash([]);

    ctx.fillStyle = "#92400e";
    ctx.font = "bold 11px Inter";
    ctx.fillText("Permukaan Tanah", 5, groundY - 8);
}

function drawMATLine(matY) {
    if (!matSet || !groundLevelSet) return;

    ctx.setLineDash([]);
    ctx.strokeStyle = "#3b82f6";
    ctx.lineWidth = 2;

    const startX = 20;
    const endX = canvas.width - 20;

    ctx.beginPath();
    ctx.moveTo(startX, matY);
    ctx.lineTo(endX, matY);
    ctx.stroke();

    drawWaterDropIcon(canvas.width - 30, matY);

    ctx.fillStyle = "#1e40af";
    ctx.font = "10px Inter";

    const matDepthFromGround = matLevel;
    const formattedNumber = formatNumber(matDepthFromGround);
    
    ctx.fillText(`MAT: ${formattedNumber} m dari`, 5, matY + 15);
    ctx.fillText("muka tanah", 5, matY + 30);
}

function drawWaterDropIcon(x, matY) {
    ctx.fillStyle = "#3b82f6";
    ctx.beginPath();
    
    const width = 16;
    const height = 15;
    
    ctx.moveTo(x, matY);                      
    ctx.lineTo(x - width / 2, matY - height);
    ctx.lineTo(x + width / 2, matY - height);
    
    ctx.closePath();
    ctx.fill();
}

function drawTotalPipaLabel(totalPipeLength, firstPipeStart, lastPipeEnd, lastPipeX, lastPipeY, lastPipeHeight) {
    const pipeSegmentsRightX = canvas.width / 2;
    const pipeMaxWidth = Math.max(...pipeSegments.map(p => p.widthPx));
    const lastPipeRightX = pipeSegmentsRightX + (pipeMaxWidth / 2);
    
    const lineStartX = lastPipeRightX + 2;
    const lineEndX = lineStartX + 20;
    const totalPipeY = lastPipeY + lastPipeHeight;
    
    ctx.strokeStyle = "#000000";
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(lineStartX, totalPipeY);
    ctx.lineTo(lineEndX, totalPipeY);
    ctx.stroke();
    
    ctx.fillStyle = "#000000";
    ctx.font = "bold 12px Inter";
    ctx.textAlign = "left";
    ctx.textBaseline = "middle";
    
    const labelX = lineEndX + 4;
    const labelText = `Total Pipa (${formatNumber(totalPipeLength)} m)`;
    ctx.fillText(labelText, labelX, totalPipeY);
    
    ctx.fillStyle = "#64748b";
    ctx.font = "10px Inter";
    const detailText = `${formatNumber(firstPipeStart)} - ${formatNumber(lastPipeEnd)} m`;
    ctx.fillText(detailText, labelX, totalPipeY + 15);
    
    ctx.fillStyle = "#374151";
    ctx.beginPath();
    ctx.arc(lineEndX, totalPipeY, 3, 0, Math.PI * 2);
    ctx.fill();
}

if (!CanvasRenderingContext2D.prototype.roundRect) {
    CanvasRenderingContext2D.prototype.roundRect = function(x, y, width, height, radius) {
        if (width < 2 * radius) radius = width / 2;
        if (height < 2 * radius) radius = height / 2;
        this.beginPath();
        this.moveTo(x + radius, y);
        this.arcTo(x + width, y, x + width, y + height, radius);
        this.arcTo(x + width, y + height, x, y + height, radius);
        this.arcTo(x, y + height, x, y, radius);
        this.arcTo(x, y, x + width, y, radius);
        this.closePath();
        return this;
    }
}

function updateSaringanList() {
    if (saringanPosisi.length === 0) {
        saringanList.innerHTML = '<div style="font-size:12px;color:var(--muted);text-align:center;padding:12px;">Belum ada saringan ditambahkan</div>';
        return;
    }
    
    saringanList.innerHTML = '';
    
    saringanPosisi.sort((a, b) => a.depth - b.depth);
    
    saringanPosisi.forEach((saringan, index) => {
        const saringanEnd = saringan.depth + saringan.size;
        
        let relativeInfo = '';
        if (groundLevelSet) {
            const relativeStart = saringan.depth - groundLevel;
            const relativeEnd = saringanEnd - groundLevel;
            const startDesc = relativeStart >= 0 ? 'di bawah' : 'di atas';
            const endDesc = relativeEnd >= 0 ? 'di bawah' : 'di atas';
            relativeInfo = `<div style="font-size: 11px; margin-top: 2px; color: #64748b;">
                Relatif: ${formatNumber(Math.abs(relativeStart))} m ${startDesc} s/d ${formatNumber(Math.abs(relativeEnd))} m ${endDesc} tanah
            </div>`;
        }
        
        const item = document.createElement('div');
        item.className = 'saringan-item';
        item.innerHTML = `
            <div class="saringan-info">
                <span class="saringan-depth">Posisi: ${formatNumber(saringan.depth)} m - ${formatNumber(saringanEnd)} m</span>
                <span class="saringan-details">Ukuran: ${formatNumber(saringan.size)} m</span>
                ${relativeInfo}
            </div>
            <div class="saringan-delete" onclick="hapusSaringan(${index})">Hapus</div>
        `;
        saringanList.appendChild(item);
    });
}

function updatePipeList() {
    if (pipeSegments.length === 0) {
        pipeList.innerHTML = `<div style="font-size:12px;color:var(--muted);text-align:center;padding:12px;">
            Belum ada pipa dibuat
        </div>`;
        return;
    }

    pipeList.innerHTML = '';

    pipeSegments.sort((a, b) => a.start - b.start);

    pipeSegments.forEach((pipe, index) => {
        let relativeInfo = '';
        if (groundLevelSet) {
            const relativeStart = pipe.start - groundLevel;
            const relativeEnd = pipe.end - groundLevel;
            const startDesc = relativeStart >= 0 ? 'di bawah' : 'di atas';
            const endDesc = relativeEnd >= 0 ? 'di bawah' : 'di atas';
            relativeInfo = `<div style="font-size: 11px; margin-top: 2px; color: #64748b;">
                Relatif: ${formatNumber(Math.abs(relativeStart))} m ${startDesc} s/d ${formatNumber(Math.abs(relativeEnd))} m ${endDesc} tanah
            </div>`;
        }
        
        const item = document.createElement('div');
        item.className = 'pipe-item';

        item.innerHTML = `
            <div class="pipe-info">
                <span class="pipe-segment"><strong>Pipa ${index + 1}</strong> (${pipe.diameter}")</span>
                <span class="pipe-range">Kedalaman: ${formatNumber(pipe.start)} m – ${formatNumber(pipe.end)} m</span>
                ${relativeInfo}
            </div>
            <div class="pipe-delete" onclick="hapusPipa(${index})">Hapus</div>
        `;

        pipeList.appendChild(item);
    });
}

function updateGroundLevelInfo() {
    const groundLevelInfo = document.getElementById("groundLevelInfo");
    const groundLevelStatus = document.getElementById("groundLevelStatus");
    const groundLevelDetails = document.getElementById("groundLevelDetails");
    
    if (!groundLevelSet) {
        groundLevelInfo.classList.remove('active');
        groundLevelStatus.textContent = "Belum diatur";
        groundLevelStatus.className = "groundlevel-status inactive";
        groundLevelDetails.innerHTML = `
            <div style="margin-top: 8px;">
                <div style="margin-bottom: 4px;">• Titik acuan relatif terhadap sistem koordinat pipa</div>
                <div>• Bisa negatif (di atas pipa) atau positif (di bawah pipa)</div>
                <div>• Contoh: -2.5 = tanah 2.5m di atas ujung atas pipa</div>
            </div>
        `;
        return;
    }
    
    groundLevelInfo.classList.add('active');
    groundLevelStatus.textContent = "Aktif";
    groundLevelStatus.className = "groundlevel-status active";
    
    let positionDesc = "";
    
    if (groundLevel < 0) {
        positionDesc = `<span style="color: #dc2626;">${formatNumber(Math.abs(groundLevel))} m di atas muka tanah</span>`;
    } else if (groundLevel > 0) {
        positionDesc = `<span style="color: #059669;">${formatNumber(groundLevel)} m di bawah muka tanah</span>`;
    } else {
        positionDesc = "sama dengan muka tanah";
    }
    
    let pipePositionInfo = "";
    if (pipeSegments.length > 0) {
        const firstPipe = pipeSegments[0];
        const lastPipe = pipeSegments[pipeSegments.length - 1];
        const pipeTopRel = firstPipe.start - groundLevel;
        const pipeBottomRel = lastPipe.end - groundLevel;
        
        pipePositionInfo = `
            <div style="margin-top: 8px; padding: 8px; background: #f8fafc; border-radius: 6px; border-left: 3px solid #3b82f6;">
                <div style="font-size: 11px; font-weight: 600; margin-bottom: 4px;">Posisi Pipa:</div>
                <div style="font-size: 10px; line-height: 1.4;">
                    <div>• Ujung atas: ${formatNumber(pipeTopRel)} m dari muka tanah ${pipeTopRel >= 0 ? '(di bawah)' : '(di atas)'}</div>
                    <div>• Ujung bawah: ${formatNumber(pipeBottomRel)} m dari muka tanah ${pipeBottomRel >= 0 ? '(di bawah)' : '(di atas)'}</div>
                </div>
            </div>
        `;
    }
    
    groundLevelDetails.innerHTML = `
        <div style="margin-top: 8px;">
            <div style="margin-bottom: 4px; font-weight: 600;">Titik Acuan: ${formatNumber(groundLevel)} m</div>
            <div style="font-size: 12px; margin-bottom: 8px;">${positionDesc}</div>
            ${pipePositionInfo}
            <button onclick="hapusGroundLevel()" class="btn-secondary" style="margin-top: 10px; padding: 6px 12px; font-size: 12px; width: 100%;">
                Hapus Titik Acuan
            </button>
        </div>
    `;
}

function updateMATInfo() {
    const matInfo = document.getElementById("matInfo");
    const matStatus = document.getElementById("matStatus");
    const matDetails = document.getElementById("matDetails");
    
    if (!matSet) {
        matInfo.classList.remove('active');
        matStatus.textContent = "Belum diatur";
        matStatus.className = "mat-status inactive";
        matDetails.innerHTML = `
            <div style="margin-top: 8px;">
                <div style="margin-bottom: 4px;">• Muka Air Tanah (MAT) relatif terhadap permukaan tanah</div>
                <div>• Nilai positif = di bawah permukaan tanah</div>
                <div>• Nilai negatif = di atas permukaan tanah (artesis)</div>
                <div>• Contoh: 2.5 = MAT 2.5m di bawah permukaan tanah</div>
            </div>
        `;
        return;
    }
    
    matInfo.classList.add('active');
    matStatus.textContent = "Aktif";
    matStatus.className = "mat-status active";
    
    let matDescription = "";
    const absoluteMATDepth = groundLevel + matLevel;
    
    if (matLevel > 0) {
        matDescription = `<span style="color: #1d4ed8;">${formatNumber(matLevel)} m di bawah permukaan tanah</span>`;
    } else if (matLevel < 0) {
        matDescription = `<span style="color: #dc2626;">${formatNumber(Math.abs(matLevel))} m di atas permukaan tanah (artesis)</span>`;
    } else {
        matDescription = "sama dengan permukaan tanah";
    }
    
    let pipeRelationInfo = "";
    if (pipeSegments.length > 0) {
        const firstPipe = pipeSegments[0];
        const lastPipe = pipeSegments[pipeSegments.length - 1];
        const matRelToPipeTop = absoluteMATDepth - firstPipe.start;
        const matRelToPipeBottom = absoluteMATDepth - lastPipe.end;
        
        pipeRelationInfo = `
            <div style="margin-top: 8px; padding: 8px; background: #eff6ff; border-radius: 6px; border-left: 3px solid #3b82f6;">
                <div style="font-size: 11px; font-weight: 600; margin-bottom: 4px; color: #1d4ed8;">Posisi MAT terhadap Pipa:</div>
                <div style="font-size: 10px; line-height: 1.4; color: #1e40af;">
                    <div>• Dari ujung atas pipa: ${formatNumber(matRelToPipeTop)} m ${matRelToPipeTop >= 0 ? 'di bawah' : 'di atas'}</div>
                    <div>• Dari ujung bawah pipa: ${formatNumber(matRelToPipeBottom)} m ${matRelToPipeBottom >= 0 ? 'di bawah' : 'di atas'}</div>
                </div>
            </div>
        `;
    }
    
    matDetails.innerHTML = `
        <div style="margin-top: 8px;">
            <div style="margin-bottom: 4px; font-weight: 600;">Muka Air Tanah: ${formatNumber(matLevel)} m</div>
            <div style="font-size: 12px; margin-bottom: 8px;">${matDescription}</div>
            <div style="font-size: 11px; color: #64748b; margin-bottom: 8px;">
                Posisi absolut: ${formatNumber(absoluteMATDepth)} m (dalam sistem koordinat)
            </div>
            ${pipeRelationInfo}
            <button onclick="hapusMAT()" class="btn-secondary" style="margin-top: 10px; padding: 6px 12px; font-size: 12px; width: 100%; background: #eff6ff; color: #1d4ed8; border-color: #bfdbfe;">
                Hapus MAT
            </button>
        </div>
    `;
}

function updateOpenHoleInfo() {
    if (!openHole) {
        openHoleInfo.classList.remove('active');
        openHoleStatus.textContent = "Belum diatur";
        openHoleStatus.className = "openhole-status inactive";
        openHoleDetails.innerHTML = `
            <div style="margin-top: 8px;">
                <div style="margin-bottom: 4px;">• Open hole adalah bagian terbuka di bawah pipa terakhir</div>
                <div>• Diukur dari ujung bawah pipa ke atas</div>
                <div>• Pastikan tidak ada saringan di area open hole</div>
            </div>
        `;
        return;
    }

    openHoleInfo.classList.add('active');
    openHoleStatus.textContent = "Aktif";
    openHoleStatus.className = "openhole-status active";
    
    let relativeInfo = '';
    if (groundLevelSet) {
        const relativeStart = openHole.startDepth - groundLevel;
        const relativeEnd = openHole.endDepth - groundLevel;
        relativeInfo = `
            <div style="font-size: 11px; margin-top: 4px; color: #64748b;">
                Relatif ke tanah: ${formatNumber(relativeStart)} m - ${formatNumber(relativeEnd)} m
            </div>
        `;
    }
    
    openHoleDetails.innerHTML = `
        <div class="openhole-item">
            <div class="openhole-info-details">
                <span class="openhole-depth">Open Hole: ${formatNumber(openHole.startDepth)} m - ${formatNumber(openHole.endDepth)} m</span>
                <span class="openhole-description">Ukuran: ${formatNumber(openHole.size)} m (di bawah pipa)</span>
                ${relativeInfo}
            </div>
            <div class="openhole-delete" onclick="hapusOpenHole()">Hapus</div>
        </div>
    `;
}

function updateBoreholeDepthLabels() {
    const depthPipeStart = document.getElementById('depthPipeStart');
    if (depthPipeStart) {
        if (pipeSegments.length > 0) {
            const firstPipe = pipeSegments[0];
            let depthValue = firstPipe.start;
            
            if (groundLevelSet) {
                depthValue = firstPipe.start - groundLevel;
                if (depthValue > 0) {
                    depthPipeStart.textContent = `${formatNumber(depthValue)} m.bmt`;
                } else if (depthValue < 0) {
                    depthPipeStart.textContent = `${formatNumber(Math.abs(depthValue))} m di atas tanah`;
                } else {
                    depthPipeStart.textContent = `0 m.bmt`;
                }
            } else {
                depthPipeStart.textContent = `${formatNumber(depthValue)} m`;
            }
        } else {
            depthPipeStart.textContent = '-';
        }
    }

    const depthPipeEnd = document.getElementById('depthPipeEnd');
    if (depthPipeEnd) {
        if (pipeSegments.length > 0) {
            const lastPipe = pipeSegments[pipeSegments.length - 1];
            let depthValue = lastPipe.end;
            
            if (groundLevelSet) {
                depthValue = lastPipe.end - groundLevel;
                if (depthValue > 0) {
                    depthPipeEnd.textContent = `${formatNumber(depthValue)} m.bmt`;
                } else if (depthValue < 0) {
                    depthPipeEnd.textContent = `${formatNumber(Math.abs(depthValue))} m di atas tanah`;
                } else {
                    depthPipeEnd.textContent = `0 m.bmt`;
                }
            } else {
                depthPipeEnd.textContent = `${formatNumber(depthValue)} m`;
            }
        } else {
            depthPipeEnd.textContent = '-';
        }
    }

    const depthScreen = document.getElementById('depthScreen');
    if (depthScreen) {
        if (saringanPosisi.length > 0) {
            const firstScreen = saringanPosisi[0];
            let depthValue = firstScreen.depth;
            
            if (groundLevelSet) {
                depthValue = firstScreen.depth - groundLevel;
                if (depthValue > 0) {
                    depthScreen.textContent = `${formatNumber(depthValue)} m.bmt`;
                } else if (depthValue < 0) {
                    depthScreen.textContent = `${formatNumber(Math.abs(depthValue))} m di atas tanah`;
                } else {
                    depthScreen.textContent = `0 m.bmt`;
                }
            } else {
                depthScreen.textContent = `${formatNumber(depthValue)} m`;
            }
        } else {
            depthScreen.textContent = '-';
        }
    }

    const depthBottom = document.getElementById('depthBottom');
    if (depthBottom) {
        if (currentDepth > 0) {
            let depthValue = currentDepth;
            if (openHole) {
                depthValue = openHole.endDepth;
            }
            
            if (groundLevelSet) {
                depthValue = depthValue - groundLevel;
                if (depthValue > 0) {
                    depthBottom.textContent = `${formatNumber(depthValue)} m.bmt`;
                } else if (depthValue < 0) {
                    depthBottom.textContent = `${formatNumber(Math.abs(depthValue))} m di atas tanah`;
                } else {
                    depthBottom.textContent = `0 m.bmt`;
                }
            } else {
                depthBottom.textContent = `${formatNumber(depthValue)} m`;
            }
        } else {
            depthBottom.textContent = '-';
        }
    }
    
    const depthMAT = document.getElementById('depthMAT');
    if (depthMAT) {
        if (matSet) {
            if (matLevel > 0) {
                depthMAT.textContent = `${formatNumber(matLevel)} m.bmt`;
            } else if (matLevel < 0) {
                depthMAT.textContent = `${formatNumber(Math.abs(matLevel))} m di atas tanah (artesis)`;
            } else {
                depthMAT.textContent = `0 m.bmt`;
            }
        } else {
            depthMAT.textContent = '-';
        }
    }
}

function updateDetailInfo(minDepth, maxDepth) {
    const saringanDetails = saringanPosisi.length
        ? saringanPosisi
            .sort((a, b) => a.depth - b.depth)
            .map(s => {
                const saringanEnd = s.depth + s.size;
                let info = `${formatNumber(s.depth)} m - ${formatNumber(saringanEnd)} m`;
                if (groundLevelSet) {
                    const relStart = s.depth - groundLevel;
                    const relEnd = saringanEnd - groundLevel;
                    info += ` (${formatNumber(relStart)}-${formatNumber(relEnd)} m relatif)`;
                }
                return info;
            })
            .join(', ')
        : '-';

    let openHoleDetail = openHole 
        ? `${formatNumber(openHole.startDepth)} m - ${formatNumber(openHole.endDepth)} m` 
        : '-';

    if (openHole && groundLevelSet) {
        const relStart = openHole.startDepth - groundLevel;
        const relEnd = openHole.endDepth - groundLevel;
        openHoleDetail += ` (${formatNumber(relStart)}-${formatNumber(relEnd)} m relatif)`;
    }

    let detailHTML = `<strong>Detail Pipa Sumur Bor:</strong>`;
    
    if (pipeSegments.length > 0) {
        const firstPipe = pipeSegments[0];
        const lastPipe = pipeSegments[pipeSegments.length - 1];
        
        const totalPipeLength = pipeSegments.reduce((total, pipe) => {
            return total + (pipe.end - pipe.start);
        }, 0);
        
        detailHTML += `<div>• Sistem koordinat: ${formatNumber(minDepth)} m s/d ${formatNumber(maxDepth)} m</div>`;
        detailHTML += `<div>• Total panjang pipa: ${formatNumber(totalPipeLength)} m</div>`;
        detailHTML += `<div>• Kedalaman total: ${formatNumber(currentDepth)} m</div>`;
        
        if (groundLevelSet) {
            const pipeTopRel = firstPipe.start - groundLevel;
            const pipeBottomRel = lastPipe.end - groundLevel;
            
            detailHTML += `<div>• Pipa relatif ke tanah: ${formatNumber(pipeTopRel)} m s/d ${formatNumber(pipeBottomRel)} m</div>`;
            
            if (pipeTopRel < 0) {
                detailHTML += `<div>• Pipa memanjang ${formatNumber(Math.abs(pipeTopRel))} m di atas tanah</div>`;
            }
        }
    }
    
    if (groundLevelSet) {
        detailHTML += `<div>• Permukaan tanah: ${formatNumber(groundLevel)} m (dalam sistem koordinat)</div>`;
        
        if (groundLevel < 0) {
            detailHTML += `<div>• Tanah berada ${formatNumber(Math.abs(groundLevel))} m di atas muka tanah</div>`;
        }
    }
    
    if (matSet) {
        const absoluteMATDepth = groundLevel + matLevel;
        detailHTML += `<div>• Muka Air Tanah: ${formatNumber(matLevel)} m dari muka tanah`;
        detailHTML += ` (${formatNumber(absoluteMATDepth)} m dalam sistem)`;
        if (matLevel > 0) {
            detailHTML += ` - di bawah muka tanah</div>`;
        } else if (matLevel < 0) {
            detailHTML += ` - di atas muka tanah (artesis)</div>`;
        } else {
            detailHTML += ` - sama dengan muka tanah</div>`;
        }
    }
    
    if (pipeSegments.length > 0) {
        detailHTML += `<div>• Jumlah segmen pipa: ${pipeSegments.length}</div>`;
        detailHTML += `<div>• Jumlah saringan: ${saringanPosisi.length} unit</div>`;
        
        if (saringanPosisi.length > 0) {
            detailHTML += `<div>• Posisi saringan: ${saringanDetails}</div>`;
        }
        
        if (openHole) {
            detailHTML += `<div>• Open hole: ${openHoleDetail} (${formatNumber(openHole.size)} m di bawah pipa)</div>`;
        }
    } else {
        detailHTML += `<div>• Belum ada pipa dibuat</div>`;
    }
    
    detailInfo.innerHTML = detailHTML;
}

function setGroundLevel() {
    const groundLevelValue = parseFloat(groundLevelInput.value);
    
    if (isNaN(groundLevelValue)) {
        showNotification("Masukkan titik acuan permukaan tanah yang valid", "error", 3000);
        return;
    }
    
    if (groundLevelValue < -50 || groundLevelValue > 100) {
        showNotification("Titik acuan antara -50m sampai 100m", "error", 3000);
        return;
    }
    
    groundLevel = groundLevelValue;
    groundLevelSet = true;
    
    updateGroundLevelInfo();
    drawVisualization();
    updatePipeList();
    updateSaringanList();
    updateBoreholeDepthLabels();
    
    let positionDesc = "";
    if (groundLevel < 0) {
        positionDesc = `${formatNumber(Math.abs(groundLevel))} m di atas muka tanah`;
    } else if (groundLevel > 0) {
        positionDesc = `${formatNumber(groundLevel)} m di bawah muka tanah`;
    } else {
        positionDesc = "sama dengan muka tanah";
    }
    
    showNotification(`Titik acuan permukaan tanah ditetapkan: ${formatNumber(groundLevel)} m (${positionDesc})`, "success", 4000);
}

function hapusGroundLevel() {
    if (!groundLevelSet) return;
    
    groundLevel = 0;
    groundLevelSet = false;
    if (matSet) {
        matLevel = null;
        matSet = false;
        updateMATInfo();
    }
    updateGroundLevelInfo();
    drawVisualization();
    updateBoreholeDepthLabels();
    
    showNotification("Titik acuan permukaan tanah berhasil dihapus", "success", 3000);
}

function setMAT() {
    if (!groundLevelSet) {
        showNotification("Atur titik acuan permukaan tanah terlebih dahulu", "warning", 3000);
        return;
    }
    
    const matValue = parseFloat(matInput.value);
    
    if (isNaN(matValue)) {
        showNotification("Masukkan level muka air tanah yang valid", "error", 3000);
        return;
    }
    
    if (matValue < -20 || matValue > 100) {
        showNotification("MAT antara -20m sampai 100m dari permukaan tanah", "error", 3000);
        return;
    }
    
    matLevel = matValue;
    matSet = true;
    
    updateMATInfo();
    drawVisualization();
    updateBoreholeDepthLabels();
    
    let matDesc = "";
    
    if (matLevel > 0) {
        matDesc = `${formatNumber(matLevel)} m di bawah permukaan tanah`;
    } else if (matLevel < 0) {
        matDesc = `${formatNumber(Math.abs(matLevel))} m di atas permukaan tanah (artesis)`;
    } else {
        matDesc = "sama dengan permukaan tanah";
    }
    
    showNotification(`Muka Air Tanah ditetapkan: ${formatNumber(matLevel)} m dari muka tanah (${matDesc})`, "success", 4000);
}

function hapusMAT() {
    if (!matSet) return;
    
    matLevel = null;
    matSet = false;
    updateMATInfo();
    drawVisualization();
    updateBoreholeDepthLabels();
    
    showNotification("Muka Air Tanah berhasil dihapus", "success", 3000);
}

function hapusPipa(index) {
    const deletedSegment = pipeSegments[index];
    
    let deletedSaringanCount = 0;
    const deletedSaringanDepths = [];
    
    for (let i = saringanPosisi.length - 1; i >= 0; i--) {
        const saringanEnd = saringanPosisi[i].depth + saringanPosisi[i].size;
        if (saringanPosisi[i].depth >= deletedSegment.start && 
            saringanEnd <= deletedSegment.end) {
            deletedSaringanDepths.push(saringanPosisi[i].depth);
            saringanPosisi.splice(i, 1);
            deletedSaringanCount++;
        }
    }
    
    pipeSegments.splice(index, 1);
    
    if (pipeSegments.length > 0) {
        let currentStart = pipeSegments[0].start;
        for (let i = 0; i < pipeSegments.length; i++) {
            const segmentLength = pipeSegments[i].end - pipeSegments[i].start;
            pipeSegments[i].start = currentStart;
            pipeSegments[i].end = currentStart + segmentLength;
            currentStart = pipeSegments[i].end;
        }
        currentDepth = pipeSegments[pipeSegments.length - 1].end;
    } else {
        currentDepth = 0;
        openHole = null;
        updateOpenHoleInfo();
    }
    
    drawVisualization();
    updatePipeList();
    updateSaringanList();
    updateBoreholeDepthLabels();
    
    let notificationMessage = `Segmen pipa ke-${index + 1} berhasil dihapus`;
    if (deletedSaringanCount > 0) {
        notificationMessage += ` (${deletedSaringanCount} saringan ikut terhapus: ${deletedSaringanDepths.map(d => `${formatNumber(d)} m`).join(', ')})`;
    }
    showNotification(notificationMessage, 'success', 4000);
}

function updateVisualization() {
    const depth = parseFloat(depthInput.value);
    const diameterInch = parseFloat(pipeDiameter.value);

    if (!depth || depth <= 0) {
        showNotification("Masukkan panjang pipa yang valid", "error");
        return;
    }

    if (!diameterInch || diameterInch <= 0) {
        showNotification("Masukkan diameter pipa yang valid", "error");
        return;
    }

    let startDepth;
    if (pipeSegments.length === 0) {
        startDepth = 0;
    } else {
        startDepth = currentDepth;
    }
    
    const endDepth = startDepth + depth;

    pipeSegments.push({
        start: startDepth,
        end: endDepth,
        diameter: diameterInch,
        widthPx: diameterInch * inchToPixel
    });

    currentDepth = endDepth;

    drawVisualization();
    updatePipeList();
    updateBoreholeDepthLabels();

    depthInput.value = "";
    pipeDiameter.value = "";

    let message = `Pipa ${diameterInch}" ditambahkan: ${formatNumber(startDepth)} m – ${formatNumber(endDepth)} m`;
    if (groundLevelSet) {
        const pipeTopRel = startDepth - groundLevel;
        const pipeBottomRel = endDepth - groundLevel;
        message += `\n(Posisi relatif: ${formatNumber(pipeTopRel)} m s/d ${formatNumber(pipeBottomRel)} m dari muka tanah)`;
    }
    showNotification(message, "success", 4000);
}

function addSaringan() {
    if (pipeSegments.length === 0) {
        showNotification("Buat pipa terlebih dahulu dengan mengisi kedalaman dan klik 'Tambah Pipa'", 'warning', 3000);
        return;
    }

    const depth = parseFloat(saringanDepth.value);
    const size = parseFloat(saringanSize.value);

    if (isNaN(depth) || depth < 0) {
        showNotification(`Masukkan kedalaman yang valid (0-${formatNumber(currentDepth)} m)`, 'error', 3000);
        return;
    }

    if (isNaN(size) || size <= 0) {
        showNotification(`Masukkan ukuran saringan yang valid (>0 m)`, 'error', 3000);
        return;
    }

    const saringanStart = depth;
    const saringanEnd = depth + size;

    if (saringanStart < 0) {
        showNotification(`Saringan tidak boleh dimulai dari kedalaman negatif`, 'error', 3000);
        return;
    }

    if (saringanEnd > currentDepth) {
        showNotification(`Saringan melebihi batas bawah pipa. Batas pipa: ${formatNumber(currentDepth)} m`, 'error', 4000);
        return;
    }

    for (const existingSaringan of saringanPosisi) {
        const existingStart = existingSaringan.depth;
        const existingEnd = existingSaringan.depth + existingSaringan.size;

        if (saringanEnd > existingStart && saringanStart < existingEnd) {
            showNotification(`Saringan tumpang tindih dengan saringan di ${formatNumber(existingStart)}-${formatNumber(existingEnd)} m`, 'error', 4000);
            return;
        }
    }

    if (openHole) {
        if (saringanEnd > openHole.startDepth) {
            showNotification(`Saringan tidak boleh masuk ke area open hole. Open hole mulai dari ${formatNumber(openHole.startDepth)} m`, 'error', 4000);
            return;
        }
        
        const distanceToOpenHole = openHole.startDepth - saringanEnd;
        if (distanceToOpenHole > 0 && distanceToOpenHole < 0.1) {
            showNotification(`Saringan ditempatkan ${formatNumber(distanceToOpenHole)} m di atas open hole`, 'info', 3000);
        }
    }

    saringanPosisi.push({ depth, size });
    
    saringanPosisi.sort((a, b) => a.depth - b.depth);
    
    saringanDepth.value = '';
    saringanSize.value = '3';

    updateSaringanList();
    drawVisualization();
    updateBoreholeDepthLabels();

    let message = `✅ Saringan berhasil ditambahkan: ${formatNumber(saringanStart)}-${formatNumber(saringanEnd)} m (ukuran: ${formatNumber(size)} m)`;
    
    if (groundLevelSet) {
        const relativeStart = depth - groundLevel;
        const relativeEnd = saringanEnd - groundLevel;
        message += `\n📏 Posisi relatif: ${formatNumber(relativeStart)}-${formatNumber(relativeEnd)} m dari tanah`;
    }
    
    if (openHole) {
        const distanceToOpenHole = openHole.startDepth - saringanEnd;
        if (distanceToOpenHole > 0) {
            message += `\n📐 Jarak ke open hole: ${formatNumber(distanceToOpenHole)} m`;
        } else if (distanceToOpenHole === 0) {
            message += `\n🔗 Tepat di atas open hole`;
        }
    }
    
    showNotification(message, 'success', 5000);
}

function hapusSaringan(index) {
    const saringan = saringanPosisi[index];
    const saringanEnd = saringan.depth + saringan.size;
    saringanPosisi.splice(index, 1);
    updateSaringanList();
    drawVisualization();
    updateBoreholeDepthLabels();
    showNotification(`Saringan di posisi ${formatNumber(saringan.depth)} m - ${formatNumber(saringanEnd)} m berhasil dihapus`, 'success', 3000);
}

function setOpenHole() {
    if (pipeSegments.length === 0) {
        showNotification("Buat pipa terlebih dahulu sebelum mengatur open hole", 'warning', 3000);
        return;
    }

    const depth = parseFloat(openHoleDepth.value);

    if (!depth || depth <= 0) {
        showNotification("Masukkan ukuran open hole yang valid (angka positif dalam meter)", 'error', 3000);
        return;
    }

    const pipeBottom = currentDepth;
    const openHoleStartDepth = pipeBottom;
    const openHoleEndDepth = pipeBottom + depth;

    for (const saringan of saringanPosisi) {
        const saringanEnd = saringan.depth + saringan.size;
        
        if (saringanEnd >= openHoleStartDepth) {
            showNotification(`Terdapat saringan di posisi ${formatNumber(saringan.depth)} m - ${formatNumber(saringanEnd)} m yang bertabrakan dengan open hole`, 'error', 4000);
            return;
        }
    }

    if (depth > 100) {
        showNotification("Open hole terlalu besar! Maksimal 100m dari ujung pipa", 'warning', 3000);
        return;
    }

    openHole = {
        depth: depth,
        startDepth: openHoleStartDepth,
        endDepth: openHoleEndDepth,
        size: depth
    };

    openHoleDepth.value = '';
    updateOpenHoleInfo();
    drawVisualization();
    updateBoreholeDepthLabels();

    let message = `Open hole berhasil diatur: ${formatNumber(depth)} m di bawah ujung pipa`;
    message += `\nPosisi: ${formatNumber(openHoleStartDepth)} m - ${formatNumber(openHoleEndDepth)} m`;
    
    if (groundLevelSet) {
        const relativeStart = openHole.startDepth - groundLevel;
        const relativeEnd = openHole.endDepth - groundLevel;
        message += `\n(Posisi relatif terhadap tanah: ${formatNumber(relativeStart)} m s/d ${formatNumber(relativeEnd)} m)`;
    }
    
    showNotification(message, 'success', 4000);
}

function hapusOpenHole() {
    if (!openHole) return;
    
    openHole = null;
    updateOpenHoleInfo();
    drawVisualization();
    updateBoreholeDepthLabels();
    
    showNotification("Open hole berhasil dihapus", 'success', 3000);
}

function drawVisualization() {
    components = [];

    const MIN_CANVAS_HEIGHT = 600;
    const EXTRA_HEIGHT_PER_100M = 150;

    let maxDepthInSystem = currentDepth;
    let minDepthInSystem = 0;
    
    if (openHole) {
        maxDepthInSystem = Math.max(maxDepthInSystem, openHole.endDepth);
    }
    
    if (groundLevelSet) {
        maxDepthInSystem = Math.max(maxDepthInSystem, groundLevel);
        minDepthInSystem = Math.min(0, groundLevel);
        
        if (matSet) {
            const absoluteMATDepth = groundLevel + matLevel;
            maxDepthInSystem = Math.max(maxDepthInSystem, absoluteMATDepth);
            minDepthInSystem = Math.min(minDepthInSystem, absoluteMATDepth);
        }
        
        if (groundLevel < 0) {
            minDepthInSystem = groundLevel;
        }
    }
    
    const totalDepthRange = maxDepthInSystem - minDepthInSystem;
    
    canvas.height = Math.max(
        MIN_CANVAS_HEIGHT,
        (totalDepthRange / 100) * EXTRA_HEIGHT_PER_100M + 300
    );

    ctx.clearRect(0, 0, canvas.width, canvas.height);

    if (currentDepth === 0 && !groundLevelSet && !matSet) {
        detailInfo.innerHTML = `
            <strong>Instruksi Penggunaan:</strong>
            <div>1. Masukkan kedalaman pipa (misal: 45m)</div>
            <div>2. Atur titik acuan permukaan tanah (jika ada)</div>
            <div>3. Atur muka air tanah (MAT) jika diketahui</div>
            <div>4. Klik "Tambah Pipa" untuk membuat pipa</div>
            <div>5. Masukkan kedalaman dan ukuran saringan</div>
            <div>6. Klik "Tambah Saringan" untuk menambah</div>
            <div>7. Atur open hole (opsional) di bagian bawah</div>
            <div>8. Klik "Reset Semua" untuk mulai ulang</div>
        `;
        hoverDetails.innerHTML = "Buat pipa terlebih dahulu";
        return;
    }

    const usableHeight = canvas.height - TOP_MARGIN - BOTTOM_MARGIN;
    const scale = usableHeight / totalDepthRange;

    if (matSet && groundLevelSet) {
        const absoluteMATDepth = groundLevel + matLevel;
        const matY = TOP_MARGIN + (absoluteMATDepth - minDepthInSystem) * scale;
        drawMATLine(matY);
    }

    if (groundLevelSet) {
        const groundY = TOP_MARGIN + (groundLevel - minDepthInSystem) * scale;
        drawGroundLevelLine(groundY);
    }

    ctx.setLineDash([]);
    ctx.font = "12px Inter";
    ctx.fillStyle = "#334155";
    ctx.strokeStyle = "#475569";
    ctx.lineWidth = 1;

    let lastLabelY = -Infinity;
    const MIN_LABEL_DISTANCE = 25;

    for (let m = Math.floor(minDepthInSystem); m <= Math.ceil(maxDepthInSystem); m++) {
        const y = TOP_MARGIN + (m - minDepthInSystem) * scale;

        ctx.beginPath();
        ctx.moveTo(canvas.width/2 - 15, y);
        ctx.lineTo(canvas.width/2 - 5, y);
        ctx.stroke();

        if (m % SCALE_STEP === 0 && y - lastLabelY > MIN_LABEL_DISTANCE) {
            let label = `${formatNumber(m)} m`;
            ctx.fillStyle = "#334155";
            ctx.fillText(label, canvas.width/2 - 60, y + 4);

            ctx.beginPath();
            ctx.moveTo(canvas.width/2 - 25, y);
            ctx.lineTo(canvas.width/2 - 5, y);
            ctx.stroke();

            lastLabelY = y;
        }
    }

    if (pipeSegments.length > 0) {
        const totalPipeLength = pipeSegments.reduce((total, pipe) => {
            return total + (pipe.end - pipe.start);
        }, 0);
        
        const firstPipeStart = pipeSegments[0].start;
        const lastPipeEnd = pipeSegments[pipeSegments.length - 1].end;
        
        const lastPipe = pipeSegments[pipeSegments.length - 1];
        const lastPipeY = TOP_MARGIN + (lastPipe.start - minDepthInSystem) * scale;
        const lastPipeHeight = (lastPipe.end - lastPipe.start) * scale;
        const lastPipeX = canvas.width / 2 - lastPipe.widthPx / 2;
        
        drawTotalPipaLabel(totalPipeLength, firstPipeStart, lastPipeEnd, lastPipeX, lastPipeY, lastPipeHeight);

        pipeSegments.forEach((pipe, index) => {
            const segmentHeight = pipe.end - pipe.start;
            const y = TOP_MARGIN + (pipe.start - minDepthInSystem) * scale;
            const heightPx = segmentHeight * scale;
            const x = canvas.width / 2 - pipe.widthPx / 2;

            drawPipaUtama(x, y, pipe.widthPx, heightPx, pipe.end, {
                showTopIndicator: index === 0,
                showBottomIndicator: index === pipeSegments.length - 1
            });

            pipe._render = { 
                x, 
                y, 
                height: heightPx,
                start: pipe.start,
                end: pipe.end
            };
            
            const pipeSize = pipe.end - pipe.start;
            let pipeInfo = `Pipa ${pipe.diameter}" - ${formatNumber(pipe.start)} m s/d ${formatNumber(pipe.end)} m (${formatNumber(pipeSize)} m)`;
            if (groundLevelSet) {
                const relativeStart = pipe.start - groundLevel;
                const relativeEnd = pipe.end - groundLevel;
                pipeInfo += `\nRelatif: ${formatNumber(relativeStart)} m s/d ${formatNumber(relativeEnd)} m dari muka tanah`;
            }
            
            components.push({
                type: "pipe",
                x, y, width: pipe.widthPx, height: heightPx,
                info: pipeInfo
            });
        });

        if (openHole && pipeSegments.length > 0) {
            const openHoleStartY = TOP_MARGIN + (openHole.startDepth - minDepthInSystem) * scale;
            const openHoleHeightPx = openHole.size * scale;
            const lastPipe = pipeSegments[pipeSegments.length - 1];
            
            drawOpenHole(lastPipe._render.x, openHoleStartY, lastPipe.widthPx, openHoleHeightPx);
        }

        saringanPosisi.forEach(saringan => {
            const pipe = pipeSegments.find(p => {
                const saringanEnd = saringan.depth + saringan.size;
                return saringan.depth >= p.start && saringanEnd <= p.end;
            });

            if (!pipe || !pipe._render) return;

            const topY = TOP_MARGIN + (saringan.depth - minDepthInSystem) * scale;
            const saringanHeightPx = saringan.size * scale;

            drawSaringan(pipe._render.x, topY, pipe.widthPx, saringanHeightPx, saringan.depth, saringan.size);
        });
    }

    updateDetailInfo(minDepthInSystem, maxDepthInSystem);
    updateBoreholeDepthLabels();
}

function resetAll() {
    if (currentDepth === 0 && saringanPosisi.length === 0 && !openHole && !groundLevelSet && !matSet) {
        showNotification("Tidak ada data untuk di-reset", 'info', 2000);
        return;
    }
    
    const confirmReset = confirm("Apakah Anda yakin ingin mereset semua data?");
    if (confirmReset) {
        currentDepth = 0;
        saringanPosisi = [];
        pipeSegments = [];
        openHole = null;
        groundLevel = 0;
        groundLevelSet = false;
        matLevel = null;
        matSet = false;
        
        depthInput.value = "";
        if (pipeDiameter) pipeDiameter.value = "";
        if (saringanDepth) saringanDepth.value = '';
        if (saringanSize) saringanSize.value = '3';
        if (openHoleDepth) openHoleDepth.value = "";
        if (groundLevelInput) groundLevelInput.value = "";
        if (matInput) matInput.value = "";
        
        updateSaringanList();
        updatePipeList();
        updateOpenHoleInfo();
        updateGroundLevelInfo();
        updateMATInfo();
        drawVisualization();
        updateBoreholeDepthLabels();
        
        showNotification("Semua data berhasil direset", 'success', 3000);
    }
}

function saveWellData() {
    const companyName = document.getElementById('companyName')?.value || '';
    const shallowWellNumber = document.getElementById('shallowWellNumber')?.value || '';
    const address = document.getElementById('companyAddress')?.value || '';
    const province = document.getElementById('province')?.value || '';
    const latitude = document.getElementById('latitude')?.value || '';
    const longitude = document.getElementById('longitude')?.value || '';
    const elevation = document.getElementById('elevation')?.value || '';
    const city = document.getElementById('city')?.value || '';
    const district = document.getElementById('district')?.value || '';
    const village = document.getElementById('village')?.value || '';
    const boreholeDate = document.getElementById('boreholeDate')?.value || '';
    const wellNumber = document.getElementById('wellNumber')?.value || '';
    const piezoDistance = document.getElementById('piezoDistance')?.value || '';
    const pumpType = document.getElementById('pumpType')?.value || '';
    const pumpPosition = document.getElementById('pumpPosition')?.value || '';
    
    if (!companyName || !address) {
        showNotification('Nama perusahaan dan alamat harus diisi', 'warning', 3000);
        return;
    }
    
    const boreholeImages = {};
    for (let i = 1; i <= 5; i++) {
        const previewImage = document.getElementById(`boreholePreviewImage${i}`);
        if (previewImage && previewImage.src && previewImage.src.startsWith('data:')) {
            boreholeImages[`borehole${i}`] = previewImage.src;
        }
    }
    
    const wellPhotoPreview = document.getElementById('previewImage');
    if (wellPhotoPreview && wellPhotoPreview.src && wellPhotoPreview.src.startsWith('data:')) {
        boreholeImages.wellPhoto = wellPhotoPreview.src;
    }
    
    const wellData = {
        companyName,
        shallowWellNumber,
        address,
        province,
        latitude,
        longitude,
        elevation,
        city,
        district,
        village,
        boreholeDate,
        wellNumber,
        piezoDistance,
        pumpType,
        pumpPosition,
        boreholeImages,
        activityImages: activityImages,
        timestamp: new Date().toISOString()
    };
    
    localStorage.setItem('wellData', JSON.stringify(wellData));
    showNotification('Data sumur bor berhasil disimpan!', 'success', 3000);
}

function resetWellData(showAlert = true) {
    const companyName = document.getElementById('companyName');
    const shallowWellNumber = document.getElementById('shallowWellNumber');
    const companyAddress = document.getElementById('companyAddress');
    const province = document.getElementById('province');
    const latitude = document.getElementById('latitude');
    const longitude = document.getElementById('longitude');
    const elevation = document.getElementById('elevation');
    const city = document.getElementById('city');
    const district = document.getElementById('district');
    const village = document.getElementById('village');
    const boreholeDate = document.getElementById('boreholeDate');
    const wellNumber = document.getElementById('wellNumber');
    const piezoDistance = document.getElementById('piezoDistance');
    const pumpType = document.getElementById('pumpType');
    const pumpPosition = document.getElementById('pumpPosition');
    const photoPreview = document.getElementById('photoPreview');
    const previewImage = document.getElementById('previewImage');

    if (companyName) companyName.value = '';
    if (shallowWellNumber) shallowWellNumber.value = '';
    if (companyAddress) companyAddress.value = '';
    if (province) province.value = '';
    if (latitude) latitude.value = '';
    if (longitude) longitude.value = '';
    if (elevation) elevation.value = '';
    if (city) city.value = '';
    if (district) district.value = '';
    if (village) village.value = '';
    if (boreholeDate) boreholeDate.value = '';
    if (wellNumber) wellNumber.value = '';
    if (piezoDistance) piezoDistance.value = '';
    if (pumpType) pumpType.value = '';
    if (pumpPosition) pumpPosition.value = '';

    if (photoPreview) photoPreview.style.display = 'none';
    if (previewImage) previewImage.src = '#';
    
    for (let i = 1; i <= 5; i++) {
        const boreholePreview = document.getElementById(`boreholePreview${i}`);
        const boreholeImage = document.getElementById(`boreholeImage${i}`);
        const previewDepth = document.getElementById(`previewDepth${i}`);
        
        if (boreholePreview) boreholePreview.style.display = 'none';
        if (boreholeImage) boreholeImage.value = '';
        if (previewDepth) previewDepth.textContent = '- m';
        
        const existingDeleteBtn = boreholePreview?.querySelector('.image-delete-btn');
        if (existingDeleteBtn) existingDeleteBtn.remove();
    }
    
    const wellPhotoDeleteBtn = photoPreview?.querySelector('.image-delete-btn');
    if (wellPhotoDeleteBtn) wellPhotoDeleteBtn.remove();
    
    const depthLabels = ['depthPipeStart', 'depthMAT', 'depthPipeEnd', 'depthScreen', 'depthBottom'];
    depthLabels.forEach(id => {
        const el = document.getElementById(id);
        if (el) el.textContent = '-';
    });

    // Reset activity images
    resetActivityDocs(false);

    localStorage.removeItem('wellData');

    if (showAlert) {
        showNotification('Data sumur bor berhasil direset', 'success', 3000);
    }
}

function createDeleteButton() {
    const deleteBtn = document.createElement('button');
    deleteBtn.className = 'image-delete-btn';
    deleteBtn.innerHTML = '×';
    deleteBtn.style.cssText = `
        position: absolute;
        top: -8px;
        right: -8px;
        width: 24px;
        height: 24px;
        border-radius: 50%;
        background: #ef4444;
        color: white;
        border: 2px solid white;
        font-size: 16px;
        font-weight: bold;
        display: flex;
        align-items: center;
        justify-content: center;
        cursor: pointer;
        box-shadow: 0 2px 4px rgba(0,0,0,0.2);
        z-index: 10;
    `;
    return deleteBtn;
}

function handleWellPhotoUpload(e) {
    const file = e.target.files[0];
    if (file) {
        if (file.size > 5 * 1024 * 1024) {
            showNotification('Ukuran file maksimal 5MB', 'error', 3000);
            e.target.value = '';
            return;
        }
        
        if (!file.type.match('image.*')) {
            showNotification('Hanya file gambar yang diperbolehkan', 'error', 3000);
            e.target.value = '';
            return;
        }
        
        const reader = new FileReader();
        reader.onload = function(e) {
            const previewImage = document.getElementById('previewImage');
            const photoPreview = document.getElementById('photoPreview');
            
            if (previewImage && photoPreview) {
                previewImage.src = e.target.result;
                photoPreview.style.display = 'block';
                photoPreview.style.position = 'relative';
                
                const existingDeleteBtn = photoPreview.querySelector('.image-delete-btn');
                if (existingDeleteBtn) {
                    existingDeleteBtn.remove();
                }
                
                const deleteBtn = createDeleteButton();
                deleteBtn.onclick = function() {
                    photoPreview.style.display = 'none';
                    previewImage.src = '#';
                    document.getElementById('wellPhoto').value = '';
                    deleteBtn.remove();
                    showNotification('Foto sumur bor dihapus', 'success', 2000);
                };
                
                photoPreview.appendChild(deleteBtn);
            }
        };
        reader.readAsDataURL(file);
    }
}

function handleBoreholeImageUpload(e, index) {
    const file = e.target.files[0];
    if (file) {
        if (file.size > 5 * 1024 * 1024) {
            showNotification('Ukuran file maksimal 5MB', 'error', 3000);
            e.target.value = '';
            return;
        }
        
        if (!file.type.match('image.*')) {
            showNotification('Hanya file gambar yang diperbolehkan', 'error', 3000);
            e.target.value = '';
            return;
        }
        
        const reader = new FileReader();
        reader.onload = function(e) {
            const preview = document.getElementById(`boreholePreview${index}`);
            const previewImage = document.getElementById(`boreholePreviewImage${index}`);
            
            if (preview && previewImage) {
                previewImage.src = e.target.result;
                preview.style.display = 'block';
                preview.style.position = 'relative';
                
                const existingDeleteBtn = preview.querySelector('.image-delete-btn');
                if (existingDeleteBtn) {
                    existingDeleteBtn.remove();
                }
                
                const deleteBtn = createDeleteButton();
                deleteBtn.onclick = function() {
                    preview.style.display = 'none';
                    previewImage.src = '#';
                    document.getElementById(`boreholeImage${index}`).value = '';
                    deleteBtn.remove();
                    showNotification(`Gambar ${getBoreholeImageName(index)} dihapus`, 'success', 2000);
                };
                
                preview.appendChild(deleteBtn);
                
                const depthSpan = document.getElementById(`previewDepth${index}`);
                if (depthSpan) {
                    let depthValue = '-';
                    let depthText = '-';
                    
                    switch(index) {
                        case 1: // Ujung Pipa Awal
                            if (pipeSegments.length > 0) {
                                const topPipe = pipeSegments.reduce((min, p) => 
                                    p.start < min.start ? p : min, pipeSegments[0]);
                                depthValue = groundLevelSet ? topPipe.start - groundLevel : topPipe.start;
                                
                                if (groundLevelSet) {
                                    if (depthValue > 0) depthText = `${formatNumber(depthValue)} m.bmt`;
                                    else if (depthValue < 0) depthText = `${formatNumber(Math.abs(depthValue))} m di atas tanah`;
                                    else depthText = `0 m.bmt`;
                                } else {
                                    depthText = `${formatNumber(depthValue)} m`;
                                }
                                depthSpan.textContent = depthText;
                            }
                            break;
                            
                        case 2: // Muka Air Tanah
                            if (matSet) {
                                if (matLevel > 0) depthText = `${formatNumber(matLevel)} m.bmt`;
                                else if (matLevel < 0) depthText = `${formatNumber(Math.abs(matLevel))} m di atas tanah (artesis)`;
                                else depthText = `0 m.bmt`;
                                depthSpan.textContent = depthText;
                            }
                            break;
                            
                        case 3: // Batas Pipa
                            if (pipeSegments.length > 0) {
                                const bottomPipe = pipeSegments.reduce((max, p) => 
                                    p.end > max.end ? p : max, pipeSegments[0]);
                                depthValue = groundLevelSet ? bottomPipe.end - groundLevel : bottomPipe.end;
                                
                                if (groundLevelSet) {
                                    if (depthValue > 0) depthText = `${formatNumber(depthValue)} m.bmt`;
                                    else if (depthValue < 0) depthText = `${formatNumber(Math.abs(depthValue))} m di atas tanah`;
                                    else depthText = `0 m.bmt`;
                                } else {
                                    depthText = `${formatNumber(depthValue)} m`;
                                }
                                depthSpan.textContent = depthText;
                            }
                            break;
                            
                        case 4: // Screen Perporasi
                            if (saringanPosisi.length > 0) {
                                const topScreen = saringanPosisi.reduce((min, s) => 
                                    s.depth < min.depth ? s : min, saringanPosisi[0]);
                                
                                depthValue = groundLevelSet ? topScreen.depth - groundLevel : topScreen.depth;
                                
                                if (groundLevelSet) {
                                    if (depthValue > 0) depthText = `${formatNumber(depthValue)} m.bmt`;
                                    else if (depthValue < 0) depthText = `${formatNumber(Math.abs(depthValue))} m di atas tanah`;
                                    else depthText = `0 m.bmt`;
                                } else {
                                    depthText = `${formatNumber(depthValue)} m`;
                                }
                                depthSpan.textContent = depthText;
                            }
                            break;
                            
                        case 5: // Dasar Sumur Bor
                            if (currentDepth > 0) {
                                let baseDepth = openHole ? openHole.endDepth : currentDepth;
                                depthValue = groundLevelSet ? baseDepth - groundLevel : baseDepth;
                                
                                if (groundLevelSet) {
                                    if (depthValue > 0) depthText = `${formatNumber(depthValue)} m.bmt`;
                                    else if (depthValue < 0) depthText = `${formatNumber(Math.abs(depthValue))} m di atas tanah`;
                                    else depthText = `0 m.bmt`;
                                } else {
                                    depthText = `${formatNumber(depthValue)} m`;
                                }
                                depthSpan.textContent = depthText;
                            }
                            break;
                    }
                }
            }
        };
        reader.readAsDataURL(file);
    }
}

function getBoreholeImageName(index) {
    const names = {
        1: 'Ujung Pipa Awal',
        2: 'Muka Air Tanah',
        3: 'Batas Pipa',
        4: 'Screen Perporasi',
        5: 'Dasar Sumur Bor'
    };
    return names[index] || index;
}

function setupBoreholeImageHandlers() {
    const wellPhoto = document.getElementById('wellPhoto');
    if (wellPhoto) {
        wellPhoto.removeEventListener('change', handleWellPhotoUpload);
        wellPhoto.addEventListener('change', handleWellPhotoUpload);
    }
    
    for (let i = 1; i <= 5; i++) {
        const boreholeImage = document.getElementById(`boreholeImage${i}`);
        if (boreholeImage) {
            boreholeImage.removeEventListener('change', function(e) { handleBoreholeImageUpload(e, i); });
            boreholeImage.addEventListener('change', function(e) {
                handleBoreholeImageUpload(e, i);
            });
        }
    }
}

// ====================== FUNGSI UNTUK PAGE 3 (DOKUMENTASI KEGIATAN) ======================

function setupActivityDocHandlers() {
    const categoryNames = {
        doc1: 'Papan Nama Lokasi Penyelidikan',
        doc2: 'Kenampakan Sumur Bor Produksi',
        doc3: 'Persiapan pengukuran borehole camera',
        doc4: 'Kegiatan pengukuran borehole camera',
        doc5: 'Ukuran pipa PVC casing sumur',
        doc6: 'Pompa submersible'
    };
    
    for (let i = 1; i <= 6; i++) {
        const input = document.getElementById(`boreholeDoc${i}`);
        if (input) {
            input.setAttribute('multiple', 'multiple');
            input.removeEventListener('change', createActivityHandler(i, categoryNames[`doc${i}`]));
            input.addEventListener('change', createActivityHandler(i, categoryNames[`doc${i}`]));
        }
    }
}

function createActivityHandler(index, categoryName) {
    return function(e) {
        handleActivityImageUpload(e, index, categoryName);
    };
}

function handleActivityImageUpload(e, index, categoryName) {
    const files = Array.from(e.target.files);
    const categoryKey = `doc${index}`;
    
    if (files.length === 0) return;
    
    // Hitung total foto setelah upload
    const totalAfterUpload = activityImages[categoryKey].length + files.length;
    
    // Validasi maksimal 3 foto per kategori
    if (totalAfterUpload > 3) {
        const sisaSlot = 3 - activityImages[categoryKey].length;
        showNotification(`Maksimal 3 foto untuk ${categoryName}. Anda bisa menambah ${sisaSlot} foto lagi.`, 'warning', 4000);
        
        // Jika masih ada slot, upload hanya sebanyak slot yang tersisa
        if (sisaSlot > 0) {
            const filesToUpload = files.slice(0, sisaSlot);
            processActivityImages(filesToUpload, index, categoryKey, categoryName);
        }
        
        // Reset input file
        e.target.value = '';
        return;
    }
    
    // Proses semua file jika masih dalam batas
    processActivityImages(files, index, categoryKey, categoryName);
    
    // Reset input file
    e.target.value = '';
}

function processActivityImages(files, index, categoryKey, categoryName) {
    // Proses setiap file
    files.forEach((file) => {
        // Validasi ukuran file (max 5MB)
        if (file.size > 5 * 1024 * 1024) {
            showNotification(`File ${file.name} melebihi 5MB`, 'error', 3000);
            return;
        }
        
        // Validasi tipe file
        if (!file.type.match('image.*')) {
            showNotification(`File ${file.name} bukan gambar`, 'error', 3000);
            return;
        }
        
        const reader = new FileReader();
        reader.onload = function(readerEvent) {
            // Tambahkan ke array
            activityImages[categoryKey].push({
                id: Date.now() + Math.random() + index,
                dataUrl: readerEvent.target.result,
                name: file.name,
                category: categoryKey,
                categoryName: categoryName,
                timestamp: new Date().toISOString()
            });
            
            // Update preview
            updateActivityPreview(index);
            
            // Tampilkan notifikasi sukses
            showNotification(`Foto ${categoryName} berhasil diupload`, 'success', 2000);
        };
        reader.readAsDataURL(file);
    });
}

function updateActivityPreview(index) {
    const categoryKey = `doc${index}`;
    const container = document.getElementById(`activityPreview${index}`);
    
    if (!container) {
        // Buat container jika belum ada
        createActivityPreviewContainer(index);
        return;
    }
    
    const images = activityImages[categoryKey];
    
    if (images.length === 0) {
        container.innerHTML = `
            <div class="activity-empty-state" style="grid-column: 1/-1; text-align: center; padding: 20px; background: #f8fafc; border-radius: 12px; border: 1px dashed #cbd5e1; margin-top: 10px;">
                <span style="font-size: 24px; display: block; margin-bottom: 8px;">📷</span>
                <p style="color: #64748b; font-size: 13px;">Belum ada foto untuk kategori ini</p>
                <p style="color: #94a3b8; font-size: 11px; margin-top: 4px;">Maksimal 3 foto, klik tombol upload untuk menambahkan</p>
            </div>
        `;
        return;
    }
    
    let html = '<div class="activity-preview-grid" style="display: grid; grid-template-columns: repeat(auto-fill, minmax(120px, 1fr)); gap: 12px; margin-top: 16px;">';
    
    images.forEach((img, imgIndex) => {
        html += `
            <div class="activity-preview-item" style="position: relative; background: #f8fafc; border-radius: 12px; padding: 8px; border: 1px solid #e2e8f0;">
                <span style="position: absolute; top: 2px; left: 2px; background: #2563eb; color: white; width: 20px; height: 20px; border-radius: 50%; display: flex; align-items: center; justify-content: center; font-size: 10px; font-weight: bold; z-index: 5;">${imgIndex + 1}</span>
                <img src="${img.dataUrl}" alt="${img.name}" style="width: 100%; height: 100px; object-fit: cover; border-radius: 8px; border: 1px solid #e2e8f0;">
                <div style="margin-top: 6px; display: flex; justify-content: space-between; align-items: center;">
                    <span style="font-size: 10px; color: #64748b; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; max-width: 70px;">${img.name.substring(0, 10)}${img.name.length > 10 ? '...' : ''}</span>
                    <button onclick="deleteActivityImage('${categoryKey}', '${img.id}')" style="background: #fee2e2; border: none; color: #ef4444; width: 22px; height: 22px; border-radius: 50%; cursor: pointer; display: flex; align-items: center; justify-content: center; font-size: 14px; font-weight: bold;">×</button>
                </div>
            </div>
        `;
    });
    
    // Tambahkan indikator sisa slot
    const sisaSlot = 3 - images.length;
    if (sisaSlot > 0) {
        html += `
            <div class="activity-slot-indicator" style="background: #f0f9ff; border: 1px dashed #3b82f6; border-radius: 12px; padding: 20px; text-align: center; color: #3b82f6; font-size: 12px; display: flex; flex-direction: column; align-items: center; justify-content: center;">
                <span style="font-size: 20px; margin-bottom: 5px;">📤</span>
                <span>Sisa ${sisaSlot} slot</span>
                <span style="font-size: 10px; margin-top: 5px;">Maksimal 3 foto</span>
            </div>
        `;
    }
    
    html += '</div>';
    container.innerHTML = html;
}

function createActivityPreviewContainer(index) {
    const containerId = `activityPreview${index}`;
    
    // Cari elemen induk (well-data-item)
    const parentElement = document.getElementById(`boreholeDoc${index}`)?.closest('.well-data-item');
    
    if (parentElement) {
        // Buat container preview jika belum ada
        const previewContainer = document.createElement('div');
        previewContainer.id = containerId;
        previewContainer.className = 'activity-preview-wrapper';
        previewContainer.style.marginTop = '16px';
        previewContainer.innerHTML = `
            <div class="activity-empty-state" style="text-align: center; padding: 20px; background: #f8fafc; border-radius: 12px; border: 1px dashed #cbd5e1;">
                <span style="font-size: 24px; display: block; margin-bottom: 8px;">📷</span>
                <p style="color: #64748b; font-size: 13px;">Belum ada foto untuk kategori ini</p>
                <p style="color: #94a3b8; font-size: 11px; margin-top: 4px;">Maksimal 3 foto, klik tombol upload untuk menambahkan</p>
            </div>
        `;
        
        parentElement.appendChild(previewContainer);
    }
}

function deleteActivityImage(categoryKey, imageId) {
    if (activityImages[categoryKey]) {
        activityImages[categoryKey] = activityImages[categoryKey].filter(img => img.id != imageId);
        
        // Dapatkan index dari categoryKey (doc1 -> 1)
        const index = parseInt(categoryKey.replace('doc', ''));
        updateActivityPreview(index);
        
        showNotification('Foto berhasil dihapus', 'success', 2000);
    }
}

function resetActivityDocs(showAlert = true) {
    // Reset semua array gambar
    activityImages = {
        doc1: [],
        doc2: [],
        doc3: [],
        doc4: [],
        doc5: [],
        doc6: []
    };
    
    // Hapus semua preview
    for (let i = 1; i <= 6; i++) {
        const previewContainer = document.getElementById(`activityPreview${i}`);
        if (previewContainer) {
            previewContainer.remove();
        }
        
        // Reset input file
        const input = document.getElementById(`boreholeDoc${i}`);
        if (input) {
            input.value = '';
        }
    }
    
    // Buat ulang preview containers dengan state kosong
    for (let i = 1; i <= 6; i++) {
        createActivityPreviewContainer(i);
    }
    
    if (showAlert) {
        showNotification('Dokumentasi kegiatan berhasil direset', 'success', 3000);
    }
}

function saveActivityDocs() {
    // Simpan hanya activityImages ke localStorage
    try {
        const savedData = localStorage.getItem('wellData');
        let wellData = savedData ? JSON.parse(savedData) : {};
        
        wellData.activityImages = activityImages;
        wellData.timestamp = new Date().toISOString();
        
        localStorage.setItem('wellData', JSON.stringify(wellData));
        showNotification('Dokumentasi kegiatan berhasil disimpan!', 'success', 3000);
    } catch (e) {
        console.error('Error saving activity docs:', e);
        showNotification('Gagal menyimpan dokumentasi', 'error', 3000);
    }
}

function loadActivityImages() {
    const savedWellData = localStorage.getItem('wellData');
    if (savedWellData) {
        try {
            const data = JSON.parse(savedWellData);
            if (data.activityImages) {
                activityImages = data.activityImages;
                
                // Render preview untuk setiap kategori
                for (let i = 1; i <= 6; i++) {
                    const categoryKey = `doc${i}`;
                    if (activityImages[categoryKey] && activityImages[categoryKey].length > 0) {
                        // Hapus container lama jika ada
                        const oldContainer = document.getElementById(`activityPreview${i}`);
                        if (oldContainer) {
                            oldContainer.remove();
                        }
                        
                        // Buat container baru
                        createActivityPreviewContainer(i);
                        
                        // Update preview
                        setTimeout(() => {
                            updateActivityPreview(i);
                        }, 100);
                    }
                }
            }
        } catch (e) {
            console.error('Error loading activity images:', e);
        }
    }
}

// ====================== EVENT LISTENERS ======================

canvas.addEventListener("mousemove", (e) => {
    const rect = canvas.getBoundingClientRect();
    const mouseX = e.clientX - rect.left;
    const mouseY = e.clientY - rect.top;
    
    let foundComponent = null;
    
    for (const component of components) {
        if (mouseX >= component.x && 
            mouseX <= component.x + component.width && 
            mouseY >= component.y && 
            mouseY <= component.y + component.height) {
            foundComponent = component;
            break;
        }
    }
    
    if (foundComponent) {
        tooltip.style.left = (mouseX + 15) + "px";
        tooltip.style.top = (mouseY + 15) + "px";
        tooltip.innerHTML = foundComponent.info.replace(/\n/g, '<br>');
        tooltip.style.opacity = 1;
        
        hoverDetails.innerHTML = `
            <div><strong>${foundComponent.type.toUpperCase()}</strong></div>
            <div style="font-size: 11px;"><small>${foundComponent.info.split('\n')[0]}</small></div>
        `;
    } else {
        const usableHeight = canvas.height - TOP_MARGIN - BOTTOM_MARGIN;
        
        let minDepth = 0;
        let maxDepth = currentDepth;
        
        if (openHole) {
            maxDepth = Math.max(maxDepth, openHole.endDepth);
        }
        
        if (groundLevelSet) {
            minDepth = Math.min(0, groundLevel);
            maxDepth = Math.max(maxDepth, groundLevel);
            
            if (matSet) {
                const absoluteMATDepth = groundLevel + matLevel;
                maxDepth = Math.max(maxDepth, absoluteMATDepth);
                minDepth = Math.min(minDepth, absoluteMATDepth);
            }
        }
        
        const totalDepthRange = maxDepth - minDepth;
        const scale = totalDepthRange > 0 ? usableHeight / totalDepthRange : 0;
        
        if (mouseY >= TOP_MARGIN && mouseY <= canvas.height - BOTTOM_MARGIN && scale > 0) {
            const depthInSystem = minDepth + ((mouseY - TOP_MARGIN) / scale);
            
            let infoText = `<div><strong>POSISI</strong></div>`;
            infoText += `<div style="font-size: 11px;"><small>Sistem koordinat: ${formatNumber(depthInSystem)} m</small></div>`;
            
            if (groundLevelSet) {
                const relativeToGround = depthInSystem - groundLevel;
                infoText += `<div style="font-size: 11px;"><small>Relatif ke tanah: ${formatNumber(relativeToGround)} m</small></div>`;
                
                if (Math.abs(depthInSystem - groundLevel) < 0.5) {
                    infoText += `<div style="font-size: 11px; color: #d97706;"><small>Tepat di permukaan tanah</small></div>`;
                } 
                else if (matSet && Math.abs(depthInSystem - (groundLevel + matLevel)) < 0.5) {
                    infoText += `<div style="font-size: 11px; color: #3b82f6;"><small>Tepat di Muka Air Tanah (MAT)</small></div>`;
                }
                else if (depthInSystem < groundLevel) {
                    infoText += `<div style="font-size: 11px; color: #dc2626;"><small>${formatNumber(Math.abs(relativeToGround))} m di atas permukaan tanah</small></div>`;
                } else {
                    infoText += `<div style="font-size: 11px; color: #059669;"><small>${formatNumber(relativeToGround)} m di bawah permukaan tanah</small></div>`;
                }
                
                if (matSet) {
                    const relativeToMAT = depthInSystem - (groundLevel + matLevel);
                    if (Math.abs(relativeToMAT) > 0.5) {
                        if (relativeToMAT > 0) {
                            infoText += `<div style="font-size: 11px; color: #1e40af;"><small>${formatNumber(relativeToMAT)} m di bawah MAT</small></div>`;
                        } else {
                            infoText += `<div style="font-size: 11px; color: #60a5fa;"><small>${formatNumber(Math.abs(relativeToMAT))} m di atas MAT</small></div>`;
                        }
                    }
                }
            }
            
            hoverDetails.innerHTML = infoText;
        } else {
            hoverDetails.innerHTML = "Arahkan mouse ke area visualisasi";
        }
        tooltip.style.opacity = 0;
    }
});

canvas.addEventListener("mouseleave", () => {
    tooltip.style.opacity = 0;
    hoverDetails.innerHTML = "Arahkan mouse ke komponen pipa";
});

document.addEventListener('DOMContentLoaded', function() {
    if (!CanvasRenderingContext2D.prototype.roundRect) {
        CanvasRenderingContext2D.prototype.roundRect = function(x, y, width, height, radius) {
            if (width < 2 * radius) radius = width / 2;
            if (height < 2 * radius) radius = height / 2;
            this.beginPath();
            this.moveTo(x + radius, y);
            this.arcTo(x + width, y, x + width, y + height, radius);
            this.arcTo(x + width, y + height, x, y + height, radius);
            this.arcTo(x, y + height, x, y, radius);
            this.arcTo(x, y, x + width, y, radius);
            this.closePath();
            return this;
        }
    }
    
    setupBoreholeImageHandlers();
    setupActivityDocHandlers();
    
    drawVisualization();
    updateGroundLevelInfo();
    updateMATInfo();
    updateOpenHoleInfo();
    updateBoreholeDepthLabels();
    resetWellData(false);
    
    // Load saved data
    const savedWellData = localStorage.getItem('wellData');
    if (savedWellData) {
        try {
            const data = JSON.parse(savedWellData);
            if (document.getElementById('companyName')) document.getElementById('companyName').value = data.companyName || '';
            if (document.getElementById('shallowWellNumber')) document.getElementById('shallowWellNumber').value = data.shallowWellNumber || '';
            if (document.getElementById('companyAddress')) document.getElementById('companyAddress').value = data.address || '';
            if (document.getElementById('province')) document.getElementById('province').value = data.province || '';
            if (document.getElementById('latitude')) document.getElementById('latitude').value = data.latitude || '';
            if (document.getElementById('longitude')) document.getElementById('longitude').value = data.longitude || '';
            if (document.getElementById('elevation')) document.getElementById('elevation').value = data.elevation || '';
            if (document.getElementById('city')) document.getElementById('city').value = data.city || '';
            if (document.getElementById('district')) document.getElementById('district').value = data.district || '';
            if (document.getElementById('village')) document.getElementById('village').value = data.village || '';
            if (document.getElementById('boreholeDate')) document.getElementById('boreholeDate').value = data.boreholeDate || '';
            if (document.getElementById('wellNumber')) document.getElementById('wellNumber').value = data.wellNumber || '';
            if (document.getElementById('piezoDistance')) document.getElementById('piezoDistance').value = data.piezoDistance || '';
            if (document.getElementById('pumpType')) document.getElementById('pumpType').value = data.pumpType || '';
            if (document.getElementById('pumpPosition')) document.getElementById('pumpPosition').value = data.pumpPosition || '';
            
            if (data.boreholeImages) {
                if (data.boreholeImages.wellPhoto) {
                    const previewImage = document.getElementById('previewImage');
                    const photoPreview = document.getElementById('photoPreview');
                    if (previewImage && photoPreview) {
                        previewImage.src = data.boreholeImages.wellPhoto;
                        photoPreview.style.display = 'block';
                        photoPreview.style.position = 'relative';
                        
                        const existingDeleteBtn = photoPreview.querySelector('.image-delete-btn');
                        if (existingDeleteBtn) existingDeleteBtn.remove();
                        
                        const deleteBtn = createDeleteButton();
                        deleteBtn.onclick = function() {
                            photoPreview.style.display = 'none';
                            previewImage.src = '#';
                            document.getElementById('wellPhoto').value = '';
                            deleteBtn.remove();
                        };
                        photoPreview.appendChild(deleteBtn);
                    }
                }
                
                for (let i = 1; i <= 5; i++) {
                    const imgKey = `borehole${i}`;
                    if (data.boreholeImages[imgKey]) {
                        const previewImage = document.getElementById(`boreholePreviewImage${i}`);
                        const boreholePreview = document.getElementById(`boreholePreview${i}`);
                        const previewDepth = document.getElementById(`previewDepth${i}`);
                        
                        if (previewImage && boreholePreview) {
                            previewImage.src = data.boreholeImages[imgKey];
                            boreholePreview.style.display = 'block';
                            boreholePreview.style.position = 'relative';
                            
                            const existingDeleteBtn = boreholePreview.querySelector('.image-delete-btn');
                            if (existingDeleteBtn) existingDeleteBtn.remove();
                            
                            const deleteBtn = createDeleteButton();
                            deleteBtn.onclick = function() {
                                boreholePreview.style.display = 'none';
                                previewImage.src = '#';
                                document.getElementById(`boreholeImage${i}`).value = '';
                                deleteBtn.remove();
                            };
                            boreholePreview.appendChild(deleteBtn);
                            
                            if (previewDepth) {
                                let depthValue = '-';
                                let depthText = '-';
                                
                                switch(i) {
                                    case 1:
                                        if (pipeSegments.length > 0) {
                                            const firstPipe = pipeSegments[0];
                                            depthValue = groundLevelSet ? firstPipe.start - groundLevel : firstPipe.start;
                                            if (groundLevelSet) {
                                                if (depthValue > 0) depthText = `${formatNumber(depthValue)} m.bmt`;
                                                else if (depthValue < 0) depthText = `${formatNumber(Math.abs(depthValue))} m di atas tanah`;
                                                else depthText = `0 m.bmt`;
                                            } else {
                                                depthText = `${formatNumber(depthValue)} m`;
                                            }
                                            previewDepth.textContent = depthText;
                                        }
                                        break;
                                    case 2:
                                        if (matSet) {
                                            if (matLevel > 0) depthText = `${formatNumber(matLevel)} m.bmt`;
                                            else if (matLevel < 0) depthText = `${formatNumber(Math.abs(matLevel))} m di atas tanah (artesis)`;
                                            else depthText = `0 m.bmt`;
                                            previewDepth.textContent = depthText;
                                        }
                                        break;
                                    case 3:
                                        if (pipeSegments.length > 0) {
                                            const lastPipe = pipeSegments[pipeSegments.length - 1];
                                            depthValue = groundLevelSet ? lastPipe.end - groundLevel : lastPipe.end;
                                            if (groundLevelSet) {
                                                if (depthValue > 0) depthText = `${formatNumber(depthValue)} m.bmt`;
                                                else if (depthValue < 0) depthText = `${formatNumber(Math.abs(depthValue))} m di atas tanah`;
                                                else depthText = `0 m.bmt`;
                                            } else {
                                                depthText = `${formatNumber(depthValue)} m`;
                                            }
                                            previewDepth.textContent = depthText;
                                        }
                                        break;
                                    case 4:
                                        if (saringanPosisi.length > 0) {
                                            const firstScreen = saringanPosisi[0];
                                            depthValue = groundLevelSet ? firstScreen.depth - groundLevel : firstScreen.depth;
                                            if (groundLevelSet) {
                                                if (depthValue > 0) depthText = `${formatNumber(depthValue)} m.bmt`;
                                                else if (depthValue < 0) depthText = `${formatNumber(Math.abs(depthValue))} m di atas tanah`;
                                                else depthText = `0 m.bmt`;
                                            } else {
                                                depthText = `${formatNumber(depthValue)} m`;
                                            }
                                            previewDepth.textContent = depthText;
                                        }
                                        break;
                                    case 5:
                                        if (currentDepth > 0) {
                                            let baseDepth = openHole ? openHole.endDepth : currentDepth;
                                            depthValue = groundLevelSet ? baseDepth - groundLevel : baseDepth;
                                            if (groundLevelSet) {
                                                if (depthValue > 0) depthText = `${formatNumber(depthValue)} m.bmt`;
                                                else if (depthValue < 0) depthText = `${formatNumber(Math.abs(depthValue))} m di atas tanah`;
                                                else depthText = `0 m.bmt`;
                                            } else {
                                                depthText = `${formatNumber(depthValue)} m`;
                                            }
                                            previewDepth.textContent = depthText;
                                        }
                                        break;
                                }
                            }
                        }
                    }
                }
            }
            
            // Load activity images
            if (data.activityImages) {
                activityImages = data.activityImages;
                loadActivityImages();
            }
        } catch (e) {
            console.error('Error loading saved well data:', e);
        }
    }
});

window.addEventListener("load", () => {
    if (!CanvasRenderingContext2D.prototype.roundRect) {
        CanvasRenderingContext2D.prototype.roundRect = function(x, y, width, height, radius) {
            if (width < 2 * radius) radius = width / 2;
            if (height < 2 * radius) radius = height / 2;
            this.beginPath();
            this.moveTo(x + radius, y);
            this.arcTo(x + width, y, x + width, y + height, radius);
            this.arcTo(x + width, y + height, x, y + height, radius);
            this.arcTo(x, y + height, x, y, radius);
            this.arcTo(x, y, x + width, y, radius);
            this.closePath();
            return this;
        }
    }
    
    drawVisualization();
    updateGroundLevelInfo();
    updateMATInfo();
    updateOpenHoleInfo();
    updateBoreholeDepthLabels();
    resetWellData(false);
    setupActivityDocHandlers();
    loadActivityImages();
});

function downloadPDF() {
    if (currentDepth === 0 && pipeSegments.length === 0) {
        showNotification("Buat pipa terlebih dahulu sebelum download PDF", 'warning', 3000);
        return;
    }

    showNotification("Menyiapkan PDF...", 'info', 2000);

    setTimeout(() => {
        drawVisualization();
        
        setTimeout(() => {
            generatePDF(null);
        }, 300);
    }, 100);
}

function generatePDF(logoBase64) {
    drawVisualization();
    
    setTimeout(() => {
        const { jsPDF } = window.jspdf;
        const pdf = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });

        const pageW = pdf.internal.pageSize.getWidth();
        const pageH = pdf.internal.pageSize.getHeight();
        
        const tableW = 155;
        const tableOffsetX = (pageW - tableW) / 2;

        const companyName = document.getElementById('companyName')?.value || '-';
        const shallowWellNumber = document.getElementById('shallowWellNumber')?.value || '-';
        const wellNumber = document.getElementById('wellNumber')?.value || '-';
        const companyAddress = document.getElementById('companyAddress')?.value || '-';
        const province = document.getElementById('province')?.value || '-';
        const city = document.getElementById('city')?.value || '-';
        const district = document.getElementById('district')?.value || '-';
        const village = document.getElementById('village')?.value || '-';
        const latitude = document.getElementById('latitude')?.value || '-';
        const longitude = document.getElementById('longitude')?.value || '-';
        const elevation = document.getElementById('elevation')?.value || '-';
        const boreholeDate = document.getElementById('boreholeDate')?.value || '-';
        const piezoDistance = document.getElementById('piezoDistance')?.value || '-';
        const pumpType = document.getElementById('pumpType')?.value || '-';
        const pumpPosition = document.getElementById('pumpPosition')?.value || '-';
        
        let formattedDate = boreholeDate;
        if (boreholeDate && boreholeDate !== '-') {
            try {
                const date = new Date(boreholeDate);
                formattedDate = date.toLocaleDateString('id-ID', {
                    day: 'numeric',
                    month: 'long',
                    year: 'numeric'
                });
            } catch (e) {
                formattedDate = boreholeDate;
            }
        }

        let totalPipeLength = 0;
        let pipeInfo = '-';
        if (pipeSegments && pipeSegments.length > 0) {
            totalPipeLength = pipeSegments.reduce((t, p) => t + (p.end - p.start), 0);
            const diameters = [...new Set(pipeSegments.map(p => p.diameter || '-'))].join(', ');
            pipeInfo = diameters;
        }

        let screenInfo = '-';
        if (saringanPosisi && saringanPosisi.length > 0) {
            screenInfo = saringanPosisi
                .sort((a, b) => a.depth - b.depth)
                .map(s => {
                    const sEnd = s.depth + s.size;
                    if (groundLevelSet) {
                        const relStart = s.depth - groundLevel;
                        const relEnd = sEnd - groundLevel;
                        return `${formatNumber(relStart)} - ${formatNumber(relEnd)} m.bmt`;
                    }
                    return `${formatNumber(s.depth)} - ${formatNumber(sEnd)} m`;
                })
                .join(', ');
        }

        let pipeTopInfo = '-';
        if (pipeSegments && pipeSegments.length > 0 && groundLevelSet) {
            const firstPipe = pipeSegments[0];
            const pipeTopRel = firstPipe.start - groundLevel;
            if (pipeTopRel >= 0) {
                pipeTopInfo = `${formatNumber(pipeTopRel)} m.bmt`;
            } else {
                pipeTopInfo = `${formatNumber(Math.abs(pipeTopRel))} m di atas tanah`;
            }
        }

        let kedalamanSumur = '-';
        if (currentDepth > 0) {
            if (openHole) {
                kedalamanSumur = `${formatNumber(openHole.endDepth)} m.bmt`;
            } else {
                kedalamanSumur = `${formatNumber(currentDepth)} m.bmt`;
            }
        }

        // Fungsi untuk menggambar cell tabel
        function drawCell(x, y, w, h, opts = {}) {
            if (opts.fill) {
                pdf.setFillColor(...opts.fill);
                pdf.rect(x, y, w, h, 'F');
            }
            pdf.setDrawColor(0, 0, 0);
            pdf.setLineWidth(0.2);
            pdf.rect(x, y, w, h, 'S');
        }

        // Fungsi untuk menulis teks di dalam cell
        function cellText(text, x, y, w, h, opts = {}) {
            const fontSize = opts.fontSize || 8;
            const bold = opts.bold || false;
            const align = opts.align || 'left';
            const color = opts.color || [0, 0, 0];
            const paddingX = opts.paddingX !== undefined ? opts.paddingX : 1.5;
            const paddingY = opts.paddingY !== undefined ? opts.paddingY : 1;

            pdf.setFontSize(fontSize);
            pdf.setFont('helvetica', bold ? 'bold' : 'normal');
            pdf.setTextColor(...color);

            const textX = align === 'center'
                ? x + w / 2
                : align === 'right'
                    ? x + w - paddingX
                    : x + paddingX;

            const lineH = fontSize * 0.352778 * 1.2;
            const lines = pdf.splitTextToSize(text, w - paddingX * 2);
            const totalTextH = lines.length * lineH;
            let textY = y + paddingY + lineH * 0.8;

            if (opts.vCenter) {
                textY = y + (h - totalTextH) / 2 + lineH * 0.8;
            }

            lines.forEach((line, i) => {
                pdf.text(line, textX, textY + i * lineH, { align });
            });

            pdf.setFont('helvetica', 'normal');
            pdf.setTextColor(0, 0, 0);
        }

        // Fungsi untuk mendeteksi format gambar dari data URL
        function getImageFormatFromDataURL(dataURL) {
            if (!dataURL || dataURL === '#' || dataURL === 'data:,') {
                return null;
            }
            
            if (dataURL.startsWith('data:image/png')) {
                return 'PNG';
            } else if (dataURL.startsWith('data:image/jpeg') || dataURL.startsWith('data:image/jpg')) {
                return 'JPEG';
            } else if (dataURL.startsWith('data:image/gif')) {
                return 'GIF';
            } else if (dataURL.startsWith('data:image/webp')) {
                return 'WEBP';
            } else if (dataURL.startsWith('data:image/bmp')) {
                return 'BMP';
            } else if (dataURL.startsWith('data:image/tiff')) {
                return 'TIFF';
            }
            
            return 'JPEG';
        }

        // Fungsi untuk menambahkan gambar dengan format yang tepat
        function addImageToPDF(pdf, imgData, x, y, w, h) {
            if (!imgData || imgData === '#' || imgData === 'data:,') {
                return false;
            }
            
            const supportedFormats = ['JPEG', 'PNG', 'WEBP', 'GIF', 'BMP', 'TIFF'];
            let format = getImageFormatFromDataURL(imgData);
            
            if (!supportedFormats.includes(format)) {
                format = 'JPEG';
            }
            
            try {
                pdf.addImage(imgData, format, x, y, w, h);
                return true;
            } catch (e) {
                console.error(`Error adding image with format ${format}:`, e);
                
                try {
                    pdf.addImage(imgData, 'PNG', x, y, w, h);
                    return true;
                } catch (e2) {
                    try {
                        pdf.addImage(imgData, 'JPEG', x, y, w, h);
                        return true;
                    } catch (e3) {
                        console.error('Semua format gagal:', e3);
                        return false;
                    }
                }
            }
        }

        // Fungsi untuk mendapatkan nama gambar borehole
        function getBoreholeImageName(index) {
            const names = {
                1: 'Ujung Pipa Awal',
                2: 'Muka Air Tanah',
                3: 'Batas Pipa',
                4: 'Screen Perporasi',
                5: 'Dasar Sumur Bor'
            };
            return names[index] || `Gambar ${index}`;
        }

        // Fungsi untuk mendapatkan judul dokumentasi
        function getDocTitle(index) {
            const titles = {
                1: 'Papan Nama Lokasi Penyelidikan',
                2: 'Kenampakan Sumur Bor Produksi',
                3: 'Persiapan Pengukuran Borehole Camera',
                4: 'Kegiatan Pengukuran Borehole Camera',
                5: 'Ukuran Pipa PVC (Casing Sumur)',
                6: 'Pompa Submersible'
            };
            return titles[index] || `Dokumentasi ${index}`;
        }

        // =========== HALAMAN 1: DATA TEKNIS DAN DUA KOLOM GAMBAR ===========
        let titleY = 20;
        
        pdf.setFont('helvetica', 'bold');
        pdf.setFontSize(14);
        pdf.setTextColor(0, 0, 0);
        pdf.text('KONSTRUKSI SUMUR BOR', pageW / 2, titleY, { align: 'center' });

        const leftLabelW = 32;
        const colonW = 5;
        const leftValW = 35;
        const rightLabelW = 18;
        const colonW2 = 5;
        const rightValW = tableW - leftLabelW - colonW - leftValW - rightLabelW - colonW2;
        
        const rowH = 7;
        let curY = titleY + 10;

        // Baris 1: Nama Perusahaan
        drawCell(tableOffsetX, curY, leftLabelW, rowH);
        cellText('Nama Perusahaan', tableOffsetX, curY, leftLabelW, rowH, { bold: true, fontSize: 8, paddingX: 2, vCenter: true });
        drawCell(tableOffsetX + leftLabelW, curY, colonW, rowH);
        cellText(':', tableOffsetX + leftLabelW, curY, colonW, rowH, { bold: true, fontSize: 8, align: 'center', vCenter: true });
        const restW1 = leftValW + rightLabelW + colonW2 + rightValW;
        drawCell(tableOffsetX + leftLabelW + colonW, curY, restW1, rowH);
        cellText(companyName, tableOffsetX + leftLabelW + colonW, curY, restW1, rowH, { fontSize: 8, paddingX: 2, vCenter: true });
        curY += rowH;

        // Baris 2: Nomor Urut Sumur Bor 
        const row2H = rowH * 1.5;
        drawCell(tableOffsetX, curY, leftLabelW, row2H);
        cellText('Nomor Urut Sumur Bor', tableOffsetX, curY, leftLabelW, row2H, { bold: true, fontSize: 8, paddingX: 2 });
        drawCell(tableOffsetX + leftLabelW, curY, colonW, row2H);
        cellText(':', tableOffsetX + leftLabelW, curY, colonW, row2H, { bold: true, fontSize: 8, align: 'center', vCenter: true });
        drawCell(tableOffsetX + leftLabelW + colonW, curY, restW1, row2H);
        cellText(shallowWellNumber, tableOffsetX + leftLabelW + colonW, curY, restW1, row2H, { fontSize: 8, paddingX: 2, vCenter: true });
        curY += row2H;

        // Baris 3: Alamat
        const row3H = rowH * 1.5;
        drawCell(tableOffsetX, curY, leftLabelW, row3H);
        cellText('Alamat', tableOffsetX, curY, leftLabelW, row3H, { bold: true, fontSize: 8, paddingX: 2, vCenter: true });
        drawCell(tableOffsetX + leftLabelW, curY, colonW, row3H);
        cellText(':', tableOffsetX + leftLabelW, curY, colonW, row3H, { bold: true, fontSize: 8, align: 'center', vCenter: true });
        drawCell(tableOffsetX + leftLabelW + colonW, curY, restW1, row3H);
        cellText(companyAddress, tableOffsetX + leftLabelW + colonW, curY, restW1, row3H, { fontSize: 8, paddingX: 2, vCenter: true });
        curY += row3H;

        // Baris 4: Desa/Kelurahan dan X
        drawCell(tableOffsetX, curY, leftLabelW, rowH);
        cellText('Desa/Kelurahan', tableOffsetX, curY, leftLabelW, rowH, { bold: true, fontSize: 8, paddingX: 2, vCenter: true });
        drawCell(tableOffsetX + leftLabelW, curY, colonW, rowH);
        cellText(':', tableOffsetX + leftLabelW, curY, colonW, rowH, { bold: true, fontSize: 8, align: 'center', vCenter: true });
        drawCell(tableOffsetX + leftLabelW + colonW, curY, leftValW, rowH);
        cellText(village, tableOffsetX + leftLabelW + colonW, curY, leftValW, rowH, { fontSize: 8, paddingX: 2, vCenter: true });
        drawCell(tableOffsetX + leftLabelW + colonW + leftValW, curY, rightLabelW, rowH);
        cellText('X', tableOffsetX + leftLabelW + colonW + leftValW, curY, rightLabelW, rowH, { bold: true, fontSize: 7, paddingX: 1.5, vCenter: true });
        drawCell(tableOffsetX + leftLabelW + colonW + leftValW + rightLabelW, curY, colonW2, rowH);
        cellText(':', tableOffsetX + leftLabelW + colonW + leftValW + rightLabelW, curY, colonW2, rowH, { bold: true, fontSize: 8, align: 'center', vCenter: true });
        drawCell(tableOffsetX + leftLabelW + colonW + leftValW + rightLabelW + colonW2, curY, rightValW, rowH);
        cellText(` ${longitude}`, tableOffsetX + leftLabelW + colonW + leftValW + rightLabelW + colonW2, curY, rightValW, rowH, { fontSize: 8, paddingX: 2, vCenter: true });
        curY += rowH;

        // Baris 5: Kecamatan dan Y
        drawCell(tableOffsetX, curY, leftLabelW, rowH);
        cellText('Kecamatan', tableOffsetX, curY, leftLabelW, rowH, { bold: true, fontSize: 8, paddingX: 2, vCenter: true });
        drawCell(tableOffsetX + leftLabelW, curY, colonW, rowH);
        cellText(':', tableOffsetX + leftLabelW, curY, colonW, rowH, { bold: true, fontSize: 8, align: 'center', vCenter: true });
        drawCell(tableOffsetX + leftLabelW + colonW, curY, leftValW, rowH);
        cellText(district, tableOffsetX + leftLabelW + colonW, curY, leftValW, rowH, { fontSize: 8, paddingX: 2, vCenter: true });
        drawCell(tableOffsetX + leftLabelW + colonW + leftValW, curY, rightLabelW, rowH);
        cellText('Y', tableOffsetX + leftLabelW + colonW + leftValW, curY, rightLabelW, rowH, { bold: true, fontSize: 7, paddingX: 1.5, vCenter: true });
        drawCell(tableOffsetX + leftLabelW + colonW + leftValW + rightLabelW, curY, colonW2, rowH);
        cellText(':', tableOffsetX + leftLabelW + colonW + leftValW + rightLabelW, curY, colonW2, rowH, { bold: true, fontSize: 8, align: 'center', vCenter: true });
        drawCell(tableOffsetX + leftLabelW + colonW + leftValW + rightLabelW + colonW2, curY, rightValW, rowH);
        cellText(`${latitude}`, tableOffsetX + leftLabelW + colonW + leftValW + rightLabelW + colonW2, curY, rightValW, rowH, { fontSize: 8, paddingX: 2, vCenter: true });
        curY += rowH;

        // Baris 6: Kabupaten/Kota dan Elevasi
        drawCell(tableOffsetX, curY, leftLabelW, rowH);
        cellText('Kabupaten/Kota', tableOffsetX, curY, leftLabelW, rowH, { bold: true, fontSize: 8, paddingX: 2, vCenter: true });
        drawCell(tableOffsetX + leftLabelW, curY, colonW, rowH);
        cellText(':', tableOffsetX + leftLabelW, curY, colonW, rowH, { bold: true, fontSize: 8, align: 'center', vCenter: true });
        drawCell(tableOffsetX + leftLabelW + colonW, curY, leftValW, rowH);
        cellText(city, tableOffsetX + leftLabelW + colonW, curY, leftValW, rowH, { fontSize: 8, paddingX: 2, vCenter: true });
        drawCell(tableOffsetX + leftLabelW + colonW + leftValW, curY, rightLabelW, rowH);
        cellText('Elevasi', tableOffsetX + leftLabelW + colonW + leftValW, curY, rightLabelW, rowH, { bold: true, fontSize: 7, paddingX: 1.5, vCenter: true });
        drawCell(tableOffsetX + leftLabelW + colonW + leftValW + rightLabelW, curY, colonW2, rowH);
        cellText(':', tableOffsetX + leftLabelW + colonW + leftValW + rightLabelW, curY, colonW2, rowH, { bold: true, fontSize: 8, align: 'center', vCenter: true });
        drawCell(tableOffsetX + leftLabelW + colonW + leftValW + rightLabelW + colonW2, curY, rightValW, rowH);
        cellText(elevation + ' mdpl', tableOffsetX + leftLabelW + colonW + leftValW + rightLabelW + colonW2, curY, rightValW, rowH, { fontSize: 8, paddingX: 2, vCenter: true });
        curY += rowH;

        // Baris 7: Provinsi
        drawCell(tableOffsetX, curY, leftLabelW, rowH);
        cellText('Provinsi', tableOffsetX, curY, leftLabelW, rowH, { bold: true, fontSize: 8, paddingX: 2, vCenter: true });
        drawCell(tableOffsetX + leftLabelW, curY, colonW, rowH);
        cellText(':', tableOffsetX + leftLabelW, curY, colonW, rowH, { bold: true, fontSize: 8, align: 'center', vCenter: true });
        drawCell(tableOffsetX + leftLabelW + colonW, curY, restW1, rowH);
        cellText(province, tableOffsetX + leftLabelW + colonW, curY, restW1, rowH, { fontSize: 8, paddingX: 2, vCenter: true });
        curY += rowH;

        // ===== DUA KOLOM GAMBAR: BOREHOLE (KIRI - 30%) DAN KONSTRUKSI (KANAN - 70%) =====
        const remainH = pageH - curY - 20;
        const leftColW = tableW * 0.3;
        const rightColW = tableW * 0.7;

        // ===== KOLOM KIRI - GAMBAR BOREHOLE (DENGAN 5 FOTO) =====
        drawCell(tableOffsetX, curY, leftColW, remainH);
        
        pdf.setFont('helvetica', 'bold');
        pdf.setFontSize(9);
        const bhLabelX = tableOffsetX + leftColW / 2;
        pdf.text('GAMBAR BOREHOLE', bhLabelX, curY + 8, { align: 'center' });
        const bhTextW = pdf.getTextWidth('GAMBAR BOREHOLE');
        pdf.setLineWidth(0.2);
        pdf.line(bhLabelX - bhTextW / 2, curY + 9, bhLabelX + bhTextW / 2, curY + 9);

        const imageStartY = curY + 15;
        const imageWidth = leftColW - 12;
        const imageHeight = 24;
        let imageCurrentY = imageStartY;

        for (let i = 1; i <= 5; i++) {
            const previewImage = document.getElementById(`boreholePreviewImage${i}`);
            const depthSpan = document.getElementById(`previewDepth${i}`);
            
            const imgX = tableOffsetX + 4;
            const imgY = imageCurrentY;
            const imgW = imageWidth;
            const imgH = imageHeight;
            
            pdf.setDrawColor(200, 200, 200);
            pdf.setLineWidth(0.3);
            pdf.rect(imgX, imgY, imgW, imgH, 'S');
            
            if (previewImage && previewImage.src && previewImage.src !== '#' && previewImage.src.startsWith('data:')) {
                try {
                    let imgRatio;
                    if (previewImage.naturalWidth && previewImage.naturalHeight) {
                        imgRatio = previewImage.naturalWidth / previewImage.naturalHeight;
                    } else {
                        imgRatio = 4/3;
                    }
                    
                    let drawW, drawH;
                    if (imgW / imgH > imgRatio) {
                        drawH = imgH;
                        drawW = drawH * imgRatio;
                    } else {
                        drawW = imgW;
                        drawH = drawW / imgRatio;
                    }
                    
                    const drawX = imgX + (imgW - drawW) / 2;
                    const drawY = imgY + (imgH - drawH) / 2;
                    
                    addImageToPDF(pdf, previewImage.src, drawX, drawY, drawW, drawH);
                } catch (e) {
                    console.error(`Error adding borehole image ${i}:`, e);
                    pdf.setFont('helvetica', 'italic');
                    pdf.setFontSize(7);
                    pdf.setTextColor(150, 150, 150);
                    pdf.text('Gambar tidak tersedia', imgX + imgW/2, imgY + imgH/2, { align: 'center' });
                    pdf.setTextColor(0, 0, 0);
                    pdf.setFont('helvetica', 'normal');
                }
            } else {
                pdf.setFont('helvetica', 'italic');
                pdf.setFontSize(7);
                pdf.setTextColor(150, 150, 150);
                pdf.text('Tidak ada gambar', imgX + imgW/2, imgY + imgH/2, { align: 'center' });
                pdf.setTextColor(0, 0, 0);
                pdf.setFont('helvetica', 'normal');
            }
            
            pdf.setFont('helvetica', 'bold');
            pdf.setFontSize(7);
            pdf.setTextColor(0, 0, 0);
            pdf.text(getBoreholeImageName(i), imgX, imgY + imgH + 2.5);
            
            pdf.setFont('helvetica', 'normal');
            pdf.setFontSize(6);
            pdf.setTextColor(37, 99, 235);
            
            let depthText = '';
            let depthValue = null;
            
            if (groundLevelSet) {
                switch(i) {
                    case 1:
                        if (pipeSegments.length > 0) {
                            const firstPipe = pipeSegments[0];
                            depthValue = firstPipe.start - groundLevel;
                            if (depthValue >= 0) {
                                depthText = `Kedalaman: ${formatNumber(depthValue)} m.bmt`;
                            } else {
                                depthText = `Kedalaman: ${formatNumber(Math.abs(depthValue))} m di atas tanah`;
                            }
                        }
                        break;
                    case 2:
                        if (matSet) {
                            if (matLevel >= 0) {
                                depthText = `Kedalaman: ${formatNumber(matLevel)} m.bmt`;
                            } else {
                                depthText = `Kedalaman: ${formatNumber(Math.abs(matLevel))} m di atas tanah (artesis)`;
                            }
                        }
                        break;
                    case 3:
                        if (pipeSegments.length > 0) {
                            const lastPipe = pipeSegments[pipeSegments.length - 1];
                            depthValue = lastPipe.end - groundLevel;
                            if (depthValue >= 0) {
                                depthText = `Kedalaman: ${formatNumber(depthValue)} m.bmt`;
                            } else {
                                depthText = `Kedalaman: ${formatNumber(Math.abs(depthValue))} m di atas tanah`;
                            }
                        }
                        break;
                    case 4:
                        if (saringanPosisi.length > 0) {
                            const firstScreen = saringanPosisi[0];
                            depthValue = firstScreen.depth - groundLevel;
                            if (depthValue >= 0) {
                                depthText = `Kedalaman: ${formatNumber(depthValue)} m.bmt`;
                            } else {
                                depthText = `Kedalaman: ${formatNumber(Math.abs(depthValue))} m di atas tanah`;
                            }
                        }
                        break;
                    case 5:
                        if (currentDepth > 0) {
                            const baseDepth = openHole ? openHole.endDepth : currentDepth;
                            depthValue = baseDepth - groundLevel;
                            if (depthValue >= 0) {
                                depthText = `Kedalaman: ${formatNumber(depthValue)} m.bmt`;
                            } else {
                                depthText = `Kedalaman: ${formatNumber(Math.abs(depthValue))} m di atas tanah`;
                            }
                        }
                        break;
                }
            } else {
                switch(i) {
                    case 1:
                        if (pipeSegments.length > 0) {
                            const firstPipe = pipeSegments[0];
                            depthText = `Kedalaman: ${formatNumber(firstPipe.start)} m (absolut)`;
                        }
                        break;
                    case 2:
                        if (matSet) {
                            const absoluteMATDepth = groundLevel + matLevel;
                            depthText = `Kedalaman: ${formatNumber(absoluteMATDepth)} m (absolut)`;
                        }
                        break;
                    case 3:
                        if (pipeSegments.length > 0) {
                            const lastPipe = pipeSegments[pipeSegments.length - 1];
                            depthText = `Kedalaman: ${formatNumber(lastPipe.end)} m (absolut)`;
                        }
                        break;
                    case 4:
                        if (saringanPosisi.length > 0) {
                            const firstScreen = saringanPosisi[0];
                            depthText = `Kedalaman: ${formatNumber(firstScreen.depth)} m (absolut)`;
                        }
                        break;
                    case 5:
                        if (currentDepth > 0) {
                            const baseDepth = openHole ? openHole.endDepth : currentDepth;
                            depthText = `Kedalaman: ${formatNumber(baseDepth)} m (absolut)`;
                        }
                        break;
                }
            }
            
            if (!depthText && depthSpan && depthSpan.textContent && depthSpan.textContent !== '- m' && depthSpan.textContent !== '-') {
                let spanText = depthSpan.textContent;
                if (spanText.includes('di bawah tanah')) {
                    spanText = spanText.replace('di bawah tanah', 'm.bmt').trim();
                }
                depthText = `Kedalaman: ${spanText}`;
            }
            
            if (depthText) {
                pdf.text(depthText, imgX, imgY + imgH + 6);
            }
            
            pdf.setTextColor(0, 0, 0);
            
            imageCurrentY += imgH + 9;
            
            if (imageCurrentY > curY + remainH - 10) {
                break;
            }
        }

        // ===== KOLOM KANAN - GAMBAR KONSTRUKSI SUMUR BOR =====
        drawCell(tableOffsetX + leftColW, curY, rightColW, remainH);
        pdf.setFont('helvetica', 'bold');
        pdf.setFontSize(9);
        const ksLabelX = tableOffsetX + leftColW + rightColW / 2;
        pdf.text('GAMBAR KONSTRUKSI SUMUR BOR', ksLabelX, curY + 8, { align: 'center' });
        const ksTextW = pdf.getTextWidth('GAMBAR KONSTRUKSI SUMUR BOR');
        pdf.line(ksLabelX - ksTextW / 2, curY + 9, ksLabelX + ksTextW / 2, curY + 9);

        drawVisualization();
        
        let imgData;
        try {
            imgData = canvas.toDataURL('image/png');
            if (imgData === 'data:,') {
                drawVisualization();
                imgData = canvas.toDataURL('image/png');
            }
        } catch (e) {
            console.error('Error capturing canvas:', e);
            imgData = '';
        }
        
        if (imgData) {
            try {
                const imgPadX = 5;
                const imgPadT = 15;
                const imgPadB = 5;
                const imgAreaW = rightColW - imgPadX * 2;
                const imgAreaH = remainH - imgPadT - imgPadB;
                const canvasRatio = canvas.width / canvas.height;
                let imgW, imgH;
                
                if (imgAreaW / imgAreaH > canvasRatio) {
                    imgH = imgAreaH;
                    imgW = imgH * canvasRatio;
                } else {
                    imgW = imgAreaW;
                    imgH = imgW / canvasRatio;
                }
                
                const imgX = tableOffsetX + leftColW + imgPadX + (imgAreaW - imgW) / 2;
                const imgY = curY + imgPadT + (imgAreaH - imgH) / 2;
                
                pdf.addImage(imgData, 'PNG', imgX, imgY, imgW, imgH);
            } catch (e) {
                console.error('Error adding construction image to PDF:', e);
            }
        }

      // =========== HALAMAN 2: DATA BOREHOLE CAMERA ===========
pdf.addPage();

titleY = 20;

pdf.setFont('helvetica', 'bold');
pdf.setFontSize(14);
pdf.setTextColor(0, 0, 0);
pdf.text('DATA BOREHOLE CAMERA', pageW / 2, titleY, { align: 'center' });

// Lebar kolom untuk halaman 2
const p2LabelW = 48;
const p2ValW = tableW - p2LabelW; // 107
let p2Y = titleY + 10;

// Fungsi untuk baris data di halaman 2 dengan jarak proporsional
function addDataRow(label, value) {
    // Hitung tinggi baris berdasarkan panjang teks
    const maxWidth = p2ValW - 8;
    const valueLines = pdf.splitTextToSize(String(value), maxWidth);
    const lineHeight = 4; // Jarak antar baris dalam satu cell (lebih rapat)
    const minRowHeight = 7; // Tinggi minimal baris (sama seperti halaman 1)
    
    // Hitung tinggi yang dibutuhkan berdasarkan jumlah baris teks
    const rowHeight = Math.max(minRowHeight, (valueLines.length * lineHeight) + 4);
    
    // Gambar cell dengan border
    drawCell(tableOffsetX, p2Y, p2LabelW, rowHeight);
    drawCell(tableOffsetX + p2LabelW, p2Y, p2ValW, rowHeight);
    
    // Tulis label - NORMAL
    pdf.setFont('helvetica', 'normal');
    pdf.setFontSize(8);
    const labelLines = pdf.splitTextToSize(label, p2LabelW - 4);
    
    // Hitung posisi Y untuk label agar di tengah vertikal
    if (labelLines.length === 1) {
        pdf.text(label, tableOffsetX + 2, p2Y + (rowHeight / 2) + 1.2);
    } else {
        let labelY = p2Y + (rowHeight / 2) - ((labelLines.length - 1) * lineHeight / 2) + 1.2;
        labelLines.forEach((line, idx) => {
            pdf.text(line, tableOffsetX + 2, labelY + (idx * lineHeight));
        });
    }
    
    // Tulis value - NORMAL
    pdf.setFont('helvetica', 'normal');
    pdf.setFontSize(8);
    
    // Hitung posisi Y untuk value agar di tengah vertikal
    let valueY = p2Y + (rowHeight / 2) - ((valueLines.length - 1) * lineHeight / 2) + 1.2;
    
    valueLines.forEach((line, idx) => {
        pdf.text(line, tableOffsetX + p2LabelW + 4, valueY + (idx * lineHeight));
    });
    
    p2Y += rowHeight;
    
    return p2Y;
}

// Panggil semua baris data
addDataRow('Nama Perusahaan', companyName);
addDataRow('Nomor Urut Sumur Bor', shallowWellNumber);
addDataRow('Alamat', companyAddress);
addDataRow('Sumur', wellNumber);
addDataRow('Koordinat', `X = ${longitude}, Y = ${latitude}`);
addDataRow('Elevasi', elevation + ' mdpl');
addDataRow('Tanggal pelaksanaan borehole', formattedDate);
addDataRow('Kedalaman Konstruksi Sumur', totalPipeLength > 0 ? `${formatNumber(totalPipeLength)} m.bmt` : '-');
addDataRow('Konstruksi Pipa (diameter)', pipeInfo ? pipeInfo + ' Inchi' : '-');

// Baris Screen
addDataRow('Screen', screenInfo);

// Lanjutkan baris berikutnya
addDataRow('Jarak Muka Pipa ke Permukaan Tanah', pipeTopInfo);
addDataRow('Jarak Piezometer ke Sumur', piezoDistance ? piezoDistance + ' m' : '-');
addDataRow('Jenis/Kap. Pompa', pumpType);
addDataRow('Posisi Pompa', pumpPosition ? pumpPosition + ' m' : '-');

// Foto Sumur Bor
const fotoH = 50; // Tinggi foto (dikurangi dari 65)
drawCell(tableOffsetX, p2Y, p2LabelW, fotoH);
drawCell(tableOffsetX + p2LabelW, p2Y, p2ValW, fotoH);

// Tulis label "Foto Sumur Bor" - NORMAL
pdf.setFont('helvetica', 'normal');
pdf.setFontSize(8);
const fotoLabelLines = pdf.splitTextToSize('Foto Sumur Bor', p2LabelW - 4);

if (fotoLabelLines.length === 1) {
    pdf.text('Foto Sumur Bor', tableOffsetX + 2, p2Y + (fotoH / 2) + 1.2);
} else {
    let fotoLabelY = p2Y + (fotoH / 2) - ((fotoLabelLines.length - 1) * 4 / 2) + 1.2;
    fotoLabelLines.forEach((line, idx) => {
        pdf.text(line, tableOffsetX + 2, fotoLabelY + (idx * 4));
    });
}

// Tampilkan foto sumur bor
const wellPhotoPreview = document.getElementById('previewImage');
if (wellPhotoPreview && wellPhotoPreview.src && wellPhotoPreview.src !== '#' && wellPhotoPreview.src.startsWith('data:')) {
    try {
        const imgPadding = 4;
        const imgAreaW = p2ValW - (imgPadding * 2);
        const imgAreaH = fotoH - (imgPadding * 2);
        
        let imgWidth, imgHeight;
        if (wellPhotoPreview.naturalWidth && wellPhotoPreview.naturalHeight) {
            imgWidth = wellPhotoPreview.naturalWidth;
            imgHeight = wellPhotoPreview.naturalHeight;
        } else if (wellPhotoPreview.width && wellPhotoPreview.height) {
            imgWidth = wellPhotoPreview.width;
            imgHeight = wellPhotoPreview.height;
        } else {
            imgWidth = 800;
            imgHeight = 600;
        }
        
        const ratio = imgWidth / imgHeight;
        let imgW, imgH;
        
        if (imgAreaW / imgAreaH > ratio) {
            imgH = imgAreaH;
            imgW = imgH * ratio;
        } else {
            imgW = imgAreaW;
            imgH = imgW / ratio;
        }
        
        const imgX = tableOffsetX + p2LabelW + imgPadding + (imgAreaW - imgW) / 2;
        const imgY = p2Y + imgPadding + (imgAreaH - imgH) / 2;
        
        addImageToPDF(pdf, wellPhotoPreview.src, imgX, imgY, imgW, imgH);
        
    } catch (e) {
        console.error('Error adding well photo:', e);
        pdf.setFont('helvetica', 'italic');
        pdf.setFontSize(8);
        pdf.setTextColor(100, 100, 100);
        
        const textX = tableOffsetX + p2LabelW + (p2ValW / 2);
        const textY = p2Y + (fotoH / 2);
        pdf.text('Foto tidak tersedia', textX, textY, { align: 'center' });
        
        pdf.setTextColor(0, 0, 0);
        pdf.setFont('helvetica', 'normal');
    }
} else {
    pdf.setFont('helvetica', 'italic');
    pdf.setFontSize(8);
    pdf.setTextColor(100, 100, 100);
    
    const textX = tableOffsetX + p2LabelW + (p2ValW / 2);
    const textY = p2Y + (fotoH / 2);
    pdf.text('Foto tidak tersedia', textX, textY, { align: 'center' });
    
    pdf.setTextColor(0, 0, 0);
    pdf.setFont('helvetica', 'normal');
}

p2Y += fotoH;

       // =========== HALAMAN 3: DOKUMENTASI KEGIATAN BOREHOLE CAMERA (1/2) ===========
pdf.addPage();

// Header
pdf.setFont('helvetica', 'bold');
pdf.setFontSize(14);
pdf.setTextColor(0, 0, 0);
pdf.text('DOKUMENTASI KEGIATAN BOREHOLE CAMERA', pageW / 2, 20, { align: 'center' });

// Atur posisi awal
let currentY = 35;
const categoryHeight = 70; // Tinggi per kategori
const categorySpacing = 10; // Jarak antar kategori

// Tampilkan 3 kategori pertama (1-3)
for (let i = 1; i <= 3; i++) {
    const categoryKey = `doc${i}`;
    
    // Judul kategori
    pdf.setFont('helvetica', 'bold');
    pdf.setFontSize(9);
    pdf.setTextColor(37, 99, 235);
    pdf.text(`${i}. ${getDocTitle(i)}`, tableOffsetX, currentY);
    
    // Area foto
    const startX = tableOffsetX;
    const startY = currentY + 5;
    const fotoWidth = 45;
    const fotoHeight = 45;
    const fotoSpacing = 6;
    
    // Dapatkan array gambar
    const images = (activityImages && activityImages[categoryKey]) ? activityImages[categoryKey] : [];
    
    if (images.length > 0) {
        // Tampilkan semua foto dalam grid 3 kolom
        const maxFotoPerBaris = 3;
        
        for (let j = 0; j < images.length; j++) {
            const baris = Math.floor(j / maxFotoPerBaris);
            const kolom = j % maxFotoPerBaris;
            
            const imgX = startX + (kolom * (fotoWidth + fotoSpacing));
            const imgY = startY + (baris * (fotoHeight + fotoSpacing));
            
            // Border foto
            pdf.setDrawColor(180, 180, 180);
            pdf.setLineWidth(0.3);
            pdf.rect(imgX, imgY, fotoWidth, fotoHeight, 'S');
            
            try {
                const imgData = images[j].dataUrl;
                
                // Hitung aspect ratio
                let drawW, drawH;
                const padding = 4;
                const imgRatio = 4/3;
                
                if ((fotoWidth - padding) / (fotoHeight - padding) > imgRatio) {
                    drawH = fotoHeight - padding;
                    drawW = drawH * imgRatio;
                } else {
                    drawW = fotoWidth - padding;
                    drawH = drawW / imgRatio;
                }
                
                const drawX = imgX + (fotoWidth - drawW) / 2;
                const drawY = imgY + (fotoHeight - drawH) / 2;
                
                addImageToPDF(pdf, imgData, drawX, drawY, drawW, drawH);
                
                // Nomor urut foto
                pdf.setFont('helvetica', 'bold');
                pdf.setFontSize(8);
                pdf.setTextColor(0, 0, 0);
                pdf.text(`${j + 1}`, imgX + 4, imgY + 10);
                
            } catch (e) {
                pdf.setFont('helvetica', 'italic');
                pdf.setFontSize(7);
                pdf.setTextColor(150, 150, 150);
                pdf.text('Error', imgX + 10, imgY + 25);
            }
        }
    } else {
        // Tidak ada foto
        pdf.setFillColor(245, 245, 245);
        pdf.setDrawColor(200, 200, 200);
        pdf.rect(startX, startY, fotoWidth, fotoHeight, 'FD');
        
        pdf.setFont('helvetica', 'italic');
        pdf.setFontSize(7);
        pdf.setTextColor(150, 150, 150);
        pdf.text('Tidak ada foto', startX + 8, startY + 25);
    }
    
    // Update posisi Y untuk kategori berikutnya
    currentY += categoryHeight + categorySpacing;
}

// =========== HALAMAN 4: DOKUMENTASI KEGIATAN BOREHOLE CAMERA (2/2) ===========
pdf.addPage();

// Header
pdf.setFont('helvetica', 'bold');
pdf.setFontSize(14);
pdf.setTextColor(0, 0, 0);
pdf.text('DOKUMENTASI KEGIATAN BOREHOLE CAMERA', pageW / 2, 20, { align: 'center' });

// Reset posisi Y
currentY = 35;

// Tampilkan 3 kategori sisanya (4-6)
for (let i = 4; i <= 6; i++) {
    const categoryKey = `doc${i}`;
    
    // Judul kategori
    pdf.setFont('helvetica', 'bold');
    pdf.setFontSize(9);
    pdf.setTextColor(37, 99, 235);
    pdf.text(`${i}. ${getDocTitle(i)}`, tableOffsetX, currentY);
    
    // Area foto
    const startX = tableOffsetX;
    const startY = currentY + 5;
    const fotoWidth = 45;
    const fotoHeight = 45;
    const fotoSpacing = 6;
    
    // Dapatkan array gambar
    const images = (activityImages && activityImages[categoryKey]) ? activityImages[categoryKey] : [];
    
    if (images.length > 0) {
        // Tampilkan semua foto dalam grid 3 kolom
        const maxFotoPerBaris = 3;
        
        for (let j = 0; j < images.length; j++) {
            const baris = Math.floor(j / maxFotoPerBaris);
            const kolom = j % maxFotoPerBaris;
            
            const imgX = startX + (kolom * (fotoWidth + fotoSpacing));
            const imgY = startY + (baris * (fotoHeight + fotoSpacing));
            
            // Border foto
            pdf.setDrawColor(180, 180, 180);
            pdf.setLineWidth(0.3);
            pdf.rect(imgX, imgY, fotoWidth, fotoHeight, 'S');
            
            try {
                const imgData = images[j].dataUrl;
                
                // Hitung aspect ratio
                let drawW, drawH;
                const padding = 4;
                const imgRatio = 4/3;
                
                if ((fotoWidth - padding) / (fotoHeight - padding) > imgRatio) {
                    drawH = fotoHeight - padding;
                    drawW = drawH * imgRatio;
                } else {
                    drawW = fotoWidth - padding;
                    drawH = drawW / imgRatio;
                }
                
                const drawX = imgX + (fotoWidth - drawW) / 2;
                const drawY = imgY + (fotoHeight - drawH) / 2;
                
                addImageToPDF(pdf, imgData, drawX, drawY, drawW, drawH);
                
                // Nomor urut foto
                pdf.setFont('helvetica', 'bold');
                pdf.setFontSize(8);
                pdf.setTextColor(0, 0, 0);
                pdf.text(`${j + 1}`, imgX + 4, imgY + 10);
                
            } catch (e) {
                pdf.setFont('helvetica', 'italic');
                pdf.setFontSize(7);
                pdf.setTextColor(150, 150, 150);
                pdf.text('Error', imgX + 10, imgY + 25);
            }
        }
    } else {
        // Tidak ada foto
        pdf.setFillColor(245, 245, 245);
        pdf.setDrawColor(200, 200, 200);
        pdf.rect(startX, startY, fotoWidth, fotoHeight, 'FD');
        
        pdf.setFont('helvetica', 'italic');
        pdf.setFontSize(7);
        pdf.setTextColor(150, 150, 150);
        pdf.text('Tidak ada foto', startX + 8, startY + 25);
    }
    
    // Update posisi Y untuk kategori berikutnya
    currentY += categoryHeight + categorySpacing;
}

        // =========== AKHIR PDF ===========
        pdf.save('laporan_konstruksi_sumur_bor.pdf');
        showNotification('PDF berhasil diunduh!', 'success', 3000);
        
    }, 100);
}

// Ekspor fungsi ke window
window.switchPage = switchPage;
window.updateVisualization = updateVisualization;
window.addSaringan = addSaringan;
window.setOpenHole = setOpenHole;
window.setGroundLevel = setGroundLevel;
window.setMAT = setMAT;
window.hapusGroundLevel = hapusGroundLevel;
window.hapusMAT = hapusMAT;
window.hapusSaringan = hapusSaringan;
window.hapusPipa = hapusPipa;
window.hapusOpenHole = hapusOpenHole;
window.resetAll = resetAll;
window.saveWellData = saveWellData;
window.resetWellData = resetWellData;
window.closeNotification = closeNotification;
window.drawVisualization = drawVisualization;
window.downloadPDF = downloadPDF;
window.resetActivityDocs = resetActivityDocs;
window.saveActivityDocs = saveActivityDocs;
window.deleteActivityImage = deleteActivityImage;
