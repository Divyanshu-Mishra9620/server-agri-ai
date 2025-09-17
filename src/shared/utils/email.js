import nodemailer from "nodemailer";
import config from "../../config/env.js";

const transporter = nodemailer.createTransport({
  service: "gmail", 
  auth: {
    user: config.emailUser,
    pass: config.emailPass,
  },
});

export const sendEmail = async (to, subject, text, html) => {
  await transporter.sendMail({
    from: `"Agri Support" <${config.emailUser}>`,
    to,
    subject,
    text,
    html,
  });
};
