const express = require('express');
const pool = require('../db');
const { authenticate, requireRole } = require('../middleware/authenticate');
const { errorResponse } = require('../utils/responses');

const router = express.Router();

function normalizeRole(role) {
  return typeof role === 'string' ? role.toUpperCase() : '';
}

function mapUser(row) {
  return {
    userId: row.id,
    name: row.name,
    email: row.email,
    role: row.role
  };
}

async function getUserRole(userId) {
  const result = await pool.query(
    'SELECT id, role FROM users WHERE id = $1',
    [userId]
  );

  return result.rows[0];
}

router.use(authenticate);

router.get('/', async (req, res, next) => {
  const role = normalizeRole(req.user.role);

  try {
    let result;

    if (role === 'EMP') {
      return errorResponse(res, 403, 'EMP users cannot access employees');
    }

    if (role === 'RM') {
      result = await pool.query(
        `
          SELECT id, name, email, role
          FROM users
          WHERE rm_id = $1
            AND role = $2
          ORDER BY name ASC, email ASC
        `,
        [req.user.userId, 'EMP']
      );
    } else if (role === 'APE') {
      result = await pool.query(
        `
          SELECT id, name, email, role
          FROM users
          WHERE role = ANY($1::text[])
          ORDER BY name ASC, email ASC
        `,
        [['EMP', 'RM']]
      );
    } else if (role === 'CFO') {
      result = await pool.query(
        `
          SELECT id, name, email, role
          FROM users
          ORDER BY name ASC, email ASC
        `
      );
    } else {
      return errorResponse(res, 403, 'User role cannot access employees');
    }

    return res.json({
      status: 'success',
      data: {
        users: result.rows.map(mapUser)
      }
    });
  } catch (error) {
    return next(error);
  }
});

router.post('/assign', requireRole('CFO'), async (req, res, next) => {
  const { empId, rmId } = req.body;

  if (!empId || !rmId) {
    return errorResponse(res, 400, 'empId and rmId are required');
  }

  try {
    const employee = await getUserRole(empId);
    const manager = await getUserRole(rmId);

    if (!employee) {
      return errorResponse(res, 404, 'Target user not found');
    }

    if (!manager) {
      return errorResponse(res, 404, 'Reporting manager not found');
    }

    if (normalizeRole(employee.role) !== 'EMP') {
      return errorResponse(res, 400, 'Target user must have role EMP');
    }

    if (normalizeRole(manager.role) !== 'RM') {
      return errorResponse(res, 400, 'Reporting manager must have role RM');
    }

    await pool.query(
      'UPDATE users SET rm_id = $1 WHERE id = $2',
      [rmId, empId]
    );

    return res.json({
      status: 'success',
      message: 'Employee assigned to reporting manager'
    });
  } catch (error) {
    return next(error);
  }
});

router.delete('/assign', requireRole('CFO'), async (req, res, next) => {
  const { empId, rmId } = req.body;

  if (!empId || !rmId) {
    return errorResponse(res, 400, 'empId and rmId are required');
  }

  try {
    const employee = await getUserRole(empId);
    const manager = await getUserRole(rmId);

    if (!employee) {
      return errorResponse(res, 404, 'Target user not found');
    }

    if (!manager) {
      return errorResponse(res, 404, 'Reporting manager not found');
    }

    if (normalizeRole(employee.role) !== 'EMP') {
      return errorResponse(res, 400, 'Target user must have role EMP');
    }

    if (normalizeRole(manager.role) !== 'RM') {
      return errorResponse(res, 400, 'Reporting manager must have role RM');
    }

    const result = await pool.query(
      `
        UPDATE users
        SET rm_id = NULL
        WHERE id = $1
          AND rm_id = $2
      `,
      [empId, rmId]
    );

    if (result.rowCount === 0) {
      return errorResponse(res, 404, 'Assignment not found');
    }

    return res.json({
      status: 'success',
      message: 'Reporting manager assignment removed'
    });
  } catch (error) {
    return next(error);
  }
});

module.exports = router;
