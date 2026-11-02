/* Sitio público: desplazamiento suave y asistente de citas (chat). */
(function () {
  'use strict';
  const $ = (s, el = document) => el.querySelector(s);
  const $$ = (s, el = document) => [...el.querySelectorAll(s)];

  $$('[data-scroll]').forEach(a => a.addEventListener('click', e => {
    const destino = $(a.getAttribute('href'));
    if (!destino) return;
    e.preventDefault();
    window.scrollTo({ top: destino.offsetTop - 76, behavior: 'smooth' });
  }));

  /* ---------------- asistente ---------------- */
  const chat = $('#chat'), fab = $('#chat-fab'), cuerpo = $('#chat-body');
  const form = $('#chat-form'), entrada = $('#chat-in');
  let token = null, ocupado = false;
  const espera = ms => new Promise(r => setTimeout(r, ms));
  const bajar = () => { cuerpo.scrollTop = cuerpo.scrollHeight; };

  function icono(id) {
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('class', 'ic');
    const use = document.createElementNS('http://www.w3.org/2000/svg', 'use');
    use.setAttribute('href', '#' + id);
    svg.append(use);
    return svg;
  }

  function burbuja(clase, texto) {
    const m = document.createElement('div');
    m.className = 'msg ' + clase;
    m.textContent = texto;
    cuerpo.append(m);
    bajar();
    return m;
  }

  function quitarOpciones() { $$('.chips, .sum .row', cuerpo).forEach(c => c.remove()); }

  async function mostrar(respuesta) {
    for (const m of respuesta.mensajes) {
      const escribiendo = document.createElement('div');
      escribiendo.className = 'msg bot typing';
      escribiendo.innerHTML = '<i></i><i></i><i></i>';
      cuerpo.append(escribiendo); bajar();
      await espera(m.tipo === 'texto' ? 380 : 200);
      escribiendo.remove();
      if (m.tipo === 'texto') burbuja('bot', m.texto);
      else if (m.tipo === 'aviso') burbuja('note', m.texto);
      else if (m.tipo === 'resumen') {
        const caja = document.createElement('div'); caja.className = 'sum';
        const dl = document.createElement('dl');
        m.datos.forEach(([etiqueta, valor]) => {
          const dt = document.createElement('dt'); dt.textContent = etiqueta;
          const dd = document.createElement('dd'); dd.textContent = valor;
          dl.append(dt, dd);
        });
        caja.append(dl); cuerpo.append(caja); bajar();
      } else if (m.tipo === 'whatsapp' && /^https:\/\/wa\.me\//.test(m.url)) {
        const fila = document.createElement('div'); fila.className = 'chips wa';
        const a = document.createElement('a');
        a.className = 'btn btn-wa btn-sm'; a.href = m.url; a.target = '_blank'; a.rel = 'noopener';
        a.append(icono('i-wa'), document.createTextNode(m.texto));
        fila.append(a); cuerpo.append(fila); bajar();
      }
    }
    if (respuesta.opciones.length) {
      const fila = document.createElement('div'); fila.className = 'chips';
      respuesta.opciones.forEach(o => {
        const b = document.createElement('button');
        b.type = 'button'; b.className = 'chip'; b.textContent = o.etiqueta;
        if (o.deshabilitada) { b.disabled = true; b.title = 'Ocupado'; }
        b.addEventListener('click', () => {
          if (ocupado) return;
          $$('.chips:not(.wa)', cuerpo).forEach(c => c.remove());
          burbuja('me', o.etiqueta);
          enviar({ opcion: o.valor });
        });
        fila.append(b);
      });
      cuerpo.append(fila); bajar();
    }
    entrada.placeholder = (respuesta.entrada && respuesta.entrada.placeholder) || 'Escribe tu mensaje…';
  }

  async function llamar(url, datos) {
    const r = await fetch(url, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(datos),
    });
    if (r.status === 404 && url.endsWith('/mensaje')) return null;
    if (!r.ok) throw new Error('HTTP ' + r.status);
    return r.json();
  }

  async function iniciar(modo) {
    cuerpo.innerHTML = '';
    ocupado = true;
    try {
      const r = await llamar('/api/chat/iniciar', { modo });
      token = r.token;
      await mostrar(r);
    } catch (e) {
      burbuja('bot', 'No pude conectarme. Revisa tu conexión e inténtalo de nuevo en un momento.');
    } finally { ocupado = false; }
  }

  async function enviar(datos) {
    ocupado = true;
    try {
      const r = await llamar('/api/chat/mensaje', { token, ...datos });
      if (r === null) {   // la conversación ya no existe: empezar otra
        ocupado = false;
        return iniciar('hola');
      }
      await mostrar(r);
    } catch (e) {
      burbuja('note', 'No pude enviar tu mensaje. Inténtalo de nuevo.');
    } finally { ocupado = false; entrada.focus(); }
  }

  function abrir(modo) {
    chat.classList.add('open');
    fab.style.display = 'none';
    if (!token || modo === 'cita' || modo === 'faq') iniciar(modo);
    setTimeout(() => entrada.focus(), 50);
  }

  $$('[data-open-chat]').forEach(b => b.addEventListener('click', () => abrir(b.dataset.openChat)));
  $('#chat-x').addEventListener('click', () => { chat.classList.remove('open'); fab.style.display = ''; });
  document.addEventListener('keydown', e => {
    if (e.key === 'Escape' && chat.classList.contains('open')) $('#chat-x').click();
  });

  form.addEventListener('submit', e => {
    e.preventDefault();
    const texto = entrada.value.trim();
    if (!texto || ocupado || !token) return;
    entrada.value = '';
    $$('.chips:not(.wa)', cuerpo).forEach(c => c.remove());
    burbuja('me', texto);
    enviar({ texto });
  });
})();
