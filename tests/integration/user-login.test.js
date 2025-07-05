//// import { test, expect } from '@playwright/test';
//
//// // Reset storage state for unauthenticated tests
//// test.use({ storageState: { cookies: [], origins: [] } });
//
//// test.describe('User Authentication Flow', () => {
////   test('should allow user to login successfully', async ({ page }) => {
////     // Navigate to login page
////     await page.goto('/login');
//
////     // Verify login form is present
////     await expect(page.getByLabel('Email')).toBeVisible();
////     await expect(page.getByLabel('Password')).toBeVisible();
//
////     // Fill login form with valid credentials
////     await page.getByLabel('Email').fill('test@gmail.com');
////     await page.getByLabel('Password').fill('test@gmail.comtest@gmail.com');
//
////     // Submit login form
////     await page.getByRole('button', { name: 'Log in' }).click();
//
////     // Verify successful login redirect
////     await expect(page).toHaveURL('/mfa-verify');
//
////     await expect(page.getByText('MFA Authentication')).toBeVisible();
////   });
//
////   test('should show error for invalid credentials', async ({ page }) => {
////     await page.goto('/login');
//
////     // Attempt login with invalid credentials
////     await page.getByLabel('Email').fill('invalid@example.com');
////     await page.getByLabel('Password').fill('wrongpassword');
////     await page.getByRole('button', { name: 'Log in' }).click();
//
////     // Should stay on login page with error
////     await expect(page).toHaveURL(/.*login.*error=1/);
////   });
//
////   test('should redirect unauthenticated users from protected pages', async ({ page }) => {
////     // Try to access protected admin page
////     await page.goto('/admin');
//
////     // Should be redirected to login
////     await expect(page).toHaveURL(/admin/);
////   });
//// });
//
//
//router.get('/test-inactivity', async (req, res) => {
//    try {
//        const accessToken = req.cookies.access_token;
//        if (!accessToken) {
//            return res.json({ error: 'No access token found' });
//        }
//        const payload = jwt.decode(accessToken);
//        if (!payload) {
//            return res.json({ error: 'Invalid token' });
//        }
//        // Manually set last activity to 16 minutes ago (simulate inactivity)
//        const sixteenMinutesAgo = Date.now() - (16 * 60 * 1000);
//        if (global.redisHelpers && global.redisHelpers.isAvailable()) {
//            const activityKey = `activity:${payload.userId}`;
//            await global.redisClient.setEx(activityKey, 30 * 60, sixteenMinutesAgo.toString());
//            res.json({
//                success: true,
//                message: 'Simulated 16 minutes of inactivity',
//                userId: payload.userId,
//                simulatedLastActivity: new Date(sixteenMinutesAgo).toISOString(),
//                note: 'Next request should trigger inactivity timeout'
//            });
//        } else {
//            res.json({ error: 'Redis not available' });
//        }
//    } catch (error) {
//        console.error('❌ Test inactivity error:', error);
//        res.status(500).json({ error: 'Server error' });
//    }
//});
//// =============================================
//// TEST ENDPOINT: Simple authentication test
//// =============================================
//
//router.get('/test-auth', async (req, res) => {
//    try {
//        // Import the authentication middleware
//        const { authenticateToken } = require('../../frontend/js/token');
//
//        // Apply authentication
//        authenticateToken(req, res, (err) => {
//            if (err) {
//                return res.status(err.statusCode || 401).json({
//                    success: false,
//                    error: err.message,
//                    authenticated: false
//                });
//            }
//
//            // Authentication successful
//            res.json({
//                success: true,
//                message: 'Authentication successful!',
//                authenticated: true,
//                user: {
//                    userId: req.user.userId,
//                    role: req.user.role,
//                    name: req.user.name,
//                    tokenType: req.user.type,
//                    jti: req.user.jti,
//                    iat: req.user.iat,
//                    exp: req.user.exp
//                },
//                timestamp: new Date().toISOString()
//            });
//        });
//
//    } catch (error) {
//        console.error('❌ Test auth endpoint error:', error);
//        res.status(500).json({
//            success: false,
//            error: 'Internal server error',
//            authenticated: false
//        });
//    }
//});
//
//// Test endpoint to check current activity status
//router.get('/test-activity-status', async (req, res) => {
//    try {
//        const accessToken = req.cookies.access_token;
//        if (!accessToken) {
//            return res.json({ error: 'No access token found' });
//        }
//        const payload = jwt.decode(accessToken);
//        if (!payload) {
//            return res.json({ error: 'Invalid token' });
//        }
//        if (global.redisHelpers && global.redisHelpers.isAvailable()) {
//            const activityKey = `activity:${payload.userId}`;
//            const lastActivityStr = await global.redisClient.get(activityKey);
//            if (lastActivityStr) {
//                const lastActivity = parseInt(lastActivityStr);
//                const timeSinceActivity = Date.now() - lastActivity;
//                const inactivityThreshold = 15 * 60 * 1000; // 15 minutes
//                res.json({
//                    userId: payload.userId,
//                    lastActivity: new Date(lastActivity).toISOString(),
//                    timeSinceActivityMs: timeSinceActivity,
//                    timeSinceActivityMinutes: Math.floor(timeSinceActivity / 60000),
//                    inactivityThresholdMs: inactivityThreshold,
//                    isInactive: timeSinceActivity > inactivityThreshold,
//                    timeUntilInactiveMs: Math.max(0, inactivityThreshold - timeSinceActivity),
//                    timeUntilInactiveMinutes: Math.max(0, Math.ceil((inactivityThreshold - timeSinceActivity) / 60000))
//                });
//            } else {
//                res.json({
//                    userId: payload.userId,
//                    error: 'No activity record found',
//                    note: 'This means user should be considered inactive'
//                });
//            }
//        } else {
//            res.json({ error: 'Redis not available' });
//        }
//    } catch (error) {
//        console.error('❌ Activity status error:', error);
//        res.status(500).json({ error: 'Server error' });
//    }
//});