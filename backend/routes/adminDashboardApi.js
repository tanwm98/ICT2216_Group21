const express = require('express');
const db = require('../../db');
const router = express.Router();
const { authenticateToken, requireAdmin } = require('../../frontend/js/token');
const nodemailer = require('nodemailer');
const fs = require('fs');
const path = require('path');
const { sanitizeInput, sanitizeSpecificFields, sanitizeForEmail } = require('../middleware/sanitization');
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
    service: 'Gmail',
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

// Helper function for pagination
function getPaginationParams(req) {
    const page = Math.max(1, parseInt(req.query.page) || 1);
    const limit = Math.min(50, Math.max(5, parseInt(req.query.limit) || 10));
    const offset = (page - 1) * limit;
    return { page, limit, offset };
}

function createPaginationResponse(data, total, page, limit) {
    const totalPages = Math.ceil(total / limit);
    return {
        data,
        pagination: {
            page,
            limit,
            total,
            totalPages,
            hasNext: page < totalPages,
            hasPrev: page > 1
        }
    };
}

router.get('/pending-restaurants', authenticateToken, requireAdmin, async (req, res) => {
    try {
        const { page, limit, offset } = getPaginationParams(req);

        // Get total count
        const totalResult = await db('stores')
            .where('status', 'pending')
            .count('* as count')
            .first();
        const total = parseInt(totalResult.count);

        // Get paginated data
        const pendingRestaurants = await db('stores as s')
            .join('users as u', 's.owner_id', 'u.user_id')
            .select(
                's.*',
                'u.name as owner_name',
                'u.firstname',
                'u.lastname',
                'u.email as owner_email',
                db.raw('s.submitted_at::TEXT as submitted_at')
            )
            .where('s.status', 'pending')
            .orderBy('s.submitted_at', 'asc')
            .limit(limit)
            .offset(offset);

        const restaurants = pendingRestaurants.map(restaurant => ({
            ...restaurant,
            imageUrl: restaurant.image_filename
                ? `static/img/restaurants/${restaurant.image_filename}`
                : 'static/img/restaurants/no-image.png'
        }));

        res.json(createPaginationResponse(restaurants, total, page, limit));
    } catch (error) {
        console.error('Error fetching pending restaurants:', error);
        res.status(500).json({ error: 'Failed to fetch pending restaurants' });
    }
});

router.post('/approve-restaurant/:id', authenticateToken, requireAdmin, requireRecentReauth, async (req, res) => {
    const trx = await db.transaction();

    try {
        const storeId = parseInt(req.params.id);
        const adminId = req.user.userId;

        if (isNaN(storeId)) {
            await trx.rollback();
            return res.status(400).json({ error: 'Invalid store ID' });
        }

        // Get restaurant details
        const restaurant = await trx('stores as s')
            .join('users as u', 's.owner_id', 'u.user_id')
            .select('s.*', 'u.email as owner_email', 'u.firstname', 'u.lastname', 'u.name as owner_name')
            .where('s.store_id', storeId)
            .andWhere('s.status', 'pending')
            .first();

        if (!restaurant) {
            await trx.rollback();
            return res.status(404).json({ error: 'Pending restaurant not found' });
        }

        // Update status to approved
        await trx('stores')
            .where('store_id', storeId)
            .update({
                status: 'approved',
                approved_at: db.fn.now(),
                approved_by: adminId
            });

        await trx.commit();

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
        await trx.rollback();
        console.error('Error approving restaurant:', error);
        res.status(500).json({ error: 'Failed to approve restaurant' });
    }
});

router.post('/reject-restaurant/:id', authenticateToken, requireAdmin, requireRecentReauth, async (req, res) => {
    const trx = await db.transaction();

    try {
        const storeId = parseInt(req.params.id);
        const adminId = req.user.userId;
        const { rejection_reason } = req.body;

        if (isNaN(storeId)) {
            await trx.rollback();
            return res.status(400).json({ error: 'Invalid store ID' });
        }

        if (!rejection_reason || rejection_reason.trim().length < 10) {
            await trx.rollback();
            return res.status(400).json({ error: 'Rejection reason must be at least 10 characters' });
        }

        // Fetch restaurant info
        const restaurant = await trx('stores as s')
            .join('users as u', 's.owner_id', 'u.user_id')
            .select('s.*', 'u.email as owner_email', 'u.firstname', 'u.lastname', 'u.name as owner_name')
            .where('s.store_id', storeId)
            .andWhere('s.status', 'pending')
            .first();

        if (!restaurant) {
            await trx.rollback();
            return res.status(404).json({ error: 'Pending restaurant not found' });
        }

        // Update status to rejected
        await trx('stores')
            .where('store_id', storeId)
            .update({
                status: 'rejected',
                rejection_reason: rejection_reason.trim(),
                approved_by: adminId
            });

        await trx.commit();

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
        await trx.rollback();
        console.error('Error rejecting restaurant:', error);
        res.status(500).json({ error: 'Failed to reject restaurant' });
    }
});

router.post('/users/:id/send-reset-email', authenticateToken, requireAdmin, async (req, res) => {
    const { id } = req.params;

    try {
        // Get user details
        const user = await db('users')
            .select('email', 'name', 'firstname', 'role')
            .where('user_id', id)
            .first();

        if (!user) {
            return res.status(404).json({ error: 'User not found' });
        }

        // If user is admin/owner, check that reset_password action is already approved
        if (user.role === 'owner') {
            console.log('[SEND RESET EMAIL] User is sensitive role:', user.role);
            console.log('[SEND RESET EMAIL] Checking for approved action...');

            const approvedAction = await db('pending_actions')
                .where({
                    action_type: 'reset_password',
                    target_id: id,
                    target_type: 'user',
                    status: 'approved'
                })
                .first();

            if (!approvedAction) {
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
        await db('users')
            .where('user_id', id)
            .update({
                reset_token: token,
                reset_token_expires: expires
            });

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
        const [totalUsersResult] = await db('users')
            .whereNot('role', 'admin')
            .count('* as count');

        const [totalRestaurantsResult] = await db('stores')
            .count('* as count');

        const [totalReservationsResult] = await db('reservations')
            .count('* as count');

        const topRatedRestaurant = await db('reviews as r')
            .join('stores as s', 'r.store_id', 's.store_id')
            .select('s.storeName')
            .avg('r.rating as average_rating')
            .groupBy('s.storeName')
            .orderBy('average_rating', 'desc')
            .first();

        res.json({
            totalUsers: parseInt(totalUsersResult.count),
            totalRestaurants: parseInt(totalRestaurantsResult.count),
            totalReservations: parseInt(totalReservationsResult.count),
            topRatedRestaurant: topRatedRestaurant?.storeName || 'N/A',
            topAverageRating: topRatedRestaurant ? Math.round(topRatedRestaurant.average_rating * 10) / 10 : 0.0
        });
    } catch (err) {
        console.error('Dashboard stats error:', err);
        res.status(500).json({ error: 'Failed to fetch dashboard stats' });
    }
});

// ======== MANAGE USERS ========
router.get('/users', async (req, res) => {
    try {
        const { page, limit, offset } = getPaginationParams(req);

        // Get total count
        const totalResult = await db('users')
            .whereNot('role', 'admin')
            .count('* as count')
            .first();
        const total = parseInt(totalResult.count);

        // Get paginated data
        const users = await db('users')
            .select('user_id', 'name', 'email', 'role', 'firstname', 'lastname')
            .whereNot('role', 'admin')
            .orderBy('user_id', 'desc')
            .limit(limit)
            .offset(offset);

        res.json(createPaginationResponse(users, total, page, limit));
    } catch (err) {
        console.error('Error fetching users:', err);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// Add a new user (default password Pass123)
router.post(
  '/users',
  fieldLevelAccess({
    admin: ['name', 'email', 'role', 'fname', 'lname']
  }),
  addUserValidator,
  handleValidation,
  requireRecentReauth,
  async (req, res) => {
    const { name, email, role, fname, lname } = req.body;
    try {
      console.log('[ADD USER] Request body:', { name, email, role, fname, lname });

      const resetToken = crypto.randomBytes(32).toString('hex');
      const resetExpires = new Date(Date.now() + 24 * 60 * 60 * 1000); // 24 hours

      await db('users').insert({
        name,
        email,
        password: null, // No password set initially
        role,
        firstname: fname,
        lastname: lname,
        reset_token: resetToken,
        reset_token_expires: resetExpires
      });

      // Send welcome email with setup link
      const setupLink = `https://kirbychope.xyz/reset-password?token=${resetToken}`;
      await transporter.sendMail({
        from: `"Kirby Chope Admin" <${process.env.EMAIL_USER}>`,
        to: email,
        subject: 'Welcome to Kirby Chope – Set Your Password',
        html: `
          <h2>Welcome to Kirby Chope!</h2>
          <p>An administrator has created an account for you.</p>
          <p>Click the link below to set your password:</p>
          <a href="${setupLink}">Set Your Password</a>
          <p>This link expires in 24 hours.</p>
        `
      });

      // Finally, respond to the client
      return res.status(201).json({ message: 'User created, setup email sent.' });

    } catch (err) {
      console.error('[ADD USER ERROR]', err);
      return res.status(500).json({ error: 'Failed to create user.' });
    }
  }
);

// Delete user by id
router.delete('/users/:id', authenticateToken, requireAdmin, async (req, res) => {
    const { id } = req.params;
    const adminId = req.user.userId;
    const trx = await db.transaction();

    try {
        console.log(`[DELETE USER] Attempt by admin ${adminId} to delete user ${id}`);

        const pendingAction = await db('pending_actions')
            .where({
                action_type: 'delete_user',
                target_id: id,
                target_type: 'user',
                status: 'pending'
            })
            .first();

        if (!pendingAction) {
            console.warn(`[DELETE USER] No pending action found for user ${id}, creating new one`);

            await db('pending_actions').insert({
                action_type: 'delete_user',
                target_id: id,
                target_type: 'user',
                requested_by: adminId,
                approved_by: db.raw('ARRAY[]::INTEGER[]'),
                rejected_by: db.raw('ARRAY[]::INTEGER[]'),
                status: 'pending'
            });

            return res.status(202).json({ message: 'Delete request created. Awaiting approval from 2 other admins.' });
        }

        const approved_by = pendingAction.approved_by || [];
        const rejected_by = pendingAction.rejected_by || [];
        const requestedBy = pendingAction.requested_by;

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
            await db('pending_actions')
                .where('action_id', pendingAction.action_id)
                .update({
                    rejected_by: db.raw('array_append(rejected_by, ?)', [adminId]),
                    status: 'rejected'
                });

            return res.status(200).json({ message: 'Action rejected. Deletion cancelled.' });
        }

        // Approve logic
        const updatedApprovals = [...approved_by, adminId];

        if (updatedApprovals.length >= 2) {
            console.log(`[DELETE USER] 2 approvals reached. Deleting user ${id}`);

            // Delete related records first
            await trx('pending_actions').where('requested_by', id).del();
            await trx('reservation_edits').where('user_id', id).del();

            // Delete reservation edits for user's reservations
            const userReservations = await trx('reservations')
                .select('reservation_id')
                .where('user_id', id);

            if (userReservations.length > 0) {
                const reservationIds = userReservations.map(r => r.reservation_id);
                await trx('reservation_edits')
                    .whereIn('reservation_id', reservationIds)
                    .del();
            }

            await trx('reviews').where('user_id', id).del();
            await trx('reservations').where('user_id', id).del();
            await trx('stores').where('approved_by', id).update({ approved_by: null });

            // Handle owned restaurants
            const ownedStores = await trx('stores')
                .select('store_id')
                .where('owner_id', id);

            if (ownedStores.length > 0) {
                const storeIds = ownedStores.map(s => s.store_id);

                // Delete reservations and related data for owned stores
                const storeReservations = await trx('reservations')
                    .select('reservation_id')
                    .whereIn('store_id', storeIds);

                if (storeReservations.length > 0) {
                    const storeReservationIds = storeReservations.map(r => r.reservation_id);
                    await trx('reservation_edits')
                        .whereIn('reservation_id', storeReservationIds)
                        .del();
                }

                await trx('reviews').whereIn('store_id', storeIds).del();
                await trx('reservations').whereIn('store_id', storeIds).del();
                await trx('stores').where('owner_id', id).del();
                await trx('pending_actions')
                    .where('target_type', 'restaurant')
                    .whereIn('target_id', storeIds)
                    .del();
            }

            // Delete the user
            const deletedUser = await trx('users')
                .where('user_id', id)
                .del()
                .returning('*');

            if (deletedUser.length === 0) {
                await trx.rollback();
                return res.status(404).json({ error: 'User not found during deletion.' });
            }

            // Handle self-deletion session termination
            if (parseInt(id) === req.user.userId) {
                console.log(`[SESSION] Terminating session for user ${id}`);
                req.session.destroy(() => {
                    res.clearCookie('token');
                    console.log('[SESSION] JWT cookie cleared after self-deletion');
                });
            }

            // Clean up pending actions
            await trx('pending_actions')
                .where({
                    target_type: 'user',
                    target_id: id
                })
                .del();

            await trx('pending_actions')
                .where('action_id', pendingAction.action_id)
                .update({
                    approved_by: updatedApprovals,
                    status: 'approved'
                });

            await trx.commit();
            console.log(`[DELETE USER] User ${id} deleted successfully.`);
            return res.json({ message: 'User deleted after approval.' });
        }

        // Not enough approvals yet
        await db('pending_actions')
            .where('action_id', pendingAction.action_id)
            .update({
                approved_by: updatedApprovals
            });

        console.log(`[DELETE USER] Approval from ${adminId} recorded. Awaiting more.`);
        return res.status(200).json({ message: 'Approval recorded. Waiting for another admin.' });

    } catch (err) {
        await trx.rollback();
        console.error('Multi-admin deletion error:', err);
        return res.status(500).json({ error: 'Internal server error' });
    }
});

// Update user by id
router.put(
    '/users/:id',
    fieldLevelAccess({
        admin: ['name', 'email', 'role', 'firstname', 'lastname']
    }),
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
            const user = await db('users')
                .select('user_id')
                .where('user_id', id)
                .first();

            if (!user) {
                return res.status(404).json({ error: 'User not found' });
            }

            await db('users')
                .where('user_id', id)
                .update({
                    name,
                    email,
                    role,
                    firstname,
                    lastname
                });

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
        const user = await db('users')
            .select('user_id', 'name', 'email', 'role', 'firstname', 'lastname')
            .where('user_id', id)
            .first();

        if (!user) {
            return res.status(404).json({ error: 'User not found' });
        }

        res.json(user);
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

        const user = await db('users')
            .select('role')
            .where('user_id', id)
            .first();

        if (!user) {
            return res.status(404).json({ error: 'User not found' });
        }

        const targetRole = user.role;
        console.log('[RESET PASSWORD] Target role:', targetRole);

        // For admin/owner: requires multi-admin approval
        if (['admin', 'owner'].includes(targetRole)) {
            const pendingAction = await db('pending_actions')
                .where({
                    action_type: 'reset_password',
                    target_id: id,
                    target_type: 'user',
                    status: 'pending'
                })
                .first();

            // Existing request
            if (pendingAction) {
                if (pendingAction.requested_by === requestedBy) {
                    return res.status(403).json({ error: 'You cannot approve or reject your own password reset request.' });
                }

                const approved_by = pendingAction.approved_by || [];
                const rejected_by = pendingAction.rejected_by || [];

                if (req.query.decision === 'reject') {
                    await db('pending_actions')
                        .where('action_id', pendingAction.action_id)
                        .update({
                            rejected_by: db.raw('array_append(rejected_by, ?)', [requestedBy]),
                            status: 'rejected'
                        });

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
                    await db('pending_actions')
                        .where('action_id', pendingAction.action_id)
                        .update({
                            rejected_by: db.raw('ARRAY_APPEND(rejected_by, ?)', [requestedBy]),
                            status: 'rejected'
                        });

                    return res.status(400).json({ message: 'Action has been rejected by another admin.' });
                }

                const updatedApprovals = [...approved_by, requestedBy];
                if (updatedApprovals.length >= 1) {
                    const resetToken = crypto.randomBytes(32).toString('hex');
                    const resetExpires = new Date(Date.now() + 3600_000); // 1 hour

                    await db('users')
                        .where('user_id', id)
                        .update({
                            reset_token: resetToken,
                            reset_token_expires: resetExpires,
                            refresh_token_version: db.raw('refresh_token_version + 1')
                        });


                    await db('pending_actions')
                        .where('action_id', pendingAction.action_id)
                        .update({
                            approved_by: updatedApprovals,
                            status: 'approved'
                        });

                    return res.json({ message: 'Password reset to default after approvals.' });
                }

                // Record partial approval
                await db('pending_actions')
                    .where('action_id', pendingAction.action_id)
                    .update({
                        approved_by: updatedApprovals
                    });

                return res.status(200).json({ message: 'Approval recorded. Awaiting another admin.' });
            }

            // No existing request → create new one
            await db('pending_actions').insert({
                action_type: 'reset_password',
                target_id: id,
                target_type: 'user',
                requested_by: requestedBy,
                approved_by: db.raw('ARRAY[]::INTEGER[]'),
                rejected_by: db.raw('ARRAY[]::INTEGER[]'),
                status: 'pending'
            });

            console.log('[RESET PASSWORD] Pending action created for user:', id);
            return res.status(202).json({ message: 'Password reset request created. Awaiting 2 admin approvals.' });
        }

        // For normal users: reset immediately
        const hashedPassword = await argon2.hash('Pass123');
        await db('users')
            .where('user_id', id)
            .update({
                password: hashedPassword,
                token_version: db.raw('token_version + 1')
            });

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
    res.setHeader('Content-Disposition', `attachment; filename="${encodeURIComponent(safeFilename)}"`);
    res.sendFile(filePath);
});

// ======== RESTAURANTS ========
// Get all restaurants
router.get('/restaurants', async (req, res) => {
    try {
        const { page, limit, offset } = getPaginationParams(req);

        // Get total count
        const totalResult = await db('stores as s')
            .join('users as u', 's.owner_id', 'u.user_id')
            .count('* as count')
            .first();
        const total = parseInt(totalResult.count);

        // Get paginated data
        const restaurants = await db('stores as s')
            .join('users as u', 's.owner_id', 'u.user_id')
            .select(
                's.store_id',
                's.storeName',
                's.location',
                'u.name as ownerName'
            )
            .orderBy('s.store_id', 'desc')
            .limit(limit)
            .offset(offset);

        res.json(createPaginationResponse(restaurants, total, page, limit));
    } catch (err) {
        console.error('Error fetching restaurants:', err);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// Get all users with role 'owner'
router.get('/owners', async (req, res) => {
    try {
        const owners = await db('users')
            .select('user_id', 'name')
            .where('role', 'owner');

        res.json(owners);
    } catch (err) {
        console.error('Error fetching owners:', err);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// Add new restaurant
router.post('/restaurants', upload.single('image'), validateUploadedImage, requireRecentReauth, restaurantAddValidator, handleValidation, async (req, res) => {
    const {
        owner_id, storeName, address, postalCode, location,
        cuisine, priceRange, totalCapacity,
        opening, closing
    } = req.body;

    console.log('FILE:', req.file);
    console.log('BODY:', req.body);

    const imageFilename = req.file ? req.file.filename : null;
    const altText = req.file ? `${storeName} restaurant image` : null;

    try {
        await db('stores').insert({
            owner_id,
            storeName,
            address,
            postalCode,
            location,
            cuisine,
            priceRange,
            totalCapacity,
            currentCapacity: totalCapacity,
            opening,
            closing,
            image_filename: imageFilename,
            image_alt_text: altText
        });

        res.json({ message: 'Restaurant added successfully' });
    } catch (err) {
        console.error('Error adding restaurant:', err);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// Get restaurant by id
router.get('/restaurants/:id', async (req, res) => {
    const { id } = req.params;

    try {
        const restaurant = await db('stores')
            .select(
                'store_id',
                'storeName',
                'address',
                'postalCode',
                'location',
                'cuisine',
                'priceRange',
                'totalCapacity',
                'currentCapacity',
                'opening',
                'closing',
                'owner_id',
                'image_filename',
                'image_alt_text'
            )
            .where('store_id', id)
            .first();

        if (!restaurant) {
            return res.status(404).json({ error: 'Restaurant not found' });
        }

        // Add image URL for frontend compatibility
        restaurant.imageUrl = generateImageUrl(restaurant.image_filename);

        res.json(restaurant);
    } catch (err) {
        console.error('Error fetching restaurant:', err);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// Update restaurant by id
router.put(
    '/restaurants/:id',
    upload.single('image'),
    validateUploadedImage,
    fieldLevelAccess({
        admin: ['storeName', 'address', 'postalCode', 'cuisine', 'location', 'priceRange', 'totalCapacity', 'opening', 'closing', 'owner_id']
    }),
    requireRecentReauth,
    updateRestaurantValidator,
    handleValidation,
    async (req, res) => {
        const id = req.params.id;
        const {
            storeName, address, postalCode, cuisine, location,
            priceRange, totalCapacity, opening, closing, owner_id
        } = req.body;

        const trx = await db.transaction();
        let oldImagePathToDelete = null;

        try {
            const currentRestaurant = await trx('stores')
                .select('owner_id', 'image_filename')
                .where('store_id', id)
                .first();

            if (!currentRestaurant) {
                await trx.rollback();
                return res.status(404).json({ error: 'Restaurant not found' });
            }

            if (req.user.role !== 'admin' && currentRestaurant.owner_id !== req.user.userId) {
                logSecurity(`IDOR attempt: user ${req.user.userId} tried to update store ${id}`);
                await trx.rollback();
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

            await trx('stores')
                .where('store_id', id)
                .update({
                    storeName,
                    address,
                    postalCode,
                    cuisine,
                    location,
                    priceRange,
                    totalCapacity,
                    currentCapacity: totalCapacity,
                    opening,
                    closing,
                    owner_id,
                    image_filename: imageFilename,
                    image_alt_text: altText
                });

            await trx.commit();

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
            await trx.rollback();
            console.error('Error updating restaurant:', err);
            res.status(500).json({ error: 'Internal server error' });
        }
    }
);

// Delete restaurant by id
router.delete('/restaurants/:id', authenticateToken, requireAdmin, async (req, res) => {
    const { id } = req.params;
    const requestedBy = req.user.userId;

    try {
        const existingAction = await db('pending_actions')
            .where({
                action_type: 'delete_restaurant',
                target_id: id,
                target_type: 'restaurant',
                status: 'pending'
            })
            .first();

        // Case 1: No pending request yet → create one
        if (!existingAction) {
            await db('pending_actions').insert({
                action_type: 'delete_restaurant',
                target_id: id,
                target_type: 'restaurant',
                requested_by: requestedBy,
                approved_by: db.raw('ARRAY[]::INTEGER[]'),
                rejected_by: db.raw('ARRAY[]::INTEGER[]'),
                status: 'pending'
            });

            return res.status(202).json({ message: 'Delete request created. Awaiting approval from other admins.' });
        }

        const { approved_by, rejected_by } = existingAction;

        // Prevent requester from acting on their own request
        if (requestedBy === existingAction.requested_by) {
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
            await db('pending_actions')
                .where('action_id', existingAction.action_id)
                .update({
                    rejected_by: db.raw('array_append(rejected_by, ?)', [requestedBy]),
                    status: 'rejected'
                });

            return res.status(200).json({ message: 'Delete request rejected.' });
        }

        // Case 5: Approve
        const updatedApprovals = [...approved_by, requestedBy];

        if (updatedApprovals.length >= 1) {
            const trx = await db.transaction();

            try {
                const reservations = await trx('reservations')
                    .select('reservation_id')
                    .where('store_id', id);

                const reservationIds = reservations.map(r => r.reservation_id);

                if (reservationIds.length > 0) {
                    await trx('reservation_edits')
                        .whereIn('reservation_id', reservationIds)
                        .del();
                }

                await trx('reviews').where('store_id', id).del();
                await trx('reservations').where('store_id', id).del();

                const restaurant = await trx('stores')
                    .select('image_filename')
                    .where('store_id', id)
                    .first();

                if (restaurant?.image_filename) {
                    const imagePath = path.join(__dirname, '../../frontend/static/img/restaurants', restaurant.image_filename);
                    if (fs.existsSync(imagePath)) {
                        fs.unlinkSync(imagePath);
                    }
                }

                await trx('stores').where('store_id', id).del();

                await trx('pending_actions')
                    .where('action_id', existingAction.action_id)
                    .update({
                        approved_by: updatedApprovals,
                        status: 'approved'
                    });

                await trx.commit();
                return res.json({ message: 'Action approved. Restaurant has been deleted.' });
            } catch (err) {
                await trx.rollback();
                throw err;
            }
        }

        await db('pending_actions')
            .where('action_id', existingAction.action_id)
            .update({
                approved_by: updatedApprovals
            });

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
        const reviews = await db('reviews as rv')
            .join('users as u', 'rv.user_id', 'u.user_id')
            .join('stores as s', 'rv.store_id', 's.store_id')
            .select(
                'rv.review_id',
                'rv.rating',
                'rv.description',
                'u.name as userName',
                's.storeName'
            );

        res.json(reviews);
    } catch (err) {
        console.error('Error fetching reviews:', err);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// ======== RESERVATIONS ========
router.get('/reservations', async (req, res) => {
    try {
        const { page, limit, offset } = getPaginationParams(req);

        // Get total count
        const totalResult = await db('reservations')
            .count('* as count')
            .first();
        const total = parseInt(totalResult.count);

        // Get paginated data
        const reservations = await db('reservations as r')
            .join('users as u', 'r.user_id', 'u.user_id')
            .join('stores as s', 'r.store_id', 's.store_id')
            .select(
                'r.reservation_id',
                'r.noOfGuest',
                db.raw('r."reservationDate"::TEXT'),
                'r.reservationTime',
                'r.specialRequest',
                'r.status',
                'u.name as userName',
                's.storeName as restaurantName'
            )
            .orderBy('r.reservationDate', 'desc')
            .orderBy('r.reservationTime', 'desc')
            .limit(limit)
            .offset(offset);

        res.json(createPaginationResponse(reservations, total, page, limit));
    } catch (err) {
        console.error('Error fetching reservations:', err);
        res.status(500).json({ error: 'Failed to fetch reservations' });
    }
});

// Cancel reservation (FIXED: Ensure this route exists for admin)
router.put('/reservations/:id/cancel', cancelReservationValidator, handleValidation, async (req, res) => {
    const reservationId = req.params.id;
    const adminUserId = req.user.userId; // Admin user, not owner

    try {
        // Get reservation details with owner info
        const reservation = await db('reservations as r')
            .join('users as u', 'r.user_id', 'u.user_id')
            .join('stores as s', 'r.store_id', 's.store_id')
            .select('r.*', 'u.email as user_email', 'u.name as user_name', 's.storeName', 's.owner_id')
            .where('r.reservation_id', reservationId)
            .first();

        if (!reservation) {
            console.log(`No reservation found with ID ${reservationId}`);
            return res.status(404).json({ error: 'Reservation not found' });
        }

        // Admin can cancel any reservation (no ownership check needed)
        console.log(`[ADMIN CANCEL] Admin ${adminUserId} cancelling reservation ${reservationId}`);

        // Cancel the reservation
        await db('reservations')
            .where('reservation_id', reservationId)
            .update({ status: 'Cancelled' });

        // Format date and time
        const date = new Date(reservation.reservationDate).toLocaleDateString();
        const time = reservation.reservationTime.slice(0, 5); // HH:MM

        // Compose email
        const mailOptions = {
            from: '"Kirby Chope Admin" <yourapp@example.com>',
            to: reservation.user_email,
            subject: `Your reservation at ${reservation.storeName} has been cancelled`,
            html: `
                <p>Hello ${reservation.user_name || ''},</p>
                <p>We regret to inform you that your reservation has been <strong>cancelled</strong> by the administration.</p>
                <h4>Reservation Details:</h4>
                <ul>
                    <li><strong>Restaurant:</strong> ${reservation.storeName}</li>
                    <li><strong>Date:</strong> ${date}</li>
                    <li><strong>Time:</strong> ${time}</li>
                    <li><strong>Number of Guests:</strong> ${reservation.noOfGuest}</li>
                    ${reservation.specialRequest ? `<li><strong>Special Request:</strong> ${reservation.specialRequest}</li>` : ''}
                </ul>
                <p>If you have any questions, please contact our support team.</p>
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

        // Log admin action
        logBusiness('admin_reservation_cancelled', 'reservation', {
            reservation_id: reservationId,
            admin_id: adminUserId,
            admin_name: req.user.name,
            customer_email: reservation.user_email,
            restaurant_name: reservation.storeName
        }, req);

        res.json({ message: 'Reservation cancelled and email sent', reservation });

    } catch (err) {
        console.error('Error cancelling reservation:', err);
        res.status(500).json({ error: 'Failed to cancel reservation' });
    }
});

router.get('/pending-actions', async (req, res) => {
    try {
        const { page, limit, offset } = getPaginationParams(req);

        // Get total count
        const totalResult = await db('pending_actions')
            .count('* as count')
            .first();
        const total = parseInt(totalResult.count);

        // Get paginated data
        const pendingActions = await db('pending_actions as pa')
            .leftJoin('users as u', 'pa.requested_by', 'u.user_id')
            .leftJoin('stores as s', function() {
                this.on('pa.target_type', '=', db.raw('?', ['restaurant']))
                    .andOn('pa.target_id', '=', 's.store_id');
            })
            .leftJoin('users as u2', function() {
                this.on('pa.target_type', '=', db.raw('?', ['user']))
                    .andOn('pa.target_id', '=', 'u2.user_id');
            })
            .select(
                'pa.*',
                'u.name as requested_by_name',
                db.raw('COALESCE(s."storeName", u2.name) as target_name')
            )
            .orderBy('pa.created_at', 'desc')
            .limit(limit)
            .offset(offset);

        res.json(createPaginationResponse(pendingActions, total, page, limit));
    } catch (err) {
        console.error('Error fetching pending actions:', err);
        res.status(500).json({ error: 'Failed to fetch pending actions' });
    }
});

router.post('/reauthenticate', authenticateToken, async (req, res) => {
    const { password } = req.body;
    const userId = req.user.userId;

    try {
        const user = await db('users')
            .select('password')
            .where('user_id', userId)
            .first();

        if (!user) {
            return res.status(404).json({ error: 'User not found' });
        }

        const isMatch = await argon2.verify(user.password, password);
        if (!isMatch) {
            return res.status(401).json({ error: 'Incorrect password' });
        }

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
        const updatedUser = await db('users')
            .where('user_id', id)
            .update({
                token_version: db.raw('token_version + 1')
            })
            .returning('*');

        if (updatedUser.length === 0) {
            return res.status(404).json({ error: 'User not found' });
        }

        res.json({ message: 'User session terminated.' });
    } catch (err) {
        console.error('Error during force logout:', err);
        res.status(500).json({ error: 'Failed to force logout user.' });
    }
});

module.exports = {
    upload,
    validateUploadedImage,
    router
};