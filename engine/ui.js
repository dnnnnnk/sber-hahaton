// Маленький UI слоя приколов: тост о находке, чип разрешения датчиков (iOS).
// Тост не перехватывает касания и сам исчезает; чип исчезает после ответа на запрос разрешения.

const TOAST_MS = 2000;

export function createUi(stage) {
  const layer = stage.ui;
  let toastEl = null;
  let toastTimer = 0;
  let chipEl = null;

  function toast(text) {
    if (!toastEl) {
      toastEl = document.createElement('div');
      toastEl.className = 'prikoly-toast';
      toastEl.setAttribute('role', 'status');
      layer.append(toastEl);
    }
    toastEl.textContent = text;
    toastEl.classList.remove('is-shown');
    void toastEl.offsetWidth; // перезапуск анимации появления
    toastEl.classList.add('is-shown');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => toastEl.classList.remove('is-shown'), TOAST_MS);
  }

  function showChip(onTap) {
    if (chipEl) return;
    chipEl = document.createElement('button');
    chipEl.type = 'button';
    chipEl.className = 'prikoly-chip';
    chipEl.textContent = '✨ Включить волшебство';
    chipEl.addEventListener('click', onTap);
    const tabbar = stage.getAnchorRect('tabbar');
    chipEl.style.bottom = `${(tabbar ? stage.height - tabbar.top : 0) + 12}px`;
    layer.append(chipEl);
  }

  function hideChip() {
    chipEl?.remove();
    chipEl = null;
  }

  return { toast, showChip, hideChip };
}
