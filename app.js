const video = document.getElementById('video');
const canvas = document.getElementById('canvas');
const refCanvas = document.getElementById('ref-canvas');
const captureRefBtn = document.getElementById('capture-ref-btn');
const capturePieceBtn = document.getElementById('capture-piece-btn');
const previewContainer = document.getElementById('preview-container');
const statusText = document.getElementById('status');

let refImageMat = null;

// Mobil Arka Kamerayı En Yüksek Kalitede Açma Ayarları
const constraints = {
    video: {
        facingMode: { exact: "environment" }, // Kesinlikle arka kamera
        width: { ideal: 1920 }, // 1000'lik bulmaca detayları için yüksek çözünürlük
        height: { ideal: 1080 },
        advanced: [{ focusMode: "continuous" }] // Sürekli otomatik odaklama (Destekleyen cihazlar için)
    }
};

// Kamerayı Başlat
navigator.mediaDevices.getUserMedia(constraints)
    .then(stream => { 
        video.srcObject = stream; 
        statusText.innerText = "Sistem Hazır! Kamerayı kutu resmine dik tutup '1. Kutu Resmini Çek' butonuna basın.";
    })
    .catch(err => {
        console.log("Birinci kamera yöntemi başarısız, alternatif deneniyor...");
        // Eğer exact environment hata verirse (bazı eski Android tarayıcılarda), normal arka kamerayı dene:
        navigator.mediaDevices.getUserMedia({ video: { facingMode: "environment" } })
            .then(stream => { video.srcObject = stream; })
            .catch(e => { statusText.innerText = "Kamera izni verilmedi veya arka kamera bulunamadı."; });
    });

// 1. Adım: Kutu Resmini Çek
captureRefBtn.addEventListener('click', () => {
    if (!window.cv) {
        alert("Zeka motoru (OpenCV) yükleniyor, lütfen 3 saniye sonra tekrar basın.");
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
    capturePieceBtn.style.backgroundColor = "#2ecc71"; // Butonu yeşil ve aktif yap
    capturePieceBtn.style.color = "white";
    
    statusText.innerHTML = "<span style='color:#2ecc71; font-weight:bold;'>Kutu Resmi Kaydedildi!</span><br>Şimdi tek bir parçayı kameranın ortasındaki halkaya getirip iyice netleyin ve '2. Parçayı Tara' butonuna basın.";
});

// 2. Adım: Parçayı Çek ve Eşleştir
capturePieceBtn.addEventListener('click', () => {
    if (!refImageMat) return;

    const ctx = canvas.getContext('2d');
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
    
    statusText.innerText = "Mobil işlemci analiz ediyor, lütfen telefonu sarsmayın...";
    
    setTimeout(matchPuzzlePiece, 150);
});

// Görüntü İşleme Mantığı
function matchPuzzlePiece() {
    try {
        let srcPiece = cv.imread(canvas);
        let grayPiece = new cv.Mat();
        let grayRef = new cv.Mat();

        cv.cvtColor(srcPiece, grayPiece, cv.COLOR_RGBA2GRAY);
        cv.cvtColor(refImageMat, grayRef, cv.COLOR_RGBA2GRAY);

        // ORB Ayarları (Mobilde hızlı çalışması için optimize)
        let orb = new cv.ORB(500); // En belirgin 500 noktaya odaklan
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

            let pctX = Math.round((posX / grayRef.cols) * 100);
            let pctY = Math.round((posY / grayRef.rows) * 100);

            let yatayYön = pctX < 33 ? "SOL" : (pctX < 66 ? "ORTA" : "SAĞ");
            let dikeyYön = pctY < 33 ? "ÜST" : (pctY < 66 ? "ORTA" : "ALT");

            statusText.innerHTML = `
                <div style="background-color: #27ae60; color: white; padding: 12px; border-radius: 8px; font-size:15px;">
                    <strong>🎯 PARÇA BULUNDU!</strong><br>
                    <strong>Bölge:</strong> ${dikeyYön} - ${yatayYön} Bölgesi<br>
                    <strong>Konum:</strong> Soldan %${pctX}, Yukarıdan %${pctY} uzaklıkta.
                </div>
            `;
        } else {
            statusText.innerHTML = `<span style="color:#e74c3c; font-weight:bold;">❌ Eşleşme Sağlanamadı.</span><br>Tavsiye: Parçaya çok yaklaşıp gölge yapmamaya çalışın ve ışığı artırın.`;
        }

        // Hafıza Temizliği
        srcPiece.delete(); grayPiece.delete(); grayRef.delete();
        orb.delete(); keypoints1.delete(); keypoints2.delete();
        descriptors1.delete(); descriptors2.delete(); bf.delete(); matches.delete();

    } catch (error) {
        console.error(error);
        statusText.innerText = "Analiz hatası. Lütfen resmi tekrar çekin.";
    }
}
