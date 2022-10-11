import * as anchor from "@project-serum/anchor";
import { Connection } from "@solana/web3.js";
import NodeWallet from "@project-serum/anchor/dist/cjs/nodewallet";
import { getAccount, getAssociatedTokenAddress } from "@solana/spl-token-v2";
import {
  GatewayBuilder,
  SupportedProtocols,
  AddLiquidityParams,
  RemoveLiquidityParams,
} from "../src";
import { lifinity } from "@dappio-wonderland/navigator";

// TODO: Fix all tests
describe("Gateway", () => {
  // const connection = new Connection("https://rpc-mainnet-fork.dappio.xyz", {
  //   commitment,
  //   wsEndpoint: "wss://rpc-mainnet-fork.dappio.xyz/ws",
  // });
  const connection = new Connection("https://rpc-mainnet-fork.epochs.studio", {
    commitment: "confirmed",
    wsEndpoint: "wss://rpc-mainnet-fork.epochs.studio/ws",
  });
  // const connection = new Connection("https://solana-api.tt-prod.net", {
  //   commitment: "confirmed",
  //   confirmTransactionInitialTimeout: 180 * 1000,
  // });
  // const connection = new Connection("https://ssc-dao.genesysgo.net", {
  //   commitment: "confirmed",
  //   confirmTransactionInitialTimeout: 180 * 1000,
  // });
  // const connection = new Connection("https:////api.mainnet-beta.solana.com", {
  //   commitment: "confirmed",
  //   confirmTransactionInitialTimeout: 180 * 1000,
  // });

  const options = anchor.AnchorProvider.defaultOptions();
  const wallet = NodeWallet.local();
  const provider = new anchor.AnchorProvider(connection, wallet, options);

  anchor.setProvider(provider);

  const addLiquidityAmount = 100;

  it("getPool", async () => {
    const allpoolInfo = await lifinity.infos.getAllPools(connection);
    // console.log(allpoolInfo.length);

    // allpoolInfo.forEach((poolInfo) => {
    //   console.log("\namm", poolInfo.poolId.toString());
    //   console.log("index", Number(poolInfo.index));
    //   console.log("token program id:", poolInfo.tokenProgramId.toString());
    //   console.log("token A mint:", poolInfo.tokenAMint.toString());
    //   console.log("token B mint:", poolInfo.tokenBMint.toString());
    //   console.log("token A account:", poolInfo.tokenAAccount.toString());
    //   console.log("token B account:", poolInfo.tokenBAccount.toString());
    //   console.log("lp mint:", poolInfo.lpMint.toString());
    // });
  });

  it("AddLiquidity in Lifinity", async () => {
    const allpoolInfo = await lifinity.infos.getAllPools(connection);
    const poolId = new anchor.web3.PublicKey(
      "FcxHANr1dguexPZ2PoPGBajgiednXFMYHGGx4YMgedkM" // RAY-USDC
    );

    const addLiquidityParams: AddLiquidityParams = {
      protocol: SupportedProtocols.Lifinity,
      poolId,
      tokenInAmount: addLiquidityAmount,
    };
    const gateway = new GatewayBuilder(provider);

    await gateway.addLiquidity(addLiquidityParams);

    await gateway.finalize();

    console.log(gateway.params);

    const txs = gateway.transactions();

    console.log("======");
    console.log("Txs are sent...");
    for (let tx of txs) {
      // tx.feePayer = wallet.publicKey;
      // tx.recentBlockhash = (await connection.getLatestBlockhash()).blockhash;
      // console.log("\n", tx.serializeMessage().toString("base64"), "\n");

      const sig = await provider.sendAndConfirm(tx, [], {
        skipPreflight: false,
        commitment: "confirmed",
      } as unknown as anchor.web3.ConfirmOptions);
      console.log(sig);
    }
    console.log("Txs are executed");
    console.log("======");
  });

  it("Remove Liquidity in Lifinity", async () => {
    const allpoolInfo = await lifinity.infos.getAllPools(connection);
    const poolId = new anchor.web3.PublicKey(
      "FcxHANr1dguexPZ2PoPGBajgiednXFMYHGGx4YMgedkM" // RAY-USDC
    );
    const pool = allpoolInfo.filter((poolInfo) =>
      poolInfo.poolId.equals(poolId)
    )[0];
    const walletLpATA = await getAssociatedTokenAddress(
      pool.lpMint,
      wallet.publicKey
    );
    const walletLpATAInfo = await getAccount(connection, walletLpATA);

    const removeLpAmount = Number(walletLpATAInfo.amount);

    const removeLiquidityParams: RemoveLiquidityParams = {
      protocol: SupportedProtocols.Lifinity,
      poolId,
      lpAmount: removeLpAmount,
    };

    const gateway = new GatewayBuilder(provider);

    await gateway.removeLiquidity(removeLiquidityParams);

    await gateway.finalize();

    console.log(gateway.params);

    const txs = gateway.transactions();

    console.log("======");
    console.log("Txs are sent...");
    for (let tx of txs) {
      // tx.feePayer = wallet.publicKey;
      // tx.recentBlockhash = (await connection.getLatestBlockhash()).blockhash;
      // console.log("\n", tx.serializeMessage().toString("base64"), "\n");

      const sig = await provider.sendAndConfirm(tx, [], {
        skipPreflight: true,
        commitment: "confirmed",
      } as unknown as anchor.web3.ConfirmOptions);
      console.log(sig);
    }
    console.log("Txs are executed");
    console.log("======");
  });
});
