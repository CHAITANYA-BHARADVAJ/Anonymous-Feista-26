import multer from 'multer';
import path from 'path';
import fs from 'fs';
import { v4 as uuidv4 } from 'uuid';

const UPLOAD_DIR = process.env.UPLOAD_DIR ?? './uploads';
const MAX_MB = Number(process.env.MAX_PHOTO_SIZE_MB ?? 10);

const storage = multer.diskStorage({
  destination: (req, _file, cb) => {
    const teamId = (req as any).user?.sub ?? 'unknown';
    const dir = path.join(UPLOAD_DIR, String(teamId));
    fs.mkdirSync(dir, { recursive: true });
    cb(null, dir);
  },
  filename: (_req, file, cb) => {
    const ext = path.extname(file.originalname) || '.jpg';
    cb(null, `${Date.now()}-${uuidv4()}${ext}`);
  },
});

export const photoUpload = multer({
  storage,
  limits: { fileSize: MAX_MB * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    if (['image/jpeg', 'image/png', 'image/webp'].includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error('Only JPEG/PNG/WebP images are accepted'));
    }
  },
});
