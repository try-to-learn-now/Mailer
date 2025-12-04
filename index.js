import express from "express";
import cors from "cors";
import fetch from "node-fetch";

const app = express();
app.use(cors());
app.use(express.json());

// ====== ENV ======
const TENANT_ID = process.env.AZURE_TENANT_ID;
const CLIENT_ID = process.env.AZURE_CLIENT_ID;
const CLIENT_SECRET = process.env.AZURE_CLIENT_SECRET;
const SENDER_EMAIL = process.env.SENDER_EMAIL;
const REFRESH_TOKEN = process.env.AZURE_REFRESH_TOKEN; // pehle empty hoga

const AUTH_BASE = `https://login.microsoftonline.com/${TENANT_ID}/oauth2/v2.0`;
const GRAPH_BASE = "https://graph.microsoft.com/v1.0";

// ====== Basic health ======
app.get("/api/health", (req, res) => {
  res.json({ ok: true, time: new Date().toISOString() });
});

// =============================
//  STEP 1 – AUTHORIZE (EK BAAR)
// =============================

// ▶ GET /api/ms/authorize
//   is URL ko browser me open karoge → Microsoft login → consent
app.get("/api/ms/authorize", (req, res) => {
  const redirectUri = getRedirectUri(req);
  const params = new URLSearchParams({
    client_id: CLIENT_ID,
    response_type: "code",
    redirect_uri: redirectUri,
    response_mode: "query",
    scope: "offline_access Mail.Send User.Read"
  });

  const url = `${AUTH_BASE}/authorize?${params.toString()}`;
  res.redirect(url);
});

// ▶ GET /api/ms/callback
//   Microsoft yahan "code" bhejega → hum token+refresh_token le aayenge
app.get("/api/ms/callback", async (req, res) => {
  const { code, error, error_description } = req.query;

  if (error) {
    return res.status(400).json({ error, error_description });
  }
  if (!code) {
    return res.status(400).json({ message: "No code provided" });
  }

  try {
    const redirectUri = getRedirectUri(req);

    const body = new URLSearchParams({
      client_id: CLIENT_ID,
      client_secret: CLIENT_SECRET,
      grant_type: "authorization_code",
      code,
      redirect_uri: redirectUri,
      scope: "offline_access Mail.Send User.Read"
    });

    const resp = await fetch(`${AUTH_BASE}/token`, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body
    });

    const data = await resp.json();
    if (!resp.ok) {
      console.error("Token error:", data);
      return res.status(500).json({ message: "Token request failed", data });
    }

    // ⚠️ IMPORTANT:
    // data.refresh_token ko ABHI ke liye response me dikha rahe hain
    // tum isko copy karke Vercel env me AZURE_REFRESH_TOKEN me daal dena.
    res.json({
      message:
        "Copy this refresh_token and save it as AZURE_REFRESH_TOKEN in Vercel env. Then redeploy.",
      refresh_token: data.refresh_token
    });
  } catch (err) {
    console.error("Callback error:", err);
    res.status(500).json({ message: "Internal error", error: err.message });
  }
});

// Helper: redirect URI detect karega (vercel / local)
function getRedirectUri(req) {
  // Vercel pe: https://your-project.vercel.app
  const host = req.headers["x-forwarded-host"] || req.headers.host;
  const proto = req.headers["x-forwarded-proto"] || "https";
  return `${proto}://${host}/api/ms/callback`;
}

// =============================
//  STEP 2 – OTP SEND API
// =============================

// ▶ POST /api/auth/send-otp
// body: { email: "...@gecbanka.org" }
app.post("/api/auth/send-otp", async (req, res) => {
  try {
    const { email } = req.body;
    if (!email) {
      return res.status(400).json({ message: "Email is required" });
    }

    // 1) 6-digit OTP
    const otp = Math.floor(100000 + Math.random() * 900000).toString();

    // 2) Access token from refresh token
    const accessToken = await getAccessTokenFromRefreshToken();
    if (!accessToken) {
      return res
        .status(500)
        .json({ message: "No access token. Check AZURE_REFRESH_TOKEN env." });
    }

    // 3) Send mail via Graph
    const bodyHtml = `
      <div style="font-family:sans-serif;">
        <h2>Your OTP is: <span style="font-size:28px;">${otp}</span></h2>
        <p>This OTP is valid for 10 minutes.</p>
        <p>— GEC Banka Attendance System</p>
      </div>
    `;

    const mailResp = await fetch(`${GRAPH_BASE}/me/sendMail`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        message: {
          subject: "Your OTP Code",
          body: {
            contentType: "HTML",
            content: bodyHtml
          },
          toRecipients: [
            {
              emailAddress: { address: email }
            }
          ]
        },
        saveToSentItems: "false"
      })
    });

    if (!mailResp.ok) {
      const err = await mailResp.json();
      console.error("Graph sendMail error:", err);
      return res
        .status(500)
        .json({ message: "Failed to send email via Graph", error: err });
    }

    // TODO: yahan OTP ko DB / KV me store karna hai (abhi sirf demo)
    console.log("OTP sent to", email, ":", otp);

    res.json({ message: "OTP sent via Microsoft Graph", email });
  } catch (err) {
    console.error("send-otp error:", err);
    res.status(500).json({ message: "Internal server error", error: err.message });
  }
});

async function getAccessTokenFromRefreshToken() {
  if (!REFRESH_TOKEN) {
    console.error("AZURE_REFRESH_TOKEN env not set");
    return null;
  }

  const body = new URLSearchParams({
    client_id: CLIENT_ID,
    client_secret: CLIENT_SECRET,
    grant_type: "refresh_token",
    refresh_token: REFRESH_TOKEN,
    scope: "offline_access Mail.Send User.Read"
  });

  const resp = await fetch(`${AUTH_BASE}/token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body
  });

  const data = await resp.json();
  if (!resp.ok) {
    console.error("Refresh-token error:", data);
    return null;
  }

  // ⚠️ NOTE: Microsoft kabhi-kabhi naya refresh_token bhi deta hai.
  // Production me tumhe isko persist karna chahiye (DB/kv).
  // Abhi demo ke liye sirf access_token use kar rahe hain.
  return data.access_token;
}

// Vercel: app.listen nahi karna
export default app;
