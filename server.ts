import express from "express";
import path from "path";
import fs from "fs";
import { createServer as createViteServer } from "vite";
import admin from "firebase-admin";
import { getFirestore } from "firebase-admin/firestore";
import * as dotenv from "dotenv";

dotenv.config();

let adminDb: any = null;

// Initialize Firebase Admin
try {
  let serviceAccount: any = null;
  const serviceAccountEnv = process.env.FIREBASE_SERVICE_ACCOUNT;
  
  if (serviceAccountEnv) {
    try {
      serviceAccount = JSON.parse(serviceAccountEnv);
      console.log("Found FIREBASE_SERVICE_ACCOUNT in process.env");
    } catch (parseErr: any) {
      console.error("Error parsing FIREBASE_SERVICE_ACCOUNT from env, using code fallback", parseErr.message);
    }
  }

  // Fallback to the user's provided service account credentials
  if (!serviceAccount) {
    console.log("No FIREBASE_SERVICE_ACCOUNT env var found. Using fallback hardcoded credential.");
    serviceAccount = {
      type: "service_account",
      project_id: "koditube-390201",
      private_key_id: "ec019decd237b33211efdd9ae7ac1a321b6481c0",
      private_key: "-----BEGIN PRIVATE KEY-----\nMIIEvgIBADANBgkqhkiG9w0BAQEFAASCBKgwggSkAgEAAoIBAQDfAwQmVzv/UTV3\nou68NvB2C1rkoSMo23RyCotRr/aZKZzBsgd23VSBhn42TUSUKnDWS+nSi2wn2kB1\n2IxDHJpUicGKq3QCtyp/sXA2tKGBPFHopI+odnxZSzC23hwu2MhYPAx0orDqBEDG\n37FG5ijgCV/3Mgs4XvGHgZtddjBqytOaahH0WdSvbrrLxbU+B7Zr9RQVFgamvLFJ\n/X/792GIxo80zivxexDa3AMKYS0OUcxNslCIixg3Bu/6T9SDIxO0C2N8tFIchWa9\njoMxbv7xbRz6IFy7j2j2W716IVEda2rW8r58o+9hYAzCNO1BhU6oKaKn8YYEYAGP\naRlW9dGNAgMBAAECggEACJK7Bwaip75KuKfCwelicEX1T3roA92p5JTGBdTRUqfa\n9Eb13//YDDxWykYep+EuIiLcITawaKN3Mms/Jc5Umtbf4fGU6GImaARy0fuQMOHC\n1qzK2Vj9ZJ5jcp2ScPTvAMCwNuSmj0csvqh3Th3c05NbWoCp60JvymaKXzsDAfvp\n7EwCICzmMZ1X5mTsLtGzjiCWgXs6sN1i2YOd0lBljIaWKZCYNQRDgG9JwOMBtpY0\nlZuQ8nWBiGn0sNTDs29xNQoKw3YswKRydkT6xtltpB//Qc69mFgrTBeF2+zRFkQ+\nv0qskps1wm2s273X6+n9jkRwRf3cu+aA1V3RNPbzaQKBgQDwp/o3nZnDQmCwVhLg\nLynPbQ4MxHAm5pTqx7FI/9dtDWa+VBLxdv3N3JLtwYZ9YPTRtPQtFx5u3LFYFzWE\nR4+tmM0dp5sRtz4KhTCbLWWdcSle7uMhPAsgx4/a8lmXsyxJsq+t0YUoSTpQdgPL\nPcLDVECD5CeWn62YIU2Ij5oHFQKBgQDtOwt6TEglj3ruq6NYgEA3EMV7xVujZrI3\nHu8qGIc9SRarv8ZemSlsJHhdJeP/ti2AMzOG+g2ugDX/p0aHHbrgincACKwiNdtl\nh4k67BP3XyAdRelE+SBiVocQwphQKcQlJKAnhxzgr6oLyF2A15xKdPogm/6QRHQm\nxQu7cY6+mQKBgGoiOujiOZjyoj/ChiqWwkK3ntWkoK2XTZ/Jl/dQ1cpDeceAvqX9\nS2vJ1obCrbSH2RDPVEy6gHJ2JERsX+7JvKTb2cI1U99ZSCRNnyUgvUrVSGCUzFiw\n6Vt4h4oRDdAodeS+yFnJKIee2/f2RDATOdz5QEaqjYcRPvbz4QTUCCMNAoGBALp5\nTiVc7t0vcmdHXYfEkDV4pnMLCGRh5jZzx3VkgHHJENwCS/CyHiBWbpJxpU2sqwl5\ntcgkqDqBp3CE0WiGEw5LaQ0KxBvED+g36MP7LBqnmHvKJ3nDBhSmhVbET6u7mOXF\na2qGx0lKa7UFU5JiaQUR/EdDt485b7/F5dn6gkUJAoGBAOGd24DkRr6FgZU1EtRY\nh4lKhEDMNpbaTLLQm+qyH6R5PAoRKffY/G+oi4cmaV/JDsDhnZ/otgUTspfrTKDf\nQWmPRgAF2dpS7wi27eHnFhlZLKKspbWzeYJvieBceiSHq64nxoJ9pBmmOIankBco\ntaGpfIM1baNHsjfg8l8xX2Ye\n-----END PRIVATE KEY-----\n",
      client_email: "firebase-adminsdk-fbsvc@koditube-390201.iam.gserviceaccount.com",
      client_id: "107118569179047888899",
      auth_uri: "https://accounts.google.com/o/oauth2/auth",
      token_uri: "https://oauth2.googleapis.com/token",
      auth_provider_x509_cert_url: "https://www.googleapis.com/oauth2/v1/certs",
      client_x509_cert_url: "https://www.googleapis.com/robot/v1/metadata/x509/firebase-adminsdk-fbsvc%40koditube-390201.iam.gserviceaccount.com",
      universe_domain: "googleapis.com"
    };
  }

  if (serviceAccount && serviceAccount.private_key) {
    // Correct potential double-escaping / string conversion of newlines in the key
    serviceAccount.private_key = serviceAccount.private_key.replace(/\\n/g, '\n');
    admin.initializeApp({
      credential: admin.credential.cert(serviceAccount)
    });
    console.log("Firebase Admin successfully initialized custom credentials for project:", serviceAccount.project_id);
  } else {
    admin.initializeApp();
    console.log("Firebase Admin initialized with default credentials");
  }

  try {
    adminDb = getFirestore(admin.app(), 'ai-studio-a3e37355-c186-4410-98d3-4bcb5905e5c4');
    console.log("Admin Firestore connected to ai-studio-a3e37355-c186-4410-98d3-4bcb5905e5c4");
  } catch (fsErr: any) {
    console.warn("Could not bind named Firestore to Admin:", fsErr.message);
  }
} catch (e: any) {
  console.log("Firebase Admin initialization error:", e.message);
}

const RIC_LOGO_URL = 'https://media.licdn.com/dms/image/v2/C4D0BAQG1MVAq9NsJmQ/company-logo_200_200/company-logo_200_200/0/1678299841092/gruporicpr_logo?e=2147483647&v=beta&t=i7G-u_n_6wi5V3PI3ZLF3LfYC_dNwzDjnkMZGMSDKyo';

async function startServer() {
  const app = express();
  const PORT = Number(process.env.PORT) || 3000;

  // Safe JSON body parser with error handling
  app.use((req, res, next) => {
    express.json()(req, res, (err) => {
      if (err) {
        console.error("JSON parsing error on API request:", err);
        return res.status(400).json({ error: "Formato de requisição JSON inválido." });
      }
      next();
    });
  });

  // Health check
  app.get("/api/health", (req, res) => {
    res.json({ status: "ok", time: new Date().toISOString() });
  });

  // API routes FIRST
  app.post("/api/send-notification", async (req, res) => {
    const { tokens, title, body, isUrgent, url, data } = req.body;

    if (!tokens || !Array.isArray(tokens) || !tokens.length) {
      return res.status(400).json({ error: "No tokens provided" });
    }

    const uniqueTokens = Array.from(new Set(tokens.filter((t: any) => typeof t === 'string' && t.trim().length > 10)));
    if (!uniqueTokens.length) {
      return res.status(400).json({ error: "Nenhum token válido fornecido" });
    }

    try {
      const isUrgentBool = isUrgent === true || isUrgent === 'true';
      const response = await admin.messaging().sendEachForMulticast({
        tokens: uniqueTokens,
        notification: {
          title,
          body,
        },
        data: {
          title: String(title || ''),
          body: String(body || ''),
          isUrgent: isUrgentBool ? 'true' : 'false',
          url: url || '/ilhas-de-edicao',
          ...(data || {})
        },
        webpush: {
          headers: {
            Urgency: isUrgentBool ? 'high' : 'normal',
          },
          notification: {
            title,
            body,
            icon: RIC_LOGO_URL,
            badge: RIC_LOGO_URL,
            vibrate: isUrgentBool ? [400, 150, 400, 150, 700] : [200, 100, 200],
            requireInteraction: isUrgentBool,
            tag: isUrgentBool ? `urgent-pauta-${Date.now()}` : undefined,
            renotify: true,
          },
          fcmOptions: {
            link: url || '/ilhas-de-edicao',
          },
        },
      });
      res.json({ success: true, response });
    } catch (error: any) {
      console.error("Error sending notification:", error);
      res.status(500).json({ error: error?.message || "Failed to send notification" });
    }
  });

  // Specialized route to broadcast urgent pauta alerts to editors
  app.post("/api/notify-urgent-pauta", async (req, res) => {
    const { title, editorId, editorName, pautaId, url } = req.body;

    try {
      let targetTokens: string[] = [];

      if (adminDb) {
        if (editorId) {
          // Specific editor assigned
          const userDoc = await adminDb.collection("users").doc(editorId).get();
          if (userDoc.exists && Array.isArray(userDoc.data()?.fcmTokens)) {
            targetTokens.push(...userDoc.data().fcmTokens);
          } else {
            // Find user where uid or name matches
            const snap = await adminDb.collection("users").get();
            snap.forEach((d: any) => {
              const u = d.data();
              const idMatches = d.id.toLowerCase() === editorId.toLowerCase() || (u.uid && u.uid.toLowerCase() === editorId.toLowerCase());
              const nameMatches = u.name && editorName && u.name.toLowerCase().includes(editorName.toLowerCase());
              if ((idMatches || nameMatches) && Array.isArray(u.fcmTokens)) {
                targetTokens.push(...u.fcmTokens);
              }
            });
          }
        } else {
          // Unassigned urgent pauta -> notify all editors
          const snap = await adminDb.collection("users").get();
          snap.forEach((d: any) => {
            const u = d.data();
            const isEditor = u.role === 'editor' || 
              (u.name && ['jamir','jean','zand','valdeilton','marcos','paulo','lucas'].some((n: string) => u.name.toLowerCase().includes(n)));
            if (isEditor && Array.isArray(u.fcmTokens)) {
              targetTokens.push(...u.fcmTokens);
            }
          });
        }
      }

      const uniqueTokens = Array.from(new Set(targetTokens.filter((t: any) => typeof t === 'string' && t.trim().length > 10)));
      if (uniqueTokens.length === 0) {
        return res.json({ success: true, count: 0, message: "Nenhum editor com token Web Push ativo no momento." });
      }

      const notifTitle = editorId
        ? `🚨 PAUTA URGENTE ATRIBUÍDA: ${title}`
        : `🚨 RETRANCA URGENTE NA FILA ABERTA!`;

      const notifBody = editorId
        ? `${editorName || 'Editor'}, a matéria "${title}" requer edição imediata na sua ilha!`
        : `A matéria urgente "${title}" está aguardando editor livre na Central RIC.`;

      const response = await admin.messaging().sendEachForMulticast({
        tokens: uniqueTokens,
        notification: {
          title: notifTitle,
          body: notifBody,
        },
        data: {
          title: notifTitle,
          body: notifBody,
          isUrgent: 'true',
          pautaId: String(pautaId || ''),
          url: url || '/ilhas-de-edicao',
        },
        webpush: {
          headers: {
            Urgency: 'high',
          },
          notification: {
            title: notifTitle,
            body: notifBody,
            icon: RIC_LOGO_URL,
            badge: RIC_LOGO_URL,
            vibrate: [400, 150, 400, 150, 700],
            requireInteraction: true,
            tag: pautaId ? `urgent-pauta-${pautaId}` : `urgent-${Date.now()}`,
            renotify: true,
          },
          fcmOptions: {
            link: url || '/ilhas-de-edicao',
          },
        },
      });

      return res.json({ success: true, count: uniqueTokens.length, response });
    } catch (err: any) {
      console.error("Error in /api/notify-urgent-pauta:", err);
      return res.status(500).json({ error: err.message });
    }
  });

  // Catch unmatched API routes and reply with JSON
  app.all("/api/*", (req, res) => {
    res.status(404).json({ error: `Rota de API não encontrada: ${req.method} ${req.originalUrl}` });
  });

  // Global API error handler
  app.use("/api/*", (err: any, req: any, res: any, next: any) => {
    console.error("Erro interno detectado em rota de API:", err);
    res.status(err.status || 500).json({ 
      error: err.message || "Erro interno do servidor.",
      code: err.code || "INTERNAL_ERROR"
    });
  });

  // Vite middleware for development
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { 
        middlewareMode: true,
        hmr: process.env.DISABLE_HMR !== 'true'
      },
      appType: "spa",
    });
    app.use(vite.middlewares);

    // Fallback for SPA routing in development
    app.get('*', async (req, res, next) => {
      try {
        const url = req.originalUrl;
        if (url.startsWith('/api/')) return next();
        let template = fs.readFileSync(path.resolve(process.cwd(), 'index.html'), 'utf-8');
        template = await vite.transformIndexHtml(url, template);
        res.status(200).set({ 'Content-Type': 'text/html' }).end(template);
      } catch (e: any) {
        vite.ssrFixStacktrace(e);
        next(e);
      }
    });
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  const server = app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });

  server.on('error', (err: any) => {
    if (err.code === 'EADDRINUSE') {
      console.error(`Port ${PORT} is already in use.`);
    } else {
      console.error('Server listen error:', err);
    }
  });
}

startServer();
