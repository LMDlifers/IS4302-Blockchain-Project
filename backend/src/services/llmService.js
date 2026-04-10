const axios = require("axios");
const { buildDisputePrompt } = require("../config/llmPrompt");
const { LLM_FETCH_TIMEOUT_MS, GEMINI_MODEL } = require("../config/constants");

const IPFS_GATEWAY = "https://gateway.pinata.cloud/ipfs";

/** Clamps a value to [min, max]. */
const clamp = (v, min, max) => Math.max(min, Math.min(max, v));

/**
 * Fetches an image from IPFS and returns it as a base64-encoded string with MIME type.
 * Returns null if the image cannot be fetched so callers can substitute a placeholder.
 *
 * @param {string} cid - IPFS content identifier for the image.
 * @returns {Promise<{base64: string, mimeType: string}|null>}
 */
async function fetchImageAsBase64(cid) {
  try {
    const response = await axios.get(`${IPFS_GATEWAY}/${cid}`, {
      responseType: "arraybuffer",
      timeout: LLM_FETCH_TIMEOUT_MS,
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
 * Builds a Gemini multimodal parts array for one set of evidence photos.
 * Interleaves a text label with inline image data; unavailable images are
 * replaced with a descriptive placeholder text part.
 *
 * @param {string}   label - Human-readable label (e.g. "MOVE-IN PHOTOS").
 * @param {string[]} cids  - Array of IPFS CIDs for the photos.
 * @returns {Promise<Array>} Array of Gemini content parts.
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
      parts.push({ inline_data: { mime_type: img.mimeType, data: img.base64 } });
    } else {
      parts.push({ text: `[Image unavailable for CID: ${cid}]` });
    }
  }
  return parts;
}

/**
 * Analyses a rental deposit dispute using the Gemini multimodal LLM.
 * Compares move-in and move-out photos to verify damage claims and returns
 * a structured verdict.
 *
 * @param {Object}   evidence
 * @param {Object}   evidence.leaseTerms        - Lease terms from move-in metadata.
 * @param {string[]} evidence.moveInPhotoCIDs   - IPFS CIDs of move-in photos.
 * @param {string[]} evidence.moveOutPhotoCIDs  - IPFS CIDs of damage claim photos.
 * @param {string}   evidence.landlordClaim     - Landlord's stated reason for deduction.
 * @param {string}   evidence.tenantClaim       - Tenant's rebuttal.
 * @param {number}   evidence.depositAmount     - Full deposit in human-readable USDC.
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
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${GEMINI_API_KEY}`;

    console.log(
      `[GEMINI] Building multimodal prompt with ${moveInPhotoCIDs.length} move-in and ` +
      `${moveOutPhotoCIDs.length} move-out photos...`
    );

    // Fetch all images concurrently to minimise total latency.
    const [moveInParts, moveOutParts] = await Promise.all([
      buildImageParts("MOVE-IN PHOTOS (condition at start of tenancy)", moveInPhotoCIDs),
      buildImageParts("MOVE-OUT / DAMAGE CLAIM PHOTOS (landlord's evidence)", moveOutPhotoCIDs),
    ]);

    const instructionPart = {
      text: buildDisputePrompt({ leaseTerms, landlordClaim, tenantClaim, depositAmount }),
    };

    const parts = [instructionPart, ...moveInParts, ...moveOutParts];

    console.log(`[GEMINI] Calling model: ${GEMINI_MODEL} with ${parts.length} parts (text + images)`);

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

    verdict.amountToLandlord = clamp(verdict.amountToLandlord, 0, depositAmount);
    verdict.confidence = clamp(verdict.confidence, 0, 1);

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
