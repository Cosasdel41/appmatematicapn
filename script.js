const STATE_KEY = 'matemática_avance';
let materias = [];

async function boot(){
  try{
    if ('serviceWorker' in navigator){ navigator.serviceWorker.register('sw.js'); }
    const res = await fetch('materias.json', {cache:'no-store'});
    if(!res.ok) throw new Error('HTTP '+res.status);
    const data = await res.json();
    materias = (data.materias||[]).sort((a,b)=>a.id-b.id);
  }catch(e){
    console.error('No se pudo cargar materias.json', e);
    materias = [];
    const box = document.getElementById('app-alert');
    if(box){
      box.textContent = 'No se pudo cargar materias.json. La interfaz sigue funcionando pero sin datos. Verificá que el archivo exista en el repositorio.';
      box.hidden = false;
    }
  }finally{
    init();
  }
}
boot();

function loadState(){
  try{ return JSON.parse(localStorage.getItem(STATE_KEY)) || {aprobadas:{}, cursadas:{}}; }
  catch(e){ return {aprobadas:{}, cursadas:{}}; }
}
function saveState(st){ localStorage.setItem(STATE_KEY, JSON.stringify(st)); }

function init(){
  setupModal();
  setupBuscador();
  setupCollapsibles();
  setupExportImport();
  renderProgreso();
  renderChecklist();
  renderMatriz();
}

/* =======================
   PROMEDIO AUTOMÁTICO
   ======================= */
function calcularPromedio(state){
  const notas = Object.values(state.aprobadas || {})
    .map(reg => Number(reg.nota))
    .filter(n => !Number.isNaN(n));

  if(notas.length === 0) return null;

  const suma = notas.reduce((a,b)=>a+b, 0);
  return suma / notas.length;
}

// Export/Import
function setupExportImport(){
  const btnExp = document.getElementById('exportar-estado');
  const btnImp = document.getElementById('importar-estado');
  const inputFile = document.getElementById('import-file');
  if(btnExp){
    btnExp.onclick = () => {
      const state = loadState();
      const payload = {version:1, exportedAt:new Date().toISOString(), appKey:STATE_KEY, totalMaterias:materias.length, state};
      const blob = new Blob([JSON.stringify(payload, null, 2)], {type:'application/json'});
      const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = 'progreso-profesorado-quimica.json';
      document.body.appendChild(a); a.click(); URL.revokeObjectURL(a.href); a.remove();
    };
  }
  if(btnImp && inputFile){
    btnImp.onclick = () => inputFile.click();
    inputFile.onchange = async () => {
      const file = inputFile.files[0]; if(!file) return;
      try{
        const text = await file.text(); const data = JSON.parse(text);
        if(!data || !data.state){ alert('Archivo inválido.'); return; }
        if(!confirm('Esto reemplazará el estado actual (aprobadas/cursadas) por el importado. ¿Continuar?')) return;
        localStorage.setItem(STATE_KEY, JSON.stringify(data.state));
        renderChecklist(); renderMatriz(); renderProgreso();
        alert('Estado importado correctamente.');
      }catch(e){ alert('No se pudo importar el archivo.'); }
      finally{ inputFile.value = ''; }
    };
  }
}

// Modal
function setupModal(){ const dlg = document.getElementById('modal'); document.getElementById('modal-close').onclick = ()=> dlg.close(); }

// Reglas aprobación
function passThreshold(m){ const fmt=(m.formato||'').toLowerCase(); return fmt.includes('asignatura') ? 4 : 7; }
function isAprobada(m, state){ const reg = state.aprobadas[m.id]; if(!reg) return false; const n=Number(reg.nota); return !Number.isNaN(n) && n>=passThreshold(m); }
function hasCursada(m, state){ return !!state.cursadas[m.id] || isAprobada(m, state); }

// Buscador
function setupBuscador(){
  const input = document.getElementById('search'); const ul = document.getElementById('search-results');
  input.addEventListener('input', ()=>{ const q=input.value.trim().toLowerCase(); ul.innerHTML=''; if(!q) return;
    materias.filter(m=>m.nombre.toLowerCase().includes(q)).slice(0,10).forEach(m=>{
      const li=document.createElement('li'); li.textContent=`${m.id}. ${m.nombre}`;
      li.onclick=()=>{ const el=document.querySelector(`[data-card-id="${m.id}"]`); if(el){ el.scrollIntoView({behavior:'smooth',block:'center'}); el.classList.add('pulse'); setTimeout(()=>el.classList.remove('pulse'),800); } };
      ul.appendChild(li);
    });
  });
}

// Correlatividades
function isHabilitada(m, state){
  const haveApproved = (id)=>{ const mm=materias.find(x=>x.id===id); return mm?isAprobada(mm,state):false; };
  const haveCursada = (id)=>{ const mm=materias.find(x=>x.id===id); return mm?hasCursada(mm,state):false; };
  const allC = (arr)=>arr.every(x=> (typeof x==='number')?haveCursada(x):(x&&x.anyOf)?x.anyOf.some(id=>haveCursada(id)):true);
  const allA = (arr)=>arr.every(x=> (typeof x==='number')?haveApproved(x):(x&&x.anyOf)?x.anyOf.some(id=>haveApproved(id)):true);
  const reqC=m.prerrequisitos.requiresCursada||[]; const reqA=m.prerrequisitos.requiresAcreditar||[];
  return allC(reqC) && allA(reqA);
}
function statusDeMateria(m, state){ return isAprobada(m,state)?{tipo:'APROBADA',clase:'aprobada'}:(isHabilitada(m,state)?{tipo:'HABILITADA',clase:'habilitada'}:{tipo:'BLOQUEADA',clase:'bloqueada'}); }

// Checklist
function renderChecklist(){
  const cont=document.getElementById('checklist'); const state=loadState(); cont.innerHTML='';
  materias.forEach(m=>{
    const st=statusDeMateria(m,state);
    const card=document.createElement('div'); card.className='card'; card.dataset.cardId=m.id;
    const head=document.createElement('div'); head.className='card-header';
    head.innerHTML=`<div class="card-title">${m.id}. ${m.nombre}</div><span class="badge ${st.clase}">${st.tipo}</span>`;
    const meta=document.createElement('div'); meta.className='meta'; meta.textContent=`Año: ${m.anio} • Régimen: ${m.regimen} • Formato: ${m.formato}`;
    const row=document.createElement('div'); row.className='row';
    const chk=document.createElement('input'); chk.type='checkbox'; chk.checked=!!state.cursadas[m.id]; chk.id=`cursada-${m.id}`;
    const lbl=document.createElement('label'); lbl.htmlFor=chk.id; lbl.textContent='Cursada';
    chk.onchange=()=>{ const s=loadState(); if(chk.checked){s.cursadas[m.id]=true;} else {delete s.cursadas[m.id];} saveState(s); renderChecklist(); renderMatriz(); renderProgreso(); };
    const input=document.createElement('input'); input.type='number'; input.min='0'; input.max='10'; input.step='0.1'; input.placeholder='Nota'; input.className='input-nota'; input.value=state.aprobadas[m.id]?.nota ?? '';
    const btn=document.createElement('button'); btn.className='btn'; btn.textContent='Guardar nota';
    btn.onclick=()=>{ const nota=parseFloat(input.value); const s=loadState(); if(!Number.isNaN(nota)){ if(!s.aprobadas[m.id]) s.aprobadas[m.id]={}; s.aprobadas[m.id].nota=nota; } else { delete s.aprobadas[m.id]; } saveState(s); renderChecklist(); renderMatriz(); renderProgreso(); };
    const um=document.createElement('div'); um.className='meta'; um.textContent=`Aprueba con ≥ ${passThreshold(m)}`;
    row.appendChild(chk); row.appendChild(lbl); row.appendChild(input); row.appendChild(btn);
    card.appendChild(head); card.appendChild(meta); card.appendChild(row); card.appendChild(um); cont.appendChild(card);
  });
}

// Matriz
function renderMatriz(){
  const grid=document.getElementById('matriz'); const state=loadState(); grid.innerHTML='';
  materias.forEach(m=>{
    const st=statusDeMateria(m,state);
    const box=document.createElement('div'); box.className=`materia-box ${st.clase}`;
    const nota=state.aprobadas[m.id]?.nota; const notaTxt=(nota!==undefined && nota!=='')?` • Nota: ${nota}`:'';
    box.innerHTML=`<div class="nombre">${m.id}. ${m.nombre}</div><div class="detalle">Año ${m.anio} • ${m.regimen} • ${m.formato}${notaTxt}</div>`;
    box.onclick=()=>{
      if(st.clase==='bloqueada'){ mostrarBloqueo(m,state); }
      else if(st.clase==='habilitada'){
        const val=prompt(`Ingresá la nota final para “${m.nombre}” (aprueba con ≥ ${passThreshold(m)}). Dejá vacío para no guardar.`); if(val===null) return;
        const n=parseFloat(val); const s=loadState(); if(!Number.isNaN(n)){ if(!s.aprobadas[m.id]) s.aprobadas[m.id]={}; s.aprobadas[m.id].nota=n; saveState(s); renderChecklist(); renderMatriz(); renderProgreso(); }
      }else{
        const cur=state.aprobadas[m.id]?.nota ?? ''; const val=prompt(`Cosas del 41 te recomienda que al editar nota para “${m.nombre}” (actual: ${cur}). Borrar para eliminar.`, cur); if(val===null) return;
        const s=loadState(); if(val.trim()===''){ delete s.aprobadas[m.id]; } else { const n=parseFloat(val); if(!Number.isNaN(n)){ if(!s.aprobadas[m.id]) s.aprobadas[m.id]={}; s.aprobadas[m.id].nota=n; } } saveState(s); renderChecklist(); renderMatriz(); renderProgreso();
      }
    };
    grid.appendChild(box);
  });
}

// Bloqueo modal
function requisitosFaltantesNombres(m, state){
  const haveApproved=(id)=>{ const mm=materias.find(x=>x.id===id); return mm?isAprobada(mm,state):false; };
  const haveCursada=(id)=>{ const mm=materias.find(x=>x.id===id); return mm?hasCursada(mm,state):false; };
  const falt=[];
  const pushC=(token)=>{ if(typeof token==='number'){ if(!haveCursada(token)){ const mm=materias.find(x=>x.id===token); if(mm) falt.push(mm.nombre); } } else if(token&&token.anyOf){ const ok=token.anyOf.some(id=>haveCursada(id)); if(!ok){ const names=token.anyOf.map(id=>(materias.find(x=>x.id===id)||{}).nombre).filter(Boolean); falt.push('al menos una de: '+names.join(', ')); } } };
  const pushA=(token)=>{ if(typeof token==='number'){ if(!haveApproved(token)){ const mm=materias.find(x=>x.id===token); if(mm) falt.push(mm.nombre); } } else if(token&&token.anyOf){ const ok=token.anyOf.some(id=>haveApproved(id)); if(!ok){ const names=token.anyOf.map(id=>(materias.find(x=>x.id===id)||{}).nombre).filter(Boolean); falt.push('al menos una de: '+names.join(', ')); } } };
  (m.prerrequisitos.requiresCursada||[]).forEach(pushC);
  (m.prerrequisitos.requiresAcreditar||[]).forEach(pushA);
  return falt;
}
function mostrarBloqueo(m, state){
  const faltan=requisitosFaltantesNombres(m,state);
  const body=document.getElementById('modal-body');
  body.innerHTML=`<strong>Para cursar:</strong> ${m.nombre}<br><strong>Necesitás:</strong>` + (faltan.length?('<ul>'+faltan.map(x=>`<li>${x}</li>`).join('')+'</ul>'):' <em>No pudimos determinar los requisitos.</em>');
  document.getElementById('modal').showModal();
}

// Progreso
function renderProgreso(){
  const state=loadState(); const total=materias.length;
  const aprobadasIds=Object.keys(state.aprobadas).map(k=>Number(k)).filter(id=>{ const m=materias.find(x=>x.id===id); return m && isAprobada(m,state); });
  const aprobadas=aprobadasIds.length; const porcentaje=total>0?Math.round((aprobadas/total)*100):0;

  const topline=document.getElementById('progreso-topline');
  if(topline){
    const curs = Object.keys(state.cursadas||{}).length;
    const promedio = calcularPromedio(state);
    const promTxt = promedio !== null ? ` • Promedio: ${promedio.toFixed(2)}` : '';
    topline.textContent =
      `Aprobadas: ${aprobadas}/${total} (${porcentaje}%) • Cursadas: ${curs}${promTxt}`;
  }

  const fill=document.getElementById('progress-fill'); if(fill){ fill.style.width=porcentaje+'%'; }
  const nota=document.getElementById('progreso-nota'); if(nota){ let msg=''; if(porcentaje===100) msg='Felicitaciones, podes anotarte en el 108 A'; else if(porcentaje>=75) msg='Podes anotarte en el listado 108 b Item 4'; else if(porcentaje>=50) msg='Podes anotarte en el listado 108 b Item 5'; else if(porcentaje>25) msg='Podes anotarte en el listado de Emergencia'; else msg='Seguí sumando materias para habilitar listados.'; nota.textContent=msg; }
}

// Colapsables
function setupCollapsibles(){
  document.querySelectorAll('.collapse-toggle').forEach(btn0=>{ const id0=btn0.getAttribute('data-target'); const panel0=document.getElementById(id0); if(panel0 && panel0.classList.contains('collapsed')){ btn0.textContent=btn0.textContent.replace('▾','▸'); } });
  document.querySelectorAll('.collapse-toggle').forEach(btn=>{ const id=btn.getAttribute('data-target'); const panel=document.getElementById(id); btn.addEventListener('click', ()=>{ panel.classList.toggle('collapsed'); btn.textContent = btn.textContent.includes('▾') ? btn.textContent.replace('▾','▸') : btn.textContent.replace('▸','▾'); }); });
}
// --- COPIA Y PEGA ESTO AL FINAL DE TU ARCHIVO SCRIPT.JS ---

function setupCollapsibles() {
  document.querySelectorAll('.collapse-toggle').forEach(btn => {
    const id = btn.getAttribute('data-target');
    const panel = document.getElementById(id);

    if (!panel) return;

    // 1. Configuración inicial: poner la flecha correcta según si arranca cerrado o abierto
    if (panel.classList.contains('collapsed')) {
      btn.textContent = btn.textContent.replace('▾', '▸');
    } else {
      btn.textContent = btn.textContent.replace('▸', '▾');
    }

    // 2. Evento Click: abrir/cerrar y cambiar la flecha
    btn.onclick = () => {
      panel.classList.toggle('collapsed');
      
      if (panel.classList.contains('collapsed')) {
        btn.textContent = btn.textContent.replace('▾', '▸');
      } else {
        btn.textContent = btn.textContent.replace('▸', '▾');
      }
    };
  });
}

// NOTA: Tu código original llamaba a 'renderMatriz()' en init(), 
// pero esa función parece faltar en el archivo cortado. 
// Agrega este bloque para evitar que la página se rompa si la función no existe:
if (typeof renderMatriz === 'undefined') {
  window.renderMatriz = function() {
    const m = document.getElementById('matriz');
    if(m) m.innerHTML = '<p style="padding:10px; color:#666">La visualización de matriz no está disponible en este script.</p>';
  };
}
