const express = require('express');
const cookieParser = require('cookie-parser');
const pool = require('./db');
const onboardingsRouter = require('./routes/onboardings');
const reimbursementsRouter = require('./routes/reimbursements');
const rolesRouter = require('./routes/roles');
const employeesRouter = require('./routes/employees');
const { errorResponse } = require('./utils/responses');

require('dotenv').config();

const app = express();
const port = Number(process.env.PORT) || 7002;

app.use(express.json());
app.use(cookieParser());

app.use('/rest/onboardings', onboardingsRouter);
app.use('/rest/roles', rolesRouter);
app.use('/rest/employees', employeesRouter);
app.use('/rest/reimbursements', reimbursementsRouter);

app.get('/health', async (_req, res, next) => {
  try {
    await pool.query('SELECT 1');
    res.json({ status: 'ok' });
  } catch (error) {
    next(error);
  }
});

app.use((_req, res) => {
  errorResponse(res, 404, 'Route not found');
});

app.use((error, _req, res, _next) => {
  console.error(error);
  const statusCode = error.statusCode || error.status || 500;
  const message = statusCode >= 500
    ? 'Internal server error'
    : error.message || 'Request failed';

  errorResponse(res, statusCode, message);
});

app.listen(port, () => {
  console.log(`Reimbursements backend listening on port ${port}`);
});
