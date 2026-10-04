/**
 * Scarica un file creato nel browser. Il file resta sul dispositivo dell'utente: non passa
 * da nessun server. L'URL temporaneo viene rilasciato subito dopo il clic.
 */
export function downloadFile(filename: string, mime: string, data: Uint8Array<ArrayBuffer>): void {
  const url = URL.createObjectURL(new Blob([data], { type: mime }));
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  // Rilascio differito: alcuni browser (Safari) avviano il download dopo il clic.
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}
