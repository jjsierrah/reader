// === Base de datos ===
const db = new Dexie('EbookLibrary');
db.version(1).stores({
  books: '++id, name, type, dateAdded, lastPage'
});

// === Estado ===
let currentBook = null;
let epubRendition = null;
let isDark = localStorage.getItem('theme') === 'dark';

// === Inicializar ===
document.addEventListener('DOMContentLoaded', async () => {
  document.body.classList.toggle('dark', isDark);
  renderLibrary();
  loadBooks();
});

// === Renderizado ===
function renderLibrary() {
  const app = document.getElementById('app');
  app.innerHTML = `
    <div class="flex justify-between items-center mb-6 pt-2">
      <h1 class="text-2xl font-bold">Mi Biblioteca</h1>
      <button id="theme-toggle" class="p-2 rounded-full">
        ${isDark ? '☀️' : '🌙'}
      </button>
    </div>

    <div id="upload-zone" class="btn-outline text-center py-12 cursor-pointer">
      <div>📚</div>
      <p class="mt-2 font-medium">Toca para subir un libro</p>
      <p class="text-sm opacity-75">Soporta PDF, EPUB y TXT</p>
      <input type="file" id="file-input" accept=".pdf,.epub,.txt" class="hidden" />
    </div>

    <div id="book-list" class="mt-6"></div>
  `;

  // Eventos
  document.getElementById('theme-toggle').addEventListener('click', toggleTheme);
  document.getElementById('upload-zone').addEventListener('click', () => document.getElementById('file-input').click());
  document.getElementById('file-input').addEventListener('change', handleFileUpload);
}

function renderReader() {
  const app = document.getElementById('app');
  const isPdf = currentBook.type === 'pdf';
  const isEpub = currentBook.type === 'epub';
  const isTxt = currentBook.type === 'txt';

  app.innerHTML = `
    <div class="flex justify-between items-center mb-4 pt-2">
      <button id="back-btn" class="text-xl">←</button>
      <div class="book-title">${currentBook.name}</div>
      <button id="settings-btn" class="text-xl">⚙️</button>
    </div>

    <div id="content-area"></div>

    ${isTxt ? `
      <div class="nav-controls">
        <button id="prev-btn" class="btn" ${currentBook.currentPage <= 1 ? 'disabled' : ''}>Anterior</button>
        <span>Página <span id="current-page">${currentBook.currentPage}</span> / <span id="total-pages">${currentBook.totalPages}</span></span>
        <button id="next-btn" class="btn" ${currentBook.currentPage >= currentBook.totalPages ? 'disabled' : ''}>Siguiente</button>
      </div>
    ` : ''}
  `;

  // Eventos
  document.getElementById('back-btn').addEventListener('click', () => {
    if (epubRendition) epubRendition.destroy();
    currentBook = null;
    renderLibrary();
  });
  document.getElementById('settings-btn').addEventListener('click', showSettings);

  if (isPdf) {
    const blob = new Blob([currentBook.content], { type: 'application/pdf' });
    const url = URL.createObjectURL(blob);
    document.getElementById('content-area').innerHTML = `<embed src="${url}" type="application/pdf" class="pdf-viewer" />`;
  } else if (isEpub) {
    document.getElementById('content-area').innerHTML = '<div id="epub-viewer"></div>';
    loadEpub(currentBook.content, currentBook.lastPage || 'epubcfi(/6/2!)');
  } else if (isTxt) {
    displayTextPage();
    document.getElementById('prev-btn').addEventListener('click', prevPage);
    document.getElementById('next-btn').addEventListener('click', nextPage);
  }
}

function showSettings() {
  const isPdf = currentBook.type === 'pdf';
  const isTxt = currentBook.type === 'txt';
  
  const settingsHtml = `
    <div id="settings-overlay" class="card">
      <div class="flex justify-between items-center mb-3">
        <h3>Ajustes</h3>
        <button id="close-settings">×</button>
      </div>
      ${isTxt ? `
        <label>Tamaño de fuente</label>
        <input type="range" id="font-size" min="14" max="24" value="${localStorage.getItem('fontSize') || 18}" />
      ` : ''}
      ${isPdf ? `
        <div class="flex gap-2 mt-2">
          <button id="zoom-out" class="btn flex-1">-</button>
          <button id="zoom-in" class="btn flex-1">+</button>
        </div>
        <div class="text-center mt-1" id="zoom-level">100%</div>
      ` : ''}
      <button id="toggle-theme-reader" class="btn btn-primary w-full mt-3">
        Modo ${isDark ? 'Claro' : 'Oscuro'}
      </button>
    </div>
  `;
  
  document.getElementById('app').insertAdjacentHTML('beforeend', settingsHtml);
  
  document.getElementById('close-settings').onclick = () => document.getElementById('settings-overlay').remove();
  document.getElementById('toggle-theme-reader').onclick = toggleTheme;
  
  if (isTxt) {
    document.getElementById('font-size').oninput = (e) => {
      localStorage.setItem('fontSize', e.target.value);
      if (currentBook && currentBook.type === 'txt') displayTextPage();
    };
  }
  
  if (isPdf) {
    let zoom = parseFloat(localStorage.getItem('pdfZoom') || 1);
    document.getElementById('zoom-level').textContent = Math.round(zoom * 100) + '%';
    document.getElementById('zoom-in').onclick = () => {
      zoom = Math.min(2, zoom + 0.1);
      localStorage.setItem('pdfZoom', zoom);
      document.getElementById('zoom-level').textContent = Math.round(zoom * 100) + '%';
      // Nota: el zoom en <embed> no se aplica fácilmente sin transform CSS
    };
    document.getElementById('zoom-out').onclick = () => {
      zoom = Math.max(0.5, zoom - 0.1);
      localStorage.setItem('pdfZoom', zoom);
      document.getElementById('zoom-level').textContent = Math.round(zoom * 100) + '%';
    };
  }
}

// === Funciones principales ===
async function handleFileUpload(e) {
  const file = e.target.files[0];
  if (!file) return;

  const ext = file.name.split('.').pop().toLowerCase();
  if (!['pdf', 'epub', 'txt'].includes(ext)) {
    alert('Formato no soportado. Usa PDF, EPUB o TXT.');
    return;
  }

  const arrayBuffer = await file.arrayBuffer();
  const book = {
    name: file.name,
    type: ext,
    content: arrayBuffer,
    lastPage: ext === 'epub' ? 'epubcfi(/6/2!)' : 1,
    dateAdded: new Date().toISOString()
  };

  const id = await db.books.add(book);
  book.id = id;
  openBook(book);
}

function openBook(book) {
  currentBook = book;
  renderReader();
}

async function loadEpub(arrayBuffer, cfi) {
  if (epubRendition) epubRendition.destroy();
  
  const book = ePub(arrayBuffer);
  epubRendition = book.renderTo('epub-viewer', {
    width: '100%',
    height: '100%',
    flow: 'paginated'
  });

  await epubRendition.display(cfi);
  
  epubRendition.on('relocated', (location) => {
    db.books.update(currentBook.id, { lastPage: location.start.cfi });
  });
}

function displayTextPage() {
  const fontSize = localStorage.getItem('fontSize') || 18;
  const text = new TextDecoder().decode(currentBook.content);
  const words = text.split(' ');
  const wordsPerPage = 250;
  const totalPages = Math.ceil(words.length / wordsPerPage);
  currentBook.totalPages = totalPages;
  
  if (!currentBook.currentPage) currentBook.currentPage = 1;
  
  const start = (currentBook.currentPage - 1) * wordsPerPage;
  const pageWords = words.slice(start, start + wordsPerPage).join(' ');
  
  document.getElementById('content-area').innerHTML = `
    <div class="text-viewer" style="font-size: ${fontSize}px">${pageWords}</div>
  `;
  
  if (document.getElementById('current-page')) {
    document.getElementById('current-page').textContent = currentBook.currentPage;
    document.getElementById('total-pages').textContent = totalPages;
  }
  
  db.books.update(currentBook.id, { lastPage: currentBook.currentPage });
}

function nextPage() {
  if (currentBook.currentPage < currentBook.totalPages) {
    currentBook.currentPage++;
    displayTextPage();
  }
}

function prevPage() {
  if (currentBook.currentPage > 1) {
    currentBook.currentPage--;
    displayTextPage();
  }
}

async function loadBooks() {
  const books = await db.books.toArray();
  const list = document.getElementById('book-list');
  list.innerHTML = books.length ? `<h2 class="mb-3">Mis Libros (${books.length})</h2>` : '';
  
  books.forEach(book => {
    const div = document.createElement('div');
    div.className = 'card flex justify-between items-center';
    div.innerHTML = `
      <div class="flex items-center gap-3">
        <span>📚</span>
        <span class="book-title">${book.name}</span>
      </div>
      <span>${book.type.toUpperCase()}</span>
    `;
    div.onclick = () => openBook(book);
    list.appendChild(div);
  });
}

function toggleTheme() {
  isDark = !isDark;
  localStorage.setItem('theme', isDark ? 'dark' : 'light');
  document.body.classList.toggle('dark', isDark);
  document.getElementById('theme-toggle').textContent = isDark ? '☀️' : '🌙';
}
