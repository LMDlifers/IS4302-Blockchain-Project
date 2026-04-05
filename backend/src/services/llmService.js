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
    // Use gemini-1.5-pro for vision/multimodal support
    const model = "gemini-1.5-pro";
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${GEMINI_API_KEY}`;

    console.log(`[GEMINI] Building multimodal prompt with ${moveInPhotoCIDs.length} move-in and ${moveOutPhotoCIDs.length} move-out photos...`);

    // Fetch and encode all images concurrently
    const [moveInParts, moveOutParts] = await Promise.all([
      buildImageParts("MOVE-IN PHOTOS (condition at start of tenancy)", moveInPhotoCIDs),
      buildImageParts("MOVE-OUT / DAMAGE CLAIM PHOTOS (landlord's evidence)", moveOutPhotoCIDs),
    ]);

    const instructionPart = {
      text: `You are a neutral rental deposit arbitrator with expertise in property damage assessment.

LEASE TERMS:
${JSON.stringify(leaseTerms, null, 2)}

DEPOSIT AMOUNT: ${depositAmount} USDC

LANDLORD'S CLAIM:
${landlordClaim || "Landlord claims deposit deduction for damages."}

TENANT'S CLAIM:
${tenantClaim || "Tenant disputes the damage claim."}

Below you will see two sets of photos: move-in photos (showing the unit's original condition) and move-out/damage claim photos (showing the landlord's claimed damage).

Your job:
1. Compare the move-in and move-out photos item by item.
2. Identify items that were clearly undamaged at move-in but appear damaged at move-out.
3. Distinguish between normal wear-and-tear (tenant NOT liable) and actual damage (tenant liable).
4. If no move-in photos were provided, be conservative and reduce confidence.
5. If no move-out photos were provided, rule in tenant's favour (no evidence of damage).

Rules:
- Normal wear and tear (faded paint, minor scuffs): tenant NOT liable.
- Broken fixtures, holes in walls, stained carpets, cracked tiles: tenant MAY be liable.
- Pre-existing damage visible in move-in photos: landlord NOT entitled to deduct.

Respond ONLY with valid JSON (no markdown, no explanation):
{
  "amountToLandlord": <number between 0 and ${depositAmount}>,
  "confidence": <float between 0 and 1>,
  "reasoning": "<detailed explanation referencing what you saw in the photos>"
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