const video = document.getElementById('video');
const canvas = document.getElementById('canvas');
const captureBtn = document.getElementById('capture-btn');
const statusText = document.getElementById('status');

// 1. Kullanıcının kamerasını aç
navigator.mediaDevices.getUserMedia({ video: { facingMode: "environment" } }) // Arka kamerayı tercih et
    .then(stream => {
        video.srcObject = stream;
        statusText.innerText = "Kamera hazır. Parçayı hizalayıp butona basın.";
    })
    .catch(err => {
        console.error("Kamera açılmadı: ", err);
        statusText.innerText = "Kamera izni verilmedi veya kamera bulunamadı.";
    });

// 2. Butona basıldığında anlık görüntüyü yakala
captureBtn.addEventListener('click', () => {
    const context = canvas.getContext('2d');
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    
    // Videodaki o anki kareyi canvas'a çiz
    context.drawImage(video, 0, 0, canvas.width, canvas.height);
    
    statusText.innerText = "Görüntü alındı! Parça analiz ediliyor...";
    
    // Analiz fonksiyonunu çağır
    analizEt(canvas);
});

// 3. Basit Analiz Mantığı (Şimdilik Simülasyon)
function analizEt(yakinlastirilmisCanvas) {
    // Projenin ilerleyen adımlarında buraya OpenCV.js veya Renk Algılama kodları gelecek.
    // Şimdilik sistemin çalıştığını görmek için rastgele bir yer söyletelim:
    
    setTimeout(() => {
        const satir = Math.floor(Math.random() * 3) + 1;
        const sutun = Math.floor(Math.random() * 3) + 1;
        statusText.innerHTML = `<strong>Bulundu!</strong> Bu parça <span style="color:green; font-size:18px;">Satır: ${satir}, Sütun: ${sutun}</span> alanına ait!`;
    }, 1500); // 1.5 saniye analiz süresi taklidi
}
