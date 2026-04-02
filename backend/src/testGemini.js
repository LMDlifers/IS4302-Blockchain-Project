require("dotenv").config();
const { analyzeDispute } = require("./services/llmService");

async function test() {
  const dummyEvidence = {
    leaseTerms: {
      rent: 2000,
      deposit: 1000,
      petPolicy: "No pets allowed",
    },
    landlordClaim: "Tenant kept a dog and it scratched the wooden floor.",
    tenantClaim: "The scratches were already there when I moved in.",
    moveInPhotoCIDs: ["ipfs://photo1", "ipfs://photo2"],
    moveOutPhotoCIDs: ["ipfs://photo3"],
    depositAmount: 1000,
  };

  console.log("Testing Gemini Dispute Analysis...");
  console.log("API Key Length:", process.env.GEMINI_API_KEY ? process.env.GEMINI_API_KEY.length : "undefined");
  try {
    const verdict = await analyzeDispute(dummyEvidence);
    console.log("\n✅ SUCCESS!");
    console.log("Verdict:", JSON.stringify(verdict, null, 2));
  } catch (err) {
    console.error("\n❌ FAILED!");
    console.error(err.message);
  }
}

test();
