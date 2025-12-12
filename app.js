// === Configuración obligatoria para EPUB.js en entornos restringidos ===
window.EPUBJS_OPTIONS = {
  worker: false,
  requestMethod: "xhr"
};

let currentBook = null;
let epubRendition = null;
let isDark = localStorage.getItem('theme') === 'dark';

document.addEventListener('DOMContentLoaded', async () => {
  document.body.classList.toggle('dark', isDark);
  await initDB();
  renderLibrary();
});

// === IndexedDB (solo para PDF y TXT, no EPUB por tamaño) ===
let db;
async function initDB() {
  try {
    db = new Dexie('EbookLibrary');
    db.version(1).stores({
      books: '++id, name, type, dateAdded, lastPage'
    });
    await db.open();
  } catch (err) {
    console.warn('IndexedDB no disponible. Solo lectura temporal.');
  }
}

// === Biblioteca ===
function renderLibrary() {
  const app = document.getElementById('app');
  app.innerHTML = `
    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:24px;">
      <h1 style="font-size:1.8rem;">Mi Biblioteca</h1>
      <button id="theme-btn" style="font-size:1.5rem;">${isDark ? '☀️' : '🌙'}</button>
    </div>

    <div id="upload-zone" style="border:2px dashed #cbd5e1;padding:40px;text-align:center;cursor:pointer;background:white;border-radius:12px;margin:20px 0;">
      <div style="font-size:3rem;">📚</div>
      <p style="margin-top:12px;font-weight:600;">Subir libro (PDF, EPUB, TXT)</p>
      <input type="file" id="file-input" accept=".pdf,.epub,.txt" style="display:none;" />
    </div>

    <div id="book-list"></div>
  `;

  document.getElementById('theme-btn').onclick = toggleTheme;
  document.getElementById('upload-zone').onclick = () => document.getElementById('file-input').click();
  document.getElementById('file-input').onchange = handleFileUpload;

  loadBooks();
}

async function loadBooks() {
  if (!db) return;
  try {
    const books = await db.books.toArray();
    const list = document.getElementById('book-list');
    list.innerHTML = books.length ? `<h2 style="margin:24px 0 12px;">Mis Libros (${books.length})</h2>` : '';
    books.forEach(book => {
      const el = document.createElement('div');
      el.className = 'card';
      el.innerHTML = `<div><strong>${book.name}</strong></div><div>${book.type.toUpperCase()}</div>`;
      el.onclick = () => openBook(book);
      list.appendChild(el);
    });
  } catch (err) {
    console.error('Error al cargar libros:', err);
  }
}

// === Subida de archivos ===
async function handleFileUpload(e) {
  const file = e.target.files[0];
  if (!file) return;

  const ext = file.name.split('.').pop().toLowerCase();
  if (!['pdf', 'epub', 'txt'].includes(ext)) {
    alert('Formato no soportado. Usa PDF, EPUB o TXT.');
    return;
  }

  let book;

  if (ext === 'epub') {
    // ✅ EPUB: usar Blob con MIME type correcto + URL
    const blob = new Blob([file], { type: 'application/epub+zip' });
    const url = URL.createObjectURL(blob);
    book = {
      name: file.name,
      type: 'epub',
      url: url,
      lastPage: 'epubcfi(/6/2!)',
      dateAdded: new Date().toISOString()
    };
    // No se guarda en IndexedDB (evita problemas de tamaño)
    openBook(book);
  } 
  else if (ext === 'pdf') {
    const arrayBuffer = await file.arrayBuffer();
    book = {
      name: file.name,
      type: 'pdf',
      content: arrayBuffer,
      lastPage: 1,
      dateAdded: new Date().toISOString()
    };
    if (db) {
      const id = await db.books.add(book);
      book.id = id;
    }
    openBook(book);
  } 
  else if (ext === 'txt') {
    const text = await file.text();
    book = {
      name: file.name,
      type: 'txt',
      content: text,
      lastPage: 1,
      dateAdded: new Date().toISOString()
    };
    if (db) {
      const id = await db.books.add(book);
      book.id = id;
    }
    openBook(book);
  }
}

// === Abrir libro ===
function openBook(book) {
  currentBook = book;
  const app = document.getElementById('app');
  app.innerHTML = `
    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:16px;">
      <button id="back-btn" style="font-size:1.5rem;">←</button>
      <div style="font-weight:600;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${book.name}</div>
      <div style="width:24px;"></div>
    </div>
    <div id="content-area" style="min-height:80vh;"></div>
  `;

  document.getElementById('back-btn').onclick = () => {
    if (epubRendition) {
      epubRendition.destroy();
      epubRendition = null;
    }
    // Liberar blob URL si existe
    if (book.url && book.url.startsWith('blob:')) {
      URL.revokeObjectURL(book.url);
    }
    renderLibrary();
  };

  if (book.type === 'pdf') {
    const blob = new Blob([book.content], { type: 'application/pdf' });
    const url = URL.createObjectURL(blob);
    document.getElementById('content-area').innerHTML = `<embed src="${url}" type="application/pdf" class="pdf-viewer" />`;
  } 
  else if (book.type === 'epub') {
    // ✅ Renderizar EPUB con URL
    document.getElementById('content-area').innerHTML = '<div id="epub-viewer"></div>';
    const viewer = document.getElementById('epub-viewer');
    viewer.style.height = '100%';
    viewer.style.minHeight = '600px';

    // Pequeño retraso para asegurar renderizado del DOM
    setTimeout(() => {
      loadEpub(book.url, book.lastPage);
    }, 100);
  } 
  else if (book.type === 'txt') {
    document.getElementById('content-area').innerHTML = `<div class="text-viewer">${book.content}</div>`;
  }
}

// === Cargar EPUB desde URL ===
async function loadEpub(url, cfi) {
  try {
    const book = ePub(url);
    epubRendition = book.renderTo('epub-viewer', {
      width: '100%',
      height: '100%',
      flow: 'paginated'
    });

    await epubRendition.display(cfi);

    if (db && currentBook?.id) {
      epubRendition.on('relocated', (location) => {
        db.books.update(currentBook.id, { lastPage: location.start.cfi });
      });
    }
  } catch (err) {
    const viewer = document.getElementById('epub-viewer');
    if (viewer) {
      viewer.innerHTML = `<p style="color:red;padding:20px;">❌ Error al cargar EPUB:<br>${err.message}</p>`;
    }
    console.error('EPUB load error:', err);
  }
}

// === Tema ===
function toggleTheme() {
  isDark = !isDark;
  localStorage.setItem('theme', isDark ? 'dark' : 'light');
  document.body.classList.toggle('dark', isDark);
  document.getElementById('theme-btn').textContent = isDark ? '☀️' : '🌙';
}
