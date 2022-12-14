const puppeteerFetch = require("../helpers/puppeteerFetch");
const cheerio = require("cheerio");
const RecipeSchema = require("../helpers/recipe-schema");

const clean = s => {
  return s.toString()
    .replace("PT", "")
    .replace("P0DT", "")
    .replace("H", " hours ")
    .replace("M", " minutes ")
    .replace("S", " seconds")
    .replace("))", ")")
    .replace("((", "(")
    .replace("0 hours ", "")
    .replace(" 0 minutes ", "")
    .replace(" 0 seconds", "")
    .trim()
}

const checkObject = (o, k) => {
  if (Array.isArray(o)) return (o[0][k] ? o[0][k] : o[0])
  else if (typeof o == 'object') return o[k]
  else return o
}

const jsonLd = url => {
  return new Promise(async (resolve, reject) => {
    const Recipe = new RecipeSchema();
    let html;
    try {
      html = await puppeteerFetch(url);
    } catch (e) {
      reject(e);
      return;
    }
    const $ = cheerio.load(html);

    const parsedJson = []
    $("script[type='application/ld+json']").map((i, el) => parsedJson.push(JSON.parse($(el).text())));

    let recipeJson;

    for (let e of parsedJson.flat(Infinity)) {
      if (e["@graph"]) {
        recipeJson = e["@graph"].filter(r => r["@type"].toString().includes("Recipe"))[0];
        break;
      }
      else if (Array.isArray(e)) {
        recipeJson = e.filter(r => !Array.isArray(r) && r["@type"].toString().includes("Recipe"))[0];
        break;
      }
      else if (e["@type"] && e["@type"].toString().includes("Recipe")) {
        recipeJson = e;
        break;
      }
    }

    if (!recipeJson || Array.isArray(recipeJson)) {
      reject("No valid Recipe found on JSON+LD tag");
      return;
    }

    if (!recipeJson["@type"].toString().includes("Recipe")) {
      reject("No valid Recipe found on JSON+LD tag");
      return;
    }

    Recipe.name = recipeJson.name;

    Recipe.nutrition = recipeJson.nutrition;
    Recipe.category = recipeJson.recipeCategory;
    Recipe.cuisine = recipeJson.recipeCuisine;
    Recipe.keywords = recipeJson.keywords;

    Recipe.image = checkObject(recipeJson.image, "url");
    if (!Recipe.image) Recipe.image = checkObject(recipeJson.image, "contentUrl")
    if (!Recipe.image) Recipe.image = checkObject(recipeJson.image, "url")

    if (recipeJson.recipeYield) Recipe.servings = recipeJson.recipeYield.toString();
    if (recipeJson.prepTime) Recipe.time.prep = clean(checkObject(recipeJson.prepTime, "maxValue"));
    if (recipeJson.cookTime) Recipe.time.cook = clean(checkObject(recipeJson.cookTime, "maxValue"));
    if (recipeJson.totalTime) Recipe.time.total = clean(checkObject(recipeJson.totalTime, "maxValue"));

    if (recipeJson.recipeIngredient) Recipe.ingredients = recipeJson.recipeIngredient.map(e => clean(e));
    if (recipeJson.recipeInstructions)
      if (Array.isArray(recipeJson.recipeInstructions))
        Recipe.instructions = recipeJson.recipeInstructions.map(e => e.text ? e.text : e.name);
      else if (typeof recipeJson.recipeInstructions == 'string') {
        const $$ = cheerio.load(recipeJson.recipeInstructions);
        $$("li").each((i, el) => {
          Recipe.instructions.push($$(el).text());
        })
      }
    Recipe.url = url;

    resolve(Recipe);
  });
};

module.exports = jsonLd;
