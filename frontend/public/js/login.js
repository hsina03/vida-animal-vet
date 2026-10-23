// UC-01 Inicio de sesión (RF-01).
import { $, api, paintLogos } from './common.js';

paintLogos();

// Si ya hay sesión, ir directo al panel
api('/auth/me').then(() => { location.replace('/admin'); }).catch(() => {});

const form = $('#login-form');
const err = $('#login-err');
const btn = $('#lg-btn');

function showError(text) {
  $('span', err).textContent = text;
  err.classList.add('on');
}

form.addEventListener('submit', async (e) => {
  e.preventDefault();
  const usuario = $('#lg-user').value.trim();
  const password = $('#lg-pass').value;
  if (!usuario || !password) { showError('Escribe tu usuario y tu contraseña para continuar.'); return; }
  btn.disabled = true;
  btn.textContent = 'Entrando…';
  try {
    await api('/auth/login', { method: 'POST', body: { usuario, password } });
    location.replace('/admin');
  } catch (ex) {
    showError(ex.message);
    $('#lg-pass').value = '';
    $('#lg-pass').focus();
  } finally {
    btn.disabled = false;
    btn.textContent = 'Entrar al panel';
  }
});
