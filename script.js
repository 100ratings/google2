// script.js — versão otimizada para PT-BR (Wikimedia + Unsplash fallback)
// Mantém todo o comportamento original (câmera, UI, clique nos cards, etc.)

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

/* ==============================
   NOVO: Busca PT-BR + fallback
   ============================== */

// 🌐 Busca imagens priorizando Wikimedia (PT-BR). Se vazio, fallback para Unsplash.
async function loadImg(word) {
  try {
    const q = encodeURIComponent(word || "");

    // 1) Wikimedia Commons (em PT-BR; namespace 6 = arquivos/imagens)
    const wiki = `https://commons.wikimedia.org/w/api.php?action=query&format=json&origin=*`
      + `&uselang=pt-br&prop=imageinfo&iiprop=url|extmetadata&iiurlwidth=640`
      + `&generator=search&gsrsearch=${q}&gsrlimit=9&gsrnamespace=6`;

    const r = await fetch(wiki);
    if (r.ok) {
      const data = await r.json();
      const pages = data?.query?.pages ? Object.values(data.query.pages) : [];
      const urls = pages
        .map(p => {
          const ii = p?.imageinfo?.[0];
          return ii?.thumburl || ii?.url || null;
        })
        .filter(Boolean);

      if (urls.length) {
        setCardsFromUrls(urls, pages.map(p => p?.title || word));
        return; // ✅ já preencheu com PT-BR
      }
    }

    // 2) Fallback: Unsplash (mantém sua chave atual)
    const u = `https://api.unsplash.com/search/photos?query=${q}&per_page=9&client_id=qrEGGV7czYXuVDfWsfPZne88bLVBZ3NLTBxm_Lr72G8`;
    const rs = await fetch(u);
    if (!rs.ok) throw new Error(`Unsplash HTTP ${rs.status}`);
    const js = await rs.json();

    const results = Array.isArray(js.results) ? js.results : [];
    if (!results.length) {
      document.querySelectorAll(".i .desc").forEach(d => d.textContent = "Nenhum resultado encontrado.");
      document.querySelectorAll(".i img").forEach(img => img.removeAttribute("src"));
      return;
    }

    setCardsFromUrls(
      results.map(h => h?.urls?.small).filter(Boolean),
      results.map(h => (h?.description || h?.alt_description || word))
    );

  } catch (err) {
    console.error('loadImg error:', err);
    document.querySelectorAll(".i .desc").forEach(d => d.textContent = "Erro ao carregar imagens.");
  }
}

// Helper para preencher os cards .i de forma estável
function setCardsFromUrls(urls, descs = []) {
  let idx = 0;
  document.querySelectorAll(".i").forEach(card => {
    const imgEl = card.querySelector("img");
    const descEl = card.querySelector(".desc");
    const u = urls[idx % urls.length];
    if (imgEl && u) imgEl.src = u;
    if (descEl) descEl.textContent = (descs[idx] || "").toString();
    idx++;
  });
}
