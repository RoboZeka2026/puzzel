const video = document.getElementById('video');
const canvas = document.getElementById('canvas');
const refCanvas = document.getElementById('ref-canvas');
const captureRefBtn = document.getElementById('capture-ref-btn');
const capturePieceBtn = document.getElementById('capture-piece-btn');
const previewContainer = document.getElementById('preview-container');
const statusText = document.getElementById('status');

let refImageMat = null;

// Mobil için ideal kamera ayarları
const constraints = {
    video: {
        facingMode: { exact: "environment" },
        width: { ideal: 1280 }, // Hız ve doğruluk dengesi için 720p-1080p arası idealdir
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

// 1. Kutu Resmini Çek
captureRefBtn.addEventListener('click', () => {
    if (!window.cv || !cv.Mat) {
        alert("Zeka motoru (OpenCV) henüz tamamen yüklenmedi, birkaç saniye sonra tekrar deneyin.");
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
    
    statusText.innerText = "Parça analiz ediliyor ve aranıyor...";
    setTimeout(matchPuzzlePiece, 150);
});

// 3. Gelişmiş Eşleştirme Algoritması (Homografi ve RANSAC filtreli)
function matchPuzzlePiece() {
    try {
        let srcPiece = cv.imread(canvas);
        let grayPiece = new cv.Mat();
        let grayRef = new cv.Mat();

        // Renk uzayını gri tonlamaya çevir (Hız ve performans için)
        cv.cvtColor(srcPiece, grayPiece, cv.COLOR_RGBA2GRAY);
        cv.cvtColor(refImageMat, grayRef, cv.COLOR_RGBA2GRAY);

        // ORB Nesne algılayıcı (Detay algılamayı 1000 noktaya çıkardık)
        let orb = new cv.ORB(1000, 1.2, 8, 31, 0, 2, cv.ORB_HARRIS_SCORE, 31, 20);
        let keypoints1 = new cv.KeyPointVector();
        let keypoints2 = new cv.KeyPointVector();
        let descriptors1 = new cv.Mat();
        let descriptors2 = new cv.Mat();

        orb.detectAndCompute(grayPiece, new cv.Mat(), keypoints1, descriptors1);
        orb.detectAndCompute(grayRef, new cv.Mat(), keypoints2, descriptors2);

        if (descriptors1.empty() || descriptors2.empty()) {
            statusText.innerHTML = `<span style="color:#e74c3c; font-weight:bold;">❌ Görüntü çok belirsiz.</span><br>Parçayı daha iyi ışıkta tekrar çekin.`;
            // Belleği temizle
            cleanup([srcPiece, grayPiece, grayRef, orb, keypoints1, keypoints2, descriptors1, descriptors2]);
            return;
        }

        // Brute-Force Eşleştirici
        let bf = new cv.BFMatcher(cv.NORM_HAMMING, true);
        let matches = new cv.DMatchVector();
        bf.match(descriptors1, descriptors2, matches);

        // En iyi eşleşmeleri mesafelerine göre sırala
        let matchesArray = [];
        for (let i = 0; i < matches.size(); i++) {
            matchesArray.push(matches.get(i));
        }
        matchesArray.sort((a, b) => a.distance - b.distance);

        // Sadece en kaliteli eşleşmeleri filtrele (Maksimum ilk 50 nokta)
        let goodMatches = matchesArray.slice(0, Math.min(50, matchesArray.length));

        // Yanıltıcı eşleşmeleri (Outliers) temizlemek ve geometrik doğrulamak için en az 8 iyi nokta şartı
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

            // RANSAC yöntemi ile hatalı noktaları ayıklayıp dönüşüm matrisini buluyoruz
            let mask = new cv.Mat();
            let H = cv.findHomography(mat1, mat2, cv.RANSAC, 5.0, mask);

            // Maske içindeki başarılı (inlier) nokta sayısını sayalım
            let inlierCount = 0;
            for (let i = 0; i < mask.rows; i++) {
                if (mask.data[i] === 1) inlierCount++;
            }

            // Eğer RANSAC sonrasında da yeterli tutarlı nokta kaldıysa nesne kesin oradadır
            if (!H.empty() && inlierCount > 5) {
                // Kutu görselini canvas'a temizce geri yükle
                cv.imshow('ref-canvas', refImageMat);
                const refCtx = refCanvas.getContext('2d');

                // Arama alanının ortalama merkez koordinatını hesapla
                let avgX = 0, avgY = 0;
                let validPoints = 0;
                for (let i = 0; i < goodMatches.length; i++) {
                    if (mask.data[i] === 1) {
                        let pt = keypoints2.get(goodMatches[i].trainIdx).pt;
                        avgX += pt.x;
                        avgY += pt.y;
                        validPoints++;
                    }
                }
                avgX = Math.round(avgX / validPoints);
                avgY = Math.round(avgY / validPoints);

                // GÖRSEL İŞARETLEME: Bölgeye şık bir hedef çemberi ve artı yerleştir
                refCtx.beginPath();
                refCtx.arc(avgX, avgY, 45, 0, 2 * Math.PI);
                refCtx.lineWidth = 6;
                refCtx.strokeStyle = '#e74c3c'; // Canlı kırmızı
                refCtx.shadowColor = 'black';
                refCtx.shadowBlur = 10;
                refCtx.stroke();

                // Merkezdeki hassas artı (+) çizgisi
                refCtx.beginPath();
                refCtx.moveTo(avgX - 15, avgY); refCtx.lineTo(avgX + 15, avgY);
                refCtx.moveTo(avgX, avgY - 15); refCtx.lineTo(avgX, avgY + 15);
                refCtx.lineWidth = 3;
                refCtx.strokeStyle = '#ffffff'; // İç artı beyaz olsun ki kırmızı üstünde net görünsün
                refCtx.stroke();
                refCtx.shadowBlur = 0; // Gölgeyi sıfırla

                statusText.innerHTML = `
                    <div style="background-color: #27ae60; color: white; padding: 12px; border-radius: 8px; box-shadow: 0 4px 10px rgba(0,0,0,0.3)">
                        <strong>🎯 PARÇA BULUNDU! (%${Math.min(100, Math.round((inlierCount/goodMatches.length)*100))})</strong><br>
                        Aşağıdaki referans kutu resminde <span style="color:yellow; font-weight:bold;">HEDEFLENEN ALANA</span> bakın.
                    </div>
                `;
                previewContainer.scrollIntoView({ behavior: 'smooth' });
            } else {
                statusText.innerHTML = `<span style="color:#e74c3c; font-weight:bold;">❌ Parça eşleşmedi.</span><br>Kutudaki doğru bölgeye yaklaştığınızdan veya ışığın açısını değiştirdiğinizden emin olun.`;
            }

            // Döngü içi OpenCV matrislerini temizle
            mat1.delete(); mat2.delete(); mask.delete(); H.delete();
        } else {
            statusText.innerHTML = `<span style="color:#e74c3c; font-weight:bold;">❌ Yetersiz ortak nokta.</span><br>Parçayı vizörün tam ortasına getirip tekrar taratın.`;
        }

        // Genel Bellek Temizliği
        cleanup([srcPiece, grayPiece, grayRef, orb, keypoints1, keypoints2, descriptors1, descriptors2, Pigeon = bf, matches]);

    } catch (error) {
        console.error(error);
        statusText.innerText = "Sistemsel bir hata oluştu. Lütfen tekrar deneyin.";
    }
}

// Memory leak (bellek sızıntısı) önleyici yardımcı fonksiyon
function cleanup(matrices) {
    matrices.forEach(m => {
        if (m && typeof m.delete === 'function') {
            try { m.delete(); } catch(e) {}
        }
    });
}
