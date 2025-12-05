// Resend client integration for sending magic link emails
import { Resend } from 'resend';

let connectionSettings: any;

async function getCredentials() {
  const hostname = process.env.REPLIT_CONNECTORS_HOSTNAME;
  const xReplitToken = process.env.REPL_IDENTITY 
    ? 'repl ' + process.env.REPL_IDENTITY 
    : process.env.WEB_REPL_RENEWAL 
    ? 'depl ' + process.env.WEB_REPL_RENEWAL 
    : null;

  if (!hostname) {
    console.error('REPLIT_CONNECTORS_HOSTNAME not set');
    throw new Error('Resend connector hostname not configured');
  }

  if (!xReplitToken) {
    console.error('X_REPLIT_TOKEN not found - REPL_IDENTITY:', !!process.env.REPL_IDENTITY, 'WEB_REPL_RENEWAL:', !!process.env.WEB_REPL_RENEWAL);
    throw new Error('X_REPLIT_TOKEN not found for repl/depl');
  }

  try {
    const response = await fetch(
      'https://' + hostname + '/api/v2/connection?include_secrets=true&connector_names=resend',
      {
        headers: {
          'Accept': 'application/json',
          'X_REPLIT_TOKEN': xReplitToken
        }
      }
    );
    
    if (!response.ok) {
      console.error('Resend connector fetch failed:', response.status, response.statusText);
      throw new Error(`Resend connector fetch failed: ${response.status}`);
    }
    
    const data = await response.json();
    connectionSettings = data.items?.[0];
    
    if (!connectionSettings) {
      console.error('Resend connection not found in response. Available items:', data.items?.length || 0);
      throw new Error('Resend not connected - no connection found');
    }
    
    if (!connectionSettings.settings?.api_key) {
      console.error('Resend API key not found in connection settings');
      throw new Error('Resend not connected - missing API key');
    }
    
    return {
      apiKey: connectionSettings.settings.api_key, 
      fromEmail: connectionSettings.settings.from_email
    };
  } catch (error: any) {
    console.error('Failed to get Resend credentials:', error.message);
    throw error;
  }
}

// WARNING: Never cache this client.
// Access tokens expire, so a new client must be created each time.
// Always call this function again to get a fresh client.
export async function getResendClient() {
  const { apiKey, fromEmail } = await getCredentials();
  return {
    client: new Resend(apiKey),
    fromEmail
  };
}

export async function sendMagicLinkEmail(
  toEmail: string, 
  magicLinkUrl: string
): Promise<{ success: boolean; error?: string }> {
  try {
    const { client, fromEmail } = await getResendClient();
    const { RESEND_FALLBACK_EMAIL } = await import("@shared/emailConfig");
    
    // Use the configured from email from Resend connection
    // Domain must be verified at resend.com/domains for this to work
    const senderEmail = fromEmail || RESEND_FALLBACK_EMAIL;
    console.log('Sending magic link email from:', senderEmail, 'to:', toEmail);
    
    const result = await client.emails.send({
      from: senderEmail,
      to: toEmail,
      subject: 'Your login link for Serious People',
      html: `
        <div style="font-family: 'Source Serif 4', Georgia, serif; max-width: 500px; margin: 0 auto; padding: 40px 20px;">
          <h1 style="font-family: 'Playfair Display', Georgia, serif; font-size: 24px; color: #1a1a1a; margin-bottom: 20px;">
            Serious People
          </h1>
          <p style="font-size: 16px; color: #333; line-height: 1.6; margin-bottom: 24px;">
            Click the button below to log in to your account. This link will expire in 15 minutes.
          </p>
          <a href="${magicLinkUrl}" 
             style="display: inline-block; background-color: #1a1a1a; color: #fff; 
                    padding: 14px 28px; text-decoration: none; font-size: 16px;
                    border-radius: 4px;">
            Log in to Serious People
          </a>
          <p style="font-size: 14px; color: #666; margin-top: 32px; line-height: 1.5;">
            If you didn't request this email, you can safely ignore it.
          </p>
          <hr style="border: none; border-top: 1px solid #eee; margin: 32px 0;" />
          <p style="font-size: 12px; color: #999;">
            Short scripts for big career conversations.
          </p>
        </div>
      `,
    });
    
    console.log('Email send result:', result);
    
    // Check if there was an error in the response
    if (result.error) {
      console.error('Resend API error:', result.error);
      return { success: false, error: result.error.message || 'Failed to send email' };
    }
    
    return { success: true };
  } catch (error: any) {
    console.error('Failed to send magic link email:', error);
    return { success: false, error: error.message };
  }
}
