/**
 * GIMEFIT · Mails instantáneos a Gime
 * Recibe los avisos de Supabase, te manda un mail y anota cada registro
 * en la hoja "Registros" de esta planilla.
 *
 * Instalación: ver los pasos en el chat. Resumen:
 *  1. Planilla nueva → Extensiones → Apps Script → pegar este código.
 *  2. Cambiar SECRETO por una clave tuya (la misma que va en 03_notificaciones.sql).
 *  3. Implementar → Nueva implementación → Aplicación web →
 *     Ejecutar como: Yo · Acceso: Cualquier usuario → copiar la URL.
 */

const MAIL_GIME = 'gime.nataliaa@gmail.com';
const SECRETO   = 'CAMBIAR-POR-UNA-CLAVE-LARGA';
const FASES     = { 1: 'Activación', 2: 'Progresión', 3: 'Consolidación' };
const HAMBRE    = { fisica: 'Física', emocional: 'Emocional', no_se: 'No sé' };

function doPost(e) {
  try {
    const body = JSON.parse(e.postData.contents);
    if (body.secreto !== SECRETO) return respuesta_('no autorizado');

    const d = body.datos || {};
    const armado = ARMAR_[body.tipo];
    if (!armado) return respuesta_('tipo desconocido');

    const { asunto, html, resumen } = armado(d);
    MailApp.sendEmail({
      to: MAIL_GIME,
      subject: asunto,
      htmlBody: plantilla_(asunto, html),
      name: 'Gimefit'
    });
    anotar_(body.tipo, d.alumna, resumen);
    return respuesta_('ok');
  } catch (err) {
    console.error(err);
    return respuesta_('error: ' + err);
  }
}

const ARMAR_ = {
  entreno(d) {
    const filas = (d.ejercicios || []).map(ex => {
      const series = (ex.series || [])
        .map(s => `S${s.serie}: ${s.kg ?? '–'} kg × ${s.reps ?? '–'}${s.hecho ? ' ✓' : ''}`)
        .join('<br>');
      return `<tr><td style="padding:8px;border-bottom:1px solid #eee"><b>${esc_(ex.nombre)}</b><br>
              <span style="color:#777">Objetivo ${esc_(ex.objetivo)}</span></td>
              <td style="padding:8px;border-bottom:1px solid #eee">${series || '–'}</td></tr>`;
    }).join('');
    return {
      asunto: `💪 ${d.alumna} terminó el Día ${d.dia} · ${d.nombre_dia}`,
      html: `<p>${FASES[d.fase]} · Semana ${d.semana} · Día ${d.dia}</p>
             ${d.sensacion ? `<p><b>Cómo se sintió:</b> ${esc_(d.sensacion)}</p>` : ''}
             <table style="width:100%;border-collapse:collapse;font-size:14px">${filas}</table>`,
      resumen: `Día ${d.dia} (${FASES[d.fase]} S${d.semana}) · ${d.sensacion || 'sin sensación'}`
    };
  },
  comida(d) {
    return {
      asunto: `🍽️ ${d.alumna} cumplió ${cap_(d.comida)}`,
      html: `<p><b>Fecha:</b> ${d.fecha}</p>
             ${d.opcion ? `<p><b>Opción:</b> ${esc_(d.opcion)}</p>` : ''}
             <p><b>Hambre:</b> ${HAMBRE[d.hambre] || 'sin marcar'}</p>`,
      resumen: `${cap_(d.comida)} · hambre ${HAMBRE[d.hambre] || 'sin marcar'}`
    };
  },
  checkin(d) {
    const emos = (d.emociones || []).join(', ') || '–';
    return {
      asunto: `${d.energia <= 2 ? '⚠️' : '📋'} Check-in de ${d.alumna}: energía ${d.energia}/5${d.editado ? ' (editado)' : ''}`,
      html: `<p><b>Energía:</b> ${d.energia} / 5</p><p><b>Emociones:</b> ${esc_(emos)}</p>`,
      resumen: `Energía ${d.energia}/5 · ${emos}`
    };
  },
  emocional(d) {
    return {
      asunto: `💜 Registro emocional de ${d.alumna}`,
      html: `<p><b>¿Qué pasó?</b><br>${esc_(d.que_paso)}</p>
             <p><b>¿Qué sintió?</b><br>${esc_(d.que_senti)}</p>
             <p><b>¿Qué hizo con eso?</b><br>${esc_(d.que_hice || '–')}</p>`,
      resumen: `${d.que_paso} | ${d.que_senti} | ${d.que_hice || ''}`
    };
  },
  actividad(d) {
    return {
      asunto: `✅ ${d.alumna} hizo la actividad "${d.titulo}"`,
      html: `<p>${FASES[d.fase]} · Semana ${d.semana} · Actividad ${d.numero}</p>`,
      resumen: `${FASES[d.fase]} S${d.semana} A${d.numero} · ${d.titulo}`
    };
  }
};

// ---------- utilidades ----------
function plantilla_(titulo, contenido) {
  return `<div style="font-family:Arial,sans-serif;max-width:560px;margin:auto">
    <div style="background:#000;color:#fff;padding:16px 20px;border-radius:12px 12px 0 0">
      <span style="font-size:22px;font-weight:bold">GIME<span style="color:#A855F7">FIT</span></span>
    </div>
    <div style="border:1px solid #eee;border-top:none;padding:20px;border-radius:0 0 12px 12px">
      <h2 style="margin-top:0;font-size:18px">${esc_(titulo)}</h2>${contenido}
    </div></div>`;
}

function anotar_(tipo, alumna, resumen) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const hoja = ss.getSheetByName('Registros') || ss.insertSheet('Registros');
  if (hoja.getLastRow() === 0) hoja.appendRow(['Fecha y hora', 'Tipo', 'Alumna', 'Detalle']);
  hoja.appendRow([new Date(), tipo, alumna, resumen]);
}

function esc_(t) {
  return String(t ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/\n/g, '<br>');
}
function cap_(t) { return t ? t.charAt(0).toUpperCase() + t.slice(1) : ''; }
function respuesta_(t) { return ContentService.createTextOutput(t); }

// Probá el mail sin Supabase: elegí esta función y tocá "Ejecutar"
function probarMail() {
  doPost({ postData: { contents: JSON.stringify({
    secreto: SECRETO, tipo: 'checkin',
    datos: { alumna: 'Prueba', fecha: '2026-10-10', energia: 4, emociones: ['Calma', 'Motivación'] }
  }) } });
}
