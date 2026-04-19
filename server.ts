import express from 'express';
import { createServer as createViteServer } from 'vite';
import path from 'path';
import { google } from 'googleapis';
import session from 'express-session';
import cookieParser from 'cookie-parser';
import dotenv from 'dotenv';

dotenv.config();

const app = express();
const PORT = 3000;

// Middleware
app.use(express.json());
app.use(cookieParser());
app.use(session({
  secret: process.env.SESSION_SECRET || 'penarapi-secret-key',
  resave: false,
  saveUninitialized: false,
  cookie: {
    secure: true,      // Required for SameSite=None
    sameSite: 'none',  // Required for iframe
    httpOnly: true,
  }
}));

// Helper to get Redirect URI
const getRedirectUri = (req: express.Request) => {
  const protocol = req.headers['x-forwarded-proto'] || 'http';
  const host = req.headers['host'];
  return `${protocol}://${host}/auth/google/callback`;
};

// Google OAuth Setup Helper
const createOAuthClient = (req: express.Request) => {
  return new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET,
    getRedirectUri(req)
  );
};

const SCOPES = [
  'https://www.googleapis.com/auth/documents',
  'https://www.googleapis.com/auth/drive.file'
];

// API: Get Google Auth URL
app.get('/api/auth/google/url', (req, res) => {
  if (!process.env.GOOGLE_CLIENT_ID || !process.env.GOOGLE_CLIENT_SECRET) {
    return res.status(500).json({ error: 'Google OAuth credentials not configured in environment.' });
  }

  const client = createOAuthClient(req);
  const url = client.generateAuthUrl({
    access_type: 'offline',
    scope: SCOPES,
    prompt: 'consent'
  });
  res.json({ url });
});

// API: Google OAuth Callback
app.get('/auth/google/callback', async (req, res) => {
  const { code } = req.query;
  if (!code) return res.status(400).send('No code provided');

  try {
    const client = createOAuthClient(req);
    const { tokens } = await client.getToken(code as string);
    
    // Store tokens in session
    // @ts-ignore
    req.session.tokens = tokens;
    
    // Send success message to parent window and close popup
    res.send(`
      <html>
        <body>
          <script>
            if (window.opener) {
              window.opener.postMessage({ type: 'GOOGLE_AUTH_SUCCESS' }, '*');
              window.close();
            } else {
              window.location.href = '/';
            }
          </script>
          <p>Autentikasi Berhasil! Jendela ini dapat ditutup.</p>
        </body>
      </html>
    `);
  } catch (error) {
    console.error('Error exchanging code for tokens:', error);
    res.status(500).send('Authentication failed');
  }
});

// API: Check Auth Status
app.get('/api/auth/status', (req, res) => {
  // @ts-ignore
  const hasTokens = !!req.session.tokens;
  res.json({ authenticated: hasTokens });
});

// API: Create Google Doc
app.post('/api/export/google-docs', async (req, res) => {
  // @ts-ignore
  const tokens = req.session.tokens;
  if (!tokens) return res.status(401).json({ error: 'Not authenticated' });

  const { title, content } = req.body;
  if (!content) return res.status(400).json({ error: 'No content provided' });

  try {
    const client = createOAuthClient(req);
    client.setCredentials(tokens);
    const docs = google.docs({ version: 'v1', auth: client });
    
    // 1. Create a new document
    const createRes = await docs.documents.create({
      requestBody: { title: title || 'PenaRapi Document' }
    });
    const documentId = createRes.data.documentId;

    if (!documentId) throw new Error('Failed to create document');

    // 2. Insert content
    await docs.documents.batchUpdate({
      documentId,
      requestBody: {
        requests: [
          {
            insertText: {
              location: { index: 1 },
              text: content
            }
          }
        ]
      }
    });

    res.json({ success: true, documentId, url: `https://docs.google.com/document/d/${documentId}/edit` });
  } catch (error) {
    console.error('Error creating Google Doc:', error);
    res.status(500).json({ error: 'Failed to create Google Doc' });
  }
});

// Vite Setup
async function startServer() {
  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*all', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Server running at http://localhost:${PORT}`);
  });
}

startServer();
