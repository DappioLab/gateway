import * as anchor from "@project-serum/anchor";
import { PublicKey, Connection } from "@solana/web3.js";
import NodeWallet from "@project-serum/anchor/dist/cjs/nodewallet";
import {
  GatewayBuilder,
  SupportedProtocols,
  SupplyParams,
  UnsupplyParams,
  DepositParams,
  WithdrawParams,
} from "../src";

describe("Gateway", () => {
  // const connection = new Connection("https://rpc-mainnet-fork-1.dappio.xyz", {
  //   commitment: "confirmed",
  //   wsEndpoint: "wss://rpc-mainnet-fork-1.dappio.xyz/ws",
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

  const supplyAmount = 100;
  const reserveAmount = 100;
  const depositAmount = 100;
  const withdrawAmount = 100;

  it("Supply in Tulip", async () => {
    // // Main Pool
    // const lendingMarket = new PublicKey(
    //   "D1cqtVThyebK9KXKGXrCEuiqaNf5L4UfM1vHgCqiJxym"
    // );
    // // WSOL
    // const supplyTokenMint = new PublicKey(
    //   "So11111111111111111111111111111111111111112"
    // );

    // const marketMap = new Map<string, number>();
    // const allReserveInfo = (await tulip.infos.getAllReserves(
    //   connection
    // )) as tulip.ReserveInfo[];

    // let reserveId: PublicKey;
    // for (let reserve of allReserveInfo) {
    //   const existMarket = marketMap.get(reserve.lendingMarket.toString());
    //   if (existMarket != undefined) {
    //     marketMap.set(reserve.lendingMarket.toString(), existMarket + 1);
    //   } else {
    //     marketMap.set(reserve.lendingMarket.toString(), 1);
    //   }

    //   if (
    //     reserve.lendingMarket.equals(lendingMarket) &&
    //     reserve.liquidity.mintPubkey.equals(supplyTokenMint)
    //   ) {
    //     reserveId = reserve.reserveId;
    //     break;
    //     // console.log("reserve id:", reserveId.toString());
    //   }
    // }
    // // FzbfXR7sopQL29Ubu312tkqWMxSre4dYSrFyYAjUYiC4
    // console.log("reserve id:", reserveId.toString());
    const reserveId = new PublicKey(
      "FzbfXR7sopQL29Ubu312tkqWMxSre4dYSrFyYAjUYiC4"
    );

    const gateway = new GatewayBuilder(provider);
    const supplyParams: SupplyParams = {
      protocol: SupportedProtocols.Tulip,
      reserveId,
      supplyAmount: supplyAmount,
    };

    await gateway.supply(supplyParams);

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

  it("Unsupply in Tulip", async () => {
    // const lendingMarket = new PublicKey(
    //   "D1cqtVThyebK9KXKGXrCEuiqaNf5L4UfM1vHgCqiJxym"
    // );
    // // WSOL
    // const withdrawTokenMint = new PublicKey(
    //   "So11111111111111111111111111111111111111112"
    // );

    // const allReserveInfo = (await tulip.infos.getAllReserves(
    //   connection
    // )) as tulip.ReserveInfo[];
    // let reserveId: PublicKey;
    // for (let reserve of allReserveInfo) {
    //   if (
    //     reserve.lendingMarket.equals(lendingMarket) &&
    //     reserve.liquidity.mintPubkey.equals(withdrawTokenMint)
    //   ) {
    //     reserveId = reserve.reserveId;
    //     break;
    //   }
    // }
    const reserveId = new PublicKey(
      "FzbfXR7sopQL29Ubu312tkqWMxSre4dYSrFyYAjUYiC4"
    );

    const gateway = new GatewayBuilder(provider);
    const unsupplyParams: UnsupplyParams = {
      protocol: SupportedProtocols.Tulip,
      reserveId,
      reservedAmount: reserveAmount,
    };

    await gateway.unsupply(unsupplyParams);

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

  it("Deposit in Tulip Vault", async () => {
    const vaultId = new PublicKey(
      // "6tkFEgE6zry2gGC4yqLrTghdqtqadyT5H3H2AJd4w5rz" // RAY-USDC
      "GSAqLGG3AHABTnNSzsorjbqTSbhTmtkFN2dBPxua3RGR" // RAY-SRM
    );

    const depositParams: DepositParams = {
      protocol: SupportedProtocols.Tulip,
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

  it("Withdraw in Tulip Vault, need to wait 900 slot (~15 mins) after deposit", async () => {
    const vaultId = new PublicKey(
      // "6tkFEgE6zry2gGC4yqLrTghdqtqadyT5H3H2AJd4w5rz" // RAY-USDC
      "GSAqLGG3AHABTnNSzsorjbqTSbhTmtkFN2dBPxua3RGR" // RAY-SRM
    );

    const withdrawParams: WithdrawParams = {
      protocol: SupportedProtocols.Tulip,
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
