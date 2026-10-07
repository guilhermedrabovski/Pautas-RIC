import { UserData } from "../contexts/AuthContext";

export async function sendPushNotification(
  user: UserData,
  title: string,
  body: string,
  isUrgent: boolean = false,
  url: string = "/ilhas-de-edicao"
) {
  if (!user.fcmTokens || user.fcmTokens.length === 0) {
    console.log("User has no FCM tokens registered");
    return { success: false, error: "Nenhum dispositivo cadastrado com Web Push para este usuário." };
  }

  return sendMulticastPushNotification(user.fcmTokens, title, body, isUrgent, url);
}

export async function sendMulticastPushNotification(
  tokens: string[],
  title: string,
  body: string,
  isUrgent: boolean = false,
  url: string = "/ilhas-de-edicao"
) {
  const cleanTokens = Array.from(new Set(tokens.filter(t => typeof t === 'string' && t.trim().length > 10)));
  if (!cleanTokens.length) {
    return { success: false, error: "Nenhum token válido fornecido." };
  }

  try {
    const response = await fetch("/api/send-notification", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        tokens: cleanTokens,
        title,
        body,
        isUrgent,
        url,
      }),
    });

    const responseText = await response.text();
    let result: any;
    try {
      result = JSON.parse(responseText);
    } catch (parseError) {
      console.error("Failed to parse response as JSON:", responseText, parseError);
      
      const normalizedText = responseText.toLowerCase();
      const isHtml = normalizedText.includes("<html") || normalizedText.includes("<!doctype") || normalizedText.includes("<!html");
      const isCookieCheck = normalizedText.includes("cookie") || normalizedText.includes("action required to load your app") || normalizedText.includes("almost there") || normalizedText.includes("safari");
      const is404Page = normalizedText.includes("404") || normalizedText.includes("page not found") || normalizedText.includes("não encontrada");
      
      let userFriendlyMsg = "";
      if (isHtml) {
        if (isCookieCheck) {
          userFriendlyMsg = "Cookies de segurança impediram o envio na visualização embutida. Abra em nova aba.";
        } else if (is404Page) {
          userFriendlyMsg = "A rota de notificações /api/send-notification não foi encontrada no servidor atual.";
        } else {
          userFriendlyMsg = "O servidor retornou uma página inesperada.";
        }
      } else {
        userFriendlyMsg = responseText.substring(0, 120);
      }

      return { 
        success: false, 
        error: `Erro no servidor: ${userFriendlyMsg}` 
      };
    }

    if (!response.ok) {
      return { success: false, error: result.error || `Erro HTTP ${response.status}` };
    }

    return { success: true, ...result };
  } catch (error: any) {
    console.error("Error sending push notification:", error);
    return { success: false, error: error?.message || String(error) };
  }
}

/**
 * Triggers Web Push Notification to editors for an urgent pauta.
 * - If editorId is passed: alerts that editor directly.
 * - If unassigned: broadcasts to ALL editors registered in the newsroom.
 */
export async function notifyUrgentPautaPush(params: {
  title: string;
  editorId?: string;
  editorName?: string;
  isUrgent?: boolean;
  pautaId?: string;
  url?: string;
}) {
  const { title, editorId, editorName, isUrgent = true, pautaId, url = "/ilhas-de-edicao" } = params;

  if (!isUrgent) {
    return { success: true, skipped: true };
  }

  try {
    const res = await fetch("/api/notify-urgent-pauta", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        title,
        editorId: editorId || "",
        editorName: editorName || "",
        pautaId: pautaId || "",
        url,
      }),
    });

    if (res.ok) {
      const data = await res.json();
      console.log("Urgent push dispatch result:", data);
      return data;
    }
  } catch (e) {
    console.warn("Could not dispatch via /api/notify-urgent-pauta:", e);
  }

  return { success: false };
}
