import { Resend } from 'resend';

export default async (req) => {
    // 1. CORS Headers (Para permitir que tu HTML hable con el servidor)
    const headers = {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': 'Content-Type',
        'Access-Control-Allow-Methods': 'POST, OPTIONS'
    };

    // 2. Handle Options (Pre-flight check del navegador)
    if (req.method === 'OPTIONS') {
        return new Response('OK', { headers, status: 200 });
    }

    if (req.method !== 'POST') {
        return new Response('Method Not Allowed', { headers, status: 405 });
    }

    try {
        // 3. Parse Data (CORRECCIÓN IMPORTANTE: Usar req.json() para V2)
        const { studentName, level, score, pdfBase64 } = await req.json();

        if (!studentName || !pdfBase64) {
            return new Response('Missing Data', { headers, status: 400 });
        }

        // 4. Initialize Email Service
        const resend = new Resend(process.env.RESEND_API_KEY);

        // 5. Send Email
        const data = await resend.emails.send({
            from: 'TEMP System <onboarding@resend.dev>',
            to: process.env.ADMIN_EMAIL,
            subject: `Nuevo Diagnóstico: ${studentName} (${level})`,
            html: `
                <h1>Reporte de Nuevo Alumno</h1>
                <p><strong>Alumno:</strong> ${studentName}</p>
                <p><strong>Nivel Detectado:</strong> ${level}</p>
                <p><strong>Score:</strong> ${score}/60</p>
                <p>Se adjunta el PDF con el detalle de errores.</p>
            `,
            attachments: [
                {
                    filename: `Diagnostico_${studentName.replace(/\s+/g, '_')}.pdf`,
                    content: pdfBase64,
                },
            ],
        });

        return new Response(JSON.stringify(data), { headers, status: 200 });

    } catch (error) {
        console.error("Error sending email:", error);
        return new Response(JSON.stringify({ error: error.message }), { headers, status: 500 });
    }
};