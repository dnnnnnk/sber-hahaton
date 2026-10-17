// Реестр эффектов. Новый тип: файл рядом + строка здесь (см. AGENTS.md).
import particles from './particles.js';
import lottie from './lottie.js';
import cssAnimate from './cssAnimate.js';
import holo from './holo.js';
import coins from './coins.js';
import resident from './resident.js';

export const effects = Object.fromEntries([particles, lottie, cssAnimate, holo, coins, resident].map(e => [e.type, e]));
