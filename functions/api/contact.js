// Cloudflare Pages Function — POST /api/contact
//
// Receives the Request-services form submission, validates it, and forwards
// to Resend so the email lands in the inbox configured as the destination
// for info@bismliving.com via Cloudflare Email Routing.
//
// Env vars required:
//   RESEND_API_KEY — set in Cloudflare Pages → Settings → Environment variables
//
// Form fields:
//   name (required), email (required), phone (optional), body (optional)
//   website (honeypot — must be empty)

const FROM_ADDRESS    = 'Bism Supported Living <info@bismliving.com>';
const TO_ADDRESS      = 'info@bismliving.com';
const MAX_NAME_LEN    = 200;
const MAX_EMAIL_LEN   = 200;
const MAX_PHONE_LEN   = 60;
const MAX_BODY_LEN    = 5000;
const EMAIL_REGEX     = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function json(body, status) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

export async function onRequestPost(context) {
  let data;
  try {
    data = await context.request.json();
  } catch (_) {
    return json({ error: 'Invalid request body' }, 400);
  }

  const name  = String(data?.name  || '').trim();
  const email = String(data?.email || '').trim();
  const phone = String(data?.phone || '').trim();
  const body  = String(data?.body  || '').trim();
  const honeypot = String(data?.website || '').trim();

  // Honeypot — bots fill all fields; real users never see this hidden field.
  // Pretend success (200) so the bot doesn't retry or learn the form is protected.
  if (honeypot) {
    return json({ ok: true }, 200);
  }

  // Validation
  if (!name || name.length > MAX_NAME_LEN) {
    return json({ error: 'Please include your name.' }, 400);
  }
  if (!email || !EMAIL_REGEX.test(email) || email.length > MAX_EMAIL_LEN) {
    return json({ error: 'Please include a valid email address.' }, 400);
  }
  if (phone.length > MAX_PHONE_LEN) {
    return json({ error: 'Phone number is too long.' }, 400);
  }
  if (body.length > MAX_BODY_LEN) {
    return json({ error: 'Message is too long.' }, 400);
  }

  // Lightweight spam heuristic: drop submissions with >3 URLs in the body.
  // (Real families don't usually paste multiple links into a contact form.)
  const urlCount = (body.match(/https?:\/\//gi) || []).length;
  if (urlCount > 3) {
    return json({ ok: true }, 200);
  }

  // Compose plain-text email body
  const textBody = [
    'New request via bismliving.com',
    '',
    `Name:  ${name}`,
    `Email: ${email}`,
    `Phone: ${phone || '(not provided)'}`,
    '',
    'Message:',
    body || '(no message)',
    '',
    '— Submitted from the Request services form',
  ].join('\n');

  const subject = `New request from ${name}`;

  // Call Resend
  let resendResponse;
  try {
    resendResponse = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${context.env.RESEND_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: FROM_ADDRESS,
        to: [TO_ADDRESS],
        reply_to: email,
        subject,
        text: textBody,
      }),
    });
  } catch (err) {
    console.error('Resend fetch failed:', err);
    return json({ error: 'Email service unreachable.' }, 502);
  }

  if (!resendResponse.ok) {
    const errText = await resendResponse.text().catch(() => '');
    console.error('Resend error:', resendResponse.status, errText);
    return json({ error: 'Could not send email.' }, 502);
  }

  return json({ ok: true }, 200);
}

// Reject everything that isn't POST (keeps the endpoint tidy)
export async function onRequest(context) {
  if (context.request.method !== 'POST') {
    return json({ error: 'Method not allowed' }, 405);
  }
  return onRequestPost(context);
}
