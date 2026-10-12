// How project assets are named inside the PK3. Shared by the editor and the compiler.
const num = id => id.slice(1).toUpperCase();
export const texLump = t => ('HF' + t.id).toUpperCase().slice(0, 8);
export const sprPrefix = s => 'X' + ('000' + num(s.id)).slice(-3);
export const actorClass = a => 'HF_' + a.id;
export const actorEd = a => 20000 + parseInt(a.id.slice(1), 36) % 12000;
export const soundName = s => 'hf/' + s.id;
export const soundLump = s => ('HFS' + num(s.id)).slice(0, 8);
export const musicLump = m => ('HFM' + num(m.id)).slice(0, 8);
export const mapLump = i => 'MAP' + String(i + 1).padStart(2, '0');
export const FRAME = i => String.fromCharCode(65 + i);
export const ident = s => String(s).replace(/[^A-Za-z0-9_]/g, '_');
