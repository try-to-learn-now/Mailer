// index.js
import express from "express";
import cors from "cors";
import sendEmail from "./sendEmail.js";
import { saveOtp, verifyOtp } from "./otpStore.js";

const app = express();

// --- Middlewares ---
app.use(cors());
app.use(express.json());

// --- Routes ---

// Health check
app.get("/api/health", (req, res) => {
  res.json({ status: "ok", time: new Date().toISOString() });
});

// --- Send OTP ---
// POST /api/auth/send-otp
// body: { email: "23104134010@gecbanka.org" }
app.post("/api/auth/send-otp", async (req, res) => {
  try {
    const { email } = req.body;

    if (!email) {
      return res.status(400).json({ message: "Email is required." });
    }

    // Optional: only allow your college domain
    if (!email.endsWith("@gecbanka.org")) {
      return res.status(400).json({ message: "Only gecbanka.org emails allowed in this test." });
    }

    // Generate 6-digit OTP
    const otp = Math.floor(100000 + Math.random() * 900000).toString();

    // Save OTP in-memory
    saveOtp(email, otp, 10); // valid for 10 minutes

    // Send mail
    const result = await sendEmail({
      to: email,
      subject: "Your OTP (GEC Banka Test Backend)",
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: auto;">
          <h2>GEC Banka - OTP Test</h2>
          <p>Your OTP is:</p>
          <div style="font-size: 32px; font-weight: bold; letter-spacing: 4px; margin: 16px 0;">
            ${otp}
          </div>
          <p>This OTP is valid for 10 minutes.</p>
        </div>
      `
    });

    if (!result.success) {
      return res.status(500).json({
        message: "Failed to send email.",
        error: result.error?.message || "Unknown error"
      });
    }

    res.status(200).json({ message: "OTP sent. Check your mailbox." });
  } catch (error) {
    console.error("send-otp error:", error);
    res.status(500).json({ message: "Internal server error", error: error.message });
  }
});

// --- Verify OTP ---
// POST /api/auth/verify-otp
// body: { email: "23104134010@gecbanka.org", otp: "123456" }
app.post("/api/auth/verify-otp", (req, res) => {
  try {
    const { email, otp } = req.body;

    if (!email || !otp) {
      return res.status(400).json({ message: "Email and OTP are required." });
    }

    const result = verifyOtp(email, otp);

    if (!result.valid) {
      return res.status(400).json({ message: result.reason });
    }

    res.status(200).json({ message: "OTP verified successfully ✅" });
  } catch (error) {
    console.error("verify-otp error:", error);
    res.status(500).json({ message: "Internal server error", error: error.message });
  }
});

// --- IMPORTANT ---
// No app.listen() for Vercel. Just export the app.
export default app;
