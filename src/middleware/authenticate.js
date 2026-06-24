const jwt = require('jsonwebtoken');

const AUTH_COOKIE_NAME = 'auth_token';

function sendAuthError(res, statusCode, message) {
  return res.status(statusCode).json({
    status: 'error',
    message
  });
}

function authenticate(req, res, next) {
  const token = req.cookies?.[AUTH_COOKIE_NAME];

  if (!token) {
    return sendAuthError(res, 401, 'Authentication required');
  }

  try {
    const payload = jwt.verify(token, process.env.JWT_SECRET);
    req.user = {
      userId: payload.userId,
      role: payload.role
    };
    return next();
  } catch (_error) {
    return sendAuthError(res, 401, 'Invalid or expired authentication token');
  }
}

module.exports = {
  AUTH_COOKIE_NAME,
  authenticate
};
