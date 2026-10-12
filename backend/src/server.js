const { createApp } = require('./app');
const { createPool, applySchema } = require('./db');

const PORT = Number(process.env.PORT) || 4000;

async function main() {
  const pool = createPool();
  await applySchema(pool);
  const server = createApp(pool).listen(PORT, () => {
    console.log(`API listening on http://localhost:${PORT}`);
  });

  const shutdown = () => server.close(() => pool.end().then(() => process.exit(0)));
  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
}

main().catch((err) => {
  console.error('Failed to start:', err.message);
  process.exit(1);
});
