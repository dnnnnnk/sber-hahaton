// Выбор ребёнка на этом устройстве (не конфиг CMS): «Показывать Каплю» в альбоме.
// localStorage — только в try/catch; если он недоступен (приватный режим), выбор живёт до перезагрузки.

const DROP_KEY = 'prikoly.showDrop';
let dropMemory = null;

export function dropShown() {
  if (dropMemory != null) return dropMemory;
  try {
    return localStorage.getItem(DROP_KEY) !== 'off';
  } catch {
    return true;
  }
}

export function setDropShown(on) {
  dropMemory = Boolean(on);
  try {
    if (on) localStorage.removeItem(DROP_KEY);
    else localStorage.setItem(DROP_KEY, 'off');
  } catch {
    // выбор останется в памяти до перезагрузки
  }
}
