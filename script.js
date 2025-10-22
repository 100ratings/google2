// script.js — Busca PT-BR + captura única ao tocar em qualquer lugar

let stream = null;
let word = "";

// ======================== BUSCA DE IMAGENS ========================
async function wikiSearchPt(term) {
  if (!term) return { urls: [], descs: [] };
  const q = encodeURIComponent(term);
  const searchURL = `https://pt.wikipedia.org/api/rest_v1/search/title?q=${q}&limit=9`;
  const r = await fetch(searchURL, { headers: { "Accept-Language": "pt-BR" } });
  if (!r.ok) return { urls: [], descs: [] };
  const js = await r.json();
  const pages = Array.isArray(js?.pages) ? js.pages : [];
  const urls = [];
  const descs = [];
  for (const p of pages.slice(0, 9)) {
    const title = encodeURIComponent(p?.title || "");
    const sumURL = `https://pt.wikipedia.org/api/rest_v1/page/summary/${title}`;
    const rs = await fetch(sumURL, { headers: { "Accept-Language": "pt-BR" } });
    if (!rs.ok) continue;
    const sj = await rs.json();
    const thumb = sj?.thumbnail?.source || sj?.originalimage?.source;
    if (thumb) {
      urls.push(thumb);
      descs.push(sj?.title || term);
    }
  }
  return { urls, descs };
}

async function unsplashFallback(term) {
  const q = encodeURIComponent(term);
  const u = `https://api.unsplash.com/search/photos?query=${q}&per_page=9&client_id=qrEGGV7czYXuVDfWsfPZne88bLVBZ3NLTBxm_Lr72G8`;
  const rs = await fetch(u);
  if (!rs.ok) return { urls: [], descs: [] };
  const js = await rs.json();
  const results = js.results || [];
  return {
    urls: results.map(r => r?.urls?.small).filter(Boolean),
    descs: results.map(r => r?.description || r?.alt_description || term)
  };
}

async function loadImg(term) {
  try {
    let result = await wikiSearchPt(term);
    if (!result.urls.length) result = await unsplashFallback(term);
    setCardsFromUrls(result.urls, result.descs);
  } catch (e) {
    console.error(e);
    document.querySelectorAll(".i .desc").forEach(d => d.textContent = "Erro ao carregar imagens.");
  }
}

function setCardsFromUrls(urls, descs = []) {
  let idx = 0;
  document.querySelectorAll(".i").forEach(card => {
    const imgEl = card.querySelector("img");
    const descEl = card.querySelector(".desc");
    const u = urls[idx % urls.length];
    if (imgEl && u) imgEl.src = u;
    if (descEl) descEl.textContent = descs[idx] || "";
    idx++;
  });
}

// ======================== CÂMERA ========================
window.addEventListener("load", setupVideo, false);

function setupVideo() {
  const video = document.getElementById("player");
  video.setAttribute("playsinline", "");
  navigator.mediaDevices.getUserMedia({ video: { facingMode: "environment" } })
    .then(s => {
      stream = s;
      video.srcObject = s;
    })
    .catch(e => console.error("Erro câmera:", e));
}

// captura única e encerra câmera
function shutterPress() {
  if (!stream) return;
  const video = document.getElementById("player");
  const canvas = document.getElementById("canvas");
  const ctx = canvas.getContext("2d");
  canvas.width = video.videoWidth;
  canvas.height = video.videoHeight;
  ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
  const photo = document.getElementById("spec-pic");
  photo.src = canvas.toDataURL("image/png");

  // para câmera
  stream.getTracks().forEach(t => t.stop());
  video.remove();
  stream = null;
}

// toca em qualquer lugar = tira uma foto
document.addEventListener("click", shutterPress);
document.addEventListener("touchstart", shutterPress);

// ======================== BUSCA MANUAL ========================
document.addEventListener("DOMContentLoaded", function () {
  const input = document.getElementById("searchInput");
  const btn = document.getElementById("searchButton");
  btn?.addEventListener("click", () => {
    const w = input?.value?.trim();
    if (w) updateUIWithWord(w);
  });
  input?.addEventListener("keypress", e => {
    if (e.key === "Enter") {
      const w = input?.value?.trim();
      if (w) updateUIWithWord(w);
    }
  });
});

function updateUIWithWord(newWord) {
  word = (newWord || "").trim();
  const q = document.querySelector(".D0h3Gf");
  if (q) q.value = word;
  document.querySelectorAll("span.word").forEach(s => (s.textContent = word));
  loadImg(word);
}
