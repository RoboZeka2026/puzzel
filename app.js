const video = document.getElementById('video');
const canvas = document.getElementById('canvas');
const refCanvas = document.getElementById('ref-canvas');
const captureRefBtn = document.getElementById('capture-ref-btn');
const capturePieceBtn = document.getElementById('capture-piece-btn');
const previewContainer = document.getElementById('preview-container');
const statusText = document.getElementById('status');

let refImageMat = null;

const constraints = {
    video: {
        facingMode: { exact: "environment" },
        width: { ideal: 1920 },
        height: { ideal: 1080 },
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

// 1. Kutu Resmini Çek
captureRefBtn.addEventListener('click', () => {
    if (!window.cv) {
        alert("Zeka motoru yükleniyor, birazdan tekrar deneyin.");
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
    
    statusText.innerHTML = "<span style='color:#2ecc71; font-weight:bold;'>Kutu Resmi Kaydedildi!</span><br>Şimdi parçayı halkaya ortalayıp '2. Parçayı Tara' butonuna basın.";
});

// 2. Parçayı Çek
capturePieceBtn.addEventListener('click', () => {
    if (!refImageMat) return;

    const ctx = canvas.getContext('2d');
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
    
    statusText.innerText = "Parça aranıyor...";
    setTimeout(matchPuzzlePiece, 150);
});

// 3. Eşleştir ve Resim Üzerinde İşaretle
function matchPuzzlePiece() {
    try {
        let srcPiece = cv.imread(canvas);
        let grayPiece = new cv.Mat();
        let grayRef = new cv.Mat();

        cv.cvtColor(srcPiece, grayPiece, cv.COLOR_RGBA2GRAY);
        cv.cvtColor(refImageMat, grayRef, cv.COLOR_RGBA2GRAY);

        let orb = new cv.ORB(700); // Nokta sayısını doğruluğu artırmak için 700'e çıkardık
        let keypoints1 = new cv.KeyPointVector();
        let keypoints2 = new cv.KeyPointVector();
        let descriptors1 = new cv.Mat();
        let descriptors2 = new cv.Mat();

        orb.detectAndCompute(grayPiece, new cv.Mat(), keypoints1, descriptors1);
        orb.detectAndCompute(grayRef, new cv.Mat(), keypoints2, descriptors2);

        let bf = new cv.BFMatcher(cv.NORM_HAMMING, true);
        let matches = new cv.DMatchVector();
        bf.match(descriptors1, descriptors2, matches);

        if (matches.size() > 4) {
            let bestMatch = matches.get(0);
            let keypointInRef = keypoints2.get(bestMatch.trainIdx);
            
            let posX = Math.round(keypointInRef.pt.x);
            let posY = Math.round(keypointInRef.pt.y);

            // --- GÖRSEL İŞARETLEYİCİ EKLEME ALANI ---
            // Orijinal kutu resmini canvas'a tekrar temizce çizelim
            cv.imshow('ref-canvas', refImageMat);
            
            // HTML Canvas üzerinde kırmızı bir hedef çemberi çizelim
            const refCtx = refCanvas.getContext('2d');
            
            // Kırmızı büyük bir hedef dairesi
            refCtx.beginPath();
            refCtx.arc(posX, posY, 40, 0, 2 * Math.PI); // 40 piksel yarıçapında daire
            refCtx.lineWidth = 8;
            refCtx.strokeStyle = 'red';
            refCtx.stroke();

            // Tam merkezine küçük bir artı (+) işareti
            refCtx.beginPath();
            refCtx.moveTo(posX - 15, posY);
            refCtx.lineTo(posX + 15, posY);
            refCtx.moveTo(posX, posY - 15);
            refCtx.lineTo(posX, posY + 15);
            refCtx.lineWidth = 4;
            refCtx.strokeStyle = 'red';
            refCtx.stroke();
            // ----------------------------------------

            statusText.innerHTML = `
                <div style="background-color: #27ae60; color: white; padding: 12px; border-radius: 8px;">
                    <strong>🎯 PARÇA BULUNDU!</strong><br>
                    Aşağıdaki resimde <span style="color:yellow; font-weight:bold;">KIRMIZI HEDEF</span> ile gösterilen yere bakın.
                </div>
            `;

            // Telefon ekranını otomatik olarak aşağıdaki resme kaydır ki kullanıcı doğrudan görebilsin
            previewContainer.scrollIntoView({ behavior: 'smooth' });

        } else {
            statusText.innerHTML = `<span style="color:#e74c3c; font-weight:bold;">❌ Eşleşme Sağlanamadı.</span><br>Lütfen ışığı ayarlayıp daha net bir çekim yapın.`;
        }

        srcPiece.delete(); grayPiece.delete(); grayRef.delete();
        orb.delete(); keypoints1.delete(); keypoints2.delete();
        descriptors1.delete(); descriptors2.delete(); bf.delete(); matches.delete();

    } catch (error) {
        console.error(error);
        statusText.innerText = "Hata oluştu, lütfen resmi yenileyin.";
    }
}
