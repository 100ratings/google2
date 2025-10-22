// ✅ ADICIONE isto junto das suas funções utilitárias (fora de loadImg)
function isAnimalIntent(term) {
  if (!term) return false;
  const t = term.toLowerCase().trim();
  // termos comuns em PT que podem confundir (inclui "gata")
  const animals = [
    "gata","gato","gatinha","gatinho",
    "cachorro","cão","cadela","cachorra",
    "cobra","vaca","touro","galinha","galo",
    "veado","leão","tigre","onça","puma","pantera",
    "ave","pássaro","pato","cavalo","égua","peixe",
    "golfinho","baleia","macaco","lobo","raposa","coelho"
  ];
  if (animals.includes(t)) return true;
  // heurística: se o usuário digitar “animal/animais”
  if (/\banimal(es)?\b/.test(t)) return true;
  return false;
}

// ✅ SUBSTITUA sua loadImg ENTIREIRA por esta:
async function loadImg(word) {
  try {
    const q = encodeURIComponent(word || "");
    const wantsAnimal = isAnimalIntent(word);

    // --- 1️⃣ Pixabay (prioritário, PT)
    // forço PT, foto, safe e, se for animal, category=animals
    const pixParams = new URLSearchParams({
      key: "24220239-4d410d9f3a9a7e31fe736ff62",
      q,
      lang: "pt",
      per_page: "9",
      image_type: "photo",
      safesearch: "true"
    });
    if (wantsAnimal) pixParams.set("category", "animals");

    const pixabayURL = `https://pixabay.com/api/?${pixParams.toString()}`;
    const pixResp = await fetch(pixabayURL);
    let pixResults = [];
    if (pixResp.ok) {
      const data = await pixResp.json();
      pixResults = Array.isArray(data.hits) ? data.hits : [];
      // Se intenção é animal, filtramos resultados que aparentem ser pessoas
      if (wantsAnimal && pixResults.length) {
        const humanRe = /(woman|girl|man|boy|people|pessoa|modelo|fashion|beauty)/i;
        pixResults = pixResults.filter(h => !humanRe.test(h?.tags || ""));
      }
    }

    // --- 2️⃣ Se nada útil da Pixabay, fallback Unsplash (original)
    let results = pixResults;
    if (!results.length) {
      const unsplashQuery = wantsAnimal ? `${q}+animal` : q;
      const unsplashURL =
        `https://api.unsplash.com/search/photos?query=${unsplashQuery}&per_page=9&content_filter=high&client_id=qrEGGV7czYXuVDfWsfPZne88bLVBZ3NLTBxm_Lr72G8`;
      const unsplashResp = await fetch(unsplashURL);
      if (unsplashResp.ok) {
        const unsplashData = await unsplashResp.json();
        const uResults = Array.isArray(unsplashData.results) ? unsplashData.results : [];
        results = uResults.map(r => ({
          webformatURL: r?.urls?.small,                    // normaliza campo
          tags: (r?.description || r?.alt_description || "").toString(),
          user: "Unsplash"
        }));
        // filtro humano se intenção é animal
        if (wantsAnimal && results.length) {
          const humanRe = /(woman|girl|man|boy|people|pessoa|modelo|fashion|beauty)/i;
          results = results.filter(h => !humanRe.test(h?.tags || ""));
        }
      }
    }

    const cards = document.querySelectorAll(".i");

    if (!results.length) {
      // Sem resultados em nenhuma API
      cards.forEach(image => {
        const imgEl = image.querySelector("img");
        const descEl = image.querySelector(".desc");
        if (imgEl) imgEl.removeAttribute("src");
        if (descEl) descEl.textContent = "Nenhum resultado encontrado.";
      });
      return;
    }

    // --- Preenche cards (igual ao seu original)
    let idx = 0;
    cards.forEach(image => {
      const hit = results[idx % results.length];
      const imgEl = image.querySelector("img");
      const descEl = image.querySelector(".desc");

      if (imgEl && hit?.webformatURL) imgEl.src = hit.webformatURL;

      const descText = (hit?.tags || hit?.user || "").toString();
      if (descEl) descEl.textContent = descText;

      idx++;
    });
  } catch (err) {
    console.error('loadImg error:', err);
    document.querySelectorAll(".i .desc").forEach(d => d.textContent = "Erro ao carregar imagens.");
  }
}
