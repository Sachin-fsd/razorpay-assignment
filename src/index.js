const express = require('express');
const pool = require('./db');

require('dotenv').config();

const app = express();
const port = Number(process.env.PORT) || 7002;

app.use(express.json());

app.get('/health', async (_req, res, next) => {
  try {
    await pool.query('SELECT 1');
    res.json({ status: 'ok' });
  } catch (error) {
    next(error);
  }
});

app.use((error, _req, res, _next) => {
  console.error(error);
  res.status(500).json({ error: 'Internal server error' });
});

app.listen(port, () => {
  console.log(`Reimbursements backend listening on port ${port}`);
});
