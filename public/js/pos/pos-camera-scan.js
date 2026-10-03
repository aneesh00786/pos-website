/**
 * THRIVEWOO POS — CAMERA BARCODE SCANNER
 * File: /public/js/pos/pos-camera-scan.js
 */

(function (window) {
  'use strict';

  let _stream = null;
  let _intervalId = null;

  const PosCameraScan = {
    openScannerModal: function () {
      const modalEl = document.getElementById('posCameraScanModal');
      if (typeof bootstrap !== 'undefined' && modalEl) {
        const modal = bootstrap.Modal.getOrCreateInstance(modalEl);
        modal.show();
        this.startCamera();
      }
    },

    startCamera: async function () {
      const video = document.getElementById('pos-camera-video');
      const errorMsg = document.getElementById('pos-camera-error');
      if (errorMsg) errorMsg.style.display = 'none';

      try {
        if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
          throw new Error("Camera API not supported in this browser");
        }

        _stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: 'environment' }
        });

        if (video) {
          video.srcObject = _stream;
          video.play();
        }

        // Use native BarcodeDetector if supported
        if ('BarcodeDetector' in window) {
          const barcodeDetector = new BarcodeDetector({
            formats: ['ean_13', 'ean_8', 'upc_a', 'upc_e', 'code_128', 'code_39', 'qr_code']
          });

          _intervalId = setInterval(async () => {
            if (video && video.readyState === video.HAVE_ENOUGH_DATA) {
              try {
                const barcodes = await barcodeDetector.detect(video);
                if (barcodes.length > 0) {
                  const detectedCode = barcodes[0].rawValue;
                  this.onBarcodeDetected(detectedCode);
                }
              } catch (_) {}
            }
          }, 350);
        }
      } catch (err) {
        console.warn("[PosCameraScan] Camera error:", err);
        if (errorMsg) {
          errorMsg.textContent = "Camera access denied or device not found. Please connect a webcam or use USB/HID scanner.";
          errorMsg.style.display = 'block';
        }
      }
    },

    stopCamera: function () {
      if (_intervalId) clearInterval(_intervalId);
      if (_stream) {
        _stream.getTracks().forEach(t => t.stop());
        _stream = null;
      }
      const video = document.getElementById('pos-camera-video');
      if (video) video.srcObject = null;
    },

    onBarcodeDetected: function (code) {
      this.stopCamera();
      const modalEl = document.getElementById('posCameraScanModal');
      if (typeof bootstrap !== 'undefined' && modalEl) {
        bootstrap.Modal.getInstance(modalEl)?.hide();
      }

      if (window.PosBilling) {
        PosBilling.handleScannedBarcode(code);
      }
    }
  };

  window.PosCameraScan = PosCameraScan;
})(window);
