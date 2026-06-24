const express = require('express');
const cookieParser = require('cookie-parser');
const pool = require('./db');
const onboardingsRouter = require('./routes/onboardings');

require('dotenv').config();

if (!process.env.JWT_SECRET) {
  throw new Error('JWT_SECRET env variable is required');
}

const app = express();
const port = Number(process.env.PORT) || 7002;

app.use(express.json());
app.use(cookieParser());

app.use('/rest/onboardings', onboardingsRouter);

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
  res.status(500).json({
    status: 'error',
    message: 'Internal server error'
  });
});

app.listen(port, () => {
  console.log(`Reimbursements backend listening on port ${port}`);
});
