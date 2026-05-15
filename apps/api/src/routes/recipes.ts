import { isIP } from 'net';
import { Router } from 'express';
import OpenAI from 'openai';
import { logger } from '../lib/logger.js';
import { requireAuth } from '../middleware/requireAuth.js';

export const recipesRouter = Router();
recipesRouter.use(requireAuth);

// Reuse the same SSRF guard as gift cards
function isPrivateHost(hostname: string): boolean {
  const h = hostname.toLowerCase();
  if (h === 'localhost' || h === '::1' || h === '0.0.0.0') return true;
  if (h.endsWith('.local') || h.endsWith('.internal') || h.endsWith('.localhost')) return true;
  if (isIP(h) === 4) {
    const [a, b] = h.split('.').map(Number);
    return (
      a === 10 ||
      a === 127 ||
      (a === 172 && b! >= 16 && b! <= 31) ||
      (a === 192 && b === 168) ||
      (a === 169 && b === 254)
    );
  }
  return false;
}

function stripHtml(html: string): string {
  // Remove scripts, styles, nav, header, footer to reduce noise
  let text = html
    .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, ' ')
    .replace(/<nav[^>]*>[\s\S]*?<\/nav>/gi, ' ')
    .replace(/<header[^>]*>[\s\S]*?<\/header>/gi, ' ')
    .replace(/<footer[^>]*>[\s\S]*?<\/footer>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&nbsp;/g, ' ')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\s{2,}/g, ' ')
    .trim();
  // Limit to 8000 chars to stay within token budget
  if (text.length > 8000) text = text.slice(0, 8000);
  return text;
}

function extractTitle(html: string): string | undefined {
  const m = html.match(/<title[^>]*>([^<]+)<\/title>/i);
  return m ? m[1]?.trim() : undefined;
}

/**
 * Extract ingredients from JSON-LD Recipe schema markup.
 * Most recipe sites (BBC Good Food, AllRecipes, etc.) embed full
 * recipeIngredient arrays in <script type="application/ld+json"> tags.
 * Returns null if no Recipe schema found.
 */
function extractFromJsonLd(html: string): { ingredients: string[]; title?: string } | null {
  const scriptPattern = /<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi;
  let match: RegExpExecArray | null;

  for (match = scriptPattern.exec(html); match !== null; match = scriptPattern.exec(html)) {
    const raw = match[1];
    if (!raw) continue;
    try {
      const data: unknown = JSON.parse(raw);
      const nodes: unknown[] = Array.isArray(data) ? data : [data];

      for (const node of nodes) {
        if (!node || typeof node !== 'object') continue;
        const obj = node as Record<string, unknown>;

        // Handle @graph wrapper (common on BBC Good Food)
        const graph = obj['@graph'];
        if (Array.isArray(graph)) {
          for (const item of graph) {
            const result = tryExtractRecipe(item);
            if (result) return result;
          }
        }

        const result = tryExtractRecipe(obj);
        if (result) return result;
      }
    } catch {
      // Malformed JSON-LD — skip this block
    }
  }

  return null;
}

function tryExtractRecipe(node: unknown): { ingredients: string[]; title?: string } | null {
  if (!node || typeof node !== 'object') return null;
  const obj = node as Record<string, unknown>;

  const type = obj['@type'];
  const isRecipe =
    type === 'Recipe' ||
    (Array.isArray(type) && type.includes('Recipe'));

  if (!isRecipe) return null;

  const raw = obj['recipeIngredient'];
  if (!Array.isArray(raw) || raw.length === 0) return null;

  const ingredients = (raw as unknown[])
    .filter((x): x is string => typeof x === 'string' && x.trim().length > 0)
    .map(s => s.trim());

  if (ingredients.length === 0) return null;

  const title = typeof obj['name'] === 'string' ? obj['name'].trim() : undefined;
  return { ingredients, title };
}

// Normalise raw recipe ingredient strings into clean shopping list format via Ollama
async function normaliseIngredients(raw: string[]): Promise<string[]> {
  if (raw.length === 0) return raw;
  try {
    const groq = new OpenAI({ baseURL: 'https://api.groq.com/openai/v1', apiKey: process.env['GROQ_API_KEY'] ?? '', timeout: 10000 });
    const prompt = `You are a UK shopping list assistant. Convert recipe ingredient strings into clean shopping list items.

CORE FORMAT: Food item name FIRST (Title Case), then quantity or key descriptor in brackets.

QUANTITY RULES:
- Grams → keep: "30g unsalted butter" → "Unsalted Butter (30g)"
- Millilitres → keep: "200ml double cream" → "Double Cream (200ml)"
- Litres → keep: "1l vegetable oil" → "Vegetable Oil (1l)"
- Count → keep: "4 chicken breasts" → "Chicken Breasts (4)"
- Ranges → keep both ends: "4-6 thighs" → "Chicken Thighs (4-6)"
- Unusual units → keep: "2cm piece ginger" → "Ginger (2cm)", "1 stick lemongrass" → "Lemongrass (1 stick)"
- Tablespoon or teaspoon → OMIT quantity entirely: "2 tbsp soy sauce" → "Soy Sauce"
- "handful" → no quantity: "handful tarragon" → "Tarragon"

DESCRIPTOR/INSTRUCTION RULES:
- Strip prep instructions (do not affect what to buy): sliced, chopped, diced, grated, beaten, peeled, crushed, minced, torn, roughly, finely, crosswise, at an angle, deseeded, skin removed, into strips, into chunks, into thirds
- Keep product-defining words: smoked, dried, fresh, frozen, baby, long-stem, low-sodium, unsalted, salted, whole, extra virgin, light, dark, wild, organic
- "or" prep alternatives → ignore the alternative: "finely chopped or grated" → just strip both
- "or" product alternatives → pick the first: "olive oil or butter" → "Olive Oil"
- "plus extra for..." → ignore the extra instruction
- "(deseeded if you prefer)", "(optional)", "if you like" → strip entirely
- "to serve" items → still include, just clean them up

RETURN: JSON array of strings, SAME LENGTH AND ORDER as input. No markdown, no explanation.

Examples:
"30g unsalted butter" → "Unsalted Butter (30g)"
"240g baby spinach" → "Baby Spinach (240g)"
"4 chicken breasts skin removed, sliced crosswise into strips" → "Chicken Breasts (4)"
"4 garlic cloves finely chopped or grated" → "Garlic Cloves (4)"
"200ml double cream" → "Double Cream (200ml)"
"40g Parmigiano Reggiano finely grated" → "Parmigiano Reggiano (40g)"
"cooked rice or potatoes, to serve (optional)" → "Rice"
"2-3 tbsp vegetable oil" → "Vegetable Oil"
"200g tempeh torn into chunks" → "Tempeh (200g)"
"1 red onion finely sliced" → "Red Onion (1)"
"3 garlic cloves roughly chopped" → "Garlic Cloves (3)"
"1 stick of lemongrass chopped into thirds (optional)" → "Lemongrass (1 stick)"
"2cm piece of ginger peeled and roughly chopped" → "Ginger (2cm)"
"1 red chilli roughly chopped (deseeded if you prefer)" → "Red Chilli (1)"
"100g mange tout sliced at an angle" → "Mange Tout (100g)"
"100g long-stem broccoli chopped" → "Long-Stem Broccoli (100g)"
"2 tbsp low-sodium soy sauce" → "Low-Sodium Soy Sauce"
"45g olive oil or unsalted butter, plus extra for the tray and for shaping" → "Olive Oil (45g)"
"65g plain flour" → "Plain Flour (65g)"
"35g manchego grated" → "Manchego (35g)"
"80g jamón ibérico chopped" → "Jamón Ibérico (80g)"
"1 egg" → "Egg (1)"
"75g panko breadcrumbs" → "Panko Breadcrumbs (75g)"
"1l light olive or vegetable oil" → "Light Olive Oil (1l)"
"1½ tbsp Dijon mustard" → "Dijon Mustard"
"handful tarragon leaves, roughly chopped" → "Tarragon"
"4-6 skinless, boneless chicken thighs" → "Chicken Thighs (4-6)"
"350g whole milk" → "Whole Milk (350ml)"

Input: ${JSON.stringify(raw)}

Return only the JSON array, nothing else.`;
    const completion = await groq.chat.completions.create({
      messages: [{ role: 'user', content: prompt }],
      model: 'llama-3.3-70b-versatile',
      temperature: 0.1,
      max_tokens: 2048,
    });
    const text = completion.choices[0]?.message?.content?.trim() ?? '';
    const match = text.match(/\[[\s\S]*\]/);
    if (!match) return raw;
    const normalised = JSON.parse(match[0]) as string[];
    if (!Array.isArray(normalised) || normalised.length !== raw.length) return raw;
    return normalised;
  } catch (err) {
    logger.warn({ err }, '[RECIPE] normaliseIngredients failed — returning raw');
    return raw;
  }
}

// POST /api/recipes/parse — fetch URL, extract ingredients via JSON-LD or AI fallback
recipesRouter.post('/parse', async (req, res) => {
  const { url } = req.body as { url?: string };
  if (!url || typeof url !== 'string') {
    res.status(400).json({ error: 'url is required', code: 'VALIDATION_ERROR' });
    return;
  }

  let parsed: URL;
  try {
    parsed = new URL(url);
    if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') throw new Error('bad protocol');
    if (isPrivateHost(parsed.hostname)) throw new Error('private host');
  } catch {
    res.status(400).json({ error: 'Invalid or unsafe URL', code: 'VALIDATION_ERROR' });
    return;
  }

  // Fetch the page
  let html: string;
  try {
    const r = await fetch(url, {
      signal: AbortSignal.timeout(15_000),
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'en-GB,en;q=0.9',
      },
    });
    if (!r.ok) {
      res.status(502).json({ error: `Page returned ${r.status}`, code: 'FETCH_ERROR' });
      return;
    }
    html = await r.text();
  } catch {
    res.status(503).json({ error: 'Could not reach the recipe page', code: 'FETCH_ERROR' });
    return;
  }

  // Strategy 1: JSON-LD structured data (preferred — fast, accurate)
  const jsonLdResult = extractFromJsonLd(html);
  if (jsonLdResult) {
    const title = jsonLdResult.title ?? extractTitle(html);
    const ingredients = await normaliseIngredients(jsonLdResult.ingredients);
    logger.info({ url, count: ingredients.length }, '[RECIPE] Extracted via JSON-LD (normalised)');
    res.json({ ingredients, title });
    return;
  }

  // Strategy 2: AI fallback for sites without Recipe schema
  logger.info({ url }, '[RECIPE] No JSON-LD found, falling back to Ollama AI');

  const title = extractTitle(html);
  const pageText = stripHtml(html);

  if (pageText.length < 200) {
    res.status(422).json({ error: 'Page appears to be JS-rendered — try a direct recipe URL', code: 'PARSE_ERROR' });
    return;
  }

  try {
    const ollama = new OpenAI({ baseURL: `${process.env['OLLAMA_HOST'] ?? 'http://localhost:11434'}/v1`, apiKey: 'ollama', timeout: 5000 });
    const prompt = `Extract all ingredients from this recipe page. Return a JSON array of strings only, no other text.

Format each ingredient as: "Item Name (quantity)" where the item name is title-cased and quantity is in brackets.
Examples: "Tinned Tomatoes (400g)", "Garlic (3 cloves)", "Olive Oil (2 tbsp)", "Salt (pinch)"
If there is no quantity, just the name: "Fresh Basil"
Include ALL ingredients even small ones like seasonings. Do not include equipment or instructions.

Page text:
${pageText}

Return only the JSON array, nothing else. Example: ["Chicken Breast (500g)", "Garlic (2 cloves)"]`;

    const completion = await ollama.chat.completions.create({
      messages: [{ role: 'user', content: prompt }],
      model: 'gemma3:4b',
      temperature: 0.1,
      max_tokens: 2048,
    });
    const text = completion.choices[0]?.message?.content?.trim() ?? '';

    // Extract JSON array from response (may have markdown fences)
    const jsonMatch = text.match(/\[[\s\S]*\]/);
    if (!jsonMatch) {
      logger.warn({ text }, '[RECIPE] AI did not return a JSON array');
      res.status(422).json({ error: 'Could not parse ingredients from this page', code: 'PARSE_ERROR' });
      return;
    }

    const ingredients = JSON.parse(jsonMatch[0]) as string[];
    if (!Array.isArray(ingredients) || ingredients.length === 0) {
      res.status(422).json({ error: 'No ingredients found on this page', code: 'PARSE_ERROR' });
      return;
    }

    const normalisedIngredients = await normaliseIngredients(ingredients);
    res.json({ ingredients: normalisedIngredients, title });
  } catch (err) {
    logger.error({ err }, '[RECIPE] Ollama AI parsing failed');
    res.status(503).json({ error: 'Failed to parse recipe', code: 'AI_ERROR' });
  }
});
