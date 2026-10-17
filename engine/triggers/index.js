// Реестр триггеров. Новый тип: файл рядом + строка здесь (см. AGENTS.md).
import event from './event.js';
import shake from './shake.js';
import tilt from './tilt.js';
import flip from './flip.js';
import still from './still.js';
import multitap from './multitap.js';
import longpress from './longpress.js';
import presence from './presence.js';

export const triggers = Object.fromEntries(
  [event, shake, tilt, flip, still, multitap, longpress, presence].map(t => [t.type, t]),
);
