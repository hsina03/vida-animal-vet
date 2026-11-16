/* Caja: arma la venta en el navegador. Los precios se vuelven a tomar de la base al cobrar. */
(function () {
  'use strict';
  const $ = (s, el = document) => el.querySelector(s);
  const form = $('[data-caja]');
  if (!form) return;

  const catalogo = JSON.parse($('#catalogo').textContent);
  const inicial = JSON.parse($('#caja-inicial').textContent);
  const items = [
    ...catalogo.servicios.map(s => ({ ...s, tipo: 'servicio' })),
    ...catalogo.productos.map(p => ({ ...p, tipo: 'producto' })),
  ];
  const carrito = []; // {tipo, id, nombre, precio (centavos), cantidad, existencia}

  const centavos = texto => {
    const n = Number(String(texto || '').replace(/[$,\s]/g, ''));
    return Number.isFinite(n) ? Math.round(n * 100) : NaN;
  };
  const pesos = c => (c < 0 ? '-' : '') + '$' + (Math.abs(c) / 100).toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const normal = t => t.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

  const buscar = $('[data-buscar-concepto]'), resultados = $('[data-resultados]');
  const tbody = $('[data-carrito]'), vacio = $('[data-vacio]');
  const error = $('[data-error-caja]');
  const mostrarError = texto => { $('span', error).textContent = texto || ''; error.classList.toggle('on', Boolean(texto)); };

  /* ---------- búsqueda de servicios y productos ---------- */
  function pintarResultados() {
    const q = normal(buscar.value.trim());
    resultados.innerHTML = '';
    if (!q) return;
    const encontrados = items.filter(i => normal(i.nombre).includes(q) || (i.codigo && normal(i.codigo).includes(q))).slice(0, 8);
    if (!encontrados.length) {
      const s = document.createElement('span'); s.className = 'vacio'; s.textContent = 'Sin resultados.';
      resultados.append(s); return;
    }
    encontrados.forEach(i => {
      const b = document.createElement('button');
      b.type = 'button'; b.className = 'pos-item';
      const nombre = document.createElement('b'); nombre.textContent = i.nombre;
      const detalle = document.createElement('small');
      detalle.textContent = i.tipo === 'servicio' ? 'Servicio' : `Producto · quedan ${Number(i.existencia)} ${i.unidad}`;
      const precio = document.createElement('span'); precio.textContent = pesos(centavos(i.precio));
      b.append(nombre, detalle, precio);
      b.addEventListener('click', () => { agregar(i, 1); buscar.value = ''; resultados.innerHTML = ''; buscar.focus(); });
      resultados.append(b);
    });
  }
  buscar.addEventListener('input', pintarResultados);
  buscar.addEventListener('keydown', e => {
    if (e.key === 'Enter') { e.preventDefault(); const primero = $('.pos-item', resultados); if (primero) primero.click(); }
  });

  /* ---------- carrito ---------- */
  function agregar(item, cantidad) {
    const existente = carrito.find(c => c.tipo === item.tipo && c.id === item.id);
    if (existente) existente.cantidad += cantidad;
    else carrito.push({ tipo: item.tipo, id: item.id, nombre: item.nombre, precio: centavos(item.precio),
                        cantidad, existencia: item.tipo === 'producto' ? Number(item.existencia) : null });
    pintarCarrito();
  }

  function pintarCarrito() {
    [...tbody.querySelectorAll('tr:not([data-vacio])')].forEach(tr => tr.remove());
    vacio.hidden = carrito.length > 0;
    carrito.forEach((c, i) => {
      const tr = document.createElement('tr');
      const td = () => document.createElement('td');
      const nombre = td(); nombre.textContent = c.nombre;
      if (c.existencia !== null && c.cantidad > c.existencia) {
        const aviso = document.createElement('small'); aviso.className = 'pos-aviso';
        aviso.textContent = `Solo quedan ${c.existencia}`; nombre.append(document.createElement('br'), aviso);
      }
      const cant = td(); const input = document.createElement('input');
      input.type = 'number'; input.min = '1'; input.step = '1'; input.value = c.cantidad; input.className = 'pos-cant';
      input.setAttribute('aria-label', `Cantidad de ${c.nombre}`);
      input.addEventListener('change', () => { const n = Number(input.value); c.cantidad = n > 0 ? n : 1; pintarCarrito(); });
      cant.append(input);
      const precio = td(); precio.textContent = pesos(c.precio); precio.className = 'num';
      const importe = td(); importe.textContent = pesos(Math.round(c.precio * c.cantidad)); importe.className = 'num';
      const quitar = td(); const b = document.createElement('button');
      b.type = 'button'; b.className = 'btn-icon'; b.setAttribute('aria-label', `Quitar ${c.nombre}`);
      b.innerHTML = '<svg class="ic" aria-hidden="true"><use href="#i-x"/></svg>';
      b.addEventListener('click', () => { carrito.splice(i, 1); pintarCarrito(); });
      quitar.append(b);
      tr.append(nombre, cant, precio, importe, quitar);
      tbody.append(tr);
    });
    calcular();
  }

  /* ---------- totales, pago y cambio ---------- */
  const descuento = $('[data-descuento]'), recibido = $('[data-recibido]');
  function metodo() { return (form.querySelector('[name=metodo]:checked') || {}).value; }
  function calcular() {
    const subtotal = carrito.reduce((s, c) => s + Math.round(c.precio * c.cantidad), 0);
    const desc = Math.max(0, centavos(descuento.value) || 0);
    const total = Math.max(0, subtotal - desc);
    $('[data-subtotal]').textContent = pesos(subtotal);
    $('[data-total]').textContent = pesos(total);
    $('[data-total-boton]').textContent = pesos(total);
    const rec = centavos(recibido.value);
    $('[data-cambio]').textContent = recibido.value && rec >= total ? pesos(rec - total) : '$0.00';
    form.elements.conceptos.value = JSON.stringify(carrito.map(c => ({ tipo: c.tipo, id: c.id, cantidad: String(c.cantidad) })));
    return { subtotal, desc, total, rec };
  }
  descuento.addEventListener('input', calcular);
  recibido.addEventListener('input', calcular);

  form.querySelectorAll('[name=metodo]').forEach(r => r.addEventListener('change', () => {
    form.querySelectorAll('.pos-metodo label').forEach(l => l.classList.toggle('on', l.contains(form.querySelector('[name=metodo]:checked'))));
    const efectivo = metodo() === 'efectivo';
    $('[data-efectivo]').hidden = !efectivo;
    $('[data-referencia]').hidden = efectivo;
  }));

  form.addEventListener('submit', e => {
    const { subtotal, desc, total, rec } = calcular();
    let problema = '';
    if (!carrito.length) problema = 'Agrega al menos un servicio o producto a la venta.';
    else if (desc > subtotal) problema = 'El descuento no puede ser mayor que el total.';
    else if (metodo() === 'efectivo' && recibido.value && rec < total) problema = 'El efectivo recibido no alcanza para el total.';
    if (problema) { e.preventDefault(); mostrarError(problema); return; }
    mostrarError('');
    const boton = $('[data-cobrar]'); boton.disabled = true; // evita cobrar dos veces
  });

  /* ---------- cliente y mascota ---------- */
  const cliente = $('[data-cliente]'), mascota = $('[data-mascota]');
  async function cargarMascotas(seleccionar) {
    mascota.innerHTML = '<option value="">Sin mascota</option>';
    if (!cliente.value) return;
    try {
      const r = await fetch(`/panel/api/propietarios/${encodeURIComponent(cliente.value)}/mascotas`);
      const datos = await r.json();
      (datos.mascotas || []).forEach(m => {
        const o = document.createElement('option'); o.value = m.id; o.textContent = `${m.nombre} (${m.especie})`;
        if (String(m.id) === String(seleccionar)) o.selected = true;
        mascota.append(o);
      });
    } catch (err) { /* la venta se puede registrar sin mascota */ }
  }
  cliente.addEventListener('change', () => cargarMascotas(''));

  /* ---------- venta precargada (desde una cita o un cliente) ---------- */
  if (inicial.propietario_id) cargarMascotas(inicial.mascota_id);
  (inicial.conceptos || []).forEach(c => {
    const item = items.find(i => i.tipo === c.tipo && i.id === c.id);
    if (item) agregar(item, Number(c.cantidad) || 1);
  });
  pintarCarrito();
})();
