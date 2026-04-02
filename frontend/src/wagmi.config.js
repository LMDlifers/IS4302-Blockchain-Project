import { createConfig, http } from "wagmi";
import { sepolia, hardhat } from "wagmi/chains";
import { injected, metaMask } from "wagmi/connectors";

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
      "https://sepolia.infura.io/v3/YOUR_INFURA_KEY"
    ),
  },
});
