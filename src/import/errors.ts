/** File non leggibile o non valido. Il messaggio è già per l'utente e non contiene dati del file. */
export class ImportFileError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ImportFileError';
  }
}
