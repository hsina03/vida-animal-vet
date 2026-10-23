/** UC-04 Gestión integral y registro de citas (RF-11 a RF-15, RNF-05). */
const express = require('express');
const appointments = require('../services/appointments');
const { getDaySlots } = require('../services/availability');
const { wrap, HttpError, parseYmd } = require('../utils');

const router = express.Router();
const id = (req) => {
  const n = Number(req.params.id);
  if (!Number.isInteger(n) || n <= 0) throw new HttpError(400, 'Identificador inválido.');
  return n;
};

router.get('/disponibilidad', wrap(async (req, res) => {
  const { fecha, servicio_id: servicioId, ignorar } = req.query;
  if (!parseYmd(fecha)) throw new HttpError(400, 'Indica una fecha válida (AAAA-MM-DD).');
  res.json(await getDaySlots(fecha, { servicioId: servicioId ? Number(servicioId) : undefined, ignoreCitaId: ignorar ? Number(ignorar) : undefined }));
}));

router.get('/citas', wrap(async (req, res) => {
  const { desde, hasta, estado } = req.query;
  if (desde && !parseYmd(desde)) throw new HttpError(400, 'La fecha «desde» no es válida.');
  if (hasta && !parseYmd(hasta)) throw new HttpError(400, 'La fecha «hasta» no es válida.');
  res.json(await appointments.list({ desde, hasta, estado }));
}));

router.post('/citas', wrap(async (req, res) => {
  res.status(201).json(await appointments.create(req.body || {}, req.user.id));
}));

router.get('/citas/:id', wrap(async (req, res) => res.json(await appointments.getById(id(req)))));

router.post('/citas/:id/reprogramar', wrap(async (req, res) => {
  res.json(await appointments.reschedule(id(req), req.body || {}));
}));

router.post('/citas/:id/cancelar', wrap(async (req, res) => {
  res.json(await appointments.cancel(id(req), (req.body || {}).motivo));
}));

router.patch('/citas/:id/estado', wrap(async (req, res) => {
  res.json(await appointments.setStatus(id(req), (req.body || {}).estado));
}));

module.exports = router;
