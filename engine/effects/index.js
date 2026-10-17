// Реестр эффектов. Новый тип: файл рядом + строка здесь (см. AGENTS.md).
import particles from './particles.js';

export const effects = Object.fromEntries([particles].map(e => [e.type, e]));
