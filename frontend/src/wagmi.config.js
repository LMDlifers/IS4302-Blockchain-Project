import { createConfig, http } from "wagmi";
import { sepolia } from "wagmi/chains";
import { injected, metaMask } from "wagmi/connectors";

export const config = createConfig({
  chains: [sepolia],
  connectors: [injected(), metaMask()],
  transports: {
    [sepolia.id]: http(
      import.meta.env.VITE_RPC_URL ||
        "https://sepolia.infura.io/v3/YOUR_INFURA_KEY"
    ),
  },
});
