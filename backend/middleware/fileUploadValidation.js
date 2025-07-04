const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const multer = require('multer');
const sharp = require('sharp');
const FileType = require('file-type');
const AdmZip = require('adm-zip');
const extract = require('extract-zip');
const pool = require('../../db');

const uploadDir = path.join(__dirname, '../../frontend/static/img/restaurants');
if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir, { recursive: true });

const allowedTypes = ['image/jpeg', 'image/jpg', 'image/png'];
const allowedExtensions = ['.jpg', '.jpeg', '.png'];

const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        cb(null, uploadDir);
    },
    filename: (req, file, cb) => {
        const uniqueSuffix = crypto.randomBytes(16).toString('hex');
        const extension = path.extname(file.originalname).toLowerCase();

        const disallowedExts = ['.js', '.php', '.exe', '.sh', '.bat', '.py'];
        if (disallowedExts.includes(extension)) {
            return cb(new Error('Executable files are not allowed.'));
        }

        const filename = `restaurant-${uniqueSuffix}${extension}`;
        cb(null, filename);
    }
});

const fileFilter = (req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    if (allowedTypes.includes(file.mimetype) && allowedExtensions.includes(ext)) cb(null, true);
    else cb(new Error('Invalid file type, only PNG and JPG files allowed.'), false);
};

const upload = multer({
    storage,
    fileFilter,
    limits: {
        fileSize: 5 * 1024 * 1024, // 5MB
        files: 1
    }
});

const validateUploadedImage = async (req, res, next) => {
    try {
        if (!req.file) return next();

        const safeFilename = path.basename(req.file.originalname).replace(/[^\w.-]/g, '_');
        const filePath = req.file.path;

        const buffer = await fs.promises.readFile(filePath);
        const type = await FileType.fromBuffer(buffer);
        if (!type || !allowedTypes.includes(type.mime)) {
            fs.unlinkSync(filePath);
            return res.status(400).json({ error: 'Invalid file type (magic bytes).' });
        }

        if (req.file.mimetype === 'application/zip' || path.extname(req.file.originalname).toLowerCase() === '.zip') {
            const zip = new AdmZip(filePath);
            const entries = zip.getEntries();

            let totalExtractedSize = 0;
            for (const entry of entries) {
                const entryPath = entry.entryName;

                const normalizedPath = path.normalize(entryPath);
                const safePath = path.join(uploadDir, normalizedPath);

                if (!safePath.startsWith(uploadDir)) {
                    fs.unlinkSync(filePath);
                    return res.status(400).json({ error: 'Zip slip path traversal attempt detected.' });
                }

                if (entryPath.includes('..') || path.isAbsolute(entryPath)) {
                    fs.unlinkSync(filePath);
                    return res.status(400).json({ error: 'Zip contains unsafe paths' });
                }

                totalExtractedSize += entry.getData().length;
                if (totalExtractedSize > 10 * 1024 * 1024) {
                    fs.unlinkSync(filePath);
                    return res.status(400).json({ error: 'Zip extraction too large (possible zip bomb)' });
                }
            }
        }

        const metadata = await sharp(filePath).metadata();
        if (metadata.width * metadata.height > 25_000_000) {
            fs.unlinkSync(filePath);
            return res.status(400).json({ error: 'Image resolution too high (pixel flood).' });
        }

        const stat = fs.lstatSync(filePath);
        if (stat.isSymbolicLink()) {
            fs.unlinkSync(filePath);
            return res.status(400).json({ error: 'Symlink uploads not allowed.' });
        }

        const userId = req.user.id;
        const resQuota = await pool.query('SELECT COALESCE(SUM(octet_length(image_filename)), 0) as total_size FROM stores WHERE owner_id = $1', [userId]);
        const usedBytes = parseInt(resQuota.rows[0].total_size, 10) || 0;
        const uploadSize = req.file.size;

        if (usedBytes + uploadSize > 20 * 1024 * 1024) {
            fs.unlinkSync(filePath);
            return res.status(400).json({ error: 'Per-user upload quota exceeded (20MB).' });
        }

        next();
    } catch (err) {
        console.error('Image validation error:', err);
        res.status(500).json({ error: 'Failed during image validation' });
    }
};

module.exports = {
    upload,
    validateUploadedImage
};
