const express = require('express');
const pool = require('../db');
const { authenticate } = require('../middleware/authenticate');

const router = express.Router();
const APPROVAL_STATUSES = new Set(['APPROVED', 'REJECTED']);

function errorResponse(res, statusCode, message) {
  return res.status(statusCode).json({
    status: 'error',
    message
  });
}

function normalizeRole(role) {
  return typeof role === 'string' ? role.toUpperCase() : '';
}

function mapReimbursement(row) {
  return {
    title: row.title,
    description: row.description,
    amount: row.amount,
    status: row.status
  };
}

async function isSubordinate(empId, rmId) {
  const result = await pool.query(
    'SELECT 1 FROM users WHERE id = $1 AND rm_id = $2 LIMIT 1',
    [empId, rmId]
  );

  return result.rowCount > 0;
}

router.use(authenticate);

router.post('/', async (req, res, next) => {
  const role = normalizeRole(req.user.role);
  const { title, description, amount } = req.body;
  const numericAmount = Number(amount);

  if (role !== 'EMP') {
    return errorResponse(res, 403, 'Only EMP users can create reimbursements');
  }

  if (!title || !description || amount === undefined) {
    return errorResponse(res, 400, 'Title, description, and amount are required');
  }

  if (!Number.isFinite(numericAmount) || numericAmount <= 0) {
    return errorResponse(res, 400, 'Amount must be a positive number');
  }

  try {
    const result = await pool.query(
      `
        INSERT INTO reimbursements (
          emp_id,
          title,
          description,
          amount,
          status,
          rm_approved,
          ape_approved
        )
        VALUES ($1, $2, $3, $4, 'PENDING', false, false)
        RETURNING title, description, amount, status
      `,
      [req.user.userId, title, description, numericAmount]
    );

    return res.status(201).json({
      status: 'success',
      data: {
        reimbursement: mapReimbursement(result.rows[0])
      }
    });
  } catch (error) {
    return next(error);
  }
});

router.patch('/', async (req, res, next) => {
  const role = normalizeRole(req.user.role);
  const { userId, status } = req.body;
  const normalizedStatus = typeof status === 'string' ? status.toUpperCase() : '';

  if (role === 'EMP') {
    return errorResponse(res, 403, 'EMP users cannot approve or reject reimbursements');
  }

  if (!userId || !normalizedStatus) {
    return errorResponse(res, 400, 'UserId and status are required');
  }

  if (!APPROVAL_STATUSES.has(normalizedStatus)) {
    return errorResponse(res, 400, 'Status must be APPROVED or REJECTED');
  }

  try {
    if (role === 'RM' && !(await isSubordinate(userId, req.user.userId))) {
      return errorResponse(res, 403, 'RM users can only act on subordinate reimbursements');
    }

    if (!['RM', 'APE', 'CFO'].includes(role)) {
      return errorResponse(res, 403, 'User role cannot approve or reject reimbursements');
    }

    let result;

    if (normalizedStatus === 'REJECTED') {
      result = await pool.query(
        `
          UPDATE reimbursements
          SET status = 'REJECTED'
          WHERE emp_id = $1
            AND status = 'PENDING'
          RETURNING title, description, amount, status
        `,
        [userId]
      );
    } else {
      const rmApprovedExpression =
        role === 'RM' || role === 'CFO' ? 'true' : 'rm_approved';
      const apeApprovedExpression =
        role === 'APE' || role === 'CFO' ? 'true' : 'ape_approved';

      result = await pool.query(
        `
          UPDATE reimbursements
          SET
            rm_approved = ${rmApprovedExpression},
            ape_approved = ${apeApprovedExpression},
            status = CASE
              WHEN ${rmApprovedExpression} = true
                AND ${apeApprovedExpression} = true
              THEN 'APPROVED'
              ELSE 'PENDING'
            END
          WHERE emp_id = $1
            AND status = 'PENDING'
          RETURNING title, description, amount, status
        `,
        [userId]
      );
    }

    if (result.rowCount === 0) {
      return errorResponse(res, 404, 'No pending reimbursements found for this user');
    }

    return res.json({
      status: 'success',
      data: {
        reimbursements: result.rows.map(mapReimbursement)
      }
    });
  } catch (error) {
    return next(error);
  }
});

router.get('/', async (req, res, next) => {
  const role = normalizeRole(req.user.role);

  try {
    let result;

    if (role === 'EMP') {
      result = await pool.query(
        `
          SELECT title, description, amount, status
          FROM reimbursements
          WHERE emp_id = $1
          ORDER BY created_at DESC
        `,
        [req.user.userId]
      );
    } else if (role === 'RM') {
      result = await pool.query(
        `
          SELECT r.title, r.description, r.amount, r.status
          FROM reimbursements r
          JOIN users u ON u.id = r.emp_id
          WHERE u.rm_id = $1
            AND r.status = 'PENDING'
            AND r.rm_approved = false
          ORDER BY r.created_at DESC
        `,
        [req.user.userId]
      );
    } else if (role === 'APE') {
      result = await pool.query(
        `
          SELECT title, description, amount, status
          FROM reimbursements
          WHERE rm_approved = true
            AND ape_approved = false
            AND status = 'PENDING'
          ORDER BY created_at DESC
        `
      );
    } else if (role === 'CFO') {
      result = await pool.query(
        `
          SELECT title, description, amount, status
          FROM reimbursements
          WHERE ape_approved = true
          ORDER BY created_at DESC
        `
      );
    } else {
      return errorResponse(res, 403, 'User role cannot view reimbursements');
    }

    return res.json({
      status: 'success',
      data: {
        reimbursements: result.rows.map(mapReimbursement)
      }
    });
  } catch (error) {
    return next(error);
  }
});

module.exports = router;
