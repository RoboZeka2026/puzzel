const video = document.getElementById('video');
const canvas = document.getElementById('canvas');
const refCanvas = document.getElementById('ref-canvas');
const zoomCanvas = document.getElementById('zoom-canvas'); // Zoom için yeni canvas
const captureRefBtn = document.getElementById('capture-ref-btn');
const capturePieceBtn = document.getElementById('capture-piece-btn');
const previewContainer = document.getElementById('preview-container');
const zoomContainer = document.getElementById('zoom-container');
const statusText = document.getElementById('status');

let refImageMat = null;

const constraints = {
    video: {
        facingMode: { exact: "environment" },
        width: { ideal: 1280 },
        height: { ideal: 720 },
        advanced: [{ focusMode: "continuous" }]
    }
};

navigator.mediaDevices.getUserMedia(constraints)
    .then(stream => { 
        video.srcObject = stream; 
        statusText.innerText = "Sistem Hazır! Önce kutu resmini çekin.";
    })
    .catch(err => {
        navigator.mediaDevices.getUserMedia({ video: { facingMode: "environment" } })
            .then(stream => { video.srcObject = stream; })
            .catch(e => { statusText.innerText = "Kamera açılamadı."; });
    });

// 1. Kutu Resmini Kaydet
captureRefBtn.addEventListener('click', () => {
    if (!window.cv || !cv.Mat) {
        alert("Zeka motoru yükleniyor, lütfen bekleyin.");
        return;
    }

    const refCtx = refCanvas.getContext('2d');
    refCanvas.width = video.videoWidth;
    refCanvas.height = video.videoHeight;
    refCtx.drawImage(video, 0, 0, refCanvas.width, refCanvas.height);
    
    if (refImageMat) refImageMat.delete();
    refImageMat = cv.imread(refCanvas);
    
    previewContainer.style.display = "block";
    capturePieceBtn.disabled = false;
    capturePieceBtn.style.backgroundColor = "#2ecc71";
    capturePieceBtn.style.color = "white";
    
    statusText.innerHTML = "<span style='color:#2ecc71; font-weight:bold;'>Kutu Kaydedildi!</span><br>Parçayı vizöre ortalayıp '2. Parçayı Tara' butonuna basın.";
});

// 2. Parçayı Tara
capturePieceBtn.addEventListener('click', () => {
    if (!refImageMat) return;

    const ctx = canvas.getContext('2d');
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
    
    statusText.innerText = "Parça aranıyor ve zoomlanıyor...";
    setTimeout(matchPuzzlePiece, 150);
});

// 3. Eşleştir, Kırp ve Zoom Yap
function matchPuzzlePiece() {
    try {
        let srcPiece = cv.imread(canvas);
        let grayPiece = new cv.Mat();
        let grayRef = new cv.Mat();

        cv.cvtColor(srcPiece, grayPiece, cv.COLOR_RGBA2GRAY);
        cv.cvtColor(refImageMat, grayRef, cv.COLOR_RGBA2GRAY);

        let orb = new cv.ORB(1000, 1.2, 8, 31, 0, 2, cv.ORB_HARRIS_SCORE, 31, 20);
        let keypoints1 = new cv.KeyPointVector();
        let keypoints2 = new cv.KeyPointVector();
        let descriptors1 = new cv.Mat();
        let descriptors2 = new cv.Mat();

        orb.detectAndCompute(grayPiece, new cv.Mat(), keypoints1, descriptors1);
        orb.detectAndCompute(grayRef, new cv.Mat(), keypoints2, descriptors2);

        if (descriptors1.empty() || descriptors2.empty()) {
            statusText.innerHTML = `<span style="color:#e74c3c; font-weight:bold;">❌ Net değil.</span> Parçayı daha iyi ışıkta çekin.`;
            cleanup([srcPiece, grayPiece, grayRef, orb, keypoints1, keypoints2, descriptors1, descriptors2]);
            return;
        }

        let bf = new cv.BFMatcher(cv.NORM_HAMMING, true);
        let matches = new cv.DMatchVector();
        bf.match(descriptors1, descriptors2, matches);

        let matchesArray = [];
        for (let i = 0; i < matches.size(); i++) {
            matchesArray.push(matches.get(i));
        }
        matchesArray.sort((a, b) => a.distance - b.distance);
        let goodMatches = matchesArray.slice(0, Math.min(50, matchesArray.length));

        if (goodMatches.length > 8) {
            let points1 = [];
            let points2 = [];
            for (let i = 0; i < goodMatches.length; i++) {
                points1.push(keypoints1.get(goodMatches[i].queryIdx).pt.x);
                points1.push(keypoints1.get(goodMatches[i].queryIdx).pt.y);
                points2.push(keypoints2.get(goodMatches[i].trainIdx).pt.x);
                points2.push(keypoints2.get(goodMatches[i].trainIdx).pt.y);
            }

            let mat1 = cv.matFromArray(points1.length / 2, 1, cv.CV_32FC2, points1);
            let mat2 = cv.matFromArray(points2.length / 2, 1, cv.CV_32FC2, points2);
            let mask = new cv.Mat();
            let H = cv.findHomography(mat1, mat2, cv.RANSAC, 5.0, mask);

            let inlierCount = 0;
            let avgX = 0, avgY = 0;
            for (let i = 0; i < mask.rows; i++) {
                if (mask.data[i] === 1) {
                    inlierCount++;
                    let pt = keypoints2.get(goodMatches[i].trainIdx).pt;
                    avgX += pt.x;
                    avgY += pt.y;
                }
            }

            if (!H.empty() && inlierCount > 5) {
                avgX = Math.round(avgX / inlierCount);
                avgY = Math.round(avgY / inlierCount);

                // --- 🔍 AKILLI ZOOM VE KIRPMA ALGORİTMASI ---
                // Parçanın etrafında 200x200 piksellik bir zoom penceresi belirle
                let zoomSize = 200; 
                let startX = Math.max(0, avgX - zoomSize / 2);
                let startY = Math.max(0, avgY - zoomSize / 2);
                
                // Kutu taşmalarını engelle
                if (startX + zoomSize > refImageMat.cols) startX = refImageMat.cols - zoomSize;
                if (startY + zoomSize > refImageMat.rows) startY = refImageMat.rows - zoomSize;

                let rect = new cv.Rect(startX, startY, zoomSize, zoomSize);
                let croppedMat = refImageMat.roi(rect); // Bölgeyi matris olarak kırp

                // Ekrana kırpılan zoom alanını bas
                zoomContainer.style.display = "block";
                cv.imshow('zoom-canvas', croppedMat);
                croppedMat.delete();

                // Zoom yapılan alana dev bir hedef dairesi çiz (Kullanıcı nokta atışı görsün)
                const zoomCtx = zoomCanvas.getContext('2d');
                let localX = avgX - startX;
                let localY = avgY - startY;

                zoomCtx.beginPath();
                zoomCtx.arc(localX, localY, 25, 0, 2 * Math.PI);
                zoomCtx.lineWidth = 5;
                zoomCtx.strokeStyle = '#e74c3c';
                zoomCtx.stroke();
                
                // Artı işareti
                zoomCtx.beginPath();
                zoomCtx.moveTo(localX - 10, localY); zoomCtx.lineTo(localX + 10, localY);
                zoomCtx.moveTo(localX, localY - 10); zoomCtx.lineTo(localX, localY + 10);
                zoomCtx.lineWidth = 3;
                zoomCtx.strokeStyle = '#fff';
                zoomCtx.stroke();
                // ---------------------------------------------

                // Genel kutuda da yerini ufakça işaretle
                cv.imshow('ref-canvas', refImageMat);
                const refCtx = refCanvas.getContext('2d');
                refCtx.beginPath();
                refCtx.arc(avgX, avgY, 30, 0, 2 * Math.PI);
                refCtx.lineWidth = 4;
                refCtx.strokeStyle = 'yellow';
                refCtx.stroke();

                statusText.innerHTML = `
                    <div style="background-color: #27ae60; color: white; padding: 12px; border-radius: 8px;">
                        <strong>🎯 PARÇA BULUNDU VE ZOOM YAPILDI!</strong><br>
                        Büyüteç altındaki bölgeyi kutuda bularak yerleştirin.
                    </div>
                `;
                zoomContainer.scrollIntoView({ behavior: 'smooth' });

            } else {
                statusText.innerHTML = `<span style="color:#e74c3c; font-weight:bold;">❌ Eşleşme başarısız.</span><br>Açıyı veya ışığı değiştirip tekrar deneyin.`;
            }
            mat1.delete(); mat2.delete(); mask.delete(); H.delete();
        } else {
            statusText.innerHTML = `<span style="color:#e74c3c; font-weight:bold;">❌ Nokta bulunamadı.</span> Görüş alanını kontrol edin.`;
        }

        cleanup([srcPiece, grayPiece, grayRef, orb, keypoints1, keypoints2, descriptors1, descriptors2, bf, matches]);
    } catch (error) {
        console.error(error);
        statusText.innerText = "Hata oluştu, lütfen resmi yenileyip deneyin.";
    }
}

function cleanup(matrices) {
    matrices.forEach(m => {
        if (m && typeof m.delete === 'function') {
            try { m.delete(); } catch(e) {}
        }
    });
}
