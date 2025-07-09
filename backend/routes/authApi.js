const express = require('express');

const db = require('../../db');
const argon2 = require('argon2');
require('dotenv').config();
const nodemailer = require('nodemailer');
const jwt = require('jsonwebtoken');
const router = express.Router();

const multer = require('multer');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');

const { logAuth, logBusiness, logSystem, logSecurity } = require('../logger');
const { sanitizeInput, sanitizeForEmail } = require('../middleware/sanitization');
const { loginValidator, registerValidator } = require('../middleware/validators');
const handleValidation = require('../middleware/handleValidation');
const { isBreachedPassword } = require('../middleware/breachCheck');
const { recordFailure,  resetFailures, shouldShowCaptcha } = require('../middleware/captchaTracker');
const { verifyCaptcha } = require('../middleware/captchaVerification');

const {
    generateTokenPair,
    logoutUser,
    revokeAllUserSessions,
    TOKEN_CONFIG,
    blacklistToken
} = require('../../frontend/js/token');
//const AppError = require('../AppError');


const MFA_TOKEN_CONFIG = {
    expiresIn: '5m',        // 5 minutes for MFA flow
    maxAgeMs: 5 * 60 * 1000,
    cookieName: 'mfa_pending_token'
};
function generateMfaPendingToken(userId, role, name, refreshTokenVersion, mfaCode) {
    const mfaJti = crypto.randomUUID();

    const payload = {
        userId,
        role,
        name,
        refreshTokenVersion,
        mfaCode: crypto.createHash('sha256').update(mfaCode).digest('hex'), // Hash the MFA code
        type: 'mfa_pending',
        jti: mfaJti,
        iat: Math.floor(Date.now() / 1000)
    };

    const token = jwt.sign(payload, process.env.JWT_SECRET, {
        expiresIn: MFA_TOKEN_CONFIG.expiresIn
    });

    return { token, mfaJti };
}

async function validateMfaPendingToken(token) {
    try {
        const payload = jwt.verify(token, process.env.JWT_SECRET);

        // Verify token type
        if (payload.type !== 'mfa_pending') {
            return {
                valid: false,
                reason: 'invalid_token_type',
                payload: null
            };
        }

        // ADD: Only call blacklistToken if it's available
        if (typeof blacklistToken === 'function') {
            try {
                const { isTokenBlacklisted } = require('../../frontend/js/token');
                if (typeof isTokenBlacklisted === 'function' && await isTokenBlacklisted(payload.jti)) {
                    return {
                        valid: false,
                        reason: 'token_blacklisted',
                        payload: null
                    };
                }
            } catch (blacklistError) {
                // Blacklist check failed, but continue validation
                console.warn('⚠️ Blacklist check failed:', blacklistError.message);
            }
        }

        return {
            valid: true,
            payload,
            reason: null
        };

    } catch (error) {
        if (error.name === 'TokenExpiredError') {
            return {
                valid: false,
                reason: 'token_expired',
                payload: null
            };
        }

        return {
            valid: false,
            reason: 'token_invalid',
            payload: null
        };
    }
}

// Secure file storage configuration for restaurant images
const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        const uploadDir = path.join(__dirname, '../../frontend/static/img/restaurants');
        if (!fs.existsSync(uploadDir)) {
            fs.mkdirSync(uploadDir, { recursive: true });
            console.log('📁 Created directory:', uploadDir);
        }
        cb(null, uploadDir);
    },
    filename: (req, file, cb) => {
        const uniqueSuffix = crypto.randomBytes(16).toString('hex');
        const extension = path.extname(file.originalname).toLowerCase();
        const filename = `restaurant-${uniqueSuffix}${extension}`;

        console.log('📄 DEBUG - Generated filename:', filename);
        cb(null, filename);
    }
});

// Enhanced file validation following Node.js best practices
const fileFilter = (req, file, cb) => {
    // Restricted to jpeg, jpg, png only as requested
    const allowedTypes = ['image/jpeg', 'image/jpg', 'image/png'];
    const allowedExtensions = ['.jpg', '.jpeg', '.png'];

    const extension = path.extname(file.originalname).toLowerCase();

    if (allowedTypes.includes(file.mimetype) && allowedExtensions.includes(extension)) {
        cb(null, true);
    } else {
        // Fail fast principle - immediate error for invalid file types
        const error = new Error('Invalid file type. Only JPEG and PNG images allowed.');
        error.isOperational = true;
        error.statusCode = 400;
        cb(error, false);
    }
};

const upload = multer({
    storage: storage,
    fileFilter: fileFilter,
    limits: {
        fileSize: 5 * 1024 * 1024, // 5MB max
        files: 1
    }
});


// Email transporter
const transporter = nodemailer.createTransport({
    service: 'Gmail',
    auth: {
        user: process.env.EMAIL_USER,
        pass: process.env.EMAIL_PASS,
    },
});

class AppError extends Error {
    constructor(message, statusCode, isOperational = true) {
        super(message);
        this.statusCode = statusCode;
        this.isOperational = isOperational;

        Error.captureStackTrace(this, this.constructor);
    }
}

function validatePassword(password, captcha_identifier) {
    if (!password || typeof password !== 'string') {
        if (captcha_identifier){
            recordFailure(captcha_identifier);
            throw new AppError('Password is required and must be a string. .Captcha', 400);
        }
        throw new AppError('Password is required and must be a string', 400);
    }

    const minLength = 8;
    const validation = {
        isValid: password.length >= minLength,
        requirements: {
            minLength: password.length >= minLength
        }
    };

    if (!validation.isValid) {
        throw new AppError('Password does not meet security requirements', 400);
    }

    return validation;
}

// Input sanitization with validation
function sanitizeAndValidate(input, fieldName, route, required = true, captcha_identifier) {
    if (required && (!input || typeof input !== 'string' || input.trim().length === 0)) {
        if (route === 'register' || route === 'signup-owner'){
            if (captcha_identifier){
                recordFailure(captcha_identifier);
                throw new AppError(`${fieldName} is required and cannot be empty. .Captcha`, 400);
            }
        }
        throw new AppError(`${fieldName} is required and cannot be empty`, 400);
    }

    if (input && typeof input === 'string') {
        return input.trim();
    }
    return input;
}


async function verifyCaptchaIfAny(req, res, captcha_identifier) {
    if (shouldShowCaptcha(captcha_identifier)) {
        if (req.body['g-recaptcha-response']){
            return await verifyCaptcha(req.body['g-recaptcha-response'], req.ip);
        } else {
            return false; //user bypassed the recaptcha, redirect back as captcha failed
        }
    }
    // return empty true to not trigger res.redirect captcha=failed
    return true;
}

// POST /login
router.post('/login', loginValidator, handleValidation, async (req, res, next) => {
    try {
        const { email, password } = req.body;
        const captcha_identifier = req.ip || req.body.email;
        if(!await verifyCaptchaIfAny(req, res, captcha_identifier)){
            return res.redirect('/login?error=1&captcha=failed');
        }

        // Failed Scenario : Missing Credentials
        if (!email || !password) {
            recordFailure(captcha_identifier);
            throw new AppError('Email and password are required', 400);
        }

        const user = await db('users')
            .where('email', email.toLowerCase().trim())
            .first();

        // Failed Scenario : User not found
        if (!user) {
            logAuth('login', false, {
                email: email,
                reason: 'user_not_found'
            }, req);
            recordFailure(captcha_identifier);
            if (shouldShowCaptcha(captcha_identifier)){
                return res.redirect('/login?error=1&captcha=true'); // Notify frontend to initiate ReCaptcha
            } else {
                return res.redirect('/login?error=1');
            }
        }

        const isMatch = await argon2.verify(user.password, password);

        if (isMatch) {
            // Generate MFA code
            const mfaCode = crypto.randomInt(100000, 1000000).toString();
            const expires = new Date(Date.now() + 5 * 60 * 1000); // 5 minutes

            // Store MFA code in database
            await db('users')
                .where('user_id', user.user_id)
                .update({ mfa_code: mfaCode, mfa_expires: expires });

            // Send MFA email
            await transporter.sendMail({
                from: `"Kirby Chope" <${process.env.EMAIL_USER}>`,
                to: user.email,
                subject: 'Your Multi-Factor Authentication Code - Kirby Chope',
                html: `<p>Your MFA code is: <b>${mfaCode}</b></p><p>⏱ Expires in 5 minutes.</p>`,
            });

            // Generate MFA pending token
            const { token: mfaPendingToken, mfaJti } = generateMfaPendingToken(
                user.user_id,
                user.role,
                user.name,
                user.refresh_token_version || 0,
                mfaCode
            );

            // Set MFA pending token as HTTP-only cookie
            res.cookie(MFA_TOKEN_CONFIG.cookieName, mfaPendingToken, {
                httpOnly: true,
                secure: process.env.NODE_ENV === 'production',
                sameSite: 'strict',
                maxAge: MFA_TOKEN_CONFIG.maxAgeMs
            });

            // Clear Captcha Attempt Tracking
            resetFailures(captcha_identifier);

            logAuth('login_pending_mfa', true, {
                user_id: user.user_id,
                email: email,
                role: user.role,
                mfa_jti: mfaJti
            }, req);

            return res.redirect('/mfa-verify');
        } else {
            // Failed Scenario : Password Invalid
            logAuth('login', false, {
                email: email,
                user_id: user.user_id,
                reason: 'invalid_password'
            }, req);
            recordFailure(captcha_identifier);
            if (shouldShowCaptcha(captcha_identifier)){
                return res.redirect('/login?error=1&captcha=true'); // Notify frontend to initiate ReCaptcha
            } else {
                return res.redirect('/login?error=1');
            }
        }
    } catch (error) {
        next(error);
    }
});

router.post('/verify-mfa', async (req, res, next) => {
    try {
        const { code } = req.body;
        const mfaPendingToken = req.cookies[MFA_TOKEN_CONFIG.cookieName];

        if (!mfaPendingToken) {
            return res.status(401).json({
                message: 'No MFA session found - please start login again'
            });
        }

        // Validate MFA pending token
        const validation = await validateMfaPendingToken(mfaPendingToken);

        if (!validation.valid) {
            // Clear invalid token
            res.clearCookie(MFA_TOKEN_CONFIG.cookieName, {
                httpOnly: true,
                secure: process.env.NODE_ENV === 'production',
                sameSite: 'strict'
            });

            let errorMessage = 'MFA session expired or invalid - please login again';
            if (validation.reason === 'token_expired') {
                errorMessage = 'MFA session expired - please login again';
            }

            return res.status(401).json({ message: errorMessage });
        }

        const sessionData = validation.payload;

        // Verify MFA code from database
        const user = await db('users')
            .where({ user_id: sessionData.userId })
            .andWhere('mfa_expires', '>', new Date())
            .first();

        if (!user || !user.mfa_code) {
            // Clear token and require fresh login
            res.clearCookie(MFA_TOKEN_CONFIG.cookieName, {
                httpOnly: true,
                secure: process.env.NODE_ENV === 'production',
                sameSite: 'strict'
            });
            return res.status(401).json({
                message: 'MFA code expired - please login again'
            });
        }

        // Hash the provided code for comparison (same method as storage)
        const providedCodeHash = crypto.createHash('sha256').update(code).digest('hex');

        if (sessionData.mfaCode !== providedCodeHash) {
            return res.status(401).json({
                message: 'Invalid MFA code - please try again'
            });
        }

        // Clear MFA data and update activity
        await db('users')
            .where({ user_id: user.user_id })
            .update({
                mfa_code: null,
                mfa_expires: null,
                last_activity: new Date()
            });

        // Clear MFA pending token
        res.clearCookie(MFA_TOKEN_CONFIG.cookieName, {
            httpOnly: true,
            secure: process.env.NODE_ENV === 'production',
            sameSite: 'strict'
        });

        // Optional: Blacklist the consumed MFA token for extra security
        const expiresAt = new Date(sessionData.exp * 1000).toISOString();
        await blacklistToken(sessionData.jti, 'mfa_pending', 'consumed', expiresAt, sessionData.userId);

        // Generate final authentication tokens
        try {
            const tokens = await generateTokenPair(
                user.user_id,
                sessionData.role,
                sessionData.name,
                sessionData.refreshTokenVersion,
                req
            );

            // Set authentication cookies
            res.cookie('access_token', tokens.accessToken, {
                httpOnly: true,
                secure: process.env.NODE_ENV === 'production',
                sameSite: 'strict',
                maxAge: TOKEN_CONFIG.access.maxAgeMs
            });

            res.cookie('refresh_token', tokens.refreshToken, {
                httpOnly: true,
                secure: process.env.NODE_ENV === 'production',
                sameSite: 'strict',
                maxAge: TOKEN_CONFIG.refresh.maxAgeMs
            });

            logAuth('login_success', true, {
                user_id: user.user_id,
                email: user.email,
                role: user.role,
                access_jti: tokens.accessJti,
                refresh_jti: tokens.refreshJti,
                mfa_method: 'email_code'
            }, req);

            // Role-based redirection
            if (user.role === 'admin') {
                return res.redirect('/admin');
            } else if (user.role === 'user') {
                return res.redirect('/');
            } else if (user.role === 'owner') {
                return res.redirect('/resOwner');
            }

        } catch (tokenError) {
            console.error('❌ Token generation error:', tokenError);
            return res.redirect('/login?error=token-generation-failed');
        }

    } catch (err) {
        console.error('❌ MFA verification error:', err);
        next(err);
    }
});

// POST /register for user
router.post('/register', registerValidator, handleValidation, async (req, res, next) => {
    try {

        // Captcha for registration
        const captcha_identifier =  req.ip || req.body.email;
        if(!await verifyCaptchaIfAny(req, res, captcha_identifier)){
            recordFailure(captcha_identifier);
            const errorMessage = 'Invalid Captcha Token, Try Again.';
            if (shouldShowCaptcha(captcha_identifier)) {
                return res.redirect(`/register?error=${encodeURIComponent(errorMessage)}&captcha=true`);
            } else {
                return res.redirect(`/register?error=${encodeURIComponent(errorMessage)}`);
            }
        }

        let { name, email, password, firstname, lastname } = req.body;

        // Sanitize and validate inputs with fail-fast
        try {
            name = sanitizeAndValidate(name, 'Username', 'register', true, captcha_identifier);
            email = sanitizeAndValidate(email, 'Email', 'register', true, captcha_identifier).toLowerCase();
            firstname = sanitizeAndValidate(firstname, 'First name', 'register', true, captcha_identifier);
            lastname = sanitizeAndValidate(lastname, 'Last name', 'register', true, captcha_identifier);
        } catch (validationError) {
            const errorMessage = validationError.message.replace('.Captcha', '');
            if (shouldShowCaptcha(captcha_identifier)) {
                return res.redirect(`/register?error=${encodeURIComponent(errorMessage)}&captcha=true`);
            } else {
                return res.redirect(`/register?error=${encodeURIComponent(errorMessage)}`);
            }
        }

        // Possible Failure Scenario : Password invalid
        try {
            validatePassword(password, captcha_identifier);
        } catch (passwordError) {
            const errorMessage = passwordError.message.replace('.Captcha', '');
            if (shouldShowCaptcha(captcha_identifier)) {
                return res.redirect(`/register?error=${encodeURIComponent(errorMessage)}&captcha=true`);
            } else {
                return res.redirect(`/register?error=${encodeURIComponent(errorMessage)}`);
            }
        }

        // check password not in breach
        if (await isBreachedPassword(password)) {
            logAuth('registration', false, {
                email: email,
                reason: 'breached_password'
            }, req);
            recordFailure(captcha_identifier);
            const errorMessage = 'Chosen password has appeared in a data breach. Please choose another.';
            if (shouldShowCaptcha(captcha_identifier)) {
                return res.redirect(`/register?error=${encodeURIComponent(errorMessage)}&captcha=true`);
            } else {
                return res.redirect(`/register?error=${encodeURIComponent(errorMessage)}`);
            }
        }

        const existingUser = await db('users')
            .select('email')
            .where('email', email)
            .first();

        // Failure Scenario  : Email Exists
        if (existingUser) {
            logAuth('registration', false, {
                email: email,
                reason: 'email_already_exists'
            }, req);
            recordFailure(captcha_identifier);
            const errorMessage = 'Email already registered';
            if (shouldShowCaptcha(captcha_identifier)) {
                // Redirect with both the error and the captcha flag
                return res.redirect(`/register?error=${encodeURIComponent(errorMessage)}&captcha=true`);
            } else {
                // Redirect with just the error
                return res.redirect(`/register?error=${encodeURIComponent(errorMessage)}`);
            }
        }

        const hashedPassword = await argon2.hash(password, {
            type: argon2.argon2id,
            memoryCost: 2 ** 16,
            timeCost: 2,
            parallelism: 2,
            saltLength: 32,
            hashLength: 32
        });

        const [newUser] = await db('users')
            .insert({
                name: name,
                email: email,
                password: hashedPassword,
                role: 'user',
                firstname: firstname,
                lastname: lastname,
                last_activity: new Date(),
                refresh_token_version: 0  // ADDED: Initialize refresh token version
            })
            .returning(['user_id']);

        logAuth('registration', true, {
            user_id: newUser.user_id,
            email: email,
            name: name,
            role: 'user'
        }, req);

        logBusiness('user_created', 'user', {
            user_id: newUser.user_id,
            user_type: 'customer'
        }, req);
        resetFailures(captcha_identifier); // success registration, remove captcha attempt tracking
        res.redirect('/login?success=1');
    } catch (error) {
        // Handle any unexpected errors
        const captcha_identifier = req.ip || req.body.email;
        recordFailure(captcha_identifier);
        const errorMessage = 'Registration failed. Please try again.';
        if (shouldShowCaptcha(captcha_identifier)) {
            return res.redirect(`/register?error=${encodeURIComponent(errorMessage)}&captcha=true`);
        } else {
            return res.redirect(`/register?error=${encodeURIComponent(errorMessage)}`);
        }
    }
});

router.post('/signup-owner', upload.single('image'), async (req, res, next) => {
    try {
        // Captcha for owner restaurant registration
        const captcha_identifier = req.ip || req.body.email;
        const isRetry = req.body.isRetry === 'true';
        if (isRetry) {
            recordFailure(captcha_identifier);
        }
        if(!await verifyCaptchaIfAny(req, res, captcha_identifier)){
            recordFailure(captcha_identifier);
            const errorMessage = 'Invalid Captcha Token, Try Again.';
            if (shouldShowCaptcha(captcha_identifier)) {
                return res.redirect(`/rOwnerReg?error=${encodeURIComponent(errorMessage)}&captcha=true`);
            } else {
                return res.redirect(`/rOwnerReg?error=${encodeURIComponent(errorMessage)}`);
            }
        }

        let {
            ownerName,
            firstname,
            lastname,
            email,
            password,
            confirmPassword,
            storeName,
            address,
            postalCode,
            cuisine,
            location,
            priceRange,
            capacity,
            totalCapacity,
            opening,
            closing,
        } = req.body;

        const imageFile = req.file;

        // Sanitize and validate inputs with fail-fast principle
        ownerName = sanitizeAndValidate(ownerName, 'Owner Username', 'signup-owner');
        firstname = sanitizeAndValidate(firstname, 'First name','signup-owner');
        lastname = sanitizeAndValidate(lastname, 'Last name','signup-owner');
        email = sanitizeAndValidate(email, 'Email','signup-owner').toLowerCase();
        storeName = sanitizeAndValidate(storeName, 'Store name','signup-owner');
        address = sanitizeAndValidate(address, 'Address','signup-owner');
        postalCode = sanitizeAndValidate(postalCode, 'Postal code','signup-owner');
        cuisine = sanitizeAndValidate(cuisine, 'Cuisine','signup-owner');
        location = sanitizeAndValidate(location, 'Location','signup-owner');
        priceRange = sanitizeAndValidate(priceRange, 'Price range','signup-owner');

        // Password validation
        if (password !== confirmPassword) {
            logAuth('owner_registration', false, {
                email: email,
                reason: 'password_mismatch'
            }, req);
            recordFailure(captcha_identifier);
            if (shouldShowCaptcha(captcha_identifier)) {
                return res.redirect('/rOwnerReg?error=' + encodeURIComponent('Passwords do not match') + '&captcha=true');
            } else {
                return res.redirect('/rOwnerReg?error=' + encodeURIComponent('Passwords do not match'));
            }
        }

        // Validate password strength (throws if invalid)
        validatePassword(password, captcha_identifier);

        // check password not in breach
        if (await isBreachedPassword(password)) {
            logAuth('owner_registration', false, {
                email: email,
                reason: 'breached_password'
            }, req);
            throw new AppError('This password has appeared in a data breach. Please choose another.', 400);
        }

        // Check if email already exists BEFORE starting transaction
        const existingUser = await db('users')
            .select('email')
            .where('email', email)
            .first();

        if (existingUser) {
            logAuth('owner_registration', false, {
                email: email,
                reason: 'email_already_exists'
            }, req);
            recordFailure(captcha_identifier);
            if (shouldShowCaptcha(captcha_identifier)) {
                return res.redirect('/rOwnerReg?error=' + encodeURIComponent('Email already registered') + '&captcha=true');
            } else {
                return res.redirect('/rOwnerReg?error=' + encodeURIComponent('Email already registered'));
            }
        }
        // Validate numeric inputs
        const capacityNum = parseInt(capacity);
        const totalCapacityNum = parseInt(totalCapacity);

        if (isNaN(capacityNum) || isNaN(totalCapacityNum)) {
            if (shouldShowCaptcha(capacityNum)) {
                throw new AppError('Capacity values must be valid numbers .Captcha', 400);
            } else {
                throw new AppError('Capacity values must be valid numbers', 400);
            }
        }

        if (capacityNum > totalCapacityNum) {
            if (shouldShowCaptcha(capacityNum)) {
                throw new AppError('Seating capacity cannot exceed total capacity .Captcha', 400);
            } else {
                throw new AppError('Seating capacity cannot exceed total capacity', 400);
            }
        }

        if (capacityNum < 1 || totalCapacityNum < 1) {
            if (shouldShowCaptcha(capacityNum)) {
                throw new AppError('Capacity values must be positive numbers .Captcha', 400);
            } else {
                throw new AppError('Capacity values must be positive numbers', 400);
            }
        }

        // Validate time inputs
        if (!opening || !closing) {
            if (shouldShowCaptcha(capacityNum)) {
                throw new AppError('Opening and closing hours are required .Captcha', 400);
            } else {
                throw new AppError('Opening and closing hours are required', 400);
            }
        }

        // Log the application attempt
        logBusiness('owner_application_submitted', 'restaurant_owner', {
            owner_name: ownerName,
            email: email,
            store_name: storeName,
            cuisine: cuisine,
            location: location,
            capacity: totalCapacityNum,
            has_image: !!imageFile
        }, req);

        // Start a database transaction - FIXED: Include ALL database operations
        const {
            ownerId,
            storeId
        } = await db.transaction(async (trx) => {
            // 1. Create the owner user account with SECURE password hashing
            const hashedPassword = await argon2.hash(password, {
                type: argon2.argon2id,
                memoryCost: 2 ** 16, // 64 MB
                timeCost: 2,
                parallelism: 2,
                hashLength: 32,
                saltLength: 32
            });

            const [newUser] = await trx('users')
                .insert({
                    name: ownerName,
                    email: email,
                    password: hashedPassword,
                    role: 'owner',
                    firstname: firstname,
                    lastname: lastname
                })
                .returning(['user_id']);

            const ownerId = newUser.user_id;

            // 2. Create the restaurant/store entry
            const [newStore] = await trx('stores')
                .insert({
                    storeName: storeName,
                    location: location,
                    cuisine: cuisine,
                    priceRange: priceRange,
                    address: address,
                    postalCode: postalCode,
                    totalCapacity: totalCapacityNum,
                    currentCapacity: capacityNum,
                    opening: opening,
                    closing: closing,
                    owner_id: ownerId,
                    image_filename: imageFile ? imageFile.filename : null,
                    image_alt_text: imageFile ? `${storeName} restaurant image` : null,
                    status: 'pending'
                })
                .returning(['store_id']);

            const storeId = newStore.store_id;

            return {
                ownerId,
                storeId
            };
        });


        // 3. Send notification emails (after successful DB commit)
        try {
            // Admin notification email
            const adminMessage = `
                    New Restaurant Owner Registration - PENDING APPROVAL:

                    👤 Owner Details:
                    Name: ${ownerName} (${firstname} ${lastname})
                    Email: ${email}
                    User ID: ${ownerId}

                    🏪 Restaurant Details:
                    Store Name: ${storeName}
                    Store ID: ${storeId}
                    Address: ${address}
                    Postal Code: ${postalCode}
                    Cuisine: ${cuisine}
                    Location: ${location}
                    Price Range: ${priceRange}
                    Seating Capacity: ${capacityNum}
                    Total Capacity: ${totalCapacityNum}
                    Opening Hours: ${opening} - ${closing}
                    Image: ${imageFile ? `Uploaded (${imageFile.filename})` : 'Not provided'}

                    ⏳ Status: PENDING APPROVAL

                    🔗 Admin Action Required:
                    Please log into the admin dashboard to review and approve/reject this restaurant.
                `;

            await transporter.sendMail({
                from: `"Kirby Chope System" <${process.env.EMAIL_USER}>`,
                to: `<${process.env.EMAIL_USER}>`,
                subject: `New Restaurant Registered: ${storeName}`,
                text: adminMessage,
            });

            // Owner welcome email
            const ownerMessage = `
                    Thank you for submitting your restaurant to Kirby Chope, ${firstname}!

                    Your restaurant application has been received and is currently under review.

                    🏪 Your Restaurant Details:
                    Restaurant Name: ${storeName}
                    Location: ${location}
                    Cuisine: ${cuisine}
                    Address: ${address}

                    ⏳ Current Status: PENDING APPROVAL

                    📋 Next Steps:
                    - Our admin team will review your application within 2-3 business days
                    - You'll receive an email notification once your restaurant is approved
                    - After approval, customers can find and book your restaurant on our platform

                    📊 In the meantime:
                    - You can log into your owner dashboard to view your application status
                    - Prepare for managing reservations once approved

                    Login at: https://www.kirbychope.xyz/login

                    Thank you for choosing Kirby Chope!

                    Best regards,
                    The Kirby Chope Team
                `;

            await transporter.sendMail({
                from: `"Kirby Chope" <${process.env.EMAIL_USER}>`,
                to: email,
                subject: 'Welcome to Kirby Chope - Restaurant Registration Complete',
                text: ownerMessage,
            });
        } catch (emailError) {
            // Log email errors but don't fail the registration
            logSystem('warning', 'Email notification failed but registration succeeded', {
                owner_id: ownerId,
                store_id: storeId,
                email_error: emailError.message
            });
        }

        logAuth('owner_registration', true, {
            user_id: ownerId,
            store_id: storeId,
            email: email,
            owner_name: ownerName,
            store_name: storeName
        }, req);

        logBusiness('restaurant_created', 'restaurant', {
            store_id: storeId,
            owner_id: ownerId,
            store_name: storeName,
            status: 'pending'
        }, req);

        logSystem('info', 'Owner application processed successfully', {
            owner_id: ownerId,
            store_id: storeId,
            owner_name: ownerName,
            email: email,
            store_name: storeName
        });
        resetFailures(captcha_identifier) //Success scenario, clear captcha tracker
        res.redirect('/rOwnerReg?success=1');

    }
    catch (err) {
        // Clean up uploaded file if error occurred
        if (req.file && fs.existsSync(req.file.path)) {
            try {
                fs.unlinkSync(req.file.path);
            } catch (fileErr) {
                console.error('File cleanup error:', fileErr);
            }
        }
        logSystem('error', 'Failed to process owner application', {
            owner_name: req.body.ownerName,
            email: req.body.email,
            store_name: req.body.storeName,
            error: err.message,
            stack: err.stack
        });
        const captcha_identifier = req.ip;
        recordFailure(captcha_identifier);

        const errorMessage = 'Registration failed. Please try again.';
        if (shouldShowCaptcha(captcha_identifier)) {
            return res.redirect(`/rOwnerReg?error=${encodeURIComponent(errorMessage)}&captcha=true`);
        } else {
            return res.redirect(`/rOwnerReg?error=${encodeURIComponent(errorMessage)}`);
        }
    }
});

router.post('/logout', async (req, res) => {
    try {
        const accessToken = req.cookies.access_token;
        const refreshToken = req.cookies.refresh_token;

        await logoutUser(accessToken, refreshToken, req, res);

        logAuth('logout', true, {
            method: 'user_initiated',
            ip: req.ip
        }, req);

    } catch (error) {
        console.error('❌ Logout error:', error);
        // Still clear cookies and redirect even if cleanup fails
        res.clearCookie('access_token');
        res.clearCookie('refresh_token');
        res.redirect('/');
    }
});

router.get('/logout', async (req, res) => {
    try {
        const accessToken = req.cookies.access_token;
        const refreshToken = req.cookies.refresh_token;

        await logoutUser(accessToken, refreshToken, req, res);

    } catch (error) {
        console.error('❌ Logout error:', error);
        res.clearCookie('access_token');
        res.clearCookie('refresh_token');
        res.redirect('/');
    }
});

router.post('/admin/revoke-user-sessions', async (req, res) => {
    try {
        const { userId, reason } = req.body;

        if (req.user.role !== 'admin') return res.status(403).json({error: 'Admin only'});

        const success = await revokeAllUserSessions(userId, reason || 'admin_revocation');

        if (success) {
            logSecurity('admin_revoked_user_sessions', 'high', {
                target_user_id: userId,
                admin_user_id: req.user?.userId,
                reason: reason
            }, req);

            res.json({
                success: true,
                message: 'All user sessions revoked successfully'
            });
        } else {
            res.status(500).json({
                success: false,
                message: 'Failed to revoke user sessions'
            });
        }
    } catch (error) {
        console.error('❌ Error in admin session revocation:', error);
        res.status(500).json({
            success: false,
            message: 'Server error during session revocation'
        });
    }
});

router.use((err, req, res, next) => {
    // Log error details
    logSystem('error', 'Request error occurred', {
        message: err.message,
        stack: err.stack,
        url: req.url,
        method: req.method,
        ip: req.ip,
        userAgent: req.get('User-Agent')
    });

    // Handle operational errors with proper error messages
    if (err.isOperational) {
        if (req.originalUrl.includes('/signup-owner')) {
            return res.redirect(`/rOwnerReg?error=${encodeURIComponent(err.message)}`);
        } else if (req.originalUrl.includes('/register')) {
            return res.redirect(`/register?error=${encodeURIComponent(err.message)}`);
        } else if (req.originalUrl.includes('/login')) {
            return res.redirect(`/login?error=${encodeURIComponent('Invalid email or password')}`);
        }
        return res.status(err.statusCode || 400).json({ error: err.message });
    }

    console.error('Unexpected error:', err);

    if (req.originalUrl.includes('/signup-owner')) {
        return res.redirect(`/rOwnerReg?error=${encodeURIComponent('Registration failed. Please try again.')}`);
    } else if (req.originalUrl.includes('/register')) {
        return res.redirect(`/register?error=${encodeURIComponent('Registration failed. Please try again.')}`);
    } else if (req.originalUrl.includes('/login')) {
        return res.redirect(`/login?error=${encodeURIComponent('Login failed. Please try again.')}`);
    }

    res.status(500).json({ error: 'Internal server error' });
});

// =============================================
// Password Reset Request (move from server.js)
// =============================================

router.post('/request-reset', async (req, res) => {
    try {
        // ✅ XSS Protection: Sanitize email input
        const email = sanitizeAndValidate(req.body.email, 'Email','request-reset');

        if (!email) {
            return res.status(400).json({ message: 'Email is required' });
        }

        // ✅ Email format validation
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        if (!emailRegex.test(email)) {
            return res.status(400).json({ message: 'Invalid email format' });
        }

        const user = await db('users')
            .where('email', email.toLowerCase().trim())
            .first();

        if (!user) {
            // Don't reveal if email exists (security best practice)
            logAuth('password_reset_request', false, {
                email: email,
                reason: 'email_not_found'
            }, req);

            return res.status(200).json({
                message: 'If the email exists, a reset link has been sent.'
            });
        }

        const token = crypto.randomBytes(32).toString('hex');
        const expires = new Date(Date.now() + 1800_000);

        await db('users').where('email', email).update({
                reset_token: token,
                reset_token_expires: expires
            });

        const sanitizedEmail = sanitizeForEmail(email);
        const resetLink = `https://kirbychope.xyz/reset-password?token=${token}`;

        try {
            await transporter.sendMail({
                from: `"Kirby Chope" <${process.env.EMAIL_USER}>`,
                to: email,
                subject: 'Password Reset Request - Kirby Chope',
                html: `
                    <h2>Password Reset Request</h2>
                    <p>You requested a password reset for your Kirby Chope account.</p>
                    <p>Click the link below to reset your password:</p>
                    <a href="${resetLink}" style="background-color: #fc6c3f; color: white; padding: 10px 20px; text-decoration: none; border-radius: 5px;">Reset Password</a>
                    <p>This link will expire in 30 minutes.</p>
                    <p>If you didn't request this, please ignore this email.</p>
                `,
            });

            logAuth('password_reset_request', true, {
                user_id: user.user_id,
                email: sanitizedEmail, // ✅ Sanitized for logs
                token_expires: expires
            }, req);

            logSecurity('password_reset_requested', 'low', {
                user_id: user.user_id,
                ip: req.ip,
                user_agent: req.get('User-Agent')
            }, req);

            console.log(`Password reset email sent to: ${sanitizedEmail}`);
            res.status(200).json({
                message: 'If the email exists, a reset link has been sent.'
            });

        } catch (emailError) {
            console.error('Failed to send email:', emailError);

            logSystem('error', 'Password reset email failed', {
                user_id: user.user_id,
                error: emailError.message
            });

            // Still return success to not reveal email existence
            res.status(200).json({
                message: 'If the email exists, a reset link has been sent.'
            });
        }

    } catch (err) {
        console.error('Password reset request error:', err);

        logSystem('error', 'Password reset request failed', {
            error: err.message,
            ip: req.ip,
            user_agent: req.get('User-Agent')
        });

        res.status(500).json({ message: 'Server error' });
    }
});

// =============================================
// Password Reset Completion (move from server.js)
// =============================================

router.put('/reset-password', async (req, res) => {
    try {
        const { token: rawToken, newPassword } = req.body;

        if (!rawToken || !newPassword) {
            return res.status(400).json({
                message: 'Missing token or new password'
            });
        }

        const token = rawToken.trim();
        if (!/^[a-f0-9]{64}$/i.test(token)) {
            return res.status(400).json({
                message: 'Invalid token format'
            });
        }

        const user = await db('users')
            .where('reset_token', token)
            .where('reset_token_expires', '>', db.fn.now())
            .first();

        if (!user) {
            logSecurity('invalid_reset_token_attempt', 'medium', {
                token_prefix: token.substring(0, 8),
                ip: req.ip,
                user_agent: req.get('User-Agent')
            }, req);

            return res.status(400).json({
                message: 'Invalid or expired token'
            });
        }

        if (!newPassword || typeof newPassword !== 'string') {
            return res.status(400).json({
                message: 'Password must be a valid string'
            });
        }

        if (newPassword.length < 8) {
            return res.status(400).json({
                message: 'Password must be at least 8 characters long'
            });
        }

        if (newPassword.length > 64) {
            return res.status(400).json({
                message: 'Password must be less than 64 characters long'
            });
        }

        if (await isBreachedPassword(newPassword)) {
            logSecurity('breached_password_attempt', 'medium', {
                user_id: user.user_id,
                method: 'password_reset',
                ip: req.ip
            }, req);

            return res.status(400).json({
                message: 'Password has been flagged in breach databases. Please choose another password.'
            });
        }

        const hashedPassword = await argon2.hash(newPassword, {
            type: argon2.argon2id,
            memoryCost: 2 ** 16,  // 64 MB
            timeCost: 2,
            parallelism: 2,
            saltLength: 32,
            hashLength: 32
        });

        await db('users')
            .where('reset_token', token)
            .update({
                password: hashedPassword,
                reset_token: null,
                reset_token_expires: null,
                refresh_token_version: db.raw('refresh_token_version + 1'),
                last_activity: new Date()
            });

        logAuth('password_reset_completed', true, {
            user_id: user.user_id,
            email: user.email,
            method: 'email_token'
        }, req);

        logSecurity('password_changed', 'medium', {
            user_id: user.user_id,
            change_method: 'reset_token',
            previous_login_invalidated: true,
            ip: req.ip,
            user_agent: req.get('User-Agent')
        }, req);

        try {
            if (global.redisHelpers && global.redisHelpers.isAvailable()) {
                const userSessionsKey = `user_sessions:${user.user_id}`;
                const activeSessions = await global.redisClient.sMembers(userSessionsKey);
                for (const sessionJti of activeSessions) {
                    await global.redisClient.del(`session:${sessionJti}`);
                }
                await global.redisClient.del(userSessionsKey);
                await global.redisClient.del(`activity:${user.user_id}`);
            }
        } catch (redisError) {
            console.error('Redis cleanup error during password reset:', redisError);
        }

        res.status(200).json({
            message: 'Password updated successfully'
        });

    } catch (err) {
        console.error('Reset password error:', err);

        logSystem('error', 'Password reset completion failed', {
            error: err.message,
            stack: err.stack,
            ip: req.ip,
            user_agent: req.get('User-Agent')
        });

        res.status(500).json({ message: 'Server error' });
    }
});


module.exports = router;
module.exports.generateMfaPendingToken = generateMfaPendingToken;
module.exports.validateMfaPendingToken = validateMfaPendingToken;
module.exports.MFA_TOKEN_CONFIG = MFA_TOKEN_CONFIG;

