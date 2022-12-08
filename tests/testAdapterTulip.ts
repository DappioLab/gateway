import * as anchor from "@project-serum/anchor";
import {
  PublicKey,
  Connection,
  sendAndConfirmRawTransaction,
  BlockheightBasedTransactionConfirmationStrategy,
} from "@solana/web3.js";
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
    const reserveId = new PublicKey("FzbfXR7sopQL29Ubu312tkqWMxSre4dYSrFyYAjUYiC4");

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
    const reserveId = new PublicKey("FzbfXR7sopQL29Ubu312tkqWMxSre4dYSrFyYAjUYiC4");

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
      // "6tkFEgE6zry2gGC4yqLrTghdqtqadyT5H3H2AJd4w5rz" // RAY-USDC (Raydium)
      // "GSAqLGG3AHABTnNSzsorjbqTSbhTmtkFN2dBPxua3RGR" // RAY-SRM (Raydium)
      "7nbcWTUnvELLmLjJtMRrbg9qH9zabZ9VowJSfwB2j8y7" // ORCA-USDC (Orca)
      // "CjwvvwuacJAJm8w54VcNDgpbnyde6k65mvdRpEFK2Dqm" // ATLAS-USDC (Orca)
    );

    const depositParams: DepositParams = {
      protocol: SupportedProtocols.Tulip,
      vaultId: vaultId,
      depositAmount: 10,
      tokenBAmount: depositAmount,
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
        skipPreflight: true,
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
      // "GSAqLGG3AHABTnNSzsorjbqTSbhTmtkFN2dBPxua3RGR" // RAY-SRM
      "7nbcWTUnvELLmLjJtMRrbg9qH9zabZ9VowJSfwB2j8y7" // ORCA-USDC (Orca)
    );

    const withdrawParams: WithdrawParams = {
      protocol: SupportedProtocols.Tulip,
      vaultId: vaultId,
      withdrawAmount: 2,
    };

    const gateway = new GatewayBuilder(provider);
    await gateway.withdraw(withdrawParams);

    await gateway.finalize();

    console.log(gateway.params);

    const txs = gateway.transactions();

    // get account lookup table
    const lookupTableAddress1 = new PublicKey("AyoMG9RELWHbtqcrLNiXwbeRptwD5vCtUk89VgBHE4wj");
    const lookupTableAddress2 = new PublicKey("CLQRVRUiRWSXLg1EFNZPc3NiwrXhptQMUaHTsbZYjWAd");

    // get the table from the cluster
    const lookupTableAccount1 = await connection.getAddressLookupTable(lookupTableAddress1).then((res) => res.value);
    const lookupTableAccount2 = await connection.getAddressLookupTable(lookupTableAddress2).then((res) => res.value);

    console.log("======");
    console.log("Txs are sent...");
    const latestBlockhash = await connection.getLatestBlockhash();
    for (let tx of txs) {
      // tx.recentBlockhash = recentBlockhash;
      // tx.feePayer = wallet.publicKey;
      // tx.sign(wallet.payer);
      // console.log(tx.serialize().length);
      const message = anchor.web3.MessageV0.compile({
        payerKey: wallet.publicKey,
        instructions: tx.instructions,
        recentBlockhash: latestBlockhash.blockhash,
        addressLookupTableAccounts: [lookupTableAccount1!, lookupTableAccount2!],
      });
      const versionedTx = new anchor.web3.VersionedTransaction(message);
      versionedTx.sign([wallet.payer]);
      console.log(versionedTx.serialize().length);
      // const confirmStrategy: BlockheightBasedTransactionConfirmationStrategy = {
      //   blockhash: latestBlockhash.blockhash,
      //   lastValidBlockHeight: latestBlockhash.lastValidBlockHeight,
      //   signature: versionedTx.signatures[0],
      // };
      const sig = await sendAndConfirmRawTransaction(
        connection,
        Buffer.from(versionedTx.serialize()),
        //confirmStrategy,
        {
          skipPreflight: true,
          commitment: "confirmed",
        } as unknown as anchor.web3.ConfirmOptions
      );
      // tx.feePayer = wallet.publicKey;
      // tx.recentBlockhash = (await connection.getLatestBlockhash()).blockhash;
      // console.log("\n", tx.serializeMessage().toString("base64"), "\n");
      // const sig = await provider.sendAndConfirm(tx, [], {
      //   skipPreflight: true,
      //   commitment: "confirmed",
      // } as unknown as anchor.web3.ConfirmOptions);
      console.log(sig);
    }
    console.log("Txs are executed");
    console.log("======");
  });
});
