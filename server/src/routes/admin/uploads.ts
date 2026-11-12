import { Router } from 'express';
import multer from 'multer';
import { config } from '../../config.js';
import { requirePerm } from '../../lib/auth.js';
import { unprocessable } from '../../lib/errors.js';
import { asyncRoute } from '../../lib/request.js';
import { IMAGE_EXTENSIONS, storeImage } from '../../lib/storage.js';
import { uploadLimiter } from '../../middleware/security.js';
import { recordAudit } from './shared.js';

const router = Router();

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: config.maxUploadBytes, files: 1 },
  fileFilter: (_req, file, done) => {
    if (!IMAGE_EXTENSIONS[file.mimetype]) {
      done(unprocessable('Upload a PNG, JPEG, WebP, AVIF or GIF image.'));
      return;
    }
    done(null, true);
  },
});

router.post(
  '/uploads',
  uploadLimiter,
  requirePerm('uploads.write'),
  upload.single('file'),
  asyncRoute(async (req, res) => {
    const file = req.file;
    if (!file) throw unprocessable('Choose an image to upload.');

    const stored = await storeImage(file.buffer, file.mimetype);
    await recordAudit(req, {
      action: 'upload.created',
      entityType: 'upload',
      entityId: stored.filename,
      after: {
        url: stored.url,
        size: file.size,
        mime: file.mimetype,
        backend: stored.backend,
      },
    });

    res.status(201).json({
      upload: {
        url: stored.url,
        filename: stored.filename,
        size: file.size,
        mime: file.mimetype,
      },
    });
  }),
);

export default router;
