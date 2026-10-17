// Маленький UI слоя приколов: тост о находке, чип разрешения датчиков (iOS), альбом находок.
// Тост не перехватывает касания и сам исчезает; чип исчезает после ответа на запрос разрешения;
// альбом открывает сам ребёнок (долгое нажатие на аватар), закрывается одним жестом.

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

  // ——— Альбом находок: шторка снизу, закрывается тапом мимо, свайпом вниз или «Готово» ———

  let album = null;

  function openAlbum({ items, muted, onToggleMute }) {
    closeAlbum(true);
    const foundCount = items.filter(i => i.found).length;
    album = document.createElement('div');
    album.className = 'prikoly-album';
    album.innerHTML = `
      <div class="prikoly-album__backdrop"></div>
      <section class="prikoly-album__sheet" role="dialog" aria-label="Мои находки">
        <div class="prikoly-album__drag">
          <div class="prikoly-album__grip"></div>
          <header class="prikoly-album__head">
            <h2>Мои находки</h2>
            <span class="prikoly-album__count">${foundCount} из ${items.length}</span>
            <button type="button" class="prikoly-album__mute" aria-label="Звук приколов"></button>
          </header>
        </div>
        <ul class="prikoly-album__grid">
          ${items.map(i => `
            <li class="${i.found ? 'is-found' : 'is-locked'}">
              <span class="prikoly-album__icon">${i.found ? escape(i.icon) : '?'}</span>
              <b>${i.found ? escape(i.title) : 'Секрет'}</b>
              ${i.found ? '' : `<small>${escape(i.hint || 'Попробуй найти!')}</small>`}
            </li>`).join('')}
        </ul>
        <button type="button" class="prikoly-album__done">Готово</button>
      </section>`;
    layer.append(album);

    const sheet = album.querySelector('.prikoly-album__sheet');
    const mute = album.querySelector('.prikoly-album__mute');
    const renderMute = value => (mute.textContent = value ? '🔇' : '🔊');
    renderMute(muted);
    mute.addEventListener('click', () => renderMute(onToggleMute()));
    album.querySelector('.prikoly-album__backdrop').addEventListener('click', () => closeAlbum());
    album.querySelector('.prikoly-album__done').addEventListener('click', () => closeAlbum());
    enableSwipe(album.querySelector('.prikoly-album__drag'), sheet);
    requestAnimationFrame(() => album?.classList.add('is-open'));
  }

  function enableSwipe(handle, sheet) {
    let startY = null;
    let dy = 0;
    handle.addEventListener('pointerdown', e => {
      startY = e.clientY;
      dy = 0;
      handle.setPointerCapture(e.pointerId);
      sheet.style.transition = 'none';
    });
    handle.addEventListener('pointermove', e => {
      if (startY == null) return;
      dy = Math.max(0, e.clientY - startY);
      sheet.style.transform = `translateY(${dy}px)`;
    });
    const release = () => {
      if (startY == null) return;
      startY = null;
      sheet.style.transition = '';
      sheet.style.transform = '';
      if (dy > 70) closeAlbum();
    };
    handle.addEventListener('pointerup', release);
    handle.addEventListener('pointercancel', release);
  }

  function closeAlbum(immediately = false) {
    if (!album) return;
    const el = album;
    album = null;
    if (immediately) return el.remove();
    el.classList.remove('is-open');
    setTimeout(() => el.remove(), 300);
  }

  return { toast, showChip, hideChip, openAlbum, closeAlbum, isAlbumOpen: () => Boolean(album) };
}

function escape(text) {
  return String(text).replace(/[&<>"']/g, ch => `&#${ch.charCodeAt(0)};`);
}
