import cloudinary from "cloudinary";
import fs from "fs";
import config from "../../config/env.js";

cloudinary.v2.config({
  cloud_name: config.cloudinaryCloudName,
  api_key: config.cloudinaryApiKey,
  api_secret: config.cloudinaryApiSecret,
  secure: true,
});

export const uploadToCloudinary = (filePath, opts = {}) => {
  return new Promise((resolve, reject) => {
    cloudinary.v2.uploader.upload(filePath, opts, (err, result) => {
      if (err) return reject(err);
      // remove local file
      fs.unlink(filePath, () => {});
      resolve(result.secure_url);
    });
  });
};
