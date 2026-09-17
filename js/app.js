const textInput = document.getElementById("textInput");
const textOverlay = document.getElementById("textOverlay");
const savePngButton = document.getElementById("savePngBtn");
const lrcInput = document.getElementById("lrcInput");
const playButton = document.getElementById("playBtn");
const exportVideoButton = document.getElementById("exportVideoBtn");
const timeline = document.getElementById("timeline");
const timelineScroll = document.querySelector(".timeline-scroll");
const timeOutput = document.getElementById("timeOutput");
const editorStatus = document.getElementById("editorStatus");
const videoPreviewCanvas = document.getElementById("videoPreviewCanvas");
const timelineRuler = document.getElementById("timelineRuler");
const timelineZoom = document.getElementById("timelineZoom");
const tabButtons = document.querySelectorAll(".tab-button");
const modePanels = document.querySelectorAll(".mode-panel");

let lyricLines = [];
let lyricDuration = 0;
let lyricTime = 0;
let animationFrame = 0;
let isPlaying = false;
let trimStart = 0;
let trimEnd = 0;
let pixelsPerSecond = Number(timelineZoom.value);

function selectPanel(panelId) {
    tabButtons.forEach(button => button.classList.toggle("active", button.dataset.panel === panelId));
    modePanels.forEach(panel => panel.classList.toggle("active", panel.id === panelId));
}

function updatePreview() {
    textOverlay.textContent = textInput.value;
}

function parseTimestamp(value) {
    const parts = value.split(":");
    return Number(parts[0]) * 60 + Number(parts[1]);
}

function parseLrc(content) {
    const lines = [];
    for (const rawLine of content.split(/\r?\n/)) {
        const lineMatch = rawLine.match(/^\[(\d{1,2}:\d{2}(?:\.\d{1,3})?)\](.*)$/);
        if (!lineMatch) {
            continue;
        }
        const start = parseTimestamp(lineMatch[1]);
        const body = lineMatch[2].trim();
        const words = [];
        const wordPattern = /<(?<time>\d{1,2}:\d{2}(?:\.\d{1,3})?)>(?<word>[^<]*)/g;
        const firstTagIndex = body.indexOf("<");
        if (firstTagIndex > 0) {
            const firstWord = body.slice(0, firstTagIndex);
            if (firstWord.trim()) {
                words.push({ time: start, text: firstWord });
            }
        }
        let match;
        while ((match = wordPattern.exec(body))) {
            const word = match.groups.word;
            if (word) {
                words.push({ time: parseTimestamp(match.groups.time), text: word });
            }
        }
        lines.push({ start, text: body.replace(/<\d{1,2}:\d{2}(?:\.\d{1,3})?>/g, "").trim(), words });
    }
    lines.sort((a, b) => a.start - b.start);
    return lines.map((line, index) => ({
        ...line,
        end: lines[index + 1]?.start ?? Math.max(line.start + 2, line.words.at(-1)?.time ?? line.start + 2)
    }));
}

function formatTime(seconds) {
    const minutes = Math.floor(seconds / 60);
    const remainder = (seconds % 60).toFixed(2).padStart(5, "0");
    return `${String(minutes).padStart(2, "0")}:${remainder}`;
}

function textAtTime(time) {
    const line = lyricLines.find(item => time >= item.start && time < item.end);
    if (!line) {
        return "";
    }
    if (!line.words.length) {
        return line.text;
    }
    return line.words.filter(word => word.time <= time).map(word => word.text).join("").trim();
}

function wrapCanvasText(context, text, maxWidth) {
    const words = text.trim().split(/\s+/).filter(Boolean);
    const lines = [];
    let current = "";
    for (const word of words) {
        const candidate = current ? `${current} ${word}` : word;
        if (current && context.measureText(candidate).width > maxWidth) {
            lines.push(current);
            current = word;
        } else {
            current = candidate;
        }
    }
    if (current) {
        lines.push(current);
    }
    return lines;
}

function renderVideoCanvas(canvas, text) {
    const context = canvas.getContext("2d");
    const scale = canvas.width / 1080;
    context.clearRect(0, 0, canvas.width, canvas.height);
    context.save();
    context.filter = "blur(2px)";
    context.fillStyle = "#000";
    context.font = `500 ${100 * scale}px Arial Narrow, Arial, sans-serif`;
    context.textAlign = "center";
    context.textBaseline = "middle";
    const lines = wrapCanvasText(context, text, 390 * scale);
    const lineHeight = 100 * scale;
    const startY = canvas.height / 2 - ((lines.length - 1) * lineHeight) / 2;
    lines.forEach((line, index) => {
        context.fillText(line, canvas.width / 2, startY + index * lineHeight);
    });
    context.restore();
}

function renderLyricTime(time) {
    lyricTime = Math.max(0, Math.min(time, lyricDuration));
    timeOutput.value = formatTime(lyricTime);
    const currentText = textAtTime(lyricTime);
    textOverlay.textContent = currentText;
    renderVideoCanvas(videoPreviewCanvas, currentText);
    const playhead = document.querySelector(".playhead");
    if (playhead) {
        playhead.style.left = `${lyricTime * pixelsPerSecond}px`;
    }
    updateHandlePositions();
    document.querySelectorAll(".timeline-segment").forEach(segment => {
        segment.classList.toggle("active", Number(segment.dataset.start) <= lyricTime && Number(segment.dataset.end) > lyricTime);
        segment.classList.toggle("outside", Number(segment.dataset.end) <= trimStart || Number(segment.dataset.start) >= trimEnd);
    });
}

function updateTrim(start, end) {
    trimStart = Math.max(0, Math.min(start, lyricDuration));
    trimEnd = Math.max(trimStart + 0.01, Math.min(end, lyricDuration));
    updateHandlePositions();
    renderLyricTime(Math.max(trimStart, Math.min(lyricTime, trimEnd)));
}

function updateHandlePositions() {
    const inHandle = document.querySelector('[data-handle="in"]');
    const outHandle = document.querySelector('[data-handle="out"]');
    if (inHandle) {
        inHandle.style.left = `${trimStart * pixelsPerSecond}px`;
        inHandle.title = `In ${formatTime(trimStart)}`;
    }
    if (outHandle) {
        outHandle.style.left = `${trimEnd * pixelsPerSecond}px`;
        outHandle.title = `Out ${formatTime(trimEnd)}`;
    }
}

function renderTimeline() {
    const track = document.createElement("div");
    track.className = "timeline-track";
    track.style.width = `${Math.max(100, lyricDuration * pixelsPerSecond)}px`;
    const playhead = document.createElement("div");
    playhead.className = "playhead";
    playhead.addEventListener("pointerdown", event => beginMarkerDrag(event, "playhead"));
    track.appendChild(playhead);
    for (const handleName of ["in", "out"]) {
        const handle = document.createElement("div");
        handle.className = "timeline-handle";
        handle.dataset.handle = handleName;
        handle.addEventListener("pointerdown", event => beginMarkerDrag(event, handleName));
        track.appendChild(handle);
    }
    lyricLines.forEach(line => {
        const segment = document.createElement("div");
        segment.className = "timeline-segment";
        segment.dataset.start = line.start;
        segment.dataset.end = line.end;
        segment.style.left = `${line.start * pixelsPerSecond}px`;
        segment.style.width = `${Math.max(8, (line.end - line.start) * pixelsPerSecond)}px`;
        segment.textContent = line.text || "...";
        segment.title = line.text;
        segment.addEventListener("click", () => renderLyricTime(line.start));
        track.appendChild(segment);
    });
    timeline.replaceChildren(track);
    renderRuler();
    updateHandlePositions();
}

function timeFromPointer(event) {
    const track = document.querySelector(".timeline-track");
    const rect = track.getBoundingClientRect();
    return Math.max(0, Math.min(lyricDuration, (event.clientX - rect.left) / pixelsPerSecond));
}

function beginMarkerDrag(event, marker) {
    event.preventDefault();
    event.stopPropagation();
    const move = moveEvent => {
        const time = timeFromPointer(moveEvent);
        if (marker === "playhead") {
            renderLyricTime(time);
        } else if (marker === "in") {
            updateTrim(Math.min(time, trimEnd - 0.01), trimEnd);
        } else {
            updateTrim(trimStart, Math.max(time, trimStart + 0.01));
        }
    };
    const finish = () => {
        document.removeEventListener("pointermove", move);
        document.removeEventListener("pointerup", finish);
    };
    document.addEventListener("pointermove", move);
    document.addEventListener("pointerup", finish, { once: true });
}

function renderRuler() {
    timelineRuler.replaceChildren();
    timelineRuler.style.width = `${Math.max(100, lyricDuration * pixelsPerSecond)}px`;
    const interval = pixelsPerSecond >= 80 ? 1 : 2;
    for (let second = 0; second <= lyricDuration; second += interval) {
        const tick = document.createElement("span");
        tick.className = "ruler-tick";
        tick.style.left = `${second * pixelsPerSecond}px`;
        tick.textContent = formatTime(second).slice(0, 5);
        timelineRuler.appendChild(tick);
    }
}

function animate(timeStamp) {
    if (!isPlaying) {
        return;
    }
    if (!animate.startedAt) {
        animate.startedAt = timeStamp - lyricTime * 1000;
    }
    renderLyricTime((timeStamp - animate.startedAt) / 1000);
    if (lyricTime >= lyricDuration) {
        isPlaying = false;
        playButton.textContent = "Play";
        animate.startedAt = 0;
        return;
    }
    animationFrame = requestAnimationFrame(animate);
}

function togglePlayback() {
    if (!lyricLines.length) {
        return;
    }
    isPlaying = !isPlaying;
    playButton.textContent = isPlaying ? "Pause" : "Play";
    if (isPlaying) {
        animate.startedAt = 0;
        animationFrame = requestAnimationFrame(animate);
    } else {
        cancelAnimationFrame(animationFrame);
    }
}

function loadLyrics(content, fileName) {
    lyricLines = parseLrc(content);
    lyricDuration = lyricLines.at(-1)?.end ?? 0;
    trimEnd = lyricDuration;
    playButton.disabled = !lyricLines.length;
    exportVideoButton.disabled = !lyricLines.length;
    videoPreviewCanvas.classList.toggle("visible", lyricLines.length > 0);
    renderTimeline();
    updateTrim(0, lyricDuration);
    renderLyricTime(0);
    editorStatus.textContent = lyricLines.length
        ? `${fileName}: ${lyricLines.length} timed lines, ${formatTime(lyricDuration)} total`
        : "No timed lyric lines found.";
    selectPanel("lyricsPanel");
}

function safeFileName(value) {
    const cleaned = value.trim().replace(/[<>:\/\\|?*\u0000-\u001F]/g, "");
    return cleaned || "brat-text";
}

async function saveTransparentPng() {
    savePngButton.disabled = true;

    const exportSurface = document.createElement("div");
    const textClone = textOverlay.cloneNode(true);
    exportSurface.style.cssText = "position:fixed;left:-20000px;top:0;width:1080px;height:1920px;overflow:hidden;background:transparent;";
    textClone.style.cssText = "position:absolute;top:50%;left:50%;width:500px;max-width:500px;height:300px;min-height:0;margin:0;display:flex;align-items:center;justify-content:center;transform:translate(-50%, -50%);";
    exportSurface.appendChild(textClone);
    document.body.appendChild(exportSurface);

    try {
        const canvas = await html2canvas(exportSurface, {
            backgroundColor: null,
            width: 1080,
            height: 1920,
            scale: 1,
            logging: false
        });
        const filteredCanvas = document.createElement("canvas");
        filteredCanvas.width = 1080;
        filteredCanvas.height = 1920;
        const filteredContext = filteredCanvas.getContext("2d");
        filteredContext.filter = getComputedStyle(textOverlay).filter;
        filteredContext.drawImage(canvas, 0, 0);
        const blob = await new Promise(resolve => filteredCanvas.toBlob(resolve, "image/png"));
        const link = document.createElement("a");
        link.download = `${safeFileName(textInput.value)}.png`;
        link.href = URL.createObjectURL(blob);
        document.body.appendChild(link);
        link.click();
        setTimeout(() => {
            URL.revokeObjectURL(link.href);
            link.remove();
        }, 1000);
    } finally {
        exportSurface.remove();
        savePngButton.disabled = false;
    }
}

async function exportTransparentVideo() {
    if (!lyricLines.length) {
        return;
    }
    exportVideoButton.disabled = true;
    const canvas = document.createElement("canvas");
    canvas.width = 1080;
    canvas.height = 1920;
    const frames = [];
    const frameRate = 30;
    const frameDuration = 1 / frameRate;
    const exportDuration = trimEnd - trimStart;
    const frameCount = Math.max(1, Math.ceil(exportDuration * frameRate));
    editorStatus.textContent = `Rendering ${frameCount} transparent frames...`;
    for (let index = 0; index < frameCount; index++) {
        const time = trimStart + index * frameDuration;
        renderVideoCanvas(canvas, textAtTime(time));
        const blob = await new Promise(resolve => canvas.toBlob(resolve, "image/png"));
        const buffer = await blob.arrayBuffer();
        let binary = "";
        const bytes = new Uint8Array(buffer);
        for (let offset = 0; offset < bytes.length; offset += 0x8000) {
            binary += String.fromCharCode(...bytes.subarray(offset, offset + 0x8000));
        }
        frames.push(btoa(binary));
        if (index % 5 === 0 || index === frameCount - 1) {
            editorStatus.textContent = `Rendering ${Math.round(((index + 1) / frameCount) * 100)}%...`;
            await new Promise(resolve => requestAnimationFrame(resolve));
        }
    }
    editorStatus.textContent = "Encoding Apple ProRes 4444 MOV with FFmpeg...";
    try {
        const response = await fetch("/api/export-prores", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                frames,
                frameRate,
                filename: safeFileName(textInput.value || "lyrics")
            })
        });
        if (!response.ok) {
            throw new Error(await response.text());
        }
        const link = document.createElement("a");
        link.download = `${safeFileName(textInput.value || "lyrics")}.mov`;
        link.href = URL.createObjectURL(await response.blob());
        document.body.appendChild(link);
        link.click();
        setTimeout(() => { URL.revokeObjectURL(link.href); link.remove(); }, 1000);
        editorStatus.textContent = "Apple ProRes 4444 MOV export complete.";
    } catch (error) {
        editorStatus.textContent = `MOV export failed: ${error.message}`;
    } finally {
        exportVideoButton.disabled = false;
    }
}

textInput.addEventListener("input", updatePreview);
savePngButton.addEventListener("click", saveTransparentPng);
lrcInput.addEventListener("change", async event => {
    const file = event.target.files[0];
    if (file) {
        loadLyrics(await file.text(), file.name);
    }
});
playButton.addEventListener("click", togglePlayback);
exportVideoButton.addEventListener("click", exportTransparentVideo);
timelineZoom.addEventListener("input", event => {
    pixelsPerSecond = Number(event.target.value);
    if (lyricLines.length) {
        renderTimeline();
        renderLyricTime(lyricTime);
    }
});
timelineScroll.addEventListener("click", event => {
    if (event.target.closest(".timeline-handle")) {
        return;
    }
    renderLyricTime(timeFromPointer(event));
});
timelineScroll.addEventListener("wheel", event => {
    if (event.altKey) {
        event.preventDefault();
        const nextZoom = pixelsPerSecond + (event.deltaY < 0 ? 8 : -8);
        pixelsPerSecond = Math.max(24, Math.min(140, nextZoom));
        timelineZoom.value = pixelsPerSecond;
        if (lyricLines.length) {
            renderTimeline();
            renderLyricTime(lyricTime);
        }
        return;
    }

    event.preventDefault();
    timelineScroll.scrollLeft += event.deltaY || event.deltaX;
}, { passive: false });
window.addEventListener("keydown", event => {
    if (!timelineScroll.matches(":hover") || !lyricLines.length) {
        return;
    }
    if (event.code === "Space") {
        event.preventDefault();
        togglePlayback();
    } else if (event.key.toLowerCase() === "i") {
        event.preventDefault();
        updateTrim(lyricTime, trimEnd);
        editorStatus.textContent = `In marker set to ${formatTime(trimStart)}.`;
    } else if (event.key.toLowerCase() === "o") {
        event.preventDefault();
        updateTrim(trimStart, lyricTime);
        editorStatus.textContent = `Out marker set to ${formatTime(trimEnd)}.`;
    }
});
tabButtons.forEach(button => button.addEventListener("click", () => selectPanel(button.dataset.panel)));
updatePreview();
