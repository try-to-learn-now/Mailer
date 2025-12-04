// otpStore.js

// NOTE: This is only for testing on Vercel.
// OTP is stored in memory per serverless instance.
// For real production, use DB (like your existing otpHash / otpExpiry fields).

const otpStore = new Map(); 
// key: email, value: { otp, expiresAt }

export const saveOtp = (email, otp, ttlMinutes = 10) => {
  const expiresAt = Date.now() + ttlMinutes * 60 * 1000;
  otpStore.set(email, { otp, expiresAt });
  console.log(`OTP saved for ${email}: ${otp} (expires in ${ttlMinutes} min)`);
};

export const verifyOtp = (email, otp) => {
  const record = otpStore.get(email);
  if (!record) return { valid: false, reason: "No OTP generated for this email." };

  if (Date.now() > record.expiresAt) {
    otpStore.delete(email);
    return { valid: false, reason: "OTP expired." };
  }

  if (record.otp !== otp) {
    return { valid: false, reason: "Incorrect OTP." };
  }

  otpStore.delete(email);
  return { valid: true };
};
