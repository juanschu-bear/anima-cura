// ============================================================
// EMAIL SERVICE – SMTP-Versand für Mahnungen & Benachrichtigungen
// ============================================================

import nodemailer from "nodemailer";

const transporter = nodemailer.createTransport({
  host: process.env.SMTP_HOST,
  port: Number(process.env.SMTP_PORT) || 587,
  secure: false,
  auth: {
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASS,
  },
});

export async function sendEmail(options: {
  to: string;
  subject: string;
  html: string;
  attachments?: { filename: string; content: Buffer }[];
}): Promise<void> {
  await transporter.sendMail({
    from: `"Praxis Dr. Schubert" <${process.env.MAIL_FROM}>`,
    to: options.to,
    subject: options.subject,
    html: options.html.replace(/\n/g, "<br>"),
    attachments: options.attachments,
  });
}
