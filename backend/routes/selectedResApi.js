const db = require('../../db');
const express = require('express');
const router = express.Router();
const cron = require('node-cron');
const nodemailer = require('nodemailer');
const { authenticateToken, requireUser } = require('../../frontend/js/token');
const { createRateLimiter, encodeHTML, sanitizeForEmail } = require('../middleware/sanitization');
const { fieldLevelAccess } = require('../middleware/fieldAccessControl');

const transporter = nodemailer.createTransport({
    service: 'Gmail',
    auth: {
        user: process.env.EMAIL_USER,
        pass: process.env.EMAIL_PASS,
    },
});

// SECURITY: Validate and generate secure image URLs
function validateAndGenerateImageUrl(imageFilename) {
    if (!imageFilename || typeof imageFilename !== 'string') {
        return '/static/img/restaurants/no-image.png';
    }

    // SECURITY: Validate filename format to prevent directory traversal
    const safeFilenameRegex = /^[a-zA-Z0-9_-]+\.(jpg|jpeg|png)$/i;
    if (!safeFilenameRegex.test(imageFilename)) {
        console.warn('Invalid image filename detected:', imageFilename);
        return '/static/img/restaurants/no-image.png';
    }

    // SECURITY: Ensure filename doesn't contain path traversal attempts
    if (imageFilename.includes('..') || imageFilename.includes('/') || imageFilename.includes('\\')) {
        console.warn('Path traversal attempt detected:', imageFilename);
        return '/static/img/restaurants/no-image.png';
    }

    return `/static/img/restaurants/${imageFilename}`;
}

function getCurrentSGTDate() {
    const now = new Date();

    const formatter = new Intl.DateTimeFormat('en-US', {
        timeZone: 'Asia/Singapore',
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
        hour12: false,
    });

    const parts = formatter.formatToParts(now);
    const map = Object.fromEntries(parts.map(p => [p.type, p.value]));

    // Manually construct the date in local time
    return new Date(
        parseInt(map.year),
        parseInt(map.month) - 1,
        parseInt(map.day),
        parseInt(map.hour) - 8,
        parseInt(map.minute),
        parseInt(map.second)
    );
}
// SECURITY: Sanitize alt text to prevent XSS
function sanitizeAltText(altText, storeName) {
    if (!altText || typeof altText !== 'string') {
        return `${sanitizeString(storeName || 'Unknown Restaurant')} restaurant image`;
    }

    return sanitizeString(altText.substring(0, 100)); // Limit length
}

// SECURITY: General string sanitization
function sanitizeString(str) {
    if (!str || typeof str !== 'string') {
        return '';
    }

    return str
        .replace(/[<>\"'&]/g, '') // Remove potentially dangerous characters
        .trim()
        .substring(0, 255); // Limit length
}

const {
    reserveValidator,
    updateReservationValidator,
    reviewValidator
} = require('../middleware/validators');
const handleValidation = require('../middleware/handleHybridValidation');
const {
    decodeHtmlEntities
} = require('../middleware/htmlDecoder');
const {
    debugDecode
} = require('../middleware/htmlDecoder');

// Route to display data
router.get('/display_specific_store', async (req, res) => {
    try {
        const {
            name,
            location,
            reservationid
        } = req.query;

        if (!name || !location) {
            return res.status(400).json({
                error: 'Missing required parameters',
                required: ['name', 'location']
            });
        }

        // SECURITY: Validate input lengths
        if (name.length > 100 || location.length > 100) {
            return res.status(400).json({
                error: 'Parameter length exceeds maximum allowed'
            });
        }

        let result;

        if (reservationid) {
            // RESERVATION-SPECIFIC VIEW: Requires authentication
            const accessToken = req.cookies.access_token;
            if (!accessToken) {
                return res.status(401).json({
                    error: 'Authentication required to view reservation details'
                });
            }

            // Validate access token
            const { validateAccessToken } = require('../../frontend/js/token');
            const validation = await validateAccessToken(accessToken);

            if (!validation.valid) {
                return res.status(401).json({
                    error: 'Invalid or expired token'
                });
            }

            const reservationIdNum = parseInt(reservationid);
            if (isNaN(reservationIdNum)) {
                return res.status(400).json({
                    error: 'Invalid reservation ID format'
                });
            }

            const loggedInUserId = validation.payload.userId;

            result = await db('stores as s')
                .innerJoin('reservations as r', 'r.store_id', 's.store_id')
                .select([
                    's.store_id',
                    's.storeName',
                    's.image_filename',
                    's.image_alt_text',
                    's.cuisine',
                    's.location',
                    's.priceRange',
                    's.address',
                    's.postalCode',
                    's.opening',
                    's.closing',
                    's.currentCapacity',
                    's.totalCapacity',
                    'r.reservation_id',
                    'r.noOfGuest',
                    'r.reservationDate',
                    'r.reservationTime'
                ])
                .where('s.storeName', name)
                .andWhere('s.location', location)
                .andWhere('r.reservation_id', reservationIdNum)
                .andWhere('r.user_id', loggedInUserId) // SECURITY: Only user's own reservations
                .andWhere('s.status', 'approved');

            // Log potential IDOR attempts if no results
            if (result.length === 0) {
                console.warn(`Potential IDOR: User ${loggedInUserId} tried to access reservation ${reservationIdNum} with store ${name}/${location}`);

                const logger = require('../logger');
                logger.logSecurity('idor_attempt', 'medium', {
                    attempted_user_id: loggedInUserId,
                    target_reservation_id: reservationIdNum,
                    store_name: name,
                    store_location: location,
                    ip: req.ip,
                    endpoint: '/display_specific_store'
                }, req);
            }
        } else {
            // PUBLIC STORE INFORMATION: No authentication required
            result = await db('stores')
                .select([
                    'store_id',
                    'storeName',
                    'image_filename',
                    'image_alt_text',
                    'cuisine',
                    'location',
                    'priceRange',
                    'address',
                    'postalCode',
                    'opening',
                    'closing',
                    'currentCapacity',
                    'totalCapacity'
                ])
                .where('storeName', name)
                .andWhere('location', location)
                .andWhere('status', 'approved');
        }

        if (result.length === 0) {
            return res.status(404).json({
                error: reservationid ? 'Reservation not found or access denied' : 'Restaurant not found'
            });
        }

        const transformedStores = result.map(store => ({
            store_id: store.store_id,
            storeName: store.storeName,
            location: store.location,
            cuisine: store.cuisine,
            priceRange: store.priceRange,
            address: store.address,
            postalCode: store.postalCode,
            opening: store.opening,
            closing: store.closing,
            currentCapacity: store.currentCapacity,
            totalCapacity: store.totalCapacity,

            // Include reservation data if available
            ...(store.reservation_id && {
                reservation_id: store.reservation_id,
                noOfGuest: store.noOfGuest,
                reservationDate: store.reservationDate,
                reservationTime: store.reservationTime
            }),

            // Generate secure image URLs
            imageUrl: validateAndGenerateImageUrl(store.image_filename),
            altText: sanitizeAltText(store.image_alt_text, store.storeName)
        }));
        res.json(transformedStores);

    } catch (err) {
        console.error('Error querying database:', err);

        // Log the error
        const logger = require('../logger');
        logger.logSystem('error', 'Failed to fetch store data', {
            error: err.message,
            stack: err.stack,
            query_params: req.query
        });

        res.status(500).json({
            error: 'Failed to fetch data'
        });
    }
});

// Route to get reviews for the selected shop
router.get('/display_reviews', async (req, res) => {
    try {
        const storeid = req.query.storeid;

        const storeIdNum = parseInt(storeid);
        if (isNaN(storeIdNum) || storeIdNum <= 0) {
            return res.status(400).json({
                error: 'Invalid store ID'
            });
        }

        const storeCheck = await db('stores')
            .select(1)
            .where('store_id', storeIdNum)
            .andWhere('status', 'approved')
            .first();

        if (!storeCheck) {
            return res.status(404).json({
                error: 'Restaurant not found or not available'
            });
        }

        const reviews = await db('reviews')
            .select('*')
            .where('store_id', storeIdNum);

        // Decode review descriptions
        const decoded = reviews.map(r => {
            console.log('[RAW FROM DB]', r.description);
            const clean = debugDecode(r.description || '');
            return {
                ...r,
                description: clean
            };
        });

        res.json(decoded);
    } catch (err) {
        console.error('Error querying database:', err);
        res.status(500).json({
            error: 'Failed to fetch data'
        });
    }
});

// add reservation into reserve table
router.post('/reserve', reserveValidator, handleValidation, async (req, res) => {
    const trx = await db.transaction();

    try {
        const {
            pax,
            time,
            date,
            userid,
            storeid,
            firstname,
            lastname,
            specialrequest,
            storename,
            adultpax,
            childpax
        } = req.body;

        // 1. Cooldown check (unchanged)
        const cooldownCheck = await trx('reservations')
            .select(1)
            .where('user_id', userid)
            .where('created_at', '>', trx.raw("NOW() - INTERVAL '1 hour'"))
            .first();

        if (cooldownCheck) {
            await trx.rollback();
            return res.status(429).json({
                message: 'You can only make one reservation per hour. Please try again later.'
            });
        }

        // 2. Check existing reservation (unchanged)
        const existingReservation = await trx('reservations')
            .select('*')
            .where('store_id', storeid)
            .andWhere('user_id', userid)
            .andWhere('reservationTime', time)
            .andWhere('reservationDate', date)
            .andWhere('status', 'Confirmed')
            .first();

        if (existingReservation) {
            await trx.rollback();
            return res.status(400).json({
                message: "You already have a reservation for that time."
            });
        }

        // 3. ATOMIC: Lock store row and check/update capacity
        const storeDetails = await trx('stores')
            .select('currentCapacity', 'address')
            .where('store_id', storeid)
            .forUpdate() // ROW LOCK - prevents other transactions from modifying
            .first();

        if (parseInt(pax) > storeDetails.currentCapacity) {
            await trx.rollback();
            return res.status(400).json({
                message: `Reservation exceeds available capacity of ${encodeHTML(storeDetails.currentCapacity)}.`
            });
        }

        // 4. Insert reservation and update capacity atomically
        await trx('reservations').insert({
            user_id: userid,
            store_id: storeid,
            noOfGuest: pax,
            reservationTime: time,
            reservationDate: date,
            specialRequest: specialrequest,
            first_name: firstname,
            last_name: lastname,
            childPax: childpax,
            adultPax: adultpax,
            created_at: trx.fn.now()
        });

        await trx('stores')
            .where('store_id', storeid)
            .decrement('currentCapacity', pax);

        await trx.commit();

        // Send email after successful transaction (outside transaction for performance)
        const user = await db('users')
            .select('name', 'email')
            .where('user_id', userid)
            .first();

        await transporter.sendMail({
            from: `"Kirby Chope" <${sanitizeForEmail(process.env.EMAIL_USER)}>`,
            to: user.email,
            subject: `Reservation Confirmed at ${sanitizeForEmail(storename)}`,
            html: `
                <p>Hello ${sanitizeForEmail(user.name)},</p>
                <p>Your reservation with ${sanitizeForEmail(storename)} is <strong>confirmed</strong>. See below for more details.</p>
                <h4>Reservation Details:</h4>
                <ul>
                  <li><strong>👤 First Name:</strong> ${sanitizeForEmail(firstname)}</li>
                  <li><strong>👤 Last Name:</strong> ${sanitizeForEmail(lastname)}</li>
                  <li><strong>🏪 Restaurant:</strong> ${sanitizeForEmail(storename)}</li>
                  <li><strong>📍 Location:</strong> ${sanitizeForEmail(storeDetails.address)}</li>
                  <li><strong>📅 Date:</strong> ${date}</li>
                  <li><strong>🕒 Time:</strong> ${time}</li>
                  <li><strong>👥 Number of Guests:</strong> ${pax}
                    <ul>
                      <li><strong>Number of Adults:</strong> ${adultpax}</li>
                      <li><strong>Number of Child:</strong> ${childpax}</li>
                    </ul>
                  </li>
                  ${specialrequest ? `<li><strong>📢 Special Request:</strong> ${sanitizeForEmail(specialrequest)}</li>` : ''}
                </ul>
                <p>Thank you!</p>
                <p>Kirby Chope</p>
            `
        });

        res.json({
            message: 'Reservation created successfully'
        });

    } catch (err) {
        await trx.rollback();
        console.error('Error creating reservation:', err);
        res.status(500).json({
            error: 'Failed to create reservation'
        });
    }
});


// Update reservation
router.post('/update_reservation',
    authenticateToken,
    requireUser,
    fieldLevelAccess([
        'pax', 'time', 'date', 'firstname', 'lastname', 'specialrequest',
        'reservationid', 'adultpax', 'childpax', 'storename', 'userid'
    ]),
    updateReservationValidator,
    handleValidation,
    async (req, res) => {
    const trx = await db.transaction();


    try {
        const {
            pax,
            time,
            date,
            firstname,
            lastname,
            specialrequest,
            reservationid,
            adultpax,
            childpax,
            storename,
            userid
        } = req.body;

        const loggedInUserId = req.user.userId;
        if (parseInt(userid) !== loggedInUserId) {
            await trx.rollback();
            return res.status(403).json({
                message: 'Access denied. You can only update your own reservations.'
            });
        }

        // 1. Get original reservation with lock
        const originalRes = await trx('reservations')
            .select('store_id', 'noOfGuest', 'reservationDate', 'reservationTime', 'specialRequest', 'status')
            .where('reservation_id', reservationid)
            .forUpdate() // LOCK reservation row
            .first();

        if (!originalRes || originalRes.status === 'Cancelled') {
            await trx.rollback();
            return res.status(404).json({
                message: 'Reservation not found or cancelled'
            });
        }

        // 2. Check edit limit (using DB timezone)
        const editCount = await trx('reservation_edits')
            .count('* as count')
            .where('user_id', userid)
            .andWhere('reservation_id', reservationid)
            .andWhereRaw("DATE(edited_at AT TIME ZONE 'Asia/Singapore') = DATE(NOW() AT TIME ZONE 'Asia/Singapore')")
            .first();

        if (parseInt(editCount.count) >= 3) {
            await trx.rollback();
            return res.status(429).json({
                message: "Edit limit reached. You can only update this reservation 3 times per day."
            });
        }

        // 3. ATOMIC: Lock store and update capacity
        const capacityInfo = await trx('stores')
            .select('totalCapacity', 'currentCapacity', 'address')
            .where('store_id', originalRes.store_id)
            .forUpdate() // LOCK store row
            .first();

        // Restore old pax
        await trx('stores')
            .where('store_id', originalRes.store_id)
            .increment('currentCapacity', originalRes.noOfGuest);

        // Check new capacity (after restoration)
        const newCurrentCapacity = capacityInfo.currentCapacity + originalRes.noOfGuest;
        if (parseInt(pax) > newCurrentCapacity) {
            await trx.rollback();
            return res.status(400).json({
                message: `Reservation exceeds available capacity of ${newCurrentCapacity}.`
            });
        }

        // Deduct new pax
        await trx('stores')
            .where('store_id', originalRes.store_id)
            .decrement('currentCapacity', pax);

        // 4. Update reservation and log edit
        await trx('reservations')
            .where('reservation_id', reservationid)
            .andWhere('user_id', loggedInUserId)
            .update({
                noOfGuest: pax,
                reservationDate: date,
                reservationTime: time,
                specialRequest: specialrequest,
                adultPax: adultpax,
                childPax: childpax,
                first_name: firstname,
                last_name: lastname
            });

        await trx('reservation_edits').insert({
            user_id: userid,
            reservation_id: reservationid,
            edited_at: trx.fn.now()
        });

        await trx.commit();

        // Send email after successful transaction
        const user = await db('users')
            .select('name', 'email')
            .where('user_id', userid)
            .first();
        // Step 8: Send email notification
        await transporter.sendMail({
            from: `"Kirby Chope" <${sanitizeForEmail(process.env.EMAIL_USER)}>`,
            to: user.email,
            subject: `Modification of Reservation at ${sanitizeForEmail(storename)}`,
            html: `
              <p>Hello ${sanitizeForEmail(user.name)},</p>
              <p>Your reservation with ${sanitizeForEmail(storename)} has been successfully <strong>updated</strong>. See below for updated details.</p>
              <h4>Updated Reservation Details:</h4>
              <ul>
                <li><strong>👤 First Name:</strong> ${sanitizeForEmail(firstname)}</li>
                <li><strong>👤 Last Name:</strong> ${sanitizeForEmail(lastname)}</li>
                <li><strong>🏪 Restaurant:</strong> ${sanitizeForEmail(storename)}</li>
                <li><strong>📍 Location:</strong> ${sanitizeForEmail(capacityInfo.address)}</li>
                <li><strong>📅 Date:</strong> ${date}</li>
                <li><strong>🕒 Time:</strong> ${time}</li>
                <li><strong>👥 Number of Guests:</strong> ${pax}
                  <ul>
                    <li><strong>Number of Adults:</strong> ${adultpax}</li>
                    <li><strong>Number of Child:</strong> ${childpax}</li>
                  </ul>
                </li>
                ${specialrequest ? `<li><strong>📢 Special Request:</strong> ${sanitizeForEmail(specialrequest)}</li>` : ''}
              </ul>
              <p>Thank you!</p>
              <p>Kirby Chope</p>
            `
        });

        res.status(200).json({
            message: 'Reservation updated successfully.'
        });

    } catch (err) {
        console.error('Error querying database:', err);
        res.status(500).json({
            error: 'Failed to update reservation.'
        });
    }
});

cron.schedule('*/10 * * * *', async () => {
    console.log('Running scheduled tasks...', new Date());

    try {
        const completedReservations = await db('reservations')
            .select('reservation_id', 'noOfGuest', 'store_id')
            .whereRaw("NOW() >= (\"reservationDate\"::timestamp + \"reservationTime\"::interval + INTERVAL '1 hour')")
            .andWhere('status', 'Confirmed');

        if (completedReservations.length > 0) {
            // Process each reservation update as an atomic transaction
            const updatePromises = completedReservations.map(res => {
                return db.transaction(async trx => {
                    // 1. Update the reservation status
                    await trx('reservations')
                        .where('reservation_id', res.reservation_id)
                        .update({
                            status: 'Completed'
                        });

                    // 2. Safely return capacity to the store
                    await trx('stores')
                        .where('store_id', res.store_id)
                        .update({
                            currentCapacity: db.raw('LEAST("currentCapacity" + ?, "totalCapacity")', [res.noOfGuest])
                        });
                }).catch(err => {
                    // Log error for a specific reservation but don't crash the whole job
                    console.error(`Failed to process completed reservation ${res.reservation_id}:`, err);
                });
            });

            await Promise.all(updatePromises);
            console.log(`Processed ${completedReservations.length} completed reservations.`);
        }
    } catch (err) {
        console.error('Error fetching completed reservations:', err);
    }

    // --- Task 2: Send reminder emails ---
    try {
        const remindersNeeded = await db('reservations as r')
            .join('users as u', 'r.user_id', 'u.user_id')
            .join('stores as s', 'r.store_id', 's.store_id')
            .select(
                'r.reservation_id', 'r.first_name', 'r.last_name', 'r.noOfGuest',
                'r.reservationTime', 'r.adultPax', 'r.childPax', 'r.specialRequest',
                'u.email as user_email', 'u.name as user_name',
                's.storeName as store_name', 's.address as store_address',
                db.raw('r."reservationDate"::TEXT AS date_text')
            )
            .whereRaw(`
                (r."reservationDate"::timestamp + r."reservationTime"::interval)
                BETWEEN
                    ((NOW() + INTERVAL '24 hour') AT TIME ZONE 'Asia/Singapore') AND
                    ((NOW() + INTERVAL '25 hour') AT TIME ZONE 'Asia/Singapore')
            `)
            .andWhere('r.status', 'Confirmed')
            .andWhere('r.is_reminded', false);

        if (remindersNeeded.length > 0) {
            const reminderPromises = remindersNeeded.map(r => {
                // Wrap each email sending in its own async function to handle errors individually
                return (async () => {
                    try {
                        await transporter.sendMail({
                            from: `"Kirby Chope" <${sanitizeForEmail(process.env.EMAIL_USER)}>`,
                            to: r.user_email,
                            subject: `Reservation Reminder at ${sanitizeForEmail(r.store_name)}`,
                            html: `
                                <p>Hello ${sanitizeForEmail(r.user_name)},</p>
                                <p>You have an upcoming reservation at ${sanitizeForEmail(r.store_name)}. See below for more details.</p>
                                <h4>Reservation Details:</h4>
                                <ul>
                                    <li><strong>👤 First Name:</strong> ${sanitizeForEmail(r.first_name)}</li>
                                    <li><strong>👤 Last Name:</strong> ${sanitizeForEmail(r.last_name)}</li>
                                    <li><strong>🏪 Restaurant:</strong> ${sanitizeForEmail(r.store_name)}</li>
                                    <li><strong>📍 Location:</strong> ${sanitizeForEmail(r.store_address)}</li>
                                    <li><strong>📅 Date:</strong> ${r.date_text}</li>
                                    <li><strong>🕒 Time:</strong> ${r.reservationTime}</li>
                                    <li><strong>👥 Number of Guests:</strong> ${r.noOfGuest}
                                        <ul>
                                            <li><strong>Number of Adults:</strong> ${r.adultPax}</li>
                                            <li><strong>Number of Child:</strong> ${r.childPax}</li>
                                        </ul>
                                    </li>
                                    ${r.specialRequest ? `<li><strong>📢 Special Request:</strong> ${sanitizeForEmail(r.specialRequest)}</li>` : ''}
                                </ul>
                                <p>Thank you!</p>
                                <p>Kirby Chope</p>
                            `
                        });
                        // Only mark as reminded if the email was sent successfully
                        return r.reservation_id;
                    } catch (err) {
                        console.error(`Failed to send reminder for reservation ${r.reservation_id}:`, err);
                        return null; // Indicate failure
                    }
                })();
            });

            const successfulIds = (await Promise.all(reminderPromises)).filter(id => id !== null);

            if (successfulIds.length > 0) {
                // Update all successful reminders in a single query
                await db('reservations')
                    .whereIn('reservation_id', successfulIds)
                    .update({
                        is_reminded: true
                    });
                console.log(`Sent ${successfulIds.length} reminder emails successfully.`);
            }
        }
    } catch (err) {
        console.error('Error fetching or processing reminders:', err);
    }
});

// query reservations between certain timing
router.get('/timeslots', async (req, res) => {
    try {
        const date = req.query.date;

        const reservations = await db('reservations')
            .select('*')
            .where('reservationDate', date)
            .andWhere('status', 'Confirmed');

        res.json(reservations);
    } catch (err) {
        console.error('Error querying database:', err);
        res.status(500).json({
            error: 'Failed to fetch data'
        });
    }
});

// getting specific reservation by id for editing reservation details
router.get('/get_reservation_by_id', authenticateToken, requireUser, async (req, res) => {
    try {
        const reservationid = req.query.reservationid;
        const loggedInUserId = req.user.userId; // FIXED: Now properly defined

        // Validate reservation ID
        const reservationIdNum = parseInt(reservationid);
        if (isNaN(reservationIdNum) || reservationIdNum <= 0) {
            return res.status(400).json({
                error: 'Invalid reservation ID format'
            });
        }

        const reservation = await db('reservations as r')
            .select([
                'r.reservation_id',
                'r.store_id',
                'r.user_id', // Include for verification
                'r.noOfGuest',
                db.raw('r."reservationDate"::TEXT'),
                'r.reservationTime',
                'r.specialRequest',
                'r.status',
                'r.adultPax',
                'r.childPax',
                'r.first_name',
                'r.last_name'
            ])
            .where('reservation_id', reservationIdNum)
            .first();

        if (!reservation) {
            return res.status(404).json({
                error: 'Reservation not found'
            });
        }

        // SECURITY: Check ownership
        if (reservation.user_id !== loggedInUserId) {
            // Log the attempted IDOR attack
            console.warn(`IDOR ATTEMPT: User ${loggedInUserId} tried to access reservation ${reservationIdNum} owned by user ${reservation.user_id}`);

            const logger = require('../logger');
            logger.logSecurity('idor_attempt', 'high', {
                attempted_user_id: loggedInUserId,
                target_reservation_id: reservationIdNum,
                actual_owner_id: reservation.user_id,
                ip: req.ip,
                user_agent: req.get('User-Agent'),
                endpoint: '/get_reservation_by_id'
            }, req);

            return res.status(403).json({
                error: 'Access denied. You can only access your own reservations.'
            });
        }

        // Remove user_id from response and decode special request
        const { user_id, ...safeReservation } = reservation;
        safeReservation.specialRequest = debugDecode(safeReservation.specialRequest || '');

        res.json([safeReservation]);

    } catch (err) {
        console.error('Error querying database:', err);

        const logger = require('../logger');
        logger.logSystem('error', 'Failed to fetch reservation by ID', {
            error: err.message,
            stack: err.stack,
            user_id: req.user?.userId,
            reservation_id: req.query.reservationid
        });

        res.status(500).json({
            error: 'Failed to fetch data'
        });
    }
});

// query to get max capacity of store
router.get('/maxcapacity', async (req, res) => {
    try {
        const storeid = req.query.storeid;

        const store = await db('stores')
            .select([
                'storeName',
                'location',
                'totalCapacity',
                'currentCapacity'
            ])
            .where('store_id', storeid)
            .andWhere('status', 'approved');

        res.json(store);
    } catch (err) {
        console.error('Error querying database:', err);
        res.status(500).json({
            error: 'Failed to fetch data'
        });
    }
});

// get first and last name of user
router.get('/get_name', authenticateToken, requireUser, async (req, res) => {
    try {
        const requestedUserId = parseInt(req.query.userid);
        const loggedInUserId = req.user.userId;

        if (requestedUserId !== loggedInUserId) {
            return res.status(403).json({
                error: 'Access denied. You can only access your own information.'
            });
        }

        const user = await db('users')
            .select('firstname', 'lastname')
            .where('user_id', requestedUserId);

        if (user.length === 0) {
            return res.status(404).json({
                error: 'User not found'
            });
        }

        res.json(user);
    } catch (err) {
        console.error('Error querying database:', err);
        res.status(500).json({
            error: 'Failed to fetch data'
        });
    }
});

// Get user profile
router.get('/getUser', async (req, res) => {
    const userId = req.session.userId;
    if (!userId) {
        return res.status(401).json({
            error: 'Unauthorized. Please log in.'
        });
    }

    try {
        const user = await db('users')
            .select('name', 'email')
            .where('user_id', userId)
            .first();

        if (!user) {
            return res.status(404).json({
                message: 'User not found'
            });
        }

        res.json(user);
    } catch (err) {
        console.error('Error fetching user info:', err);
        res.status(500).json({
            message: 'Internal server error'
        });
    }
});

// Check reservation
router.get('/check-reservation', async (req, res) => {
    const { userid, storeid } = req.query;

    // Input validation
    if (!userid || !storeid) {
        return res.status(400).json({
            error: 'Missing required parameters: userid and storeid'
        });
    }

    const userIdNum = parseInt(userid);
    const storeIdNum = parseInt(storeid);

    if (isNaN(userIdNum) || isNaN(storeIdNum) || userIdNum <= 0 || storeIdNum <= 0) {
        return res.status(400).json({
            error: 'Invalid userid or storeid format'
        });
    }

    try {
        if (req.session?.userId && req.session.userId !== userIdNum) {
            return res.status(403).json({
                error: 'Access denied. You can only check your own reservations.'
            });
        }

        const completedReservation = await db('reservations')
            .select('reservation_id', 'reservationDate', 'reservationTime', 'status', 'noOfGuest')
            .where('user_id', userIdNum)
            .andWhere('store_id', storeIdNum)
            .andWhere('status', 'Completed')
            .first();

        // Additional validation: Ensure the reservation actually happened in the past
        const hasValidCompletedReservation = !!completedReservation;

        console.log(`Review eligibility check - User: ${userIdNum}, Store: ${storeIdNum}`);
        console.log(`Found completed reservation: ${hasValidCompletedReservation}`);
        if (completedReservation) {
            console.log(`Reservation ID: ${completedReservation.reservation_id}, Status: ${completedReservation.status}`);
        }

        res.json({
            hasReserved: hasValidCompletedReservation,
            details: completedReservation ? {
                reservationId: completedReservation.reservation_id,
                date: completedReservation.reservationDate,
                status: completedReservation.status
            } : null
        });

    } catch (err) {
        console.error("Error checking reservation:", err);
        res.status(500).json({
            error: "Failed to check reservation."
        });
    }
});


// add review
router.post('/add-review', fieldLevelAccess(['userid', 'storeid', 'rating', 'review']), reviewValidator, handleValidation, async (req, res) => {
    const {
        userid,
        storeid,
        rating,
        review
    } = req.body;

    if (!userid || !storeid || !rating || !review) {
        return res.status(400).json({
            error: 'Missing required fields.'
        });
    }

    try {
        const nowSGT = getCurrentSGTDate();
        const todaySGTString = nowSGT.toLocaleDateString('en-CA', {
            timeZone: 'Asia/Singapore'
        });

        const existingReview = await db('reviews')
            .select('created_at')
            .where('user_id', userid)
            .andWhere('store_id', storeid)
            .andWhereRaw("DATE(created_at AT TIME ZONE 'Asia/Singapore') = ?", [todaySGTString])
            .first();

        if (existingReview) {
            return res.status(400).json({
                error: 'You have already submitted a review for this restaurant today.'
            });
        }

        await db('reviews').insert({
            user_id: userid,
            store_id: storeid,
            rating: rating,
            description: review,
            created_at: db.fn.now()
        });

        res.status(201).json({
            message: 'Review submitted successfully.'
        });

    } catch (err) {
        console.error('Error inserting review:', err);
        res.status(500).json({
            error: 'Failed to submit review.'
        });
    }
});
module.exports = router;