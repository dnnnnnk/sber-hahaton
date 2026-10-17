// Реестр триггеров. Новый тип: файл рядом + строка здесь (см. AGENTS.md).
import event from './event.js';

export const triggers = Object.fromEntries([event].map(t => [t.type, t]));
