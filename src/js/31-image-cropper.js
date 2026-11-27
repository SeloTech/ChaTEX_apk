// ============================================================
//  IMAGE CROPPER
//  Лёгкий кроппер в стиле нативного редактора фото (drag + zoom +
//  поворот + отражение), встраивается перед загрузкой стикера/аватарки
//  вместо голой отправки файла как есть.
// ============================================================
let cropState = null; // { img, objUrl, scale, minScale, x, y, rotate, flipX, onDone }

function openImageCropper(file, onDone) {
  const modal = document.getElementById('crop-modal');
  const stage = document.getElementById('crop-stage');
  const imgEl = document.getElementById('crop-img');
  const objUrl = URL.createObjectURL(file);

  cropState = { objUrl, scale: 1, minScale: 1, x: 0, y: 0, rotate: 0, flipX: 1, onDone };

  imgEl.onload = () => {
    const stageRect = stage.getBoundingClientRect();
    const size = stageRect.width; // квадратная область
    const iw = imgEl.naturalWidth, ih = imgEl.naturalHeight;
    // Масштаб, при котором картинка полностью закрывает квадрат (object-fit: cover)
    const minScale = Math.max(size / iw, size / ih);
    cropState.minScale = minScale;
    cropState.scale = minScale;
    cropState.x = (size - iw * minScale) / 2;
    cropState.y = (size - ih * minScale) / 2;
    document.getElementById('crop-zoom').value = 1;
    applyCropTransform();
  };
  imgEl.src = objUrl;

  modal.classList.add('open');
  bindCropDrag(stage);
}

function applyCropTransform() {
  const imgEl = document.getElementById('crop-img');
  if (!cropState) return;
  imgEl.style.transform =
    `translate(${cropState.x}px, ${cropState.y}px) rotate(${cropState.rotate}deg) scale(${cropState.flipX * cropState.scale}, ${cropState.scale})`;
}

function cropSetZoom(sliderVal) {
  if (!cropState) return;
  const stage = document.getElementById('crop-stage');
  const size = stage.getBoundingClientRect().width;
  const imgEl = document.getElementById('crop-img');
  const cx = size / 2, cy = size / 2;
  const oldScale = cropState.scale;
  // slider 1..4 -> реальный масштаб от minScale до minScale*4
  const newScale = cropState.minScale * parseFloat(sliderVal);
  // Зумим относительно центра рамки, чтобы картинка не "убегала"
  const ix = (cx - cropState.x) / oldScale;
  const iy = (cy - cropState.y) / oldScale;
  cropState.scale = newScale;
  cropState.x = cx - ix * newScale;
  cropState.y = cy - iy * newScale;
  clampCropPosition();
  applyCropTransform();
}

function clampCropPosition() {
  const stage = document.getElementById('crop-stage');
  const imgEl = document.getElementById('crop-img');
  const size = stage.getBoundingClientRect().width;
  const iw = imgEl.naturalWidth * cropState.scale;
  const ih = imgEl.naturalHeight * cropState.scale;
  const minX = size - iw, minY = size - ih;
  cropState.x = Math.min(0, Math.max(minX, cropState.x));
  cropState.y = Math.min(0, Math.max(minY, cropState.y));
}

let cropDragBound = false;
function bindCropDrag(stage) {
  if (cropDragBound) return; // слушатели вешаем один раз, состояние живёт в cropState
  cropDragBound = true;
  let dragging = false, startX = 0, startY = 0, origX = 0, origY = 0;
  let pinchStartDist = 0, pinchStartScale = 1;

  const getDist = (t1, t2) => Math.hypot(t1.clientX - t2.clientX, t1.clientY - t2.clientY);

  stage.addEventListener('pointerdown', e => {
    if (!cropState) return;
    dragging = true; stage.setPointerCapture(e.pointerId);
    startX = e.clientX; startY = e.clientY;
    origX = cropState.x; origY = cropState.y;
  });
  stage.addEventListener('pointermove', e => {
    if (!dragging || !cropState) return;
    cropState.x = origX + (e.clientX - startX);
    cropState.y = origY + (e.clientY - startY);
    clampCropPosition();
    applyCropTransform();
  });
  ['pointerup', 'pointercancel', 'pointerleave'].forEach(ev =>
    stage.addEventListener(ev, () => { dragging = false; }));

  stage.addEventListener('wheel', e => {
    if (!cropState) return;
    e.preventDefault();
    const zEl = document.getElementById('crop-zoom');
    const step = e.deltaY < 0 ? 0.08 : -0.08;
    const v = Math.min(4, Math.max(1, parseFloat(zEl.value) + step));
    zEl.value = v; cropSetZoom(v);
  }, { passive: false });

  // Пинч-зум на тачскринах
  stage.addEventListener('touchstart', e => {
    if (e.touches.length === 2) {
      pinchStartDist = getDist(e.touches[0], e.touches[1]);
      pinchStartScale = parseFloat(document.getElementById('crop-zoom').value);
    }
  }, { passive: true });
  stage.addEventListener('touchmove', e => {
    if (e.touches.length === 2 && cropState) {
      e.preventDefault();
      const dist = getDist(e.touches[0], e.touches[1]);
      const zEl = document.getElementById('crop-zoom');
      const v = Math.min(4, Math.max(1, pinchStartScale * (dist / pinchStartDist)));
      zEl.value = v; cropSetZoom(v);
    }
  }, { passive: false });
}

function cropRotate() {
  if (!cropState) return;
  cropState.rotate = (cropState.rotate + 90) % 360;
  applyCropTransform();
}
function cropFlip() {
  if (!cropState) return;
  cropState.flipX *= -1;
  applyCropTransform();
}

function closeImageCropper() {
  document.getElementById('crop-modal').classList.remove('open');
  if (cropState?.objUrl) URL.revokeObjectURL(cropState.objUrl);
  cropState = null;
}

function cropConfirm() {
  if (!cropState) return;
  const stage = document.getElementById('crop-stage');
  const imgEl = document.getElementById('crop-img');
  const size = stage.getBoundingClientRect().width;
  const OUT = 512; // итоговое разрешение стикера/картинки

  const canvas = document.createElement('canvas');
  canvas.width = OUT; canvas.height = OUT;
  const ctx = canvas.getContext('2d');

  // Переносим ту же трансформацию (позиция/масштаб/поворот/флип), что и в
  // превью, на canvas нужного разрешения, отрисовывая изображение как есть.
  const ratio = OUT / size;
  ctx.save();
  ctx.translate(cropState.x * ratio, cropState.y * ratio);
  const cx = 0, cy = 0; // rotate/scale относительно левого верхнего угла картинки, как и в CSS transform-origin:0 0
  ctx.rotate(cropState.rotate * Math.PI / 180);
  ctx.scale(cropState.flipX * cropState.scale * ratio, cropState.scale * ratio);
  ctx.drawImage(imgEl, 0, 0);
  ctx.restore();

  canvas.toBlob(blob => {
    if (!blob) { toast('Не удалось обработать изображение'); return; }
    const onDone = cropState.onDone;
    closeImageCropper();
    onDone(blob);
  }, 'image/png', 0.92);
}
