// Global variables
let currentSessionId = null;
let originalImage = null;
let logoImage = null;
let overlayText = '';
let originalWidth = 0;
let originalHeight = 0;
let currentWidth = 0;
let currentHeight = 0;
let zoomLevel = 1;
let showGrid = true;
let logoSize = 0.15;
let logoPosition = 'top-right';
let textSize = 36;
let textColor = '#ffffff';
let textPosition = 'bottom-center';
let textShadow = true;
let fontFamily = 'Arial';
let fontBold = false;
let fontItalic = false;
let fontUnderline = false;
let textDraggable = false;
let textX = 0;
let textY = 0;
let textWidth = 0;
let textHeight = 0;
let isResizing = false;
let isDragging = false;
let isDraggingText = false;
let isResizingText = false;
let dragStart = null;
let resizeHandle = null;

// DOM elements that are constant
const imageCanvas = document.getElementById('imageCanvas');
const overlayCanvas = document.getElementById('overlayCanvas');
const gridCanvas = document.getElementById('gridCanvas');
const canvasWrapper = document.getElementById('canvasWrapper');
const resizeHandles = document.getElementById('resizeHandles');
const ctx = imageCanvas.getContext('2d');
const overlayCtx = overlayCanvas.getContext('2d');
const gridCtx = gridCanvas.getContext('2d');

// Initialize when DOM is loaded
document.addEventListener('DOMContentLoaded', function() {
    initializeApp();
    setupEventListeners();
});

// Initialize the application state
function initializeApp() {
    enableImageMode();
    document.getElementById('gridToggle').classList.add('active');
    console.log('App initialized');
}

// Setup all event listeners for the application
function setupEventListeners() {
    const uploadBox = document.getElementById('uploadBox');
    const fileInput = document.getElementById('fileInput');
    
    uploadBox.addEventListener('dragover', (e) => {
        e.preventDefault();
        uploadBox.classList.add('dragover');
    });
    
    uploadBox.addEventListener('dragleave', () => {
        uploadBox.classList.remove('dragover');
    });
    
    uploadBox.addEventListener('drop', (e) => {
        e.preventDefault();
        uploadBox.classList.remove('dragover');
        const files = e.dataTransfer.files;
        if (files.length > 0) {
            uploadImage(files[0]);
        }
    });
    
    fileInput.addEventListener('change', (e) => {
        if (e.target.files.length > 0) {
            uploadImage(e.target.files[0]);
        }
    });
    
    const logoInput = document.getElementById('logoInput');
    logoInput.addEventListener('change', (e) => {
        if (e.target.files.length > 0) {
            loadLogo(e.target.files[0]);
        }
    });
    
    document.getElementById('logoSize').addEventListener('input', (e) => {
        logoSize = e.target.value / 100;
        document.getElementById('logoSizeValue').textContent = e.target.value + '%';
        drawOverlays();
    });
    
    document.getElementById('logoPosition').addEventListener('change', (e) => {
        logoPosition = e.target.value;
        drawOverlays();
    });
    
    document.getElementById('overlayText').addEventListener('input', (e) => {
        overlayText = e.target.value;
        if (textDraggable && textX === 0 && textY === 0) {
            initializeTextPosition();
        }
        drawOverlays();
        updateTextHandles();
    });
    
    document.getElementById('textSize').addEventListener('input', (e) => {
        textSize = parseInt(e.target.value);
        document.getElementById('textSizeValue').textContent = e.target.value + 'px';
        drawOverlays();
        updateTextHandles();
    });
    
    document.getElementById('fontFamily').addEventListener('change', (e) => {
        fontFamily = e.target.value;
        drawOverlays();
        updateTextHandles();
    });
    
    document.getElementById('textColor').addEventListener('input', (e) => {
        textColor = e.target.value;
        drawOverlays();
    });
    
    document.getElementById('textPosition').addEventListener('change', (e) => {
        textPosition = e.target.value;
        if (!textDraggable) {
            drawOverlays();
            updateTextHandles();
        }
    });
    
    document.getElementById('textShadow').addEventListener('change', (e) => {
        textShadow = e.target.checked;
        drawOverlays();
    });
    
    document.getElementById('textDraggable').addEventListener('change', (e) => {
        textDraggable = e.target.checked;
        if (textDraggable) {
            enableTextMode();
        } else {
            enableImageMode();
        }
        drawOverlays();
    });
    
    resizeHandles.addEventListener('mousedown', (e) => {
        if (textDraggable) {
            e.preventDefault();
            e.stopPropagation();
            return false;
        }
        if (e.target.classList.contains('resize-handle')) {
            isResizing = true;
            resizeHandle = e.target.dataset.handle;
            dragStart = { x: e.clientX, y: e.clientY };
            e.preventDefault();
        }
    });
    
    imageCanvas.addEventListener('mousedown', (e) => {
        if (textDraggable) {
            e.preventDefault();
            e.stopPropagation();
            return false;
        }
        if (!isResizing) {
            isDragging = true;
            dragStart = { x: e.clientX, y: e.clientY };
            imageCanvas.style.cursor = 'grabbing';
        }
    });
    
    document.getElementById('targetWidth').addEventListener('input', (e) => {
        const newWidth = parseInt(e.target.value) || currentWidth;
        const aspectRatio = originalHeight > 0 ? originalWidth / originalHeight : 1;
        currentWidth = newWidth;
        if (document.getElementById('maintainAspect').checked) {
            currentHeight = Math.round(newWidth / aspectRatio);
            document.getElementById('targetHeight').value = currentHeight;
        }
        setupCanvas();
        drawImage();
        drawOverlays();
        drawGrid();
        updateImageInfo();
    });
    
    document.getElementById('targetHeight').addEventListener('input', (e) => {
        const newHeight = parseInt(e.target.value) || currentHeight;
        const aspectRatio = originalWidth > 0 ? originalHeight / originalWidth : 1;
        currentHeight = newHeight;
        if (document.getElementById('maintainAspect').checked) {
            currentWidth = Math.round(newHeight * aspectRatio);
            document.getElementById('targetWidth').value = currentWidth;
        }
        setupCanvas();
        drawImage();
        drawOverlays();
        drawGrid();
        updateImageInfo();
    });
    
    document.addEventListener('mousemove', (e) => {
        if (isResizingText) handleTextResize(e);
        else if (isDraggingText) handleTextDrag(e);
        else if (isResizing && resizeHandle) handleResize(e);
        else if (isDragging) handleDrag(e);
    });
    
    document.addEventListener('mouseup', () => {
        isResizing = isDragging = isDraggingText = isResizingText = false;
        resizeHandle = dragStart = null;
        imageCanvas.style.cursor = textDraggable ? 'default' : 'move';
    });
}

function uploadImage(file) {
    const formData = new FormData();
    formData.append('file', file);
    
    fetch('/upload', {
        method: 'POST',
        body: formData
    })
    .then(response => response.json())
    .then(data => {
        if (data.success) {
            currentSessionId = data.session_id;
            originalWidth = data.original_width;
            originalHeight = data.original_height;
            currentWidth = originalWidth;
            currentHeight = originalHeight;
            loadImageToCanvas(data.preview_image);
            showControls();
            updateImageInfo();
            document.getElementById('targetWidth').value = originalWidth;
            document.getElementById('targetHeight').value = originalHeight;
        } else {
            showError(data.error);
        }
    })
    .catch(error => showError('Error uploading image: ' + error.message));
}

function loadImageToCanvas(imageData) {
    originalImage = new Image();
    originalImage.onload = function() {
        setupCanvas();
        drawImage();
        drawGrid();
        fitToScreen();
    };
    originalImage.src = imageData;
}

function setupCanvas() {
    [imageCanvas, overlayCanvas, gridCanvas].forEach(canvas => {
        canvas.width = currentWidth;
        canvas.height = currentHeight;
    });
    canvasWrapper.style.width = currentWidth + 'px';
    canvasWrapper.style.height = currentHeight + 'px';
    canvasWrapper.style.display = 'block';
}

function drawImage() {
    ctx.clearRect(0, 0, imageCanvas.width, imageCanvas.height);
    ctx.drawImage(originalImage, 0, 0, currentWidth, currentHeight);
}

function drawOverlays() {
    overlayCtx.clearRect(0, 0, overlayCanvas.width, overlayCanvas.height);
    if (logoImage) drawLogo();
    if (overlayText) drawText();
}

function drawLogo() {
    const logoWidth = currentWidth * logoSize;
    const logoHeight = (logoImage.height / logoImage.width) * logoWidth;
    const padding = 20;
    let x, y;
    switch (logoPosition) {
        case 'top-left': x = padding; y = padding; break;
        case 'top-right': x = currentWidth - logoWidth - padding; y = padding; break;
        case 'bottom-left': x = padding; y = currentHeight - logoHeight - padding; break;
        case 'bottom-right': x = currentWidth - logoWidth - padding; y = currentHeight - logoHeight - padding; break;
        case 'center': x = (currentWidth - logoWidth) / 2; y = (currentHeight - logoHeight) / 2; break;
    }
    overlayCtx.drawImage(logoImage, x, y, logoWidth, logoHeight);
}

function drawText() {
    const lines = overlayText.split('\n');
    let fontStyle = '';
    if (fontItalic) fontStyle += 'italic ';
    if (fontBold) fontStyle += 'bold ';
    overlayCtx.font = `${fontStyle}${textSize}px ${fontFamily}`;
    overlayCtx.fillStyle = textColor;
    let maxWidth = 0;
    const lineHeight = textSize * 1.2;
    lines.forEach(line => {
        const metrics = overlayCtx.measureText(line);
        maxWidth = Math.max(maxWidth, metrics.width);
    });
    const totalHeight = lines.length * lineHeight;
    let baseX, baseY;
    if (textDraggable) {
        baseX = textX;
        baseY = textY + textSize;
        overlayCtx.textAlign = 'left';
        textWidth = maxWidth;
        textHeight = totalHeight;
    } else {
        const padding = 30;
        switch (textPosition) {
            case 'top-left': baseX = padding; baseY = padding + textSize; break;
            case 'top-center': baseX = currentWidth / 2; baseY = padding + textSize; break;
            case 'top-right': baseX = currentWidth - padding; baseY = padding + textSize; break;
            case 'center-left': baseX = padding; baseY = (currentHeight - totalHeight) / 2 + textSize; break;
            case 'center': baseX = currentWidth / 2; baseY = (currentHeight - totalHeight) / 2 + textSize; break;
            case 'center-right': baseX = currentWidth - padding; baseY = (currentHeight - totalHeight) / 2 + textSize; break;
            case 'bottom-left': baseX = padding; baseY = currentHeight - totalHeight - padding + textSize; break;
            case 'bottom-center': baseX = currentWidth / 2; baseY = currentHeight - totalHeight - padding + textSize; break;
            case 'bottom-right': baseX = currentWidth - padding; baseY = currentHeight - totalHeight - padding + textSize; break;
        }
        if (textPosition.includes('left')) overlayCtx.textAlign = 'left';
        else if (textPosition.includes('right')) overlayCtx.textAlign = 'right';
        else overlayCtx.textAlign = 'center';
    }
    lines.forEach((line, index) => {
        const y = baseY + (index * lineHeight);
        if (textShadow) {
            overlayCtx.shadowColor = 'rgba(0, 0, 0, 0.8)';
            overlayCtx.shadowBlur = 4;
            overlayCtx.shadowOffsetX = 2;
            overlayCtx.shadowOffsetY = 2;
        }
        overlayCtx.fillText(line, baseX, y);
        if (fontUnderline) {
            const metrics = overlayCtx.measureText(line);
            const lineWidth = metrics.width;
            let underlineX = baseX;
            if (overlayCtx.textAlign === 'center') underlineX = baseX - lineWidth / 2;
            else if (overlayCtx.textAlign === 'right') underlineX = baseX - lineWidth;
            overlayCtx.beginPath();
            overlayCtx.moveTo(underlineX, y + 4);
            overlayCtx.lineTo(underlineX + lineWidth, y + 4);
            overlayCtx.strokeStyle = textColor;
            overlayCtx.lineWidth = Math.max(1, textSize / 20);
            overlayCtx.stroke();
        }
        overlayCtx.shadowColor = 'transparent';
        overlayCtx.shadowBlur = 0;
        overlayCtx.shadowOffsetX = 0;
        overlayCtx.shadowOffsetY = 0;
    });
}

function loadLogo(file) {
    const reader = new FileReader();
    reader.onload = function(e) {
        logoImage = new Image();
        logoImage.onload = function() {
            drawOverlays();
            document.getElementById('logoControls').style.display = 'block';
            showSuccess('Logo loaded successfully!');
        };
        logoImage.src = e.target.result;
    };
    reader.readAsDataURL(file);
}

function handleTextDrag(e) {
    const deltaX = (e.clientX - dragStart.x) / zoomLevel;
    const deltaY = (e.clientY - dragStart.y) / zoomLevel;
    textX = Math.max(0, Math.min(currentWidth - textWidth, dragStart.textX + deltaX));
    textY = Math.max(0, Math.min(currentHeight - textHeight, dragStart.textY + deltaY));
    drawOverlays();
    updateTextHandles();
}

function handleTextResize(e) {
    const deltaX = e.clientX - dragStart.x;
    const deltaY = e.clientY - dragStart.y;
    const deltaScreen = Math.abs(deltaX) > Math.abs(deltaY) ? deltaX : deltaY;
    const delta = deltaScreen / zoomLevel;
    const newSize = Math.max(12, Math.min(200, Math.round(dragStart.size + delta)));
    if (newSize !== textSize) {
        textSize = newSize;
        document.getElementById('textSize').value = textSize;
        document.getElementById('textSizeValue').textContent = textSize + 'px';
        drawOverlays();
        updateTextHandles();
    }
}

function updateTextHandles() {
    const textHandles = document.getElementById('textHandles');
    if (!textDraggable || !overlayText || !textHandles) {
        if (textHandles) textHandles.style.display = 'none';
        return;
    }
    const tempCtx = document.createElement('canvas').getContext('2d');
    let fontStyle = '';
    if (fontItalic) fontStyle += 'italic ';
    if (fontBold) fontStyle += 'bold ';
    tempCtx.font = `${fontStyle}${textSize}px ${fontFamily}`;
    const lines = overlayText.split('\n');
    let maxWidth = 0;
    lines.forEach(line => {
        maxWidth = Math.max(maxWidth, tempCtx.measureText(line).width);
    });
    textWidth = maxWidth;
    textHeight = lines.length * (textSize * 1.2);
    textHandles.style.left = `${textX}px`;
    textHandles.style.top = `${textY}px`;
    textHandles.style.width = `${textWidth}px`;
    textHandles.style.height = `${textHeight}px`;
    textHandles.style.transform = `scale(${zoomLevel})`;
    textHandles.style.transformOrigin = 'top left';
    textHandles.style.display = 'block';
}

function setupTextHandlers() {
    const textDragHandle = document.getElementById('textDragHandle');
    const textResizeHandle = document.getElementById('textResizeHandle');
    textDragHandle.onmousedown = (e) => {
        e.stopPropagation();
        isDraggingText = true;
        dragStart = { x: e.clientX, y: e.clientY, textX: textX, textY: textY };
    };
    textResizeHandle.onmousedown = (e) => {
        e.stopPropagation();
        isResizingText = true;
        dragStart = { x: e.clientX, y: e.clientY, size: textSize };
    };
}

function enableTextMode() {
    document.getElementById('textPositionControls').style.display = 'none';
    if (overlayText) {
        initializeTextPosition();
        document.getElementById('textHandles').style.display = 'block';
    }
    updateTextHandles();
    setupTextHandlers();
    showSuccess('Text drag & resize enabled');
}

function enableImageMode() {
    document.getElementById('textPositionControls').style.display = 'block';
    const textHandles = document.getElementById('textHandles');
    if (textHandles) {
        textHandles.style.display = 'none';
    }
}

function removeLogo() {
    logoImage = null;
    drawOverlays();
    document.getElementById('logoControls').style.display = 'none';
    document.getElementById('logoInput').value = '';
    showSuccess('Logo removed');
}

function drawGrid() {
    if (!showGrid) {
        gridCtx.clearRect(0, 0, gridCanvas.width, gridCanvas.height);
        return;
    }
    gridCtx.clearRect(0, 0, gridCanvas.width, gridCanvas.height);
    gridCtx.strokeStyle = 'rgba(255, 255, 255, 0.1)';
    gridCtx.lineWidth = 1;
    const gridSize = 20;
    for (let x = 0; x <= gridCanvas.width; x += gridSize) {
        gridCtx.beginPath();
        gridCtx.moveTo(x, 0);
        gridCtx.lineTo(x, gridCanvas.height);
        gridCtx.stroke();
    }
    for (let y = 0; y <= gridCanvas.height; y += gridSize) {
        gridCtx.beginPath();
        gridCtx.moveTo(0, y);
        gridCtx.lineTo(gridCanvas.width, y);
        gridCtx.stroke();
    }
}

function toggleFontStyle(style) {
    const button = document.getElementById(`font${style.charAt(0).toUpperCase() + style.slice(1)}`);
    if (style === 'bold') {
        fontBold = !fontBold;
        button.style.background = fontBold ? '#4facfe' : '#444';
    } else if (style === 'italic') {
        fontItalic = !fontItalic;
        button.style.background = fontItalic ? '#4facfe' : '#444';
    } else if (style === 'underline') {
        fontUnderline = !fontUnderline;
        button.style.background = fontUnderline ? '#4facfe' : '#444';
    }
    drawOverlays();
    updateTextHandles();
}

function initializeTextPosition() {
    if (textX === 0 && textY === 0) {
        textX = Math.max(50, (currentWidth / 2) - 100);
        textY = Math.max(50, (currentHeight / 2) - (textSize / 2));
    }
}

function handleResize(e) {
    const maintainAspect = document.getElementById('maintainAspect').checked;
    const deltaX = e.clientX - dragStart.x;
    const deltaY = e.clientY - dragStart.y;
    let newWidth = currentWidth;
    let newHeight = currentHeight;
    const scaledDeltaX = deltaX / zoomLevel;
    const scaledDeltaY = deltaY / zoomLevel;

    if (['e', 'w'].includes(resizeHandle)) newWidth += (resizeHandle === 'e' ? scaledDeltaX : -scaledDeltaX);
    if (['n', 's'].includes(resizeHandle)) newHeight += (resizeHandle === 's' ? scaledDeltaY : -scaledDeltaY);

    if (['ne', 'nw', 'se', 'sw'].includes(resizeHandle)) {
        if (maintainAspect) {
            let scale;
            if (Math.abs(scaledDeltaX) > Math.abs(scaledDeltaY)) {
                scale = (currentWidth + (resizeHandle.includes('e') ? scaledDeltaX : -scaledDeltaX)) / currentWidth;
            } else {
                scale = (currentHeight + (resizeHandle.includes('s') ? scaledDeltaY : -scaledDeltaY)) / currentHeight;
            }
            newWidth = currentWidth * scale;
            newHeight = currentHeight * scale;
        } else {
            if (resizeHandle.includes('e')) newWidth += scaledDeltaX;
            if (resizeHandle.includes('w')) newWidth -= scaledDeltaX;
            if (resizeHandle.includes('s')) newHeight += scaledDeltaY;
            if (resizeHandle.includes('n')) newHeight -= scaledDeltaY;
        }
    }

    currentWidth = Math.round(Math.max(50, newWidth));
    currentHeight = Math.round(Math.max(50, newHeight));
    setupCanvas();
    drawImage();
    drawOverlays();
    drawGrid();
    updateImageInfo();
    updateInputs();
    dragStart = { x: e.clientX, y: e.clientY };
}

function handleDrag(e) {
    const deltaX = e.clientX - dragStart.x;
    const deltaY = e.clientY - dragStart.y;
    const rect = canvasWrapper.getBoundingClientRect();
    canvasWrapper.style.left = '50%';
    canvasWrapper.style.top = '50%';
    canvasWrapper.style.transform = `translate(calc(-50% + ${deltaX}px), calc(-50% + ${deltaY}px))`;
    dragStart = { x: e.clientX, y: e.clientY };
}

function zoomIn() {
    zoomLevel = Math.min(zoomLevel * 1.2, 5);
    applyZoom();
}

function zoomOut() {
    zoomLevel = Math.max(zoomLevel / 1.2, 0.1);
    applyZoom();
}

function fitToScreen() {
    const container = document.getElementById('canvasContainer');
    const containerRect = container.getBoundingClientRect();
    const padding = 100;
    const maxWidth = containerRect.width - padding;
    const maxHeight = containerRect.height - padding;
    const scaleX = currentWidth > 0 ? maxWidth / currentWidth : 1;
    const scaleY = currentHeight > 0 ? maxHeight / currentHeight : 1;
    zoomLevel = Math.min(scaleX, scaleY);
    applyZoom();
}

function applyZoom() {
    canvasWrapper.style.transform = `translate(-50%, -50%) scale(${zoomLevel})`;
    document.getElementById('zoomLevel').textContent = Math.round(zoomLevel * 100) + '%';
    updateTextHandles();
}

function toggleGrid() {
    showGrid = !showGrid;
    document.getElementById('gridToggle').classList.toggle('active', showGrid);
    drawGrid();
}

function applyPreset(presetName, event) {
    fetch(`/preset/${presetName}`)
    .then(response => response.json())
    .then(data => {
        if (data.width && data.height) {
            currentWidth = data.width;
            currentHeight = data.height;
            document.getElementById('targetWidth').value = currentWidth;
            document.getElementById('targetHeight').value = currentHeight;
            setupCanvas();
            drawImage();
            drawOverlays();
            drawGrid();
            updateImageInfo();
            document.querySelectorAll('.preset-btn').forEach(btn => btn.classList.remove('active'));
            event.target.closest('.preset-btn').classList.add('active');
        }
    });
}

function applyResize() {
    if (!currentSessionId) return;

    const applyBtn = document.getElementById('applyBtn');
    applyBtn.textContent = '🔄 Applying...';
    applyBtn.disabled = true;

    const outputFormat = document.getElementById('outputFormat').value;
    
    let logoData = null;
    if (logoImage) {
        const tempCanvas = document.createElement('canvas');
        const tempCtx = tempCanvas.getContext('2d');
        tempCanvas.width = logoImage.width;
        tempCanvas.height = logoImage.height;
        tempCtx.drawImage(logoImage, 0, 0);
        logoData = tempCanvas.toDataURL('image/png');
    }
    
    const requestData = {
        session_id: currentSessionId,
        width: currentWidth,
        height: currentHeight,
        maintain_aspect: document.getElementById('maintainAspect').checked,
        format: outputFormat,
        overlay_data: {
            logo: logoData,
            logo_size: logoSize,
            logo_position: logoPosition,
            text: overlayText,
            text_size: textSize,
            text_color: textColor,
            text_shadow: textShadow,
            font_family: fontFamily,
            font_bold: fontBold,
            font_italic: fontItalic,
            font_underline: fontUnderline,
            text_draggable: textDraggable,
            text_position: textDraggable ? null : textPosition,
            text_x: textDraggable ? textX : null,
            text_y: textDraggable ? textY : null
        }
    };
    
    fetch('/resize', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(requestData)
    })
    .then(response => response.json())
    .then(data => {
        if (data.success) {
            const canvasContainer = document.getElementById('canvasContainer');
            document.getElementById('canvasWrapper').style.display = 'none';

            const previewImage = document.createElement('img');
            previewImage.src = data.preview_image;
            previewImage.style.maxWidth = '90%';
            previewImage.style.maxHeight = '90%';
            previewImage.style.border = '2px solid #555';

            canvasContainer.innerHTML = ''; 
            canvasContainer.appendChild(previewImage);
            
            document.getElementById('downloadBtn').disabled = false;
            showSuccess('Preview generated! Ready to download.');
        } else {
            showError(data.error);
        }
    })
    .catch(error => {
        showError('Error applying resize: ' + error.message);
    })
    .finally(() => {
        applyBtn.textContent = '🔄 Apply Resize';
        applyBtn.disabled = false;
    });
}

function downloadImage() {
    if (!currentSessionId) return;
    const link = document.createElement('a');
    const format = document.getElementById('outputFormat').value.toLowerCase();
    link.href = `/download/${currentSessionId}?format=${format}`;
    link.download = `resized_image.${format}`;
    link.click();
}

function updateImageInfo() {
    document.getElementById('originalSize').textContent = `${originalWidth} × ${originalHeight}`;
    document.getElementById('currentSize').textContent = `${currentWidth} × ${currentHeight}`;
    const scale = (originalWidth > 0) ? Math.round((currentWidth / originalWidth) * 100) : 100;
    document.getElementById('scaleInfo').textContent = `${scale}%`;
}

function updateInputs() {
    document.getElementById('targetWidth').value = currentWidth;
    document.getElementById('targetHeight').value = currentHeight;
}

function showControls() {
    ['imageInfoSection', 'resizeSection', 'presetsSection', 'overlaySection', 'actionsSection'].forEach(id => {
        document.getElementById(id).style.display = 'block';
    });
}

function showError(message) {
    const errorDiv = document.createElement('div');
    errorDiv.className = 'error-message';
    errorDiv.textContent = message;
    const sidebar = document.querySelector('.sidebar');
    sidebar.insertBefore(errorDiv, sidebar.firstChild);
    setTimeout(() => errorDiv.remove(), 5000);
}

function showSuccess(message) {
    const successDiv = document.createElement('div');
    successDiv.className = 'success-message';
    successDiv.textContent = message;
    const sidebar = document.querySelector('.sidebar');
    sidebar.insertBefore(successDiv, sidebar.firstChild);
    setTimeout(() => successDiv.remove(), 3000);
}