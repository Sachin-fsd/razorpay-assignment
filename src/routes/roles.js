const express = require('express');
const pool = require('../db');
const { authenticate, requireRole } = require('../middleware/authenticate');
const { errorResponse } = require('../utils/responses');

const router = express.Router();
const VALID_ROLES = new Set(['EMP', 'RM', 'APE', 'CFO']);

function normalizeRole(role) {
  return typeof role === 'string' ? role.toUpperCase() : '';
}

router.use(authenticate);

router.post('/assign', requireRole('CFO'), async (req, res, next) => {
  const { userId, role } = req.body;
  const targetRole = normalizeRole(role);

  if (!userId || !targetRole) {
    return errorResponse(res, 400, 'UserId and role are required');
  }

  if (!VALID_ROLES.has(targetRole)) {
    return errorResponse(res, 400, 'Role must be one of EMP, RM, APE, or CFO');
  }

  try {
    const result = await pool.query(
      `
        UPDATE users
        SET
          role = $1,
          rm_id = CASE WHEN $1 = $3 THEN rm_id ELSE NULL END
        WHERE id = $2
        RETURNING id, name, email, role
      `,
      [targetRole, userId, 'EMP']
    );

    if (result.rowCount === 0) {
      return errorResponse(res, 404, 'User not found');
    }

    const user = result.rows[0];

    return res.json({
      status: 'success',
      data: {
        user: {
          userId: user.id,
          name: user.name,
          email: user.email,
          role: user.role
        }
      }
    });
  } catch (error) {
    return next(error);
  }
});

module.exports = router;
