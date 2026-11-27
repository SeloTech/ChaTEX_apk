// ============================================================
//  MSG PATH HELPERS
// ============================================================
function getMsgPath(chatId, msgId) {
  if (chatId === 'official')   return `official_messages/${msgId}`;
  if (chatId === 'support')    return `support_messages/${msgId}`;
  if (chatId === 'favorites')  return `favorites_messages/${currentUser.uid}/${msgId}`;
  if (currentChatType === 'channel') return `channels/${chatId}/messages/${msgId}`;
  if (currentChatType === 'group')   return `groups/${chatId}/messages/${msgId}`;
  if (currentChatType === 'ticket')  return `ticket_messages/${chatId}/${msgId}`;
  return `dms/${chatId}/${msgId}`;
}
function getMsgsBasePath(chatId) {
  if (chatId === 'official')   return 'official_messages';
  if (chatId === 'support')    return 'support_messages';
  if (chatId === 'favorites')  return `favorites_messages/${currentUser.uid}`;
  if (currentChatType === 'channel') return `channels/${chatId}/messages`;
  if (currentChatType === 'group')   return `groups/${chatId}/messages`;
  if (currentChatType === 'ticket')  return `ticket_messages/${chatId}`;
  return `dms/${chatId}`;
}

