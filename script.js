let i = 0;
let selfieCam = false;

const player = document.getElementById('player');
const canvas = document.getElementById('canvas');
let word = "";

// 🔔 Eventos de captura (toque/clique no vídeo)
player?.addEventListener('touchstart', shutterPress);
player?.addEventListener('click', shutterPress);

// 📹 Inicia a câmera traseira (environment)
function setupVideo() {
  try {
    const camera = 'environment';
    navigator.mediaDevices.getUserMedia({
      audio: false,
      video: { facingMode: camera }
    })
    .then(stream => { if (player) player.srcObject = stream; })
    .catch(err => {
      console.error('Erro ao acessar câmera:', err);
    });
  } catch (err) {
    console.error('setupVideo exception:', err);
  }
}

// 🎯 Clique nos cards de palavra
document.querySelectorAll(".word").forEach(box =>
  box.addEventListener("click", function(){
    const dt = this.getAttribute('data-type') || "";
    updateUIWithWord(dt);
  })
);

// 📨 Botão "Enviar"
document.querySelector("#wordbtn")?.addEventListener("click", function (e) {
  e.preventDefault();
  const inputEl = document.querySelector("#wordinput");
  const val = (inputEl && 'value' in inputEl) ? inputEl.value : "";
  updateUIWithWord(val);
});

// 🧠 Atualiza UI e sempre faz busca online (sem imagens salvas)
function updateUIWithWord(newWord) {
  word = (newWord || "").trim();

  // remove o seletor inicial
  document.querySelector("#word-container")?.remove();

  // preenche a barra de busca do layout Google-like, se existir
  const q = document.querySelector(".D0h3Gf");
  if (q) q.value = word;

  // atualiza todos os spans <span class="word"> com o termo
  document.querySelectorAll("span.word").forEach(s => { s.textContent = word; });

  // 🚀 Buscar imagens
  loadImg(word);
}

window.addEventListener('load', setupVideo, false);

// 📸 Tira um frame do vídeo e coloca no #spec-pic, depois para a câmera
function shutterPress(e) {
  try {
    e.preventDefault();

    const video = document.querySelector('video');
    if (!video || !video.srcObject) return;

    const mediaStream = video.srcObject;
    const tracks = mediaStream.getTracks();
    const track = mediaStream.getVideoTracks()[0];

    if (!canvas || !('getContext' in canvas)) return;

    const context = canvas.getContext("2d");
    canvas.width = video.videoWidth || 640;
    canvas.height = video.videoHeight || 360;
    context.drawImage(video, 0, 0, canvas.width, canvas.height);

    const photo = document.querySelector('#spec-pic');
    const data = canvas.toDataURL("image/png");
    if (photo) photo.setAttribute("src", data);

    // para a câmera e remove o player do DOM
    track && track.stop();
    tracks.forEach(t => t.stop());
    player && player.remove();
  } catch (err) {
    console.error('shutterPress exception:', err);
  }
}

// 🌐 Busca de imagens (Pixabay - em português, super rápida)
async function loadImg(word) {
  try {
    const q = encodeURIComponent(word || "");
    const url = `https://pixabay.com/api/?key=24220239-4d410d9f3a9a7e31fe736ff62&q=${q}&lang=pt&per_page=9`;

    const resp = await fetch(url);
    if (!resp.ok) throw new Error(`Pixabay HTTP ${resp.status}`);
    const data = await resp.json();

    const results = Array.isArray(data.hits) ? data.hits : [];
    const cards = document.querySelectorAll(".i");

    if (results.length === 0) {
      // Sem resultados: limpa thumbs e mostra mensagem
      cards.forEach(image => {
        const imgEl = image.querySelector("img");
        const descEl = image.querySelector(".desc");
        if (imgEl) imgEl.removeAttribute("src");
        if (descEl) descEl.textContent = "Nenhum resultado encontrado.";
      });
      return;
    }

    // Preenche cards (mesmo layout do original)
    let idx = 0;
    cards.forEach(image => {
      const hit = results[idx % results.length];
      const imgEl = image.querySelector("img");
      const descEl = image.querySelector(".desc");

      if (imgEl && hit?.webformatURL) imgEl.src = hit.webformatURL;

      // Usa tags ou user como descrição alternativa
      const descText = (hit?.tags || hit?.user || "").toString();
      if (descEl) descEl.textContent = descText;

      idx++;
    });
  } catch (err) {
    console.error('loadImg error:', err);
    document.querySelectorAll(".i .desc").forEach(d => d.textContent = "Erro ao carregar imagens.");
  }
}
