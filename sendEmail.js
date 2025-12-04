// sendEmail.js
import nodemailer from "nodemailer";

const transporter = nodemailer.createTransport({
  host: process.env.EMAIL_HOST || "smtp.office365.com",
  port: Number(process.env.EMAIL_PORT) || 587,
  secure: false, // for port 587 (STARTTLS)
  auth: {
    user: process.env.EMAIL_USER, // e.g. 23104134010@gecbanka.org
    pass: process.env.EMAIL_PASS  // your email password or app password
  }
});

const sendEmail = async ({ to, subject, html }) => {
  try {
    const info = await transporter.sendMail({
      from: `"GEC Attendance System" <${process.env.EMAIL_USER}>`,
      to,
      subject,
      html
    });

    console.log("Email sent:", info.messageId);
    return { success: true, data: info };
  } catch (error) {
    console.error("Error sending email:", error);
    return { success: false, error };
  }
};

export default sendEmail;
