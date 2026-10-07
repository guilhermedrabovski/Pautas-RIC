import { UserData } from "../contexts/AuthContext";

export async function sendPushNotification(user: UserData, title: string, body: string) {
  if (!user.fcmTokens || user.fcmTokens.length === 0) {
    console.log("User has no FCM tokens registered");
    return { success: false, error: "No tokens" };
  }

  try {
    const response = await fetch("/api/send-notification", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        tokens: user.fcmTokens,
        title,
        body,
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
          userFriendlyMsg = "Cookies de segurança do AI Studio impediram o envio na visualização embutida. Clique em 'Abrir em nova aba' (canto superior direito) para enviar livremente.";
        } else if (is404Page) {
          userFriendlyMsg = "A URL de envio de notificações retornou 'Não encontrado (404)'. No ambiente compartilhado do AI Studio (Shared App), o servidor Node.js não roda ativamente e apenas arquivos estáticos do frontend são expostos. Para testar o envio com servidor real, utilize o link de Desenvolvimento (URL de Dev) aberto em uma nova aba!";
        } else {
          userFriendlyMsg = "O servidor de testes retornou uma página HTML em vez de JSON. Se estiver na janela de visualização do AI Studio, use o botão 'Abrir em nova aba' para passar pelas políticas de segurança do navegador.";
        }
      } else {
        userFriendlyMsg = responseText.substring(0, 120) + "...";
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
