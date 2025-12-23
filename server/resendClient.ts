// Resend client integration for sending magic link emails
import { Resend } from 'resend';

let connectionSettings: any;

// In-memory storage for last magic link send attempt (for debugging)
export interface MagicLinkSendAttempt {
  timestamp: string;
  email: string;
  providerAccepted: boolean;
  messageId: string | null;
  error: string | null;
}

let lastMagicLinkSendAttempt: MagicLinkSendAttempt | null = null;

export function getLastMagicLinkSendAttempt(): MagicLinkSendAttempt | null {
  return lastMagicLinkSendAttempt;
}

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
): Promise<{ success: boolean; error?: string; messageId?: string }> {
  const timestamp = new Date().toISOString();
  
  try {
    const { client, fromEmail } = await getResendClient();
    
    // Use the configured from email from Resend connection
    // Domain must be verified at resend.com/domains for this to work
    const senderEmail = fromEmail || 'onboarding@resend.dev';
    
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
            Serious People Career Coaching
          </p>
        </div>
      `,
    });
    
    // Extract messageId from result
    const messageId = result.data?.id || null;
    
    // Check if there was an error in the response
    if (result.error) {
      const errorMsg = result.error.message || 'Failed to send email';
      
      // Store attempt for debugging
      lastMagicLinkSendAttempt = {
        timestamp,
        email: toEmail,
        providerAccepted: false,
        messageId: null,
        error: errorMsg,
      };
      
      // Structured log line
      console.log(`[MAGIC_LINK_SEND] ts=${timestamp} email=${toEmail} providerAccepted=false messageId=null error="${errorMsg}"`);
      
      return { success: false, error: errorMsg };
    }
    
    // Store successful attempt for debugging
    lastMagicLinkSendAttempt = {
      timestamp,
      email: toEmail,
      providerAccepted: true,
      messageId,
      error: null,
    };
    
    // Structured log line
    console.log(`[MAGIC_LINK_SEND] ts=${timestamp} email=${toEmail} providerAccepted=true messageId=${messageId}`);
    
    return { success: true, messageId: messageId || undefined };
  } catch (error: any) {
    const errorMsg = error.message || 'Unknown error';
    
    // Store failed attempt for debugging
    lastMagicLinkSendAttempt = {
      timestamp,
      email: toEmail,
      providerAccepted: false,
      messageId: null,
      error: errorMsg,
    };
    
    // Structured log line
    console.log(`[MAGIC_LINK_SEND] ts=${timestamp} email=${toEmail} providerAccepted=false messageId=null error="${errorMsg}"`);
    
    return { success: false, error: errorMsg };
  }
}

export interface SeriousPlanEmailOptions {
  toEmail: string;
  clientName: string;
  coachNote: string;
  artifactCount: number;
  viewPlanUrl: string;
  bundlePdfUrl?: string;
}

export async function sendSeriousPlanEmail(
  options: SeriousPlanEmailOptions
): Promise<{ success: boolean; error?: string }> {
  try {
    const { client, fromEmail } = await getResendClient();
    const senderEmail = fromEmail || 'onboarding@resend.dev';
    
    console.log('Sending Serious Plan email to:', options.toEmail);
    
    const result = await client.emails.send({
      from: senderEmail,
      to: options.toEmail,
      subject: `${options.clientName}, your Serious Plan is ready`,
      html: `
        <div style="font-family: 'Source Serif 4', Georgia, serif; max-width: 600px; margin: 0 auto; padding: 40px 20px; background: #fff;">
          <div style="text-align: center; border-bottom: 2px solid #1a1a1a; padding-bottom: 24px; margin-bottom: 32px;">
            <h1 style="font-family: 'Playfair Display', Georgia, serif; font-size: 28px; color: #1a1a1a; margin: 0;">
              Your Serious Plan
            </h1>
            <p style="font-size: 14px; color: #666; margin-top: 8px; text-transform: uppercase; letter-spacing: 0.1em;">
              Serious People Career Coaching
            </p>
          </div>
          
          <p style="font-size: 18px; color: #1a1a1a; line-height: 1.6; margin-bottom: 24px;">
            Dear ${options.clientName},
          </p>
          
          <div style="background: #faf7f2; border-left: 3px solid #1a1a1a; padding: 20px; margin-bottom: 24px;">
            <p style="font-size: 16px; color: #333; line-height: 1.6; margin: 0; font-style: italic;">
              ${options.coachNote.substring(0, 300)}${options.coachNote.length > 300 ? '...' : ''}
            </p>
          </div>
          
          <p style="font-size: 16px; color: #333; line-height: 1.6; margin-bottom: 24px;">
            Your complete Serious Plan includes <strong>${options.artifactCount} personalized artifacts</strong> 
            designed specifically for your situation. These include your decision snapshot, action plan, 
            conversation scripts, and more.
          </p>
          
          <div style="text-align: center; margin: 32px 0;">
            <a href="${options.viewPlanUrl}" 
               style="display: inline-block; background-color: #1a1a1a; color: #fff; 
                      padding: 16px 32px; text-decoration: none; font-size: 16px;
                      border-radius: 4px; font-weight: 500;">
              View Your Serious Plan
            </a>
          </div>
          
          ${options.bundlePdfUrl ? `
            <p style="font-size: 14px; color: #666; text-align: center; margin-bottom: 32px;">
              Or <a href="${options.bundlePdfUrl}" style="color: #1a1a1a;">download the complete PDF bundle</a>
            </p>
          ` : ''}
          
          <hr style="border: none; border-top: 1px solid #eee; margin: 32px 0;" />
          
          <p style="font-size: 14px; color: #666; line-height: 1.6;">
            This email and your Serious Plan are confidential. If you have any questions, 
            use the chat feature in your plan to connect with your coach.
          </p>
          
          <div style="margin-top: 32px; padding-top: 24px; border-top: 1px solid #eee;">
            <p style="font-size: 12px; color: #999; margin: 0;">
              © Serious People Career Coaching
            </p>
          </div>
        </div>
      `,
    });
    
    console.log('Serious Plan email result:', result);
    
    if (result.error) {
      console.error('Resend API error:', result.error);
      return { success: false, error: result.error.message || 'Failed to send email' };
    }
    
    return { success: true };
  } catch (error: any) {
    console.error('Failed to send Serious Plan email:', error);
    return { success: false, error: error.message };
  }
}
