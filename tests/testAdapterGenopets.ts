import * as anchor from "@project-serum/anchor";
import { PublicKey, Connection } from "@solana/web3.js";
import NodeWallet from "@project-serum/anchor/dist/cjs/nodewallet";
import { getAccount, getAssociatedTokenAddress } from "@solana/spl-token-v2";
import {
  AddLiquidityParams,
  StakeParams,
  GatewayBuilder,
  SupportedProtocols,
  SwapParams,
  UnstakeParams,
  RemoveLiquidityParams,
  HarvestParams,
  WSOL,
  HarvestType,
} from "../src";
import { genopets } from "@dappio-wonderland/navigator";

describe("Gateway", () => {
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

  const zapInAmount = 10000;

  // it("Swap + AddLiquidity + Stake in Genopets", async () => {
  //   // const poolId = new anchor.web3.PublicKey(
  //   //   "DPgYdwgz7ZytfrzLeRYJwXq9JGeskaXTRrM8biFEnLs1" // PRGC-USDC
  //   // );
  //   const farmId = new anchor.web3.PublicKey(
  //     "tEAbLeDznDdQ5jvdk1cdm2qUzoYmyc6nX5FChAyAB2U" // GENE
  //   );
  //   const swapParams: SwapParams = {
  //     protocol: SupportedProtocols.Jupiter,
  //     fromTokenMint: new PublicKey(
  //       // "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v" // USDC
  //       "So11111111111111111111111111111111111111112" // WSOL
  //     ),
  //     toTokenMint: new PublicKey(
  //       "GENEtH5amGSi8kHAtQoezp1XEXwZJ8vcuePYnXdKrMYz" // GENE
  //     ),
  //     amount: zapInAmount / 2, // Swap half of the fromToken to proceed zapIn
  //     slippage: 1,
  //   };
  //   // const addLiquidityParams: AddLiquidityParams = {
  //   //   protocol: SupportedProtocols.Genopets,
  //   //   poolId,
  //   // };
  //   const farm = (await genopets.infos.getFarm(
  //     connection,
  //     farmId
  //   )) as genopets.FarmInfo;
  //   const stakeParams: StakeParams = {
  //     protocol: SupportedProtocols.Genopets,
  //     farmId,
  //     version: 1,
  //     lpAmount: 1000,
  //     lockDuration: 0,
  //   };

  //   const gateway = new GatewayBuilder(provider);

  //   // await gateway.swap(swapParams);
  //   console.log(gateway.params.swapMinOutAmount.toNumber());
  //   // Work-around
  //   // addLiquidityParams.tokenInAmount =
  //   //   gateway.params.swapMinOutAmount.toNumber();
  //   // await gateway.addLiquidity(addLiquidityParams);
  //   await gateway.stake(stakeParams);

  //   await gateway.finalize();

  //   console.log(gateway.params);
  //   // console.log(`swapInAmount: ${gateway.params.swapInAmount}`);
  //   // console.log(`swapMinOutAmount: ${gateway.params.swapMinOutAmount}`);

  //   const txs = gateway.transactions();

  //   console.log("======");
  //   console.log("Txs are sent...");
  //   for (let tx of txs) {
  //     const sig = await provider.sendAndConfirm(tx, [], {
  //       skipPreflight: true,
  //       commitment: "confirmed",
  //     } as unknown as anchor.web3.ConfirmOptions);
  //     console.log(sig);
  //   }
  //   console.log("Txs are executed");
  //   console.log("======");
  // });

  it("Unstake + Harvest + RemoveLiquidity + Swap in Genopets", async () => {
    // const poolId = new anchor.web3.PublicKey(
    //   "GaqgfieVmnmY4ZsZHHA6L5RSVzCGL3sKx4UgHBaYNy8m" // RAY-SRM
    // );
    const farmId = new anchor.web3.PublicKey(
      "tEAbLeDznDdQ5jvdk1cdm2qUzoYmyc6nX5FChAyAB2U"
    );

    // const pool = await genopets.infos.getPool(connection, poolId);
    // const poolWrapper = new genopets.PoolInfoWrapper(pool as genopets.PoolInfo);
    const farm = (await genopets.infos.getFarm(
      connection,
      farmId
    )) as genopets.FarmInfo;

    // Get share amount
    const ledgerKey = await genopets.infos.getFarmerId(
      farm,
      provider.wallet.publicKey
    );
    const farmer = (await genopets.infos.getFarmer(
      connection,
      ledgerKey
    )) as genopets.FarmerInfo;
    const shareAmount = Number(farmer.totalRewards);
    console.log(shareAmount);

    // const { tokenAAmount, tokenBAmount } = await poolWrapper.getTokenAmounts(
    //   shareAmount
    // );
    const harvestParams1: HarvestParams = {
      protocol: SupportedProtocols.Genopets,
      farmId,
      type: HarvestType.ClaimRewards,
    };

    let depositId: anchor.web3.PublicKey;
    for (let deposit of farmer.userDeposit) {
      if (deposit?.isYield == true) {
        depositId = deposit.depositId;
        break;
      }
    }
    const harvestParams2: HarvestParams = {
      protocol: SupportedProtocols.Genopets,
      farmId,
      type: HarvestType.WithdrawAsSgene,
      farmerKey: depositId!,
    };

    for (let deposit of farmer.userDeposit) {
      if (deposit?.isYield == false) {
        depositId = deposit.depositId;
      }
    }
    const harvestParams3: HarvestParams = {
      protocol: SupportedProtocols.Genopets,
      farmId,
      type: HarvestType.Withdraw,
      farmerKey: new PublicKey("Epr3R75CTWeRWdB9sqBjj192dgJyAt4tvyZzPJtbbQNT"),
    };
    // const unstakeParams: UnstakeParams = {
    //   protocol: SupportedProtocols.Genopets,
    //   farmId,
    //   shareAmount,
    //   version: 1,
    // };
    // const removeLiquidityParams: RemoveLiquidityParams = {
    //   protocol: SupportedProtocols.Raydium,
    //   poolId,
    // };
    // const swapParams: SwapParams = {
    //   protocol: SupportedProtocols.Jupiter,
    //   fromTokenMint: new PublicKey(
    //     "GENEtH5amGSi8kHAtQoezp1XEXwZJ8vcuePYnXdKrMYz" // GENE
    //   ),
    //   toTokenMint: new PublicKey(
    //     "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v" // USDC
    //   ),
    //   amount: 100, // swap coin to pc
    //   slippage: 3,
    // };

    const gateway = new GatewayBuilder(provider);

    // await gateway.harvest(harvestParams1);
    // await gateway.harvest(harvestParams2);
    await gateway.harvest(harvestParams3);
    // await gateway.unstake(unstakeParams);
    // await gateway.removeLiquidity(removeLiquidityParams);
    // await gateway.swap(swapParams);

    await gateway.finalize();

    console.log(gateway.params);
    // console.log(`swapInAmount: ${gateway.gatewayParams.swapInAmount}`);
    // console.log(`swapMinOutAmount: ${gateway.gatewayParams.swapMinOutAmount}`);

    const txs = gateway.transactions();

    console.log("======");
    console.log("Txs are sent...");
    for (let tx of txs) {
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
