const express = require('express');
const pool = require('../db');
const { authenticate } = require('../middleware/authenticate');
const { errorResponse } = require('../utils/responses');

const router = express.Router();
const APPROVAL_STATUSES = new Set(['APPROVED', 'REJECTED']);

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

async function getEmployee(userId) {
  const result = await pool.query(
    'SELECT id, role, rm_id FROM users WHERE id = $1',
    [userId]
  );

  return result.rows[0];
}

async function ensureTargetEmployee(res, userId) {
  const employee = await getEmployee(userId);

  if (!employee) {
    errorResponse(res, 404, 'Target user not found');
    return null;
  }

  if (normalizeRole(employee.role) !== 'EMP') {
    errorResponse(res, 400, 'Target user must have role EMP');
    return null;
  }

  return employee;
}

function canActOnEmployee(role, callerId, employee) {
  if (role === 'RM') {
    return employee.rm_id === callerId;
  }

  return role === 'APE' || role === 'CFO';
}

async function hasPendingReimbursement(userId) {
  const result = await pool.query(
    `
      SELECT 1
      FROM reimbursements
      WHERE emp_id = $1
        AND status = $2
      LIMIT 1
    `,
    [userId, 'PENDING']
  );

  return result.rowCount > 0;
}

async function updateReimbursementsForDecision(userId, status, role) {
  const rmApproval = role === 'RM' || role === 'CFO';
  const apeApproval = role === 'APE' || role === 'CFO';

  if (status === 'REJECTED') {
    return pool.query(
      `
        UPDATE reimbursements
        SET status = $1
        WHERE emp_id = $2
          AND status = $3
        RETURNING title, description, amount, status
      `,
      ['REJECTED', userId, 'PENDING']
    );
  }

  return pool.query(
    `
      UPDATE reimbursements
      SET
        rm_approved = CASE WHEN $1::boolean THEN true ELSE rm_approved END,
        ape_approved = CASE WHEN $2::boolean THEN true ELSE ape_approved END,
        status = CASE
          WHEN (CASE WHEN $1::boolean THEN true ELSE rm_approved END) = true
            AND (CASE WHEN $2::boolean THEN true ELSE ape_approved END) = true
          THEN $3
          ELSE $4
        END
      WHERE emp_id = $5
        AND status = $4
      RETURNING title, description, amount, status
    `,
    [rmApproval, apeApproval, 'APPROVED', 'PENDING', userId]
  );
}

async function listVisibleReimbursements(role, userId) {
  if (role === 'EMP') {
    return pool.query(
      `
        SELECT title, description, amount, status
        FROM reimbursements
        WHERE emp_id = $1
        ORDER BY created_at DESC
      `,
      [userId]
    );
  }

  if (role === 'RM') {
    return pool.query(
      `
        SELECT r.title, r.description, r.amount, r.status
        FROM reimbursements r
        JOIN users u ON u.id = r.emp_id
        WHERE u.rm_id = $1
          AND u.role = $2
          AND r.status = $3
          AND r.rm_approved = false
        ORDER BY r.created_at DESC
      `,
      [userId, 'EMP', 'PENDING']
    );
  }

  if (role === 'APE') {
    return pool.query(
      `
        SELECT title, description, amount, status
        FROM reimbursements
        WHERE rm_approved = true
          AND ape_approved = false
          AND status = $1
        ORDER BY created_at DESC
      `,
      ['PENDING']
    );
  }

  if (role === 'CFO') {
    return pool.query(
      `
        SELECT title, description, amount, status
        FROM reimbursements
        WHERE ape_approved = true
        ORDER BY created_at DESC
      `
    );
  }

  return null;
}

async function getAllReimbursementsForUser(userId) {
  const result = await pool.query(
    `
      SELECT title, description, amount, status
      FROM reimbursements
      WHERE emp_id = $1
      ORDER BY created_at DESC
    `,
    [userId]
  );

  return result.rows.map(mapReimbursement);
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
        VALUES ($1, $2, $3, $4, $5, false, false)
        RETURNING title, description, amount, status
      `,
      [req.user.userId, title, description, numericAmount, 'PENDING']
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

  if (!['RM', 'APE', 'CFO'].includes(role)) {
    return errorResponse(res, 403, 'User role cannot approve or reject reimbursements');
  }

  try {
    const employee = await ensureTargetEmployee(res, userId);

    if (!employee) {
      return null;
    }

    if (!canActOnEmployee(role, req.user.userId, employee)) {
      return errorResponse(res, 403, 'Caller does not have authority over this reimbursement');
    }

    if (!(await hasPendingReimbursement(userId))) {
      return errorResponse(res, 404, 'Pending reimbursement not found for this user');
    }

    const result = await updateReimbursementsForDecision(
      userId,
      normalizedStatus,
      role
    );

    if (result.rowCount === 0) {
      return errorResponse(res, 404, 'Pending reimbursement not found for this user');
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
    const result = await listVisibleReimbursements(role, req.user.userId);

    if (!result) {
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

router.get('/:userId', async (req, res, next) => {
  const role = normalizeRole(req.user.role);
  const { userId } = req.params;

  if (!['RM', 'APE', 'CFO'].includes(role)) {
    return errorResponse(res, 403, 'Only RM, APE, or CFO users can view another employee reimbursements');
  }

  try {
    const employee = await ensureTargetEmployee(res, userId);

    if (!employee) {
      return null;
    }

    if (role === 'RM' && !canActOnEmployee(role, req.user.userId, employee)) {
      return errorResponse(res, 403, 'RM users can only view subordinate reimbursements');
    }

    const reimbursements = await getAllReimbursementsForUser(userId);

    return res.json({
      status: 'success',
      data: {
        reimbursements
      }
    });
  } catch (error) {
    return next(error);
  }
});

module.exports = router;
