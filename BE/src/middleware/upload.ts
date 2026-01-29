import multer from "multer";
import path from "path";
import { ensureUploadsDir, uploadsDir } from "../utils/storage";
import { v4 as uuid } from "uuid";

ensureUploadsDir();

const storage = multer.diskStorage({
  destination: (_req, _file, callback) => {
    callback(null, uploadsDir);
  },
  filename: (_req, file, callback) => {
    const ext = path.extname(file.originalname);
    callback(null, `${uuid()}${ext}`);
  }
});

const fileFilter: multer.Options["fileFilter"] = (_req, file, callback) => {
  if (file.mimetype.startsWith("image/") || file.mimetype.startsWith("video/")) {
    callback(null, true);
    return;
  }
  callback(new Error("Unsupported file type"));
};

export const upload = multer({
  storage,
  fileFilter,
  limits: {
    fileSize: 100 * 1024 * 1024
  }
});
