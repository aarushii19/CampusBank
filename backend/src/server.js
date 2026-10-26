require('dotenv').config();
const { createPool } = require('./db');
const { createApp } = require('./app');

const pool = createPool();
const app = createApp(pool);
const port = Number(process.env.PORT || 3001);

const server = app.listen(port, () => console.log(`Bank Management API listening on port ${port}`));

async function shutdown(signal) {
  console.log(`${signal} received; closing API`);
  server.close(async () => {
    await pool.end();
    process.exit(0);
  });
}

process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));
