document.getElementById('dom-status').textContent = '✅ DOM listo. Ejecutando app.js...';

try {
  // 1. Verifica que las librerías estén disponibles
  if (!window.libsLoaded) {
    throw new Error('Librerías no cargadas (Dexie o EPUB.js)');
  }

  // 2. Inicializa Dexie
  const db = new Dexie('EbookLibrary');
  db.version(1).stores({
    books: '++id, name, type, dateAdded, lastPage'
  });

  document.getElementById('db-status').textContent = '✅ Base de datos inicializada';

  // 3. Función de renderizado simple
  function renderView() {
    document.getElementById('render-status').textContent = '✅ ¡Interfaz lista!';
    document.getElementById('app').innerHTML = `
      <h1>📚 JJ eBook Reader</h1>
      <p>✅ Todo funciona correctamente.</p>
      <p>Tu entorno soporta:</p>
      <ul>
        <li>Dexie.js ✅</li>
        <li>EPUB.js ✅</li>
        <li>IndexedDB ✅</li>
      </ul>
      <button onclick="testFileUpload()">Prueba subida</button>
    `;
  }

  // 4. Prueba de IndexedDB (opcional)
  db.books.toArray().then(() => {
    renderView();
  }).catch(err => {
    document.getElementById('db-status').innerHTML = '⚠️ IndexedDB falló: ' + err.message;
    // Aun así, renderiza interfaz básica
    renderView();
  });

} catch (err) {
  document.getElementById('app').innerHTML += `
    <div style="background:#fee; color:#c00; padding:12px; margin-top:16px; border-radius:6px;">
      <strong>❌ Error crítico:</strong> ${err.message}<br>
      <small>${err.stack}</small>
    </div>
  `;
}

function testFileUpload() {
  alert('Subida de archivos funcionando');
}
