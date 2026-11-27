// ============================================================
//  SIDEBAR TABS
// ============================================================
function switchSideTab(tab) {
  currentSideTab = tab;
  document.querySelectorAll('.stab').forEach((t, i) =>
    t.classList.toggle('active', ['all', 'dm', 'channel', 'group', 'tickets'][i] === tab)
  );

  // Обычные чаты/каналы/группы — скрываем полностью на вкладке "Жалобы"
  document.querySelectorAll('.chat-item.dm-item,.chat-item.channel-item,.chat-item.group-item').forEach(el => {
    el.style.display = (tab !== 'tickets' && (tab === 'all' || el.dataset.type === tab)) ? '' : 'none';
  });

  // Закреплённые пункты (Official/Support/Избранное) — тоже прячем на вкладке "Жалобы",
  // чтобы вкладка показывала только папку с жалобами
  document.querySelectorAll('#official-chat-item,#support-chat-item,#favorites-chat-item').forEach(el => {
    el.style.display = tab === 'tickets' ? 'none' : '';
  });

  // Жалобы показываются ТОЛЬКО на отдельной вкладке «Жалобы».
  // Во вкладке «Все» остаются только обычные чаты, каналы и группы.
  const showTickets = (tab === 'tickets');
  const th = document.getElementById('tickets-folder-header');
  const tl = document.getElementById('tickets-folder-list');
  if (th) th.style.display = showTickets ? '' : 'none';
  if (tl) tl.style.display = showTickets ? '' : 'none';

  // На вкладке "Жалобы" сразу разворачиваем папку, если она была свернута,
  // и открываем домашний экран жалоб в основной панели
  if (tab === 'tickets') {
    if (th && th.classList.contains('collapsed')) toggleTicketsFolder();
    openTicketsHome();
  }
}

