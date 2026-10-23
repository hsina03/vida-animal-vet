/** UC-05 Consulta y actualización de propietarios y mascotas (RF-16 a RF-18). */
const express = require('express');
const owners = require('../services/owners');
const requests = require('../services/requests');
const { wrap, HttpError } = require('../utils');

const router = express.Router();
const id = (v) => {
  const n = Number(v);
  if (!Number.isInteger(n) || n <= 0) throw new HttpError(400, 'Identificador inválido.');
  return n;
};

router.get('/propietarios', wrap(async (req, res) => res.json(await owners.search(req.query.q))));
router.post('/propietarios', wrap(async (req, res) => {
  const newId = await owners.create(req.body || {});
  res.status(201).json(await owners.getById(newId));
}));
router.get('/propietarios/:id', wrap(async (req, res) => res.json(await owners.getById(id(req.params.id)))));
router.put('/propietarios/:id', wrap(async (req, res) => {
  await owners.update(id(req.params.id), req.body || {});
  res.json(await owners.getById(id(req.params.id)));
}));
router.post('/propietarios/:id/mascotas', wrap(async (req, res) => {
  await owners.addPet(id(req.params.id), req.body || {});
  res.status(201).json(await owners.getById(id(req.params.id)));
}));
router.put('/mascotas/:id', wrap(async (req, res) => {
  await owners.updatePet(id(req.params.id), req.body || {});
  res.json({ ok: true });
}));

// Solicitudes del asistente (RF-09, RF-10)
router.get('/solicitudes', wrap(async (req, res) => res.json(await requests.list({ abiertas: req.query.abiertas === '1' }))));
router.get('/solicitudes/:id', wrap(async (req, res) => res.json(await requests.getById(id(req.params.id)))));
router.post('/solicitudes/:id/resolver', wrap(async (req, res) => res.json(await requests.resolve(id(req.params.id)))));

module.exports = router;
