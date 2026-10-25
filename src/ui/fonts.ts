/** Display font (Viking Squad, copied to public/fonts by the asset pipeline) with fallbacks. */
export const FONT = 'VikingSquad, "Arial Black", sans-serif';

const FACES = [
  { family: 'VikingSquad', url: 'fonts/vikingsquad.ttf' },
  { family: 'VikingSquadBold', url: 'fonts/vikingsquadbold.ttf' },
];

/** Resolves once the fonts are usable by canvas text; a missing font only logs a warning. */
export async function loadFonts(): Promise<void> {
  await Promise.all(
    FACES.map(async ({ family, url }) => {
      try {
        const face = await new FontFace(family, `url(${url})`).load();
        document.fonts.add(face);
      } catch {
        console.warn(`Font ${family} not found at ${url}; using fallback`);
      }
    }),
  );
}
