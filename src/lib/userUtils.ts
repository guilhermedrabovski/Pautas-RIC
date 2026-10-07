import { UserData } from '../contexts/AuthContext';

/**
 * Formata o nome para exibição, tratando duplicatas de primeiro nome.
 * Se houver dois "Ricardo", retorna "Ricardo V." e "Ricardo S.".
 */
export function getDisplayNames(users: UserData[]): Record<string, string> {
  const firstNameMap: Record<string, string[]> = {};
  
  users.forEach(u => {
    if (!u.name) return;
    const firstName = u.name.split(' ')[0];
    if (!firstNameMap[firstName]) firstNameMap[firstName] = [];
    firstNameMap[firstName].push(u.uid);
  });

  const displayNames: Record<string, string> = {};
  
  users.forEach(u => {
    if (!u.name) {
      displayNames[u.uid] = u.email ? u.email.split('@')[0] : 'Usuário';
      return;
    }
    const parts = u.name.split(' ');
    const firstName = parts[0];
    
    if (firstNameMap[firstName] && firstNameMap[firstName].length > 1) {
      const surname = parts.length > 1 ? parts[1] : '';
      const initial = surname ? ` ${surname.charAt(0)}.` : '';
      displayNames[u.uid] = `${firstName}${initial}`;
    } else {
      displayNames[u.uid] = firstName;
    }
  });

  return displayNames;
}

/**
 * Verifica se um nome (ou ID) de escala pertence a um usuário.
 * Lida com o fato de que escalas podem ter o nome completo, curto ou com inicial.
 */
export function isUserScaleOwner(scaleIdentifier: string, userData: UserData | null): boolean {
  if (!userData || !scaleIdentifier || !userData.name) return false;
  
  const idLower = scaleIdentifier.trim().toLowerCase();
  const userNameLower = (userData.name || '').trim().toLowerCase();
  
  const nameParts = (userData.name || '').trim().split(' ');
  const userFirstNameLower = nameParts[0].toLowerCase();
  
  // Exact match with UID
  if (scaleIdentifier === userData.uid) return true;
  
  // Exact match with Full Name
  if (idLower === userNameLower) return true;
  
  // Match with first name (if the scale only has the first name)
  if (idLower === userFirstNameLower) return true;

  // Match with initials (e.g., "Ricardo V." or "Ricardo V")
  if (nameParts.length > 1) {
    const firstInitialLower = `${userFirstNameLower} ${nameParts[1].charAt(0).toLowerCase()}.`;
    const firstInitialLowerNoDot = `${userFirstNameLower} ${nameParts[1].charAt(0).toLowerCase()}`;
    if (idLower === firstInitialLower || idLower === firstInitialLowerNoDot) return true;
  }

  return false;
}
