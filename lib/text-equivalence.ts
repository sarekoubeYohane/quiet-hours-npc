// Shared by saved origins and formation: cosmetic edits do not create new meaning.
export const meaningfulText = (text: string) => text.normalize('NFKC').toLocaleLowerCase('und').replace(/[\p{P}\p{Z}\p{S}\p{Cf}\s]/gu, '');
