const jwt = require('jsonwebtoken');
const pool = require('../db');
const { errorResponse } = require('../utils/responses');
const { JWT_SECRET } = require('../config/auth');

const AUTH_COOKIE_NAME = 'auth_token';

async function authenticate(req, res, next) {
  const token = req.cookies?.[AUTH_COOKIE_NAME];

  if (!token) {
    return errorResponse(res, 401, 'Authentication required');
  }

  let payload;

  try {
    payload = jwt.verify(token, JWT_SECRET);
  } catch (_error) {
    return errorResponse(res, 401, 'Invalid or expired authentication token');
  }

  try {
    const result = await pool.query(
      'SELECT id, role FROM users WHERE id = $1',
      [payload.userId]
    );
    const user = result.rows[0];

    if (!user) {
      return errorResponse(res, 401, 'Invalid authentication token');
    }

    req.user = {
      userId: user.id,
      role: user.role
    };
    return next();
  } catch (error) {
    return next(error);
  }
}

function requireRole(...roles) {
  const allowedRoles = roles.map((role) => role.toUpperCase());

  return (req, res, next) => {
    const userRole = typeof req.user?.role === 'string'
      ? req.user.role.toUpperCase()
      : '';

    if (!allowedRoles.includes(userRole)) {
      return errorResponse(res, 403, 'Forbidden');
    }

    return next();
  };
}

module.exports = {
  AUTH_COOKIE_NAME,
  authenticate,
  requireRole
};
