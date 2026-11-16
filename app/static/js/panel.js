/* Panel administrativo: ventanas (modales), selector de horarios y avisos. */
(function () {
  'use strict';
  const $ = (s, el = document) => el.querySelector(s);
  const $$ = (s, el = document) => [...el.querySelectorAll(s)];
  const scrim = $('#scrim'), modal = $('#modal');

  /* ---------------- avisos ---------------- */
  function toast(texto) {
    const el = $('#toast');
    if (!el) return;
    $('span', el).textContent = texto;
    el.classList.add('on');
    clearTimeout(el._t);
    el._t = setTimeout(() => el.classList.remove('on'), 3200);
  }
  $$('.flash-ok').forEach(f => toast(f.dataset.texto));

  /* ---------------- confirmaciones y envíos automáticos ---------------- */
  document.addEventListener('submit', e => {
    const f = e.target;
    if (f.dataset.confirmar && !window.confirm(f.dataset.confirmar)) e.preventDefault();
  });
  $$('[data-autoenviar]').forEach(el => el.addEventListener('change', () => {
    if (el.dataset.confirmar && !window.confirm(el.dataset.confirmar)) { el.checked = !el.checked; return; }
    el.form.submit();
  }));

  /* ---------------- horarios por día ---------------- */
  $$('[data-alternar-dia]').forEach(sw => sw.addEventListener('change', () => {
    sw.closest('[data-dia]').classList.toggle('cerrado', !sw.checked);
  }));

  /* ---------------- búsqueda de propietarios ---------------- */
  const busqueda = $('[data-busqueda] input');
  if (busqueda) {
    let espera;
    busqueda.addEventListener('input', () => {
      clearTimeout(espera);
      espera = setTimeout(() => busqueda.form.submit(), 450);
    });
    if (document.activeElement === busqueda) {
      const n = busqueda.value.length; busqueda.setSelectionRange(n, n);
    }
  }

  /* ---------------- ventanas ---------------- */
  function abrirModal(boton) {
    const plantilla = document.getElementById(boton.dataset.modal);
    if (!plantilla) return;
    modal.innerHTML = '';
    const cabeza = document.createElement('div'); cabeza.className = 'modal-h';
    const titulo = document.createElement('h2'); titulo.id = 'm-title';
    titulo.textContent = boton.dataset.titulo || plantilla.dataset.titulo || '';
    const cerrar = document.createElement('button');
    cerrar.type = 'button'; cerrar.className = 'btn-icon'; cerrar.dataset.close = '';
    cerrar.setAttribute('aria-label', 'Cerrar');
    cerrar.innerHTML = '<svg class="ic" aria-hidden="true"><use href="#i-x"/></svg>';
    cabeza.append(titulo, cerrar);
    modal.append(cabeza, plantilla.content.cloneNode(true));

    const form = $('form', modal);
    if (form && boton.dataset.accion && boton.dataset.accion.startsWith('/panel/')) form.action = boton.dataset.accion;
    let valores = {};
    try { valores = JSON.parse(boton.dataset.valores || '{}'); } catch (e) { valores = {}; }
    Object.entries(valores).forEach(([clave, valor]) => {
      $$(`[name="${clave}"]`, modal).forEach(campo => {
        if (campo.type === 'checkbox') campo.checked = Boolean(valor);
        else campo.value = valor;
      });
      $$(`[data-fill="${clave}"]`, modal).forEach(el => { el.textContent = valor; });
      $$(`[data-href="${clave}"]`, modal).forEach(el => {
        if (/^https:\/\/wa\.me\//.test(valor)) el.href = valor; else el.remove();
      });
    });
    $$('[data-href]', modal).forEach(el => { if (!el.href) el.remove(); });

    // Foto de la mascota: el botón "Quitar foto" solo aparece si ya tiene foto
    const quitar = $('[data-quitar-foto]', modal);
    if (quitar) {
      if (typeof valores.quitar === 'string' && valores.quitar.startsWith('/panel/')) quitar.formAction = valores.quitar;
      else quitar.remove();
    }
    const foto = $('[data-foto]', modal);
    if (foto) prepararFoto(foto);
    // Producto: la existencia inicial solo se captura al darlo de alta
    const edicion = $('[name=edicion]', modal);
    if (edicion && edicion.value === '1') $$('[data-solo-alta]', modal).forEach(el => { el.hidden = true; });
    // Día especial: muestra las horas solo si abre con otro horario
    const especial = $('[data-horario-especial]', modal);
    if (especial) {
      const actualizar = () => { especial.hidden = ($('[name=tipo]:checked', modal) || {}).value !== 'horario'; };
      $$('[name=tipo]', modal).forEach(r => r.addEventListener('change', actualizar));
      actualizar();
    }

    scrim.classList.add('on');
    if (form && form.hasAttribute('data-con-horario')) prepararHorario(form);
    if ($('[data-mascotas]', modal)) prepararMascotas($('[data-mascotas]', modal));
    setTimeout(() => {
      const primero = $('input:not([type=hidden]), select, textarea', modal);
      (primero || cerrar).focus();
    }, 30);
  }
  function cerrarModal() { scrim.classList.remove('on'); modal.innerHTML = ''; }

  document.addEventListener('click', e => {
    const boton = e.target.closest('[data-modal]');
    if (boton) { e.preventDefault(); abrirModal(boton); return; }
    if (e.target === scrim || e.target.closest('[data-close]')) cerrarModal();
  });
  document.addEventListener('keydown', e => { if (e.key === 'Escape' && scrim.classList.contains('on')) cerrarModal(); });

  /* ---------------- foto: vista previa y reducción antes de subir ---------------- */
  function prepararFoto(input) {
    const prev = $('[data-foto-prev]', modal);
    input.addEventListener('change', () => {
      const archivo = input.files && input.files[0];
      if (!archivo || !/^image\//.test(archivo.type)) return;
      const lector = new FileReader();
      lector.onload = () => {
        const img = new Image();
        img.onload = () => {
          const max = 1024, escala = Math.min(1, max / Math.max(img.width, img.height));
          const lienzo = document.createElement('canvas');
          lienzo.width = Math.round(img.width * escala); lienzo.height = Math.round(img.height * escala);
          lienzo.getContext('2d').drawImage(img, 0, 0, lienzo.width, lienzo.height);
          const datos = lienzo.toDataURL('image/jpeg', 0.85);
          if (prev) { $('img', prev).src = datos; prev.hidden = false; }
          lienzo.toBlob(blob => {
            if (!blob || !window.DataTransfer) return;
            const dt = new DataTransfer();
            dt.items.add(new File([blob], 'foto.jpg', { type: 'image/jpeg' }));
            input.files = dt.files;
          }, 'image/jpeg', 0.85);
        };
        img.src = lector.result;
      };
      lector.readAsDataURL(archivo);
    });
  }

  /* ---------------- imprimir y filtros que se envían solos ---------------- */
  document.addEventListener('click', e => {
    if (e.target.closest('[data-imprimir]')) window.print();
  });
  $$('[data-autoenviar-select]').forEach(el => el.addEventListener('change', () => el.form.submit()));

  /* ---------------- mascotas del propietario (nueva cita) ---------------- */
  function prepararMascotas(selectProp) {
    const selectMascota = $(selectProp.dataset.mascotas, modal);
    async function cargar() {
      selectMascota.innerHTML = '';
      try {
        const r = await fetch(`/panel/api/propietarios/${encodeURIComponent(selectProp.value)}/mascotas`);
        const datos = await r.json();
        datos.mascotas.forEach(m => {
          const o = document.createElement('option');
          o.value = m.id; o.textContent = `${m.nombre} (${m.especie})`;
          selectMascota.append(o);
        });
      } catch (e) { /* el servidor valida al registrar */ }
    }
    selectProp.addEventListener('change', cargar);
    cargar();
  }

  /* ---------------- selector de horarios ---------------- */
  function prepararHorario(form) {
    const contenedor = $('[data-slots]', form), error = $('[data-error-horario]', form);
    const hora = $('[name=hora]', form), fecha = $('[name=fecha]', form);
    const servicio = $('[name=servicio_id]', form), excluir = $('[name=excluir]', form);
    if (!fecha.value) {
      const d = new Date();
      fecha.value = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    }
    const mostrarError = texto => { $('span', error).textContent = texto; error.classList.toggle('on', Boolean(texto)); };

    async function cargar() {
      hora.value = '';
      mostrarError('');
      contenedor.innerHTML = '<span class="vacio">Buscando horarios…</span>';
      const params = new URLSearchParams({ fecha: fecha.value, servicio_id: servicio.value });
      if (excluir && excluir.value) params.set('excluir', excluir.value);
      try {
        const r = await fetch('/panel/api/disponibilidad?' + params);
        const datos = await r.json();
        contenedor.innerHTML = '';
        if (!r.ok) { mostrarError(datos.error || 'No se pudieron cargar los horarios.'); return; }
        if (datos.cerrado || !datos.horarios.length) {
          const s = document.createElement('span'); s.className = 'vacio';
          s.textContent = datos.cerrado ? `${datos.cerrado}. Elige otro día.` : 'No hay horarios este día.';
          contenedor.append(s); return;
        }
        datos.horarios.forEach(h => {
          const b = document.createElement('button');
          b.type = 'button'; b.className = 'slot' + (h.libre ? '' : ' busy'); b.textContent = h.hora;
          if (!h.libre) { b.setAttribute('aria-disabled', 'true'); b.title = h.motivo; }
          b.addEventListener('click', () => {
            if (!h.libre) { mostrarError(`Las ${h.hora}: ${h.motivo.toLowerCase()}. Elige un horario libre.`); return; }
            mostrarError('');
            $$('.slot', contenedor).forEach(x => x.classList.remove('on'));
            b.classList.add('on'); hora.value = h.hora;
          });
          contenedor.append(b);
        });
      } catch (e) { contenedor.innerHTML = ''; mostrarError('No se pudieron cargar los horarios. Revisa tu conexión.'); }
    }
    $$('[data-horario]', form).forEach(el => el.addEventListener('change', cargar));
    form.addEventListener('submit', e => {
      if (!hora.value) { e.preventDefault(); mostrarError('Elige un horario libre para la cita.'); }
    });
    cargar();
  }
})();
