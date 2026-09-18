// Logos for well-known fast food chains, sourced from Wikimedia Commons —
// free, no API key, no billing (per explicit user preference: no card on
// any new service). `Special:FilePath` hotlinks a Commons file by its title
// and redirects to the current image, so this doesn't need the hashed
// upload-directory URL, just the file's name as it appears on Commons.
//
// Only chains with a logo file confirmed to exist on Commons are listed —
// better to fall back to a plain text label for an unlisted chain than to
// guess a filename and risk a broken image. The UI also has its own
// onError fallback for the rare case a file gets renamed/deleted upstream.
const COMMONS_FILE: Record<string, string> = {
  "mcdonald's": "McDonald's_Golden_Arches.svg",
  mcdonalds: "McDonald's_Golden_Arches.svg",
  "chick-fil-a": "Chick-fil-A_Logo.svg",
  "chick fil a": "Chick-fil-A_Logo.svg",
  "wendy's": "Wendy's_logo_2012.svg",
  wendys: "Wendy's_logo_2012.svg",
  subway: "Subway_2016_logo.svg",
  "burger king": "Burger_King_2020.svg",
  kfc: "KFC_Logo.svg",
  "kentucky fried chicken": "KFC_Logo.svg",
  "domino's": "Domino's_pizza_logo.svg",
  "domino's pizza": "Domino's_pizza_logo.svg",
  dominos: "Domino's_pizza_logo.svg",
  popeyes: "Popeyes_Logo_2020.svg",
  "popeyes louisiana kitchen": "Popeyes_Logo_2020.svg",
};

function normalize(name: string): string {
  return name.trim().toLowerCase();
}

/** Returns a hotlinked Commons logo URL for a known chain name, or null if
 * this chain isn't in the curated list above. `width` requests a scaled-down
 * raster render of the (usually SVG) source, which Commons generates on the
 * fly — keeps the payload small without needing our own image processing. */
export function getChainLogoUrl(chainName: string, width = 96): string | null {
  const file = COMMONS_FILE[normalize(chainName)];
  if (!file) return null;
  return `https://commons.wikimedia.org/wiki/Special:FilePath/${encodeURIComponent(file)}?width=${width}`;
}
