import { Resend } from 'resend';

// --- utilidades de seguridad ---
const esc = (s) =>
  String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const clean = (s, max = 120) =>
  String(s ?? '').replace(/[\u0000-\u001f\u007f]/g, ' ').trim().slice(0, max);
const fileSafe = (s) =>
  clean(s, 60).normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^A-Za-z0-9]+/g, '_').replace(/^_+|_+$/g, '') || 'Alumno';
const json = (body, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

export default async (req) => {
  // La página y la función viven en el mismo dominio de Netlify, así que no hace falta CORS abierto.
  if (req.method === 'OPTIONS') return new Response(null, { status: 204 });
  if (req.method !== 'POST') return json({ error: 'Method Not Allowed' }, 405);

  try {
    const body = await req.json();

    const studentName = clean(body.studentName, 80);
    const level = clean(body.level, 30);
    const exam = clean(body.exam, 40);
    const score = Number(body.score);
    const max = Number(body.max) || 30;
    const whatsapp = String(body.whatsapp ?? '').replace(/\D/g, '').slice(0, 15);
    const blocks = Array.isArray(body.blocks) ? body.blocks.slice(0, 2).map((n) => Number(n) || 0) : [];
    const weak = Array.isArray(body.weak) ? body.weak.slice(0, 7).map((w) => clean(w, 60)) : [];
    const pdfBase64 = body.pdfBase64;

    if (!studentName || !level || !Number.isFinite(score) || typeof pdfBase64 !== 'string') {
      return json({ error: 'Missing data' }, 400);
    }
    // Un PDF en base64 empieza con "JVBERi"; además limitamos el tamaño.
    if (!pdfBase64.startsWith('JVBERi') || pdfBase64.length > 5_000_000) {
      return json({ error: 'Invalid PDF' }, 400);
    }
    if (!process.env.RESEND_API_KEY || !process.env.ADMIN_EMAIL) {
      console.error('Faltan variables de entorno RESEND_API_KEY o ADMIN_EMAIL');
      return json({ error: 'Server not configured' }, 500);
    }

    const resend = new Resend(process.env.RESEND_API_KEY);
    const { error } = await resend.emails.send({
      from: process.env.FROM_EMAIL || 'Inglés Para Ti <onboarding@resend.dev>',
      to: process.env.ADMIN_EMAIL,
      subject: `Nuevo diagnóstico: ${studentName} (${level})`,
      html: `
        <div style="font-family:Arial,sans-serif;max-width:560px;margin:auto;background:#FFF8EE;padding:24px;border-radius:16px;color:#0F4C5C">
          <h2 style="margin:0 0 4px">Nuevo diagnóstico de nivel</h2>
          <p style="margin:0 0 16px;color:#5b6b70">Inglés Para Ti</p>
          <p><strong>Alumno:</strong> ${esc(studentName)}</p>
          <p><strong>Examen:</strong> ${esc(exam) || '—'}</p>
          <p><strong>Nivel estimado:</strong> ${esc(level)}</p>
          <p><strong>Puntuación:</strong> ${esc(score)}/${esc(max)}${blocks.length ? ` (parte 1: ${esc(blocks[0])}/15 · parte 2: ${esc(blocks[1])}/15)` : ''}</p>
          <p><strong>Áreas a reforzar:</strong> ${weak.length ? weak.map(esc).join(', ') : 'ninguna clara'}</p>
          <p><strong>WhatsApp del alumno:</strong> ${whatsapp ? esc(whatsapp) : 'no proporcionado'}</p>
          <p style="color:#5b6b70">Se adjunta el PDF con el detalle.</p>
        </div>`,
      attachments: [{ filename: `Diagnostico_${fileSafe(studentName)}.pdf`, content: pdfBase64 }],
    });

    // El SDK devuelve { data, error } sin lanzar excepción: hay que revisarlo.
    if (error) {
      console.error('Resend error:', error);
      return json({ error: 'Email failed' }, 502);
    }
    return json({ ok: true });
  } catch (err) {
    console.error('send-report error:', err);
    return json({ error: 'Server error' }, 500);
  }
};
