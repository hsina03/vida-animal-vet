const config = require('./config');
const { createApp } = require('./app');
const db = require('./db');

const app = createApp();
const server = app.listen(config.port, () => {
  console.log(`Vida Animal II escuchando en http://localhost:${config.port}`);
  console.log(`Panel administrativo: http://localhost:${config.port}/admin`);
});

function shutdown() {
  server.close(() => db.close().finally(() => process.exit(0)));
}
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
