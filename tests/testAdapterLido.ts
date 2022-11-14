import * as anchor from "@project-serum/anchor";
import { PublicKey, Connection } from "@solana/web3.js";
import NodeWallet from "@project-serum/anchor/dist/cjs/nodewallet";
import { GatewayBuilder, SupportedProtocols, DepositParams, WithdrawParams } from "../src";

describe("Gateway", () => {
  const connection = new Connection("https://rpc-mainnet-fork-1.dappio.xyz", {
    commitment: "confirmed",
    wsEndpoint: "wss://rpc-mainnet-fork-1.dappio.xyz/ws",
  });
  //   const connection = new Connection("https://rpc-mainnet-fork.epochs.studio", {
  //     commitment: "confirmed",
  //     wsEndpoint: "wss://rpc-mainnet-fork.epochs.studio/ws",
  //   });
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

  const depositAmount = 100;
  const withdrawAmount = 100;

  it("Deposit in Lido Vault", async () => {
    const vaultId = new PublicKey(
      // "6tkFEgE6zry2gGC4yqLrTghdqtqadyT5H3H2AJd4w5rz" // RAY-USDC
      "GSAqLGG3AHABTnNSzsorjbqTSbhTmtkFN2dBPxua3RGR" // RAY-SRM
    );

    const depositParams: DepositParams = {
      protocol: SupportedProtocols.Lido,
      vaultId: vaultId,
      depositAmount: depositAmount,
    };

    const gateway = new GatewayBuilder(provider);
    await gateway.deposit(depositParams);

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

  it("Withdraw from Lido Vault", async () => {
    const vaultId = new PublicKey(
      // "6tkFEgE6zry2gGC4yqLrTghdqtqadyT5H3H2AJd4w5rz" // RAY-USDC
      "GSAqLGG3AHABTnNSzsorjbqTSbhTmtkFN2dBPxua3RGR" // RAY-SRM
    );

    const withdrawParams: WithdrawParams = {
      protocol: SupportedProtocols.Lido,
      vaultId: vaultId,
      withdrawAmount: withdrawAmount,
    };

    const gateway = new GatewayBuilder(provider);
    await gateway.withdraw(withdrawParams);

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
});
