import { createConfig, http } from "wagmi";
import { sepolia } from "wagmi/chains";
import { injected, metaMask } from "wagmi/connectors";

// Infura key is required for Sepolia; fail loudly in development so misconfiguration
// is caught before runtime rather than silently using an invalid URL.
const infuraKey = import.meta.env.VITE_INFURA_KEY;
if (!infuraKey && import.meta.env.MODE !== "test") {
  console.warn(
    "[wagmi] VITE_INFURA_KEY is not set. Sepolia RPC will be unavailable. " +
    "Add it to your .env file to enable Sepolia support."
  );
}

const localhost = {
  id: 1337,
  name: "Hardhat",
  nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 },
  rpcUrls: {
    default: { http: ["http://127.0.0.1:8545"] },
  },
};

export const config = createConfig({
  chains: [localhost, sepolia],
  connectors: [injected(), metaMask()],
  transports: {
    [localhost.id]: http(import.meta.env.VITE_RPC_URL || "http://127.0.0.1:8545"),
    [sepolia.id]: http(
      infuraKey
        ? `https://sepolia.infura.io/v3/${infuraKey}`
        : undefined // Wagmi will fall back to the public RPC when undefined
    ),
  },
});
