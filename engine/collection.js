// Коллекция находок: какие приколы ребёнок уже видел. Только localStorage, наружу ничего не уходит.

const KEY = 'prikoly.collection';

export function createCollection() {
  let found = read();
  const has = id => Object.prototype.hasOwnProperty.call(found, id);

  function save() {
    try {
      localStorage.setItem(KEY, JSON.stringify(found));
    } catch {
      // приватный режим — коллекция живёт до перезагрузки
    }
  }

  return {
    has,
    // true — если находка новая
    add(id) {
      if (has(id)) return false;
      found[id] = Date.now();
      save();
      return true;
    },
    ids: () => Object.keys(found),
    reset() {
      found = {};
      save();
    },
  };
}

function read() {
  try {
    const data = JSON.parse(localStorage.getItem(KEY));
    return data && typeof data === 'object' && !Array.isArray(data) ? data : {};
  } catch {
    return {};
  }
}
