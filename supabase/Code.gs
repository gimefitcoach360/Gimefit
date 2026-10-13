/**
 * GIMEFIT · Resumen diario a Gime
 * Supabase avisa cada acción de una alumna; este script la guarda en la hoja
 * "Pendientes" y todos los días a las 21 h te manda UN mail por alumna con
 * todo lo que hizo en el día. Además anota cada registro en la hoja "Registros".
 *
 * Instalación (una sola vez):
 *  1. Pegar este código, cambiar SECRETO por tu clave y guardar.
 *  2. Elegir la función instalarResumen y tocar Ejecutar (crea el envío de las 21 h).
 *  3. Implementar → Gestionar implementaciones → editar (lápiz) → Versión: Nueva versión → Implementar.
 *     La URL /exec queda igual, así que en Supabase no hay que cambiar nada.
 */

const MAIL_GIME   = 'gime.nataliaa@gmail.com';
const SECRETO     = 'CAMBIAR-POR-UNA-CLAVE-LARGA';
const HORA_ENVIO  = 21;
const ZONA        = 'America/Argentina/Buenos_Aires';
const FASES       = { 1: 'Activación', 2: 'Progresión', 3: 'Consolidación' };
const HAMBRE      = { fisica: 'Física', emocional: 'Emocional', no_se: 'No sé' };
const COMIDAS     = ['desayuno', 'almuerzo', 'merienda', 'cena'];

// ---------- 1. Recibir avisos de Supabase (no manda mail, solo guarda) ----------
function doPost(e) {
  try {
    const body = JSON.parse(e.postData.contents);
    if (body.secreto !== SECRETO) return respuesta_('no autorizado');
    const tipo = body.tipo, d = body.datos || {};
    if (!RESUMIR_[tipo]) return respuesta_('tipo desconocido');

    hoja_('Pendientes', ['Recibido', 'Alumna', 'Tipo', 'Clave', 'Datos', 'Enviado'])
      .appendRow([new Date(), d.alumna || '', tipo, clave_(tipo, d), JSON.stringify(d), '']);
    hoja_('Registros', ['Fecha y hora', 'Tipo', 'Alumna', 'Detalle'])
      .appendRow([new Date(), tipo, d.alumna || '', RESUMIR_[tipo](d)]);
    return respuesta_('ok');
  } catch (err) {
    console.error(err);
    return respuesta_('error: ' + err);
  }
}

// ---------- 2. Resumen diario: un mail por alumna ----------
function enviarResumenDiario() {
  const hoja = hoja_('Pendientes', ['Recibido', 'Alumna', 'Tipo', 'Clave', 'Datos', 'Enviado']);
  const filas = hoja.getDataRange().getValues();
  const porAlumna = {};

  for (let i = 1; i < filas.length; i++) {
    const [recibido, alumna, tipo, clave, datos, enviado] = filas[i];
    if (enviado) continue;
    const nombre = alumna || 'Sin nombre';
    porAlumna[nombre] = porAlumna[nombre] || { filas: [], items: {} };
    porAlumna[nombre].filas.push(i + 1);
    // Si la alumna cambió algo (desmarcó y volvió a marcar, editó el check-in), queda lo último
    porAlumna[nombre].items[tipo + '|' + clave] = { tipo, d: JSON.parse(datos), recibido };
  }

  const hoy = Utilities.formatDate(new Date(), ZONA, "dd/MM/yyyy");
  Object.keys(porAlumna).forEach(nombre => {
    const g = porAlumna[nombre];
    const items = Object.keys(g.items).map(k => g.items[k]);
    MailApp.sendEmail({
      to: MAIL_GIME,
      subject: `${alerta_(items) ? '⚠️ ' : ''}Resumen de ${nombre} · ${hoy}`,
      htmlBody: plantilla_(`Resumen de ${nombre}`, hoy, armarCuerpo_(items)),
      name: 'Gimefit'
    });
    g.filas.forEach(f => hoja.getRange(f, 6).setValue(new Date()));
  });
}

function armarCuerpo_(items) {
  const de = t => items.filter(x => x.tipo === t).map(x => x.d);
  let html = '';

  de('entreno').forEach(d => {
    const filas = (d.ejercicios || []).map(ex => {
      const series = (ex.series || [])
        .map(s => `S${s.serie}: ${s.kg ?? '–'} kg × ${s.reps ?? '–'}${s.hecho ? ' ✓' : ''}`).join('<br>');
      return `<tr><td style="padding:6px 8px;border-bottom:1px solid #eee;vertical-align:top"><b>${esc_(ex.nombre)}</b><br>
              <span style="color:#777">Objetivo ${esc_(ex.objetivo)}</span></td>
              <td style="padding:6px 8px;border-bottom:1px solid #eee">${series || '–'}</td></tr>`;
    }).join('');
    html += seccion_('💪 Entrenamiento', `
      <p style="margin:0 0 8px"><b>Día ${d.dia} · ${esc_(d.nombre_dia)}</b> — ${FASES[d.fase]}, semana ${d.semana}</p>
      ${d.sensacion ? `<p style="margin:0 0 8px">Cómo se sintió: <b>${esc_(d.sensacion)}</b></p>` : ''}
      <table style="width:100%;border-collapse:collapse;font-size:14px">${filas}</table>`);
  });

  const comidas = de('comida').sort((a, b) => COMIDAS.indexOf(a.comida) - COMIDAS.indexOf(b.comida));
  if (comidas.length) {
    html += seccion_(`🍽️ Comidas cumplidas (${comidas.length}/4)`, comidas.map(c =>
      `<p style="margin:0 0 6px"><b>${cap_(c.comida)}</b>${c.opcion ? ' — ' + esc_(c.opcion) : ''}<br>
       <span style="color:#555">Hambre: ${HAMBRE[c.hambre] || 'sin marcar'}</span></p>`).join(''));
  }

  de('checkin').forEach(c => {
    html += seccion_('📋 Check-in', `
      <p style="margin:0 0 6px">Energía: <b>${c.energia} / 5</b>${c.energia <= 2 ? ' ⚠️' : ''}</p>
      <p style="margin:0">Emociones: ${esc_((c.emociones || []).join(', ') || '–')}</p>`);
  });

  de('emocional').forEach(r => {
    html += seccion_('💜 Registro emocional', `
      <p style="margin:0 0 6px"><b>¿Qué pasó?</b><br>${esc_(r.que_paso)}</p>
      <p style="margin:0 0 6px"><b>¿Qué sintió?</b><br>${esc_(r.que_senti)}</p>
      <p style="margin:0"><b>¿Qué hizo con eso?</b><br>${esc_(r.que_hice || '–')}</p>`);
  });

  const acts = de('actividad');
  if (acts.length) {
    html += seccion_('✅ Actividades de coaching', acts.map(a =>
      `<p style="margin:0 0 6px">${esc_(a.titulo)} <span style="color:#777">(${FASES[a.fase]} · semana ${a.semana} · actividad ${a.numero})</span></p>`).join(''));
  }
  return html;
}

// Resumen corto para la hoja "Registros"
const RESUMIR_ = {
  entreno:   d => `Día ${d.dia} (${FASES[d.fase]} S${d.semana}) · ${d.sensacion || 'sin sensación'}`,
  comida:    d => `${cap_(d.comida)} · hambre ${HAMBRE[d.hambre] || 'sin marcar'}`,
  checkin:   d => `Energía ${d.energia}/5 · ${(d.emociones || []).join(', ') || '–'}`,
  emocional: d => `${d.que_paso} | ${d.que_senti} | ${d.que_hice || ''}`,
  actividad: d => `${FASES[d.fase]} S${d.semana} A${d.numero} · ${d.titulo}`
};

function clave_(tipo, d) {
  if (tipo === 'entreno')   return `${d.fase}-${d.semana}-${d.dia}`;
  if (tipo === 'comida')    return `${d.fecha}-${d.comida}`;
  if (tipo === 'checkin')   return `${d.fecha}`;
  if (tipo === 'actividad') return `${d.fase}-${d.semana}-${d.numero}`;
  return String(Date.now()) + Math.random();   // registros emocionales: todos
}

const alerta_ = items => items.some(x => x.tipo === 'emocional' || (x.tipo === 'checkin' && x.d.energia <= 2));

// ---------- 3. Instalar el envío diario (correr UNA vez) ----------
function instalarResumen() {
  ScriptApp.getProjectTriggers()
    .filter(t => t.getHandlerFunction() === 'enviarResumenDiario')
    .forEach(t => ScriptApp.deleteTrigger(t));
  ScriptApp.newTrigger('enviarResumenDiario')
    .timeBased().everyDays(1).atHour(HORA_ENVIO).inTimezone(ZONA).create();
  hoja_('Pendientes', ['Recibido', 'Alumna', 'Tipo', 'Clave', 'Datos', 'Enviado']);
}

// ---------- utilidades ----------
function seccion_(titulo, contenido) {
  return `<div style="margin:0 0 18px"><h3 style="margin:0 0 8px;font-size:16px;color:#6B21A8">${titulo}</h3>${contenido}</div>`;
}

function plantilla_(titulo, fecha, contenido) {
  return `<div style="font-family:Arial,sans-serif;max-width:560px;margin:auto;color:#111">
    <div style="background:#000;color:#fff;padding:16px 20px;border-radius:12px 12px 0 0">
      <span style="font-size:22px;font-weight:bold">GIME<span style="color:#A855F7">FIT</span></span>
    </div>
    <div style="border:1px solid #eee;border-top:none;padding:20px;border-radius:0 0 12px 12px">
      <h2 style="margin:0 0 2px;font-size:19px">${esc_(titulo)}</h2>
      <p style="margin:0 0 18px;color:#777">${fecha}</p>${contenido}
    </div></div>`;
}

function hoja_(nombre, encabezado) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const h = ss.getSheetByName(nombre) || ss.insertSheet(nombre);
  if (h.getLastRow() === 0) h.appendRow(encabezado);
  return h;
}

function esc_(t) {
  return String(t ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/\n/g, '<br>');
}
function cap_(t) { return t ? t.charAt(0).toUpperCase() + t.slice(1) : ''; }
function respuesta_(t) { return ContentService.createTextOutput(t); }

// Prueba: carga un día de ejemplo y manda el resumen ya mismo
function probarResumen() {
  const ej = [
    ['entreno', { alumna: 'Prueba', fase: 1, semana: 1, dia: 1, nombre_dia: 'Tren superior', sensacion: 'Orgullosa',
      ejercicios: [{ nombre: 'Remo con mancuerna', objetivo: '3 x 12', series: [{ serie: 1, kg: 8, reps: 12, hecho: true }, { serie: 2, kg: 8, reps: 12, hecho: true }] }] }],
    ['comida', { alumna: 'Prueba', fecha: 'hoy', comida: 'almuerzo', opcion: 'Pollo con verduras', hambre: 'fisica' }],
    ['comida', { alumna: 'Prueba', fecha: 'hoy', comida: 'desayuno', hambre: 'emocional' }],
    ['checkin', { alumna: 'Prueba', fecha: 'hoy', energia: 4, emociones: ['Calma', 'Motivación'] }],
    ['actividad', { alumna: 'Prueba', fase: 1, semana: 1, numero: 1, titulo: 'Mapa de mis emociones' }]
  ];
  ej.forEach(([tipo, datos]) => doPost({ postData: { contents: JSON.stringify({ secreto: SECRETO, tipo, datos }) } }));
  enviarResumenDiario();
}
