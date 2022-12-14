import * as anchor from "@project-serum/anchor";
import { PublicKey, Connection } from "@solana/web3.js";
import NodeWallet from "@project-serum/anchor/dist/cjs/nodewallet";
import { getAccount, NATIVE_MINT } from "@solana/spl-token-v2";
import {
  GatewayBuilder,
  SupportedProtocols,
  SupplyParams,
  UnsupplyParams,
  BorrowParams,
  RepayParams,
  StakeParams,
  UnstakeParams,
  CollateralizeParams,
  UncollateralizeParams,
  HarvestParams,
  ClaimCollateralRewardParams,
} from "../src";
import { larix, utils } from "@dappio-wonderland/navigator";

// TODO: Fix all tests

describe("Gateway", () => {
  // const connection = new Connection("https://rpc-mainnet-fork.dappio.xyz", {
  //   commitment,
  //   wsEndpoint: "wss://rpc-mainnet-fork.dappio.xyz/ws",
  // });
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
  const connection = new Connection("https://rpc-mainnet-fork.epochs.studio/notcache", {
    commitment: "confirmed",
    confirmTransactionInitialTimeout: 180 * 1000,
    wsEndpoint: "wss://rpc-mainnet-fork.epochs.studio/ws",
  });
  const options = anchor.AnchorProvider.defaultOptions();
  const wallet = NodeWallet.local();
  const provider = new anchor.AnchorProvider(connection, wallet, options);

  anchor.setProvider(provider);

  const supplyAmount = 200;

  it("claim", async () => {
    const gateway = new GatewayBuilder(provider);
    let obligationKey = await larix.infos.getObligationId!(larix.LARIX_MARKET_ID_MAIN_POOL, wallet.publicKey);
    const obligationInfo = await larix.infos.getObligation!(connection, obligationKey);
    let claimParam: ClaimCollateralRewardParams = {
      protocol: SupportedProtocols.Larix,
      obligationKey: obligationInfo.obligationId,
    };
    await gateway.claimCollateralReward(claimParam);
    await gateway.finalize();

    // console.log(`swapInAmount: ${gateway.gatewayParams.swapInAmount}`);
    // console.log(`swapMinOutAmount: ${gateway.gatewayParams.swapMinOutAmount}`);

    const txs = gateway.transactions();

    console.log("======");
    console.log("Txs are sent...");
    for (let tx of txs) {
      // const sig = await provider.sendAndConfirm(tx, [], {
      //   skipPreflight: false,
      //   commitment: "confirmed",
      // } as unknown as anchor.web3.ConfirmOptions);
      const sig2 = await utils.signAndSendAll(tx as anchor.web3.Transaction, connection, [wallet.payer], false);
      console.log(sig2, "\n");
    }
    console.log("Txs are executed");
    console.log("======");
  });

  it("harvest", async () => {
    const gateway = new GatewayBuilder(provider);
    const reserveWrappers = (await larix.infos.getAllReserveWrappers(connection)) as larix.ReserveInfoWrapper[];

    for (let wrapper of reserveWrappers) {
      if (wrapper.supplyTokenMint().equals(NATIVE_MINT)) {
        let harvestPrarm: HarvestParams = {
          protocol: SupportedProtocols.Larix,
          farmId: wrapper.reserveInfo.reserveId,
        };
        // let repayPram: RepayParams = {
        //   protocol: SupportedProtocols.Larix,
        //   reserveId: new PublicKey(
        //     "FStv7oj29DghUcCRDRJN9sEkB4uuh4SqWBY9pvSQ4Rch"
        //   ),
        //   repayAmount: 5,
        // };
        await gateway.harvest(harvestPrarm);
      }
    }

    await gateway.finalize();

    // console.log(`swapInAmount: ${gateway.gatewayParams.swapInAmount}`);
    // console.log(`swapMinOutAmount: ${gateway.gatewayParams.swapMinOutAmount}`);

    const txs = gateway.transactions();

    console.log("======");
    console.log("Txs are sent...");
    for (let tx of txs) {
      // const sig = await provider.sendAndConfirm(tx, [], {
      //   skipPreflight: false,
      //   commitment: "confirmed",
      // } as unknown as anchor.web3.ConfirmOptions);
      const sig2 = await utils.signAndSendAll(tx as anchor.web3.Transaction, connection, [wallet.payer], false);
      console.log(sig2, "\n");
    }
    console.log("Txs are executed");
    console.log("======");
  });
  it("supply SPL", async () => {
    const gateway = new GatewayBuilder(provider);
    const reserveWrappers = (await larix.infos.getAllReserveWrappers(connection)) as larix.ReserveInfoWrapper[];
    for (let wrapper of reserveWrappers) {
      if (wrapper.supplyTokenMint().equals(NATIVE_MINT)) {
        let supplyPram: SupplyParams = {
          protocol: SupportedProtocols.Larix,
          reserveId: wrapper.reserveInfo.reserveId,
          supplyAmount: supplyAmount,
        };
        // let borrowPram: BorrowParams = {
        //   protocol: SupportedProtocols.Larix,
        //   reserveId: new PublicKey(
        //     "FStv7oj29DghUcCRDRJN9sEkB4uuh4SqWBY9pvSQ4Rch"
        //   ),
        //   borrowAmount: 5,
        // };
        await gateway.supply(supplyPram);
        //await gateway.borrow(borrowPram);
      }
    }
    await gateway.finalize();

    const txs = gateway.transactions();

    console.log("======");
    console.log("Txs are sent...");
    for (let tx of txs) {
      // const sig = await provider.sendAndConfirm(tx, [], {
      //   skipPreflight: false,
      //   commitment: "confirmed",
      // } as unknown as anchor.web3.ConfirmOptions);
      const sig2 = await utils.signAndSendAll(tx as anchor.web3.Transaction, connection, [wallet.payer], false);
      console.log(sig2, "\n");
    }
    console.log("Txs are executed");
    console.log("======");
  });
  it("supply and stake", async () => {
    const gateway = new GatewayBuilder(provider);
    const reserveWrappers = (await larix.infos.getAllReserveWrappers(connection)) as larix.ReserveInfoWrapper[];
    for (let wrapper of reserveWrappers) {
      if (wrapper.supplyTokenMint().equals(NATIVE_MINT)) {
        let supplyPram: SupplyParams = {
          protocol: SupportedProtocols.Larix,
          reserveId: wrapper.reserveInfo.reserveId,
          supplyAmount: supplyAmount,
        };
        let stakeParam: StakeParams = {
          protocol: SupportedProtocols.Larix,
          farmId: wrapper.reserveInfo.reserveId,
        };
        await gateway.supply(supplyPram);
        await gateway.stake(stakeParam);
        //await gateway.borrow(borrowPram);
      }
    }
    await gateway.finalize();

    const txs = gateway.transactions();

    console.log("======");
    console.log("Txs are sent...");
    for (let tx of txs) {
      // const sig = await provider.sendAndConfirm(tx, [], {
      //   skipPreflight: false,
      //   commitment: "confirmed",
      // } as unknown as anchor.web3.ConfirmOptions);
      const sig2 = await utils.signAndSendAll(tx as anchor.web3.Transaction, connection, [wallet.payer], false);
      console.log(sig2, "\n");
    }
    console.log("Txs are executed");
    console.log("======");
  });

  it("unsupply SPL", async () => {
    const gateway = new GatewayBuilder(provider);
    const reserveWrappers = (await larix.infos.getAllReserveWrappers(connection)) as larix.ReserveInfoWrapper[];
    for (let wrapper of reserveWrappers) {
      if (wrapper.supplyTokenMint().equals(NATIVE_MINT)) {
        let supplyPram: UnsupplyParams = {
          protocol: SupportedProtocols.Larix,
          reserveId: wrapper.reserveInfo.reserveId,
          reservedAmount: supplyAmount,
        };
        // let repayPram: RepayParams = {
        //   protocol: SupportedProtocols.Larix,
        //   reserveId: new PublicKey(
        //     "FStv7oj29DghUcCRDRJN9sEkB4uuh4SqWBY9pvSQ4Rch"
        //   ),
        //   repayAmount: 5,
        // };
        await gateway.unsupply(supplyPram);
      }
    }

    await gateway.finalize();

    // console.log(`swapInAmount: ${gateway.gatewayParams.swapInAmount}`);
    // console.log(`swapMinOutAmount: ${gateway.gatewayParams.swapMinOutAmount}`);

    const txs = gateway.transactions();

    console.log("======");
    console.log("Txs are sent...");
    for (let tx of txs) {
      // const sig = await provider.sendAndConfirm(tx, [], {
      //   skipPreflight: false,
      //   commitment: "confirmed",
      // } as unknown as anchor.web3.ConfirmOptions);
      const sig2 = await utils.signAndSendAll(tx as anchor.web3.Transaction, connection, [wallet.payer], false);
      console.log(sig2, "\n");
    }
    console.log("Txs are executed");
    console.log("======");
  });
  it("unstake and unsupply", async () => {
    const gateway = new GatewayBuilder(provider);
    const reserveWrappers = (await larix.infos.getAllReserveWrappers(connection)) as larix.ReserveInfoWrapper[];

    for (let wrapper of reserveWrappers) {
      if (wrapper.supplyTokenMint().equals(NATIVE_MINT)) {
        let unstakeParams: UnstakeParams = {
          protocol: SupportedProtocols.Larix,
          farmId: wrapper.reserveInfo.reserveId,
          shareAmount: 10,
        };
        let supplyPram: UnsupplyParams = {
          protocol: SupportedProtocols.Larix,
          reserveId: wrapper.reserveInfo.reserveId,
          reservedAmount: supplyAmount,
        };
        await gateway.unstake(unstakeParams);
        await gateway.unsupply(supplyPram);
      }
    }

    await gateway.finalize();

    // console.log(`swapInAmount: ${gateway.gatewayParams.swapInAmount}`);
    // console.log(`swapMinOutAmount: ${gateway.gatewayParams.swapMinOutAmount}`);

    const txs = gateway.transactions();

    console.log("======");
    console.log("Txs are sent...");
    for (let tx of txs) {
      // const sig = await provider.sendAndConfirm(tx, [], {
      //   skipPreflight: false,
      //   commitment: "confirmed",
      // } as unknown as anchor.web3.ConfirmOptions);
      const sig2 = await utils.signAndSendAll(tx as anchor.web3.Transaction, connection, [wallet.payer], false);
      console.log(sig2, "\n");
    }
    console.log("Txs are executed");
    console.log("======");
  });
  it("supply, collateralize", async () => {
    const gateway = new GatewayBuilder(provider);
    const reserveWrappers = (await larix.infos.getAllReserveWrappers(connection)) as larix.ReserveInfoWrapper[];

    for (let wrapper of reserveWrappers) {
      if (wrapper.supplyTokenMint().equals(NATIVE_MINT)) {
        let supplyPram: SupplyParams = {
          protocol: SupportedProtocols.Larix,
          reserveId: wrapper.reserveInfo.reserveId,
          supplyAmount: supplyAmount,
        };
        let collateralizeParams: CollateralizeParams = {
          protocol: SupportedProtocols.Larix,
          reserveId: wrapper.reserveInfo.reserveId,
        };
        await gateway.supply(supplyPram);
        await gateway.collateralize(collateralizeParams);
      }
    }
    await gateway.finalize();

    const txs = gateway.transactions();

    console.log("======");
    console.log("Txs are sent...");
    for (let tx of txs) {
      // const sig = await provider.sendAndConfirm(tx, [], {
      //   skipPreflight: false,
      //   commitment: "confirmed",
      // } as unknown as anchor.web3.ConfirmOptions);
      const sig2 = await utils.signAndSendAll(tx as anchor.web3.Transaction, connection, [wallet.payer], false);
      console.log(sig2, "\n");
    }
    console.log("Txs are executed");
    console.log("======");
  });

  it("borrow", async () => {
    const gateway = new GatewayBuilder(provider);
    const reserveWrappers = (await larix.infos.getAllReserveWrappers(connection)) as larix.ReserveInfoWrapper[];

    for (let wrapper of reserveWrappers) {
      if (wrapper.supplyTokenMint().equals(NATIVE_MINT)) {
        let borrowPram: BorrowParams = {
          protocol: SupportedProtocols.Larix,
          reserveId: new PublicKey("2RcrbkGNcfy9mbarLCCRYdW3hxph7pSbP38x35MR2Bjt"),
          borrowAmount: 5,
        };
        await gateway.borrow(borrowPram);
      }
    }
    await gateway.finalize();

    const txs = gateway.transactions();

    console.log("======");
    console.log("Txs are sent...");
    for (let tx of txs) {
      // const sig = await provider.sendAndConfirm(tx, [], {
      //   skipPreflight: false,
      //   commitment: "confirmed",
      // } as unknown as anchor.web3.ConfirmOptions);
      const sig2 = await utils.signAndSendAll(tx as anchor.web3.Transaction, connection, [wallet.payer], false);
      console.log(sig2, "\n");
    }
    console.log("Txs are executed");
    console.log("======");
  });

  it("repay", async () => {
    const gateway = new GatewayBuilder(provider);
    const reserveWrappers = (await larix.infos.getAllReserveWrappers(connection)) as larix.ReserveInfoWrapper[];

    for (let wrapper of reserveWrappers) {
      if (wrapper.supplyTokenMint().equals(NATIVE_MINT)) {
        let repayPram: RepayParams = {
          protocol: SupportedProtocols.Larix,
          reserveId: new PublicKey("2RcrbkGNcfy9mbarLCCRYdW3hxph7pSbP38x35MR2Bjt"),
          repayAmount: 5,
        };
        await gateway.repay(repayPram);
      }
    }

    await gateway.finalize();

    // console.log(`swapInAmount: ${gateway.gatewayParams.swapInAmount}`);
    // console.log(`swapMinOutAmount: ${gateway.gatewayParams.swapMinOutAmount}`);

    const txs = gateway.transactions();

    console.log("======");
    console.log("Txs are sent...");
    for (let tx of txs) {
      // const sig = await provider.sendAndConfirm(tx, [], {
      //   skipPreflight: false,
      //   commitment: "confirmed",
      // } as unknown as anchor.web3.ConfirmOptions);
      const sig2 = await utils.signAndSendAll(tx as anchor.web3.Transaction, connection, [wallet.payer], false);
      console.log(sig2, "\n");
    }
    console.log("Txs are executed");
    console.log("======");
  });
  it("uncollateralize, unsupply", async () => {
    const gateway = new GatewayBuilder(provider);
    const reserveWrappers = (await larix.infos.getAllReserveWrappers(connection)) as larix.ReserveInfoWrapper[];
    for (let wrapper of reserveWrappers) {
      if (wrapper.supplyTokenMint().equals(NATIVE_MINT)) {
        let supplyPram: UnsupplyParams = {
          protocol: SupportedProtocols.Larix,
          reserveId: wrapper.reserveInfo.reserveId,
          reservedAmount: supplyAmount,
        };
        let uncollateralizePram: UncollateralizeParams = {
          protocol: SupportedProtocols.Larix,
          reserveId: wrapper.reserveInfo.reserveId,
          uncollateralizeAmount: 10,
        };
        // let repayPram: RepayParams = {
        //   protocol: SupportedProtocols.Larix,
        //   reserveId: new PublicKey(
        //     "FStv7oj29DghUcCRDRJN9sEkB4uuh4SqWBY9pvSQ4Rch"
        //   ),
        //   repayAmount: 5,
        // };
        await gateway.uncollateralize(uncollateralizePram);
        await gateway.unsupply(supplyPram);
      }
    }

    await gateway.finalize();

    // console.log(`swapInAmount: ${gateway.gatewayParams.swapInAmount}`);
    // console.log(`swapMinOutAmount: ${gateway.gatewayParams.swapMinOutAmount}`);

    const txs = gateway.transactions();

    console.log("======");
    console.log("Txs are sent...");
    for (let tx of txs) {
      // const sig = await provider.sendAndConfirm(tx, [], {
      //   skipPreflight: false,
      //   commitment: "confirmed",
      // } as unknown as anchor.web3.ConfirmOptions);
      const sig2 = await utils.signAndSendAll(tx as anchor.web3.Transaction, connection, [wallet.payer], false);
      console.log(sig2, "\n");
    }
    console.log("Txs are executed");
    console.log("======");
  });
});
