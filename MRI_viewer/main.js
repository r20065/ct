console.log('vtk =', window.vtk);
console.log(window.vtk);
console.log(window.vtk.Rendering);

let vtkObj = null;
const vtkGlobal = vtk; // 

cornerstoneWADOImageLoader.external.cornerstone = cornerstone;
cornerstoneWADOImageLoader.external.dicomParser = dicomParser;

const axiDiv = document.getElementById("axial");
cornerstone.enable(axiDiv);

const corCanvas = document.getElementById("coronal");
const sagCanvas = document.getElementById("sagittal");
const corCtx = corCanvas.getContext("2d");
const sagCtx = sagCanvas.getContext("2d");

let volume, cornerstoneImages = [];
let cols, rows, slices, spacingX, spacingY, spacingZ;
let ww = 400, wl = 40;
let zIndex = 0, yIndex = 0, xIndex = 0;

document.getElementById("folderInput").addEventListener("change", async e => {
    const files = [...e.target.files].filter(f => f.name.endsWith(".dcm"));
    if (files.length === 0) return;

    const fm = cornerstoneWADOImageLoader.wadouri.fileManager;
    const loadedImages = await Promise.all(files.map(f => cornerstone.loadImage(fm.add(f))));

    loadedImages.sort((a, b) => {
        const getZ = img => parseFloat(img.data.string('x00200032').split('\\')[2]);
        return getZ(a) - getZ(b);
    });

    cornerstoneImages = loadedImages;
    cols = loadedImages[0].columns;
    rows = loadedImages[0].rows;
    slices = loadedImages.length;

    const ps = loadedImages[0].data.string("x00280030").split("\\").map(Number);
    spacingX = ps[1];
    spacingY = ps[0];
    spacingZ = slices > 1
        ? Math.abs(
            parseFloat(loadedImages[1].data.string('x00200032').split('\\')[2]) -
            parseFloat(loadedImages[0].data.string('x00200032').split('\\')[2])
        )
        : 1.0;

    volume = new Int16Array(cols * rows * slices);
    loadedImages.forEach((img, z) => {
        const slope = img.data.floatString("x00281053") || 1;
        const intercept = img.data.floatString("x00281052") || 0;
        const pixels = img.getPixelData();
        for (let i = 0; i < pixels.length; i++) {
            volume[z * rows * cols + i] = pixels[i] * slope + intercept;
        }
    });
    document.getElementById("infoSize").textContent = `${cols}x${rows}`;
    document.getElementById("infoThickness").textContent = spacingZ.toFixed(1);
    document.getElementById("infoCount").textContent = slices;
    initSliders();
    drawAll();
    initVtk3D();
});

function initSliders() {
    zIndex = Math.floor(slices / 2);
    yIndex = Math.floor(rows / 2);
    xIndex = Math.floor(cols / 2);

    const setup = (id, valId, max, val) => {
        const el = document.getElementById(id);
        el.max = max;
        el.value = val;
        document.getElementById(valId).textContent = val;
    };

    setup('zSlider', 'zVal', slices - 1, zIndex);
    setup('ySlider', 'yVal', rows - 1, yIndex);
    setup('xSlider', 'xVal', cols - 1, xIndex);
}

['wwSlider', 'wlSlider', 'zSlider', 'ySlider', 'xSlider'].forEach(id => {
    document.getElementById(id).oninput = e => {
        const v = +e.target.value;
        if (id === 'wwSlider') { ww = v; wwVal.textContent = v; }
        else if (id === 'wlSlider') { wl = v; wlVal.textContent = v; }
        else if (id === 'zSlider') { zIndex = v; zVal.textContent = v; }
        else if (id === 'ySlider') { yIndex = v; yVal.textContent = v; }
        else if (id === 'xSlider') { xIndex = v; xVal.textContent = v; }

        requestAnimationFrame(drawAll);
    };
});
document.getElementById("showLines").onchange = drawAll;
function huToGray(hu) {
    return Math.min(255, Math.max(0, ((hu - (wl - ww / 2)) / ww) * 255));
}

function drawAll() {
    if (!volume) return;
    drawAxial();
    drawCoronal();
    drawSagittal();
}

function drawAxial() {
    const img = cornerstoneImages[zIndex];
    const viewport = cornerstone.getViewport(axiDiv) || cornerstone.getDefaultViewportForImage(axiDiv, img);
    viewport.voi.windowWidth = ww;
    viewport.voi.windowCenter = wl;
    cornerstone.displayImage(axiDiv, img, viewport);
    cornerstone.fitToWindow(axiDiv);
    setTimeout(() => {
        const canvas = axiDiv.querySelector('canvas');
        if(!canvas || !document.getElementById("showLines").checked) return;
        const ctx = canvas.getContext('2d');
        
        ctx.lineWidth = 1;
        ctx.strokeStyle = 'green'; ctx.beginPath(); ctx.moveTo(0, yIndex ); ctx.lineTo(cols, yIndex ); ctx.stroke();
        ctx.strokeStyle = 'yellow'; ctx.beginPath(); ctx.moveTo(xIndex , 0); ctx.lineTo(xIndex , rows); ctx.stroke();
        
    }, 15);
}

function drawCoronal() {
    const h = Math.round((slices * spacingZ) / spacingX);
    corCanvas.width = cols; corCanvas.height = h;
    const imgData = corCtx.createImageData(cols, h);

    for (let y = 0; y < h; y++) {
        const zf = (h - 1 - y) * (spacingX / spacingZ);
        const z0 = Math.floor(zf), z1 = Math.min(z0 + 1, slices - 1), t = zf - z0;
        for (let x = 0; x < cols; x++) {
            const v0 = volume[z0 * rows * cols + yIndex * cols + x];
            const v1 = volume[z1 * rows * cols + yIndex * cols + x];
            const g = huToGray(v0 * (1 - t) + v1 * t);
            const i = (y * cols + x) * 4;
            imgData.data[i] = imgData.data[i+1] = imgData.data[i+2] = g; imgData.data[i+3] = 255;
        }
    }
    corCtx.putImageData(imgData, 0, 0);
    if(document.getElementById("showLines").checked) {
        corCtx.strokeStyle = 'red'; corCtx.beginPath();
        const lZ = h - 1 - (zIndex * spacingZ / spacingX);
        corCtx.moveTo(0, lZ); corCtx.lineTo(cols, lZ); corCtx.stroke();
        corCtx.strokeStyle = 'yellow'; corCtx.beginPath();
        corCtx.moveTo(xIndex, 0); corCtx.lineTo(xIndex, h); corCtx.stroke();
    }
}

function drawSagittal() {
    const h = Math.round((slices * spacingZ) / spacingY);
    sagCanvas.width = rows; sagCanvas.height = h;
    const imgData = sagCtx.createImageData(rows, h);

    for (let y = 0; y < h; y++) {
        const zf = (h - 1 - y) * (spacingY / spacingZ);
        const z0 = Math.floor(zf), z1 = Math.min(z0 + 1, slices - 1), t = zf - z0;
        for (let x = 0; x < rows; x++) {
            const v0 = volume[z0 * rows * cols + x * cols + xIndex];
            const v1 = volume[z1 * rows * cols + x * cols + xIndex];
            const g = huToGray(v0 * (1 - t) + v1 * t);
            const i = (y * rows + x) * 4;
            imgData.data[i] = imgData.data[i+1] = imgData.data[i+2] = g; imgData.data[i+3] = 255;
        }
    }
    sagCtx.putImageData(imgData, 0, 0);
    if(document.getElementById("showLines").checked) {
        sagCtx.strokeStyle = 'red'; sagCtx.beginPath();
        const lZ = h - 1 - (zIndex * spacingZ / spacingY);
        sagCtx.moveTo(0, lZ); sagCtx.lineTo(rows, lZ); sagCtx.stroke();
        sagCtx.strokeStyle = 'green'; sagCtx.beginPath();
        sagCtx.moveTo(yIndex, 0); sagCtx.lineTo(yIndex, h); sagCtx.stroke();
    }
}
// --- ビューの拡大・縮小制御ロジック ---

document.querySelectorAll('.view-title').forEach(title => {
    title.addEventListener('click', () => {
        const viewGroup = document.getElementById('viewGroup');
        const parentBox = title.parentElement;

        // すでにこの要素が拡大されている場合は解除
        if (viewGroup.classList.contains('max-mode') && parentBox.classList.contains('active')) {
            viewGroup.classList.remove('max-mode');
            parentBox.classList.remove('active');
        } else {
            // 他のactiveを消して、現在のboxをactiveにする
            document.querySelectorAll('.view-box').forEach(box => box.classList.remove('active'));
            viewGroup.classList.add('max-mode');
            parentBox.classList.add('active');
        }

        // 重要：レイアウトが変わったことをCornerstoneに通知してサイズを合わせる
        setTimeout(() => {
            cornerstone.resize(axiDiv);
            drawAll(); // 線と画像を再描画
        }, 50); // アニメーション等の完了を待つために少し待機
    });
});
document.querySelectorAll('.step-btn').forEach(btn => {
    btn.addEventListener('click', () => {
        const slider = document.getElementById(btn.dataset.target);
        const step = Number(btn.dataset.step);

        let v = Number(slider.value) + step;

        // min / max を超えないように
        v = Math.max(Number(slider.min), Math.min(Number(slider.max), v));

        slider.value = v;

        // 既存の oninput をそのまま使う
        slider.dispatchEvent(new Event('input'));
    });
});

/* ===================== vtk.js ===================== */

function initVtk3D() {
    if (!volume) return;
    const container = document.getElementById('vtkContainer');
    if (!container) return;
    container.innerHTML = ''; // 以前の描画をクリア
    const fullScreenRenderer = vtk.Rendering.Misc.vtkFullScreenRenderWindow.newInstance({
        rootContainer: container,
        containerStyle: {
            height: '100%',
            width: '100%',
            position: 'relative', // 要素内に固定
            overflow: 'hidden'
        },
        background: [0, 0, 0]
    });

    const renderer = fullScreenRenderer.getRenderer();
    const renderWindow = fullScreenRenderer.getRenderWindow();

    // ImageData
    const imageData = vtk.Common.DataModel.vtkImageData.newInstance();
    imageData.setDimensions(cols, rows, slices);
    imageData.setSpacing(spacingX, spacingY, spacingZ);

    // ★ ここが超重要
    const scalars = vtk.Common.Core.vtkDataArray.newInstance({
        name: 'CT',
        values: volume,
        numberOfComponents: 1,
    });
    imageData.getPointData().setScalars(scalars);

    // Mapper & Volume
    const mapper = vtk.Rendering.Core.vtkVolumeMapper.newInstance();
    mapper.setInputData(imageData);

    const actor = vtk.Rendering.Core.vtkVolume.newInstance();
    actor.setMapper(mapper);

    // Color Transfer Function
    const ctfun = vtk.Rendering.Core.vtkColorTransferFunction.newInstance();
    ctfun.addRGBPoint(-1000, 0, 0, 0);
    ctfun.addRGBPoint(0, 0.5, 0.5, 0.5);
    ctfun.addRGBPoint(400, 1, 1, 1);

    // Opacity Function
    const ofun = vtk.Common.DataModel.vtkPiecewiseFunction.newInstance();
    ofun.addPoint(-1000, 0.0);
    ofun.addPoint(0, 0.05);
    ofun.addPoint(400, 0.2);

    actor.getProperty().setRGBTransferFunction(0, ctfun);
    actor.getProperty().setScalarOpacity(0, ofun);
    actor.getProperty().setInterpolationTypeToLinear();

    renderer.addVolume(actor);
    renderer.resetCamera();
    renderWindow.render();

    vtkObj = { renderWindow, ctfun, ofun };
}
