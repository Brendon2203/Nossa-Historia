// ============================================
// CONFIGURAÇÃO E ESTADO
// ============================================

let memories = [];
let map = null;
let markers = {};
let editMode = false;
let pendingPinLatLng = null;
let tempMarker = null;
let searchDebounce = null;
let searchMode = 'places';
let activeResultIndex = -1;
let currentSearchResults = [];
let pendingImageFile = null;
let isSaving = false;

// ============================================
// API (dados salvos no servidor)
// ============================================

async function loadMemories() {
  const res = await fetch('/api/memories');
  if (!res.ok) throw new Error('Falha ao carregar memórias');
  memories = await res.json();
}

async function createMemory(memory) {
  const res = await fetch('/api/memories', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(memory),
  });
  if (!res.ok) throw new Error('Falha ao criar memória');
  return res.json();
}

async function updateMemory(memory) {
  const res = await fetch(`/api/memories/${memory.id}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(memory),
  });
  if (!res.ok) throw new Error('Falha ao atualizar memória');
  return res.json();
}

async function deleteMemory(id) {
  const res = await fetch(`/api/memories/${id}`, { method: 'DELETE' });
  if (!res.ok) throw new Error('Falha ao excluir memória');
}

async function importMemories(data) {
  const res = await fetch('/api/memories/import', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
  if (!res.ok) throw new Error('Falha ao importar');
  return res.json();
}

async function uploadImage(file) {
  const formData = new FormData();
  formData.append('image', file);
  const res = await fetch('/api/upload', { method: 'POST', body: formData });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || 'Falha no upload da imagem');
  }
  const data = await res.json();
  return data.url;
}

// ============================================
// INICIALIZAÇÃO
// ============================================

document.addEventListener('DOMContentLoaded', async () => {
  AOS.init({
    once: true,
    offset: 50,
    duration: 800,
    easing: 'ease-out-cubic',
  });

  lucide.createIcons();

  try {
    await loadMemories();
    await fixSpotifyEmbeds();
    initMap();
    setupEventListeners();
  } catch {
    document.getElementById('map-section').insertAdjacentHTML(
      'afterbegin',
      '<div class="text-center text-rose-400 mb-4 p-4 bg-night-900 rounded-xl border border-rose-900/50">Não foi possível conectar ao servidor. Execute <code class="text-sand-200">npm start</code> na pasta do projeto.</div>'
    );
  }

  setTimeout(() => lucide.createIcons(), 100);
});

function initMap() {
  map = L.map('leaflet-map', {
    zoomControl: true,
    scrollWheelZoom: true,
  }).setView([-22.9068, -43.1729], 12);

  L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png', {
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> &copy; <a href="https://carto.com/">CARTO</a>',
    subdomains: 'abcd',
    maxZoom: 19,
  }).addTo(map);

  renderAllMarkers();

  if (memories.length > 0) {
    const bounds = L.latLngBounds(memories.map(m => [m.lat, m.lng]));
    map.fitBounds(bounds, { padding: [50, 50], maxZoom: 14 });
  }
}

function createPinIcon(label) {
  return L.divIcon({
    className: 'custom-pin-marker',
    html: `
      <div class="leaflet-pin">
        <div class="pin-icon-wrapper">
          <div class="pin-pulse"></div>
          <div class="pin-outer"></div>
          <div class="pin-inner">
            <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="white" stroke="white" stroke-width="2"><path d="M19 14c1.49-1.46 3-3.21 3-5.5A5.5 5.5 0 0 0 16.5 3c-1.76 0-3 .5-4.5 2-1.5-1.5-2.74-2-4.5-2A5.5 5.5 0 0 0 2 8.5c0 2.3 1.5 4.05 3 5.5l7 7Z"/></svg>
          </div>
        </div>
        <div class="pin-label">${escapeHtml(label)}</div>
      </div>
    `,
    iconSize: [48, 60],
    iconAnchor: [24, 48],
    popupAnchor: [0, -48],
  });
}

function renderAllMarkers(filteredIds = null) {
  Object.values(markers).forEach(m => map.removeLayer(m));
  markers = {};

  memories.forEach(memory => {
    const isDimmed = filteredIds && !filteredIds.includes(memory.id);
    const marker = L.marker([memory.lat, memory.lng], {
      icon: createPinIcon(memory.label),
      opacity: isDimmed ? 0.25 : 1,
    }).addTo(map);

    marker.on('click', () => {
      if (editMode) {
        openPinForm(memory);
      } else {
        openModal(memory);
      }
    });

    markers[memory.id] = marker;
  });
}

// ============================================
// EVENT LISTENERS
// ============================================

function setupEventListeners() {
  document.getElementById('toggle-edit-btn').addEventListener('click', toggleEditMode);
  document.getElementById('add-pin-btn').addEventListener('click', () => openPinForm());
  document.getElementById('close-form-btn').addEventListener('click', closePinForm);
  document.getElementById('form-backdrop').addEventListener('click', closePinForm);
  document.getElementById('pin-form').addEventListener('submit', handlePinSubmit);
  document.getElementById('delete-pin-btn').addEventListener('click', handlePinDelete);

  document.getElementById('pin-image-input').addEventListener('change', handleImageUpload);
  document.getElementById('pin-image-url').addEventListener('input', handleImageUrl);
  document.getElementById('search-tab-places').addEventListener('click', () => setSearchMode('places'));
  document.getElementById('search-tab-pins').addEventListener('click', () => setSearchMode('pins'));
  document.getElementById('export-data-btn').addEventListener('click', exportData);
  document.getElementById('export-complete-btn').addEventListener('click', exportCompleteBackup);
  document.getElementById('import-data-btn').addEventListener('click', () => document.getElementById('import-file-input').click());
  document.getElementById('import-file-input').addEventListener('change', importData);

  const searchInput = document.getElementById('search-input');
  searchInput.addEventListener('input', handleSearchInput);
  searchInput.addEventListener('keydown', handleSearchKeydown);

  document.addEventListener('click', (e) => {
    if (!e.target.closest('#search-input') && !e.target.closest('#search-results')) {
      hideSearchResults();
    }
  });

  map.on('click', (e) => {
    if (!editMode) return;

    pendingPinLatLng = e.latlng;
    updateLocationDisplay(e.latlng.lat, e.latlng.lng);

    if (tempMarker) map.removeLayer(tempMarker);
    tempMarker = L.marker(e.latlng, {
      icon: createPinIcon('Novo Pin'),
      opacity: 0.7,
    }).addTo(map);
  });
}

function toggleEditMode() {
  editMode = !editMode;
  const btn = document.getElementById('toggle-edit-btn');
  const addBtn = document.getElementById('add-pin-btn');
  const hint = document.getElementById('edit-hint');

  if (editMode) {
    btn.classList.add('edit-active');
    btn.innerHTML = '<i data-lucide="check" class="w-4 h-4"></i><span>Edição Ativa</span>';
    addBtn.classList.remove('hidden');
    addBtn.classList.add('inline-flex');
    hint.classList.remove('hidden');
    document.getElementById('backup-controls').classList.remove('hidden');
    document.getElementById('backup-controls').classList.add('flex');
    map.getContainer().classList.add('map-edit-mode');
  } else {
    btn.classList.remove('edit-active');
    btn.innerHTML = '<i data-lucide="pencil" class="w-4 h-4"></i><span>Modo Edição</span>';
    addBtn.classList.add('hidden');
    addBtn.classList.remove('inline-flex');
    hint.classList.add('hidden');
    document.getElementById('backup-controls').classList.add('hidden');
    document.getElementById('backup-controls').classList.remove('flex');
    map.getContainer().classList.remove('map-edit-mode');
    clearTempMarker();
  }

  lucide.createIcons();
  renderAllMarkers();
}

// ============================================
// BUSCA (LUGARES E PINS)
// ============================================

function setSearchMode(mode) {
  searchMode = mode;
  activeResultIndex = -1;
  document.getElementById('search-tab-places').classList.toggle('active', mode === 'places');
  document.getElementById('search-tab-pins').classList.toggle('active', mode === 'pins');

  const input = document.getElementById('search-input');
  input.placeholder = mode === 'places'
    ? 'Digite um endereço ou lugar (ex: Rua São José, Cariacica)'
    : 'Buscar pin pelo título ou rótulo (ex: Primeiro Encontro)';
  input.value = '';
  hideSearchResults();
  renderAllMarkers();
}

function handleSearchInput(e) {
  const query = e.target.value.trim();
  clearTimeout(searchDebounce);
  activeResultIndex = -1;

  if (query.length < 2) {
    hideSearchResults();
    if (searchMode === 'pins') renderAllMarkers();
    return;
  }

  if (searchMode === 'pins') {
    searchPins(query);
    return;
  }

  showSearchLoading();
  searchDebounce = setTimeout(() => searchPlaces(query), 300);
}

function handleSearchKeydown(e) {
  const items = document.querySelectorAll('.search-result-item');
  if (!items.length || document.getElementById('search-results').classList.contains('hidden')) return;

  if (e.key === 'ArrowDown') {
    e.preventDefault();
    activeResultIndex = Math.min(activeResultIndex + 1, items.length - 1);
    highlightResult(items);
  } else if (e.key === 'ArrowUp') {
    e.preventDefault();
    activeResultIndex = Math.max(activeResultIndex - 1, 0);
    highlightResult(items);
  } else if (e.key === 'Enter') {
    e.preventDefault();
    const target = activeResultIndex >= 0 ? items[activeResultIndex] : items[0];
    if (target) target.click();
  } else if (e.key === 'Escape') {
    hideSearchResults();
  }
}

function highlightResult(items) {
  items.forEach((item, i) => item.classList.toggle('active', i === activeResultIndex));
  if (activeResultIndex >= 0) items[activeResultIndex].scrollIntoView({ block: 'nearest' });
}

function showSearchLoading() {
  const resultsEl = document.getElementById('search-results');
  resultsEl.innerHTML = '<div class="search-result-empty"><span class="search-loading">Buscando sugestões...</span></div>';
  resultsEl.classList.remove('hidden');
}

async function searchPlaces(query) {
  const resultsEl = document.getElementById('search-results');

  try {
    const response = await fetch(
      `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(query)}&limit=8&addressdetails=1&countrycodes=br&accept-language=pt-BR`,
      { headers: { 'Accept-Language': 'pt-BR' } }
    );

    if (!response.ok) throw new Error('Erro na busca');

    const results = await response.json();
    if (query !== document.getElementById('search-input').value.trim()) return;
    renderPlaceResults(results);
  } catch {
    resultsEl.innerHTML = '<div class="search-result-empty">Erro ao buscar. Tente novamente.</div>';
    resultsEl.classList.remove('hidden');
  }
}

function formatPlaceName(place) {
  const addr = place.address || {};
  const primary = [
    addr.road && (addr.house_number ? `${addr.road}, ${addr.house_number}` : addr.road),
    addr.suburb || addr.neighbourhood || addr.quarter,
    place.name !== addr.road ? place.name : null,
  ].filter(Boolean)[0] || place.display_name.split(',')[0];

  const secondary = [
    addr.city || addr.town || addr.village || addr.municipality,
    addr.state,
  ].filter(Boolean).join(', ');

  return { primary, secondary: secondary || place.display_name };
}

function renderPlaceResults(results) {
  const resultsEl = document.getElementById('search-results');
  currentSearchResults = results;

  if (results.length === 0) {
    resultsEl.innerHTML = '<div class="search-result-empty">Nenhum lugar encontrado. Tente incluir a cidade (ex: Cariacica).</div>';
    resultsEl.classList.remove('hidden');
    return;
  }

  resultsEl.innerHTML = results.map((place, i) => {
    const { primary, secondary } = formatPlaceName(place);
    return `
      <button type="button" class="search-result-item" data-type="place" data-index="${i}" data-lat="${place.lat}" data-lng="${place.lon}" data-name="${escapeAttr(primary)}">
        <i data-lucide="map-pin" class="w-4 h-4 text-rose-400 shrink-0 mt-0.5"></i>
        <span class="search-result-text">
          <span class="search-result-primary">${escapeHtml(primary)}</span>
          <span class="search-result-secondary">${escapeHtml(secondary)}</span>
        </span>
      </button>
    `;
  }).join('');

  resultsEl.classList.remove('hidden');
  lucide.createIcons();
  bindSearchResultClicks();
}

function searchPins(query) {
  const q = query.toLowerCase();
  const matches = memories.filter(m =>
    m.title.toLowerCase().includes(q) ||
    m.label.toLowerCase().includes(q) ||
    m.description.toLowerCase().includes(q)
  );

  renderPinResults(matches);

  if (matches.length > 0) {
    renderAllMarkers(matches.map(m => m.id));
  } else {
    renderAllMarkers([]);
  }
}

function renderPinResults(results) {
  const resultsEl = document.getElementById('search-results');
  currentSearchResults = results;

  if (results.length === 0) {
    resultsEl.innerHTML = '<div class="search-result-empty">Nenhum pin encontrado com esse nome.</div>';
    resultsEl.classList.remove('hidden');
    return;
  }

  resultsEl.innerHTML = results.map((memory, i) => `
    <button type="button" class="search-result-item" data-type="pin" data-index="${i}" data-id="${memory.id}">
      <i data-lucide="heart" class="w-4 h-4 text-rose-400 shrink-0 mt-0.5"></i>
      <span class="search-result-text">
        <span class="search-result-primary">${escapeHtml(memory.title)}</span>
        <span class="search-result-secondary">${escapeHtml(memory.label)}</span>
      </span>
    </button>
  `).join('');

  resultsEl.classList.remove('hidden');
  lucide.createIcons();
  bindSearchResultClicks();
}

function bindSearchResultClicks() {
  document.querySelectorAll('.search-result-item').forEach(item => {
    item.addEventListener('click', () => {
      if (item.dataset.type === 'place') {
        selectPlaceResult(item);
      } else {
        selectPinResult(item.dataset.id);
      }
    });
  });
}

function selectPlaceResult(item) {
  const lat = parseFloat(item.dataset.lat);
  const lng = parseFloat(item.dataset.lng);
  const name = item.dataset.name;

  map.flyTo([lat, lng], 17, { duration: 1.5 });
  document.getElementById('search-input').value = name;
  hideSearchResults();

  if (editMode) {
    pendingPinLatLng = { lat, lng };
    updateLocationDisplay(lat, lng);

    if (tempMarker) map.removeLayer(tempMarker);
    tempMarker = L.marker([lat, lng], {
      icon: createPinIcon('Novo Pin'),
      opacity: 0.7,
    }).addTo(map);
  }
}

function selectPinResult(id) {
  const memory = memories.find(m => m.id === id);
  if (!memory) return;

  document.getElementById('search-input').value = memory.title;
  hideSearchResults();
  renderAllMarkers();

  map.flyTo([memory.lat, memory.lng], 17, { duration: 1.5 });

  setTimeout(() => {
    if (editMode) {
      openPinForm(memory);
    } else {
      openModal(memory);
    }
  }, 800);
}

function hideSearchResults() {
  document.getElementById('search-results').classList.add('hidden');
  activeResultIndex = -1;
  if (searchMode === 'pins' && !document.getElementById('search-input').value.trim()) {
    renderAllMarkers();
  }
}

// ============================================
// BACKUP (EXPORTAR / IMPORTAR)
// ============================================

function exportData() {
  // Aviso sobre backup e imagens
  const uploadedImages = memories.filter(m => m.image?.startsWith('/uploads/')).length;
  if (uploadedImages > 0) {
    const msg = `⚠️ AVISO IMPORTANTE:\n\nVocê tem ${uploadedImages} memória(s) com imagens enviadas. O arquivo JSON de backup salva apenas os LINKS das imagens, NÃO as imagens em si.\n\nPara garantir que tudo seja salvo:\n✅ Mantenha o disco persistente ATIVO no Render\n✅ Se usar o plano gratuito, as imagens DESAPARECERÃO ao redeployar\n\nContinuar com o backup JSON?\n\n💡 DICA: Clique em "Exportar Completo com Fotos" para baixar um ZIP com tudo!`;
    if (!confirm(msg)) return;
  }

  const data = JSON.stringify(memories, null, 2);
  const blob = new Blob([data], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `nossa-historia-backup-${new Date().toISOString().slice(0, 10)}.json`;
  a.click();
  URL.revokeObjectURL(url);
}

async function exportCompleteBackup() {
  try {
    const uploadedImages = memories.filter(m => m.image?.startsWith('/uploads/')).length;
    if (uploadedImages === 0) {
      alert('⚠️ Você não tem imagens enviadas. Use "Exportar backup" para salvar em JSON.');
      return;
    }

    const msg = `📦 Backup Completo com Fotos\n\nVocê tem ${uploadedImages} imagem(s) salva(s).\nIsso criará um arquivo ZIP com:\n✅ Arquivo memories.json\n✅ Pasta uploads/ com todas as imagens\n✅ README com instruções\n\nBaixar agora?`;
    if (!confirm(msg)) return;

    // Download do ZIP via API
    const link = document.createElement('a');
    link.href = '/api/backup/download';
    link.download = `nossa-historia-completo-${new Date().toISOString().slice(0, 10)}.zip`;
    link.click();

    alert('✅ Backup completo baixado com sucesso!');
  } catch (err) {
    alert('❌ Erro ao baixar backup: ' + err.message);
  }
}

function importData(e) {
  const file = e.target.files[0];
  if (!file) return;

  // Detectar tipo de arquivo
  const isZip = file.name.endsWith('.zip') || file.type === 'application/zip';
  
  if (isZip) {
    importZipBackup(file);
  } else {
    importJsonBackup(file);
  }
}

async function importZipBackup(file) {
  try {
    const msg = `📦 Restaurar Backup Completo\n\nIsso vai:\n✅ Restaurar todas as memórias\n✅ Restaurar TODAS as imagens\n✅ Substituir os dados atuais\n\nContinuar?`;
    if (!confirm(msg)) return;

    const formData = new FormData();
    formData.append('zipFile', file);

    const res = await fetch('/api/restore-backup-zip', {
      method: 'POST',
      body: formData
    });

    if (!res.ok) {
      const err = await res.json();
      throw new Error(err.error || 'Erro ao restaurar backup');
    }

    const result = await res.json();
    
    // Recarregar memórias
    await loadMemories();
    renderAllMarkers();
    
    if (memories.length > 0) {
      map.fitBounds(L.latLngBounds(memories.map(m => [m.lat, m.lng])), { padding: [50, 50], maxZoom: 14 });
    }

    alert(`✅ Backup restaurado com sucesso!\n\n📊 Dados importados:\n• ${result.totalMemories} memória(s)\n• ${result.memoriesWithImages} com imagem(s)\n\n🖼️ Todas as fotos foram restauradas!`);
  } catch (err) {
    alert('❌ Erro ao restaurar ZIP: ' + err.message);
  }
  document.getElementById('import-file-input').value = '';
}

function importJsonBackup(file) {
  const reader = new FileReader();
  reader.onload = async (ev) => {
    try {
      const imported = JSON.parse(ev.target.result);
      if (!Array.isArray(imported) || imported.length === 0) {
        alert('Arquivo inválido. Use um backup exportado deste site.');
        return;
      }

      if (!confirm(`Importar ${imported.length} memória(s)? Isso substituirá os dados atuais.`)) return;

      memories = await importMemories(imported);
      renderAllMarkers();
      map.fitBounds(L.latLngBounds(memories.map(m => [m.lat, m.lng])), { padding: [50, 50], maxZoom: 14 });
      alert('Backup importado com sucesso!');
    } catch {
      alert('Erro ao importar. Verifique se o servidor está rodando e o arquivo é válido.');
    }
    document.getElementById('import-file-input').value = '';
  };
  reader.readAsText(file);
}

// ============================================
// FORMULÁRIO DE PIN
// ============================================

function openPinForm(memory = null) {
  const modal = document.getElementById('pin-form-modal');
  const isEdit = !!memory;

  pendingImageFile = null;
  document.getElementById('form-title').textContent = isEdit ? 'Editar Memória' : 'Nova Memória';
  document.getElementById('pin-id').value = memory?.id || '';
  document.getElementById('pin-label-input').value = memory?.label || '';
  document.getElementById('pin-title-input').value = memory?.title || '';
  document.getElementById('pin-description-input').value = memory?.description || '';
  document.getElementById('pin-spotify-input').value = memory?.spotifyEmbed ? spotifyEmbedToUrl(memory.spotifyEmbed) : '';
  document.getElementById('pin-image-url').value = '';
  document.getElementById('pin-image-input').value = '';

  if (memory) {
    document.getElementById('pin-lat').value = memory.lat;
    document.getElementById('pin-lng').value = memory.lng;
    updateLocationDisplay(memory.lat, memory.lng);
    showImagePreview(memory.image);
    document.getElementById('delete-pin-btn').classList.remove('hidden');
    document.getElementById('delete-pin-btn').classList.add('inline-flex');
  } else {
    const lat = pendingPinLatLng?.lat || map.getCenter().lat;
    const lng = pendingPinLatLng?.lng || map.getCenter().lng;
    document.getElementById('pin-lat').value = lat;
    document.getElementById('pin-lng').value = lng;
    updateLocationDisplay(lat, lng);
    hideImagePreview();
    document.getElementById('delete-pin-btn').classList.add('hidden');
    document.getElementById('delete-pin-btn').classList.remove('inline-flex');
  }

  modal.classList.remove('hidden');
  requestAnimationFrame(() => modal.classList.add('form-open'));
  document.body.style.overflow = 'hidden';
  setTimeout(() => lucide.createIcons(), 50);
}

function closePinForm() {
  const modal = document.getElementById('pin-form-modal');
  modal.classList.remove('form-open');

  setTimeout(() => {
    modal.classList.add('hidden');
    if (!document.getElementById('memory-modal').classList.contains('modal-open')) {
      document.body.style.overflow = '';
    }
  }, 300);
}

function updateLocationDisplay(lat, lng) {
  const el = document.getElementById('pin-location-display');
  el.innerHTML = `
    <i data-lucide="map-pin" class="w-3.5 h-3.5"></i>
    <span>Local: ${lat.toFixed(5)}, ${lng.toFixed(5)}</span>
  `;
  lucide.createIcons();
}

async function handlePinSubmit(e) {
  e.preventDefault();
  if (isSaving) return;

  const id = document.getElementById('pin-id').value;
  const lat = parseFloat(document.getElementById('pin-lat').value);
  const lng = parseFloat(document.getElementById('pin-lng').value);
  const submitBtn = document.querySelector('#pin-form button[type="submit"]');

  if (isNaN(lat) || isNaN(lng)) {
    alert('Defina a localização clicando no mapa ou buscando um lugar.');
    return;
  }

  let image = document.getElementById('pin-image-url').value.trim();
  const existingMemory = id ? memories.find(m => m.id === id) : null;

  if (!image && existingMemory) {
    image = existingMemory.image;
  }

  const spotifyUrl = document.getElementById('pin-spotify-input').value.trim();
  if (spotifyUrl && !spotifyUrlToEmbed(spotifyUrl)) {
    alert('Link do Spotify inválido. Copie em Compartilhar → Copiar link da música.');
    return;
  }

  isSaving = true;
  if (submitBtn) {
    submitBtn.disabled = true;
    submitBtn.querySelector('span').textContent = 'Salvando...';
  }

  try {
    if (pendingImageFile) {
      image = await uploadImage(pendingImageFile);
      pendingImageFile = null;
    }

    if (!image) {
      alert('Adicione uma imagem (upload ou URL).');
      return;
    }

    const memoryData = {
      label: document.getElementById('pin-label-input').value.trim(),
      title: document.getElementById('pin-title-input').value.trim(),
      description: document.getElementById('pin-description-input').value.trim(),
      image,
      spotifyEmbed: spotifyUrl ? spotifyUrlToEmbed(spotifyUrl) : '',
      lat,
      lng,
    };

    let saved;
    if (id) {
      saved = await updateMemory({ id, ...memoryData });
      const index = memories.findIndex(m => m.id === id);
      if (index !== -1) memories[index] = saved;
    } else {
      saved = await createMemory(memoryData);
      memories.push(saved);
    }

    renderAllMarkers();
    clearTempMarker();
    pendingPinLatLng = null;
    closePinForm();
    map.flyTo([lat, lng], 15, { duration: 1 });
  } catch (err) {
    alert(err.message || 'Erro ao salvar. Verifique se o servidor está rodando.');
  } finally {
    isSaving = false;
    if (submitBtn) {
      submitBtn.disabled = false;
      submitBtn.querySelector('span').textContent = 'Salvar';
    }
  }
}

async function handlePinDelete() {
  const id = document.getElementById('pin-id').value;
  if (!id || !confirm('Tem certeza que deseja excluir esta memória?')) return;

  try {
    await deleteMemory(id);
    memories = memories.filter(m => m.id !== id);
    renderAllMarkers();
    closePinForm();
  } catch {
    alert('Erro ao excluir. Verifique se o servidor está rodando.');
  }
}

function handleImageUpload(e) {
  const file = e.target.files[0];
  if (!file) return;

  if (file.size > 5 * 1024 * 1024) {
    alert('Imagem muito grande! Use arquivos menores que 5MB ou cole uma URL.');
    e.target.value = '';
    return;
  }

  pendingImageFile = file;
  document.getElementById('pin-image-url').value = '';
  showImagePreview(URL.createObjectURL(file));
}

function handleImageUrl(e) {
  const url = e.target.value.trim();
  pendingImageFile = null;
  if (url) showImagePreview(url);
  else hideImagePreview();
}

function showImagePreview(src) {
  document.getElementById('image-preview').classList.remove('hidden');
  document.getElementById('image-preview-img').src = src;
}

function hideImagePreview() {
  document.getElementById('image-preview').classList.add('hidden');
  document.getElementById('image-preview-img').src = '';
}

function clearTempMarker() {
  if (tempMarker) {
    map.removeLayer(tempMarker);
    tempMarker = null;
  }
}

// ============================================
// SPOTIFY HELPERS
// ============================================

function spotifyUrlToEmbed(url) {
  const patterns = [
    /open\.spotify\.com(?:\/intl-[a-z]{2})?\/(track|album|playlist|episode)\/([a-zA-Z0-9]+)/,
    /open\.spotify\.com\/(track|album|playlist|episode)\/([a-zA-Z0-9]+)/,
    /spotify:(track|album|playlist|episode):([a-zA-Z0-9]+)/,
  ];

  for (const pattern of patterns) {
    const match = url.match(pattern);
    if (match) {
      return `https://open.spotify.com/embed/${match[1]}/${match[2]}?utm_source=generator&theme=0`;
    }
  }

  if (url.includes('/embed/')) return url;
  return '';
}

function spotifyEmbedToUrl(embed) {
  const match = embed.match(/embed\/(track|album|playlist|episode)\/([a-zA-Z0-9]+)/);
  if (match) return `https://open.spotify.com/${match[1]}/${match[2]}`;
  return embed;
}

async function fixSpotifyEmbeds() {
  for (const m of memories) {
    if (!m.spotifyEmbed || m.spotifyEmbed.includes('/embed/')) continue;
    const fixed = spotifyUrlToEmbed(m.spotifyEmbed);
    if (fixed) {
      m.spotifyEmbed = fixed;
      try { await updateMemory(m); } catch { /* ignora na inicialização */ }
    }
  }
}

// ============================================
// MODAL DE VISUALIZAÇÃO
// ============================================

function openModal(memory) {
  const modal = document.getElementById('memory-modal');

  document.getElementById('modal-image').src = memory.image;
  document.getElementById('modal-title').textContent = memory.title;
  document.getElementById('modal-description').textContent = memory.description;

  const hasSpotify = !!memory.spotifyEmbed;
  document.getElementById('modal-spotify-badge').classList.toggle('hidden', !hasSpotify);
  document.getElementById('modal-spotify-divider').classList.toggle('hidden', !hasSpotify);
  document.getElementById('modal-spotify-container').classList.toggle('hidden', !hasSpotify);
  document.getElementById('modal-spotify').src = hasSpotify ? memory.spotifyEmbed : '';

  modal.classList.remove('hidden');
  requestAnimationFrame(() => modal.classList.add('modal-open'));
  document.body.style.overflow = 'hidden';
  setTimeout(() => lucide.createIcons(), 50);
}

function closeModal() {
  const modal = document.getElementById('memory-modal');
  modal.classList.remove('modal-open');

  setTimeout(() => {
    modal.classList.add('hidden');
    document.getElementById('modal-spotify').src = '';
    if (!document.getElementById('pin-form-modal').classList.contains('form-open')) {
      document.body.style.overflow = '';
    }
  }, 500);
}

function scrollToMap() {
  document.getElementById('map-section').scrollIntoView({ behavior: 'smooth' });
}

// ============================================
// UTILITÁRIOS
// ============================================

function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

function escapeAttr(str) {
  return str.replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') {
    closeModal();
    closePinForm();
  }
});

let touchStartY = 0;
document.getElementById('modal-card')?.addEventListener('touchstart', (e) => {
  touchStartY = e.changedTouches[0].screenY;
}, { passive: true });

document.getElementById('modal-card')?.addEventListener('touchend', (e) => {
  if (e.changedTouches[0].screenY - touchStartY > 100) closeModal();
}, { passive: true });

let resizeTimer;
window.addEventListener('resize', () => {
  clearTimeout(resizeTimer);
  resizeTimer = setTimeout(() => {
    map?.invalidateSize();
    AOS.refresh();
  }, 250);
});
