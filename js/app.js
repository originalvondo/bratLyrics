const textInput = document.getElementById("textInput");
const textOverlay = document.getElementById("textOverlay");
const savePngButton = document.getElementById("savePngBtn");

function updatePreview() {
    textOverlay.textContent = textInput.value;
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

textInput.addEventListener("input", updatePreview);
savePngButton.addEventListener("click", saveTransparentPng);
updatePreview();
