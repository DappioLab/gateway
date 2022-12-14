import * as anchor from "@project-serum/anchor";
import { PublicKey, Connection } from "@solana/web3.js";
import NodeWallet from "@project-serum/anchor/dist/cjs/nodewallet";
import { GatewayBuilder, SupportedProtocols, SupplyParams, UnsupplyParams, BorrowParams, RepayParams } from "../src";
import { solend } from "@dappio-wonderland/navigator";

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

  const supplyAmount = 100;
  const reserveAmount = 100;

  const borrowAmount = 100;
  const repayAmount = 100;

  it("Supply in Solend", async () => {
    // Main Pool
    const lendingMarket = new PublicKey("4UpD2fh7xH3VP9QQaXtsS1YY3bxzWhtfpks7FatyKvdY");
    // WSOL
    const supplyTokenMint = new PublicKey("So11111111111111111111111111111111111111112");

    const marketMap = new Map<string, number>();
    const allReserveInfo = (await solend.infos.getAllReserveWrappers(connection)) as solend.ReserveInfoWrapper[];

    let reserveId = PublicKey.default;
    for (let reserve of allReserveInfo) {
      const existMarket = marketMap.get(reserve.reserveInfo.lendingMarket.toString());
      if (existMarket != undefined) {
        marketMap.set(reserve.reserveInfo.lendingMarket.toString(), existMarket + 1);
      } else {
        marketMap.set(reserve.reserveInfo.lendingMarket.toString(), 1);
      }

      if (
        reserve.reserveInfo.lendingMarket.equals(lendingMarket) &&
        reserve.reserveInfo.liquidity.mintPubkey.equals(supplyTokenMint)
      ) {
        reserveId = reserve.reserveInfo.reserveId;
        break;
      }
    }

    const gateway = new GatewayBuilder(provider);
    const supplyParams: SupplyParams = {
      protocol: SupportedProtocols.Solend,
      reserveId,
      supplyAmount: supplyAmount,
    };

    await gateway.supply(supplyParams);

    await gateway.finalize();

    console.log(gateway.params);

    const txs = gateway.transactions();

    console.log("======");
    console.log("Txs are sent...");
    // for (let tx of txs) {
    //   // tx.feePayer = wallet.publicKey;
    //   // tx.recentBlockhash = (await connection.getLatestBlockhash()).blockhash;
    //   // console.log("\n", tx.serializeMessage().toString("base64"), "\n");
    //   const sig = await provider.sendAndConfirm(tx, [], {
    //     skipPreflight: false,
    //     commitment: "confirmed",
    //   } as unknown as anchor.web3.ConfirmOptions);
    //   console.log(sig);
    // }
    console.log("Txs are executed");
    console.log("======");
  });

  it("Unupply in Solend", async () => {
    // Main pool
    const lendingMarket = new PublicKey("4UpD2fh7xH3VP9QQaXtsS1YY3bxzWhtfpks7FatyKvdY");
    // WSOL
    const withdrawTokenMint = new PublicKey("So11111111111111111111111111111111111111112");

    const allReserveInfo = (await solend.infos.getAllReserveWrappers(connection)) as solend.ReserveInfoWrapper[];
    let reserveId = PublicKey.default;
    for (let reserve of allReserveInfo) {
      if (
        reserve.reserveInfo.lendingMarket.equals(lendingMarket) &&
        reserve.reserveInfo.liquidity.mintPubkey.equals(withdrawTokenMint)
      ) {
        reserveId = reserve.reserveInfo.reserveId;
        break;
      }
    }

    const gateway = new GatewayBuilder(provider);
    const unsupplyParams: UnsupplyParams = {
      protocol: SupportedProtocols.Solend,
      reserveId,
      reservedAmount: reserveAmount,
    };

    await gateway.unsupply(unsupplyParams);

    await gateway.finalize();

    console.log(gateway.params);

    const txs = gateway.transactions();

    console.log("======");
    console.log("Txs are sent...");
    // for (let tx of txs) {
    //   // tx.feePayer = wallet.publicKey;
    //   // tx.recentBlockhash = (await connection.getLatestBlockhash()).blockhash;
    //   // console.log("\n", tx.serializeMessage().toString("base64"), "\n");
    //   const sig = await provider.sendAndConfirm(tx, [], {
    //     skipPreflight: false,
    //     commitment: "confirmed",
    //   } as unknown as anchor.web3.ConfirmOptions);
    //   console.log(sig);
    // }
    console.log("Txs are executed");
    console.log("======");
  });

  it("Borrow in Solend", async () => {
    // Main pool
    const lendingMarket = new PublicKey("4UpD2fh7xH3VP9QQaXtsS1YY3bxzWhtfpks7FatyKvdY");
    // WSOL
    const withdrawTokenMint = new PublicKey("So11111111111111111111111111111111111111112");

    const allReserveInfo = (await solend.infos.getAllReserveWrappers(connection)) as solend.ReserveInfoWrapper[];

    let reserveId = PublicKey.default;
    for (let reserve of allReserveInfo) {
      if (
        reserve.reserveInfo.lendingMarket.equals(lendingMarket) &&
        reserve.reserveInfo.liquidity.mintPubkey.equals(withdrawTokenMint)
      ) {
        reserveId = reserve.reserveInfo.reserveId;
        break;
      }
    }

    const gateway = new GatewayBuilder(provider);
    const borrowParams: BorrowParams = {
      protocol: SupportedProtocols.Solend,
      reserveId,
      borrowAmount: borrowAmount,
    };

    await gateway.borrow(borrowParams);

    await gateway.finalize();

    console.log(gateway.params);

    const txs = gateway.transactions();

    console.log("======");
    console.log("Txs are sent...");
    for (let tx of txs) {
      // tx.feePayer = wallet.publicKey;
      // tx.recentBlockhash = (await connection.getLatestBlockhash()).blockhash;
      // console.log("\n", tx.serializeMessage().toString("base64"), "\n");
      const sig = await provider.sendAndConfirm(tx as anchor.web3.Transaction, [], {
        skipPreflight: false,
        commitment: "confirmed",
      } as unknown as anchor.web3.ConfirmOptions);
      console.log(sig);
    }
    console.log("Txs are executed");
    console.log("======");
  });

  it("Repay in Solend", async () => {
    // Main pool
    const lendingMarket = new PublicKey("4UpD2fh7xH3VP9QQaXtsS1YY3bxzWhtfpks7FatyKvdY");
    // WSOL
    const withdrawTokenMint = new PublicKey("So11111111111111111111111111111111111111112");

    const allReserveInfo = (await solend.infos.getAllReserveWrappers(connection)) as solend.ReserveInfoWrapper[];
    let reserveId = PublicKey.default;
    for (let reserve of allReserveInfo) {
      if (
        reserve.reserveInfo.lendingMarket.equals(lendingMarket) &&
        reserve.reserveInfo.liquidity.mintPubkey.equals(withdrawTokenMint)
      ) {
        reserveId = reserve.reserveInfo.reserveId;
        break;
      }
    }

    const gateway = new GatewayBuilder(provider);
    const repayParams: RepayParams = {
      protocol: SupportedProtocols.Solend,
      reserveId,
      repayAmount: repayAmount,
    };

    await gateway.repay(repayParams);

    await gateway.finalize();

    console.log(gateway.params);

    const txs = gateway.transactions();

    console.log("======");
    console.log("Txs are sent...");
    for (let tx of txs) {
      // tx.feePayer = wallet.publicKey;
      // tx.recentBlockhash = (await connection.getLatestBlockhash()).blockhash;
      // console.log("\n", tx.serializeMessage().toString("base64"), "\n");
      const sig = await provider.sendAndConfirm(tx as anchor.web3.Transaction, [], {
        skipPreflight: false,
        commitment: "confirmed",
      } as unknown as anchor.web3.ConfirmOptions);
      console.log(sig);
    }
    console.log("Txs are executed");
    console.log("======");
  });
});
