document.addEventListener('DOMContentLoaded', () => {
  const socket = io();

  // DOM Elements
  const searchForm = document.getElementById('searchForm');
  const artistInput = document.getElementById('artistInput');
  const amountInput = document.getElementById('amountInput');
  const qualitySelect = document.getElementById('qualitySelect');
  const searchBtn = document.getElementById('searchBtn');

  const resultsPlaceholder = document.getElementById('resultsPlaceholder');
  const resultsLoading = document.getElementById('resultsLoading');
  const resultsContainer = document.getElementById('resultsContainer');
  const resultsCount = document.getElementById('resultsCount');
  const batchActions = document.getElementById('batchActions');
  const selectAllBtn = document.getElementById('selectAllBtn');
  const deselectAllBtn = document.getElementById('deselectAllBtn');
  const downloadSelectedBtn = document.getElementById('downloadSelectedBtn');
  const selectedCount = document.getElementById('selectedCount');

  const queueEmpty = document.getElementById('queueEmpty');
  const queueContainer = document.getElementById('queueContainer');
  const queueCount = document.getElementById('queueCount');
  const clearCompletedBtn = document.getElementById('clearCompletedBtn');
  const connectionStatus = document.getElementById('connectionStatus');

  // State
  let currentResults = [];
  let selectedMap = new Set();
  let currentArtist = '';

  // Socket connection status
  socket.on('connect', () => {
    connectionStatus.innerHTML = `<i class="ri-pulse-line"></i> Conectado`;
    connectionStatus.className = 'badge badge-status';
  });

  socket.on('disconnect', () => {
    connectionStatus.innerHTML = `<i class="ri-wifi-off-line"></i> Desconectado`;
    connectionStatus.className = 'badge status-error';
  });

  socket.on('queue_update', (data) => {
    renderQueue(data.queue || []);
  });

  // Búsqueda de canciones
  searchForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const artist = artistInput.value.trim();
    const amount = parseInt(amountInput.value) || 5;

    if (!artist) return;

    currentArtist = artist;
    setSearchLoading(true);

    try {
      const response = await fetch('/api/search', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ artist, amount })
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Error al buscar canciones');
      }

      currentResults = data.results || [];
      selectedMap.clear();
      // Seleccionar por defecto todas las canciones encontradas
      currentResults.forEach(item => selectedMap.add(item.id));

      renderResults(currentResults);
      showToast(`Se encontraron ${currentResults.length} canciones de ${artist}`);
    } catch (err) {
      showToast(err.message, 'error');
      resultsLoading.style.display = 'none';
      resultsPlaceholder.style.display = 'flex';
      resultsContainer.style.display = 'none';
    } finally {
      setSearchLoading(false);
    }
  });

  function setSearchLoading(isLoading) {
    if (isLoading) {
      searchBtn.disabled = true;
      searchBtn.querySelector('span').textContent = 'Buscando...';
      resultsPlaceholder.style.display = 'none';
      resultsContainer.style.display = 'none';
      resultsLoading.style.display = 'flex';
      batchActions.style.display = 'none';
    } else {
      searchBtn.disabled = false;
      searchBtn.querySelector('span').textContent = 'Buscar Canciones';
      resultsLoading.style.display = 'none';
    }
  }

  // Renderizar Lista de Resultados
  function renderResults(results) {
    resultsCount.textContent = results.length;

    if (results.length === 0) {
      resultsContainer.style.display = 'none';
      resultsPlaceholder.style.display = 'flex';
      batchActions.style.display = 'none';
      return;
    }

    resultsPlaceholder.style.display = 'none';
    resultsContainer.style.display = 'flex';
    batchActions.style.display = 'flex';
    resultsContainer.innerHTML = '';

    results.forEach((song) => {
      const isSelected = selectedMap.has(song.id);
      const card = document.createElement('div');
      card.className = `song-card ${isSelected ? 'selected' : ''}`;
      card.dataset.id = song.id;

      card.innerHTML = `
        <input type="checkbox" class="custom-checkbox" ${isSelected ? 'checked' : ''}>
        <img src="${song.thumbnail}" alt="${escapeHtml(song.title)}" class="song-thumb" onerror="this.src='https://images.unsplash.com/photo-1511671782779-c97d3d27a1d4?w=120'">
        <div class="song-info">
          <div class="song-title" title="${escapeHtml(song.title)}">${escapeHtml(song.title)}</div>
          <div class="song-meta">
            <span class="song-channel"><i class="ri-user-voice-line"></i> ${escapeHtml(song.channel)}</span>
            <span class="song-duration"><i class="ri-time-line"></i> ${song.duration}</span>
          </div>
        </div>
        <button class="btn btn-sm btn-ghost btn-single-add" title="Añadir esta canción a la cola">
          <i class="ri-add-line"></i>
        </button>
      `;

      // Evento checkbox
      const checkbox = card.querySelector('.custom-checkbox');
      checkbox.addEventListener('change', (e) => {
        e.stopPropagation();
        if (checkbox.checked) {
          selectedMap.add(song.id);
          card.classList.add('selected');
        } else {
          selectedMap.delete(song.id);
          card.classList.remove('selected');
        }
        updateSelectedCount();
      });

      // Click en toda la tarjeta para toggle checkbox
      card.addEventListener('click', (e) => {
        if (e.target.closest('.btn-single-add') || e.target.closest('.custom-checkbox')) return;
        checkbox.checked = !checkbox.checked;
        checkbox.dispatchEvent(new Event('change'));
      });

      // Añadir canción individual
      const addBtn = card.querySelector('.btn-single-add');
      addBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        addToQueue([song]);
      });

      resultsContainer.appendChild(card);
    });

    updateSelectedCount();
  }

  // Actualizar contador de seleccionados
  function updateSelectedCount() {
    selectedCount.textContent = selectedMap.size;
    downloadSelectedBtn.disabled = selectedMap.size === 0;
  }

  // Controles de Selección Masiva
  selectAllBtn.addEventListener('click', () => {
    currentResults.forEach(song => selectedMap.add(song.id));
    renderResults(currentResults);
  });

  deselectAllBtn.addEventListener('click', () => {
    selectedMap.clear();
    renderResults(currentResults);
  });

  // Enviar Seleccionadas a la Cola
  downloadSelectedBtn.addEventListener('click', () => {
    const selectedSongs = currentResults.filter(s => selectedMap.has(s.id));
    if (selectedSongs.length === 0) return;
    addToQueue(selectedSongs);
  });

  // Función para agregar ítems a la cola API
  async function addToQueue(items) {
    const quality = qualitySelect.value;
    try {
      const res = await fetch('/api/queue/add', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ items, quality })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);

      showToast(data.message || 'Canciones agregadas a la cola');
    } catch (err) {
      showToast(err.message, 'error');
    }
  }

  // Renderizar Cola de Descargas
  function renderQueue(queue) {
    queueCount.textContent = queue.length;

    if (queue.length === 0) {
      queueEmpty.style.display = 'flex';
      queueContainer.style.display = 'none';
      return;
    }

    queueEmpty.style.display = 'none';
    queueContainer.style.display = 'flex';
    queueContainer.innerHTML = '';

    queue.forEach((item) => {
      const card = document.createElement('div');
      const isActive = item.status === 'downloading' || item.status === 'converting';
      card.className = `queue-card ${isActive ? 'active' : ''}`;

      const statusMap = {
        pending: { label: 'Pendiente', class: 'status-pending' },
        downloading: { label: 'Descargando', class: 'status-downloading' },
        converting: { label: 'Convirtiendo MP3', class: 'status-converting' },
        completed: { label: 'Completado', class: 'status-completed' },
        error: { label: 'Error', class: 'status-error' }
      };

      const statusInfo = statusMap[item.status] || { label: item.status, class: 'status-pending' };
      const pct = Math.round(item.progress || 0);

      let barClass = '';
      if (item.status === 'converting') barClass = 'converting';
      if (item.status === 'completed') barClass = 'completed';
      if (item.status === 'error') barClass = 'error';

      const progressText = item.status === 'converting' 
        ? `<i class="ri-refresh-line spin-slow"></i> Codificando audio a MP3...`
        : `${pct}% ${item.speed ? `(${item.speed})` : ''}`;

      card.innerHTML = `
        <div class="queue-card-top">
          <img src="${item.thumbnail || ''}" alt="" class="song-thumb" onerror="this.src='https://images.unsplash.com/photo-1511671782779-c97d3d27a1d4?w=120'">
          <div class="queue-info">
            <div class="queue-title" title="${escapeHtml(item.title)}">${escapeHtml(item.title)}</div>
            <div class="queue-sub">
              <span><i class="ri-folder-music-line"></i> musica_${escapeHtml(item.artist.replace(/\s+/g, '_'))}</span>
              <span>• ${item.quality} kbps</span>
            </div>
          </div>
          <span class="status-badge ${statusInfo.class}">${statusInfo.label}</span>
          <button class="btn btn-sm btn-ghost btn-cancel" title="Cancelar / Eliminar">
            <i class="ri-close-line"></i>
          </button>
        </div>

        <div class="progress-container">
          <div class="progress-bar-bg">
            <div class="progress-bar-fill ${barClass}" style="width: ${pct}%"></div>
          </div>
          <div class="progress-stats">
            <span>${progressText}</span>
            <span>${item.eta ? `${item.eta}` : ''}</span>
          </div>
        </div>
      `;

      // Evento cancelar
      const cancelBtn = card.querySelector('.btn-cancel');
      cancelBtn.addEventListener('click', () => {
        cancelQueueItem(item.queueId);
      });

      queueContainer.appendChild(card);
    });
  }

  // Limpiar completadas
  clearCompletedBtn.addEventListener('click', async () => {
    try {
      await fetch('/api/queue/clear', { method: 'POST' });
    } catch (err) {
      console.error(err);
    }
  });

  // Cancelar ítem
  async function cancelQueueItem(queueId) {
    try {
      await fetch('/api/queue/cancel', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ queueId })
      });
    } catch (err) {
      console.error(err);
    }
  }

  // Notificaciones Toast
  function showToast(message, type = 'info') {
    const toastContainer = document.getElementById('toastContainer');
    const toast = document.createElement('div');
    toast.className = 'toast';
    const icon = type === 'error' ? 'ri-error-warning-line' : 'ri-checkbox-circle-line';
    const color = type === 'error' ? 'var(--rose)' : 'var(--emerald)';

    toast.innerHTML = `<i class="${icon}" style="color: ${color}; font-size: 18px;"></i> <span>${escapeHtml(message)}</span>`;
    toastContainer.appendChild(toast);

    setTimeout(() => {
      toast.style.animation = 'slideIn 0.3s ease reverse forwards';
      setTimeout(() => toast.remove(), 300);
    }, 4000);
  }

  function escapeHtml(str) {
    if (!str) return '';
    return str.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#039;");
  }
});
