// ═══════════════════════════════════════════════════════════════
//  AirBridge — QR Scanner (camera-based, uses jsQR)
// ═══════════════════════════════════════════════════════════════

const QRScanner = (() => {
  let stream = null;
  let animFrame = null;
  let onFoundCb = null;
  let scanning = false;

  function start(videoEl, canvasEl, onFound) {
    onFoundCb = onFound;
    scanning = true;

    navigator.mediaDevices.getUserMedia({
      video: { facingMode: { ideal: 'environment' }, width: { ideal: 640 }, height: { ideal: 640 } }
    })
    .then(s => {
      stream = s;
      videoEl.srcObject = s;
      videoEl.setAttribute('playsinline', true);
      videoEl.play();
      videoEl.onloadedmetadata = () => tick(videoEl, canvasEl);
    })
    .catch(err => {
      const msg = err.name === 'NotAllowedError'
        ? 'Camera permission denied. Please allow camera access and try again.'
        : 'Could not access camera: ' + err.message;
      if (window.showToast) showToast(msg, 'error');
      console.error('[QR]', err);
    });
  }

  function tick(videoEl, canvasEl) {
    if (!scanning) return;
    if (videoEl.readyState === videoEl.HAVE_ENOUGH_DATA) {
      const ctx = canvasEl.getContext('2d');
      canvasEl.width = videoEl.videoWidth;
      canvasEl.height = videoEl.videoHeight;
      ctx.drawImage(videoEl, 0, 0, canvasEl.width, canvasEl.height);
      const imageData = ctx.getImageData(0, 0, canvasEl.width, canvasEl.height);
      const code = jsQR(imageData.data, imageData.width, imageData.height, {
        inversionAttempts: 'dontInvert'
      });
      if (code) {
        // Extract room code from URL if full URL, else use raw text
        let text = code.data;
        const match = text.match(/\/room\/([A-Z0-9]{3}-[A-Z0-9]{3})/i);
        if (match) text = match[1];
        if (onFoundCb) onFoundCb(text);
        stop();
        return;
      }
    }
    animFrame = requestAnimationFrame(() => tick(videoEl, canvasEl));
  }

  function stop() {
    scanning = false;
    if (animFrame) cancelAnimationFrame(animFrame);
    if (stream) { stream.getTracks().forEach(t => t.stop()); stream = null; }
  }

  return { start, stop };
})();
