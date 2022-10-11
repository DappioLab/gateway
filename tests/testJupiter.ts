import * as anchor from "@project-serum/anchor";
import { GatewayIDL } from "@dappio-wonderland/gateway-idls";
import { PublicKey, Connection, Commitment } from "@solana/web3.js";
import NodeWallet from "@project-serum/anchor/dist/cjs/nodewallet";
import { GATEWAY_PROGRAM_ID, PoolDirection } from "../src";
import { Jupiter } from "@jup-ag/core";

describe("Debug", () => {
  const commitment: Commitment = "processed";
  // const connection = new Connection("https://rpc-mainnet-fork.dappio.xyz", {
  //   commitment,
  //   wsEndpoint: "wss://rpc-mainnet-fork.dappio.xyz/ws",
  // });
  const connection = new Connection("https://ssc-dao.genesysgo.net", {
    commitment,
  });

  const options = anchor.AnchorProvider.defaultOptions();
  const wallet = NodeWallet.local();
  const provider = new anchor.AnchorProvider(connection, wallet, options);

  anchor.setProvider(provider);

  const gatewayProgram = new anchor.Program(
    GatewayIDL,
    GATEWAY_PROGRAM_ID,
    provider
  );

  const amountIn = "1000";
  const poolDirection = PoolDirection.Obverse;
  // const poolDirection = PoolDirection.Reverse;

  // ATA
  let userFromTokenAccount: PublicKey;
  let userToTokenAccount: PublicKey;
  const userTokenAccountRAY = new PublicKey(
    "6PTX9jdvYDmAJHjAYcesyA7bpWP2LN6sNtB8kDZxp3er"
  );
  const userTokenAccountSRM = new PublicKey(
    "A8aJmZMVLeJ3ouMgRPtbXiyTth7EwpsEAEGxkX9tvLbL"
  );

  switch (+poolDirection) {
    case PoolDirection.Obverse:
      userFromTokenAccount = userTokenAccountRAY;
      userToTokenAccount = userTokenAccountSRM;
      break;
    case PoolDirection.Reverse:
      userFromTokenAccount = userTokenAccountSRM;
      userToTokenAccount = userTokenAccountRAY;
      break;
  }
  const payer = wallet.payer;

  const sceneOneAccount = anchor.web3.Keypair.generate();

  let depositTrackingAccount: anchor.web3.PublicKey;
  let depositTrackingPda: anchor.web3.PublicKey;
  let depositTrackingQueueAccount: anchor.web3.PublicKey;
  let depositTrackingHoldAccount: anchor.web3.PublicKey;

  let yourUnderlyingTokenAccount: anchor.web3.PublicKey;
  let yourSharesTokenAccount: anchor.web3.PublicKey;

  let gatewayStateAccount: anchor.web3.PublicKey;

  const depositAmount = 1000;
  const withdrawAmount = 1000;

  const rpcZapDirection = {
    In: { in: {} },
    Out: { out: {} },
  };

  const rpcPoolDirection = {
    Obverse: { obverse: {} },
    Reverse: { reverse: {} },
  };

  it("Debug Jupiter Swap", async () => {
    const jupiter = await Jupiter.load({ connection, cluster: "mainnet-beta" });
    const routeMap: Map<string, string[]> = jupiter.getRouteMap();
    // console.log(routeMap);
    const routes = await jupiter.computeRoutes({
      inputMint: new PublicKey("Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB"), // USDT
      outputMint: new PublicKey("EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v"), // USDC
      inputAmount: 100000, // 1000000 => 1 USDC if inputToken.address is USDC mint
      slippage: 1, // 1 = 1%
      // forceFetch (optional) to force fetching routes and not use the cache
      // intermediateTokens, if provided will only find routes that use the intermediate tokens
      // feeBps
    });
    const bestRoute = routes.routesInfos[0];
    console.log(`outAmountWithSlippage: ${bestRoute.outAmountWithSlippage}`);
    const { transactions } = await jupiter.exchange({
      routeInfo: bestRoute,
      userPublicKey: provider.wallet.publicKey,
    });
    const { setupTransaction, swapTransaction, cleanupTransaction } =
      transactions;
    console.log(setupTransaction?.instructions?.length);
    console.log(swapTransaction.instructions.length);
    console.log(cleanupTransaction?.instructions?.length);

    for (let transaction of [
      setupTransaction,
      swapTransaction,
      cleanupTransaction,
    ].filter(Boolean)) {
      // Perform the swap
      const txid = await provider.sendAndConfirm(
        transaction as anchor.web3.Transaction,
        [],
        {
          skipPreflight: true,
        }
      );
      console.log(txid);
    }
  });
});
