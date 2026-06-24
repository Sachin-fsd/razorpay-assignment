const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const pool = require('../db');
const { AUTH_COOKIE_NAME } = require('../middleware/authenticate');
const { errorResponse } = require('../utils/responses');
const { JWT_SECRET } = require('../config/auth');

const router = express.Router();
const ORG_EMAIL_PATTERN = /^[^\s@]+@org\.com$/i;

function isOrgEmail(email) {
  return typeof email === 'string' && ORG_EMAIL_PATTERN.test(email.trim());
}

function getCookieOptions() {
  return {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production'
  };
}

router.post('/register', async (req, res, next) => {
  const { name, email, password } = req.body;
  const normalizedEmail = typeof email === 'string' ? email.trim().toLowerCase() : '';

  if (!name || !normalizedEmail || !password) {
    return errorResponse(res, 400, 'Name, email, and password are required');
  }

  if (!isOrgEmail(normalizedEmail)) {
    return errorResponse(res, 400, 'Email must end with @org.com');
  }

  try {
    const passwordHash = await bcrypt.hash(password, 10);
    await pool.query(
      `
        INSERT INTO users (name, email, password, role)
        VALUES ($1, $2, $3, $4)
      `,
      [name, normalizedEmail, passwordHash, 'EMP']
    );

    return res.status(201).json({
      status: 'success',
      message: 'User registered successfully'
    });
  } catch (error) {
    if (error.code === '23505') {
      return errorResponse(res, 409, 'Email is already registered');
    }

    return next(error);
  }
});

router.post('/login', async (req, res, next) => {
  const { email, password } = req.body;
  const normalizedEmail = typeof email === 'string' ? email.trim().toLowerCase() : '';

  if (!normalizedEmail || !password) {
    return errorResponse(res, 400, 'Email and password are required');
  }

  if (!isOrgEmail(normalizedEmail)) {
    return errorResponse(res, 400, 'Email must end with @org.com');
  }

  try {
    const result = await pool.query(
      'SELECT id, password, role FROM users WHERE email = $1',
      [normalizedEmail]
    );
    const user = result.rows[0];

    if (!user) {
      return errorResponse(res, 401, 'Invalid email or password');
    }

    const passwordMatches = await bcrypt.compare(password, user.password);

    if (!passwordMatches) {
      return errorResponse(res, 401, 'Invalid email or password');
    }

    const token = jwt.sign(
      {
        userId: user.id,
        role: user.role
      },
      JWT_SECRET,
      { expiresIn: '1d' }
    );

    res.cookie(AUTH_COOKIE_NAME, token, getCookieOptions());

    return res.json({
      status: 'success',
      message: 'Logged in successfully'
    });
  } catch (error) {
    return next(error);
  }
});

router.post('/logout', (_req, res) => {
  res.clearCookie(AUTH_COOKIE_NAME, getCookieOptions());

  return res.json({
    status: 'success',
    message: 'Logged out successfully'
  });
});

module.exports = router;
