const axios = require("axios");

/**
 * Analyze a dispute using Google Gemini LLM
 * Returns a structured verdict for the contract to execute
 * @param {Object} evidence - Lease terms, claims, IPFS evidence CIDs
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

    const prompt = `You are a neutral rental dispute arbitrator. Analyze the following evidence and return a JSON verdict.

LEASE TERMS:
${JSON.stringify(leaseTerms, null, 2)}

DEPOSIT AMOUNT: ${depositAmount} USDC

LANDLORD'S CLAIM:
${landlordClaim}

TENANT'S CLAIM:
${tenantClaim}

MOVE-IN EVIDENCE (IPFS CIDs): ${moveInPhotoCIDs.join(", ") || "None provided"}
MOVE-OUT EVIDENCE (IPFS CIDs): ${moveOutPhotoCIDs.join(", ") || "None provided"}

Based on the evidence provided, determine a fair split of the deposit. Consider:
1. Normal wear and tear (tenant not liable)
2. Damage caused by tenant (tenant liable)
3. Pre-existing damage (landlord not entitled to deduction)

Respond ONLY with valid JSON (no markdown, no explanation) in this exact format:
{
  "amountToLandlord": <number between 0 and ${depositAmount}>,
  "confidence": <float between 0 and 1>,
  "reasoning": "<brief explanation of verdict>"
}

If you cannot determine a fair split due to insufficient evidence, set confidence to 0.5 and make a conservative estimate.`;

    const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
    const model = "gemini-1.5-flash";
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${GEMINI_API_KEY}`;

    console.log(`[GEMINI] Calling API with model: ${model}`);
    // console.log(`[GEMINI] URL: ${url.replace(GEMINI_API_KEY, "REDACTED")}`);

    const response = await axios.post(
      url,
      {
        contents: [
          {
            parts: [
              {
                text: prompt,
              },
            ],
          },
        ],
      },
      {
        headers: {
          "Content-Type": "application/json",
        },
      }
    );

    const candidates = response.data.candidates;
    if (!candidates || candidates.length === 0) {
      throw new Error("No candidates returned from Gemini");
    }

    const responseText = candidates[0].content.parts[0].text.trim();

    // Extract JSON from response (in case Gemini wraps it in ```json ... ```)
    const jsonMatch = responseText.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      throw new Error(`No JSON found in Gemini response: ${responseText}`);
    }

    const verdict = JSON.parse(jsonMatch[0]);

    // Validate verdict
    if (
      typeof verdict.amountToLandlord !== "number" ||
      typeof verdict.confidence !== "number" ||
      typeof verdict.reasoning !== "string"
    ) {
      throw new Error("Invalid verdict structure from Gemini");
    }

    // Clamp amount to deposit range
    verdict.amountToLandlord = Math.max(
      0,
      Math.min(depositAmount, verdict.amountToLandlord)
    );

    // Clamp confidence to 0-1
    verdict.confidence = Math.max(0, Math.min(1, verdict.confidence));

    console.log(`[GEMINI] Verdict: ${verdict.amountToLandlord} USDC (Confidence: ${verdict.confidence})`);
    return verdict;
  } catch (err) {
    console.error("[GEMINI] Analysis error:", err.message);
    if (err.response && err.response.data) {
      console.error("[GEMINI] API Error Data:", JSON.stringify(err.response.data));
    }
    throw new Error(`Gemini analysis failed: ${err.message}`);
  }
}

module.exports = { analyzeDispute };
