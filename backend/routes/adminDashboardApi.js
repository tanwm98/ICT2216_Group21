const express = require('express');
const pool = require('../../db');
const router = express.Router();
const { authenticateToken, requireAdmin } = require('../../frontend/js/token');
const nodemailer = require('nodemailer');
const fs = require('fs');
const path = require('path');
const { sanitizeInput, sanitizeSpecificFields } = require('../middleware/sanitization');
const { upload, validateUploadedImage } = require('../middleware/fileUploadValidation');
const { requireRecentReauth } = require('../middleware/requireReauth');
const mime = require('mime-types');
const argon2 = require('argon2');
const { logAuth, logBusiness, logSystem, logSecurity } = require('../logger');
const crypto = require('crypto');
const { fieldLevelAccess } = require('../middleware/fieldAccessControl');

function generateImageUrl(imageFilename) {
    if (!imageFilename || typeof imageFilename !== 'string') {
        return '/static/img/restaurants/no-image.png';
    }
    return `/static/img/restaurants/${imageFilename}`;
}

// Set up your transporter (configure with real credentials)
const transporter = nodemailer.createTransport({
    service: 'Gmail', // or 'SendGrid', 'Mailgun', etc.
    auth: {
        user: process.env.EMAIL_USER,
        pass: process.env.EMAIL_PASS,
    },
});

const { body } = require('express-validator');
const {
  userNameValidator,
  userFirstNameValidator,
  userLastNameValidator,
  updateRestaurantValidator,
  cancelReservationValidator,
  addUserValidator,
  restaurantAddValidator
} = require('../middleware/validators');
const handleValidation = require('../middleware/handleHybridValidation');

router.use(authenticateToken, requireAdmin);

router.get('/pending-restaurants', authenticateToken, requireAdmin, async (req, res) => {
    try {
        const result = await pool.query(`
            SELECT
                s.*,
                u.name as owner_name,
                u.firstname,
                u.lastname,
                u.email as owner_email,
                s.submitted_at::TEXT as submitted_at
            FROM stores s
            JOIN users u ON s.owner_id = u.user_id
            WHERE s.status = 'pending'
            ORDER BY s.submitted_at ASC
        `);

        const pendingRestaurants = result.rows.map(restaurant => ({
            ...restaurant,
            imageUrl: restaurant.image_filename
                ? `static/img/restaurants/${restaurant.image_filename}`
                : 'static/img/restaurants/no-image.png'
        }));

        res.json(pendingRestaurants);
    } catch (error) {
        console.error('Error fetching pending restaurants:', error);
        res.status(500).json({ error: 'Failed to fetch pending restaurants' });
    }
});

router.post('/approve-restaurant/:id', authenticateToken, requireAdmin, requireRecentReauth, async (req, res) => {
    const client = await pool.connect();

    try {
        const storeId = parseInt(req.params.id);
        const adminId = req.user.userId;

        if (isNaN(storeId)) {
            return res.status(400).json({ error: 'Invalid store ID' });
        }

        await client.query('BEGIN');

        // Get restaurant details
        const restaurantResult = await client.query(`
            SELECT s.*, u.email as owner_email, u.firstname, u.lastname, u.name as owner_name
            FROM stores s
            JOIN users u ON s.owner_id = u.user_id
            WHERE s.store_id = $1 AND s.status = 'pending'
        `, [storeId]);

        if (restaurantResult.rows.length === 0) {
            await client.query('ROLLBACK');
            return res.status(404).json({ error: 'Pending restaurant not found' });
        }

        const restaurant = restaurantResult.rows[0];

        // Update status to approved
        await client.query(`
            UPDATE stores
            SET status = 'approved', approved_at = NOW(), approved_by = $1
            WHERE store_id = $2
        `, [adminId, storeId]);

        await client.query('COMMIT'); // Commit the DB update before sending email

        // Email
        const approvalEmail = `
            Congratulations ${restaurant.firstname}!

            🎉 Your restaurant "${restaurant.storeName}" has been APPROVED and is now live on Kirby Chope!

            📊 Your Restaurant is Now:
            ✅ Visible to customers on our platform
            ✅ Available for reservations
            ✅ Listed in search results

            🚀 Next Steps:
            1. Log into your owner dashboard to start managing reservations
            2. Monitor your restaurant's performance and reviews
            3. Update your restaurant information as needed

            🔗 Your Restaurant Page: https://kirbychope.xyz/selectedRes?name=${encodeURIComponent(restaurant.storeName)}&location=${encodeURIComponent(restaurant.location)}

            Welcome to the Kirby Chope family!

            Best regards,
            The Kirby Chope Team
        `;

        await transporter.sendMail({
            from: `"Kirby Chope" <${process.env.EMAIL_USER}>`,
            to: restaurant.owner_email,
            subject: `🎉 Restaurant Approved - ${restaurant.storeName} is now live!`,
            text: approvalEmail
        });

        logBusiness('restaurant_approved', 'restaurant', {
            store_id: storeId,
            store_name: restaurant.storeName,
            owner_id: restaurant.owner_id,
            approved_by: adminId,
            admin_name: req.user.name
        }, req);

        res.json({
            message: 'Restaurant approved successfully',
            restaurant: {
                store_id: storeId,
                storeName: restaurant.storeName,
                status: 'approved'
            }
        });

    } catch (error) {
        await client.query('ROLLBACK');
        console.error('Error approving restaurant:', error);
        res.status(500).json({ error: 'Failed to approve restaurant' });
    } finally {
        client.release();
    }
});

router.post('/reject-restaurant/:id', authenticateToken, requireAdmin, requireRecentReauth, async (req, res) => {
    const client = await pool.connect();

    try {
        const storeId = parseInt(req.params.id);
        const adminId = req.user.userId;
        const { rejection_reason } = req.body;

        if (isNaN(storeId)) {
            return res.status(400).json({ error: 'Invalid store ID' });
        }

        if (!rejection_reason || rejection_reason.trim().length < 10) {
            return res.status(400).json({ error: 'Rejection reason must be at least 10 characters' });
        }

        await client.query('BEGIN');

        // Fetch restaurant info
        const restaurantResult = await client.query(`
            SELECT s.*, u.email as owner_email, u.firstname, u.lastname, u.name as owner_name
            FROM stores s
            JOIN users u ON s.owner_id = u.user_id
            WHERE s.store_id = $1 AND s.status = 'pending'
        `, [storeId]);

        if (restaurantResult.rows.length === 0) {
            await client.query('ROLLBACK');
            return res.status(404).json({ error: 'Pending restaurant not found' });
        }

        const restaurant = restaurantResult.rows[0];

        // Update status to rejected
        await client.query(`
            UPDATE stores
            SET status = 'rejected', rejection_reason = $1, approved_by = $2
            WHERE store_id = $3
        `, [rejection_reason.trim(), adminId, storeId]);

        await client.query('COMMIT');

        // Send email
        const rejectionEmail = `
            Dear ${restaurant.firstname},

            Thank you for your interest in joining Kirby Chope.

            Unfortunately, we cannot approve your restaurant "${restaurant.storeName}" at this time.

            📋 Reason for Rejection:
            ${rejection_reason}

            🔄 Next Steps:
            - Please review the feedback above
            - You may resubmit your application after addressing the concerns
            - Contact our support team if you have questions: ${process.env.EMAIL_USER}

            We appreciate your understanding and look forward to potentially working with you in the future.

            Best regards,
            The Kirby Chope Team
        `;

        await transporter.sendMail({
            from: `"Kirby Chope" <${process.env.EMAIL_USER}>`,
            to: restaurant.owner_email,
            subject: `Application Update - ${restaurant.storeName}`,
            text: rejectionEmail
        });

        // Log action
        logBusiness('restaurant_rejected', 'restaurant', {
            store_id: storeId,
            store_name: restaurant.storeName,
            owner_id: restaurant.owner_id,
            rejected_by: adminId,
            admin_name: req.user.name,
            rejection_reason: rejection_reason
        }, req);

        res.json({
            message: 'Restaurant rejected successfully',
            restaurant: {
                store_id: storeId,
                storeName: restaurant.storeName,
                status: 'rejected',
                rejection_reason: rejection_reason
            }
        });

    } catch (error) {
        await client.query('ROLLBACK');
        console.error('Error rejecting restaurant:', error);
        res.status(500).json({ error: 'Failed to reject restaurant' });
    } finally {
        client.release();
    }
});

router.post('/users/:id/send-reset-email', authenticateToken, requireAdmin, async (req, res) => {
  const { id } = req.params;

  try {
    // Get user details
    const userResult = await pool.query(
      'SELECT email, name, firstname, role FROM users WHERE user_id = $1',
      [id]
    );

    if (userResult.rows.length === 0) {
      return res.status(404).json({ error: 'User not found' });
    }

    const user = userResult.rows[0];

    // If user is admin/owner, check that reset_password action is already approved
    if (user.role === 'owner') {
      console.log('[SEND RESET EMAIL] User is sensitive role:', user.role);
      console.log('[SEND RESET EMAIL] Checking for approved action...');
      const pending = await pool.query(`
        SELECT * FROM pending_actions
        WHERE action_type = 'reset_password'
          AND target_id = $1
          AND target_type = 'user'
          AND status = 'approved'
      `, [id]);

      if (pending.rowCount === 0) {
        console.warn('[SEND RESET EMAIL] Not approved yet, aborting send');
        return res.status(403).json({
          error: 'Password reset request is not yet approved by 2 admins. Email will be sent only after approval.'
        });
      }
    }

    // Generate secure reset token
    const token = crypto.randomBytes(32).toString('hex');
    const expires = new Date(Date.now() + 3600_000); // 1 hour

    // Store reset token in database
    await pool.query(
      'UPDATE users SET reset_token = $1, reset_token_expires = $2 WHERE user_id = $3',
      [token, expires, id]
    );

    // Create reset link
    const resetLink = `https://kirbychope.xyz/reset-password?token=${token}`;

    // Send email
    await transporter.sendMail({
      from: `"Kirby Chope Admin" <${process.env.EMAIL_USER}>`,
      to: user.email,
      subject: 'Password Reset Request - Initiated by Administrator',
      html: `
        <h2>Password Reset Request</h2>
        <p>Hello ${user.firstname || user.name},</p>
        <p>An administrator has initiated a password reset for your Kirby Chope account.</p>
        <p>Click the link below to set a new password:</p>
        <a href="${resetLink}" style="background-color: #fc6c3f; color: white; padding: 10px 20px; text-decoration: none; border-radius: 5px;">Reset Password</a>
        <p><strong>This link will expire in 1 hour.</strong></p>
        <p>If you did not expect this, please contact support immediately.</p>
        <hr>
        <p>Best regards,<br>The Kirby Chope Team</p>
      `,
    });

    // Log the action
    logBusiness('admin_password_reset_initiated', 'user', {
      target_user_id: id,
      target_user_email: user.email,
      admin_id: req.user.userId,
      admin_name: req.user.name
    }, req);

    res.json({ message: `Password reset email sent to ${user.email}` });

  } catch (err) {
    console.error('Error sending admin reset email:', err);
    res.status(500).json({ error: 'Failed to send reset email' });
  }
});

// ======== ADMIN DASHBOARD ========
router.get('/dashboard-stats', async (req, res) => {
    try {
        const totalUsers = await pool.query('SELECT COUNT(*) FROM users WHERE role != $1', ['admin']);
        const totalRestaurants = await pool.query('SELECT COUNT(*) FROM stores');
        const totalReservations = await pool.query('SELECT COUNT(*) FROM reservations');
        const topRatingResult = await pool.query(`
            SELECT s."storeName", ROUND(AVG(r.rating), 1) AS average_rating
            FROM reviews r
            JOIN stores s ON r.store_id = s.store_id
            GROUP BY s."storeName"
            ORDER BY average_rating DESC
            LIMIT 1;
        `);

        const topRatedRestaurant = topRatingResult.rows[0] || {};

        res.json({
            totalUsers: parseInt(totalUsers.rows[0].count),
            totalRestaurants: parseInt(totalRestaurants.rows[0].count),
            totalReservations: parseInt(totalReservations.rows[0].count),
            topRatedRestaurant: topRatedRestaurant.storeName || 'N/A',
            topAverageRating: topRatedRestaurant.average_rating || 0.0
        });
    } catch (err) {
        console.error('Dashboard stats error:', err);
        res.status(500).json({ error: 'Failed to fetch dashboard stats' });
    }
});

// ======== MANAGE USERS ========
router.get('/users', async (req, res) => {
    try {
        const result = await pool.query(
            'SELECT user_id, name, email, role, firstname, lastname FROM users WHERE role != $1',
            ['admin']
        );
        res.json(result.rows);
    } catch (err) {
        console.error('Error fetching users:', err);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// Add a new user (default password Pass123)
router.post(
  '/users',
  fieldLevelAccess(['name', 'email', 'role', 'fname', 'lname']),
  addUserValidator,
  handleValidation,
  requireRecentReauth,
  async (req, res) => {
    const { name, email, role, fname, lname } = req.body;
    try {
      console.log('[ADD USER] Request body:', { name, email, role, fname, lname });

      const password = 'Pass123';
      const hashedPassword = await argon2.hash(password);

      const result = await pool.query(
        'INSERT INTO users (name, email, password, role, firstname, lastname) VALUES ($1, $2, $3, $4, $5, $6)',
        [name, email, hashedPassword, role, fname, lname]
      );

      console.log('[ADD USER] User inserted:', result.rowCount);
      res.status(201).json({ message: 'User added successfully' });

    } catch (err) {
      console.error('[ADD USER ERROR]', {
        message: err.message,
        stack: err.stack,
        detail: err.detail || null
      });
      res.status(500).json({ error: 'Server error', detail: err.detail || err.message });
    }
  }
);

// Delete user by id
// Replace the existing deleteUser route with this:
router.delete('/users/:id', authenticateToken, requireAdmin, async (req, res) => {
  const { id } = req.params;
  const adminId = req.user.userId;
  let inTransaction = false;

  try {
    console.log(`[DELETE USER] Attempt by admin ${adminId} to delete user ${id}`);

    const pending = await pool.query(`
      SELECT * FROM pending_actions 
      WHERE action_type = 'delete_user' AND target_id = $1 AND target_type = 'user' AND status = 'pending'
    `, [id]);

    if (pending.rowCount === 0) {
      console.warn(`[DELETE USER] No pending action found for user ${id}, creating new one`);

      await pool.query(`
        INSERT INTO pending_actions (
          action_type, target_id, target_type, requested_by, approved_by, rejected_by, status
        ) VALUES (
          'delete_user', $1, 'user', $2, ARRAY[]::INTEGER[], ARRAY[]::INTEGER[], 'pending'
        )
      `, [id, adminId]);

      return res.status(202).json({ message: 'Delete request created. Awaiting approval from 2 other admins.' });
    }

    const action = pending.rows[0];
    const approved_by = action.approved_by || [];
    const rejected_by = action.rejected_by || [];
    const requestedBy = action.requested_by;

    if (adminId === requestedBy) {
      return res.status(403).json({ error: 'You cannot approve or reject your own request.' });
    }

    if (rejected_by.includes(adminId)) {
      return res.status(400).json({ error: 'You already rejected this action.' });
    }

    if (approved_by.includes(adminId)) {
      return res.status(400).json({ error: 'You already approved this action.' });
    }

    // Reject logic
    if (req.query.decision === 'reject') {
      await pool.query(`
        UPDATE pending_actions 
        SET rejected_by = array_append(rejected_by, $1), status = 'rejected'
        WHERE action_id = $2
      `, [adminId, action.action_id]);

      return res.status(200).json({ message: 'Action rejected. Deletion cancelled.' });
    }

    // Approve logic
    const updatedApprovals = [...approved_by, adminId];

    if (updatedApprovals.length >= 2) {
      console.log(`[DELETE USER] 2 approvals reached. Deleting user ${id}`);
      await pool.query('BEGIN');
      inTransaction = true;

      await pool.query('DELETE FROM pending_actions WHERE requested_by = $1', [id]);

      await pool.query('DELETE FROM reservation_edits WHERE user_id = $1', [id]);
      await pool.query(`
        DELETE FROM reservation_edits
        WHERE reservation_id IN (
          SELECT reservation_id FROM reservations WHERE user_id = $1
        )
      `, [id]);

      await pool.query('DELETE FROM reviews WHERE user_id = $1', [id]);
      await pool.query('DELETE FROM reservations WHERE user_id = $1', [id]);
      await pool.query('UPDATE stores SET approved_by = NULL WHERE approved_by = $1', [id]);

      const storesResult = await pool.query('SELECT store_id FROM stores WHERE owner_id = $1', [id]);
      if (storesResult.rows.length > 0) {
        const storeIds = storesResult.rows.map(row => row.store_id);

        await pool.query(`
          DELETE FROM reservation_edits
          WHERE reservation_id IN (
            SELECT reservation_id FROM reservations WHERE store_id = ANY($1)
          )
        `, [storeIds]);

        await pool.query('DELETE FROM reviews WHERE store_id = ANY($1)', [storeIds]);
        await pool.query('DELETE FROM reservations WHERE store_id = ANY($1)', [storeIds]);
        await pool.query('DELETE FROM stores WHERE owner_id = $1', [id]);
        await pool.query(`DELETE FROM pending_actions WHERE target_type = 'restaurant' AND target_id = ANY($1)
  `, [storeIds]);
      }

      const result = await pool.query('DELETE FROM users WHERE user_id = $1 RETURNING *', [id]);
      if (result.rowCount === 0) {
        await pool.query('ROLLBACK');
        return res.status(404).json({ error: 'User not found during deletion.' });
      }

      if (parseInt(id) === req.user.userId) {
        console.log(`[SESSION] Terminating session for user ${id}`);
        req.session.destroy(() => {
          res.clearCookie('token');
          console.log('[SESSION] JWT cookie cleared after self-deletion');
        });
      }

      await pool.query(`DELETE FROM pending_actions WHERE target_type = 'user' AND target_id = $1`, [id]);

      await pool.query(`UPDATE pending_actions SET approved_by = $1, status = 'approved' WHERE action_id = $2`, [updatedApprovals, action.action_id]);

      await pool.query('COMMIT');
      
      console.log(`[DELETE USER] User ${id} deleted successfully.`);
      return res.json({ message: 'User deleted after approval.' });
    }

    // Not enough approvals yet
    await pool.query(`
      UPDATE pending_actions SET approved_by = $1 
      WHERE action_id = $2
    `, [updatedApprovals, action.action_id]);

    console.log(`[DELETE USER] Approval from ${adminId} recorded. Awaiting more.`);
    return res.status(200).json({ message: 'Approval recorded. Waiting for another admin.' });

  } catch (err) {
    if (inTransaction) await pool.query('ROLLBACK');
    console.error('Multi-admin deletion error:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

// Update user by id
router.put(
    '/users/:id',
    fieldLevelAccess(['name', 'email', 'role', 'firstname', 'lastname']),
    requireRecentReauth,
    [
        userNameValidator,
        userFirstNameValidator,
        userLastNameValidator,
        body('email').isEmail().normalizeEmail(),
        body('role').isIn(['user', 'owner'])
    ],
    handleValidation,
    async (req, res) => {
        const { id } = req.params;
        const { name, email, role, firstname, lastname } = req.body;
        try {
            const checkUser = await pool.query('SELECT user_id FROM users WHERE user_id = $1', [id]);
            if (checkUser.rowCount === 0) {
                return res.status(404).json({ error: 'User not found' });
            }
            await pool.query(
                'UPDATE users SET name = $1, email = $2, role = $3, firstname = $4, lastname = $5 WHERE user_id = $6',
                [name, email, role, firstname, lastname, id]
            );
            res.json({ message: 'User updated' });
        } catch (err) {
            console.error('Error updating user:', err);
            res.status(500).json({ error: 'Internal server error' });
        }
    }
);

// Get user by id
router.get('/users/:id', async (req, res) => {
    const { id } = req.params;

    try {
        const result = await pool.query('SELECT user_id, name, email, role, firstname, lastname FROM users WHERE user_id = $1', [id]);
        if (result.rows.length === 0) return res.status(404).json({ error: 'User not found' });
        res.json(result.rows[0]);
    } catch (err) {
        console.error('Error fetching user:', err);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// POST /users/:id/reset-password
router.post('/users/:id/reset-password', authenticateToken, requireAdmin, async (req, res) => {
  const { id } = req.params;
  const requestedBy = req.user.userId;

  try {
    console.log('[RESET PASSWORD] Requested by:', requestedBy, 'Target ID:', id);
    const userResult = await pool.query('SELECT role FROM users WHERE user_id = $1', [id]);
    if (userResult.rows.length === 0) {
      return res.status(404).json({ error: 'User not found' });
    }

    const targetRole = userResult.rows[0].role;
    console.log('[RESET PASSWORD] Target role:', userResult.rows[0].role);

    // For admin/owner: requires multi-admin approval
    if (['admin', 'owner'].includes(targetRole)) {
      const pendingRes = await pool.query(`
        SELECT * FROM pending_actions 
        WHERE action_type = 'reset_password' AND target_id = $1 
        AND target_type = 'user' AND status = 'pending'
      `, [id]);

      // Existing request
      if (pendingRes.rows.length > 0) {
        const pending = pendingRes.rows[0];

        if (pending.requested_by === requestedBy) {
          return res.status(403).json({ error: 'You cannot approve or reject your own password reset request.' });
        }

        const approved_by = pending.approved_by || [];
        const rejected_by = pending.rejected_by || [];

        if (req.query.decision === 'reject') {
            await pool.query(`
            UPDATE pending_actions 
            SET rejected_by = array_append(rejected_by, $1), status = 'rejected' 
            WHERE action_id = $2
            `, [requestedBy, pending.action_id]);

            return res.status(200).json({ message: 'Password reset request rejected.' });
        }

        if (rejected_by.includes(requestedBy)) {
          return res.status(400).json({ error: 'You already rejected this request.' });
        }

        if (approved_by.includes(requestedBy)) {
          return res.status(400).json({ error: 'You already approved this request.' });
        }

        // If someone has already rejected
        if (rejected_by.length > 0) {
          await pool.query(`
            UPDATE pending_actions 
            SET rejected_by = ARRAY_APPEND(rejected_by, $1), status = 'rejected' 
            WHERE action_id = $2
          `, [requestedBy, pending.action_id]);

          return res.status(400).json({ message: 'Action has been rejected by another admin.' });
        }

        const updatedApprovals = [...approved_by, requestedBy];
        if (updatedApprovals.length >= 2) {
          const hashedPassword = await argon2.hash('Pass123');
          await pool.query('UPDATE users SET password = $1, token_version = token_version + 1 WHERE user_id = $2', [hashedPassword, id]);

          await pool.query(`
            UPDATE pending_actions 
            SET approved_by = $1, status = 'approved' 
            WHERE action_id = $2
          `, [updatedApprovals, pending.action_id]);

          return res.json({ message: 'Password reset to default after approvals.' });
        }

        // Record partial approval
        await pool.query(`
          UPDATE pending_actions 
          SET approved_by = $1 
          WHERE action_id = $2
        `, [updatedApprovals, pending.action_id]);

        return res.status(200).json({ message: 'Approval recorded. Awaiting another admin.' });
      }

      // No existing request → create new one
      await pool.query(`
        INSERT INTO pending_actions (
          action_type, target_id, target_type, requested_by, approved_by, rejected_by, status
        ) VALUES (
          'reset_password', $1, 'user', $2, ARRAY[]::INTEGER[], ARRAY[]::INTEGER[], 'pending'
        )
      `, [id, requestedBy]);
      console.log('[RESET PASSWORD] Pending action created for user:', id);

      return res.status(202).json({ message: 'Password reset request created. Awaiting 2 admin approvals.' });
    }

    // For normal users: reset immediately
    const hashedPassword = await argon2.hash('Pass123');
    await pool.query('UPDATE users SET password = $1, token_version = token_version + 1 WHERE user_id = $2', [hashedPassword, id]);
    return res.json({ message: 'Password reset to default.' });

  } catch (err) {
    console.error('Error resetting password:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

// Filename validation & Content-Disposition
router.get('/download/:filename', (req, res) => {
    const unsafeFilename = req.params.filename;
    const safeFilename = path.basename(unsafeFilename).replace(/[^\w.\-]/g, '_');

    const filePath = path.join(__dirname, '../../frontend/static/img/restaurants', safeFilename);
    if (!fs.existsSync(filePath)) {
        return res.status(404).json({ error: 'File not found' });
    }

    const contentType = mime.lookup(filePath) || 'application/octet-stream';

    res.setHeader('Content-Type', contentType);
    res.setHeader('Content-Disposition', `attachment; filename="${encodeURIComponent(safeFilename)}"`); // sanitization & encoding
    res.sendFile(filePath);
});


// ======== RESTAURANTS ========
// Get all restaurants
router.get('/restaurants', async (req, res) => {
    try {
        const result = await pool.query(`
            SELECT
                s.store_id, s."storeName", s.location,
                u.name AS "ownerName"
            FROM stores s
            JOIN users u ON s.owner_id = u.user_id
        `);
        res.json(result.rows);
    } catch (err) {
        console.error('Error fetching restaurants:', err);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// Get all users with role 'owner'
router.get('/owners', async (req, res) => {
    try {
        const result = await pool.query(`
            SELECT user_id, name FROM users WHERE role = 'owner'
        `);
        res.json(result.rows);
    } catch (err) {
        console.error('Error fetching owners:', err);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// Add new restaurant
// router.post('/restaurants', async (req, res) => {
//     const {
//         owner_id, storeName, address, postalCode, location,
//         cuisine, priceRange, totalCapacity,
//         opening, closing
//     } = req.body;

//     try {
//         await pool.query(`
//             INSERT INTO stores (
//                 owner_id, "storeName", address, "postalCode", location,
//                 cuisine, "priceRange", "totalCapacity", "currentCapacity",
//                 opening, closing
//             )
//             VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
//         `, [
//             owner_id, storeName, address, postalCode, location,
//             cuisine, priceRange, totalCapacity, totalCapacity,
//             opening, closing
//         ]);
//         res.json({ message: 'Restaurant added successfully' });
//     } catch (err) {
//         console.error('Error adding restaurant:', err);
//         res.status(500).json({ error: 'Internal server error' });
//     }
// });

router.post('/restaurants', upload.single('image'), validateUploadedImage, requireRecentReauth, restaurantAddValidator, handleValidation, async (req, res) => {
  const {
    owner_id, storeName, address, postalCode, location,
    cuisine, priceRange, totalCapacity,
    opening, closing
  } = req.body;

  console.log('FILE:', req.file); // ✅ Add this for debugging
  console.log('BODY:', req.body);

    // UPDATED: Store filename instead of base64
    const imageFilename = req.file ? req.file.filename : null;
    const altText = req.file ? `${storeName} restaurant image` : null;

    try {
        await pool.query(`
            INSERT INTO stores (
                owner_id, "storeName", address, "postalCode", location,
                cuisine, "priceRange", "totalCapacity", "currentCapacity",
                opening, closing, image_filename, image_alt_text
            )
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
        `, [
            owner_id, storeName, address, postalCode, location,
            cuisine, priceRange, totalCapacity, totalCapacity,
            opening, closing, imageFilename, altText
        ]);

        res.json({ message: 'Restaurant added successfully' });
    } catch (err) {
        console.error('Error adding restaurant:', err);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// UPDATED: Get restaurant by id with proper column names
router.get('/restaurants/:id', async (req, res) => {
    const { id } = req.params;

    try {
        const result = await pool.query(`
            SELECT
                store_id,
                "storeName" as "storeName",
                address,
                "postalCode" as "postalCode",
                location,
                cuisine,
                "priceRange" as "priceRange",
                "totalCapacity" as "totalCapacity",
                "currentCapacity" as "currentCapacity",
                opening,
                closing,
                owner_id,
                image_filename,
                image_alt_text
            FROM stores
            WHERE store_id = $1
        `, [id]);

        if (result.rows.length === 0) {
            return res.status(404).json({ error: 'Restaurant not found' });
        }

        const restaurant = result.rows[0];

        // Add image URL for frontend compatibility
        restaurant.imageUrl = generateImageUrl(restaurant.image_filename);

        res.json(restaurant);
    } catch (err) {
        console.error('Error fetching restaurant:', err);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// UPDATED: Update restaurant by id with file handling
router.put(
    '/restaurants/:id',
    upload.single('image'),
    validateUploadedImage,
    fieldLevelAccess([
        'storeName', 'address', 'postalCode', 'cuisine', 'location',
        'priceRange', 'totalCapacity', 'opening', 'closing', 'owner_id'
    ]),
    requireRecentReauth,
    updateRestaurantValidator,
    handleValidation,
    async (req, res) => {
        const id = req.params.id;
        const {
            storeName, address, postalCode, cuisine, location,
            priceRange, totalCapacity, opening, closing, owner_id
        } = req.body;

        const client = await pool.connect();
        let oldImagePathToDelete = null;

        try {
            await client.query('BEGIN');

            const storeCheck = await client.query(
                'SELECT owner_id, image_filename FROM stores WHERE store_id = $1',
                [id]
            );

            if (storeCheck.rowCount === 0) {
                await client.query('ROLLBACK');
                return res.status(404).json({ error: 'Restaurant not found' });
            }

            const currentRestaurant = storeCheck.rows[0];
            if (req.user.role !== 'admin' && currentRestaurant.owner_id !== req.user.userId) {
                logSecurity(`IDOR attempt: user ${req.user.userId} tried to update store ${id}`);
                await client.query('ROLLBACK');
                return res.status(403).json({ error: 'Unauthorized to update this restaurant' });
            }

            let imageFilename = currentRestaurant.image_filename;
            let altText = `${storeName} restaurant image`;

            if (req.file) {
                if (currentRestaurant.image_filename) {
                    oldImagePathToDelete = path.join(
                        __dirname,
                        '../../frontend/static/img/restaurants',
                        currentRestaurant.image_filename
                    );
                }
                imageFilename = req.file.filename;
            }

            await client.query(`
                UPDATE stores SET
                    "storeName" = $1,
                    address = $2,
                    "postalCode" = $3,
                    cuisine = $4,
                    location = $5,
                    "priceRange" = $6,
                    "totalCapacity" = $7,
                    "currentCapacity" = $7,
                    opening = $8,
                    closing = $9,
                    owner_id = $10,
                    image_filename = $11,
                    image_alt_text = $12
                WHERE store_id = $13
            `, [
                storeName, address, postalCode, cuisine, location,
                priceRange, totalCapacity, opening, closing,
                owner_id, imageFilename, altText, id
            ]);

            await client.query('COMMIT');

            // Only delete old image after successful commit
            if (oldImagePathToDelete && fs.existsSync(oldImagePathToDelete)) {
                try {
                    fs.unlinkSync(oldImagePathToDelete);
                } catch (deleteErr) {
                    console.warn('Failed to delete old image:', deleteErr);
                }
            }

            res.json({ message: 'Restaurant updated successfully' });

        } catch (err) {
            await client.query('ROLLBACK');
            console.error('Error updating restaurant:', err);
            res.status(500).json({ error: 'Internal server error' });
        } finally {
            client.release();
        }
    }
);

// UPDATED: Delete restaurant by id with file cleanup
router.delete('/restaurants/:id', authenticateToken, requireAdmin, async (req, res) => {
  const { id } = req.params;
  const requestedBy = req.user.userId;

  try {
    const existing = await pool.query(`
      SELECT * FROM pending_actions
      WHERE action_type = 'delete_restaurant'
        AND target_id = $1
        AND target_type = 'restaurant'
        AND status = 'pending'
    `, [id]);

    // Case 1: No pending request yet → create one
    if (existing.rows.length === 0) {
      await pool.query(`
        INSERT INTO pending_actions (
          action_type, target_id, target_type, requested_by, approved_by, rejected_by, status
        ) VALUES (
          'delete_restaurant', $1, 'restaurant', $2, ARRAY[]::INTEGER[], ARRAY[]::INTEGER[], 'pending'
        )
      `, [id, requestedBy]);

      return res.status(202).json({ message: 'Delete request created. Awaiting approval from other admins.' });
    }

    const action = existing.rows[0];
    const { approved_by, rejected_by } = action;

    // ❌ Prevent requester from acting on their own request
    if (requestedBy === action.requested_by) {
      return res.status(403).json({ error: 'You cannot approve or reject your own request.' });
    }

    // Case 2: Already rejected
    if (rejected_by.includes(requestedBy)) {
      return res.status(400).json({ error: 'You already rejected this action.' });
    }

    // Case 3: Already approved by this user
    if (approved_by.includes(requestedBy)) {
      return res.status(400).json({ error: 'You already approved this action.' });
    }

    // Case 4: Reject
    if (req.query.decision === 'reject') {
      await pool.query(`
        UPDATE pending_actions
        SET rejected_by = array_append(rejected_by, $1),
            status = 'rejected'
        WHERE action_id = $2
      `, [requestedBy, action.action_id]);

      return res.status(200).json({ message: 'Delete request rejected.' });
    }

    // Case 5: Approve
    const updatedApprovals = [...approved_by, requestedBy];

    if (updatedApprovals.length >= 2) {
      await pool.query('BEGIN');

      const resIdsResult = await pool.query(`
        SELECT reservation_id FROM reservations WHERE store_id = $1
      `, [id]);
      const reservationIds = resIdsResult.rows.map(r => r.reservation_id);

      if (reservationIds.length > 0) {
        await pool.query(`
          DELETE FROM reservation_edits
          WHERE reservation_id = ANY($1)
        `, [reservationIds]);
      }

      await pool.query('DELETE FROM reviews WHERE store_id = $1', [id]);
      await pool.query('DELETE FROM reservations WHERE store_id = $1', [id]);

      const result = await pool.query('SELECT image_filename FROM stores WHERE store_id = $1', [id]);
      if (result.rows.length > 0 && result.rows[0].image_filename) {
        const imagePath = path.join(__dirname, '../../frontend/static/img/restaurants', result.rows[0].image_filename);
        if (fs.existsSync(imagePath)) {
          fs.unlinkSync(imagePath);
        }
      }

      await pool.query('DELETE FROM stores WHERE store_id = $1', [id]);

      await pool.query(`
        UPDATE pending_actions
        SET approved_by = $1, status = 'approved'
        WHERE action_id = $2
      `, [updatedApprovals, action.action_id]);

      await pool.query('COMMIT');
      return res.json({ message: 'Action approved. Restaurant has been deleted.' });
    }

    await pool.query(`
      UPDATE pending_actions
      SET approved_by = $1
      WHERE action_id = $2
    `, [updatedApprovals, action.action_id]);

    return res.status(202).json({ message: 'Approval recorded. Awaiting another admin.' });

  } catch (err) {
    console.error('Error processing restaurant delete approval:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

// ======== REVIEWS ========
router.get('/reviews', async (req, res) => {
    const requestedOwnerId = req.params.ownerId;
    const authenticatedOwnerId = req.user.userId;

    if (requestedOwnerId !== authenticatedOwnerId) {
        return res.status(403).json({ error: 'Forbidden: Access to reviews is restricted to the authenticated owner.' });
    }

    try {
        const result = await pool.query(`
            SELECT
                rv.review_id, rv.rating, rv.description,
                u.name AS userName,
                s."storeName"
            FROM reviews rv
            JOIN users u ON rv.user_id = u.user_id
            JOIN stores s ON rv.store_id = s.store_id
        `);
        res.json(result.rows);
    } catch (err) {
        console.error('Error fetching reviews:', err);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// ======== RESERVATIONS ========
router.get('/reservations', async (req, res) => {
    try {
        const result = await pool.query(`
            SELECT
                r.reservation_id,
                r."noOfGuest",
                r."reservationDate"::TEXT,
                r."reservationTime",
                r."specialRequest",
                r.status,
                u.name AS "userName",
                s."storeName" AS "restaurantName"
            FROM reservations r
            JOIN users u ON r.user_id = u.user_id
            JOIN stores s ON r.store_id = s.store_id
            ORDER BY r."reservationDate" DESC, r."reservationTime" DESC
        `);
        res.json(result.rows);
    } catch (err) {
        console.error('Error fetching reservations:', err);
        res.status(500).json({ error: 'Failed to fetch reservations' });
    }
});


// =========== CANCEL reservation =============
// router.put('/reservations/:id/cancel', async (req, res) => {
//     try {
//         const reservationId = req.params.id;

//         const result = await pool.query(
//             `UPDATE reservations SET status = 'cancelled' WHERE reservation_id = $1 RETURNING *`,
//             [reservationId]
//         );

//         if (result.rowCount === 0) {
//             return res.status(404).json({ error: 'Reservation not found' });
//         }

//         res.json({ message: 'Reservation cancelled', reservation: result.rows[0] });
//     } catch (err) {
//         console.error('Error cancelling reservation:', err);
//         res.status(500).json({ error: 'Failed to cancel reservation' });
//     }
// });

router.put('/reservations/:id/cancel', cancelReservationValidator, handleValidation, async (req, res) => {
    const reservationId = req.params.id;
    const ownerId = req.user.userId;
    try {
        // Securely verify ownership before allowing cancellation
        // Fetch reservation details, user email, and store name
        const result = await pool.query(
            `SELECT r.*, u.email AS user_email, u.name AS user_name, s."storeName"
             FROM reservations r
             JOIN users u ON r."user_id" = u."user_id"
             JOIN stores s ON r."store_id" = s."store_id"
             WHERE r."reservation_id" = $1`,
            [reservationId]
        );

        if (result.rowCount === 0) {
            console.log(`No reservation found with ID ${reservationId}`);
            return res.status(404).json({ error: 'Reservation not found' });
        }

        const reservation = result.rows[0];

        // Check if the reservation belongs to a restaurant owned by the user (IDOR)
        if (reservation.owner_id !== ownerId) {
            return res.status(403).json({ error: 'Forbidden: You do not have permission to cancel this reservation.' });
        }

        // Cancel the reservation
        await pool.query(
            `UPDATE reservations SET status = 'Cancelled' WHERE reservation_id = $1`,
            [reservationId]
        );

        // Format date and time
        const date = new Date(reservation.reservationDate).toLocaleDateString();
        const time = reservation.reservationTime.slice(0, 5); // HH:MM

        // Compose email
        const mailOptions = {
            from: '"Kirby Chope" <yourapp@example.com>',
            to: reservation.user_email,
            subject: `Your reservation at ${reservation.storeName} has been cancelled`,
            html: `
                <p>Hello ${reservation.user_name || ''},</p>
                <p>We regret to inform you that your reservation has been <strong>cancelled</strong> by the restaurant.</p>
                <h4>Reservation Details:</h4>
                <ul>
                    <li><strong>Restaurant:</strong> ${reservation.storeName}</li>
                    <li><strong>Date:</strong> ${date}</li>
                    <li><strong>Time:</strong> ${time}</li>
                    <li><strong>Number of Guests:</strong> ${reservation.noOfGuest}</li>
                    ${reservation.specialRequest ? `<li><strong>Special Request:</strong> ${reservation.specialRequest}</li>` : ''}
                </ul>
                <p>We apologize for the inconvenience.</p>
            `
        };

        await transporter.sendMail(mailOptions)
            .then(info => {
                console.log(`Email sent to ${reservation.user_email}: ${info.response}`);
            })
            .catch(error => {
                console.error(`Failed to send email to ${reservation.user_email}:`, error);
            });

        res.json({ message: 'Reservation cancelled and email sent', reservation });

    } catch (err) {
        console.error('Error cancelling reservation:', err);
        res.status(500).json({ error: 'Failed to cancel reservation' });
    }
});

router.get('/pending-actions', async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT 
        pa.*, 
        u.name AS requested_by_name, 
        COALESCE(s."storeName", u2.name) AS target_name
      FROM pending_actions pa
      LEFT JOIN users u ON pa.requested_by = u.user_id
      LEFT JOIN stores s ON pa.target_type = 'restaurant' AND pa.target_id = s.store_id
      LEFT JOIN users u2 ON pa.target_type = 'user' AND pa.target_id = u2.user_id
      ORDER BY pa.created_at DESC
    `);

    res.json(result.rows);
  } catch (err) {
    console.error('Error fetching pending actions:', err);
    res.status(500).json({ error: 'Failed to fetch pending actions' });
  }
});

router.post('/reauthenticate', authenticateToken, async (req, res) => {
  const { password } = req.body;
  const userId = req.user.userId;

  try {
    const result = await pool.query('SELECT password FROM users WHERE user_id = $1', [userId]);
    if (result.rows.length === 0) return res.status(404).json({ error: 'User not found' });

    const isMatch = await argon2.verify(result.rows[0].password, password);
    if (!isMatch) return res.status(401).json({ error: 'Incorrect password' });

    req.session.lastVerified = Date.now(); 
    res.json({ message: 'Reauthenticated successfully' });
  } catch (err) {
    console.error('Reauth error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.post('/users/:id/force-logout', authenticateToken, requireAdmin, async (req, res) => {
  const { id } = req.params;

  try {
    const result = await pool.query(
      'UPDATE users SET token_version = token_version + 1 WHERE user_id = $1 RETURNING *',
      [id]
    );

    if (result.rowCount === 0) {
      return res.status(404).json({ error: 'User not found' });
    }

    res.json({ message: 'User session terminated.' });
  } catch (err) {
    console.error('Error during force logout:', err);
    res.status(500).json({ error: 'Failed to force logout user.' });
  }
});

// module.exports = router;
module.exports = {
    upload,
    validateUploadedImage,
    router
};
