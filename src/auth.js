const nodemailer = require('nodemailer');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
require('dotenv').config();

// In-memory OTP store (backed by DB – see resolvers for DB version)
const JWT_SECRET = process.env.JWT_SECRET || 'fallback_secret';

// ---------- Nodemailer transporter ----------
const transporter = nodemailer.createTransport({
  service: 'gmail',
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS,
  },
});

// ---------- OTP helpers ----------
function generateOtp() {
  return Math.floor(100000 + Math.random() * 900000).toString();
}

async function sendOtpEmail(email, otp) {
  const mailOptions = {
    from: `"Faculty Portal" <${process.env.EMAIL_USER}>`,
    to: email,
    subject: 'Your OTP for Faculty Registration',
    html: `
      <div style="font-family: Arial, sans-serif; max-width: 480px; margin: 0 auto; padding: 32px; background: #f8f9fa; border-radius: 12px;">
        <h2 style="color: #4f46e5; margin-bottom: 8px;">Faculty Portal</h2>
        <p style="color: #374151; font-size: 16px;">Your One-Time Password (OTP) for registration is:</p>
        <div style="background: #4f46e5; color: white; font-size: 36px; font-weight: bold; letter-spacing: 8px; text-align: center; padding: 20px; border-radius: 8px; margin: 24px 0;">
          ${otp}
        </div>
        <p style="color: #6b7280; font-size: 14px;">This OTP expires in <strong>10 minutes</strong>. Do not share it with anyone.</p>
        <hr style="border: none; border-top: 1px solid #e5e7eb; margin: 24px 0;" />
        <p style="color: #9ca3af; font-size: 12px;">If you did not request this, please ignore this email.</p>
      </div>
    `,
  };
  await transporter.sendMail(mailOptions);
}

// ---------- JWT helpers ----------
function signToken(payload) {
  return jwt.sign(payload, JWT_SECRET, { expiresIn: '7d' });
}

function verifyToken(token) {
  try {
    return jwt.verify(token, JWT_SECRET);
  } catch {
    return null;
  }
}

// ---------- Password helpers ----------
async function hashPassword(password) {
  return bcrypt.hash(password, 12);
}

async function comparePassword(password, hash) {
  return bcrypt.compare(password, hash);
}

module.exports = {
  generateOtp,
  sendOtpEmail,
  signToken,
  verifyToken,
  hashPassword,
  comparePassword,
};
