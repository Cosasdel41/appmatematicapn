const STATE_KEY = 'matematica_avance_v1';
let materias = [];

// 1. BOOT: Carga inicial de datos y Service Worker
async function boot() {
  try {
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.register('./sw.js')
        .then(() => console.log('SW registrado'))
        .catch(err => console.warn('SW error', err));
    }
    
    // Forzamos cache: 'no-store' para asegurar que lea cambios recientes
    const res = await fetch('materias.json', { cache: 'no-store' });
    if (!res.ok) throw new Error('HTTP ' + res.status);
    
    const data = await res.json();
    // Ordenar por ID para mantener consistencia
    materias = (data.materias || []).sort((a, b) => a.id - b.id);
    
    init(); // Iniciar la app
    
  } catch (e) {
    console.error('Error cargando datos:', e);
    const container = document.querySelector('main');
    if(container) {
      container.innerHTML = `<div style="padding:20px; color:red; text-align:center">
        <h3>Error cargando materias</h3>
        <p>Verifica que el archivo <b>materias.json</b> esté en la misma carpeta y tenga el formato correcto.</p>
        <small>${e.message}</small>
      </div>`;
    }
  }
}

// 2. STATE MANAGEMENT: Guardar y cargar progreso
function loadState() {
  try {
    return JSON.parse(localStorage.getItem(STATE_KEY)) || { aprobadas: {}, cursadas: {} };
  } catch (e) {
    return { aprobadas: {}, cursadas: {} };
  }
}

function saveState(st) {
  localStorage.setItem(STATE_KEY, JSON.stringify(st));
  renderProgreso(); // Actualizar barra de progreso al guardar
}

// 3. INIT: Configuración inicial
function init() {
  renderProgreso();
  renderChecklist();
  renderMatriz();
  setupCollapsibles();
  setupExportImport();
  setupModal();
}

// 4. LÓGICA DE CORRELATIVIDADES
function getEstadoMateria(materia, state) {
  const isCursada = state.cursadas[materia.id];
  const isAprobada = state.aprobadas[materia.id];

  // Verificar Prerrequisitos para cursar
  const reqCursada = materia.prerrequisitos?.requiresCursada || [];
  const reqAcreditar = materia.prerrequisitos?.requiresAcreditar || [];

  // Para poder cursar esta, necesito tener CURSADAS las requeridas
  const puedeCursar = reqCursada.every(id => state.cursadas[id] || state.aprobadas[id]);
  
  // Para poder dar final (acreditar) esta, necesito las anteriores APROBADAS + cursada de esta
  const puedeAprobar = isCursada && reqAcreditar.every(id => state.aprobadas[id]);

  return { isCursada, isAprobada, puedeCursar, puedeAprobar };
}

// 5. RENDER CHECKLIST (La lista de materias)
function renderChecklist() {
  const container = document.getElementById('checklist');
  if (!container) return;
  container.innerHTML = '';

  const state = loadState();
  const grupos = {};

  // Agrupar por año
  materias.forEach(m => {
    if (!grupos[m.anio]) grupos[m.anio] = [];
    grupos[m.anio].push(m);
  });

  // Generar HTML por año
  Object.keys(grupos).forEach(anio => {
    const section = document.createElement('div');
    section.className = 'anio-section';
    section.innerHTML = `<h3 class="anio-title">${anio} Año</h3>`;
    
    grupos[anio].forEach(m => {
      const estado = getEstadoMateria(m, state);
      const div = document.createElement('div');
      div.className = `materia-card ${estado.puedeCursar ? 'habilitada' : 'bloqueada'}`;
      if (estado.isAprobada) div.classList.add('aprobada-full');

      // Checkboxes
      const checkedCursada = estado.isCursada || estado.isAprobada ? 'checked' : '';
      const checkedFinal = estado.isAprobada ? 'checked' : '';
      const disabledCursada = !estado.puedeCursar ? 'disabled' : '';
      const disabledFinal = !estado.puedeAprobar ? 'disabled' : '';

      div.innerHTML = `
        <div class="materia-info">
          <span class="materia-id">#${m.id}</span>
          <span class="materia-nombre">${m.nombre}</span>
          ${!estado.puedeCursar ? '<span class="badge bloqueada">Bloqueada</span>' : ''}
        </div>
        <div class="materia-actions">
          <label class="check-label">
            <input type="checkbox" ${checkedCursada} ${disabledCursada} 
              onchange="toggleEstado(${m.id}, 'cursada', this.checked)">
            Cursada
          </label>
          <label class="check-label">
            <input type="checkbox" ${checkedFinal} ${disabledFinal}
              onchange="toggleEstado(${m.id}, 'final', this.checked)">
            Final
          </label>
        </div>
      `;
      section.appendChild(div);
    });
    container.appendChild(section);
  });
}

// 6. ACCIONES DE CHECKBOX
window.toggleEstado = function(id, tipo, valor) {
  const state = loadState();
  
  if (tipo === 'cursada') {
    if (valor) state.cursadas[id] = true;
    else {
      state.cursadas[id] = false;
      state.aprobadas[id] = false; // Si saco cursada, saco final
    }
  } else if (tipo === 'final') {
    if (valor) {
      state.aprobadas[id] = true;
      state.cursadas[id] = true; // Si aprobé, seguro cursé
    } else {
      state.aprobadas[id] = false;
    }
  }

  saveState(state);
  // Re-renderizar todo para actualizar bloqueos y visuales
  renderChecklist(); 
  renderMatriz();
  renderProgreso();
};

// 7. RENDER PROGRESO
function renderProgreso() {
  const state = loadState();
  const total = materias.length;
  if (total === 0) return;

  const aprobadas = Object.values(state.aprobadas).filter(v => v).length;
  const porcentaje = Math.round((aprobadas / total) * 100);

  const fill = document.getElementById('progress-fill');
  const nota = document.getElementById('progreso-nota');
  
  if (fill) fill.style.width = `${porcentaje}%`;
  
  if (nota) {
    let msg = 'Seguí sumando materias.';
    if (porcentaje >= 25 && porcentaje < 50) msg = '¡Bien! Ya podés anotarte en Listado de Emergencia.';
    else if (porcentaje >= 50 && porcentaje < 75) msg = '¡Excelente! Habilitado para Listado 108 B Item 5.';
    else if (porcentaje >= 75 && porcentaje < 100) msg = '¡Casi listo! Habilitado para Listado 108 B Item 4.';
    else if (porcentaje === 100) msg = '¡Felicitaciones! Título completo (Listado 108 A).';
    
    nota.textContent = `${aprobadas}/${total} Materias (${porcentaje}%) • ${msg}`;
  }
}

// 8. RENDER MATRIZ (Visualización simple de grilla)
function renderMatriz() {
  const container = document.getElementById('matriz');
  if (!container) return;
  
  const state = loadState();
  container.innerHTML = '';
  
  materias.forEach(m => {
    const estado = getEstadoMateria(m, state);
    const div = document.createElement('div');
    div.textContent = m.id;
    div.title = m.nombre;
    div.className = 'matriz-item';
    
    if (estado.isAprobada) {
        div.style.background = 'var(--ok, #2a7a2a)';
        div.style.color = '#fff';
    } else if (estado.isCursada) {
        div.style.background = '#8ebf8e'; 
    } else if (!estado.puedeCursar) {
        div.style.background = 'var(--bad, #b23b3b)';
        div.style.color = '#fff';
        div.style.opacity = '0.5';
    } else {
        div.style.border = '1px solid var(--ink)';
    }
    
    // Estilos inline básicos para la matriz si no están en CSS
    div.style.display = 'flex';
    div.style.alignItems = 'center';
    div.style.justifyContent = 'center';
    div.style.fontWeight = 'bold';
    div.style.borderRadius = '4px';
    div.style.padding = '4px';
    div.style.fontSize = '0.8rem';
    
    container.appendChild(div);
  });
}

// 9. COLLAPSIBLES (La parte que arreglamos antes)
function setupCollapsibles() {
  document.querySelectorAll('.collapse-toggle').forEach(btn => {
    const id = btn.getAttribute('data-target');
    const panel = document.getElementById(id);
    if (!panel) return;

    // Set icon inicial
    const updateIcon = () => {
       const isCollapsed = panel.classList.contains('collapsed');
       btn.textContent = btn.textContent.replace(/[▸▾]/g, isCollapsed ? '▸' : '▾');
    };
    updateIcon();

    btn.onclick = () => {
      panel.classList.toggle('collapsed');
      updateIcon();
    };
  });
}

// 10. EXPORT / IMPORT / MODAL
function setupExportImport() {
  const btnExport = document.getElementById('exportar-estado');
  const btnImport = document.getElementById('importar-estado');
  const fileInput = document.getElementById('import-file');

  if(btnExport) {
    btnExport.onclick = () => {
      const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(loadState()));
      const downloadAnchorNode = document.createElement('a');
      downloadAnchorNode.setAttribute("href", dataStr);
      downloadAnchorNode.setAttribute("download", "progreso_materias.json");
      document.body.appendChild(downloadAnchorNode); // required for firefox
      downloadAnchorNode.click();
      downloadAnchorNode.remove();
    };
  }

  if(btnImport && fileInput) {
    btnImport.onclick = () => fileInput.click();
    fileInput.onchange = (e) => {
      const file = e.target.files[0];
      if(!file) return;
      const reader = new FileReader();
      reader.onload = (event) => {
        try {
          const newState = JSON.parse(event.target.result);
          if(newState.aprobadas && newState.cursadas) {
            saveState(newState);
            renderChecklist();
            renderMatriz();
            alert('Progreso importado correctamente.');
          } else {
            alert('El archivo no tiene el formato correcto.');
          }
        } catch(err) {
          alert('Error al leer el archivo JSON.');
        }
      };
      reader.readAsText(file);
    };
  }
}

function setupModal() {
    const modal = document.getElementById('modal');
    const closeBtn = document.getElementById('modal-close');
    if(modal && closeBtn) {
        closeBtn.onclick = () => modal.close();
    }
}

// Arrancar
boot();
