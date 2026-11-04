export function marketingPhotosReady(type: string, sectionStatus: string, count: number): boolean {
  return type === 'captacion' && sectionStatus === 'completed' && count >= 10;
}

export function marketingPhotoMessage(receptor: string, property: string, count: number, link: string) {
  const escape = (value: string) => value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  return `📷 *Fotos de comercialización listas*\nEl receptor *${escape(receptor)}* cargó *${count} fotos* de *${escape(property)}*.\nDescargá las fotos o el ZIP y cargalo en Rent Manager. No necesitás cuenta; el enlace vence en 7 días.\n<${link}|Descargar fotos de comercialización>`;
}