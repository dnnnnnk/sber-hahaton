// Триггер «событие оболочки» с фильтром по полям события.
// where: { taskId: "dog_walk" }                 — равенство
//        { value: { in: [777, 1111] } }          — значение из списка (массив-литерал тоже значит in)
//        { progress: { gte: 0.5 } }              — сравнения: eq ne gt gte lt lte
//        { progress: { crosses: [0.25, 0.5] } }  — порог пересечён: prevProgress < t ≤ progress

const OPS = {
  eq: (v, x) => v === x,
  ne: (v, x) => v !== x,
  in: (v, x) => Array.isArray(x) && x.includes(v),
  gt: (v, x) => typeof v === 'number' && v > x,
  gte: (v, x) => typeof v === 'number' && v >= x,
  lt: (v, x) => typeof v === 'number' && v < x,
  lte: (v, x) => typeof v === 'number' && v <= x,
  crosses: (v, x, payload, field) => {
    const prev = payload[`prev${field[0].toUpperCase()}${field.slice(1)}`];
    return typeof v === 'number' && typeof prev === 'number' && [].concat(x).some(t => prev < t && v >= t);
  },
};

export function matchWhere(where, payload = {}) {
  if (!where) return true;
  return Object.entries(where).every(([field, cond]) => {
    const value = payload[field];
    if (Array.isArray(cond)) return cond.includes(value);
    if (cond === null || typeof cond !== 'object') return value === cond;
    return Object.entries(cond).every(([op, arg]) => OPS[op]?.(value, arg, payload, field) ?? false);
  });
}

export default {
  type: 'event',
  sensors: [],

  validate(spec) {
    if (typeof spec.name !== 'string' || !spec.name) return 'нужно имя события (name)';
    if (spec.where != null && (typeof spec.where !== 'object' || Array.isArray(spec.where))) return 'where должен быть объектом';
    for (const cond of Object.values(spec.where || {})) {
      if (cond && typeof cond === 'object' && !Array.isArray(cond)) {
        const bad = Object.keys(cond).find(op => !OPS[op]);
        if (bad) return `неизвестный оператор "${bad}" в where`;
      }
    }
    return null;
  },

  create(spec, ctx, fire) {
    return ctx.bus.on(spec.name, payload => {
      if (matchWhere(spec.where, payload)) fire(payload);
    });
  },
};
