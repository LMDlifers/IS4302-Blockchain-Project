const axios = require("axios");

const IPFS_GATEWAY = "https://gateway.pinata.cloud/ipfs";

/**
 * Fetch an image from IPFS and return as base64 + mimeType.
 * Falls back gracefully if image can't be fetched.
 */
async function fetchImageAsBase64(cid) {
  try {
    const url = `${IPFS_GATEWAY}/${cid}`;
    const response = await axios.get(url, {
      responseType: "arraybuffer",
      timeout: 15000,
    });
    const mimeType = response.headers["content-type"]?.split(";")[0] || "image/jpeg";
    const base64 = Buffer.from(response.data).toString("base64");
    return { base64, mimeType };
  } catch (err) {
    console.warn(`[GEMINI] Could not fetch image for CID ${cid}: ${err.message}`);
    return null;
  }
}

/**
 * Build the Gemini multimodal parts array.
 * Interleaves text labels with inline image data.
 */
async function buildImageParts(label, cids) {
  const parts = [];
  if (!cids || cids.length === 0) {
    parts.push({ text: `${label}: No photos provided.` });
    return parts;
  }

  parts.push({ text: `${label} (${cids.length} photo(s)):` });
  for (const cid of cids) {
    const img = await fetchImageAsBase64(cid);
    if (img) {
      parts.push({
        inline_data: {
          mime_type: img.mimeType,
          data: img.base64,
        },
      });
    } else {
      parts.push({ text: `[Image unavailable for CID: ${cid}]` });
    }
  }
  return parts;
}

/**
 * Analyze a dispute using Google Gemini multimodal LLM.
 * Compares move-in vs move-out photos to verify damage claims.
 *
 * @param {Object} evidence
 * @returns {Promise<{amountToLandlord: number, confidence: number, reasoning: string}>}
 */
async function analyzeDispute(evidence) {
  try {
    const {
      leaseTerms,
      moveInPhotoCIDs = [],
      moveOutPhotoCIDs = [],
      landlordClaim,
      tenantClaim,
      depositAmount,
    } = evidence;

    const GEMINI_API_KEY = process.env.GEMINI_API_KEY;

    const model = "gemini-2.5-flash-lite";
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${GEMINI_API_KEY}`;

    console.log(`[GEMINI] Building multimodal prompt with ${moveInPhotoCIDs.length} move-in and ${moveOutPhotoCIDs.length} move-out photos...`);

    // Fetch and encode all images concurrently
    const [moveInParts, moveOutParts] = await Promise.all([
      buildImageParts("MOVE-IN PHOTOS (condition at start of tenancy)", moveInPhotoCIDs),
      buildImageParts("MOVE-OUT / DAMAGE CLAIM PHOTOS (landlord's evidence)", moveOutPhotoCIDs),
    ]);

    const instructionPart = {
      text: `You are a neutral rental deposit arbitrator with expertise in US property damage assessment.
IMPORTANT: 1 USDC = 1 US Dollar. All amounts must be realistic USD market-rate repair or replacement costs.

LEASE TERMS:
${JSON.stringify(leaseTerms, null, 2)}

DEPOSIT AMOUNT: ${depositAmount} USDC (= $${depositAmount} USD)

LANDLORD'S CLAIM:
${landlordClaim || "Landlord claims deposit deduction for damages."}

TENANT'S CLAIM:
${tenantClaim || "Tenant disputes the damage claim."}

Below you will see two sets of photos: move-in photos (showing the unit's original condition) and move-out/damage claim photos (showing the landlord's claimed damage).

--- DAMAGE VALUATION GUIDE (use these US market-rate estimates) ---
Use these as your pricing anchors. Adjust up or down based on severity seen in the photos:

CLEANING:
- Professional deep clean (entire unit):        $150 – $400
- Carpet steam cleaning (per room):             $50  – $150
- Oven / appliance cleaning:                    $50  – $100

WALLS & PAINT:
- Touch-up paint (small area, <1 sqft):         $0   (normal wear)
- Repainting one wall (damage / large marks):   $100 – $250
- Repainting entire room:                       $300 – $600
- Patching small hole (<1 inch):                $0   (normal wear)
- Patching large hole (drywall repair):         $75  – $200

FLOORING:
- Minor carpet stain cleaning:                  $50  – $100
- Carpet replacement (per room):                $200 – $600
- Hardwood floor scratch (minor):               $0   (normal wear)
- Hardwood floor refinishing (per room):        $300 – $800
- Tile replacement (per tile):                  $50  – $150

FIXTURES & FITTINGS:
- Broken window blind / curtain rod:            $30  – $80
- Broken door handle / lock:                    $50  – $150
- Broken light fixture:                         $40  – $120
- Broken window pane:                           $100 – $300
- Cabinet door repair / replacement:            $80  – $200

APPLIANCES:
- Microwave replacement:                        $80  – $200
- Dishwasher repair:                            $100 – $300
- Refrigerator repair (minor):                  $100 – $250
- Washing machine repair:                       $150 – $350

MISCELLANEOUS:
- Key / lock replacement (lost keys):           $50  – $150
- Pest treatment (evidence of infestation):     $100 – $300
- Garbage / junk removal (excessive items):     $100 – $250
-------------------------------------------------------------------

Your job:
1. Compare the move-in and move-out photos item by item.
2. Identify items that were clearly undamaged at move-in but appear damaged at move-out.
3. Distinguish between normal wear-and-tear (tenant NOT liable) and actual damage (tenant liable).
4. For each item of damage, assign a specific dollar amount using the guide above as your anchor.
5. Sum up all individual damage costs to produce the final amountToLandlord.
6. Cap the total at the deposit amount (${depositAmount} USDC).
7. If no move-in photos were provided, be conservative and reduce confidence.
8. If no move-out photos were provided, rule in tenant's favour (no evidence of damage).

Rules:
- Normal wear and tear (faded paint, minor scuffs, small nail holes): tenant NOT liable.
- Broken fixtures, large holes in walls, stained carpets, cracked tiles: tenant MAY be liable.
- Pre-existing damage visible in move-in photos: landlord NOT entitled to deduct.
- Do NOT award $0 simply because no invoice was provided — use the guide above to estimate fair market cost.
- Do NOT award the full deposit unless the damage clearly justifies it.

Respond ONLY with valid JSON (no markdown, no explanation outside the JSON):
{
  "amountToLandlord": <number between 0 and ${depositAmount}>,
  "confidence": <float between 0 and 1>,
  "reasoning": "<detailed explanation listing each damage item, its estimated cost in USD, and why the tenant is or is not liable>"
}`,
    };

    const parts = [
      instructionPart,
      ...moveInParts,
      ...moveOutParts,
    ];

    console.log(`[GEMINI] Calling model: ${model} with ${parts.length} parts (text + images)`);

    const response = await axios.post(
      url,
      { contents: [{ parts }] },
      { headers: { "Content-Type": "application/json" } }
    );

    const candidates = response.data.candidates;
    if (!candidates || candidates.length === 0) {
      throw new Error("No candidates returned from Gemini");
    }

    const responseText = candidates[0].content.parts[0].text.trim();
    const jsonMatch = responseText.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      throw new Error(`No JSON found in Gemini response: ${responseText}`);
    }

    const verdict = JSON.parse(jsonMatch[0]);

    if (
      typeof verdict.amountToLandlord !== "number" ||
      typeof verdict.confidence !== "number" ||
      typeof verdict.reasoning !== "string"
    ) {
      throw new Error("Invalid verdict structure from Gemini");
    }

    verdict.amountToLandlord = Math.max(0, Math.min(depositAmount, verdict.amountToLandlord));
    verdict.confidence = Math.max(0, Math.min(1, verdict.confidence));

    console.log(`[GEMINI] Verdict: ${verdict.amountToLandlord} USDC to landlord (confidence: ${verdict.confidence})`);
    console.log(`[GEMINI] Reasoning: ${verdict.reasoning}`);
    return verdict;
  } catch (err) {
    console.error("[GEMINI] Analysis error:", err.message);
    if (err.response?.data) {
      console.error("[GEMINI] API Error Data:", JSON.stringify(err.response.data));
    }
    throw new Error(`Gemini analysis failed: ${err.message}`);
  }
}

module.exports = { analyzeDispute };
