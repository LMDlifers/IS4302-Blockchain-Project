require("dotenv").config({ path: require("path").resolve(__dirname, "../.env") });
const { analyzeDispute } = require("../src/services/llmService");

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
  console.log("GEMINI_API_KEY configured:", !!process.env.GEMINI_API_KEY);
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
